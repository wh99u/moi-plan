import { beforeEach, describe, expect, test, vi } from 'vitest';

// Each test gets a clean store: appStore reads localStorage when the module loads.
async function load() {
  vi.resetModules();
  localStorage.clear();
  const { actions, appStore } = await import('../../lib/appStore');
  const auto = await import('./auto');
  return { actions, appStore, ...auto };
}

const T = 1_800_000_000_000;

describe('ingesting a bank message', () => {
  beforeEach(() => vi.useRealTimers());

  test('a top-up lands on the card and its balance wins', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    const bank = actions.addBank('tbank', 100);
    const r = ingestBankMessage('Пополнение, счет RUB. 15 000 ₽. Иван И. Доступно 42 350 ₽', T);
    expect(r).toMatchObject({ ok: true, text: '+15 000 ₽, Т-Банк' });
    const s = appStore.get().shared;
    expect(s.banks[0]).toMatchObject({ id: bank.id, sum: 42350 });
    expect(s.incomes[0]).toMatchObject({ amount: 15000, source: 'shortcut', note: 'Иван И' });
  });

  test('a purchase lowers the card named in the message', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    actions.addBank('tbank', 100);
    const sber = actions.addBank('sber', 1000);
    ingestBankMessage('Сбер Покупка 450р PYATEROCHKA', T);
    const s = appStore.get().shared;
    expect(s.banks.find((b) => b.id === sber.id)?.sum).toBe(550);
    expect(s.spends[0]).toMatchObject({ amount: 450, title: 'PYATEROCHKA', bankId: sber.id, auto: true });
  });

  test('undo restores the sum from before the message', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    actions.addBank('tbank', 100);
    const r = ingestBankMessage('Покупка 50р Кофе. Баланс 777р', T);
    if (!r.ok) throw new Error('not added');
    r.undo();
    const s = appStore.get().shared;
    expect(s.banks[0].sum).toBe(100);
    expect(s.spends[0].deleted).toBe(true);
  });

  test('the same message right after is ignored, later it counts again', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    actions.addBank('tbank', 1000);
    const text = 'Покупка 100р Кофе';
    expect(ingestBankMessage(text, T).ok).toBe(true);
    expect(ingestBankMessage(text, T + 1000)).toEqual({ ok: false, reason: 'repeat' });
    expect(ingestBankMessage(text, T + 3_600_000).ok).toBe(true);
    expect(appStore.get().shared.banks[0].sum).toBe(800);
  });

  test('nothing happens without a card or with an unreadable message', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    expect(ingestBankMessage('Покупка 100р Кофе', T)).toEqual({ ok: false, reason: 'nocard' });
    actions.addBank('tbank', 1000);
    expect(ingestBankMessage('Код для входа: 4821', T)).toEqual({ ok: false, reason: 'unread' });
    expect(appStore.get().shared.spends).toEqual([]);
  });
});

describe('the link from the phone', () => {
  test('reads the message out of the address', async () => {
    const { bankLinkText } = await load();
    expect(bankLinkText(`#/money?sms=${encodeURIComponent('Пополнение +500 ₽')}`)).toBe('Пополнение +500 ₽');
    expect(bankLinkText('#/money')).toBeNull();
    expect(bankLinkText('#/money?x=1')).toBeNull();
  });

  test('is handled once and leaves the address', async () => {
    const { actions, appStore, takeBankLink } = await load();
    actions.addBank('tbank', 0);
    location.hash = `#/money?sms=${encodeURIComponent('Пополнение на 500 ₽')}`;
    takeBankLink();
    takeBankLink();
    expect(location.hash).toBe('#/money');
    expect(appStore.get().shared.incomes).toHaveLength(1);
  });
});
