import { daysBetween, parseDay } from '../../lib/dates';
import { rub } from '../../lib/money';
import { visible } from '../../lib/records';
import type { Income, Spend, Sub } from '../../lib/types';

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
  updatedAt: number;
}

/** Everything that happened in a month, newest first. */
export function monthTxs(incomes: Income[], spends: Spend[], ym: string): Tx[] {
  const inn: Tx[] = visible(incomes)
    .filter((x) => x.date.startsWith(ym))
    .map((x) => ({ id: x.id, kind: 'in', amount: x.amount, date: x.date, title: x.note || 'Пополнение', bankId: x.bankId, auto: x.source === 'shortcut', updatedAt: x.updatedAt }));
  const out: Tx[] = visible(spends)
    .filter((x) => x.ym === ym)
    .map((x) => ({ id: x.id, kind: 'out', amount: x.amount, date: x.date, title: x.title || x.note || 'Трата', bankId: x.bankId, auto: !!x.auto, updatedAt: x.updatedAt }));
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

export interface MonthStats {
  income: number;
  spent: number;
  /** Income minus spending. */
  delta: number;
  /** The delta as a share of what there was before it; null when there was nothing to compare with. */
  pct: number | null;
  lastIn: Tx | null;
}

export function monthStats(txs: Tx[], balance: number): MonthStats {
  const income = txs.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0);
  const spent = txs.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
  const delta = income - spent;
  const before = balance - delta;
  return { income, spent, delta, pct: before > 0 && delta ? (delta / before) * 100 : null, lastIn: txs.find((t) => t.kind === 'in') ?? null };
}
