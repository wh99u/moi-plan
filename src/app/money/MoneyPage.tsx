import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/appStore';
import { addDays, addMonths, dayKey, daysInMonth, fmtDay, monthName, parseDay, ymKey } from '../../lib/dates';
import { visible } from '../../lib/records';
import type { Category } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { useProfile } from '../profile';
import { navigate } from '../route';
import { openSheet } from '../sheet';
import { EASE } from '../ui/text';
import { totalOf } from './account';
import { Amt } from './Amt';
import { setNotice, useNotice } from './auto';
import { formatMoney, loadRate, setCurrency, useCurrency } from './currency';
import { balanceSeries, dayWindow, incomeToday, incomeVsSpent, monthTxs, monthWindow, txDays, type Tx } from './logic';
import './money.css';
import { pickReceipt } from './scan';
import { WaveChart, type ChartPoint } from './WaveChart';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const HIDDEN_KEY = 'money_hidden';
const MASK = '••••';
const DAYS_SHOWN = 30;
const MONTHS_SHOWN = 12;
/** Currency change: the amounts are smeared first, the new ones appear under the smear. */
const SMEAR_MS = 620;
const SMEAR_SWAP = 240;

/**
 * The entrance: the red top opens, the dark panel lands, the sum counts up, the line rises as a
 * swell, then the small things pop in one by one and the list fills as it scrolls into view.
 */
const AT = { top: 0, head: 0.2, panel: 0.25, sum: 0.45, today: 0.65, chart: 0.5, tabs: 0.95, acts: 0.8, tiles: 1.15, plaque: 1.3, feedHead: 0.9, rows: 1.3 };
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

const lastDayOf = (ym: string) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;

export function MoneyPage() {
  const now = new Date();
  const today = dayKey(now);
  const nowYm = ymKey(now);
  const [ym, setYm] = useState(nowYm);
  const [mode, setMode] = useState<'days' | 'months'>('days');
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

  const total = totalOf(banks);
  const show = (rub: number) => (hidden ? MASK : formatMoney(rub, cur, rate));

  const points = useMemo<ChartPoint[]>(() => {
    if (mode === 'days') {
      const end = ym === nowYm ? today : lastDayOf(ym);
      const days = dayWindow(end, DAYS_SHOWN);
      const values = balanceSeries(incomes, spends, total, days, today);
      return days.map((d, i) => ({ key: d, label: fmtDay(d), value: values[i] }));
    }
    const end = ym > addMonths(nowYm, 1 - MONTHS_SHOWN) ? nowYm : ym;
    const months = monthWindow(end, MONTHS_SHOWN);
    const values = balanceSeries(incomes, spends, total, months.map((m) => (m === nowYm ? today : lastDayOf(m))), today);
    return months.map((m, i) => ({ key: m, label: capital(monthName(m)), value: values[i] }));
  }, [mode, ym, nowYm, today, incomes, spends, total]);

  const txs = monthTxs(incomes, spends, ym);
  const income = txs.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0);
  const spent = txs.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
  const cats = month?.cats ?? [];
  const scanNew = () => void pickReceipt().then((file) => file && openSheet('tx', { ym, file }));

  return (
    <div className={`money${smearing ? ' is-smearing' : ''}`}>
      <section className="b-stage">
        <div className="b-hero">
          <motion.div className="b-top" initial={{ scaleY: 0.45, opacity: 0.4 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ delay: AT.top, duration: 0.7, ease: EASE }}>
            <span className="b-top-glow" />
            <span className="b-top-glow b-top-glow--2" />
          </motion.div>

          <Bar />

          <motion.div className="b-panel" initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: AT.panel, type: 'spring', stiffness: 190, damping: 24 }}>
            <div className="b-panel-head">
              <div className="b-total-label t-body">
                <span>На счёте</span>
                <button type="button" className="b-eye" aria-label={hidden ? 'Показать суммы' : 'Скрыть суммы'} aria-pressed={hidden} onClick={toggleHidden}>
                  <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} />
                </button>
              </div>
              <motion.div className="b-cur" {...pop(AT.sum + 0.2)}>
                {rate && <span className="t-caption b-quiet t-num">1 $ = {rate.value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽</span>}
                <motion.button type="button" className="b-cur-btn" aria-label={cur === 'USD' ? 'Показать в рублях' : 'Показать в долларах'} onClick={() => void flipCurrency()} whileTap={{ scale: 0.84 }}>
                  <span className="b-amt">{cur === 'USD' && rate ? '$' : '₽'}</span>
                </motion.button>
              </motion.div>
            </div>

            <div className="b-sum-clip">
              <motion.button type="button" className="b-sum" aria-label="Изменить сумму на счёте" onClick={() => openSheet('balance')} initial={{ y: '105%' }} animate={{ y: '0%' }} transition={{ delay: AT.sum, duration: 0.55, ease: EASE }}>
                <Amt rub={total} hidden={hidden} delay={AT.sum} />
              </motion.button>
            </div>

            <motion.div {...drift(AT.today, 8)}>
              <TodayLine incomes={incomes} show={show} hidden={hidden} />
            </motion.div>

            <WaveChart points={points} delay={AT.chart} format={show} onPick={mode === 'months' ? (p) => setYm(p.key) : undefined} />

            <motion.div className="b-panel-foot" {...drift(AT.tabs, 8)}>
              <div className="b-tabs" role="group" aria-label="Период графика">
                {(
                  [
                    ['days', 'Дни'],
                    ['months', 'Месяцы'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" className={`b-tab t-caption${mode === id ? ' is-on' : ''}`} aria-pressed={mode === id} onClick={() => setMode(id)}>
                    {mode === id && <motion.span layoutId="b-tab-pill" className="b-tab-pill" transition={{ type: 'spring', stiffness: 460, damping: 34 }} />}
                    <span className="b-tab-text">{label}</span>
                  </button>
                ))}
              </div>
              <div className="b-month">
                <button type="button" className="b-month-btn" aria-label="Предыдущий месяц" onClick={() => setYm(addMonths(ym, -1))}>
                  <Icon name="back" size={15} stroke={2.2} />
                </button>
                <span className="b-month-name t-caption">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={ym} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>
                      {capital(monthName(ym))}
                      {ym.slice(0, 4) === nowYm.slice(0, 4) ? '' : ` ${ym.slice(0, 4)}`}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <button type="button" className="b-month-btn" aria-label="Следующий месяц" disabled={ym >= nowYm} onClick={() => setYm(addMonths(ym, 1))}>
                  <Icon name="chevron" size={15} stroke={2.2} />
                </button>
              </div>
            </motion.div>
          </motion.div>

          <div className="b-acts">
            {[
              { icon: 'plus', label: 'Операция', go: () => openSheet('tx', { ym }), main: true },
              { icon: 'receipt', label: 'Чек', go: scanNew },
              { icon: 'pie', label: 'План', go: () => navigate('plan') },
              { icon: 'bolt', label: 'Авто', go: () => openSheet('auto') },
            ].map((a, i) => (
              <motion.div key={a.label} {...pop(AT.acts + i * 0.08)}>
                <motion.button type="button" className={`b-act${a.main ? ' is-main' : ''}`} onClick={a.go} whileTap={{ scale: 0.92 }}>
                  <span className="b-act-icon" style={{ animationDelay: `${i * 0.45}s` }}>
                    <Icon name={a.icon} size={22} stroke={1.9} />
                  </span>
                  <span className="t-caption">{a.label}</span>
                </motion.button>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="b-pad">
          <div className="b-tiles">
            <motion.div className="b-tile" {...pop(AT.tiles)}>
              <span className="b-tile-icon is-in">
                <Icon name="plus" size={18} stroke={2.2} />
              </span>
              <span className="b-tile-sum">
                <Amt rub={income} hidden={hidden} delay={AT.tiles} />
              </span>
              <span className="t-caption b-quiet">Доходы за {monthName(ym)}</span>
            </motion.div>
            <motion.div className="b-tile" {...pop(AT.tiles + 0.08)}>
              <span className="b-tile-icon is-out">
                <Icon name="minus" size={18} stroke={2.2} />
              </span>
              <span className="b-tile-sum">
                <Amt rub={spent} hidden={hidden} delay={AT.tiles + 0.08} />
              </span>
              <span className="t-caption b-quiet">Расходы за {monthName(ym)}</span>
            </motion.div>
          </div>

          <motion.div {...pop(AT.plaque)}>
            <Plaque income={income} spent={spent} name={monthName(ym)} />
          </motion.div>
        </div>
      </section>

      <NoticeBar />

      <motion.section className="b-feed" initial={{ y: 180 }} animate={{ y: 0 }} transition={{ duration: 0.65, ease: EASE }}>
        {!txs.length ? (
          <motion.div key={ym} className="b-empty" {...(intro ? drift(AT.feedHead) : { initial: { opacity: 0 }, animate: { opacity: 1 } })}>
            <h2 className="t-title">Операции за {monthName(ym)}</h2>
            <p className="t-body muted b-empty-text">Здесь будет всё, что ты получил и потратил за этот месяц. Добавь первую операцию, и она появится в списке.</p>
            <motion.button type="button" className="b-add-big" aria-label="Добавить операцию" onClick={() => openSheet('tx', { ym })} whileTap={{ scale: 0.88 }}>
              <span className="b-add-ring" />
              <Icon name="plus" size={30} />
            </motion.button>
            <span className="t-caption muted">Добавить</span>
          </motion.div>
        ) : (
          <>
            <motion.div className="b-feed-head" {...drift(AT.feedHead)}>
              <h2 className="t-title">Операции за {monthName(ym)}</h2>
              <motion.button type="button" className="m-round b-feed-add" aria-label="Добавить операцию" onClick={() => openSheet('tx', { ym })} whileTap={{ scale: 0.86 }}>
                <Icon name="plus" size={20} />
              </motion.button>
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
      <motion.h1 className="t-title" {...drift(AT.head, 24)}>
        Бюджет
      </motion.h1>
      <motion.div {...pop(AT.head + 0.3)}>
        <motion.button type="button" className="round-btn avatar" aria-label="Профиль" onClick={() => openSheet('profile')} whileTap={{ scale: 0.86 }}>
          {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : name ? <span>{name[0].toUpperCase()}</span> : <Icon name="user" size={19} />}
        </motion.button>
      </motion.div>
    </header>
  );
}

/** Today's income against yesterday's. */
function TodayLine({ incomes, show, hidden }: { incomes: Parameters<typeof incomeToday>[0]; show: (rub: number) => string; hidden: boolean }) {
  const { today, pct } = incomeToday(incomes, new Date());
  if (pct === null && !today) return <p className="b-today t-caption b-quiet">Сегодня пополнений не было</p>;
  const down = pct !== null && pct < 0;
  return (
    <p className="b-today t-caption">
      <span className={`b-today-arrow${down ? ' is-down' : ''}`}>
        <Icon name="arrowRight" size={14} stroke={2.6} />
      </span>
      <span className={`t-num ${down ? 'b-minus' : 'b-plus'}`}>{pct === null ? `+${show(today)}` : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`}</span>
      <span className="b-quiet">{pct === null ? 'сегодня' : hidden ? 'к вчера' : 'к вчерашнему доходу'}</span>
    </p>
  );
}

/** How income relates to spending in the chosen month; opens the planner. */
function Plaque({ income, spent, name }: { income: number; spent: number; name: string }) {
  const pct = incomeVsSpent(income, spent);
  const text = pct === null ? (income ? `Расходов за ${name} нет` : `За ${name} операций нет`) : pct > 0 ? 'Доход выше расхода' : pct < 0 ? 'Доход ниже расхода' : 'Доход равен расходу';
  return (
    <motion.button type="button" className="b-plaque" aria-label="Открыть планировщик бюджета" onClick={() => navigate('plan')} whileTap={{ scale: 0.97 }}>
      <span className="b-plaque-sheen" aria-hidden="true" />
      <span className="b-plaque-text">
        <span className="b-plaque-pct t-num">
          {pct === null ? '—' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.round(Math.abs(pct))}%`}
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
        <span className="b-plaque-chev">
          <Icon name="chevron" size={20} stroke={2.2} />
        </span>
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
                <Row key={t.id} tx={t} catName={cats.find((c) => c.id === t.catId)?.name} show={show} delay={intro ? AT.rows + Math.min(n++, 6) * 0.06 : 0} />
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
    <motion.li
      initial={{ opacity: 0, y: 18, x: -8 }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '-10px' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ delay, duration: 0.5, ease: EASE }}
    >
      <motion.button type="button" className="b-row" onClick={() => openSheet('txView', { id: tx.id, tx: tx.kind })} whileTap={{ scale: 0.98 }}>
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
      </motion.button>
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
