import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { actions, appStore, useStore } from '../../lib/appStore';
import { addMonths, fmtDay, fmtMonth, ymKey } from '../../lib/dates';
import { budgetSummary } from '../../lib/money';
import { visible } from '../../lib/records';
import type { Category, Spend } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { openSheet } from '../sheet';
import { rise } from '../ui/motion';
import { CountUp, EASE } from '../ui/text';
import { byDay, CAT_TONES, dueLabel, money, report, subCategory, upcoming, wholeShares } from './logic';
import './money.css';
import { pickReceipt } from './scan';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SPRING = { type: 'spring', stiffness: 420, damping: 32 } as const;

/** Tone of a category from the app palette, stable by its place in the month. */
export const toneOf = (cats: Category[], id: string) => CAT_TONES[Math.max(0, cats.findIndex((c) => c.id === id)) % CAT_TONES.length];

/** Camera or gallery first, then the spend form fills itself from the photo. */
export function scanInto(ym: string) {
  void pickReceipt(true).then((f) => {
    if (!f) return;
    prepareMonth(ym);
    openSheet('spend', { ym, scan: true });
  });
}

/** A month with no categories yet borrows last month's, or starts from the template. */
export function prepareMonth(ym: string) {
  const budgets = visible(appStore.get().shared.budgets);
  if (budgets.find((b) => b.ym === ym)?.cats.length) return;
  const prev = budgets.find((b) => b.ym === addMonths(ym, -1));
  if (prev?.cats.length) actions.copyBudget(prev.ym, ym);
  else actions.applyTemplate(ym);
}

export function MoneyPage() {
  const [ym, setYm] = useState(() => ymKey(new Date()));
  const [dir, setDir] = useState(0);
  const shift = (n: number) => {
    setDir(n);
    setYm((v) => addMonths(v, n));
  };

  return (
    <div className="money">
      <motion.header className="m-head" {...rise(0.05)}>
        <div className="m-switch" role="group" aria-label="Месяц">
          <motion.button type="button" className="m-switch-btn" aria-label="Предыдущий месяц" onClick={() => shift(-1)} whileTap={{ scale: 0.85 }}>
            <Icon name="back" size={18} stroke={2.2} />
          </motion.button>
          <span className="m-switch-label">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.span
                key={ym}
                custom={dir}
                className="t-headline"
                initial={{ opacity: 0, y: dir * 12, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: dir * -12, filter: 'blur(4px)' }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                {capital(fmtMonth(ym))}
              </motion.span>
            </AnimatePresence>
          </span>
          <motion.button type="button" className="m-switch-btn" aria-label="Следующий месяц" onClick={() => shift(1)} whileTap={{ scale: 0.85 }}>
            <Icon name="chevron" size={18} stroke={2.2} />
          </motion.button>
        </div>
        <motion.button
          type="button"
          className="m-round"
          aria-label="Сканировать чек"
          onClick={() => scanInto(ym)}
          whileTap={{ scale: 0.86 }}
          whileHover={{ scale: 1.06 }}
        >
          <Icon name="scan" size={20} />
        </motion.button>
      </motion.header>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={ym}
          custom={dir}
          initial={{ opacity: 0, x: dir * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -30 }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          <Month ym={ym} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Month({ ym }: { ym: string }) {
  const month = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym));
  const spends = useStore((s) => s.shared.spends);
  const now = new Date();
  const s = budgetSummary(month, spends, now);
  const monthSpent = visible(spends).filter((x) => x.ym === ym).reduce((t, x) => t + x.amount, 0);
  const plan = s.allocated || s.income;
  const left = plan - monthSpent;
  const share = plan > 0 ? Math.min(1, monthSpent / plan) : 0;

  return (
    <>
      <motion.section className="m-hero" {...rise(0.1)}>
        <div className="m-hero-glow" aria-hidden="true" />
        <p className="t-label m-hero-eyebrow">Бюджет · {fmtMonth(ym)}</p>
        <h1 className="m-hero-title">
          {plan ? (left >= 0 ? 'Можно потратить' : 'Перерасход') : 'Потрачено'}
        </h1>
        <div className="m-balance">
          <span className="t-caption m-balance-label">{plan ? (s.perDay !== null && left > 0 ? `≈ ${money(s.perDay)} в день · ${s.daysLeft} дн.` : 'Остаток на месяц') : 'Задайте доход, чтобы видеть остаток'}</span>
          <span className={`m-balance-sum${left < 0 ? ' is-over' : ''}`}>
            <CountUp value={Math.round(Math.abs(plan ? left : monthSpent))} delay={0.35} group />
            <span className="m-balance-cur">₽</span>
          </span>
          <span className="m-meter" aria-hidden="true">
            <motion.span className="m-meter-fill" initial={{ scaleX: 0 }} animate={{ scaleX: share }} transition={{ delay: 0.5, duration: 1.2, ease: EASE }} />
          </span>
        </div>
      </motion.section>

      <motion.div className="m-card m-flow" {...rise(0.18)}>
        <button type="button" className="m-flow-row" onClick={() => openSheet('budget', { ym })}>
          <span className="t-body muted">Доход за месяц</span>
          <span className="t-headline t-num">{money(s.income)}</span>
        </button>
        <div className="m-flow-row">
          <span className="t-body muted">Потрачено</span>
          <span className="t-headline t-num">{money(monthSpent)}</span>
        </div>
      </motion.div>

      <div className="m-actions">
        {[
          { icon: 'minus', small: 'Добавить', big: 'Трату', go: () => (prepareMonth(ym), openSheet('spend', { ym })) },
          { icon: 'plus', small: 'Добавить', big: 'Доход', go: () => openSheet('income', { ym }) },
          { icon: 'receipt', small: 'По фото', big: 'Чек', go: () => scanInto(ym) },
        ].map((a, i) => (
          <motion.button key={a.big} type="button" className="m-tile" onClick={a.go} {...rise(0.24 + i * 0.05)} whileTap={{ scale: 0.94 }} whileHover={{ y: -3 }}>
            <span className="m-tile-icon">
              <Icon name={a.icon} size={16} stroke={2} />
            </span>
            <span className="t-caption muted">{a.small}</span>
            <span className="t-headline">{a.big}</span>
          </motion.button>
        ))}
      </div>

      <Payments ym={ym} />
      <Report ym={ym} cats={s.cats} />
      <Plan ym={ym} cats={s.cats} />
      <History ym={ym} cats={month?.cats ?? []} />
    </>
  );
}

function Payments({ ym }: { ym: string }) {
  const subs = useStore((s) => s.shared.subs);
  const list = upcoming(subs, new Date()).slice(0, 4);
  const [paid, setPaid] = useState<string | null>(null);

  const pay = (id: string, catName: string) => {
    prepareMonth(ymKey(new Date()));
    const current = visible(appStore.get().shared.budgets).find((b) => b.ym === ymKey(new Date()));
    const cat = subCategory(current, catName);
    if (!cat) return;
    setPaid(id);
    setTimeout(() => {
      actions.paySub(id, cat.id);
      setPaid(null);
    }, 650);
  };

  return (
    <motion.section className="m-card m-pay" {...rise(0.34)}>
      <div className="m-sec-head">
        <h2 className="t-headline">Платежи и подписки</h2>
        <button type="button" className="m-link t-caption" onClick={() => openSheet('subs', { ym })}>
          {list.length ? 'Все' : 'Добавить'}
        </button>
      </div>
      {!list.length && (
        <button type="button" className="m-empty" onClick={() => openSheet('subs', { ym })}>
          <Icon name="bell" size={20} />
          <span className="t-body">Связь, интернет, Яндекс Плюс — напомню, когда пора платить</span>
        </button>
      )}
      <ul className="m-pay-list">
        <AnimatePresence initial={false}>
          {list.map(({ sub, days, status }, i) => (
            <motion.li
              key={sub.id}
              layout
              className={`m-pay-row is-${status}`}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 0.45 + i * 0.06, duration: 0.5, ease: EASE } }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span className="m-pay-icon">
                <Icon name={sub.icon} size={18} />
              </span>
              <span className="m-pay-text">
                <span className="t-headline">{sub.name}</span>
                <span className="t-caption m-pay-due">
                  {money(sub.amount)} · {dueLabel(days)}
                </span>
              </span>
              <motion.button
                type="button"
                className={`m-pay-btn${paid === sub.id ? ' is-paid' : ''}`}
                onClick={() => paid === null && pay(sub.id, sub.catName)}
                whileTap={{ scale: 0.9 }}
                aria-label={`Оплачено: ${sub.name}`}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {paid === sub.id ? (
                    <motion.span key="ok" initial={{ scale: 0.3, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING}>
                      <Icon name="check" size={18} stroke={2.6} />
                    </motion.span>
                  ) : (
                    <motion.span key="t" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                      Оплатить
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}

function Report({ ym, cats }: { ym: string; cats: { cat: Category; spent: number }[] }) {
  const rows = report(cats).slice(0, 6);
  const shares = wholeShares(rows.map((r) => r.share));
  const all = cats.map((c) => c.cat);
  const max = Math.max(1, ...rows.map((r) => r.share));

  return (
    <motion.section className="m-card m-report" {...rise(0.4)}>
      <div className="m-sec-head">
        <h2 className="t-headline">Куда уходят деньги</h2>
      </div>
      {!rows.length ? (
        <p className="t-body muted m-report-empty">Пока ни одной траты за этот месяц</p>
      ) : (
        <>
          <div className="m-bars">
            {rows.map((r, i) => (
              <button key={r.cat.id} type="button" className="m-bar" onClick={() => openSheet('category', { ym, id: r.cat.id })} aria-label={`${r.cat.name}: ${shares[i]}%`}>
                <span className="t-caption m-bar-pct">
                  <CountUp value={shares[i]} delay={0.55 + i * 0.07} />%
                </span>
                <span className="m-bar-track">
                  <motion.span
                    className="m-bar-fill"
                    style={{ background: toneOf(all, r.cat.id) }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: Math.max(0.04, r.share / max) }}
                    transition={{ delay: 0.55 + i * 0.07, type: 'spring', stiffness: 120, damping: 16 }}
                  />
                </span>
              </button>
            ))}
          </div>
          <ul className="m-legend">
            {rows.map((r) => (
              <li key={r.cat.id} className="t-caption">
                <span className="m-dot" style={{ background: toneOf(all, r.cat.id) }} />
                <span className="m-legend-name">{r.cat.name}</span>
                <span className="muted t-num">{money(r.spent)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </motion.section>
  );
}

function Plan({ ym, cats }: { ym: string; cats: { cat: Category; spent: number; pct: number; over: boolean }[] }) {
  const all = cats.map((c) => c.cat);
  return (
    <section className="m-plan">
      <motion.div className="m-sec-head m-sec-head--out" {...rise(0.46)}>
        <h2 className="t-title">Бюджет по категориям</h2>
      </motion.div>
      <motion.button type="button" className="m-new" onClick={() => (prepareMonth(ym), openSheet('budget', { ym }))} {...rise(0.5)} whileTap={{ scale: 0.97 }}>
        <span>
          <span className="t-caption m-new-small">{cats.length ? 'Лимиты и доход' : 'Начать'}</span>
          <span className="t-headline">{cats.length ? 'Настроить бюджет' : 'Распределить доход'}</span>
        </span>
        <span className="m-new-icon">
          <Icon name={cats.length ? 'edit' : 'plus'} size={18} />
        </span>
      </motion.button>

      {cats.map(({ cat, spent, pct, over }, i) => {
        const tone = toneOf(all, cat.id);
        const p = Math.min(100, Math.round(pct));
        return (
          <motion.button key={cat.id} type="button" className={`m-card m-goal${over ? ' is-over' : ''}`} onClick={() => openSheet('category', { ym, id: cat.id })} {...rise(0.54 + i * 0.05)} whileTap={{ scale: 0.98 }}>
            <span className="m-goal-head">
              <span className="m-dot" style={{ background: tone }} />
              <span className="t-headline">{cat.name}</span>
              <span className="t-caption muted m-goal-more">Подробнее</span>
            </span>
            <span className="m-goal-bar">
              <motion.span
                className="m-goal-fill"
                style={{ background: `linear-gradient(90deg, ${tone}55, ${tone})` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: (cat.limit ? p : spent ? 100 : 0) / 100 }}
                transition={{ delay: 0.75 + i * 0.06, duration: 1.1, ease: EASE }}
              />
              {cat.limit > 0 && <span className="m-goal-pct t-caption">{Math.round(pct)}%</span>}
            </span>
            <span className="m-goal-stats">
              <span>
                <span className="t-caption muted">Лимит</span>
                <span className="t-body t-num">{cat.limit ? money(cat.limit) : '—'}</span>
              </span>
              <span>
                <span className="t-caption muted">Потрачено</span>
                <span className="t-body t-num">{money(spent)}</span>
              </span>
              <span>
                <span className="t-caption muted">{over ? 'Сверх' : 'Осталось'}</span>
                <span className={`t-body t-num${over ? ' m-over' : ''}`}>{cat.limit ? money(Math.abs(cat.limit - spent)) : '—'}</span>
              </span>
            </span>
          </motion.button>
        );
      })}
    </section>
  );
}

function History({ ym, cats }: { ym: string; cats: Category[] }) {
  const spends = useStore((s) => s.shared.spends);
  const groups = byDay(spends, ym);
  return (
    <section className="m-history">
      <motion.div className="m-sec-head m-sec-head--out" {...rise(0.5)}>
        <h2 className="t-title">История</h2>
      </motion.div>
      {!groups.length && (
        <motion.p className="t-body muted m-history-empty" {...rise(0.55)}>
          Здесь появятся траты. Добавьте первую или сфотографируйте чек.
        </motion.p>
      )}
      {groups.map((g, gi) => (
        <motion.div key={g.date} className="m-day" {...rise(0.55 + Math.min(gi, 4) * 0.05)}>
          <div className="m-day-head t-caption">
            <span>{capital(fmtDay(g.date))}</span>
            <span className="t-num">−{money(g.total)}</span>
          </div>
          <ul className="m-card m-tx-list">
            <AnimatePresence initial={false}>
              {g.list.map((x) => (
                <TxRow key={x.id} spend={x} cats={cats} />
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      ))}
    </section>
  );
}

function TxRow({ spend, cats }: { spend: Spend; cats: Category[] }) {
  const cat = cats.find((c) => c.id === spend.catId);
  const n = spend.items?.length ?? 0;
  return (
    <motion.li layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      <button type="button" className="m-tx" onClick={() => openSheet('spendView', { ym: spend.ym, id: spend.id })}>
        <span className="m-tx-icon" style={{ color: toneOf(cats, spend.catId) }}>
          <Icon name={spend.subId ? 'repeat' : n ? 'receipt' : (cat?.icon ?? 'wallet')} size={18} />
        </span>
        <span className="m-tx-text">
          <span className="t-body m-tx-title">{spend.title || spend.note || cat?.name || 'Трата'}</span>
          <span className="t-caption muted">
            {cat?.name ?? 'Без категории'}
            {n ? ` · ${n} ${n === 1 ? 'позиция' : n < 5 ? 'позиции' : 'позиций'}` : ''}
          </span>
        </span>
        <span className="t-headline t-num m-tx-sum">−{money(spend.amount)}</span>
      </button>
    </motion.li>
  );
}
