import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { EASE } from '../ui/text';
import { chartPaths, type MonthTotal } from './logic';

const H = 172;
const TOP = 48;
const BOTTOM = 136;
/** How far below the smallest value the chart's bottom lies: months that differ a little still look different. */
const FLOOR = 0.65;
const SLIDE = { duration: 0.6, ease: EASE } as const;
const SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

interface Props {
  months: MonthTotal[];
  selected: string;
  onSelect: (ym: string) => void;
  /** Text of the bubble over the chosen month: income minus spending. */
  bubble: string;
  delay: number;
}

/** Two smooth curves, income and spending, one month chosen. The curves run edge to edge. */
export function Chart({ months, selected, onSelect, bubble, delay }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = months.flatMap((m) => [m.income, m.spent]);
  const max = Math.max(1, ...all);
  const floor = Math.min(...all) * FLOOR;
  const income = chartPaths(months.map((m) => m.income), max, w, H, TOP, BOTTOM, floor);
  const spent = chartPaths(months.map((m) => m.spent), max, w, H, TOP, BOTTOM, floor);
  const i = Math.max(0, months.findIndex((m) => m.ym === selected));
  const x = income.xs[i] ?? 0;
  const yIn = income.ys[i] ?? BOTTOM;
  const yOut = spent.ys[i] ?? BOTTOM;
  const peak = Math.min(yIn, yOut);
  const net = (months[i]?.income ?? 0) - (months[i]?.spent ?? 0);
  // The bubble stays on screen over the first and the last month.
  const half = bubble.length * 3.9 + 20;
  const bubbleX = Math.max(half, Math.min(w - half, x));

  return (
    <div ref={box} className="b-chart" style={{ height: H + 34 }}>
      {w > 0 && (
        <>
          <svg className="b-chart-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
            <defs>
              <linearGradient id="b-fill-in" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--b-in)" stopOpacity="0.2" />
                <stop offset="1" stopColor="var(--b-in)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="b-fill-out" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--b-out)" stopOpacity="0.18" />
                <stop offset="1" stopColor="var(--b-out)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[
              { p: income, fill: 'url(#b-fill-in)', stroke: 'var(--b-in)' },
              { p: spent, fill: 'url(#b-fill-out)', stroke: 'var(--b-out)' },
            ].map(({ p, fill, stroke }) => (
              <g key={stroke}>
                <motion.path initial={{ d: p.area, opacity: 0 }} animate={{ d: p.area, opacity: 1 }} transition={{ d: SLIDE, opacity: { delay: delay + 0.5, duration: 0.7 } }} fill={fill} />
                <motion.path
                  initial={{ d: p.line, pathLength: 0 }}
                  animate={{ d: p.line, pathLength: 1 }}
                  transition={{ d: SLIDE, pathLength: { delay, duration: 1.1, ease: EASE } }}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </svg>

          <motion.div className="b-chart-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.75, duration: 0.4 }}>
            <motion.span className="b-chart-band" initial={false} animate={{ x: x - 17, top: peak }} transition={SLIDE} />
            <motion.span className="b-chart-dot b-chart-dot--in" initial={false} animate={{ x: x - 6, y: yIn - 6 }} transition={SLIDE} />
            <motion.span className="b-chart-dot b-chart-dot--out" initial={false} animate={{ x: x - 6, y: yOut - 6 }} transition={SLIDE} />
            <motion.span className="b-chart-bubble-at" initial={false} animate={{ x: bubbleX, y: peak - 42 }} transition={SLIDE}>
              <span className={`b-chart-bubble t-caption t-num b-amt${net < 0 ? ' is-minus' : ''}`}>{bubble}</span>
            </motion.span>
          </motion.div>

          <div className="b-chart-months" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
            {months.map((m) => (
              <button key={m.ym} type="button" className={`b-chart-month${m.ym === selected ? ' is-on' : ''}`} aria-pressed={m.ym === selected} aria-label={`Месяц ${m.ym}`} onClick={() => onSelect(m.ym)}>
                <span className="t-caption">{SHORT[Number(m.ym.slice(5)) - 1]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
