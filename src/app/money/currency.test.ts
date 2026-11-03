import { describe, expect, test } from 'vitest';
import { convert, formatMoney, parseUsdRate } from './currency';

const rate = { value: 80, previous: 79.5, date: '2026-11-03' };

describe('dollar rate', () => {
  test('read from the Bank of Russia answer', () => {
    expect(parseUsdRate({ Date: '2026-11-03T11:30:00+03:00', Valute: { USD: { Nominal: 1, Value: 80, Previous: 79.5 } } })).toEqual(rate);
  });
  test('an answer without it gives nothing', () => {
    expect(parseUsdRate({ Date: '2026-11-03', Valute: {} })).toBeNull();
    expect(parseUsdRate({})).toBeNull();
  });
});

describe('amounts', () => {
  test('roubles stay as they are', () => {
    expect(formatMoney(1500, 'RUB', rate)).toBe('1 500 ₽');
    expect(convert(1500, 'RUB', rate)).toBe(1500);
  });
  test('a debt has a real minus', () => {
    expect(formatMoney(-1500, 'RUB', rate)).toBe('−1 500 ₽');
    expect(formatMoney(-8000, 'USD', rate)).toBe('−100 $');
  });
  test('whole dollars by the rate', () => {
    expect(formatMoney(8040, 'USD', rate)).toBe('101\u00a0$');
    expect(formatMoney(100000, 'USD', rate)).toBe('1\u00a0250\u00a0$');
    expect(convert(8000, 'USD', rate)).toBe(100);
  });
  test('no kopecks in roubles', () => {
    expect(formatMoney(1500.6, 'RUB', rate)).toBe('1\u00a0501\u00a0₽');
  });
  test('without a rate everything stays in roubles', () => {
    expect(formatMoney(1500, 'USD', null)).toBe('1 500 ₽');
    expect(convert(1500, 'USD', null)).toBe(1500);
  });
});
