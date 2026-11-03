import { motion } from 'motion/react';
import { useState } from 'react';
import { actions, useStore } from '../../lib/appStore';
import { addMonths, monthName, ymKey } from '../../lib/dates';
import { budgetSummary } from '../../lib/money';
import { visible } from '../../lib/records';
import { Icon } from '../../ui/Icon';
import { navigate } from '../route';
import { openSheet } from '../sheet';
import { EASE } from '../ui/text';
import { formatMoney, useCurrency } from './currency';
import { donutSegments, monthTxs, unassigned } from './logic';
import './money.css';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const R = 42;
/** Round caps stick out of a segment, so the gaps leave room for them. */
const GAP = 6;

/** Budget planner: how the month's income is split between categories and how they are holding up. */
export function PlanPage() {
  const nowYm = ymKey(new Date());
  const [ym, setYm] = useState(nowYm);
  const budgets = useStore((s) => visible(s.shared.budgets));
  const incomes = useStore((s) => s.shared.incomes);
  const spends = useStore((s) => s.shared.spends);
  const { cur, rate } = useCurrency();
  const show = (rub: number) => formatMoney(rub, cur, rate);

  const month = budgets.find((b) => b.ym === ym);
  const prev = budgets.find((b) => b.ym === addMonths(ym, -1));
  const s = budgetSummary(month, spends, new Date());
  const cats = s.cats;
  const loose = unassigned(spends, month, ym);
  const left = s.allocated - s.spent;
  const segments = donutSegments(cats.map((c) => c.cat.limit));
  const actual = monthTxs(incomes, [], ym).reduce((t, x) => t + x.amount, 0);
  const planned = s.income || actual;

  const fromTemplate = () => {
    actions.updateBudget(ym, { income: planned });
    actions.applyTemplate(ym);
  };

  return (
    <div className="plan">
      <header className="b-bar plan-bar">
        <motion.button type="button" className="m-round" aria-label="Назад к бюджету" onClick={() => navigate('money')} whileTap={{ scale: 0.86 }}>
          <Icon name="back" size={19} stroke={2.2} />
        </motion.button>
        <h1 className="t-headline">Планировщик</h1>
        <span className="plan-bar-side" />
      </header>

      <div className="b-month plan-month">
        <button type="button" className="b-month-btn" aria-label="Предыдущий месяц" onClick={() => setYm(addMonths(ym, -1))}>
          <Icon name="back" size={15} stroke={2.2} />
        </button>
        <span className="t-caption b-month-name">{capital(monthName(ym))}</span>
        <button type="button" className="b-month-btn" aria-label="Следующий месяц" onClick={() => setYm(addMonths(ym, 1))}>
          <Icon name="chevron" size={15} stroke={2.2} />
        </button>
      </div>

      <div className="plan-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className="plan-ring-track" pathLength={100} />
          {segments.map((g, i) => {
            const len = Math.max(0.1, g.share - GAP);
            return (
              <motion.circle
                key={cats[i].cat.id}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={cats[i].cat.color}
                strokeWidth="9"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${len} ${100 - len}`}
                strokeDashoffset={-(g.start + GAP / 2)}
                transform="rotate(-90 50 50)"
                initial={{ opacity: 0, scale: 0.86 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ transformOrigin: '50% 50%' }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.6, ease: EASE }}
              />
            );
          })}
        </svg>
        <div className="plan-ring-text">
          <span className="t-caption muted">{left < 0 ? 'Сверх плана' : 'Осталось по плану'}</span>
          <span className={`plan-ring-sum t-num${left < 0 ? ' is-over' : ''}`}>{show(Math.abs(left))}</span>
          <span className="t-caption muted t-num">из {show(s.allocated)}</span>
        </div>
      </div>

      <div className="b-tiles plan-tiles">
        <button type="button" className="b-tile plan-tile" onClick={() => openSheet('planIncome', { ym })}>
          <span className="t-headline t-num">{show(planned)}</span>
          <span className="t-caption muted">Доход на месяц</span>
        </button>
        <div className="b-tile plan-tile">
          <span className={`t-headline t-num${planned - s.allocated < 0 ? ' plan-over' : ''}`}>{planned - s.allocated < 0 ? '−' : ''}{show(Math.abs(planned - s.allocated))}</span>
          <span className="t-caption muted">Не распределено</span>
        </div>
      </div>

      <h2 className="t-title plan-head">Категории</h2>

      {!cats.length && (
        <div className="plan-empty">
          <p className="t-body muted">Раздели доход на части и следи, сколько осталось в каждой. Расходы попадают в категорию, когда выбираешь её при добавлении операции.</p>
          <motion.button type="button" className="ghost-btn" onClick={fromTemplate} whileTap={{ scale: 0.96 }}>
            Заполнить по шаблону
          </motion.button>
          {!!prev?.cats.length && (
            <motion.button type="button" className="ghost-btn" onClick={() => actions.copyBudget(prev.ym, ym)} whileTap={{ scale: 0.96 }}>
              Как в прошлом месяце
            </motion.button>
          )}
        </div>
      )}

      <ul className="plan-list">
        {cats.map(({ cat, spent, pct, over }, i) => (
          <motion.li key={cat.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + Math.min(i, 8) * 0.05, duration: 0.45, ease: EASE }}>
            <button type="button" className="plan-cat" onClick={() => openSheet('cat', { ym, id: cat.id })}>
              <span className="plan-cat-top">
                <span className="plan-cat-icon" style={{ color: cat.color }}>
                  <Icon name={cat.icon} size={20} />
                </span>
                <span className="plan-cat-name">
                  <span className="t-headline">{cat.name}</span>
                  <span className="t-caption muted t-num">Потрачено {show(spent)}</span>
                </span>
                <span className="t-headline t-num plan-cat-limit">{cat.limit ? show(cat.limit) : '—'}</span>
              </span>
              <span className="plan-bar-track">
                <motion.span className="plan-bar-fill" style={{ background: over ? 'var(--accent-hi)' : cat.color }} initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, pct / 100) }} transition={{ delay: 0.35 + Math.min(i, 8) * 0.05, duration: 0.9, ease: EASE }} />
              </span>
              <span className="plan-cat-foot t-caption t-num">
                <span className="muted">{Math.round(pct)}% плана</span>
                <span className={over ? 'plan-over' : 'muted'}>{over ? `сверх ${show(spent - cat.limit)}` : `осталось ${show(cat.limit - spent)}`}</span>
              </span>
            </button>
          </motion.li>
        ))}
        {loose > 0 && (
          <li className="plan-loose t-caption muted t-num">
            Без категории потрачено {show(loose)}. Открой операцию в списке и выбери ей категорию.
          </li>
        )}
      </ul>

      <motion.button type="button" className="plan-new" onClick={() => openSheet('cat', { ym })} whileTap={{ scale: 0.95 }}>
        <Icon name="plus" size={18} stroke={2.2} />
        Новая категория
      </motion.button>
    </div>
  );
}
