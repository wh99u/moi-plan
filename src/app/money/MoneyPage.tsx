import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/appStore';
import { addDays, addMonths, dayKey, monthName, parseDay, ymKey } from '../../lib/dates';
import { visible } from '../../lib/records';
import type { Category } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { useProfile } from '../profile';
import { navigate } from '../route';
import { openSheet } from '../sheet';
import { EASE } from '../ui/text';
import { totalOf } from './account';
import { setNotice, useNotice } from './auto';
import { Chart } from './Chart';
import { formatMoney, loadRate, moneyParts, setCurrency, useCurrency } from './currency';
import { incomeVsSpent, monthTotals, monthTxs, monthWindow, txDays, type Tx } from './logic';
import './money.css';

const HIDDEN_KEY = 'money_hidden';
const MASK = '••••';
const CHART_MONTHS = 7;
/** Currency change: the amounts are smeared first, the new ones appear under the smear. */
const SMEAR_MS = 620;
const SMEAR_SWAP = 240;

/**
 * The entrance, timed from the user's reference video: the two panels close the gap, the header
 * drifts up, the sum rises from under its edge, then the chart draws, the small things pop in one
 * by one and the lower panel fills from the top.
 */
const AT = { panels: 0, head: 0.26, sum: 0.42, chart: 0.56, tiles: 1.02, plaque: 1.2, feedHead: 0.8, rows: 1.3 };
const INTRO_MS = 2400;

const pop = (delay: number) =>
  ({
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    transition: { delay, type: 'spring', stiffness: 430, damping: 27 },
  }) as const;

const drift = (delay: number, y = 14) =>
  ({
    initial: { opacity: 0, y, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
    transition: { delay, duration: 0.55, ease: EASE },
  }) as const;

function useHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setHidden(!hidden);
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? '0' : '1');
    } catch {
      /* the choice just won't survive a reload */
    }
  };
  return [hidden, toggle] as const;
}

export function MoneyPage() {
  const nowYm = ymKey(new Date());
  const [ym, setYm] = useState(nowYm);
  const [end, setEnd] = useState(nowYm);
  const banks = useStore((s) => visible(s.shared.banks));
  const incomes = useStore((s) => s.shared.incomes);
  const spends = useStore((s) => s.shared.spends);
  const month = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym));
  const { cur, rate } = useCurrency();
  const [hidden, toggleHidden] = useHidden();
  const [intro, setIntro] = useState(true);
  const [smearing, setSmearing] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    void loadRate();
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    const pending = timers.current;
    return () => {
      clearTimeout(t);
      pending.forEach(clearTimeout);
    };
  }, []);

  const flipCurrency = async () => {
    if (smearing) return;
    const known = rate ?? (await loadRate());
    if (!known) {
      setNotice({ text: 'Курс доллара не загрузился. Проверь связь и попробуй ещё раз' });
      return;
    }
    setSmearing(true);
    timers.current.push(
      window.setTimeout(() => setCurrency(cur === 'USD' ? 'RUB' : 'USD'), SMEAR_SWAP),
      window.setTimeout(() => setSmearing(false), SMEAR_MS),
    );
  };

  /** Choosing a month at the edge of the chart brings its neighbours into view. */
  const chooseMonth = (next: string) => {
    const shown = monthWindow(end, CHART_MONTHS);
    if (next === shown[0]) setEnd(addMonths(end, -3));
    else if (next === shown[shown.length - 1] && end < nowYm) {
      const later = addMonths(end, 3);
      setEnd(later > nowYm ? nowYm : later);
    }
    setYm(next);
  };

  const totals = monthTotals(incomes, spends, monthWindow(end, CHART_MONTHS));
  const txs = monthTxs(incomes, spends, ym);
  const income = txs.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0);
  const spent = txs.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
  const net = income - spent;
  const total = totalOf(banks);
  const show = (rub: number) => (hidden ? MASK : formatMoney(rub, cur, rate));
  const dollars = cur === 'USD' && !!rate;
  const change = rate ? rate.value - rate.previous : 0;
  const cats = month?.cats ?? [];

  const big = (rub: number) => {
    if (hidden) return <span className="b-amt">{MASK}</span>;
    const p = moneyParts(rub, cur, rate);
    return (
      <span className="b-amt">
        {p.int}
        <span className="b-frac">
          ,{p.frac}
          {' '}
          {p.sym}
        </span>
      </span>
    );
  };

  return (
    <div className={`money${smearing ? ' is-smearing' : ''}`}>
      <motion.section
        className="b-stage"
        initial={{ clipPath: 'inset(0% 0% 42% 0% round 0px 0px 32px 32px)' }}
        animate={{ clipPath: 'inset(0% 0% 0% 0% round 0px 0px 32px 32px)', transitionEnd: { clipPath: 'none' } }}
        transition={{ delay: AT.panels, duration: 0.6, ease: EASE }}
      >
        <Bar />
        <div className="b-total">
          <motion.div className="b-total-label t-body" {...drift(AT.head, 30)}>
            <span>На счёте</span>
            <button type="button" className="b-eye" aria-label={hidden ? 'Показать суммы' : 'Скрыть суммы'} aria-pressed={hidden} onClick={toggleHidden}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} />
            </button>
          </motion.div>
          <div className="b-total-row">
            <div className="b-sum-clip">
              <motion.button type="button" className="b-sum t-num" aria-label="Изменить сумму на счёте" onClick={() => openSheet('balance')} initial={{ y: '105%' }} animate={{ y: '0%' }} transition={{ delay: AT.sum, duration: 0.55, ease: EASE }}>
                {big(total)}
              </motion.button>
            </div>
            <motion.div {...pop(AT.sum + 0.2)}>
              <motion.button type="button" className="round-btn b-cur-btn" aria-label={dollars ? 'Показать в рублях' : 'Показать в долларах'} onClick={() => void flipCurrency()} whileTap={{ scale: 0.86 }}>
                <span className="b-amt">{dollars ? '$' : '₽'}</span>
              </motion.button>
            </motion.div>
          </div>
          {rate && (
            <motion.p className="t-caption b-quiet b-rate t-num" {...drift(AT.sum + 0.3, 6)}>
              1 $ = {formatMoney(rate.value, 'RUB', null)}
              {change !== 0 && ` (${change > 0 ? '+' : '−'}${Math.abs(change).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} за день)`}
            </motion.p>
          )}
        </div>

        <Chart months={totals} selected={ym} onSelect={chooseMonth} bubble={hidden ? MASK : `${net < 0 ? '−' : net > 0 ? '+' : ''}${formatMoney(Math.abs(net), cur, rate)}`} delay={AT.chart} />

        <div className="b-pad">
          <div className="b-tiles">
            <motion.div className="b-tile" {...pop(AT.tiles)}>
              <span className="b-tile-icon is-in">
                <Icon name="plus" size={18} stroke={2.2} />
              </span>
              <span className="b-tile-sum t-num">{big(income)}</span>
              <span className="t-caption b-quiet">Доходы за {monthName(ym)}</span>
            </motion.div>
            <motion.div className="b-tile" {...pop(AT.tiles + 0.08)}>
              <span className="b-tile-icon is-out">
                <Icon name="minus" size={18} stroke={2.2} />
              </span>
              <span className="b-tile-sum t-num">{big(spent)}</span>
              <span className="t-caption b-quiet">Расходы за {monthName(ym)}</span>
            </motion.div>
          </div>

          <motion.div {...pop(AT.plaque)}>
            <Plaque income={income} spent={spent} monthName={monthName(ym)} />
          </motion.div>
        </div>
      </motion.section>

      <NoticeBar />

      <motion.section className="b-feed" initial={{ y: 180 }} animate={{ y: 0 }} transition={{ delay: AT.panels, duration: 0.65, ease: EASE }}>
        {!txs.length ? (
          <motion.div key={ym} className="b-empty" {...(intro ? drift(AT.feedHead) : { initial: { opacity: 0 }, animate: { opacity: 1 } })}>
            <h2 className="t-title">Операции за {monthName(ym)}</h2>
            <p className="t-body muted b-empty-text">Здесь будет всё, что ты получил и потратил за этот месяц. Добавь первую операцию, и она появится в списке.</p>
            <motion.button type="button" className="b-add-big" aria-label="Добавить операцию" onClick={() => openSheet('tx', { ym })} whileTap={{ scale: 0.88 }}>
              <Icon name="plus" size={30} />
            </motion.button>
            <span className="t-caption muted">Добавить</span>
          </motion.div>
        ) : (
          <>
            <motion.div className="b-feed-head" {...drift(AT.feedHead)}>
              <h2 className="t-title">Операции за {monthName(ym)}</h2>
              <button type="button" className="m-round b-feed-add" aria-label="Добавить операцию" onClick={() => openSheet('tx', { ym })}>
                <Icon name="plus" size={20} />
              </button>
            </motion.div>
            <Feed key={ym} txs={txs} cats={cats} show={show} intro={intro} />
          </>
        )}
      </motion.section>
    </div>
  );
}

function dayLabel(date: string) {
  const now = new Date();
  if (date === dayKey(now)) return 'Сегодня';
  if (date === dayKey(addDays(now, -1))) return 'Вчера';
  return parseDay(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function Bar() {
  const { name, picture } = useProfile();
  return (
    <header className="b-bar">
      <motion.div {...pop(AT.head + 0.3)}>
        <motion.button type="button" className="round-btn" aria-label="Автодобавление операций" onClick={() => openSheet('auto')} whileTap={{ scale: 0.86 }}>
          <Icon name="bolt" size={19} />
        </motion.button>
      </motion.div>
      <motion.h1 className="t-headline" {...drift(AT.head, 30)}>
        Бюджет
      </motion.h1>
      <motion.div {...pop(AT.head + 0.38)}>
        <motion.button type="button" className="round-btn avatar" aria-label="Профиль" onClick={() => openSheet('profile')} whileTap={{ scale: 0.86 }}>
          {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : name ? <span>{name[0].toUpperCase()}</span> : <Icon name="user" size={19} />}
        </motion.button>
      </motion.div>
    </header>
  );
}

/** How income relates to spending in the chosen month; opens the planner. */
function Plaque({ income, spent, monthName: name }: { income: number; spent: number; monthName: string }) {
  const pct = incomeVsSpent(income, spent);
  const text = pct === null ? (income ? `Расходов за ${name} нет` : `За ${name} операций нет`) : pct > 0 ? 'Доход выше расхода' : pct < 0 ? 'Доход ниже расхода' : 'Доход равен расходу';
  return (
    <motion.button type="button" className="b-plaque" aria-label="Открыть планировщик бюджета" onClick={() => navigate('plan')} whileTap={{ scale: 0.97 }}>
      <span className="b-plaque-text">
        <span className="b-plaque-pct t-num">
          {pct === null ? '—' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`}
          {!!pct && (
            <span className={`b-plaque-arrow${pct < 0 ? ' is-down' : ''}`}>
              <Icon name="arrowRight" size={17} stroke={2.4} />
            </span>
          )}
        </span>
        <span className="t-caption">{text}</span>
      </span>
      <span className="b-plaque-go">
        <span className="t-caption">Планировщик</span>
        <Icon name="chevron" size={20} stroke={2.2} />
      </span>
    </motion.button>
  );
}

/* ───────── the feed ───────── */

function Feed({ txs, cats, show, intro }: { txs: Tx[]; cats: Category[]; show: (rub: number) => string; intro: boolean }) {
  let n = 0;
  return (
    <>
      {txDays(txs).map((d) => (
        <div key={d.date} className="b-day">
          <motion.h3 className="t-caption muted b-day-head" {...drift(intro ? AT.rows + Math.min(n, 8) * 0.06 : 0, 8)}>
            {dayLabel(d.date)}
          </motion.h3>
          <ul className="b-list">
            <AnimatePresence initial={true}>
              {d.list.map((t) => (
                <Row key={t.id} tx={t} catName={cats.find((c) => c.id === t.catId)?.name} show={show} delay={intro ? AT.rows + Math.min(n++, 8) * 0.06 : 0} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ))}
    </>
  );
}

function Row({ tx, catName, show, delay }: { tx: Tx; catName?: string; show: (rub: number) => string; delay: number }) {
  const plus = tx.kind === 'in';
  const sub = plus ? (tx.title === 'Пополнение' ? '' : 'Пополнение') : `${catName ?? 'Расход'}${tx.lines ? `, в чеке позиций: ${tx.lines}` : ''}`;
  return (
    <motion.li initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ delay, duration: 0.45, ease: EASE }}>
      <button type="button" className="b-row" onClick={() => openSheet('txView', { id: tx.id, tx: tx.kind })}>
        <span className={`b-row-icon${plus ? ' is-in' : ''}`} aria-hidden="true">
          {plus ? <Icon name="plus" size={18} stroke={2.2} /> : <span className="t-headline">{tx.title[0].toUpperCase()}</span>}
        </span>
        <span className="b-row-text">
          <span className="t-body b-row-title">{tx.title}</span>
          {(sub || tx.auto) && (
            <span className="t-caption muted b-row-sub">
              {sub}
              {tx.auto && (
                <span className="b-auto" title="Добавлено само">
                  <Icon name="bolt" size={12} />
                </span>
              )}
            </span>
          )}
        </span>
        <span className={`t-headline t-num b-row-sum b-amt${plus ? ' b-plus-feed' : ''}`}>
          {plus ? '+' : '−'}
          {show(tx.amount)}
        </span>
      </button>
    </motion.li>
  );
}

const NOTICE_MS = 8000;

function NoticeBar() {
  const notice = useNotice();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div className="b-notice m-card" role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE }}>
          <Icon name="bolt" size={18} />
          <span className="t-body b-notice-text">{notice.text}</span>
          {notice.undo && (
            <button
              type="button"
              className="b-link t-caption"
              onClick={() => {
                notice.undo?.();
                setNotice(null);
              }}
            >
              Отменить
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
