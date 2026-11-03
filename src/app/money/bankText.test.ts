import { describe, expect, test } from 'vitest';
import { parseBankMessage } from './bankText';

describe('money in', () => {
  test('Т-Банк', () => {
    expect(parseBankMessage('Пополнение, счет RUB. 15 000 ₽. Иван И. Доступно 42 350,50 ₽')).toEqual({ kind: 'in', amount: 15000, title: 'Иван И', balance: 42350.5 });
  });
  test('Сбер: перевод от человека', () => {
    expect(parseBankMessage('СЧЁТ1234 14:22 перевод 5000р от Ивана И. Баланс: 12 300.50р')).toEqual({ kind: 'in', amount: 5000, title: 'Ивана И', balance: 12300.5 });
  });
  test('зарплата без слова «пополнение»', () => {
    expect(parseBankMessage('MIR-1234 09:01 зачисление зарплаты 50 000р')?.kind).toBe('in');
  });
  test('Альфа: копейки и RUR', () => {
    expect(parseBankMessage('Пополнение *1234 на 5 000,00 RUR. Баланс 7 000,00 RUR')).toEqual({ kind: 'in', amount: 5000, balance: 7000 });
  });
  test('просто со знаком плюс', () => {
    expect(parseBankMessage('Т-Банк +1 200 ₽')).toEqual({ kind: 'in', amount: 1200 });
  });
});

describe('money out', () => {
  test('покупка в магазине', () => {
    expect(parseBankMessage('MIR-1234 14:22 Покупка 450р PYATEROCHKA Баланс: 12 300р')).toEqual({ kind: 'out', amount: 450, title: 'PYATEROCHKA', balance: 12300 });
  });
  test('перевод человеку, а не от него', () => {
    expect(parseBankMessage('Перевод 2 000 ₽ для Анны К. Доступно 10 000 ₽')).toEqual({ kind: 'out', amount: 2000, title: 'Анны К', balance: 10000 });
  });
  test('время и номер карты не считаются суммой', () => {
    expect(parseBankMessage('ВТБ *4821 12:45 Оплата 89,99 руб')).toEqual({ kind: 'out', amount: 89.99 });
  });
});

describe('screenshot text', () => {
  test('лишние строки экрана не мешают', () => {
    const text = 'Вторник, 3 ноября\n14:22\nТ-Банк\nПополнение на 3 500 ₽\nот Марии С.\nПогода 12°';
    expect(parseBankMessage(text)).toMatchObject({ kind: 'in', amount: 3500 });
  });
});

describe('not an operation', () => {
  test.each([
    'Код для входа: 4821. Никому не сообщайте',
    'Ваш кредитный лимит вырос',
    'Покупка прошла успешно',
    '',
  ])('%s', (text) => {
    expect(parseBankMessage(text)).toBeNull();
  });
});
