import { describe, expect, test } from 'vitest';
import type { Income, Spend, Sub } from '../../lib/types';
import { dueLabel, monthStats, monthTxs, txDays, upcoming } from './logic';

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

describe('month stats', () => {
  const list = monthTxs([inc('a', '2026-11-02', 1000), inc('z', '2026-11-05', 200)], [out('b', '2026-11-03', 200)], '2026-11');

  test('difference and its share of what there was before', () => {
    expect(monthStats(list, 11000)).toMatchObject({ income: 1200, spent: 200, delta: 1000, pct: 10 });
  });
  test('the newest top-up', () => {
    expect(monthStats(list, 11000).lastIn?.id).toBe('z');
  });
  test('no percent without a base or without a change', () => {
    expect(monthStats(list, 1000).pct).toBeNull();
    expect(monthStats([], 500)).toMatchObject({ delta: 0, pct: null, lastIn: null });
  });
});
