import { describe, expect, test } from 'vitest';
import type { Buy, Car } from '../../lib/types';
import { cleanTitle, firstUrl, rublesIn, shopOf, shortTitle, wbArticle, wbShard } from './link';
import { activeWishes, boughtWishes, categoriesOf, dreamPlan, dueOf, looksLikeCar } from './logic';

describe('links', () => {
  test('finds the link inside a shared text', () => {
    expect(firstUrl('Смотри, что нашёл: https://www.wildberries.ru/catalog/172466373/detail.aspx?size=1, классный')).toBe(
      'https://www.wildberries.ru/catalog/172466373/detail.aspx?size=1',
    );
    expect(firstUrl('ozon.ru/t/AbC12')).toBe('https://ozon.ru/t/AbC12');
    expect(firstUrl('просто текст')).toBeNull();
  });

  test('names the shop', () => {
    expect(shopOf('https://www.wildberries.ru/catalog/1/detail.aspx')).toBe('Wildberries');
    expect(shopOf('https://global.wildberries.ru/catalog/1')).toBe('Wildberries');
    expect(shopOf('https://www.ozon.ru/product/x-123/')).toBe('Ozon');
    expect(shopOf('https://www.amazon.de/dp/B0')).toBe('Amazon');
    expect(shopOf('https://shop.example.com/item')).toBe('shop.example.com');
    expect(shopOf('not a link')).toBe('');
  });

  test('reads the Wildberries article', () => {
    expect(wbArticle('https://www.wildberries.ru/catalog/172466373/detail.aspx?targetUrl=GP')).toBe(172466373);
    expect(wbArticle('https://wildberries.ru/catalog/172466373')).toBe(172466373);
    expect(wbArticle('https://www.wildberries.ru/product?card=98765432')).toBe(98765432);
    expect(wbArticle('https://www.ozon.ru/catalog/172466373/')).toBeNull();
  });

  test('tidies page titles', () => {
    expect(cleanTitle('Чехол на iPhone 15 – купить в интернет-магазине Wildberries')).toBe('Чехол на iPhone 15');
    expect(cleanTitle('Amazon.com: Apple AirPods Pro : Electronics')).toBe('Apple AirPods Pro');
    expect(cleanTitle('Монитор LG 27GP850 | Купить в DNS')).toBe('Монитор LG 27GP850');
  });

  test('picks a ruble price from text', () => {
    expect(rublesIn('Куртка зимняя за 12 990 ₽ с доставкой')).toBe(12990);
    expect(rublesIn('Цена: 1499 руб.')).toBe(1499);
    expect(rublesIn('$129.99')).toBeUndefined();
  });
});

const buy = (title: string, extra: Partial<Buy> = {}): Buy => ({ id: title, updatedAt: 1, title, url: '', price: 100, ...extra });

describe('wishes', () => {
  test('nearest deadline first, undated keep their order, bought leave', () => {
    const list = [buy('Без срока 1'), buy('Через месяц', { due: '2026-11-28' }), buy('Куплено', { boughtAt: 5 }), buy('Завтра', { due: '2026-10-29' }), buy('Без срока 2')];
    expect(activeWishes(list).map((b) => b.title)).toEqual(['Завтра', 'Через месяц', 'Без срока 1', 'Без срока 2']);
    expect(boughtWishes(list).map((b) => b.title)).toEqual(['Куплено']);
  });

  test('deadline labels', () => {
    const today = new Date(2026, 9, 28);
    expect(dueOf('2026-10-29', today)).toMatchObject({ days: 1, short: 'завтра', urgent: true });
    expect(dueOf('2026-11-02', today)).toMatchObject({ short: '5 дн', long: 'через 5 дней, 2 ноября' });
    expect(dueOf('2027-01-15', today)?.short).toBe('15 янв');
    expect(dueOf('2026-10-20', today)).toMatchObject({ short: 'срок прошёл', urgent: true });
    expect(dueOf(undefined, today)).toBeNull();
  });

  test('categories by use', () => {
    expect(categoriesOf([buy('a', { category: 'Одежда' }), buy('b', { category: 'Техника' }), buy('c', { category: 'Одежда' }), buy('d')])).toEqual(['Одежда', 'Техника']);
  });
});

describe('dream', () => {
  const car: Car = { name: 'Porsche Panamera', price: 2_500_000, date: '2027-10-28', color: '#000', saved: 500_000, updatedAt: 1 };

  test('share and the monthly sum to make it in time', () => {
    const p = dreamPlan(car, new Date(2026, 9, 28));
    expect(p.share).toBeCloseTo(0.2);
    expect(p.left).toBe(2_000_000);
    expect(p.days).toBe(365);
    expect(p.perMonth).toBe(Math.ceil(2_000_000 / (365 / 30.44)));
  });

  test('no date, no monthly sum; reached stays at 100%', () => {
    expect(dreamPlan({ ...car, date: '' }, new Date()).perMonth).toBeNull();
    expect(dreamPlan({ ...car, saved: 3_000_000 }, new Date(2026, 9, 28))).toMatchObject({ share: 1, left: 0, perMonth: null });
  });

  test('cars get the drawn car', () => {
    expect(looksLikeCar('Porsche Panamera')).toBe(true);
    expect(looksLikeCar('Машина')).toBe(true);
    expect(looksLikeCar('Samsung Galaxy S25')).toBe(false);
  });
});

test('long marketplace titles get the first phrase', () => {
  expect(shortTitle('Apple 2023 MacBook Pro Laptop with Apple M2 Pro chip with 12-core CPU and 19-core GPU: 16.2-inch')).toBe('Apple 2023 MacBook Pro Laptop');
  expect(shortTitle('Куртка зимняя')).toBe('Куртка зимняя');
  expect(shortTitle('Очень длинное название товара без всяких разделителей которое никак не кончается')).toBe('Очень длинное название товара без всяких…');
});

test('Wildberries CDN shard from the article', () => {
  expect(wbShard(172466373)).toBe(12);
  expect(wbShard(14_000_000)).toBe(1);
  expect(wbShard(9_999_999_999)).toBe(48);
});
