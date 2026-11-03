import { describe, expect, test } from 'vitest';
import type { Income, Spend, Sub } from '../../lib/types';
import { balanceSeries, blurCurve, dayWindow, donutSegments, dueLabel, exactMoney, incomeToday, incomeVsSpent, money, monthTxs, monthWindow, sampleCurve, txDays, unassigned, upcoming } from './logic';

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
  test('windows end with the given month or day, across a year', () => {
    expect(monthWindow('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(dayWindow('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });

  test('the balance is worked back from today', () => {
    const series = balanceSeries([inc('a', '2026-11-02', 100)], [out('b', '2026-11-03', 30)], 1000, ['2026-11-01', '2026-11-02', '2026-11-03'], '2026-11-03');
    expect(series).toEqual([930, 1030, 1000]);
  });

  test('deleted and future operations do not move the line', () => {
    const series = balanceSeries([inc('a', '2026-11-02', 100, { deleted: true })], [out('b', '2026-11-20', 30)], 1000, ['2026-11-01', '2026-11-03'], '2026-11-03');
    expect(series).toEqual([1000, 1000]);
  });

  test('the curve keeps its ends and every value', () => {
    const s = sampleCurve([10, 20, 5], 5);
    expect(s[0]).toBeCloseTo(10);
    expect(s[2]).toBeCloseTo(20);
    expect(s[4]).toBeCloseTo(5);
  });

  test('the curve never swings past the values', () => {
    const s = sampleCurve([0, 100, 100, 0, 50], 200);
    expect(Math.max(...s)).toBeLessThanOrEqual(100.0001);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(-0.0001);
  });

  test('softening turns a jump into a slope and leaves a flat line alone', () => {
    const s = blurCurve([0, 0, 0, 0, 10, 10, 10, 10], 1);
    expect(s[0]).toBe(0);
    expect(s[7]).toBe(10);
    expect(s[3]).toBeGreaterThan(0);
    expect(s[4]).toBeLessThan(10);
    expect(blurCurve([5, 5, 5], 2)).toEqual([5, 5, 5]);
  });

  test('a single value or none gives a flat line', () => {
    expect(sampleCurve([7], 3)).toEqual([7, 7, 7]);
    expect(sampleCurve([], 2)).toEqual([0, 0]);
  });
});

describe('income today', () => {
  const now = new Date(2026, 10, 3, 12);
  test('against yesterday', () => {
    expect(incomeToday([inc('a', '2026-11-03', 105), inc('b', '2026-11-02', 100)], now)).toMatchObject({ today: 105, yesterday: 100, pct: 5 });
    expect(incomeToday([inc('b', '2026-11-02', 100)], now).pct).toBe(-100);
  });
  test('no percent when yesterday had nothing', () => {
    expect(incomeToday([inc('a', '2026-11-03', 105)], now)).toMatchObject({ today: 105, pct: null });
    expect(incomeToday([], now)).toMatchObject({ today: 0, pct: null });
  });
});

describe('amounts', () => {
  test('no kopecks in general, exact on a receipt', () => {
    expect(money(1248.4)).toBe('1\u00a0248\u00a0₽');
    expect(exactMoney(89.99)).toBe('89,99\u00a0₽');
    expect(exactMoney(489)).toBe('489\u00a0₽');
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
