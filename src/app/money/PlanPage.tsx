import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { actions, useStore } from '../../lib/appStore';
import { addMonths, monthName, ymKey } from '../../lib/dates';
import { budgetSummary } from '../../lib/money';
import { visible } from '../../lib/records';
import { Icon } from '../../ui/Icon';
import { navigate } from '../route';
import { openSheet } from '../sheet';
import { EASE } from '../ui/text';
import { Amt } from './Amt';
import { formatMoney, useCurrency } from './currency';
import { donutSegments, monthTxs, PLAN_TONES, unassigned } from './logic';
import './money.css';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const R = 43;
/** Space between the arcs, in units of a ring of 100. */
const GAP = 1.6;
const SPRING = { type: 'spring', stiffness: 200, damping: 24 } as const;

/** Budget planner: how the month's income is split between categories and how they are holding up. */
export function PlanPage() {
  const nowYm = ymKey(new Date());
  const [ym, setYm] = useState(nowYm);
  const [dir, setDir] = useState(0);
  const shift = (n: number) => {
    setDir(n);
    setYm(addMonths(ym, n));
  };

  return (
    <div className="plan">
      <section className="b-stage">
        <div className="b-hero plan-hero">
          <motion.div className="b-top" initial={{ scaleY: 0.45, opacity: 0.4 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.7, ease: EASE }}>
            <span className="b-top-glow" />
            <span className="b-top-glow b-top-glow--2" />
          </motion.div>

          <header className="b-bar">
            <motion.button type="button" className="round-btn" aria-label="Назад к бюджету" onClick={() => navigate('money')} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: EASE }} whileTap={{ scale: 0.86 }}>
              <Icon name="back" size={19} stroke={2.2} />
            </motion.button>
            <motion.h1 className="t-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5, ease: EASE }}>
              Планировщик
            </motion.h1>
            <span className="plan-bar-side" />
          </header>

          <motion.div className="b-panel plan-panel" initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.2, ...SPRING }}>
            <div className="b-month plan-month">
              <button type="button" className="b-month-btn" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>
                <Icon name="back" size={15} stroke={2.2} />
              </button>
              <span className="b-month-name t-caption">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={ym} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>
                    {capital(monthName(ym))}
                  </motion.span>
                </AnimatePresence>
              </span>
              <button type="button" className="b-month-btn" aria-label="Следующий месяц" onClick={() => shift(1)}>
                <Icon name="chevron" size={15} stroke={2.2} />
              </button>
            </div>
            <Summary ym={ym} />
          </motion.div>
        </div>
      </section>

      <motion.section className="b-feed plan-feed" initial={{ y: 160 }} animate={{ y: 0 }} transition={{ duration: 0.65, ease: EASE }}>
        <div className="b-feed-head">
          <h2 className="t-title">Категории</h2>
          <motion.button type="button" className="m-round b-feed-add" aria-label="Новая категория" onClick={() => openSheet('cat', { ym })} whileTap={{ scale: 0.86 }}>
            <Icon name="plus" size={20} />
          </motion.button>
        </div>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={ym} custom={dir} initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -28 }} transition={{ duration: 0.28, ease: EASE }}>
            <Categories ym={ym} />
          </motion.div>
        </AnimatePresence>
      </motion.section>
    </div>
  );
}

function usePlan(ym: string) {
  const month = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym));
  const incomes = useStore((s) => s.shared.incomes);
  const spends = useStore((s) => s.shared.spends);
  const s = budgetSummary(month, spends, new Date());
  const actual = monthTxs(incomes, [], ym).reduce((t, x) => t + x.amount, 0);
  return { month, spends, s, planned: s.income || actual };
}

function Summary({ ym }: { ym: string }) {
  const { s, planned } = usePlan(ym);
  const segments = donutSegments(s.cats.map((c) => c.cat.limit));
  const left = s.allocated - s.spent;
  const share = s.allocated ? Math.min(1, s.spent / s.allocated) : 0;
  const free = planned - s.allocated;

  return (
    <>
      <div className="plan-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <g transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r={R} className="plan-ring-track" pathLength={100} />
            {segments.map((g, i) => {
              const len = Math.max(0.5, g.share - GAP);
              return (
                <motion.circle
                  key={`${ym}-${s.cats[i].cat.id}`}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={PLAN_TONES[i % PLAN_TONES.length]}
                  strokeWidth="7"
                  pathLength={100}
                  strokeDashoffset={-(g.start + GAP / 2)}
                  initial={{ strokeDasharray: '0 100' }}
                  animate={{ strokeDasharray: `${len} ${100 - len}` }}
                  transition={{ delay: 0.35 + (g.start / 100) * 0.6, duration: 0.55, ease: EASE }}
                />
              );
            })}
            <circle cx="50" cy="50" r={34} className="plan-ring-inner" pathLength={100} />
            <motion.circle key={ym} cx="50" cy="50" r={34} className="plan-ring-spent" pathLength={100} initial={{ strokeDasharray: '0 100' }} animate={{ strokeDasharray: `${share * 100} ${100 - share * 100}` }} transition={{ delay: 0.6, duration: 1.1, ease: EASE }} />
          </g>
        </svg>
        <div className="plan-ring-text">
          <span className="t-caption b-quiet">{left < 0 ? 'Сверх плана' : 'Осталось'}</span>
          <span className={`plan-ring-sum${left < 0 ? ' is-over' : ''}`}>
            <Amt rub={Math.abs(left)} delay={0.45} />
          </span>
          <span className="t-caption b-quiet t-num">потрачено {Math.round(share * 100)}%</span>
        </div>
      </div>

      <div className="plan-stats">
        <motion.button type="button" className="plan-stat" onClick={() => openSheet('planIncome', { ym })} whileTap={{ scale: 0.96 }}>
          <span className="t-headline">
            <Amt rub={planned} delay={0.6} />
          </span>
          <span className="t-caption b-quiet">Доход на месяц</span>
        </motion.button>
        <div className="plan-stat">
          <span className={`t-headline${free < 0 ? ' plan-over' : ''}`}>
            <Amt rub={free} delay={0.7} />
          </span>
          <span className="t-caption b-quiet">Не распределено</span>
        </div>
      </div>
    </>
  );
}

function Categories({ ym }: { ym: string }) {
  const { month, spends, s, planned } = usePlan(ym);
  const prev = useStore((st) => visible(st.shared.budgets).find((b) => b.ym === addMonths(ym, -1)));
  const { cur, rate } = useCurrency();
  const show = (rub: number) => formatMoney(rub, cur, rate);
  const loose = unassigned(spends, month, ym);

  const fromTemplate = () => {
    actions.updateBudget(ym, { income: planned });
    actions.applyTemplate(ym);
  };

  if (!s.cats.length) {
    return (
      <div className="plan-empty">
        <p className="t-body muted">Раздели доход на части и следи, сколько осталось в каждой. Расход попадает в категорию, когда выбираешь её при добавлении операции.</p>
        <motion.button type="button" className="primary-btn" onClick={fromTemplate} whileTap={{ scale: 0.96 }}>
          Заполнить по шаблону
        </motion.button>
        {!!prev?.cats.length && (
          <motion.button type="button" className="ghost-btn" onClick={() => actions.copyBudget(prev.ym, ym)} whileTap={{ scale: 0.96 }}>
            Как в прошлом месяце
          </motion.button>
        )}
        {loose > 0 && <p className="t-caption muted t-num">Без категории потрачено {show(loose)}.</p>}
      </div>
    );
  }

  return (
    <ul className="plan-list">
      <AnimatePresence initial={true}>
        {s.cats.map(({ cat, spent, pct, over }, i) => {
          const tone = PLAN_TONES[i % PLAN_TONES.length];
          const delay = 0.15 + Math.min(i, 6) * 0.06;
          return (
            <motion.li key={cat.id} layout initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10px' }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay, duration: 0.5, ease: EASE }}>
              <motion.button type="button" className="plan-cat" onClick={() => openSheet('cat', { ym, id: cat.id })} whileTap={{ scale: 0.98 }}>
                <span className="plan-cat-top">
                  <span className="plan-cat-icon" style={{ color: tone, background: `color-mix(in srgb, ${tone} 16%, transparent)` }}>
                    <Icon name={cat.icon} size={20} />
                  </span>
                  <span className="plan-cat-name">
                    <span className="t-headline">{cat.name}</span>
                    <span className="t-caption muted t-num">
                      {show(spent)} из {cat.limit ? show(cat.limit) : 'без лимита'}
                    </span>
                  </span>
                  <span className="plan-cat-left">
                    <span className={`t-headline t-num${over ? ' plan-over' : ''}`}>{show(Math.abs(cat.limit - spent))}</span>
                    <span className="t-caption muted">{over ? 'сверх плана' : 'осталось'}</span>
                  </span>
                </span>
                <span className="plan-track">
                  <motion.span className={`plan-fill${over ? ' is-over' : ''}`} style={{ background: over ? undefined : tone }} initial={{ scaleX: 0 }} whileInView={{ scaleX: Math.min(1, pct / 100) }} viewport={{ once: true }} transition={{ delay: delay + 0.15, duration: 1, ease: EASE }} />
                </span>
              </motion.button>
            </motion.li>
          );
        })}
      </AnimatePresence>
      {loose > 0 && (
        <li className="plan-loose t-caption muted t-num">Без категории потрачено {show(loose)}. Открой операцию в списке и выбери ей категорию.</li>
      )}
    </ul>
  );
}
