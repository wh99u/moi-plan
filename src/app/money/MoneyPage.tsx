import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/appStore';
import { addDays, dayKey, fmtDay, monthName, parseDay, ymKey } from '../../lib/dates';
import { visible } from '../../lib/records';
import { BANK_NAMES, type Bank, type BankCode } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { useProfile } from '../profile';
import { openSheet } from '../sheet';
import { CountUp, EASE } from '../ui/text';
import { setNotice, useNotice } from './auto';
import { money, monthStats, monthTxs, txDays, type Tx } from './logic';
import './money.css';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const HIDDEN_KEY = 'money_hidden';
const MASK = '••••';

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
  const ym = ymKey(new Date());
  const banks = useStore((s) => visible(s.shared.banks)).sort((a, b) => a.order - b.order);
  const incomes = useStore((s) => s.shared.incomes);
  const spends = useStore((s) => s.shared.spends);
  const [hidden, toggleHidden] = useHidden();

  const txs = monthTxs(incomes, spends, ym);
  const total = banks.reduce((t, b) => t + b.sum, 0);
  const stats = monthStats(txs, total);
  const show = (s: string) => (hidden ? MASK : s);

  return (
    <div className="money">
      <section className="b-stage">
        <Bar month={capital(monthName(ym))} />
        <div className="b-total">
          <div className="b-delta t-body">
            <Delta delta={stats.delta} pct={stats.pct} hidden={hidden} />
            <motion.button type="button" className="b-eye" aria-label={hidden ? 'Показать суммы' : 'Скрыть суммы'} aria-pressed={hidden} onClick={toggleHidden} whileTap={{ scale: 0.82 }}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} />
            </motion.button>
          </div>
          <p className="b-sum t-num">
            {hidden ? MASK : <CountUp value={Math.round(total)} delay={0.1} group />}
            <span className="b-cur">₽</span>
          </p>
        </div>
        <Deck banks={banks} hidden={hidden} />
        <ul className="b-tiles">
          <Tile icon="coins" label="Пополнения" value={show(`${stats.income ? '+' : ''}${money(stats.income)}`)} />
          <Tile icon="card" label="Расходы" value={show(`${stats.spent ? '−' : ''}${money(stats.spent)}`)} />
          <Tile icon="clock" label={stats.lastIn ? `Последнее, ${dayLabel(stats.lastIn.date, true).toLowerCase()}` : 'Последнее пополнение'} value={stats.lastIn ? show(`+${money(stats.lastIn.amount)}`) : 'пока нет'} />
        </ul>
      </section>

      <NoticeBar />

      <section className="b-feed">
        <div className="b-feed-head">
          <h2 className="t-title">Операции за {monthName(ym)}</h2>
          <motion.button
            type="button"
            className="m-round"
            aria-label="Добавить операцию"
            onClick={() => openSheet(banks.length ? 'tx' : 'card')}
            whileTap={{ scale: 0.86 }}
          >
            <Icon name="plus" size={20} />
          </motion.button>
        </div>
        {!txs.length ? (
          <p className="t-body muted b-empty">Здесь будет всё, что ты получил и потратил в этом месяце. Добавь операцию кнопкой выше или настрой автодобавление, чтобы они появлялись сами.</p>
        ) : (
          txDays(txs).map((d) => (
            <div key={d.date} className="b-day">
              <h3 className="t-caption muted b-day-head">{dayLabel(d.date)}</h3>
              <ul className="m-card b-list">
                <AnimatePresence initial={false}>
                  {d.list.map((t) => (
                    <Row key={t.id} tx={t} bank={banks.find((b) => b.id === t.bankId)} hidden={hidden} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function dayLabel(date: string, short = false) {
  const now = new Date();
  if (date === dayKey(now)) return 'Сегодня';
  if (date === dayKey(addDays(now, -1))) return 'Вчера';
  return short ? fmtDay(date) : parseDay(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function Bar({ month }: { month: string }) {
  const { name, picture } = useProfile();
  return (
    <header className="b-bar">
      <span className="t-headline">{month}</span>
      <div className="hero-actions">
        <motion.button type="button" className="round-btn" aria-label="Автодобавление операций" onClick={() => openSheet('auto')} whileTap={{ scale: 0.86 }}>
          <Icon name="bolt" size={19} />
        </motion.button>
        <motion.button type="button" className="round-btn avatar" aria-label="Профиль" onClick={() => openSheet('profile')} whileTap={{ scale: 0.86 }}>
          {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : name ? <span>{name[0].toUpperCase()}</span> : <Icon name="user" size={19} />}
        </motion.button>
      </div>
    </header>
  );
}

function Delta({ delta, pct, hidden }: { delta: number; pct: number | null; hidden: boolean }) {
  if (!delta) return <span className="b-quiet">В этом месяце без изменений</span>;
  const sign = delta > 0 ? '+' : '−';
  const tone = delta > 0 ? 'b-plus' : 'b-minus';
  if (hidden) return <span className={tone}>{sign}{MASK}</span>;
  return (
    <>
      {pct !== null && (
        <span className={tone}>
          {sign}
          {Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
        </span>
      )}
      <span className={pct === null ? tone : 'b-quiet'}>{pct === null ? `${sign}${money(Math.abs(delta))}` : `(${sign}${money(Math.abs(delta))})`}</span>
    </>
  );
}

function Tile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <li className="b-tile">
      <Icon name={icon} size={20} />
      <span className="t-caption b-tile-label">{label}</span>
      <span className="t-headline t-num">{value}</span>
    </li>
  );
}

/* ───────── the tilted cards ───────── */

/** Oil-film colours of a card, picked so each bank is recognisable at a glance. */
const FILM: Record<BankCode, [string, string, string]> = {
  tbank: ['#b98a1e', '#a11c46', '#4a2190'],
  sber: ['#1f9e62', '#0d6f78', '#3a2a94'],
  alfa: ['#c21f3c', '#7d1456', '#3f2190'],
  vtb: ['#2467d1', '#5a2ba0', '#0d6f86'],
  ozon: ['#2850d8', '#b52a80', '#3a1f94'],
};

const SWIPE = 50;
const TILT = { rotateX: 40, rotateY: -12, rotateZ: 6, y: 0 };
const FLAT = { rotateX: 4, rotateY: 0, rotateZ: 0, y: 34 };

function Deck({ banks, hidden }: { banks: Bank[]; hidden: boolean }) {
  const [wanted, setWanted] = useState(0);
  const active = Math.min(wanted, banks.length);
  const dx = useMotionValue(0);
  const sheen = useTransform(dx, [-160, 160], ['-34%', '34%']);
  const dragged = useRef(false);

  const onEnd = (_: unknown, i: PanInfo) => {
    const dir = i.offset.x < -SWIPE || i.velocity.x < -400 ? 1 : i.offset.x > SWIPE || i.velocity.x > 400 ? -1 : 0;
    setWanted(Math.max(0, Math.min(banks.length, active + dir)));
    // The click that ends a drag must not count as a tap on the card.
    setTimeout(() => (dragged.current = false), 0);
  };
  const tap = (i: number, go: () => void) => {
    if (dragged.current) return;
    if (i === active) go();
    else setWanted(i);
  };
  const place = (i: number) => ({
    ...TILT,
    x: `${(i - active) * 90}%`,
    opacity: i < active ? 0 : i > active + 1 ? 0 : 1,
  });
  const enter = (i: number) => ({ ...FLAT, x: `${(i - active) * 90}%`, opacity: 0 });
  const spring = (i: number) => ({ type: 'spring', stiffness: 150, damping: 21, delay: 0.1 + Math.abs(i - active) * 0.08 }) as const;

  return (
    <div className="b-deck">
      <motion.div
        className="b-track"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        style={{ x: dx }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onEnd}
      >
        {banks.map((b, i) => {
          const [f1, f2, f3] = FILM[b.code];
          return (
            <motion.button
              key={b.id}
              type="button"
              className="b-card"
              style={{ '--f1': f1, '--f2': f2, '--f3': f3 } as React.CSSProperties}
              aria-label={`${BANK_NAMES[b.code]}, изменить`}
              tabIndex={Math.abs(i - active) > 1 ? -1 : 0}
              initial={enter(i)}
              animate={place(i)}
              transition={spring(i)}
              onClick={() => tap(i, () => openSheet('card', { id: b.id }))}
            >
              <motion.span className="b-card-sheen" style={{ x: sheen }} aria-hidden="true" />
              <span className="b-pill t-caption">{BANK_NAMES[b.code]}</span>
              <span className="b-pill t-caption t-num">{hidden ? MASK : money(b.sum)}</span>
            </motion.button>
          );
        })}
        <motion.button
          key="add"
          type="button"
          className="b-card b-card--add"
          initial={enter(banks.length)}
          animate={place(banks.length)}
          transition={spring(banks.length)}
          onClick={() => tap(banks.length, () => openSheet('card'))}
        >
          <span className="b-add t-headline">
            <Icon name="plus" size={20} />
            Добавить карту
          </span>
        </motion.button>
      </motion.div>
    </div>
  );
}

/* ───────── the feed ───────── */

function Row({ tx, bank, hidden }: { tx: Tx; bank?: Bank; hidden: boolean }) {
  const plus = tx.kind === 'in';
  return (
    <motion.li layout="position" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      <button type="button" className="b-row" onClick={() => openSheet('txView', { id: tx.id, tx: tx.kind })}>
        <span className={`b-row-icon${plus ? ' is-in' : ''}`} aria-hidden="true">
          {plus ? <Icon name="plus" size={18} stroke={2.2} /> : <span className="t-headline">{tx.title[0].toUpperCase()}</span>}
        </span>
        <span className="b-row-text">
          <span className="t-body b-row-title">{tx.title}</span>
          <span className="t-caption muted b-row-sub">
            {bank ? BANK_NAMES[bank.code] : 'Без карты'}
            {tx.auto && (
              <span className="b-auto" title="Добавлено само">
                <Icon name="bolt" size={12} />
              </span>
            )}
          </span>
        </span>
        <span className={`t-headline t-num b-row-sum${plus ? ' b-plus-feed' : ''}`}>
          {plus ? '+' : '−'}
          {hidden ? MASK : money(tx.amount)}
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
          {notice.needCard && (
            <button
              type="button"
              className="b-link t-caption"
              onClick={() => {
                setNotice(null);
                openSheet('card');
              }}
            >
              Добавить карту
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
