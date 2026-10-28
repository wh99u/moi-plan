import { addDays, dayKey, ymKey } from './dates';
import { emptyState } from './defaults';
import { uid } from './ids';
import { templateCategories } from './template';
import type { StateV4 } from './types';

/** Showcase data for `?demo=1`; lives under its own storage key. */
export function demoState(today = new Date()): StateV4 {
  const now = Date.now();
  const s = emptyState(now);
  const ym = ymKey(today);
  const day = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
  const rec = <T extends object>(x: T) => ({ ...x, id: uid(), updatedAt: now });

  s.shared.banks = [
    rec({ code: 'tbank' as const, sum: 48200, order: 0 }),
    rec({ code: 'sber' as const, sum: 12400, order: 1 }),
    rec({ code: 'alfa' as const, sum: 3150, order: 2 }),
  ];
  s.shared.car = {
    name: 'Porsche Panamera',
    price: 2500000,
    saved: 640000,
    date: dayKey(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())),
    color: '#1c1c1e',
    updatedAt: now,
  };
  const inDays = (n: number) => dayKey(addDays(today, n));
  s.shared.buys = [
    rec({ title: 'Наушники AirPods Pro', url: '', price: 24990, category: 'Техника', shop: 'Wildberries', due: inDays(5) }),
    rec({ title: 'Куртка зимняя', url: '', price: 11490, category: 'Одежда', shop: 'Lamoda', due: inDays(20) }),
    rec({ title: 'Монитор 27"', url: '', price: 32990, category: 'Техника', shop: 'Amazon', due: inDays(60) }),
    rec({ title: 'Кроссовки', url: '', price: 9990, category: 'Одежда' }),
    rec({ title: 'Стол', url: '', price: 12990, category: 'Дом' }),
    rec({ title: 'Кресло', url: '', price: 18500, category: 'Дом', boughtAt: now - 3 * 864e5 }),
  ];
  s.shared.incomes = [
    rec({ date: day(5), amount: 30000, bankId: s.shared.banks[0].id, source: 'shortcut' as const }),
    rec({ date: day(12), amount: 9700, bankId: s.shared.banks[1].id, source: 'manual' as const }),
  ];

  const cats = templateCategories(90000);
  s.shared.budgets = [{ id: ym, ym, income: 90000, cats, updatedAt: now }];
  const spend = (cat: number, amount: number, d: number, note?: string) =>
    rec({ ym, catId: cats[cat].id, amount, date: day(d), ...(note ? { note } : {}) });
  s.shared.spends = [
    spend(0, 27000, 1, 'Аренда'),
    spend(1, 6400, 3, 'Продукты'),
    spend(1, 5100, 9),
    spend(2, 2300, 4, 'Проездной'),
    spend(4, 10400, 11, 'Концерт'),
    spend(5, 1900, 8),
    {
      ...spend(1, 1248.4, 13),
      title: 'Пятёрочка',
      items: [
        { name: 'Молоко 3,2% 1 л', price: 89.99 },
        { name: 'Хлеб Бородинский', price: 52.5 },
        { name: 'Сыр Российский 200 г', price: 219.9 },
        { name: 'Куриное филе 1 кг', price: 489 },
        { name: 'Бананы 1,2 кг', price: 155.01 },
        { name: 'Кофе молотый', price: 242 },
      ],
    },
  ];
  const sub = (name: string, icon: string, amount: number, offset: number, catName: string, period: 'month' | 'year' = 'month') =>
    rec({ name, icon, amount, next: dayKey(addDays(today, offset)), period, catName });
  s.shared.subs = [
    sub('Интернет', 'wifi', 650, -1, 'Связь'),
    sub('Мобильная связь', 'phone', 500, 2, 'Связь'),
    sub('Яндекс Плюс', 'sparkle', 399, 9, 'Развлечения'),
    sub('Облако', 'cloud', 1490, 120, 'Связь', 'year'),
  ];

  const shift = (d: number, type: 'd' | 'n') => rec({ date: day(d), type, pay: type === 'd' ? 4500 : 5200, h: 12 });
  s.personal.shifts = [shift(2, 'd'), shift(3, 'd'), shift(6, 'n'), shift(7, 'n'), shift(10, 'd'), shift(14, 'n'), shift(15, 'd'), shift(21, 'n')];

  const task = (offset: number, title: string, desc: string, done = false) =>
    rec({ title, desc, due: dayKey(addDays(today, offset)), done });
  s.personal.tasks = [
    task(0, 'Оплатить интернет', 'Тариф 650 ₽, списать с карты Т-Банка до вечера', true),
    task(0, 'Забрать посылку', 'Пункт Ozon на Ленина, 12 — код 4821, работает до 21:00'),
    task(1, 'Позвонить в автосалон', 'Узнать про тест-драйв Panamera и условия трейд-ина'),
    task(3, 'Отложить на мечту', 'Перевести 15 000 ₽ на накопительный счёт после смены'),
    task(-2, 'Сдать отчёт по сменам', 'Отправить табель за первую половину месяца бригадиру'),
  ];
  s.personal.plan = 15;
  s.personal.settings = { botLink: '' };
  return s;
}
