import { expect, test } from 'vitest';
import { demoState } from './demo';

test('demo state is a lively current month', () => {
  const today = new Date(2026, 9, 17);
  const s = demoState(today);
  expect(s.shared.banks.map((b) => [b.code, b.sum])).toEqual([
    ['tbank', 48200],
    ['sber', 12400],
    ['alfa', 3150],
  ]);
  expect(s.shared.car).toMatchObject({ name: 'Porsche Panamera', price: 2500000, saved: 640000, date: '2027-10-17' });
  expect(s.shared.buys.map((b) => b.title)).toContain('Стол');
  expect(s.shared.buys.find((b) => b.title === 'Куртка зимняя')).toMatchObject({ category: 'Одежда', due: '2026-11-06' });
  expect(s.shared.buys.filter((b) => b.boughtAt).map((b) => b.title)).toEqual(['Кресло']);
  expect(s.personal.tasks.length).toBe(5);
  expect(s.personal.tasks.every((t) => t.desc.length > 0)).toBe(true);
  expect(s.personal.shifts.length).toBe(8);
  expect(s.personal.shifts.every((x) => x.date.startsWith('2026-10'))).toBe(true);
  expect(s.personal.shifts.some((x) => x.type === 'd') && s.personal.shifts.some((x) => x.type === 'n')).toBe(true);
  const month = s.shared.budgets.find((b) => b.ym === '2026-10')!;
  expect(month.income).toBe(90000);
  expect(month.cats).toHaveLength(7);
  expect(s.shared.spends).toHaveLength(7);
  expect(s.shared.spends.some((x) => x.items?.length)).toBe(true);
  expect(s.shared.subs.map((x) => x.name)).toEqual(['Интернет', 'Мобильная связь', 'Яндекс Плюс', 'Облако']);
  expect(s.shared.incomes.length).toBeGreaterThan(0);
});
