import { describe, expect, test, vi } from 'vitest';

// Each test gets a clean store: appStore reads localStorage when the module loads.
async function load() {
  vi.resetModules();
  localStorage.clear();
  const { actions, appStore } = await import('../../lib/appStore');
  const auto = await import('./auto');
  const account = await import('./account');
  return { actions, appStore, ...auto, ...account };
}

const T = 1_800_000_000_000;

describe('ingesting a bank message', () => {
  test('a top-up lands on the account and its balance wins', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    const bank = actions.addBank('tbank', 100);
    const r = ingestBankMessage('Пополнение, счет RUB. 15 000 ₽. Иван И. Доступно 42 350 ₽', T);
    expect(r).toMatchObject({ ok: true, text: '+15 000 ₽' });
    const s = appStore.get().shared;
    expect(s.banks[0]).toMatchObject({ id: bank.id, sum: 42350 });
    expect(s.incomes[0]).toMatchObject({ amount: 15000, source: 'shortcut', note: 'Иван И' });
  });

  test('the account is made on the first message', async () => {
    const { appStore, balance, ingestBankMessage } = await load();
    expect(ingestBankMessage('Пополнение на 500 ₽', T).ok).toBe(true);
    expect(appStore.get().shared.banks).toHaveLength(1);
    expect(balance()).toBe(500);
  });

  test('old cards still count: a balance sets the total', async () => {
    const { actions, balance, ingestBankMessage } = await load();
    actions.addBank('tbank', 100);
    actions.addBank('sber', 1000);
    ingestBankMessage('Покупка 50р Кофе. Баланс 5 000р', T);
    expect(balance()).toBe(5000);
  });

  test('a purchase lowers the account', async () => {
    const { actions, appStore, ingestBankMessage } = await load();
    const bank = actions.addBank('tbank', 1000);
    ingestBankMessage('Покупка 450р PYATEROCHKA', T);
    const s = appStore.get().shared;
    expect(s.banks[0].sum).toBe(550);
    expect(s.spends[0]).toMatchObject({ amount: 450, title: 'PYATEROCHKA', bankId: bank.id, auto: true });
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

  test('an unreadable message changes nothing', async () => {
    const { appStore, ingestBankMessage } = await load();
    expect(ingestBankMessage('Код для входа: 4821', T)).toEqual({ ok: false, reason: 'unread' });
    expect(appStore.get().shared.spends).toEqual([]);
    expect(appStore.get().shared.banks).toEqual([]);
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
