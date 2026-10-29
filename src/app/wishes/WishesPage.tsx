import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { actions, useStore } from '../../lib/appStore';
import { parseDay } from '../../lib/dates';
import { deleteImage } from '../../lib/images';
import { getLaunch, haptic } from '../../lib/telegram';
import type { Buy } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { toast } from '../../ui/Toast';
import { useImage } from '../../ui/useImage';
import { PanameraSvg } from '../../screens/dream/PanameraSvg';
import { money } from '../money/logic';
import { openSheet, useSheet, useSheetData } from '../sheet';
import { rise } from '../ui/motion';
import { CountUp, EASE } from '../ui/text';
import { importText, useImportRun } from './importer';
import { activeWishes, boughtWishes, categoriesOf, dreamPlan, dueOf, looksLikeCar, wishesTotal } from './logic';
import { artId, nameId, WishArt } from './WishCard';
import './wishes.css';

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

// Gemini was taken out (2026-10); a key saved for it on this device should not linger.
try {
  localStorage.removeItem('gemini_key_v1');
} catch {
  /* storage blocked: nothing was saved either */
}

/** Opened by the Safari shortcut: the products it read are waiting in the clipboard. */
const fromShortcut = getLaunch().param === 'wish';

/** Unticked wishes stay unticked while the app is open. */
let untickedSaved = new Set<string>();

export function WishesPage() {
  const buys = useStore((s) => s.shared.buys);
  const active = useMemo(() => activeWishes(buys), [buys]);
  const bought = useMemo(() => boughtWishes(buys), [buys]);
  const cats = useMemo(() => categoriesOf(active), [active]);
  const [cat, setCat] = useState<string | null>(null);
  const [unticked, setUnticked] = useState(untickedSaved);
  const shown = cat && cats.includes(cat) ? active.filter((b) => b.category === cat) : active;
  const ticked = shown.filter((b) => !unticked.has(b.id));
  const all = shown.length > 0 && ticked.length === shown.length;

  const untick = (next: Set<string>) => {
    untickedSaved = next;
    setUnticked(next);
  };
  const toggle = (id: string) => {
    const next = new Set(unticked);
    if (!next.delete(id)) next.add(id);
    untick(next);
  };
  const toggleAll = () => {
    const next = new Set(unticked);
    shown.forEach((b) => (all ? next.add(b.id) : next.delete(b.id)));
    untick(next);
  };

  return (
    <div className="wishes">
      <motion.header className="w-head" {...rise(0.05)}>
        <div>
          <h1 className="w-title">Желания</h1>
          <p className="t-caption muted">Мечта и всё, что хочется купить</p>
        </div>
      </motion.header>

      <motion.div {...rise(0.12)}>
        <Dream />
      </motion.div>

      {cats.length > 1 && (
        <motion.div className="w-filters" role="radiogroup" aria-label="Категория" {...rise(0.2)}>
          {[null, ...cats].map((c) => (
            <button key={c ?? 'all'} type="button" role="radio" aria-checked={cat === c} className="w-filter t-caption" onClick={() => setCat(c)}>
              {cat === c && <motion.span layoutId="w-filter-on" className="w-filter-pill" transition={SPRING} />}
              <span className="w-filter-label">{c ?? 'Все'}</span>
            </button>
          ))}
        </motion.div>
      )}

      {active.length ? (
        <motion.div className="m-card w-list" {...rise(0.24)}>
          <div className="w-list-head">
            <button type="button" className="w-all" onClick={toggleAll} aria-pressed={all}>
              <Check on={all} />
              <span className="t-body">Выбрать все</span>
            </button>
            <span className="w-sum">
              <span className="t-headline t-num">{money(wishesTotal(ticked))}</span>
              <span className="t-caption muted t-num">
                {ticked.length} из {shown.length}
              </span>
            </span>
          </div>
          <ul className="w-rows">
            <AnimatePresence initial={false}>
              {shown.map((b) => (
                <WishRow key={b.id} buy={b} ticked={!unticked.has(b.id)} onTick={() => toggle(b.id)} />
              ))}
            </AnimatePresence>
          </ul>
          <p className="t-caption muted w-hint">Свайп вправо — куплено, влево — удалить</p>
        </motion.div>
      ) : (
        <motion.div className="w-empty" {...rise(0.24)}>
          <span className="w-empty-icon">
            <Icon name="link" size={22} />
          </span>
          <span className="t-headline">Вставьте ссылку на товар</span>
          <span className="t-caption muted">Можно сразу несколько — каждая станет карточкой с названием, ценой и фото</span>
        </motion.div>
      )}

      <motion.button type="button" className="w-ozon" onClick={() => openSheet('wishImport')} whileTap={{ scale: 0.98 }} {...rise(0.28)}>
        <span className="w-ozon-icon">
          <Icon name="bag" size={18} />
        </span>
        <span className="w-ozon-text">
          <span className="t-body">Товары и корзина с Ozon</span>
          <span className="t-caption muted">Быстрая команда для Safari и закладка для компьютера</span>
        </span>
        <Icon name="chevron" size={16} />
      </motion.button>

      {bought.length > 0 && <Bought list={bought} />}

      <AddBar />
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={`w-check${on ? ' is-on' : ''}`} aria-hidden="true">
      <AnimatePresence initial={false}>
        {on && (
          <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 26 }}>
            <Icon name="check" size={14} stroke={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ───────── one wish: a row that swipes ───────── */

/** How far a row travels before letting go does something. */
const COMMIT = 96;

function markBought(buy: Buy) {
  actions.updateBuy(buy.id, { boughtAt: Date.now() });
  haptic('success');
  toast(`Куплено: ${buy.title}`, 'success', { label: 'Отменить', run: () => actions.updateBuy(buy.id, { boughtAt: undefined }) });
}

function remove(buy: Buy) {
  actions.deleteBuy(buy.id);
  haptic('warning');
  let undone = false;
  toast(`Удалено: ${buy.title}`, 'info', {
    label: 'Отменить',
    run: () => {
      undone = true;
      actions.updateBuy(buy.id, { deleted: undefined });
    },
  });
  // The photo goes once the chance to undo has passed.
  if (buy.imgId) setTimeout(() => !undone && void deleteImage(buy.imgId!).catch(() => {}), 6000);
}

function WishRow({ buy, ticked, onTick }: { buy: Buy; ticked: boolean; onTick: () => void }) {
  const img = useImage(buy.imgId);
  const due = dueOf(buy.due, new Date());
  // While its page is open the product lives there; the row keeps an empty frame.
  const sheet = useSheet();
  const sheetData = useSheetData();
  const open = sheet === 'wishView' && sheetData.id === buy.id;

  const x = useMotionValue(0);
  const moved = useRef(false);
  const armed = useRef(0);
  const buyOpacity = useTransform(x, [0, 24, COMMIT], [0, 0.6, 1]);
  const dropOpacity = useTransform(x, [-COMMIT, -24, 0], [1, 0.6, 0]);
  const buyScale = useTransform(x, [0, COMMIT], [0.6, 1]);
  const dropScale = useTransform(x, [-COMMIT, 0], [1, 0.6]);

  const onDrag = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 6) moved.current = true;
    const side = info.offset.x >= COMMIT ? 1 : info.offset.x <= -COMMIT ? -1 : 0;
    if (side !== armed.current) {
      armed.current = side;
      if (side) haptic('selection');
    }
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const side = info.offset.x >= COMMIT || info.velocity.x > 800 ? 1 : info.offset.x <= -COMMIT || info.velocity.x < -800 ? -1 : 0;
    armed.current = 0;
    if (!side) return void animate(x, 0, { type: 'spring', stiffness: 520, damping: 38 });
    void animate(x, side * window.innerWidth, { duration: 0.22, ease: 'easeIn' }).then(() => (side > 0 ? markBought(buy) : remove(buy)));
  };

  return (
    <motion.li
      layout
      className="wr"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE } }}
      transition={SPRING}
    >
      <div className="wr-under" aria-hidden="true">
        <motion.span className="wr-under-buy" style={{ opacity: buyOpacity }}>
          <motion.span style={{ scale: buyScale }}>
            <Icon name="check" size={22} stroke={2.6} />
          </motion.span>
          Куплено
        </motion.span>
        <motion.span className="wr-under-drop" style={{ opacity: dropOpacity }}>
          Удалить
          <motion.span style={{ scale: dropScale }}>
            <Icon name="trash" size={20} />
          </motion.span>
        </motion.span>
      </div>
      <motion.div
        className="wr-card"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        onDragStart={() => (moved.current = false)}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (moved.current) return void (moved.current = false);
          openSheet('wishView', { id: buy.id });
        }}
      >
        <div className="wr-art">
          {!open && (
            <motion.div className="wr-art-in" layoutId={artId(buy.id)}>
              <WishArt img={img} cut={buy.cut} title={buy.title} tint={buy.tint} />
            </motion.div>
          )}
          <button
            type="button"
            className="wr-tick"
            aria-label={ticked ? 'Не считать в сумме' : 'Считать в сумме'}
            aria-pressed={ticked}
            onClick={(e) => {
              e.stopPropagation();
              onTick();
            }}
          >
            <Check on={ticked} />
          </button>
        </div>
        <div className="wr-body">
          <span className="wr-price t-num">{buy.price ? money(buy.price) : 'Цена не указана'}</span>
          <motion.span className="wr-name" layoutId={nameId(buy.id)}>
            {buy.title}
          </motion.span>
          <span className="wr-meta t-caption">
            {(buy.category || buy.shop) && <span className="wr-shop">{buy.category || buy.shop}</span>}
            {due && <span className={`wr-due${due.urgent ? ' is-urgent' : ''}`}>{due.short}</span>}
          </span>
        </div>
      </motion.div>
    </motion.li>
  );
}

/* ───────── the bar to paste links into ───────── */

function AddBar() {
  const [text, setText] = useState('');
  const [hint, setHint] = useState(fromShortcut);
  const input = useRef<HTMLInputElement>(null);
  const busy = useImportRun();

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 12000);
    return () => clearTimeout(t);
  }, [hint]);

  const take = (t: string) => {
    if (importText(t)) {
      setText('');
      setHint(false);
      input.current?.blur();
      return true;
    }
    return false;
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t && take(t)) return;
      toast(t ? 'В скопированном нет ссылок на товары' : 'Буфер обмена пуст');
    } catch {
      // The webview may refuse to read the clipboard; a long-press paste into the field still works.
      input.current?.focus();
      toast('Нажмите на поле и выберите «Вставить»');
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || take(t)) return;
    // No link: a wish named by hand.
    openSheet('wish', { title: t });
    setText('');
  };

  // Beside the page, not in it: its slide-in transform would carry a fixed bar along.
  return createPortal(
    <motion.form className={`w-bar${hint ? ' is-hint' : ''}`} onSubmit={submit} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55, duration: 0.6, ease: EASE }}>
      <AnimatePresence>
        {hint && (
          <motion.p className="w-bar-tip t-caption" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            Товары скопированы — нажмите «Вставить»
          </motion.p>
        )}
      </AnimatePresence>
      <motion.button type="button" className="w-bar-new" aria-label="Заполнить вручную" onClick={() => openSheet('wish')} whileTap={{ scale: 0.86 }}>
        <Icon name="edit" size={19} />
      </motion.button>
      <label className="w-bar-field">
        {busy ? <span className="wf-spin" /> : <Icon name="link" size={18} />}
        <input
          ref={input}
          className="w-bar-input t-body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t && take(t)) e.preventDefault();
          }}
          placeholder={busy ? `Добавляю ${busy.done} из ${busy.total}…` : 'Ссылка на товар'}
          inputMode="url"
          enterKeyHint="done"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Ссылка на товар"
        />
        {text ? (
          <motion.button type="submit" className="w-bar-go" aria-label="Добавить" whileTap={{ scale: 0.86 }}>
            <Icon name="check" size={18} stroke={2.6} />
          </motion.button>
        ) : (
          <motion.button type="button" className="w-bar-paste t-caption" onClick={() => void paste()} whileTap={{ scale: 0.92 }}>
            Вставить
          </motion.button>
        )}
      </label>
    </motion.form>,
    document.querySelector('.app') ?? document.body,
  );
}

function Bought({ list }: { list: Buy[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-bought">
      <button type="button" className="w-bought-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="t-headline">Куплено</span>
        <span className="t-caption muted t-num">
          {list.length} · {money(wishesTotal(list))}
        </span>
        <motion.span className="w-bought-chev" animate={{ rotate: open ? 180 : 0 }} transition={SPRING}>
          <Icon name="down" size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul className="m-card w-bought-list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            {list.map((b) => (
              <BoughtRow key={b.id} buy={b} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function BoughtRow({ buy }: { buy: Buy }) {
  const img = useImage(buy.imgId);
  return (
    <li>
      <button type="button" className="w-bought-row" onClick={() => openSheet('wishView', { id: buy.id })}>
        <span className="w-bought-art">
          <WishArt img={img} cut={buy.cut} title={buy.title} tint={buy.tint} />
        </span>
        <span className="w-bought-text">
          <span className="t-body w-bought-name">{buy.title}</span>
          <span className="t-caption muted">{new Date(buy.boughtAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
        </span>
        <span className="t-headline t-num">{money(buy.price)}</span>
      </button>
    </li>
  );
}

/* ───────── the big dream ───────── */

function Dream() {
  const car = useStore((s) => s.shared.car);
  const img = useImage(car.imgId);
  const plan = dreamPlan(car, new Date());
  const pct = Math.floor(plan.share * 100);
  const by = car.date ? parseDay(car.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <motion.section className="w-dream" onClick={() => openSheet('dream')} whileTap={{ scale: 0.985 }} aria-label={`Мечта: ${car.name}`}>
      <span className="w-dream-glow" aria-hidden="true" />
      <div className="w-dream-top">
        <span className="t-label w-dream-eyebrow">
          <Icon name="sparkle" size={13} /> Главная мечта
        </span>
        <motion.button
          type="button"
          className="w-dream-add"
          onClick={(e) => {
            e.stopPropagation();
            openSheet('dreamSave');
          }}
          whileTap={{ scale: 0.92 }}
        >
          <Icon name="plus" size={16} stroke={2.4} />
          Отложить
        </motion.button>
      </div>
      <h2 className="w-dream-name">{car.name || 'Моя мечта'}</h2>
      <span className="w-dream-price t-num">
        {money(car.price)}
        {plan.days !== null && plan.days > 0 && <span className="w-dream-days"> · {plan.days} дн</span>}
      </span>

      <div className="w-dream-art">
        <span className="w-dream-spot" aria-hidden="true" />
        <motion.div className="w-dream-float" initial={{ x: 60, opacity: 0, scale: 0.9 }} animate={{ x: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.25 }}>
          {img ? (
            <img className={`w-dream-img${car.cut ? ' is-cut' : ''}`} src={img} alt="" draggable={false} />
          ) : looksLikeCar(car.name) ? (
            <PanameraSvg color={car.color} className="w-dream-svg" />
          ) : (
            <span className="w-dream-ph">
              <Icon name="gift" size={64} stroke={1.3} />
            </span>
          )}
        </motion.div>
        <span className="w-dream-floor" aria-hidden="true" />
      </div>

      <div className="w-dream-progress">
        <div className="w-dream-row">
          <span className="w-dream-saved">
            <CountUp value={plan.saved} group delay={0.3} />
            <span className="w-dream-cur"> ₽</span>
          </span>
          <span className="w-dream-pct t-num">{pct}%</span>
        </div>
        <span className="w-dream-bar">
          <motion.span className="w-dream-fill" initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(plan.share, 0.015) }} transition={{ duration: 1.3, ease: EASE, delay: 0.35 }} />
        </span>
        <p className="t-caption w-dream-note">
          {plan.left === 0 ? 'Накоплено — пора покупать!' : plan.perMonth ? `≈ ${money(plan.perMonth)} в месяц, чтобы успеть к ${by.replace(' г.', '')}` : `Осталось ${money(plan.left)}`}
        </p>
      </div>

    </motion.section>
  );
}
