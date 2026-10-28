export type BankCode = 'alfa' | 'sber' | 'vtb' | 'tbank' | 'ozon';

export const BANK_CODES: BankCode[] = ['tbank', 'sber', 'alfa', 'vtb', 'ozon'];
export const BANK_NAMES: Record<BankCode, string> = {
  alfa: 'Альфа-Банк',
  sber: 'Сбербанк',
  vtb: 'ВТБ',
  tbank: 'Т-Банк',
  ozon: 'Озон Банк',
};

/** Every synced record carries an id and a modification time; deletes are tombstones. */
export interface Rec {
  id: string;
  updatedAt: number;
  deleted?: true;
}

export interface Bank extends Rec {
  code: BankCode;
  sum: number;
  order: number;
}

export interface Income extends Rec {
  date: string;
  amount: number;
  bankId: string;
  source: 'manual' | 'shortcut';
  note?: string;
}

export interface Car {
  name: string;
  price: number;
  date: string;
  color: string;
  imgId?: string;
  /** The photo is a cut-out on a transparent background. */
  cut?: boolean;
  /** Already put aside for it. */
  saved?: number;
  url?: string;
  updatedAt: number;
}

export interface Buy extends Rec {
  title: string;
  url: string;
  price: number;
  imgId?: string;
  tint?: string;
  /** The photo is a cut-out on a transparent background. */
  cut?: boolean;
  /** Small line above the name: «Чехлы для телефонов». */
  category?: string;
  /** One line about it, shown on its page: «Газированный напиток в банке 0,33 л». */
  note?: string;
  /** Where it is sold: «Wildberries», «Amazon». */
  shop?: string;
  /** Buy it by this day, `YYYY-MM-DD`. */
  due?: string;
  /** When it was marked as bought; such wishes leave the list. */
  boughtAt?: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  limit: number;
}

export interface BudgetMonth extends Rec {
  ym: string;
  income: number;
  cats: Category[];
}

/** One line of a receipt: «Молоко 3,2% — 89 ₽». */
export interface SpendItem {
  name: string;
  price: number;
}

export interface Spend extends Rec {
  ym: string;
  catId: string;
  amount: number;
  date: string;
  note?: string;
  /** Where the money went: «Магазин», «Пятёрочка». */
  title?: string;
  /** What exactly was bought; their sum is the amount when present. */
  items?: SpendItem[];
  /** Set when the spend is a paid subscription. */
  subId?: string;
}

export type SubPeriod = 'month' | 'year';

/** A regular payment to remember: mobile, internet, Яндекс Плюс… */
export interface Sub extends Rec {
  name: string;
  amount: number;
  icon: string;
  /** Next payment day, `YYYY-MM-DD`. */
  next: string;
  period: SubPeriod;
  /** Budget category it is paid from, by name (category ids differ between months). */
  catName: string;
}

export interface Shift extends Rec {
  date: string;
  type: 'd' | 'n';
  pay: number;
  h: number;
}

export interface Task extends Rec {
  title: string;
  desc: string;
  due: string;
  done: boolean;
}

export interface Settings {
  botLink: string;
  lastTopUpBankId?: string;
}

export interface StateV4 {
  v: 4;
  shared: {
    banks: Bank[];
    incomes: Income[];
    car: Car;
    buys: Buy[];
    budgets: BudgetMonth[];
    spends: Spend[];
    subs: Sub[];
  };
  personal: {
    shifts: Shift[];
    tasks: Task[];
    plan: number;
    settings: Settings;
    processedLaunches: string[];
  };
}
