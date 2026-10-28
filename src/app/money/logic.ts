import { daysBetween, parseDay } from '../../lib/dates';
import { rub } from '../../lib/money';
import { visible } from '../../lib/records';
import type { BudgetMonth, Category, Spend, Sub } from '../../lib/types';

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

export interface ReportRow {
  cat: Category;
  spent: number;
  /** Share of everything spent this month, 0…100. */
  share: number;
}

/** Where the money went: categories with spending, biggest first. */
export function report(cats: { cat: Category; spent: number }[]): ReportRow[] {
  const total = cats.reduce((t, c) => t + c.spent, 0);
  return cats
    .filter((c) => c.spent > 0)
    .map((c) => ({ cat: c.cat, spent: c.spent, share: total ? (c.spent / total) * 100 : 0 }))
    .sort((a, b) => b.spent - a.spent);
}

/** Rounds shares to whole percents that still add up to 100 (largest remainder). */
export function wholeShares(shares: number[]): number[] {
  const floor = shares.map(Math.floor);
  let left = Math.round(shares.reduce((t, s) => t + s, 0)) - floor.reduce((t, s) => t + s, 0);
  const order = shares.map((s, i) => [s - Math.floor(s), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor;
}

export interface DayGroup {
  date: string;
  total: number;
  list: Spend[];
}

/** A month's spends by day, newest day first and newest entry first within it. */
export function byDay(spends: Spend[], ym: string): DayGroup[] {
  const map = new Map<string, Spend[]>();
  for (const s of visible(spends)) {
    if (s.ym !== ym) continue;
    const list = map.get(s.date) ?? [];
    list.push(s);
    map.set(s.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, total: list.reduce((t, s) => t + s.amount, 0), list: list.sort((a, b) => b.updatedAt - a.updatedAt) }));
}

/** The category a subscription is paid from this month: by name, else «Связь», else the first. */
export function subCategory(month: BudgetMonth | undefined, catName: string): Category | undefined {
  const cats = month?.cats ?? [];
  return cats.find((c) => c.name === catName) ?? cats.find((c) => c.name === 'Связь') ?? cats[0];
}

/** One-tap starting points for the usual monthly payments. */
export const SUB_PRESETS: { name: string; icon: string; amount: number; catName: string }[] = [
  { name: 'Мобильная связь', icon: 'phone', amount: 500, catName: 'Связь' },
  { name: 'Интернет', icon: 'wifi', amount: 650, catName: 'Связь' },
  { name: 'Яндекс Плюс', icon: 'sparkle', amount: 399, catName: 'Развлечения' },
  { name: 'Кинопоиск', icon: 'tv', amount: 299, catName: 'Развлечения' },
  { name: 'Музыка', icon: 'headphones', amount: 199, catName: 'Развлечения' },
  { name: 'Облако', icon: 'cloud', amount: 149, catName: 'Связь' },
];

/** Categories in the order the report shows them; each gets a tone from our palette. */
export const CAT_TONES = ['#e8435c', '#f39a8a', '#f6c6a5', '#c98bb0', '#8c5a8f', '#d9b48c', '#b8768a', '#efa3b3'];

/** Whole roubles as «5 000 ₽», kopecks only when there are any: «89,99 ₽». */
export function money(n: number) {
  if (Number.isInteger(Math.round(n * 100) / 100)) return rub(n);
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')} ₽`;
}

/** Sum of receipt lines, kept to kopecks. */
export const itemsTotal = (items: { price: number }[]) => Math.round(items.reduce((t, x) => t + (x.price || 0), 0) * 100) / 100;
