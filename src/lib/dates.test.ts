import { describe, expect, test } from 'vitest';
import { addMonths, addMonthsKeepDay, dayKey, daysInMonth, daysLeftInMonth, fmtMonth, fmtWeekday, monthGrid, monthIn, monthName, ymKey } from './dates';

describe('date keys', () => {
  test('dayKey uses local calendar date with zero padding', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 9, 17, 23, 59))).toBe('2026-10-17');
  });
  test('ymKey', () => {
    expect(ymKey(new Date(2026, 9, 1))).toBe('2026-10');
  });
});

describe('month math', () => {
  test('daysInMonth handles February and leap years', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2026-10')).toBe(31);
  });
  test('daysLeftInMonth counts today', () => {
    expect(daysLeftInMonth(new Date(2026, 9, 31))).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 9, 17))).toBe(15);
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29);
  });
  test('addMonths crosses year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });
  test('fmtMonth is a lowercase russian month with year', () => {
    expect(fmtMonth('2026-10')).toBe('октябрь 2026');
  });
  test('monthGrid starts on Monday with blanks before the 1st', () => {
    const g = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
    expect(g.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(g).toHaveLength(34);
    expect(g.at(-1)).toBe('2026-10-31');
    expect(monthGrid('2026-06')[0]).toBe('2026-06-01'); // a Monday
  });
  test('fmtWeekday gives «пятница, 16 октября»', () => {
    expect(fmtWeekday('2026-10-16')).toBe('пятница, 16 октября');
  });
  test('monthName and monthIn give the forms for «на …» and «в …»', () => {
    expect(monthName('2026-05')).toBe('май');
    expect(monthIn('2026-05')).toBe('мае');
    expect(monthIn('2026-10')).toBe('октябре');
  });
});

describe('addMonthsKeepDay', () => {
  test('keeps the day of the month', () => {
    expect(addMonthsKeepDay('2026-10-15', 1)).toBe('2026-11-15');
    expect(addMonthsKeepDay('2026-12-05', 1)).toBe('2027-01-05');
    expect(addMonthsKeepDay('2026-10-20', 12)).toBe('2027-10-20');
  });
  test('the 31st falls back to the last day of a shorter month', () => {
    expect(addMonthsKeepDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsKeepDay('2028-01-31', 1)).toBe('2028-02-29');
  });
});
