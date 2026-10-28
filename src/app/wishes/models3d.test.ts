import { afterEach, describe, expect, test, vi } from 'vitest';
import { removeSmoothBackground } from './smooth';
import { cleanQuery, fallbacks, toEnglish, toModels, translateByDict } from './models3d';

afterEach(() => vi.unstubAllGlobals());

describe('search words', () => {
  test('sizes and volumes go, words stay', () => {
    expect(cleanQuery('Coca-Cola Classic 0,33 л')).toBe('Coca Cola Classic');
    expect(cleanQuery('Гель для душа MILANA 5 л')).toBe('Гель для душа MILANA');
    expect(cleanQuery('Подарок на 5 лет сыну')).toBe('Подарок на лет сыну');
    expect(cleanQuery('Монитор 27" 165 Гц, IPS (черный)')).toBe('Монитор Гц IPS черный');
  });

  test('the dictionary knows common goods and keeps brands', () => {
    expect(translateByDict('Беспроводной пылесос Dyson')).toBe('vacuum cleaner dyson');
    expect(translateByDict('Банка газировки')).toBe('can soda');
    expect(translateByDict('Непонятное слово')).toBe('');
  });

  test('Latin names go as they are', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(toEnglish('AirPods Pro 2')).resolves.toBe('AirPods Pro');
    expect(f).not.toHaveBeenCalled();
  });

  test('the translator answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"responseData":{"translatedText":"Shower Gel"}}')));
    await expect(toEnglish('Гель для душа 5 л')).resolves.toBe('shower gel');
  });

  test('out of free translations or offline → dictionary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"responseData":{"translatedText":"MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY"}}')));
    await expect(toEnglish('Кроссовки Nike')).resolves.toBe('sneakers nike');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(toEnglish('Наушники')).resolves.toBe('headphones');
  });
});

test('Sketchfab results: a small render for the grid, a large one to cut', () => {
  const img = (width: number) => ({ url: `https://media/${width}.jpeg`, width });
  expect(
    toModels({
      results: [
        { uid: 'a', name: 'Soda Can', thumbnails: { images: [img(1920), img(64), img(256), img(720), img(1024)] } },
        { uid: 'b', name: 'No pictures', thumbnails: { images: [] } },
      ],
    }),
  ).toEqual([{ id: 'a', name: 'Soda Can', thumb: 'https://media/256.jpeg', big: 'https://media/1024.jpeg' }]);
});

describe('studio backdrop', () => {
  test('a gradient backdrop goes, the object with a sharp edge stays', () => {
    const w = 40, h = 30;
    const data = new Uint8Array(w * h * 4) as unknown as Uint8ClampedArray;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const inside = x >= 15 && x < 25 && y >= 8 && y < 22;
        // Backdrop shades from 120 to 237 grey across the picture; the object is red.
        const g = 120 + x * 3;
        data.set(inside ? [220, 30, 40, 255] : [g, g, g, 255], i);
      }
    const img = { width: w, height: h, data: new Uint8ClampedArray(data) };
    const r = removeSmoothBackground(img);
    expect(r.kept).toBeCloseTo((10 * 14) / (w * h));
    expect(img.data[(5 * w + 5) * 4 + 3]).toBe(0);
    expect(img.data[(15 * w + 20) * 4 + 3]).toBe(255);
    expect(img.data[(8 * w + 20) * 4 + 3]).toBeLessThan(255);
  });
});

test('long names fall back to simpler queries, head word before the rest', () => {
  expect(fallbacks('shoe deodorant ocean scent')).toEqual(['shoe deodorant ocean', 'shoe deodorant', 'deodorant ocean', 'deodorant', 'shoe', 'ocean']);
  expect(fallbacks('Cordless Stick Vacuum Cleaner')).toEqual(['cordless stick vacuum cleaner', 'cordless stick vacuum', 'cordless stick', 'vacuum cleaner', 'stick', 'cordless', 'vacuum', 'cleaner']);
  expect(fallbacks('sneakers')).toEqual(['sneakers']);
  expect(fallbacks('a can of soda')).toEqual(['can soda', 'soda', 'can']);
});
