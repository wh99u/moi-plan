import { describe, expect, test } from 'vitest';
import type { Category, Spend, Sub } from '../../lib/types';
import { byDay, dueLabel, report, subCategory, upcoming, wholeShares } from './logic';

const sub = (id: string, next: string, extra: Partial<Sub> = {}): Sub => ({
  id,
  updatedAt: 0,
  name: id,
  amount: 100,
  icon: 'phone',
  next,
  period: 'month',
  catName: 'Связь',
  ...extra,
});
const cat = (id: string, name = id): Category => ({ id, name, icon: 'food', color: '#000', limit: 0 });
const today = new Date(2026, 9, 28, 15);

describe('upcoming payments', () => {
  test('sorted by date with a status', () => {
    const list = upcoming([sub('later', '2026-11-10'), sub('late', '2026-10-25'), sub('now', '2026-10-28'), sub('soon', '2026-10-30'), sub('gone', '2026-10-29', { deleted: true })], today);
    expect(list.map((x) => [x.sub.id, x.days, x.status])).toEqual([
      ['late', -3, 'overdue'],
      ['now', 0, 'today'],
      ['soon', 2, 'soon'],
      ['later', 13, 'later'],
    ]);
  });

  test('labels', () => {
    expect(dueLabel(-1)).toBe('просрочено на 1 день');
    expect(dueLabel(-5)).toBe('просрочено на 5 дней');
    expect(dueLabel(0)).toBe('сегодня');
    expect(dueLabel(1)).toBe('завтра');
    expect(dueLabel(3)).toBe('через 3 дня');
    expect(dueLabel(21)).toBe('через 21 день');
  });
});

describe('report', () => {
  test('only categories with spending, biggest first, shares of the total', () => {
    const rows = report([
      { cat: cat('a'), spent: 100 },
      { cat: cat('b'), spent: 0 },
      { cat: cat('c'), spent: 300 },
    ]);
    expect(rows.map((r) => [r.cat.id, r.share])).toEqual([
      ['c', 75],
      ['a', 25],
    ]);
  });

  test('whole percents still add up to 100', () => {
    expect(wholeShares([33.33, 33.33, 33.34])).toEqual([33, 33, 34]);
    expect(wholeShares([62.5, 37.5]).reduce((t, x) => t + x, 0)).toBe(100);
  });
});

test('spends grouped by day, newest first', () => {
  const s = (id: string, date: string, amount: number, updatedAt: number, ym = date.slice(0, 7)): Spend => ({ id, ym, catId: 'c', amount, date, updatedAt });
  const groups = byDay([s('a', '2026-10-01', 100, 1), s('b', '2026-10-03', 50, 2), s('c', '2026-10-03', 25, 3), s('d', '2026-09-30', 5, 4)], '2026-10');
  expect(groups.map((g) => [g.date, g.total, g.list.map((x) => x.id)])).toEqual([
    ['2026-10-03', 75, ['c', 'b']],
    ['2026-10-01', 100, ['a']],
  ]);
});

test('a subscription falls back to «Связь», then the first category', () => {
  const month = { id: 'm', ym: '2026-10', income: 0, updatedAt: 0, cats: [cat('1', 'Еда'), cat('2', 'Связь'), cat('3', 'Развлечения')] };
  expect(subCategory(month, 'Развлечения')?.id).toBe('3');
  expect(subCategory(month, 'Нет такой')?.id).toBe('2');
  expect(subCategory({ ...month, cats: [cat('1', 'Еда')] }, 'Связь')?.id).toBe('1');
  expect(subCategory(undefined, 'Связь')).toBeUndefined();
});
