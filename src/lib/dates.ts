const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day key `YYYY-MM-DD` (never via toISOString — that is UTC). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local month key `YYYY-MM`. */
export const ymKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const parseYm = (ym: string): [number, number] => {
  const [y, m] = ym.split('-').map(Number);
  return [y, m];
};

/** Local midnight of a `YYYY-MM-DD` key. */
export const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from a to b; rounding absorbs DST shifts. */
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function addMonths(ym: string, n: number) {
  const [y, m] = parseYm(ym);
  return ymKey(new Date(y, m - 1 + n, 1));
}

/** Same day `n` months later; the 31st becomes the month's last day when it is shorter. */
export function addMonthsKeepDay(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(y, m - 1 + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return dayKey(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
}

export function daysInMonth(ym: string) {
  const [y, m] = parseYm(ym);
  return new Date(y, m, 0).getDate();
}

/** Days left in the month of `today`, today included. */
export const daysLeftInMonth = (today: Date) => daysInMonth(ymKey(today)) - today.getDate() + 1;

/** «17 окт.» or, long, «17 октября 2026». */
export function fmtDay(key: string, long = false) {
  return parseDay(key).toLocaleDateString(
    'ru-RU',
    long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' },
  );
}

/** «октябрь 2026». */
export function fmtMonth(ym: string) {
  const [y, m] = parseYm(ym);
  return `${new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long' })} ${y}`;
}

/** Calendar cells for a month, Monday first; null pads the days before the 1st. */
export function monthGrid(ym: string): (string | null)[] {
  const [y, m] = parseYm(ym);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  return [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${pad(i + 1)}`)];
}

/** «пятница, 16 октября». */
export const fmtWeekday = (key: string) => parseDay(key).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

/** «октябрь» — nominative month name, also right for «на октябрь». */
export function monthName(ym: string) {
  const [y, m] = parseYm(ym);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long' });
}

/** «октябре» — prepositional month name for «в октябре». */
export function monthIn(ym: string) {
  const forms = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  return forms[parseYm(ym)[1] - 1];
}
