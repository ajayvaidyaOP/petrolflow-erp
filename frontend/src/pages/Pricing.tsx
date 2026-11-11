import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeIndianRupee, Building2, Check, Fuel, Moon, Sun, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import { annualSavingPaise, formatPaise, toPaise, usePublicPlans, type PublicPlan } from '../lib/plans';
import { EmptyState, ErrorState } from '../components/ui';

// One, two or three cards to a row. A flex row (not a grid) keeps a short last row centred, so two
// plans, or the third plan on a tablet, never sit lopsided against the left edge.
const CARD_WIDTH = 'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]';

// The look of the primary, large <Button>, on a link: these go to another screen, so they are links.
const ACTION_LINK =
  'btn-touch inline-flex h-11 select-none items-center justify-center gap-2 rounded-xl border border-fuel/40 px-5 text-sm font-semibold text-onbrand shadow-glow transition-all duration-150 ease-smooth brand-gradient hover:brightness-[1.06] active:scale-[.985]';

function upTo(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `Up to ${count.toLocaleString('en-IN')} ${many}`;
}

/**
 * `alignPrice` reserves two lines for the description wherever cards sit side by side, so a plan with
 * a one-line description does not show its price higher than its neighbours.
 */
function PlanCard({ plan, current, alignPrice }: { plan: PublicPlan; current: boolean; alignPrice: boolean }) {
  const titleId = useId();
  const monthly = toPaise(plan.monthlyPrice);
  const annual = toPaise(plan.annualPrice);
  const saving = annualSavingPaise(plan);
  const limits = [
    plan.maxStations > 0 && { icon: Building2, text: upTo(plan.maxStations, 'station', 'stations') },
    plan.maxUsers > 0 && { icon: Users, text: upTo(plan.maxUsers, 'team login', 'team logins') },
    plan.maxDispensers > 0 && { icon: Fuel, text: upTo(plan.maxDispensers, 'dispenser', 'dispensers') },
  ].filter((limit): limit is { icon: typeof Building2; text: string } => Boolean(limit));

  return (
    <article aria-labelledby={titleId} className={cn('card flex flex-col p-5 sm:p-6', CARD_WIDTH, current && 'border-accent/60')}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={titleId} className="min-w-0 break-words font-display text-lg font-bold tracking-tight text-ink-100">
          {plan.name}
        </h2>
        {current ? (
          <span className="chip border-accent/40 text-accent">Your plan</span>
        ) : plan.trialDays > 0 ? (
          <span className="chip">{plan.trialDays}-day trial</span>
        ) : null}
      </div>
      {(plan.description || alignPrice) && (
        <p className={cn('mt-1.5 break-words text-xs leading-relaxed text-ink-400', alignPrice && 'sm:min-h-[2.4375rem]')}>
          {plan.description}
        </p>
      )}

      <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="num font-display text-4xl font-extrabold tracking-[-0.04em] text-ink-100">
          {monthly === null ? '—' : formatPaise(monthly)}
        </span>{' '}
        <span className="text-sm text-ink-400">a month</span>
      </p>
      {annual !== null && annual > 0 && (
        <p className="mt-1 text-xs text-ink-400">
          or <span className="num font-semibold text-ink-200">{formatPaise(annual)}</span> a year
          {saving !== null && <span className="font-semibold text-ok"> · save {formatPaise(saving)}</span>}
        </p>
      )}

      {limits.length > 0 && (
        <ul className="mt-5 space-y-2.5 border-t border-carbon-700/60 pt-4 text-sm text-ink-200">
          {limits.map((limit) => (
            <li key={limit.text} className="flex items-center gap-2.5">
              <limit.icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">{limit.text}</span>
            </li>
          ))}
        </ul>
      )}

      {plan.features.length > 0 && (
        <>
          <p className="eyebrow mt-5">Included</p>
          <ul className="mt-2.5 space-y-2 text-sm text-ink-300">
            {plan.features.map((feature, index) => (
              <li key={`${index}-${feature}`} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                <span className="min-w-0 break-words">{feature}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

/**
 * The public price list. Anyone can open it, signed in or not; it shows the plans the platform
 * administrator has left active under Admin → Subscriptions, and nothing that is not stored there.
 */
export default function Pricing() {
  const { isAuthenticated, isLoading: sessionLoading, me } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const plans = usePublicPlans();
  const list = plans.data ?? [];
  // "Try again" keeps the failed state while it asks again; show the placeholders so the press is seen to do something.
  const loading = plans.isLoading || (plans.isError && plans.isFetching);
  const home = me?.isSuperAdmin ? '/admin' : '/';
  // Only a running subscription counts as "your plan"; the API uses the same two statuses for plan limits.
  const subscription = me?.subscription;
  const currentPlanCode =
    subscription && (subscription.status === 'ACTIVE' || subscription.status === 'TRIALING') ? subscription.planCode : null;
  const alignPrice = list.length > 1 && list.some((plan) => plan.description);

  return (
    <div className="min-h-dvh bg-carbon-950">
      <header className="border-b border-carbon-700/60 bg-carbon-900/70">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
          {!sessionLoading && (
            <Link to={isAuthenticated ? home : '/login'} className="link text-sm">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {isAuthenticated ? 'Back to workspace' : 'Sign in'}
            </Link>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="ml-auto grid h-9.5 w-9.5 shrink-0 place-items-center rounded-xl border border-carbon-700/85 bg-carbon-900 text-ink-400 shadow-sheen transition hover:border-carbon-600 hover:bg-carbon-800 hover:text-ink-100"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-9 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2.5">
            <span className="brand-gradient grid h-10 w-10 place-items-center rounded-xl text-onbrand shadow-glow">
              <Fuel className="h-5 w-5" strokeWidth={2.3} aria-hidden />
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight text-ink-100">
              Petro<span className="text-accent">Flow</span>
            </span>
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold tracking-[-0.035em] text-ink-100 sm:text-4xl">
            Plans &amp; pricing
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-400 sm:text-[15px]">
            One plan covers your whole business. Pick it by how many stations, team logins and dispensers you run.
          </p>
        </div>

        <section aria-label="Plans" className="mt-9 sm:mt-11">
          {loading ? (
            <div role="status" aria-live="polite" className="flex flex-wrap justify-center gap-4">
              <span className="sr-only">Loading plans</span>
              {[0, 1, 2].map((index) => (
                <div key={index} className={cn('skeleton h-80', CARD_WIDTH)} style={{ animationDelay: `${index * 80}ms` }} />
              ))}
            </div>
          ) : plans.isError ? (
            <div role="alert" className="mx-auto max-w-md">
              <ErrorState error="The plans could not be loaded right now." onRetry={() => void plans.refetch()} />
            </div>
          ) : list.length === 0 ? (
            <div className="card mx-auto max-w-md">
              <EmptyState
                icon={<BadgeIndianRupee className="h-5 w-5" />}
                title="Plans are not published yet"
                description="Pricing will appear here once plans have been set up."
                action={
                  me?.isSuperAdmin ? (
                    <Link to="/admin/subscriptions" className="link text-sm">
                      Set up plans <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {list.map((plan) => (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  current={currentPlanCode !== null && currentPlanCode === plan.code}
                  alignPrice={alignPrice}
                />
              ))}
            </div>
          )}
        </section>

        {!sessionLoading && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            {isAuthenticated ? (
              <Link to={home} className={ACTION_LINK}>
                Back to workspace <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <>
                <p className="text-sm text-ink-400">Already have a PetroFlow login?</p>
                <Link to="/login" className={ACTION_LINK}>
                  Sign in <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
