import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill('PetroFlow@2025');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
}

// An allowed screen must not silently turn forbidden reference-list requests into empty data.
test('attendant can pick nozzles, view meter history and export tank stock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().includes('/auth/me')) errors.push(`${r.status()} ${r.url()}`);
  });
  await login(page, 'attendant@sunrisefuels.in');
  await page.goto('/readings');
  await page.getByRole('button', { name: 'Manual entry', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/Nozzle/).locator('option')).not.toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.goto('/sales');
  await expect(page.locator('main tbody tr').first()).toBeVisible();
  await page.goto('/tanks');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('tanks');
  expect(errors).toEqual([]);
});

test('new tank saves the displayed default product and resets on reopen', async ({ page }) => {
  await login(page, 'owner@sunrisefuels.in');
  await page.goto('/tanks');
  await page.getByRole('button', { name: 'New tank', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const code = `AUD${Date.now()}`;
  await dialog.getByLabel('Tank code').fill(code);
  await dialog.getByLabel('Tank name').fill('Regression tank');
  const productId = await dialog.getByLabel('Fuel product').inputValue();
  expect(productId).not.toBe('');
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/catalog/tanks'));
  await expect(dialog.getByRole('button', { name: 'Create tank' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Create tank' }).click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  expect((await saved.json()).data.productId).toBe(productId);
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'New tank', exact: true }).click();
  await expect(dialog.getByLabel('Tank code')).toHaveValue('');
});

test('closing preview labels every nozzle and empty DSR download explains itself', async ({ page }) => {
  await login(page, 'owner@sunrisefuels.in');
  await page.goto('/shifts');
  await page.getByRole('button', { name: 'View', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Preview closing readings' }).click();
  await expect(dialog.getByText(/N\d.*: closing/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/reports');
  // A far-future date has no posted shifts regardless of today's seed or other tests.
  await page.getByLabel('Business date').fill('2099-01-01');
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  await expect(page.getByText('Nothing to download', { exact: true })).toBeVisible();
});
