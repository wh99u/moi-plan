import { describe, expect, test } from 'vitest';
import { bookmarklet, GRAB_PREFIX, grabPage, shortcutScript, type Grabbed } from './grab';
import { parsePasted, sameLink } from './paste';

function page(url: string, html: string) {
  const doc = document.implementation.createHTMLDocument('');
  doc.head.innerHTML = `<base href="${url}">`;
  doc.body.innerHTML = html;
  return doc;
}

const CART = `
  <h1>Корзина</h1>
  <div class="cart">
    <div class="line">
      <input type="checkbox" checked>
      <a href="/product/mini-proektor-nochnik-1680846582/?from=cart"><img src="https://ir.ozone.ru/s3/multimedia-1-x/wc250/7123.jpg"></a>
      <div><span>2 099 ₽</span><span>2 255 ₽</span><span>0% до 140 дней</span></div>
      <a href="/product/mini-proektor-nochnik-1680846582/">Мини-проектор, ночник с проекцией звёздного неба, 5 Вт, белый</a>
    </div>
    <div class="line">
      <input type="checkbox" checked>
      <a href="https://www.ozon.ru/product/perchatki-sapset-905/"><img src="https://ir.ozone.ru/s3/multimedia-2/wc250/88.jpg"></a>
      <div><span>817&thinsp;₽</span><s>902 ₽</s></div>
      <a href="https://www.ozon.ru/product/perchatki-sapset-905/">Перчатки рабочие, тонкие, Sapset</a>
    </div>
  </div>
  <section>
    <h2>Вам может понравиться</h2>
    <div><a href="/product/podushka-77/">Подушка 70×70</a><span>2 499 ₽</span></div>
  </section>`;

describe('reading a shop page', () => {
  test('a product page gives its structured data', () => {
    const doc = page(
      'https://www.ozon.ru/product/podushka-77/',
      `<link rel="canonical" href="https://www.ozon.ru/product/podushka-77/">
       <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Подушка для сна 70х70 см - 2 шт.","image":"https://ir.ozone.ru/s3/x/wc500/1.jpg","offers":{"@type":"Offer","price":"2499","priceCurrency":"RUB"}}</script>
       <a href="/product/other-1/">Похожий товар</a>`,
    );
    expect(grabPage(doc)).toEqual([
      { url: 'https://www.ozon.ru/product/podushka-77/', title: 'Подушка для сна 70х70 см - 2 шт.', price: 2499, image: 'https://ir.ozone.ru/s3/x/wc1000/1.jpg' },
    ]);
  });

  test('a cart gives every ticked line and skips the recommendations', () => {
    expect(grabPage(page('https://www.ozon.ru/cart', CART))).toEqual<Grabbed[]>([
      {
        url: 'https://www.ozon.ru/product/mini-proektor-nochnik-1680846582/',
        title: 'Мини-проектор, ночник с проекцией звёздного неба, 5 Вт, белый',
        price: 2099,
        image: 'https://ir.ozone.ru/s3/multimedia-1-x/wc1000/7123.jpg',
      },
      { url: 'https://www.ozon.ru/product/perchatki-sapset-905/', title: 'Перчатки рабочие, тонкие, Sapset', price: 817, image: 'https://ir.ozone.ru/s3/multimedia-2/wc1000/88.jpg' },
    ]);
  });

  test('a list without ticks gives all its tiles', () => {
    const doc = page(
      'https://www.wildberries.ru/catalog/0/search.aspx',
      `<div><div><a href="/catalog/172466373/detail.aspx?size=1"><img src="//basket-12.wbbasket.ru/1.webp" alt="Чехол на iPhone 15"></a><ins>1 290 ₽</ins></div>
       <div><a href="/catalog/98765432/detail.aspx">Кроссовки беговые</a><ins>4 990 ₽</ins></div></div>`,
    );
    expect(grabPage(doc)).toEqual([
      { url: 'https://www.wildberries.ru/catalog/172466373/detail.aspx', title: 'Чехол на iPhone 15', price: 1290, image: 'https://basket-12.wbbasket.ru/1.webp' },
      { url: 'https://www.wildberries.ru/catalog/98765432/detail.aspx', title: 'Кроссовки беговые', price: 4990, image: undefined },
    ]);
  });

  test('any other page gives its preview card', () => {
    const doc = page(
      'https://shop.example.com/item/5',
      `<meta property="og:title" content="Лампа настольная"><meta property="og:image" content="/i/lamp.png"><meta property="product:price:amount" content="3490">`,
    );
    expect(grabPage(doc)).toEqual([{ url: 'https://shop.example.com/item/5', title: 'Лампа настольная', price: 3490, image: 'https://shop.example.com/i/lamp.png' }]);
  });

  test('the shortcut script stands on its own', () => {
    const doc = page('https://www.ozon.ru/cart', CART);
    let out = '';
    new Function('completion', 'document', shortcutScript())((r: string) => (out = r), doc);
    expect(out.startsWith(GRAB_PREFIX)).toBe(true);
    expect(parsePasted(out).grabbed).toHaveLength(2);
  });

  test('the bookmark is one javascript: address', () => {
    const b = bookmarklet();
    expect(b.startsWith('javascript:')).toBe(true);
    expect(() => new Function(decodeURIComponent(b.slice('javascript:'.length)))).not.toThrow();
  });
});

describe('pasting', () => {
  test('takes the products line and the plain links around it', () => {
    const items: Grabbed[] = [{ url: 'https://www.ozon.ru/product/a-1/', title: 'Товар', price: 100, image: 'https://ir.ozone.ru/1.jpg' }];
    const text = `Смотри https://www.wildberries.ru/catalog/1/detail.aspx, и ещё https://market.yandex.ru/product/2 ${GRAB_PREFIX}${JSON.stringify(items)}`;
    expect(parsePasted(text)).toEqual({ grabbed: items, urls: ['https://www.wildberries.ru/catalog/1/detail.aspx', 'https://market.yandex.ru/product/2'] });
  });

  test('drops repeats and junk', () => {
    const text = `https://ozon.ru/product/a-1 https://www.ozon.ru/product/a-1/?utm=x ${GRAB_PREFIX}[{"url":"x","title":" "},{"url":"https://ozon.ru/p","title":"Ок","price":-5,"image":"javascript:1"}]`;
    expect(parsePasted(text)).toEqual({ grabbed: [{ url: 'https://ozon.ru/p', title: 'Ок', price: undefined, image: undefined }], urls: ['https://ozon.ru/product/a-1'] });
  });

  test('a cut-off products line still gives its links', () => {
    expect(parsePasted(`${GRAB_PREFIX}[{"url":"https://ozon.ru/product/b-2/","title":"Об`).urls).toEqual(['https://ozon.ru/product/b-2/']);
  });

  test('no links, no products', () => expect(parsePasted('Кроссовки')).toEqual({ grabbed: [], urls: [] }));

  test('one product, however it was shared', () => {
    expect(sameLink('https://www.ozon.ru/product/a-1/?sh=1')).toBe(sameLink('https://ozon.ru/product/a-1'));
  });
});
