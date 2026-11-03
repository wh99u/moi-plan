import { useSyncExternalStore } from 'react';
import { money } from './logic';

export type Cur = 'RUB' | 'USD';

export interface UsdRate {
  /** Roubles for one dollar. */
  value: number;
  previous: number;
  /** ISO day the rate is set for. */
  date: string;
}

/** Official Bank of Russia rates, mirrored with CORS. */
const RATES_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const CUR_KEY = 'money_currency';
const RATE_KEY = 'money_usd_rate';
const FRESH_MS = 3 * 3600_000;

export function parseUsdRate(json: { Date?: string; Valute?: { USD?: { Value?: number; Previous?: number; Nominal?: number } } }): UsdRate | null {
  const usd = json.Valute?.USD;
  if (!usd?.Value || !json.Date) return null;
  const nominal = usd.Nominal || 1;
  return { value: usd.Value / nominal, previous: (usd.Previous ?? usd.Value) / nominal, date: json.Date.slice(0, 10) };
}

/** Rouble amount in the chosen currency; dollars only when a rate is known. */
export const convert = (rub: number, cur: Cur, rate: UsdRate | null) => (cur === 'USD' && rate ? rub / rate.value : rub);

export function formatMoney(rub: number, cur: Cur, rate: UsdRate | null) {
  if (cur !== 'USD' || !rate) return money(rub);
  const text = (rub / rate.value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ');
  return `${text} $`;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* it just won't survive a reload */
  }
}

const saved = read<UsdRate & { at: number }>(RATE_KEY);
let state: { cur: Cur; rate: UsdRate | null } = { cur: read<Cur>(CUR_KEY) === 'USD' ? 'USD' : 'RUB', rate: saved };
const listeners = new Set<() => void>();
const set = (patch: Partial<typeof state>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let inflight: Promise<UsdRate | null> | null = null;

/** Fetches today's rate, unless a recent one is at hand. Resolves with what is known, null if nothing. */
export function loadRate(): Promise<UsdRate | null> {
  if (saved && state.rate === saved && Date.now() - saved.at < FRESH_MS) return Promise.resolve(saved);
  inflight ??= fetch(RATES_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      const rate = json && parseUsdRate(json);
      if (rate) {
        write(RATE_KEY, { ...rate, at: Date.now() });
        set({ rate });
      }
      return rate ?? state.rate;
    })
    .catch(() => state.rate)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function setCurrency(cur: Cur) {
  write(CUR_KEY, cur);
  set({ cur });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useCurrency = () => useSyncExternalStore(subscribe, () => state);
