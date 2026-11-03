import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useStore } from '../../lib/appStore';
import { addDays, addMonths, dayKey, fmtDay, monthName, parseDay, ymKey } from '../../lib/dates';
import { visible } from '../../lib/records';
import { Icon } from '../../ui/Icon';
import { useProfile } from '../profile';
import { openSheet } from '../sheet';
import { CountUp, EASE } from '../ui/text';
import { totalOf } from './account';
import { setNotice, useNotice } from './auto';
import { convert, formatMoney, loadRate, setCurrency, useCurrency, type Cur } from './currency';
import { monthStats, monthTxs, txDays, type Tx } from './logic';
import './money.css';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const HIDDEN_KEY = 'money_hidden';
const MASK = '••••';

/**
 * The entrance, timed from the user's reference video: the two panels close the gap, the header
 * drifts up, the sum rises from under its edge, then the small things pop in one by one and the
 * lower panel fills from the top.
 */
const AT = { panels: 0, head: 0.26, sum: 0.42, buttons: 0.6, delta: 0.76, card: 0.66, tiles: 0.98, feedHead: 0.8, rows: 1.3 };
const INTRO_MS = 2400;

const pop = (delay: number) =>
  ({
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1 },
    transition: { delay, type: 'spring', stiffness: 430, damping: 26 },
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
  const banks = useStore((s) => visible(s.shared.banks));
  const incomes = useStore((s) => s.shared.incomes);
  const spends = useStore((s) => s.shared.spends);
  const { cur, rate } = useCurrency();
  const [hidden, toggleHidden] = useHidden();
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    void loadRate();
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  const txs = monthTxs(incomes, spends, ym);
  const total = totalOf(banks);
  const stats = monthStats(txs, ym === nowYm ? total : null);
  const show = (rub: number) => (hidden ? MASK : formatMoney(rub, cur, rate));
  const dollars = cur === 'USD' && !!rate;
  const change = rate ? rate.value - rate.previous : 0;

  return (
    <div className="money">
      <motion.section
        className="b-stage"
        initial={{ clipPath: 'inset(0% 0% 42% 0% round 0px 0px 32px 32px)' }}
        animate={{ clipPath: 'inset(0% 0% 0% 0% round 0px 0px 32px 32px)', transitionEnd: { clipPath: 'none' } }}
        transition={{ delay: AT.panels, duration: 0.6, ease: EASE }}
      >
        <Bar ym={ym} nowYm={nowYm} onMonth={setYm} cur={cur} />
        <div className="b-total">
          <motion.div className="b-delta t-body" {...drift(AT.delta, 8)}>
            <Delta delta={stats.delta} pct={stats.pct} hidden={hidden} show={show} past={ym !== nowYm} />
            <button type="button" className="b-eye" aria-label={hidden ? 'Показать суммы' : 'Скрыть суммы'} aria-pressed={hidden} onClick={toggleHidden}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} />
            </button>
          </motion.div>
          <div className="b-sum-clip">
            <motion.p className="b-sum t-num" initial={{ y: '105%' }} animate={{ y: '0%' }} transition={{ delay: AT.sum, duration: 0.55, ease: EASE }}>
              {hidden ? MASK : <CountUp value={Math.round(convert(total, cur, rate))} group settled />}
              <span className="b-cur">{dollars ? '$' : '₽'}</span>
            </motion.p>
          </div>
        </div>

        <motion.div className="b-deck" initial={{ opacity: 0, y: 34, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: AT.card, type: 'spring', stiffness: 170, damping: 22 }}>
          <button type="button" className="b-card" aria-label="Изменить сумму на счёте" onClick={() => openSheet('card')}>
            <span className="b-card-shine" aria-hidden="true" />
          </button>
        </motion.div>

        <ul className="b-tiles">
          <Tile at={0} icon="coins" label="Пополнения" value={hidden ? MASK : stats.income ? `+${show(stats.income)}` : show(0)} />
          <Tile at={1} icon="card" label="Расходы" value={hidden ? MASK : stats.spent ? `−${show(stats.spent)}` : show(0)} />
          <Tile at={2} icon="clock" label={stats.lastIn ? `Последнее, ${dayLabel(stats.lastIn.date, true).toLowerCase()}` : 'Последнее пополнение'} value={stats.lastIn ? `+${show(stats.lastIn.amount)}` : 'пока нет'} />
          <Tile
            at={3}
            icon="trend"
            label="Курс доллара"
            value={rate ? formatMoney(rate.value, 'RUB', null) : 'нет связи'}
            note={change ? `${change > 0 ? '+' : '−'}${Math.abs(change).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined}
          />
        </ul>
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
            <Feed key={ym} txs={txs} show={show} intro={intro} />
          </>
        )}
      </motion.section>
    </div>
  );
}

function dayLabel(date: string, short = false) {
  const now = new Date();
  if (date === dayKey(now)) return 'Сегодня';
  if (date === dayKey(addDays(now, -1))) return 'Вчера';
  return short ? fmtDay(date) : parseDay(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function Bar({ ym, nowYm, onMonth, cur }: { ym: string; nowYm: string; onMonth: (ym: string) => void; cur: Cur }) {
  const { name, picture } = useProfile();
  const year = ym.slice(0, 4) === nowYm.slice(0, 4) ? '' : ` ${ym.slice(0, 4)}`;
  return (
    <header className="b-bar">
      <motion.div className="b-month" {...drift(AT.head, 44)}>
        <button type="button" className="b-month-btn" aria-label="Предыдущий месяц" onClick={() => onMonth(addMonths(ym, -1))}>
          <Icon name="back" size={15} stroke={2.2} />
        </button>
        <span className="t-caption b-month-name">
          {capital(monthName(ym))}
          {year}
        </span>
        <button type="button" className="b-month-btn" aria-label="Следующий месяц" disabled={ym >= nowYm} onClick={() => onMonth(addMonths(ym, 1))}>
          <Icon name="chevron" size={15} stroke={2.2} />
        </button>
      </motion.div>
      <div className="hero-actions">
        <motion.div {...pop(AT.buttons)}>
          <CurSwitch cur={cur} />
        </motion.div>
        <motion.div {...pop(AT.buttons + 0.07)}>
          <motion.button type="button" className="round-btn" aria-label="Автодобавление операций" onClick={() => openSheet('auto')} whileTap={{ scale: 0.86 }}>
            <Icon name="bolt" size={19} />
          </motion.button>
        </motion.div>
        <motion.div {...pop(AT.buttons + 0.14)}>
          <motion.button type="button" className="round-btn avatar" aria-label="Профиль" onClick={() => openSheet('profile')} whileTap={{ scale: 0.86 }}>
            {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : name ? <span>{name[0].toUpperCase()}</span> : <Icon name="user" size={19} />}
          </motion.button>
        </motion.div>
      </div>
    </header>
  );
}

function CurSwitch({ cur }: { cur: Cur }) {
  const choose = (c: Cur) => {
    if (c === cur) return;
    if (c === 'RUB') return setCurrency('RUB');
    // The tap counts at once; only a failed rate takes it back.
    setCurrency('USD');
    void loadRate().then((rate) => {
      if (rate) return;
      setCurrency('RUB');
      setNotice({ text: 'Курс доллара не загрузился. Проверь связь и попробуй ещё раз' });
    });
  };
  return (
    <div className="b-switch" role="group" aria-label="Валюта">
      {(['RUB', 'USD'] as const).map((c) => (
        <button key={c} type="button" className="b-switch-btn t-caption" aria-pressed={c === cur} aria-label={c === 'RUB' ? 'В рублях' : 'В долларах'} onClick={() => choose(c)}>
          {c === cur && <motion.span layoutId="cur-thumb" className="b-switch-thumb" transition={{ type: 'spring', stiffness: 460, damping: 34 }} />}
          <span className="b-switch-mark">{c === 'RUB' ? '₽' : '$'}</span>
        </button>
      ))}
    </div>
  );
}

function Delta({ delta, pct, hidden, show, past }: { delta: number; pct: number | null; hidden: boolean; show: (rub: number) => string; past: boolean }) {
  if (!delta) return <span className="b-quiet">{past ? 'В этом месяце не было операций' : 'В этом месяце без изменений'}</span>;
  const sign = delta > 0 ? '+' : '−';
  const tone = delta > 0 ? 'b-plus' : 'b-minus';
  const sum = `${sign}${show(Math.abs(delta))}`;
  // A share that rounds to nothing says less than the sum alone.
  if (hidden || pct === null || Math.abs(pct) < 0.05) return <span className={tone}>{sum}</span>;
  return (
    <>
      <span className={tone}>
        {sign}
        {Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
      </span>
      <span className="b-quiet">({sum})</span>
    </>
  );
}

function Tile({ at, icon, label, value, note }: { at: number; icon: string; label: string; value: string; note?: string }) {
  return (
    <motion.li className="b-tile" {...pop(AT.tiles + at * 0.08)}>
      <span className="b-tile-top">
        <Icon name={icon} size={20} />
        {note && <span className="t-caption b-quiet t-num">{note}</span>}
      </span>
      <span className="t-caption b-tile-label">{label}</span>
      <span className="t-headline t-num">{value}</span>
    </motion.li>
  );
}

/* ───────── the feed ───────── */

function Feed({ txs, show, intro }: { txs: Tx[]; show: (rub: number) => string; intro: boolean }) {
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
                <Row key={t.id} tx={t} show={show} delay={intro ? AT.rows + Math.min(n++, 8) * 0.06 : 0} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ))}
    </>
  );
}

function Row({ tx, show, delay }: { tx: Tx; show: (rub: number) => string; delay: number }) {
  const plus = tx.kind === 'in';
  const sub = plus ? (tx.title === 'Пополнение' ? '' : 'Пополнение') : tx.lines ? `Чек, позиций: ${tx.lines}` : 'Расход';
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
        <span className={`t-headline t-num b-row-sum${plus ? ' b-plus-feed' : ''}`}>
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
