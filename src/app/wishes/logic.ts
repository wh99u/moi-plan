import { daysBetween, parseDay } from '../../lib/dates';
import { visible } from '../../lib/records';
import type { Buy, Car } from '../../lib/types';

const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};

export interface Due {
  days: number;
  /** Fits a small pill: «завтра», «5 дн», «12 дек». */
  short: string;
  /** For the wish sheet: «через 5 дней, 12 декабря». */
  long: string;
  urgent: boolean;
}

export function dueOf(due: string | undefined, today: Date): Due | null {
  if (!due) return null;
  const date = parseDay(due);
  const days = daysBetween(today, date);
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const short =
    days < 0 ? 'срок прошёл' : days === 0 ? 'сегодня' : days === 1 ? 'завтра' : days <= 30 ? `${days} дн` : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  const long =
    days < 0
      ? `срок прошёл ${day}`
      : days === 0
        ? 'сегодня'
        : days === 1
          ? `завтра, ${day}`
          : `через ${days} ${plural(days, ['день', 'дня', 'дней'])}, ${day}`;
  return { days, short, long, urgent: days <= 7 };
}

/** Still wanted, nearest deadline first; undated keep the order they were added in. */
export function activeWishes(buys: Buy[]): Buy[] {
  const list = visible(buys).filter((b) => !b.boughtAt);
  return list
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (x.b.due ?? '9999').localeCompare(y.b.due ?? '9999') || x.i - y.i)
    .map((x) => x.b);
}

/** Bought, latest first. */
export const boughtWishes = (buys: Buy[]) => visible(buys).filter((b) => b.boughtAt).sort((a, b) => b.boughtAt! - a.boughtAt!);

/** Filter chips: the categories in use, most common first. */
export function categoriesOf(list: Buy[]): string[] {
  const count = new Map<string, number>();
  for (const b of list) if (b.category) count.set(b.category, (count.get(b.category) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** Offered as chips next to the user's own categories. */
export const DEFAULT_CATEGORIES = ['Одежда', 'Обувь', 'Техника', 'Дом', 'Красота', 'Здоровье', 'Еда и напитки', 'Спорт', 'Хобби', 'Авто', 'Подарки'];

export const wishesTotal = (list: Buy[]) => list.reduce((t, b) => t + (b.price || 0), 0);

export interface DreamPlan {
  saved: number;
  left: number;
  /** 0…1 */
  share: number;
  days: number | null;
  /** Needed each month to make it by the date. */
  perMonth: number | null;
}

export function dreamPlan(car: Car, today: Date): DreamPlan {
  const saved = Math.max(0, car.saved ?? 0);
  const left = Math.max(0, car.price - saved);
  const days = car.date ? daysBetween(today, parseDay(car.date)) : null;
  const months = days !== null && days > 0 ? days / 30.44 : null;
  return {
    saved,
    left,
    share: car.price > 0 ? Math.min(1, saved / car.price) : 0,
    days,
    perMonth: months !== null && left > 0 ? Math.ceil(left / Math.max(1, months)) : null,
  };
}

const CARS = /porsche|порш|панамер|bmw|бмв|mercedes|мерседес|audi|ауди|tesla|тесл|lada|лада|toyota|тойот|kia|киа|hyundai|хендай|машин|авто\b|car\b|lexus|лексус|volkswagen|range rover|land cruiser|ferrari|lamborghini|bentley|cayenne|macan|911/i;
/** The dream gets the drawn car when it has no photo and sounds like a car. */
export const looksLikeCar = (name: string) => CARS.test(name);
