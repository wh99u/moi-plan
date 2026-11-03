import { daysBetween, parseDay } from '../../lib/dates';
import { rub } from '../../lib/money';
import { visible } from '../../lib/records';
import { addMonths } from '../../lib/dates';
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

/** Whole roubles as «5 000 ₽», kopecks only when there are any: «89,99 ₽». */
export function money(n: number) {
  if (Number.isInteger(Math.round(n * 100) / 100)) return rub(n);
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')} ₽`;
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

export interface MonthTotal {
  ym: string;
  income: number;
  spent: number;
}

export function monthTotals(incomes: Income[], spends: Spend[], yms: string[]): MonthTotal[] {
  return yms.map((ym) => {
    const list = monthTxs(incomes, spends, ym);
    const sum = (kind: Tx['kind']) => list.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
    return { ym, income: sum('in'), spent: sum('out') };
  });
}

/** Income against spending, in percent of the spending; null when nothing was spent. */
export const incomeVsSpent = (income: number, spent: number) => (spent > 0 ? ((income - spent) / spent) * 100 : null);

/**
 * One curve of the chart. Each value sits in the middle of its month's column; the curve leaves
 * every point flat, so it makes soft hills and never swings past the real values.
 */
export function chartPaths(values: number[], max: number, w: number, h: number, top: number, bottom: number, floor = 0) {
  const step = w / Math.max(1, values.length);
  const xs = values.map((_, i) => step * (i + 0.5));
  const ys = values.map((v) => bottom - ((v - floor) / Math.max(1, max - floor)) * (bottom - top));
  const px = [-step / 2, ...xs, w + step / 2];
  const py = [ys[0] ?? bottom, ...ys, ys[ys.length - 1] ?? bottom];
  const r = (n: number) => Math.round(n * 10) / 10;
  let line = `M${r(px[0])} ${r(py[0])}`;
  for (let i = 1; i < px.length; i++) {
    const mid = (px[i - 1] + px[i]) / 2;
    line += `C${r(mid)} ${r(py[i - 1])} ${r(mid)} ${r(py[i])} ${r(px[i])} ${r(py[i])}`;
  }
  return { xs, ys, line, area: `${line}L${r(px[px.length - 1])} ${h}L${r(px[0])} ${h}Z` };
}

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
