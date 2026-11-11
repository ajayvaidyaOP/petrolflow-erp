import { test as base, expect, type Page, type Route } from '@playwright/test';

/**
 * The public price list (/pricing) and the link to it on the sign-in screen.
 *
 * The page shows whatever the platform administrator keeps active under Admin → Subscriptions, to
 * visitors who have not signed in. These tests hold it to that: the same figures the administrator
 * sees, nothing an anonymous caller should not get, and a sign-in screen that works with or without it.
 */

type Monitor = {
  allow: (method: string, path: string, status: number) => void;
  watch: (page: Page) => void;
};

// Same guard as workflows.spec.ts: a test fails on an uncaught browser error or an API failure it
// did not announce, not only on what is visible. `watch` extends the guard to a second browser.
const test = base.extend<{ monitor: Monitor }>({
  monitor: [async ({ page }, use) => {
    const errors: string[] = [];
    const allowed = new Set<string>();
    const watch = (target: Page) => {
      let authenticated = false;
      target.on('pageerror', (error) => errors.push(`Browser: ${error.message}`));
      target.on('response', (response) => {
        const url = new URL(response.url());
        const method = response.request().method();
        if (method === 'POST' && url.pathname === '/api/v1/auth/login' && response.ok()) authenticated = true;
        // Every screen asks whether a session exists; for a visitor the answer is 401.
        if (!authenticated && method === 'GET' && url.pathname === '/api/v1/auth/me' && response.status() === 401) return;
        if (!url.pathname.startsWith('/api/') || response.status() < 400) return;
        const key = `${method} ${url.pathname} ${response.status()}`;
        if (!allowed.has(key)) errors.push(`API: ${key}`);
      });
    };
    watch(page);
    await use({ allow: (method, path, status) => allowed.add(`${method} ${path} ${status}`), watch });
    expect(errors, errors.join('\n')).toEqual([]);
  }, { auto: true }],
});

const password = 'PetroFlow@2025';
const owner = 'owner@sunrisefuels.in';
const superAdmin = 'superadmin@petroflow.dev';
const plansApi = '**/api/v1/public/plans';

interface AdminPlan {
  code: string;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  maxStations: number;
  maxUsers: number;
  maxDispensers: number;
  trialDays: number;
  features: string[];
  isActive: number;
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
}

/** ₹2,999 for whole rupees, ₹2,999.50 otherwise, with Indian digit grouping. */
function rupees(value: string | number) {
  const amount = Number(value);
  const digits = Number.isInteger(amount) ? 0 : 2;
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function upTo(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `Up to ${count.toLocaleString('en-IN')} ${many}`;
}

const planCard = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const pricingLink = (page: Page) => page.getByRole('link', { name: /Plans & pricing/ });

const fulfilPlans = (data: unknown) => (route: Route) => route.fulfill({ json: { data } });
const failPlans = (route: Route) =>
  route.fulfill({ status: 500, json: { error: { code: 'DB_UNAVAILABLE', message: 'MySQL is not reachable at 127.0.0.1:3306' } } });

test('the price list opens without signing in and shows what the administrator set for each active plan', async ({ page, playwright, baseURL }) => {
  // The administrator's own plan list, read through a separate signed-in session, is the reference.
  const admin = await playwright.request.newContext({ baseURL });
  expect((await admin.post('/api/v1/auth/login', { data: { email: superAdmin, password } })).ok()).toBe(true);
  const stored: AdminPlan[] = (await (await admin.get('/api/v1/admin/plans')).json()).data;
  await admin.dispose();
  const active = stored
    .filter((plan) => plan.isActive)
    .sort((a, b) => Number(a.monthlyPrice) - Number(b.monthlyPrice) || a.name.localeCompare(b.name));
  expect(active.length).toBeGreaterThanOrEqual(3);

  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1, name: 'Plans & pricing' })).toBeVisible();
  // One card per active plan, cheapest first.
  await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toHaveText(active.map((plan) => plan.name));

  for (const plan of active) {
    const card = planCard(page, plan.name);
    await expect(card).toContainText(`${rupees(plan.monthlyPrice)} a month`);
    if (Number(plan.annualPrice) > 0) await expect(card).toContainText(`${rupees(plan.annualPrice)} a year`);
    const saving = Number(plan.monthlyPrice) * 12 - Number(plan.annualPrice);
    if (Number(plan.annualPrice) > 0 && saving > 0) await expect(card).toContainText(`save ${rupees(saving)}`);
    await expect(card.getByText(upTo(plan.maxStations, 'station', 'stations'), { exact: true }).first()).toBeVisible();
    await expect(card.getByText(upTo(plan.maxUsers, 'team login', 'team logins'), { exact: true })).toBeVisible();
    await expect(card.getByText(upTo(plan.maxDispensers, 'dispenser', 'dispensers'), { exact: true })).toBeVisible();
    await expect(card.getByText(`${plan.trialDays}-day trial`, { exact: true })).toBeVisible();
    for (const feature of plan.features) await expect(card.getByText(feature, { exact: true }).first()).toBeVisible();
  }

  // The same figures spelled out for the demo plans, so the comparison above cannot agree by sharing a mistake.
  await expect(planCard(page, 'Starter')).toContainText('₹2,999 a month');
  await expect(planCard(page, 'Starter')).toContainText('or ₹32,389 a year · save ₹3,599');
  await expect(planCard(page, 'Growth')).toContainText('₹7,499 a month');
  await expect(planCard(page, 'Enterprise')).toContainText('₹18,999 a month');
  await expect(planCard(page, 'Enterprise')).toContainText('or ₹2,05,189 a year · save ₹22,799');

  // A visitor is offered the way in, never a control that needs a session.
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  await expect(page.getByText('Your plan', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to workspace' })).toHaveCount(0);
});

test('the plan list API answers without a session and gives out public fields only', async ({ request }) => {
  const response = await request.get('/api/v1/public/plans');
  expect(response.status()).toBe(200);
  const plans: Record<string, unknown>[] = (await response.json()).data;
  expect(plans.length).toBeGreaterThanOrEqual(3);
  for (const plan of plans) {
    expect(Object.keys(plan).sort()).toEqual([
      'annualPrice', 'code', 'description', 'features', 'maxDispensers', 'maxStations', 'maxUsers', 'monthlyPrice', 'name', 'trialDays',
    ]);
  }
  // No record ids, subscriber counts or timestamps, under any name.
  expect(JSON.stringify(plans)).not.toMatch(/pln_|subscriber|createdAt|updatedAt|isActive/i);

  // Reading is all the public route offers, and the administrator's list still needs a session.
  expect((await request.post('/api/v1/public/plans', { data: { name: 'Free for everyone', monthlyPrice: '0' } })).status()).toBe(404);
  expect((await request.get('/api/v1/admin/plans')).status()).toBe(401);
});

test('the sign-in screen leads to the price list and back, and the theme switch works there', async ({ page }) => {
  await page.goto('/login');
  await expect(pricingLink(page)).toContainText('From ₹2,999 a month');
  await pricingLink(page).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(planCard(page, 'Starter')).toBeVisible();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('signing in does not depend on the price list', async ({ page, monitor }) => {
  monitor.allow('GET', '/api/v1/public/plans', 500);
  await page.route(plansApi, failPlans);
  const failed = page.waitForResponse((response) => response.url().endsWith('/api/v1/public/plans') && response.status() === 500);
  await page.goto('/login');
  await failed;
  await expect(page.getByRole('button', { name: /owner@sunrisefuels\.in/ })).toBeVisible();
  // No price list: the link is left out, and nothing on the screen complains about it.
  await expect(pricingLink(page)).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);

  await page.getByLabel('Email').fill(owner);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
});

test('the price list says when it cannot load, and loads on a retry', async ({ page, monitor }) => {
  monitor.allow('GET', '/api/v1/public/plans', 500);
  let failing = true;
  await page.route(plansApi, (route) => (failing ? failPlans(route) : route.continue()));
  await page.goto('/pricing');
  const problem = page.getByRole('alert');
  await expect(problem).toContainText('The plans could not be loaded right now.');
  // Visitors are told that it failed, not what the server said about its database.
  await expect(problem).not.toContainText(/MySQL|127\.0\.0\.1/);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('Plans are not published yet')).toHaveCount(0);

  failing = false;
  await problem.getByRole('button', { name: 'Try again' }).click();
  await expect(planCard(page, 'Starter')).toBeVisible();
  await expect(problem).toHaveCount(0);
});

test('with no plan published, the price list says so and the sign-in screen shows no link', async ({ page }) => {
  await page.route(plansApi, fulfilPlans([]));
  await page.goto('/pricing');
  await expect(page.getByText('Plans are not published yet')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  // Setting plans up is the administrator's job; a visitor is not sent to a screen they cannot open.
  await expect(page.getByRole('link', { name: 'Set up plans' })).toHaveCount(0);

  await page.goto('/login');
  await expect(page.getByRole('button', { name: /owner@sunrisefuels\.in/ })).toBeVisible();
  await expect(pricingLink(page)).toHaveCount(0);
});

test('unusual plan data is shown as stored, or left out, without breaking the page', async ({ page }) => {
  const solo = { code: 'SOLO', name: 'Solo', description: null, monthlyPrice: '1499.50', annualPrice: '0.00', maxStations: 1, maxUsers: 1, maxDispensers: 1, trialDays: 0, features: [] };
  const network = {
    code: 'NETWORK', name: 'Regional distributor network with a deliberately long plan name', description: 'Long text. '.repeat(20),
    monthlyPrice: '1234567.00', annualPrice: '12345670.00', maxStations: 1250, maxUsers: 5000, maxDispensers: 10000, trialDays: 90,
    features: ['Averyveryverylongunbrokenfeaturewordthatcannotwrapnormallyatall', 42, null, '   '],
  };
  const dearYear = { code: 'DEAR', name: 'Dear year', description: '', monthlyPrice: '100', annualPrice: '1500', maxStations: 2, maxUsers: 2, maxDispensers: 2, trialDays: 7, features: ['Only feature'] };
  const unpriced = { code: 'UNPRICED', name: 'Unpriced', monthlyPrice: 'soon', annualPrice: '-5', maxStations: 'many', maxUsers: -3, maxDispensers: null, trialDays: 'x', features: 'none' };
  await page.route(plansApi, fulfilPlans([null, 'not a plan', { code: 'NAMELESS', monthlyPrice: '1' }, solo, network, dearYear, unpriced]));

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/pricing');
  // Rows that are not plans are dropped; the rest keep the order they came in.
  await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toHaveText([solo.name, network.name, dearYear.name, unpriced.name]);

  const soloCard = planCard(page, solo.name);
  await expect(soloCard).toContainText('₹1,499.50 a month');
  // An annual price of zero means none was set: no yearly line and no saving.
  await expect(soloCard).not.toContainText(/a year|save/);
  await expect(soloCard).not.toContainText(/trial|Included/);
  await expect(soloCard.getByRole('listitem')).toHaveText(['1 station', '1 team login', '1 dispenser']);

  const networkCard = planCard(page, network.name);
  await expect(networkCard).toContainText('₹12,34,567 a month');
  await expect(networkCard).toContainText('or ₹1,23,45,670 a year · save ₹24,69,134');
  await expect(networkCard.getByText('90-day trial', { exact: true })).toBeVisible();
  // Only text counts as a feature.
  await expect(networkCard.getByRole('listitem')).toHaveText([
    'Up to 1,250 stations', 'Up to 5,000 team logins', 'Up to 10,000 dispensers', network.features[0] as string,
  ]);

  // A yearly price that is no cheaper than twelve months is shown, but not called a saving.
  await expect(planCard(page, dearYear.name)).toContainText('or ₹1,500 a year');
  await expect(planCard(page, dearYear.name)).not.toContainText('save');

  // Nothing is invented for values that are not numbers.
  const unpricedCard = planCard(page, unpriced.name);
  await expect(unpricedCard).toContainText('— a month');
  await expect(unpricedCard).not.toContainText(/₹|a year|trial|Up to|station|login|dispenser/);

  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.viewport);

  // The sign-in screen quotes the lowest price that is a real number.
  await page.goto('/login');
  await expect(pricingLink(page)).toContainText('From ₹100 a month');
  await page.unroute(plansApi);
  await page.route(plansApi, fulfilPlans([unpriced]));
  await page.reload();
  await expect(pricingLink(page)).toContainText('See what each plan includes');
  await expect(pricingLink(page)).not.toContainText('₹');
});

test('an answer that is not a list is reported as a failure, not as "no plans"', async ({ page }) => {
  await page.route(plansApi, fulfilPlans({ plans: 'moved' }));
  await page.goto('/pricing');
  await expect(page.getByRole('alert')).toContainText('The plans could not be loaded right now.');
  await expect(page.getByText('Plans are not published yet')).toHaveCount(0);
});

test('a signed-in owner sees their own plan marked, and a way back to the workspace', async ({ page }) => {
  await signIn(page, owner);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()).data;
  expect(me.subscription.planName).toBe('Growth');

  await page.goto('/pricing');
  await expect(planCard(page, 'Growth').getByText('Your plan', { exact: true })).toBeVisible();
  await expect(page.getByText('Your plan', { exact: true })).toHaveCount(1);
  // Someone who is already in is not asked to sign in.
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: 'Back to workspace' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
});

test('the price list and the sign-in screen fit phones, tablets and desktops in both themes', async ({ page }) => {
  for (const path of ['/pricing', '/login']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => localStorage.setItem('petroflow.theme', value), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      // Measure with the plans on screen: they are what could push either page sideways.
      await expect(path === '/pricing' ? planCard(page, 'Enterprise') : pricingLink(page)).toBeVisible();
      for (const width of [320, 360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
        expect(size.scroll, `${path} ${theme} ${width}px`).toBeLessThanOrEqual(size.viewport);
      }
    }
  }

  // Three plans to a row on a desktop, two on a tablet, one on a phone.
  await page.goto('/pricing');
  await expect(planCard(page, 'Enterprise')).toBeVisible();
  const rows = async () => {
    const tops: number[] = [];
    for (const name of ['Starter', 'Growth', 'Enterprise']) tops.push(Math.round((await planCard(page, name).boundingBox())!.y));
    return tops;
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  let [starter, growth, enterprise] = await rows();
  expect([growth, enterprise]).toEqual([starter, starter]);
  await page.setViewportSize({ width: 768, height: 900 });
  [starter, growth, enterprise] = await rows();
  expect(growth).toBe(starter);
  expect(enterprise).toBeGreaterThan(starter);
  await page.setViewportSize({ width: 360, height: 780 });
  [starter, growth, enterprise] = await rows();
  expect(growth).toBeGreaterThan(starter);
  expect(enterprise).toBeGreaterThan(growth);
});

// Last on purpose: it adds a plan to the test database (left deactivated), which the tests above do not expect.
test('a plan the administrator creates is on the price list at once, and leaves it when deactivated', async ({ page, browser, baseURL, monitor }) => {
  const stamp = Date.now().toString(36).toUpperCase();
  const name = `Trial run ${stamp}`;

  // The administrator opens the price list first, so that this browser holds a copy of it from before the change.
  await signIn(page, superAdmin);
  await page.goto('/pricing');
  await expect(planCard(page, 'Starter')).toBeVisible();
  await expect(planCard(page, name)).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: 'Back to workspace' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('navigation', { name: 'Primary' }).first().getByRole('link', { name: 'Subscriptions' }).click();
  await expect(page).toHaveURL(/\/admin\/subscriptions$/);

  // Before creating a plan, the administrator is told that it will be public.
  await expect(page.getByText(/Active plans are public/)).toBeVisible();
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog', { name: 'New subscription plan' });
  await expect(dialog.getByText(/appears on the public pricing page straight away/)).toBeVisible();
  await dialog.getByLabel('Code').fill(`E2E${stamp}`);
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Description').fill('Created by the pricing test.');
  await dialog.getByLabel('Monthly price (₹)').fill('1234.50');
  await dialog.getByLabel('Annual price (₹)').fill('12345');
  await dialog.getByLabel('Max stations').fill('2');
  await dialog.getByLabel('Max users').fill('7');
  await dialog.getByLabel('Max dispensers').fill('9');
  await dialog.getByLabel('Trial days').fill('21');
  await dialog.getByLabel('Features').fill('Feature one, Feature two');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText('Plan created')).toBeVisible();

  // A visitor in another browser, never signed in, finds it straight away: cheapest, so first.
  const visitorContext = await browser.newContext({ baseURL });
  const visitor = await visitorContext.newPage();
  monitor.watch(visitor);
  await visitor.goto('/pricing');
  const card = planCard(visitor, name);
  await expect(visitor.getByRole('article').first()).toHaveAccessibleName(name);
  await expect(card).toContainText('Created by the pricing test.');
  await expect(card).toContainText('₹1,234.50 a month');
  await expect(card).toContainText('or ₹12,345 a year · save ₹2,469');
  await expect(card.getByText('21-day trial', { exact: true })).toBeVisible();
  await expect(card.getByRole('listitem')).toHaveText(['Up to 2 stations', 'Up to 7 team logins', 'Up to 9 dispensers', 'Feature one', 'Feature two']);
  await visitor.goto('/login');
  await expect(pricingLink(visitor)).toContainText('From ₹1,234.50 a month');

  // The administrator's own browser does not keep showing the list from before the change.
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(planCard(page, name)).toBeVisible();
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/subscriptions$/);

  const adminCard = page.locator('.card', { hasText: name });
  await adminCard.getByRole('button', { name: 'Deactivate plan' }).click();
  await expect(page.getByText('Plan updated')).toBeVisible();
  await expect(adminCard.getByRole('button', { name: 'Activate plan' })).toBeVisible();

  await visitor.goto('/pricing');
  await expect(planCard(visitor, 'Starter')).toBeVisible();
  await expect(planCard(visitor, name)).toHaveCount(0);
  await visitor.goto('/login');
  await expect(pricingLink(visitor)).toContainText('From ₹2,999 a month');
  await visitorContext.close();

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(planCard(page, 'Starter')).toBeVisible();
  await expect(planCard(page, name)).toHaveCount(0);
});
