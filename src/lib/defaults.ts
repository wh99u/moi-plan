import type { Car, StateV4 } from './types';

export const defaultCar = (now: number): Car => ({ name: 'Porsche Panamera', price: 0, date: '', color: '#1c1c1e', updatedAt: now });

export const emptyState = (now = Date.now()): StateV4 => ({
  v: 4,
  shared: { banks: [], incomes: [], car: defaultCar(now), buys: [], budgets: [], spends: [], subs: [] },
  personal: { shifts: [], tasks: [], plan: 15, settings: { botLink: '' }, processedLaunches: [] },
});
