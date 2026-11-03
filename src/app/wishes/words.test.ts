import { afterEach, describe, expect, test, vi } from 'vitest';
import { rankIcons } from './icons';
import { cleanQuery, fallbacks, toEnglish, translateByDict } from './words';

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

  test('long names fall back to simpler queries, head word before the rest', () => {
    expect(fallbacks('shoe deodorant ocean scent')).toEqual(['shoe deodorant ocean', 'shoe deodorant', 'deodorant ocean', 'deodorant', 'shoe', 'ocean']);
    expect(fallbacks('Cordless Stick Vacuum Cleaner')).toEqual(['cordless stick vacuum cleaner', 'cordless stick vacuum', 'cordless stick', 'vacuum cleaner', 'stick', 'cordless', 'vacuum', 'cleaner']);
    expect(fallbacks('sneakers')).toEqual(['sneakers']);
    expect(fallbacks('a can of soda')).toEqual(['can soda', 'soda', 'can']);
  });
});

test('icons: outlines from clean sets first, colourful sets and odd variants out', () => {
  expect(
    rankIcons([
      'mingcute:shower-gel-fill',
      'energy-icons:soda-can-20',
      'icon-park:vacuum-cleaner',
      'lucide:can-soda',
      'iconoven:soda-can-sharp',
      'iconoven:soda-can',
      'iconoven:soda-can-off',
      'lucide-extended:can-soda-duotone',
      'streamline-kameleon-color:sneakers-3',
      'tabler:jacket',
      'mingcute:shower-gel-line',
    ]),
  ).toEqual(['iconoven:soda-can', 'tabler:jacket', 'lucide:can-soda', 'mingcute:shower-gel-line', 'energy-icons:soda-can-20', 'iconoven:soda-can-sharp', 'mingcute:shower-gel-fill']);
});
