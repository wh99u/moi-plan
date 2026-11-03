import { describe, expect, test } from 'vitest';
import type { Income, Spend, Sub } from '../../lib/types';
import { chartPaths, donutSegments, dueLabel, incomeVsSpent, monthTotals, monthTxs, monthWindow, txDays, unassigned, upcoming } from './logic';

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

const inc = (id: string, date: string, amount: number, extra: Partial<Income> = {}): Income => ({ id, date, amount, bankId: 'b', source: 'manual', updatedAt: 0, ...extra });
const out = (id: string, date: string, amount: number, extra: Partial<Spend> = {}): Spend => ({ id, ym: date.slice(0, 7), catId: '', date, amount, updatedAt: 0, ...extra });

describe('month feed', () => {
  test('income and spending of the month, newest first, deleted and other months left out', () => {
    const list = monthTxs(
      [inc('a', '2026-11-02', 100), inc('old', '2026-10-30', 5), inc('gone', '2026-11-03', 5, { deleted: true })],
      [out('b', '2026-11-03', 40), out('c', '2026-11-01', 10), out('prev', '2026-10-31', 7)],
      '2026-11',
    );
    expect(list.map((t) => [t.id, t.kind])).toEqual([
      ['b', 'out'],
      ['a', 'in'],
      ['c', 'out'],
    ]);
  });

  test('the same day: the latest entry on top', () => {
    const list = monthTxs([inc('a', '2026-11-02', 1, { updatedAt: 1 })], [out('b', '2026-11-02', 1, { updatedAt: 2 })], '2026-11');
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
  });

  test('titles fall back and automatic entries are marked', () => {
    const [a, b] = monthTxs([inc('a', '2026-11-02', 1, { source: 'shortcut' })], [out('b', '2026-11-01', 1, { note: 'Кофе' })], '2026-11');
    expect([a.title, a.auto, b.title, b.auto]).toEqual(['Пополнение', true, 'Кофе', false]);
  });

  test('split by day', () => {
    const list = monthTxs([], [out('a', '2026-11-03', 1), out('b', '2026-11-03', 1), out('c', '2026-11-01', 1)], '2026-11');
    expect(txDays(list).map((d) => [d.date, d.list.length])).toEqual([
      ['2026-11-03', 2],
      ['2026-11-01', 1],
    ]);
  });
});

describe('chart', () => {
  test('a window of months ends with the given one, across the new year', () => {
    expect(monthWindow('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('totals per month', () => {
    const totals = monthTotals([inc('a', '2026-11-02', 100), inc('b', '2026-10-02', 7)], [out('c', '2026-11-03', 40), out('d', '2026-11-04', 2)], ['2026-10', '2026-11']);
    expect(totals).toEqual([
      { ym: '2026-10', income: 7, spent: 0 },
      { ym: '2026-11', income: 100, spent: 42 },
    ]);
  });

  test('the biggest value reaches the top, zero stays at the bottom', () => {
    const p = chartPaths([0, 50, 100], 100, 300, 200, 40, 160);
    expect(p.ys).toEqual([160, 100, 40]);
    expect(p.xs).toEqual([50, 150, 250]);
  });

  test('a floor stretches close values over the whole height', () => {
    expect(chartPaths([60, 80, 100], 100, 300, 200, 40, 160, 60).ys).toEqual([160, 100, 40]);
  });

  test('the curve runs past both edges and never leaves the range', () => {
    const p = chartPaths([100, 0, 100, 0], 100, 400, 200, 40, 160);
    const nums = p.line.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBe(40);
    expect(Math.max(...ys)).toBe(160);
    expect(nums[0]).toBeLessThan(0);
    expect(nums[nums.length - 2]).toBeGreaterThan(400);
  });

  test('a new month changes only the numbers of the path, so it can morph', () => {
    const shape = (s: string) => s.replace(/-?\d+(\.\d+)?/g, '#');
    expect(shape(chartPaths([1, 2, 3], 3, 300, 200, 40, 160).line)).toBe(shape(chartPaths([9, 0, 4], 9, 300, 200, 40, 160).line));
  });
});

describe('income against spending', () => {
  test('percent of the spending', () => {
    expect(incomeVsSpent(50000, 40000)).toBe(25);
    expect(incomeVsSpent(30000, 40000)).toBe(-25);
    expect(incomeVsSpent(40000, 40000)).toBe(0);
  });
  test('nothing to compare with', () => {
    expect(incomeVsSpent(50000, 0)).toBeNull();
    expect(incomeVsSpent(0, 0)).toBeNull();
  });
});

describe('planner', () => {
  test('ring segments follow each other and fill it', () => {
    const g = donutSegments([50, 30, 20]);
    expect(g).toEqual([
      { start: 0, share: 50 },
      { start: 50, share: 30 },
      { start: 80, share: 20 },
    ]);
    expect(donutSegments([0, 0])).toEqual([]);
  });

  test('spending outside the categories is counted apart', () => {
    const month = { id: 'm', ym: '2026-11', income: 0, updatedAt: 0, cats: [{ id: 'food', name: 'Еда', icon: 'food', color: '#000', limit: 100 }] };
    const list = [out('a', '2026-11-01', 10, { catId: 'food' }), out('b', '2026-11-02', 20), out('c', '2026-11-03', 5, { catId: 'old' }), out('d', '2026-10-03', 7)];
    expect(unassigned(list, month, '2026-11')).toBe(25);
  });
});
