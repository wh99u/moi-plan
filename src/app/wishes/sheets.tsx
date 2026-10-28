import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { actions, useStore } from '../../lib/appStore';
import type { CutoutResult } from '../../lib/cutoutBrowser';
import { addDays, dayKey } from '../../lib/dates';
import { deleteImage, putImage } from '../../lib/images';
import { Icon } from '../../ui/Icon';
import { useImage } from '../../ui/useImage';
import { PanameraSvg } from '../../screens/dream/PanameraSvg';
import { money } from '../money/logic';
import { pickReceipt as pickImage } from '../money/scan';
import { closeSheet, useSheet, useSheetData } from '../sheet';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { EASE } from '../ui/text';
import { AiError, checkKey, DEFAULT_CATEGORIES, drawProduct, readShotAi, setGeminiKey, useGeminiKey } from './ai';
import { cutOut, cutWhite, keepWhole } from './cutout';
import { fetchImage, firstUrl, lookup, shopOf, type Product } from './link';
import { activeWishes, categoriesOf, dreamPlan, dueOf, looksLikeCar } from './logic';
import { readShot, type ShotStage } from './shot';
import { WishFace } from './WishCard';
import { WishDetail } from './WishDetail';

/** «1 234,5» → 1234.5; empty or junk → 0. */
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.')) || 0;
const show = (n: number) => (n ? String(Math.round(n)) : '');

export function WishesSheets() {
  const kind = useSheet();
  const data = useSheetData();
  return (
    <>
      <Sheet open={kind === 'wish'} onClose={closeSheet} title={data.id ? 'Изменить хотелку' : 'Новая хотелка'}>
        <WishForm key={data.id ?? 'new'} id={data.id} />
      </Sheet>
      <WishDetail />
      <Sheet open={kind === 'dream'} onClose={closeSheet} title="Главная мечта">
        <DreamForm />
      </Sheet>
      <Sheet open={kind === 'dreamSave'} onClose={closeSheet} title="Копилка мечты">
        <DreamSave />
      </Sheet>
    </>
  );
}

/* ───────── the product picture ───────── */

interface Pic {
  blob: Blob;
  url: string;
  tint: string;
  cut: boolean;
}

/** What a screenshot told about the product. */
interface Filled {
  title?: string;
  price?: number;
  category?: string;
  shop?: string;
  note?: string;
  /** What to draw, in English, without brands. */
  render?: string;
}

type Stage = ShotStage | 'ai' | 'draw';

/**
 * The picture on the card: a 3D render Gemini draws on white (cut out instantly), or the user's
 * own photo cut out by the model. `pic`: undefined = untouched, null = removed.
 */
function usePhoto() {
  const [pic, setPic] = useState<Pic | null | undefined>(undefined);
  const [source, setSource] = useState<Blob | null>(null);
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState<{ stage: Stage; share: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const put = (r: CutoutResult) => {
    const url = URL.createObjectURL(r.blob);
    urls.current.push(url);
    setPic({ blob: r.blob, url, tint: r.tint, cut: r.removed });
  };

  /** Runs one picture job; a newer job makes the older one's result void. */
  const job = async <T,>(stage: Stage, work: (n: number) => Promise<T>): Promise<T | null> => {
    const n = ++run.current;
    setBusy({ stage, share: 0 });
    setError(null);
    try {
      const r = await work(n);
      return n === run.current ? r : null;
    } catch (e) {
      if (n === run.current) setError(e instanceof AiError ? e.message : 'Не получилось — попробуйте ещё раз');
      return null;
    } finally {
      if (n === run.current) setBusy(null);
    }
  };
  const progress = (n: number) => (stage: Stage, share: number) => n === run.current && setBusy({ stage, share });

  const process = (blob: Blob, keep: boolean) =>
    job('cut', async (n) => {
      const r = keep ? await keepWhole(blob) : await cutOut(blob, progress(n));
      if (n === run.current) put(r);
    });

  const own = (blob: Blob) => {
    setSource(blob);
    setWhole(false);
    void process(blob, false);
  };

  const draw = (subject: string, key: string) =>
    job('draw', async (n) => {
      const r = await cutWhite(await drawProduct(subject, key));
      if (n !== run.current) return;
      setSource(null);
      put(r);
    });

  return {
    pic,
    source,
    whole,
    busy,
    error,
    /** A photo of the user's own: cut out, with «Как есть» to undo. */
    own,
    draw,
    /**
     * A product screenshot. With a Gemini key it is read for name, price, category and
     * description and the product is drawn anew; without one, an Ozon screenshot is read by OCR
     * and its photo cut out, anything else is taken as a plain photo.
     */
    async scan(file: Blob, key: string, categories: string[]): Promise<Filled | null> {
      if (key) {
        const read = await job('ai', () => readShotAi(file, key, categories));
        if (read) void draw(read.render, key);
        return read;
      }
      const info = await job('read', (n) => readShot(file, progress(n)));
      if (info?.ozon && info.photo && info.card) {
        setSource(info.card);
        setWhole(false);
        put(info.photo);
        return { title: info.title, price: info.price, shop: 'Ozon' };
      }
      if (info) own(file);
      return null;
    },
    setWhole(keep: boolean) {
      setWhole(keep);
      if (source) void process(source, keep);
    },
    clear() {
      run.current++;
      setSource(null);
      setBusy(null);
      setError(null);
      setPic(null);
    },
  };
}
type Photo = ReturnType<typeof usePhoto>;

/** Writes the new picture (dropping the old one); null when the picture was not touched. */
async function storePhoto(oldId: string | undefined, pic: Pic | null | undefined) {
  if (pic === undefined) return null;
  if (oldId) await deleteImage(oldId).catch(() => {});
  if (!pic) return { imgId: undefined, tint: undefined, cut: undefined };
  return { imgId: await putImage(pic.blob), tint: pic.tint, cut: pic.cut };
}

const BUSY: Record<Stage, string> = {
  ai: 'Разбираю скрин…',
  draw: 'Рисую 3D-картинку…',
  read: 'Читаю скриншот…',
  model: 'Загружаю нейросеть…',
  cut: 'Вырезаю товар…',
};

/** Seconds since the current stage began, so a long wait reads as progress, not a freeze. */
function useElapsed(stage: Stage | undefined) {
  const [s, setS] = useState(0);
  useEffect(() => {
    setS(0);
    if (!stage) return;
    const started = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [stage]);
  return s;
}

function CutBusy({ busy }: { busy: Photo['busy'] }) {
  const s = useElapsed(busy?.stage);
  return (
    <AnimatePresence>
      {busy && (
        <motion.div className="wf-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <span className="wf-busy-sweep" />
          <span className="wf-busy-text t-caption">
            {busy.stage === 'model' && busy.share < 1 ? `Загружаю нейросеть · ${Math.round(busy.share * 100)}%` : BUSY[busy.stage]}
            {s >= 3 && <span className="t-num"> {s} с</span>}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Asks for the Gemini key right where it is needed. */
function KeyPrompt() {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | string>('idle');
  const save = async () => {
    const key = draft.trim();
    if (!key) return;
    setState('checking');
    try {
      await checkKey(key);
      setGeminiKey(key);
    } catch (e) {
      // Saved anyway: «no VPN right now» is no reason to type the key again later.
      setGeminiKey(key);
      setState(e instanceof AiError ? e.message : 'Не получилось проверить ключ');
    }
  };
  return (
    <div className="wf-key">
      <p className="t-caption">
        Чтобы скрин разбирался сам, а товар рисовался 3D-картинкой, нужен бесплатный ключ Gemini с{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
          aistudio.google.com
        </a>
        . Он хранится только на этом устройстве.
      </p>
      <div className="wf-key-row">
        <input className="field t-body" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ключ Gemini" aria-label="Ключ Gemini" autoComplete="off" />
        <button type="button" className="wf-key-save t-caption" disabled={!draft.trim() || state === 'checking'} onClick={() => void save()}>
          {state === 'checking' ? 'Проверяю…' : 'Сохранить'}
        </button>
      </div>
      {state !== 'idle' && state !== 'checking' && <p className="t-caption wf-note is-blocked">{state}</p>}
    </div>
  );
}

interface ToolsProps {
  photo: Photo;
  has: boolean;
  /** What the render should show: Gemini's description, or the name typed in. */
  subject: string;
  categories: string[];
  onFilled: (f: Filled) => void;
}

/** Screenshot, 3D picture, own photo — and the key prompt when Gemini is not set up yet. */
function ProductTools({ photo, has, subject, categories, onFilled }: ToolsProps) {
  const key = useGeminiKey();
  const drawn = has && !photo.source;
  // Pickers must open straight from the tap: browsers allow them only inside a gesture.
  const scan = () => void pickImage().then((f) => f && photo.scan(f, key, categories).then((r) => r && onFilled(r)));
  return (
    <>
      <div className="wf-tools">
        <motion.button type="button" className="wf-tool is-main t-caption" onClick={scan} disabled={!!photo.busy} whileTap={{ scale: 0.94 }}>
          <Icon name="scan" size={17} />
          Скрин товара
        </motion.button>
        <motion.button type="button" className="wf-tool t-caption" onClick={() => void photo.draw(subject, key)} disabled={!key || !subject.trim() || !!photo.busy} whileTap={{ scale: 0.94 }}>
          <Icon name="sparkle" size={15} />
          {drawn ? 'Ещё вариант' : '3D-картинка'}
        </motion.button>
        <motion.button type="button" className="wf-tool t-caption" onClick={() => void pickImage().then((f) => f && photo.own(f))} disabled={!!photo.busy} whileTap={{ scale: 0.94 }}>
          <Icon name="photo" size={16} />
          Своё фото
        </motion.button>
        {has && (
          <motion.button type="button" className="wf-tool t-caption" onClick={photo.clear} whileTap={{ scale: 0.94 }} aria-label="Убрать картинку">
            <Icon name="close" size={14} />
          </motion.button>
        )}
      </div>
      {photo.source && (
        <Segmented
          name="cut"
          value={photo.whole ? 'whole' : 'cut'}
          onChange={(v) => photo.setWhole(v === 'whole')}
          options={[
            { id: 'cut', label: 'Вырезать' },
            { id: 'whole', label: 'Как есть' },
          ]}
        />
      )}
      <AnimatePresence>
        {photo.error && (
          <motion.p className="t-caption wf-note is-blocked" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {photo.error}
          </motion.p>
        )}
      </AnimatePresence>
      {!key && <KeyPrompt />}
    </>
  );
}

/* ───────── link ───────── */

type LookState = 'idle' | 'looking' | 'found' | 'partial' | 'blocked';

/** Looks the pasted link up a moment after typing stops. */
function useLookup(text: string, onFound: (p: Product) => void) {
  const [state, setState] = useState<LookState>('idle');
  // A saved wish opens with its link already looked up.
  const last = useRef(firstUrl(text) ?? '');
  const found = useRef(onFound);
  found.current = onFound;

  useEffect(() => {
    const url = firstUrl(text);
    if (!url || url === last.current) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      last.current = url;
      setState('looking');
      lookup(url, c.signal)
        .then((p) => {
          setState(p.title || p.image ? (p.price ? 'found' : 'partial') : 'blocked');
          found.current(p);
        })
        .catch(() => {});
    }, 450);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [text]);

  return state;
}

function LinkField({ value, onChange, state }: { value: string; onChange: (v: string) => void; state: LookState }) {
  const shop = shopOf(firstUrl(value) ?? '') || 'магазине';
  const note: Record<Exclude<LookState, 'idle'>, string> = {
    looking: `Ищу товар в ${shop}…`,
    found: 'Нашёл название и цену',
    partial: `${shop} не показывает цену — впишите её сами`,
    blocked: `${shop} не пускает к товару по ссылке — добавьте скрин товара`,
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) onChange(t);
    } catch {
      /* the webview may refuse clipboard reads; the field still takes a long-press paste */
    }
  };
  return (
    <>
      <div className="wf-link">
        <Icon name="link" size={18} />
        <input
          className="wf-link-input t-body"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ссылка на товар"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Ссылка на товар"
        />
        {!value && (
          <button type="button" className="wf-paste t-caption" onClick={() => void paste()}>
            Вставить
          </button>
        )}
      </div>
      <AnimatePresence mode="wait">
        {state !== 'idle' && (
          <motion.p
            key={state}
            className={`t-caption wf-note is-${state}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            {state === 'looking' && <span className="wf-spin" />}
            {note[state]}
          </motion.p>
        )}
      </AnimatePresence>
    </>
  );
}

/* ───────── new / edit wish ───────── */

function WishForm({ id }: { id?: string }) {
  const buy = useStore((s) => s.shared.buys.find((b) => b.id === id));
  const buys = useStore((s) => s.shared.buys);
  const savedImg = useImage(buy?.imgId);
  const key = useGeminiKey();
  const known = useMemo(() => categoriesOf(activeWishes(buys)), [buys]);

  const [url, setUrl] = useState(buy?.url ?? '');
  const [title, setTitle] = useState(buy?.title ?? '');
  const [category, setCategory] = useState(buy?.category ?? '');
  const [note, setNote] = useState(buy?.note ?? '');
  const [price, setPrice] = useState(show(buy?.price ?? 0));
  const [due, setDue] = useState(buy?.due ?? '');
  const [shop, setShop] = useState(buy?.shop ?? '');
  const [render, setRender] = useState('');
  const photo = usePhoto();

  const img = photo.pic === undefined ? savedImg : (photo.pic?.url ?? null);
  const cut = photo.pic === undefined ? buy?.cut : photo.pic?.cut;

  const state = useLookup(url, (p) => {
    setShop(p.shop);
    if (p.title) setTitle((t) => t || p.title!);
    if (p.category) setCategory((c) => c || p.category!);
    if (p.price) setPrice((v) => v || show(p.price!));
    if (img || photo.busy) return;
    // The picture is drawn when Gemini is set up; otherwise the shop's own photo is cut out.
    if (key && p.title) void photo.draw(p.title, key);
    else if (!key && p.image) void fetchImage(p.image).then((b) => b && photo.own(b));
  });

  const filled = (f: Filled) => {
    if (f.title) setTitle(f.title);
    if (f.price) setPrice(show(f.price));
    if (f.category) setCategory(f.category);
    if (f.shop) setShop(f.shop);
    if (f.note) setNote(f.note);
    if (f.render) setRender(f.render);
  };

  const today = new Date();
  const dueChips = [
    { label: 'Без срока', v: '' },
    { label: 'Через неделю', v: dayKey(addDays(today, 7)) },
    { label: 'Через месяц', v: dayKey(addDays(today, 30)) },
    { label: 'Через 3 месяца', v: dayKey(addDays(today, 91)) },
  ];
  const catChips = [...new Set([...known, ...DEFAULT_CATEGORIES])].filter((c) => c !== category).slice(0, 12);
  const ok = title.trim().length > 0 && !photo.busy;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const pic = await storePhoto(buy?.imgId, photo.pic);
    const link = firstUrl(url) ?? url.trim();
    const data = {
      title: title.trim(),
      url: link,
      price: num(price),
      category: category.trim() || undefined,
      note: note.trim() || undefined,
      shop: shop || (link ? shopOf(link) : '') || undefined,
      due: due || undefined,
      ...(pic ?? {}),
    };
    if (buy) actions.updateBuy(buy.id, data);
    else actions.addBuy(data);
    closeSheet();
  };

  return (
    <form className="form wf" onSubmit={save}>
      <div className="wf-preview">
        <motion.div className="wf-card" layout>
          <WishFace face={{ title, category: category || shop, price: num(price), due: dueOf(due, today), img, cut, tint: photo.pic?.tint ?? buy?.tint }} />
          <CutBusy busy={photo.busy} />
        </motion.div>
      </div>
      <ProductTools photo={photo} has={!!img} subject={render || title} categories={known} onFilled={filled} />

      <input className="field t-headline" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что хочется" aria-label="Название" maxLength={80} />
      <label className="sp-amount sp-amount--sm">
        <input className="sp-amount-input t-num" inputMode="numeric" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))} aria-label="Цена" />
        <span className="sp-amount-cur">₽</span>
      </label>

      <input className="field t-body" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Категория" aria-label="Категория" maxLength={40} />
      <div className="chips">
        {catChips.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => setCategory(c)}>
            <span className="chip-label t-caption">{c}</span>
          </button>
        ))}
      </div>
      <input className="field t-body" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Пара слов о товаре" aria-label="Описание" maxLength={140} />

      <LinkField value={url} onChange={setUrl} state={state} />

      <span className="t-label card-label">Купить до</span>
      <div className="chips">
        {dueChips.map((d) => (
          <button key={d.label} type="button" className={`chip${due === d.v ? ' is-on is-plain' : ''}`} onClick={() => setDue(d.v)}>
            <span className="chip-label t-caption">{d.label}</span>
          </button>
        ))}
        <input className="chip chip-date t-caption" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Своя дата" />
      </div>

      <motion.button type="submit" className="primary-btn" disabled={!ok} whileTap={{ scale: 0.96 }}>
        {buy ? 'Сохранить' : 'Добавить в список'}
      </motion.button>
    </form>
  );
}

/* ───────── the dream ───────── */

function DreamForm() {
  const car = useStore((s) => s.shared.car);
  const savedImg = useImage(car.imgId);
  const key = useGeminiKey();
  const [url, setUrl] = useState(car.url ?? '');
  const [name, setName] = useState(car.name);
  const [price, setPrice] = useState(show(car.price));
  const [saved, setSaved] = useState(show(car.saved ?? 0));
  const [date, setDate] = useState(car.date);
  const [render, setRender] = useState('');
  const photo = usePhoto();

  const img = photo.pic === undefined ? savedImg : (photo.pic?.url ?? null);
  const cut = photo.pic === undefined ? car.cut : photo.pic?.cut;

  const state = useLookup(url, (p) => {
    if (p.title) setName(p.title);
    if (p.price) setPrice(show(p.price));
    if (img || photo.busy) return;
    if (key && p.title) void photo.draw(p.title, key);
    else if (!key && p.image) void fetchImage(p.image).then((b) => b && photo.own(b));
  });

  const filled = (f: Filled) => {
    if (f.title) setName(f.title);
    if (f.price) setPrice(show(f.price));
    if (f.render) setRender(f.render);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (photo.busy) return;
    const pic = await storePhoto(car.imgId, photo.pic);
    actions.setCar({ name: name.trim() || 'Моя мечта', price: num(price), saved: num(saved), date, url: firstUrl(url) ?? (url.trim() || undefined), ...(pic ?? {}) });
    closeSheet();
  };

  return (
    <form className="form wf" onSubmit={save}>
      <div className="df-stage">
        {img ? (
          <img className={`w-dream-img${cut ? ' is-cut' : ''}`} src={img} alt="" />
        ) : looksLikeCar(name) ? (
          <PanameraSvg color={car.color} className="w-dream-svg" />
        ) : (
          <span className="w-dream-ph">
            <Icon name="gift" size={52} stroke={1.3} />
          </span>
        )}
        <CutBusy busy={photo.busy} />
      </div>
      <ProductTools photo={photo} has={!!img} subject={render || name} categories={[]} onFilled={filled} />

      <input className="field t-headline" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Porsche Panamera" aria-label="Мечта" maxLength={60} />
      <LinkField value={url} onChange={setUrl} state={state} />

      <span className="t-label card-label">Стоит</span>
      <label className="sp-amount sp-amount--sm">
        <input className="sp-amount-input t-num" inputMode="numeric" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))} aria-label="Цена" />
        <span className="sp-amount-cur">₽</span>
      </label>
      <span className="t-label card-label">Уже накоплено</span>
      <label className="sp-amount sp-amount--sm">
        <input className="sp-amount-input t-num" inputMode="numeric" placeholder="0" value={saved} onChange={(e) => setSaved(e.target.value.replace(/[^\d\s]/g, ''))} aria-label="Накоплено" />
        <span className="sp-amount-cur">₽</span>
      </label>
      <div className="c-row">
        <span className="t-label card-label">Хочу к дате</span>
        <input className="chip chip-date t-caption" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="К какой дате" />
      </div>

      <motion.button type="submit" className="primary-btn" disabled={!!photo.busy} whileTap={{ scale: 0.96 }}>
        Сохранить
      </motion.button>
    </form>
  );
}

const STEPS = [1000, 5000, 10000, 50000];

function DreamSave() {
  const car = useStore((s) => s.shared.car);
  const [mode, setMode] = useState<'add' | 'take'>('add');
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  const plan = dreamPlan(car, new Date());
  const delta = num(value) * (mode === 'add' ? 1 : -1);
  const next = Math.max(0, plan.saved + delta);

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!delta) return;
        actions.setCar({ saved: next });
        closeSheet();
      }}
    >
      <Segmented
        name="dream-save"
        value={mode}
        onChange={setMode}
        options={[
          { id: 'add', label: 'Отложить' },
          { id: 'take', label: 'Взять' },
        ]}
      />
      <label className="sp-amount">
        <input ref={input} className="sp-amount-input t-num" inputMode="numeric" placeholder="0" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ''))} aria-label="Сумма" />
        <span className="sp-amount-cur">₽</span>
      </label>
      <div className="chips">
        {STEPS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => setValue(String(num(value) + s))}>
            <span className="chip-label t-caption t-num">+{money(s)}</span>
          </button>
        ))}
      </div>
      <p className="t-caption muted">
        Сейчас {money(plan.saved)} из {money(car.price)}
        {delta ? ` · станет ${money(next)}` : ''}
      </p>
      <motion.button type="submit" className="primary-btn" disabled={!delta} whileTap={{ scale: 0.96 }}>
        {mode === 'add' ? 'Отложить' : 'Взять из копилки'}
      </motion.button>
    </form>
  );
}
