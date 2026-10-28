import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';
import { actions, useStore } from '../../lib/appStore';
import { addDays, dayKey } from '../../lib/dates';
import { visible } from '../../lib/records';
import type { Task } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { CapMark } from '../brand/CapMark';
import { firstName, greeting, isReturning, useProfile } from '../profile';
import { dueLabel, money, upcoming } from '../money/logic';
import { navigate } from '../route';
import { openSheet } from '../sheet';
import { toggleTheme, useTheme } from '../theme';
import { rise } from '../ui/motion';
import { CountUp, EASE, MorphText, RollingText } from '../ui/text';
import { Orb } from './Orb';

/** Re-renders on every `step` boundary of the wall clock. */
export function useNow(step = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t = 0;
    const loop = () => {
      setNow(new Date());
      t = window.setTimeout(loop, step - (Date.now() % step) + 5);
    };
    t = window.setTimeout(loop, step - (Date.now() % step) + 5);
    return () => clearTimeout(t);
  }, [step]);
  return now;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const plural = (n: number, forms: [string, string, string]) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return forms[0];
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms[1];
  return forms[2];
};

export function Home() {
  const { scrollY } = useScroll();
  const orbY = useTransform(scrollY, [0, 600], [0, 180]);
  const orbFade = useTransform(scrollY, [0, 480], [1, 0.25]);
  const textY = useTransform(scrollY, [0, 600], [0, -50]);

  return (
    <div className="home">
      <section className="hero">
        <motion.div className="hero-orb" style={{ y: orbY, opacity: orbFade }}>
          <Orb className="hero-canvas" cy={0.4} size={0.43} />
        </motion.div>
        <HeroBar />
        <motion.div className="hero-copy" style={{ y: textY }}>
          <Greeting />
          <MetaRow />
          <motion.button
            type="button"
            className="cta"
            onClick={() => openSheet('task')}
            {...rise(1.05)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="cta-shine" aria-hidden="true" />
            Новая задача
            <span className="cta-arrow">
              <Icon name="arrowRight" size={18} stroke={2} />
            </span>
          </motion.button>
        </motion.div>
      </section>

      <div className="home-cards">
        <TodayCard />
        <ReminderCard />
      </div>
    </div>
  );
}

function HeroBar() {
  const { theme } = useTheme();
  const { name, picture } = useProfile();
  return (
    <motion.header className="hero-bar" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.8, ease: EASE }}>
      <div className="brand">
        <CapMark size={40} animated />
        <span className="brand-word t-label">Мой план</span>
      </div>
      <div className="hero-actions">
        <motion.button
          type="button"
          className="round-btn"
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
          whileTap={{ scale: 0.86 }}
          whileHover={{ scale: 1.06 }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={theme}
              className="round-btn-icon"
              initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={19} />
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <motion.button
          type="button"
          className="round-btn avatar"
          aria-label="Профиль"
          onClick={() => openSheet('profile')}
          whileTap={{ scale: 0.86 }}
          whileHover={{ scale: 1.06 }}
        >
          {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : name ? <span>{name[0].toUpperCase()}</span> : <Icon name="user" size={19} />}
        </motion.button>
      </div>
    </motion.header>
  );
}

/** «С возвращением, Иван» on arrival, then it melts into «Добрый вечер, Иван». */
function Greeting() {
  const now = useNow(60_000);
  const { name } = useProfile();
  const first = firstName(name);
  const hello = greeting(now.getHours());
  const [phase, setPhase] = useState<'back' | 'hello'>(isReturning ? 'back' : 'hello');

  useEffect(() => {
    if (phase !== 'back') return;
    const t = setTimeout(() => setPhase('hello'), 3400);
    return () => clearTimeout(t);
  }, [phase]);

  // A non-breaking space keeps «С» from hanging alone on a narrow screen.
  const line = phase === 'back' ? 'С возвращением' : hello;
  return (
    <h1 className="hello t-display">
      <MorphText text={first ? `${line},` : line} delay={phase === 'back' || !isReturning ? 0.35 : 0} />
      {first && (
        <motion.button
          type="button"
          className="hello-name"
          onClick={() => openSheet('profile')}
          initial={{ opacity: 0, y: '0.4em', filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: '0em', filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
          transition={{ delay: 0.75, duration: 1, ease: EASE }}
        >
          {first}
        </motion.button>
      )}
    </h1>
  );
}

function MetaRow() {
  const now = useNow(1000);
  const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long' });
  const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dayShare = (now.getHours() * 60 + now.getMinutes()) / 1440;

  return (
    <motion.div className="meta t-caption" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.9 } } }}>
      {[
        <span key="d" className="meta-cap">
          {weekday}
        </span>,
        <span key="p" className="day-pill" title={`Прошло ${Math.round(dayShare * 100)}% дня`}>
          <motion.span className="day-pill-fill" initial={{ scaleX: 0 }} animate={{ scaleX: dayShare }} transition={{ delay: 1.2, duration: 1.4, ease: EASE }} />
        </span>,
        <span key="t">{date}</span>,
        <span key="dot" className="meta-dot" />,
        <span key="c" className="clock t-num">
          <RollingText text={hh} />
          <span className="clock-colon">:</span>
          <RollingText text={mm} />
        </span>,
      ].map((el) => (
        <motion.span
          key={el.key}
          className="meta-item"
          variants={{ hidden: { opacity: 0, y: 10, filter: 'blur(6px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE } } }}
        >
          {el}
        </motion.span>
      ))}
    </motion.div>
  );
}

function useToday() {
  const now = useNow(60_000);
  const tasks = visible(useStore((s) => s.personal.tasks));
  const today = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));
  const list = tasks
    .filter((t) => t.due === today || (!t.done && t.due < today))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due) || a.updatedAt - b.updatedAt);
  return {
    now,
    list,
    open: list.filter((t) => !t.done),
    done: list.filter((t) => t.done).length,
    late: list.filter((t) => !t.done && t.due < today),
    next: tasks.filter((t) => !t.done && t.due === tomorrow),
    today,
  };
}

function TodayCard() {
  const { list, open, done } = useToday();
  const total = list.length;
  const share = total ? done / total : 0;
  // Rows wait for the card on the first paint; ones added later appear at once.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.section className="card today" {...rise(1.15)}>
      <div className="today-head">
        <div>
          <p className="t-label card-label">Сегодня</p>
          <p className="today-count">
            <span className="t-hero-num">
              <CountUp value={open.length} delay={1.3} />
            </span>
            <span className="t-headline today-unit">{plural(open.length, ['задача', 'задачи', 'задач'])}</span>
          </p>
          <p className="t-caption muted">{total ? `${done} из ${total} готово` : 'Ничего не запланировано'}</p>
        </div>
        <Ring share={share} />
      </div>

      <ul className="today-list">
        <AnimatePresence initial={false}>
          {list.slice(0, 4).map((t, i) => (
            <TaskRow key={t.id} task={t} delay={intro ? 1.4 + i * 0.06 : 0} />
          ))}
        </AnimatePresence>
      </ul>
      {list.length > 4 && <p className="t-caption muted today-more">и ещё {list.length - 4}</p>}
      {!list.length && (
        <motion.button type="button" className="ghost-btn" onClick={() => openSheet('task')} whileTap={{ scale: 0.96 }}>
          <Icon name="plus" size={18} />
          Запланировать день
        </motion.button>
      )}
    </motion.section>
  );
}

function Ring({ share }: { share: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <svg className="ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r={R} className="ring-track" />
      <motion.circle
        cx="32"
        cy="32"
        r={R}
        className="ring-fill"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - share) }}
        transition={{ delay: 1.35, duration: 1.4, ease: EASE }}
      />
      <AnimatePresence>
        {share === 1 && (
          <motion.path
            d="M23 32.5l6 6L41 26"
            className="ring-check"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: EASE }}
          />
        )}
      </AnimatePresence>
    </svg>
  );
}

function TaskRow({ task, delay }: { task: Task; delay: number }) {
  const late = !task.done && task.due < dayKey(new Date());
  return (
    <motion.li
      layout
      className={`task${task.done ? ' is-done' : ''}`}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE, delay } }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <motion.button
        type="button"
        className="check"
        aria-pressed={task.done}
        aria-label={task.done ? `Вернуть «${task.title}»` : `Готово: «${task.title}»`}
        onClick={() => actions.toggleTask(task.id)}
        whileTap={{ scale: 0.8 }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: task.done ? 1 : 0, opacity: task.done ? 1 : 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          />
        </svg>
      </motion.button>
      <span className="task-title t-body">
        <span className="task-text">
          {task.title}
          <motion.span className="task-strike" initial={false} animate={{ scaleX: task.done ? 1 : 0 }} transition={{ duration: 0.45, ease: EASE }} />
        </span>
      </span>
      {late && <span className="tag tag--late t-label">просрочено</span>}
    </motion.li>
  );
}

function ReminderCard() {
  const { now, open, late, next } = useToday();
  const subs = useStore((s) => s.shared.subs);
  const due = upcoming(subs, now).filter((d) => d.status !== 'later');
  const h = now.getHours();
  let title: string;
  let text: string;
  let go: (() => void) | undefined;
  if (due.length) {
    const d = due[0];
    title = d.status === 'overdue' ? `Пора оплатить: ${d.sub.name}` : `${capital(dueLabel(d.days))} оплатить`;
    text = `${d.sub.name} — ${money(d.sub.amount)}${due.length > 1 ? `, и ещё ${due.length - 1}` : ''}`;
    go = () => navigate('money');
  } else if (late.length) {
    title = `${late.length} ${plural(late.length, ['просроченная задача', 'просроченные задачи', 'просроченных задач'])}`;
    text = `Начни с «${late[0].title}» — дальше пойдёт легче.`;
  } else if (open.length) {
    title = 'Не забудь';
    text = open[0].title;
  } else if (next.length) {
    title = 'Завтра';
    text = `${next[0].title}${next.length > 1 ? ` и ещё ${next.length - 1}` : ''}`;
  } else if (h >= 23 || h < 5) {
    title = 'Пора отдыхать';
    text = 'Хороший сон — половина завтрашних дел.';
  } else if (h < 12) {
    title = 'План на утро';
    text = 'Запиши три главных дела — остальное подождёт.';
  } else if (h < 18) {
    title = 'Середина дня';
    text = 'Сделай паузу на воду и пару минут без телефона.';
  } else {
    title = 'Итоги дня';
    text = 'Что сегодня получилось? Запиши, что перенести на завтра.';
  }

  return (
    <motion.section className={`card reminder${go ? ' is-link' : ''}`} {...rise(1.25)} onClick={go} whileTap={go ? { scale: 0.98 } : undefined}>
      <span className="reminder-icon">
        <motion.span
          style={{ display: 'grid', transformOrigin: '50% 10%' }}
          initial={{ rotate: 0 }}
          animate={{ rotate: [0, -16, 13, -9, 6, -3, 0] }}
          transition={{ delay: 1.8, duration: 1.1, ease: 'easeInOut' }}
        >
          <Icon name="bell" size={20} />
        </motion.span>
      </span>
      <div className="reminder-text">
        <p className="t-label card-label">Напоминание</p>
        <p className="t-headline">{title}</p>
        <p className="t-body muted">{text}</p>
      </div>
    </motion.section>
  );
}
