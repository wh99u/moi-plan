import { afterEach, describe, expect, test, vi } from 'vitest';
import { AiError, drawProduct, explain, parseShotRead, readShotAi, shotPrompt } from './ai';

afterEach(() => vi.unstubAllGlobals());

describe('reading Gemini answers', () => {
  test('a clean answer', () => {
    expect(parseShotRead('{"title":"Coca-Cola 0,33 л","price":89,"category":"Еда и напитки","shop":null,"note":"Газированный напиток в банке","render":"a plain red aluminum soda can"}')).toEqual({
      title: 'Coca-Cola 0,33 л',
      price: 89,
      category: 'Еда и напитки',
      shop: undefined,
      note: 'Газированный напиток в банке',
      render: 'a plain red aluminum soda can',
    });
  });

  test('fenced JSON, price as text, «null» strings', () => {
    expect(parseShotRead('```json\n{"title":"Куртка","price":"12 990","category":"Одежда","shop":"null","render":"a plain black puffer jacket"}\n```')).toMatchObject({ title: 'Куртка', price: 12990, shop: undefined });
  });

  test('missing what matters → nothing', () => {
    expect(parseShotRead('{"title":"Куртка"}')).toBeNull();
    expect(parseShotRead('не JSON')).toBeNull();
  });

  test('the prompt offers the user categories first, without repeats', () => {
    const p = shotPrompt(['Техника', 'Для машины']);
    expect(p).toContain('Техника, Для машины, Одежда');
    expect(p.match(/Техника/g)).toHaveLength(1);
  });

  test('errors in plain words', () => {
    expect(explain(400, 'User location is not supported for the API use.')).toMatch(/VPN/);
    expect(explain(400, 'API key not valid. Please pass a valid API key.')).toMatch(/Ключ/);
    expect(explain(429, 'Resource exhausted')).toMatch(/Лимит/);
  });
});

describe('talking to Gemini', () => {
  const ok = (parts: object[]) => new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });

  test('the key goes in a header, not the address; an unknown model falls through to the next', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return calls.length === 1 ? new Response('{"error":{"message":"not found"}}', { status: 404 }) : ok([{ inlineData: { mimeType: 'image/png', data: btoa('png') } }]);
      }),
    );
    const blob = await drawProduct('a plain red aluminum soda can', 'SECRET');
    expect(blob.type).toBe('image/png');
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('gemini-2.5-flash-image');
    expect(calls[1].url).toContain('gemini-3.1-flash-image-preview');
    expect(calls.every((c) => !c.url.includes('SECRET'))).toBe(true);
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET');
    expect(String(calls[0].init.body)).toContain('Pure white seamless background');
  });

  test('a refused country stops at once with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"User location is not supported for the API use."}}', { status: 400 })));
    await expect(readShotAi(new Blob(['x'], { type: 'image/png' }), 'K', [])).rejects.toThrow(AiError);
    await expect(readShotAi(new Blob(['x'], { type: 'image/png' }), 'K', [])).rejects.toThrow(/VPN/);
  });

  test('a screenshot read end to end', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([{ text: '{"title":"Кока-кола","price":89,"category":"Еда и напитки","render":"a plain red can"}' }])));
    await expect(readShotAi(new Blob(['x'], { type: 'image/png' }), 'K', ['Еда и напитки'])).resolves.toMatchObject({ title: 'Кока-кола', price: 89 });
  });
});
