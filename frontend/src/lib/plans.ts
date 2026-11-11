import { useQuery } from '@tanstack/react-query';
import { ApiError, apiGet } from './api';

/** A plan on the public price list (GET /public/plans). Prices are decimal strings, e.g. "2999.00". */
export interface PublicPlan {
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: string;
  annualPrice: string;
  maxStations: number;
  maxUsers: number;
  maxDispensers: number;
  trialDays: number;
  features: string[];
}

function wholeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * This list is drawn on screens anyone can open, so one odd row must not take the screen down:
 * anything that is not a named plan is dropped and every field gets a safe type.
 */
function toPlan(raw: unknown): PublicPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;
  return {
    code: typeof row.code === 'string' && row.code ? row.code : name,
    name,
    description: typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null,
    monthlyPrice: row.monthlyPrice == null ? '' : String(row.monthlyPrice),
    annualPrice: row.annualPrice == null ? '' : String(row.annualPrice),
    maxStations: wholeNumber(row.maxStations),
    maxUsers: wholeNumber(row.maxUsers),
    maxDispensers: wholeNumber(row.maxDispensers),
    trialDays: wholeNumber(row.trialDays),
    features: Array.isArray(row.features)
      ? row.features.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : [],
  };
}

/** The plans the platform currently offers, cheapest first. Needs no sign-in. */
export function usePublicPlans() {
  return useQuery<PublicPlan[]>({
    queryKey: ['public-plans'],
    queryFn: async () => {
      const data = await apiGet<unknown>('/public/plans');
      // Not a list means the answer cannot be trusted. Report it as a failure: an empty list would
      // tell visitors that no plans are published, which nobody has said.
      if (!Array.isArray(data)) {
        throw new ApiError(200, { code: 'INVALID_RESPONSE', message: 'The server returned an invalid plan list' });
      }
      return data.map(toPlan).filter((plan): plan is PublicPlan => plan !== null);
    },
    staleTime: 60_000,
  });
}

/** A stored price in paise, or null when it is missing, negative or not a number. */
export function toPaise(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const wholeRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const rupeesAndPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹2,999 for whole rupees and ₹2,999.50 otherwise — a price list reads better without ".00". */
export function formatPaise(paise: number) {
  return paise % 100 === 0 ? wholeRupees.format(paise / 100) : rupeesAndPaise.format(paise / 100);
}

/** What a year costs less on the annual price than on twelve monthly payments, in paise; null when it is not cheaper. */
export function annualSavingPaise(plan: Pick<PublicPlan, 'monthlyPrice' | 'annualPrice'>): number | null {
  const monthly = toPaise(plan.monthlyPrice);
  const annual = toPaise(plan.annualPrice);
  if (monthly === null || annual === null || annual <= 0) return null;
  const saving = monthly * 12 - annual;
  return saving > 0 ? saving : null;
}

/** The lowest monthly price on the list, in paise; null when no plan has a usable price. */
export function lowestMonthlyPaise(plans: PublicPlan[]): number | null {
  let lowest: number | null = null;
  for (const plan of plans) {
    const price = toPaise(plan.monthlyPrice);
    if (price !== null && (lowest === null || price < lowest)) lowest = price;
  }
  return lowest;
}
