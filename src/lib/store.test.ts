import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createStore, visible } from './store';

const KEY = 'planner_v4';
const LEGACY = 'planner_v3';
const now = () => new Date(2026, 9, 17, 12);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const fresh = () => createStore(localStorage, KEY, { legacyKey: LEGACY, now });

describe('loading', () => {
  test('nothing stored gives an empty state', () => {
    const s = fresh().get();
    expect(s.v).toBe(4);
    expect(s.shared.banks).toEqual([]);
    expect(s.personal.plan).toBe(15);
  });

  test('legacy data is migrated and the legacy key is never rewritten', () => {
    const raw = JSON.stringify({ banks: [{ id: 1, code: 'vtb', sum: 700 }], plan: 9 });
    localStorage.setItem(LEGACY, raw);
    const store = fresh();
    expect(store.get().shared.banks[0]).toMatchObject({ id: '1', code: 'vtb', sum: 700 });
    store.actions.setPlan(10);
    store.flush();
    expect(localStorage.getItem(LEGACY)).toBe(raw);
    expect(JSON.parse(localStorage.getItem(KEY)!).personal.plan).toBe(10);
  });

  test('migrated legacy data is written to the new key right away', () => {
    localStorage.setItem(LEGACY, JSON.stringify({ banks: [{ id: 1, code: 'vtb', sum: 700 }] }));
    fresh();
    expect(JSON.parse(localStorage.getItem(KEY)!).shared.banks[0]).toMatchObject({ id: '1', sum: 700 });
  });

  test('v4 wins over legacy when both exist', () => {
    localStorage.setItem(LEGACY, JSON.stringify({ plan: 1 }));
    const a = fresh();
    a.actions.setPlan(22);
    a.flush();
    expect(fresh().get().personal.plan).toBe(22);
  });

  test('unreadable legacy data reports a load error and starts empty', () => {
    localStorage.setItem(LEGACY, '{oops');
    const store = fresh();
    const errors: string[] = [];
    store.onError((e) => errors.push(e));
    expect(errors).toEqual(['load']);
    expect(store.get().shared.banks).toEqual([]);
    expect(localStorage.getItem(LEGACY)).toBe('{oops');
  });

  test('seed is used for an empty demo store', () => {
    const store = createStore(localStorage, 'planner_demo', {
      seed: () => ({ ...fresh().get(), personal: { ...fresh().get().personal, plan: 3 } }),
    });
    expect(store.get().personal.plan).toBe(3);
  });
});

describe('cards and money', () => {
  test('topUp raises the balance and logs an income for today', () => {
    const store = fresh();
    const bank = store.actions.addBank('tbank', 1000);
    const inc = store.actions.topUp(bank.id, 500, 'manual');
    const s = store.get();
    expect(s.shared.banks[0].sum).toBe(1500);
    expect(s.shared.incomes).toEqual([inc]);
    expect(inc).toMatchObject({ amount: 500, bankId: bank.id, source: 'manual', date: '2026-10-17' });
    expect(s.personal.settings.lastTopUpBankId).toBe(bank.id);
  });

  test('transfer moves money and refuses to overdraw', () => {
    const store = fresh();
    const a = store.actions.addBank('tbank', 1000);
    const b = store.actions.addBank('sber', 0);
    expect(store.actions.transfer(a.id, b.id, 1500)).toBe(false);
    expect(store.get().shared.banks.map((x) => x.sum)).toEqual([1000, 0]);
    expect(store.actions.transfer(a.id, b.id, 400)).toBe(true);
    expect(store.get().shared.banks.map((x) => x.sum)).toEqual([600, 400]);
    expect(store.actions.transfer(a.id, a.id, 1)).toBe(false);
  });

  test('deleteBank leaves a tombstone hidden by visible()', () => {
    const store = fresh();
    const a = store.actions.addBank('tbank', 1);
    store.actions.addBank('sber', 2);
    store.actions.deleteBank(a.id);
    const banks = store.get().shared.banks;
    expect(banks.find((b) => b.id === a.id)?.deleted).toBe(true);
    expect(visible(banks).map((b) => b.code)).toEqual(['sber']);
  });

  test('new banks get the next order', () => {
    const store = fresh();
    store.actions.addBank('tbank', 1);
    expect(store.actions.addBank('sber', 2).order).toBe(1);
  });
});

describe('budget', () => {
  test('applyTemplate splits income into seven categories', () => {
    const store = fresh();
    store.actions.updateBudget('2026-10', { income: 90000 });
    store.actions.applyTemplate('2026-10');
    const m = store.get().shared.budgets.find((b) => b.ym === '2026-10')!;
    expect(m.cats.map((c) => c.name)).toEqual(['Жильё', 'Еда', 'Транспорт', 'Связь', 'Развлечения', 'Здоровье', 'Накопления на мечту']);
    expect(m.cats.reduce((t, c) => t + c.limit, 0)).toBe(90000);
    expect(m.cats[0]).toMatchObject({ limit: 27000, color: '#FF9F0A', icon: 'home' });
  });

  test('copyBudget copies income and categories but not spends', () => {
    const store = fresh();
    store.actions.updateBudget('2026-09', { income: 50000 });
    store.actions.applyTemplate('2026-09');
    const cat = store.get().shared.budgets[0].cats[1];
    store.actions.addSpend({ ym: '2026-09', catId: cat.id, amount: 300, date: '2026-09-02' });
    store.actions.copyBudget('2026-09', '2026-10');
    const oct = store.get().shared.budgets.find((b) => b.ym === '2026-10')!;
    expect(oct.income).toBe(50000);
    expect(oct.cats.map((c) => [c.name, c.limit])).toEqual(store.get().shared.budgets[0].cats.map((c) => [c.name, c.limit]));
    expect(visible(store.get().shared.spends).filter((s) => s.ym === '2026-10')).toEqual([]);
  });

  test('category edits and deletes', () => {
    const store = fresh();
    const c = store.actions.addCategory('2026-10', { name: 'Кофе', icon: 'food', color: '#30D158', limit: 2000 });
    store.actions.updateCategory('2026-10', c.id, { limit: 3000 });
    expect(store.get().shared.budgets[0].cats[0].limit).toBe(3000);
    store.actions.deleteCategory('2026-10', c.id);
    expect(store.get().shared.budgets[0].cats).toEqual([]);
  });
});

describe('calendar', () => {
  test('tasks toggle and shifts delete', () => {
    const store = fresh();
    const t = store.actions.addTask({ title: 'Позвонить', desc: 'маме', due: '2026-10-17' });
    store.actions.toggleTask(t.id);
    expect(store.get().personal.tasks[0].done).toBe(true);
    const sh = store.actions.addShift({ date: '2026-10-17', type: 'd', pay: 4500, h: 12 });
    store.actions.deleteShift(sh.id);
    expect(visible(store.get().personal.shifts)).toEqual([]);
  });
});

describe('launch dedupe', () => {
  test('markLaunch accepts a key once and keeps the last 50', () => {
    const store = fresh();
    expect(store.actions.markLaunch('k')).toBe(true);
    expect(store.actions.markLaunch('k')).toBe(false);
    for (let i = 0; i < 60; i++) store.actions.markLaunch(`x${i}`);
    expect(store.get().personal.processedLaunches).toHaveLength(50);
    expect(store.actions.markLaunch('x59')).toBe(false);
  });
});

describe('persistence', () => {
  test('saves 150 ms after the last change', () => {
    const store = fresh();
    store.actions.setPlan(5);
    vi.advanceTimersByTime(149);
    expect(localStorage.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).personal.plan).toBe(5);
  });

  test('a failing write reports a save error and keeps the new state', () => {
    const store = fresh();
    const errors: string[] = [];
    store.onError((e) => errors.push(e));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.actions.setPlan(7);
    vi.advanceTimersByTime(200);
    spy.mockRestore();
    expect(errors).toEqual(['save']);
    expect(store.get().personal.plan).toBe(7);
  });

  test('subscribers hear every change', () => {
    const store = fresh();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.actions.setPlan(1);
    off();
    store.actions.setPlan(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('subscriptions', () => {
  test('older v4 saves load with an empty list', () => {
    const old = fresh().get();
    const { subs: _gone, ...shared } = old.shared;
    localStorage.setItem(KEY, JSON.stringify({ ...old, shared }));
    expect(fresh().get().shared.subs).toEqual([]);
  });

  test('paying records a spend and moves the reminder a period on', () => {
    const store = fresh();
    const sub = store.actions.addSub({ name: 'Интернет', amount: 650, icon: 'wifi', next: '2026-10-15', period: 'month', catName: 'Связь' });
    const spend = store.actions.paySub(sub.id, 'cat1')!;
    expect(spend).toMatchObject({ ym: '2026-10', catId: 'cat1', amount: 650, date: '2026-10-17', title: 'Интернет', subId: sub.id });
    expect(store.get().shared.subs[0].next).toBe('2026-11-15');
    expect(visible(store.get().shared.spends)).toHaveLength(1);
  });

  test('yearly subscriptions move a year', () => {
    const store = fresh();
    const sub = store.actions.addSub({ name: 'Яндекс Плюс', amount: 2990, icon: 'sparkle', next: '2026-10-20', period: 'year', catName: 'Развлечения' });
    store.actions.paySub(sub.id, 'c');
    expect(store.get().shared.subs[0].next).toBe('2027-10-20');
  });
});

describe('spend items', () => {
  test('a spend keeps its receipt lines and can be edited', () => {
    const store = fresh();
    const s = store.actions.addSpend({ ym: '2026-10', catId: 'c', amount: 150, date: '2026-10-17', title: 'Магазин', items: [{ name: 'Хлеб', price: 50 }, { name: 'Молоко', price: 100 }] });
    store.actions.updateSpend(s.id, { amount: 200, items: [{ name: 'Хлеб', price: 100 }, { name: 'Молоко', price: 100 }] });
    expect(store.get().shared.spends[0]).toMatchObject({ title: 'Магазин', amount: 200, items: [{ name: 'Хлеб', price: 100 }, { name: 'Молоко', price: 100 }] });
  });
});
