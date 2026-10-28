import { describe, expect, test } from 'vitest';
import { parseFiscalQr, parseReceiptText, storeHint } from './receipt';

describe('fiscal QR', () => {
  test('reads total and date', () => {
    expect(parseFiscalQr('t=20261028T1531&s=246.76&fn=7284440500123456&i=12345&fp=1234567890&n=1')).toEqual({ total: 246.76, date: '2026-10-28' });
  });
  test('accepts a link with the data in its query', () => {
    expect(parseFiscalQr('https://check.ofd.ru/rec?t=20260101T0900&s=10.00&fn=1&i=2&fp=3&n=1')).toEqual({ total: 10, date: '2026-01-01' });
  });
  test('anything else is not a receipt', () => {
    expect(parseFiscalQr('https://example.com')).toBeNull();
  });
});

describe('receipt text', () => {
  test('two-line items: the name, then «qty x price = sum»', () => {
    const r = parseReceiptText(`ООО "Агроторг"
Пятерочка
КАССОВЫЙ ЧЕК
Приход
1. Молоко Простоквашино 3.2% 1л
1 x 89.99 =89.99
2. Хлеб Бородинский
1 x 45.50 =45.50
3. Бананы весовые
0.856 x 129.99 =111.27
ИТОГ =246.76
Безналичными =246.76
НДС 10% =22.43
28.10.2026 15:31`);
    expect(r.store).toBe('Пятёрочка');
    expect(r.catName).toBe('Еда');
    expect(r.items).toEqual([
      { name: 'Молоко Простоквашино 3.2% 1л', price: 89.99 },
      { name: 'Хлеб Бородинский', price: 45.5 },
      { name: 'Бананы весовые', price: 111.27 },
    ]);
    expect(r.total).toBe(246.76);
    expect(r.date).toBe('2026-10-28');
  });

  test('one-line items with the price at the end', () => {
    const r = parseReceiptText(`МАГНИТ
Сыр Российский 200г     189,90
Яйцо С1 10шт            99,00
Вода 1.5л 2 x 35,00     70,00
ИТОГО: 358,90
Карта: 358,90`);
    expect(r.store).toBe('Магнит');
    expect(r.items).toEqual([
      { name: 'Сыр Российский 200г', price: 189.9 },
      { name: 'Яйцо С1 10шт', price: 99 },
      { name: 'Вода 1.5л', price: 70 },
    ]);
    expect(r.total).toBe(358.9);
  });

  test('OCR noise: «О» for zero, spaces before kopecks, stray bars', () => {
    const r = parseReceiptText(`Кофе зерновой | 1О99 .00
ИТОГ 1099.00`);
    expect(r.items).toEqual([{ name: 'Кофе зерновой', price: 1099 }]);
  });

  test('«@» or «©» read in place of a zero', () => {
    const r = parseReceiptText(`Бананы @.856кг 111.27
Груши ©.5кг 80.00
info@shop.ru`);
    expect(r.items).toEqual([
      { name: 'Бананы 0.856кг', price: 111.27 },
      { name: 'Груши 0.5кг', price: 80 },
    ]);
  });

  test('no total line: the items add up', () => {
    const r = parseReceiptText(`Батон 55.00
Масло 210.50`);
    expect(r.total).toBe(265.5);
    expect(r.store).toBeUndefined();
  });

  test('the total can sit on the line after «ИТОГ»', () => {
    expect(parseReceiptText('Чай 120.00\nИТОГ\n=120.00').total).toBe(120);
  });
});

test('store hint from a typed title', () => {
  expect(storeHint('пятерочка у дома')).toEqual({ store: 'Пятёрочка', catName: 'Еда' });
  expect(storeHint('аптека')).toEqual({ store: 'Аптека', catName: 'Здоровье' });
  expect(storeHint('Подарок маме')).toBeNull();
});
