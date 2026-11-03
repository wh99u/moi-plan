import { addDays, addMonths, dayKey, daysBetween, parseDay } from '../../lib/dates';
import { rub } from '../../lib/money';
import { visible } from '../../lib/records';
import type { BudgetMonth, Income, Spend, Sub } from '../../lib/types';

export type DueStatus = 'overdue' | 'today' | 'soon' | 'later';

export interface DueSub {
  sub: Sub;
  days: number;
  status: DueStatus;
}

/** Subscriptions by their next payment, nearest first; «soon» is within three days. */
export function upcoming(subs: Sub[], today: Date): DueSub[] {
  return visible(subs)
    .map((sub) => {
      const days = daysBetween(today, parseDay(sub.next));
      const status: DueStatus = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 3 ? 'soon' : 'later';
      return { sub, days, status };
    })
    .sort((a, b) => a.days - b.days || a.sub.name.localeCompare(b.sub.name));
}

const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
const days = (n: number) => `${n} ${plural(n, ['день', 'дня', 'дней'])}`;

export function dueLabel(d: number) {
  if (d < 0) return `просрочено на ${days(-d)}`;
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  return `через ${days(d)}`;
}

/** Whole roubles: «5 000 ₽». */
export const money = rub;

/** With kopecks when there are any, for the lines of a receipt: «89,99 ₽». */
export function exactMoney(n: number) {
  if (Number.isInteger(Math.round(n * 100) / 100)) return rub(n);
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, '\u00a0')}\u00a0₽`;
}

/** One line of the feed: money that came in or went out. */
export interface Tx {
  id: string;
  kind: 'in' | 'out';
  amount: number;
  date: string;
  title: string;
  bankId?: string;
  /** Added by itself from a bank's message, not typed by hand. */
  auto: boolean;
  /** Lines of its receipt. */
  lines: number;
  /** Budget category of a spend. */
  catId?: string;
  updatedAt: number;
}

/** Everything that happened in a month, newest first. */
export function monthTxs(incomes: Income[], spends: Spend[], ym: string): Tx[] {
  const inn: Tx[] = visible(incomes)
    .filter((x) => x.date.startsWith(ym))
    .map((x) => ({ id: x.id, kind: 'in', amount: x.amount, date: x.date, title: x.note || 'Пополнение', bankId: x.bankId, auto: x.source === 'shortcut', lines: 0, updatedAt: x.updatedAt }));
  const out: Tx[] = visible(spends)
    .filter((x) => x.ym === ym)
    .map((x) => ({ id: x.id, kind: 'out', amount: x.amount, date: x.date, title: x.title || x.note || 'Трата', bankId: x.bankId, auto: !!x.auto, lines: x.items?.length ?? 0, catId: x.catId, updatedAt: x.updatedAt }));
  return [...inn, ...out].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

export interface TxDay {
  date: string;
  list: Tx[];
}

/** Feed split by day; the order inside `txs` is kept. */
export function txDays(txs: Tx[]): TxDay[] {
  const days: TxDay[] = [];
  for (const t of txs) {
    const day = days[days.length - 1];
    if (day?.date === t.date) day.list.push(t);
    else days.push({ date: t.date, list: [t] });
  }
  return days;
}

/** `n` months ending with `end`, oldest first. */
export const monthWindow = (end: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));

/** Income against spending, in percent of the spending; null when nothing was spent. */
export const incomeVsSpent = (income: number, spent: number) => (spent > 0 ? ((income - spent) / spent) * 100 : null);

/** `n` days ending with `end`, oldest first. */
export const dayWindow = (end: string, n: number) => Array.from({ length: n }, (_, i) => dayKey(addDays(parseDay(end), i - n + 1)));

/**
 * The money at the end of each given day, worked back from what is there today. Operations dated
 * after today have not happened yet and don't count.
 */
export function balanceSeries(incomes: Income[], spends: Spend[], total: number, ends: string[], today: string): number[] {
  const moves = [...visible(incomes).map((x) => ({ date: x.date, sum: x.amount })), ...visible(spends).map((x) => ({ date: x.date, sum: -x.amount }))].filter((m) => m.date <= today);
  return ends.map((end) => total - moves.filter((m) => m.date > end).reduce((t, m) => t + m.sum, 0));
}

/** Income of today and yesterday; the percent is null when there was nothing yesterday to compare with. */
export function incomeToday(incomes: Income[], now: Date) {
  const on = (day: string) => visible(incomes).filter((x) => x.date === day).reduce((t, x) => t + x.amount, 0);
  const today = on(dayKey(now));
  const yesterday = on(dayKey(addDays(now, -1)));
  return { today, yesterday, pct: yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : null };
}

/**
 * A smooth curve through the values, `samples` points long. Monotone between neighbours, so it
 * passes through every value and never swings past them.
 */
export function sampleCurve(values: number[], samples: number): number[] {
  const n = values.length;
  if (n < 2) return Array.from({ length: samples }, () => values[0] ?? 0);
  const slope = values.slice(1).map((v, i) => v - values[i]);
  const tangent = values.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    return slope[i - 1] * slope[i] <= 0 ? 0 : (2 * slope[i - 1] * slope[i]) / (slope[i - 1] + slope[i]);
  });
  return Array.from({ length: samples }, (_, k) => {
    const at = (k / (samples - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(at));
    const t = at - i;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * values[i] + (t3 - 2 * t2 + t) * tangent[i] + (-2 * t3 + 3 * t2) * values[i + 1] + (t3 - t2) * tangent[i + 1];
  });
}

/** Softens a curve: each point becomes the average around it, twice over. Sudden jumps turn into slopes. */
export function blurCurve(values: number[], radius: number): number[] {
  const pass = (v: number[]) =>
    v.map((_, i) => {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += v[Math.max(0, Math.min(v.length - 1, i + k))];
      return sum / (radius * 2 + 1);
    });
  return pass(pass(values));
}

/** Colours of the planner's categories, in order: the app's own, not the ones saved with old categories. */
export const PLAN_TONES = ['#ff4d66', '#b4b0ff', '#ffb199', '#8f86ff', '#ff8fb1', '#7fd6e8', '#ffd98a', '#d8a8ff'];

/** Where each category's arc starts on a ring of 100 units, and how long it is. */
export function donutSegments(limits: number[]) {
  const total = limits.reduce((t, x) => t + x, 0);
  if (!total) return [];
  let start = 0;
  return limits.map((x) => {
    const share = (x / total) * 100;
    const g = { start, share };
    start += share;
    return g;
  });
}

/** Spent in a month outside its categories. */
export function unassigned(spends: Spend[], month: BudgetMonth | undefined, ym: string) {
  const ids = new Set((month?.cats ?? []).map((c) => c.id));
  return visible(spends)
    .filter((x) => x.ym === ym && !ids.has(x.catId))
    .reduce((t, x) => t + x.amount, 0);
}
