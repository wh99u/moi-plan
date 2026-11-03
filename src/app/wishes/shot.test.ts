import { describe, expect, test } from 'vitest';
import { cleanMask } from './mask';
import { findPrice, fixUnits, mergeLines, nameFrom, priceFrom, priceInLines, titleFrom, type OcrLine } from './shot';

const line = (text: string, size: number, y: number, confidence = 90, x0 = 0, x1 = 500): OcrLine => ({ text, size, y, x0, x1, confidence });

describe('Ozon screenshot', () => {
  test('price digits with spacing and noise', () => {
    expect(priceFrom('798')).toBe(798);
    expect(priceFrom('3 410\n')).toBe(3410);
    expect(priceFrom('')).toBeUndefined();
  });

  test('headline: big sure letters near the top and the lines right with them', () => {
    const lines = [
      line('ДЕЗОДОРАНТ', 98, 195, 92),
      line('ДЛЯ ОБУВИ', 88, 307, 60),
      line('Аромат', 42, 418, 95),
      line('› океана', 31, 472, 91),
      line('бот', 97, 435, 7),
      line('99,9%', 84, 814, 85),
      line('АНТИБАКТЕРИАЛЬНЫЙ', 22, 924, 89),
      line('Похожие', 19, 1172, 95),
    ];
    expect(titleFrom(lines, 1232)).toBe('Дезодорант для обуви Аромат океана');
  });

  test('a clear tagline wins over a lower, shakier line', () => {
    const lines = [line('сухая + влажная уборка', 32, 250, 95), line('Очень мощный', 20, 398, 95), line('НАСАДОК', 49, 655, 50), line('В КОМПЛЕКТЕ', 17, 710, 95)];
    expect(titleFrom(lines, 1232)).toBe('Сухая + влажная уборка');
  });

  test('nothing readable, no title', () => {
    expect(titleFrom([line('5L', 90, 500), line('%%', 40, 100)], 1232)).toBeUndefined();
  });

  test('two passes: the surer line stays, but a whole line beats its fragment', () => {
    const merged = mergeLines([
      [line('уборка', 30, 250, 96, 300, 400)],
      [line('сухая + влажная уборка', 32, 250, 95, 60, 400), line('Очень мощный', 20, 398, 95)],
    ]);
    expect(merged.map((l) => l.text).sort()).toEqual(['Очень мощный', 'сухая + влажная уборка']);
  });

  test('finds the green price row and its glyphs', () => {
    const w = 100, h = 200;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < d.length; i += 4) d.set([28, 32, 37, 255], i);
    // «12 ₽»: three green glyph columns on rows 140–150.
    for (let y = 140; y <= 150; y++) for (const [a, b] of [[5, 8], [11, 14], [18, 22]]) for (let x = a; x <= b; x++) d.set([60, 210, 90, 255], (y * w + x) * 4);
    const row = findPrice({ d, w, h });
    expect(row).toEqual({ top: 140, bottom: 150, glyphs: [[5, 8], [11, 14], [18, 22]] });
  });
});

describe('mask clean-up', () => {
  const mask = (w: number, h: number, alpha: (x: number, y: number) => number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = alpha(x, y);
    return { width: w, height: h, data };
  };
  const a = (img: { width: number; data: Uint8ClampedArray }, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

  test('haze goes, the object and its soft edge stay', () => {
    const img = mask(10, 10, (x) => (x < 5 ? 255 : x === 5 ? 150 : 60));
    cleanMask(img);
    expect(a(img, 2, 2)).toBe(255);
    expect(a(img, 5, 2)).toBeGreaterThan(0);
    expect(a(img, 5, 2)).toBeLessThan(255);
    expect(a(img, 8, 2)).toBe(0);
  });

  test('scraps far smaller than the object go, cleared areas go', () => {
    const img = mask(20, 20, (x, y) => ((x < 10 && y < 10) || (x === 18 && y === 18) ? 255 : 0));
    const share = cleanMask(img, [[0, 0, 2, 2]]);
    expect(a(img, 18, 18)).toBe(0);
    expect(a(img, 0, 0)).toBe(0);
    expect(a(img, 5, 5)).toBe(255);
    expect(share).toBeCloseTo(96 / 400);
  });
});

describe('the name in the page text', () => {
  const ui = (text: string, y: number, size = 30, x0 = 38) => line(text, size, y, 90, x0, x0 + 600);

  test('the name block wins over buttons, offers and prices around it', () => {
    const lines = [
      ui('798 ₽ 1984₽ -59%', 1373, 40),
      ui('С банками ozon банк', 1430),
      ui('Мили за товары', 1500),
      ui('Постоплата', 1500, 30, 420),
      ui('0% до 140 дней', 1560),
      ui('Гель для душа мужской 3 в 1 GRASS', 1620, 34),
      ui('Milana Men таинственная Арктика, 5 n', 1662, 34),
      ui('4.9 · 12 345 отзывов', 1720, 26),
      ui('В корзину Доставим завтра', 1700, 34, 300),
    ];
    expect(nameFrom(lines)).toBe('Гель для душа мужской 3 в 1 GRASS Milana Men таинственная Арктика, 5 л');
  });

  test('only the shop interface on screen → no name', () => {
    expect(nameFrom([ui('С банками ozon банк', 1430), ui('Мили за товары', 1500), ui('0% до 140 дней', 1560), ui('Распродажа', 1620)])).toBeUndefined();
  });

  test('a price from the page text when there is no green row: the biggest one', () => {
    expect(priceInLines([ui('Цена для вас', 900, 24), ui('12 990 ₽', 960, 48), ui('15 490 ₽', 1020, 28)])).toBe(12990);
    expect(priceInLines([ui('Без цены', 900)])).toBeUndefined();
  });

  test('units read as Latin after a number go back to Russian', () => {
    expect(fixUnits('Гель для душа, 5 n')).toBe('Гель для душа, 5 л');
    expect(fixUnits('Сок 200 mn и 1 kr')).toBe('Сок 200 мл и 1 кг');
    expect(fixUnits('AirPods Pro 2')).toBe('AirPods Pro 2');
    expect(fixUnits('iPhone 15 Pro 256 GB')).toBe('iPhone 15 Pro 256 GB');
  });
});
