import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { actions, appStore, useStore } from '../../lib/appStore';
import { addDays, dayKey, fmtDay, fmtMonth } from '../../lib/dates';
import { budgetSummary } from '../../lib/money';
import { visible } from '../../lib/records';
import type { BudgetMonth, Spend, SpendItem, Sub } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { closeSheet, openSheet, useSheet, useSheetData } from '../sheet';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { EASE } from '../ui/text';
import { CAT_TONES, dueLabel, itemsTotal, money, SUB_PRESETS, upcoming } from './logic';
import { prepareMonth, toneOf } from './MoneyPage';
import { storeHint } from './receipt';
import { pickReceipt, scanReceipt, takePendingReceipt, type ScanStage } from './scan';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «1 234,5» → 1234.5; empty or junk → 0. */
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.')) || 0;
const show = (n: number) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
const monthOf = (ym: string) => visible(appStore.get().shared.budgets).find((b) => b.ym === ym);

export function MoneySheets() {
  const kind = useSheet();
  const data = useSheetData();
  const ym = data.ym ?? dayKey(new Date()).slice(0, 7);
  return (
    <>
      <Sheet open={kind === 'spend'} onClose={closeSheet} title={data.id ? 'Изменить трату' : 'Новая трата'}>
        <SpendForm key={`${data.id ?? 'new'}-${data.scan ? 's' : ''}`} ym={ym} id={data.id} scan={!!data.scan} />
      </Sheet>
      <Sheet open={kind === 'spendView'} onClose={closeSheet} title="Трата">
        {data.id && <SpendView id={data.id} />}
      </Sheet>
      <Sheet open={kind === 'income'} onClose={closeSheet} title="Доход">
        <IncomeForm ym={ym} />
      </Sheet>
      <Sheet open={kind === 'budget'} onClose={closeSheet} title={`Бюджет · ${fmtMonth(ym)}`}>
        <BudgetForm ym={ym} />
      </Sheet>
      <Sheet open={kind === 'category'} onClose={closeSheet} title="Категория">
        {data.id && <CategoryView ym={ym} id={data.id} />}
      </Sheet>
      <Sheet open={kind === 'subs'} onClose={closeSheet} title="Платежи и подписки">
        <SubsView />
      </Sheet>
    </>
  );
}

/* ───────── new / edit spend ───────── */

interface Row {
  key: number;
  name: string;
  price: string;
}
let rowKey = 0;
const toRows = (items: SpendItem[] = []): Row[] => items.map((x) => ({ key: ++rowKey, name: x.name, price: show(x.price) }));

const STAGE: Record<ScanStage, string> = {
  prepare: 'Готовлю фото',
  qr: 'Ищу QR-код чека',
  model: 'Загружаю распознавание',
  text: 'Читаю позиции',
  done: 'Готово',
};

function SpendForm({ ym, id, scan }: { ym: string; id?: string; scan: boolean }) {
  const editing = useMemo(() => (id ? visible(appStore.get().shared.spends).find((s) => s.id === id) : undefined), [id]);
  const cats = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym)?.cats ?? []);
  const today = dayKey(new Date());
  const [amount, setAmount] = useState(editing ? show(editing.amount) : '');
  const [touched, setTouched] = useState(!!editing);
  const [title, setTitle] = useState(editing?.title ?? editing?.note ?? '');
  const [catId, setCatId] = useState(editing?.catId ?? cats.find((c) => c.name === 'Еда')?.id ?? cats[0]?.id ?? '');
  const [catPicked, setCatPicked] = useState(!!editing);
  const [date, setDate] = useState(editing?.date ?? (ym === today.slice(0, 7) ? today : `${ym}-01`));
  const [rows, setRows] = useState<Row[]>(() => toRows(editing?.items));
  const [scanning, setScanning] = useState<{ stage: ScanStage; share: number; url: string } | null>(null);
  const [note, setNote] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const items = rows.filter((r) => r.name.trim() || num(r.price)).map((r) => ({ name: r.name.trim() || 'Позиция', price: num(r.price) }));
  const sum = itemsTotal(items);
  const total = touched || !items.length ? num(amount) : sum;

  const runScan = async (file: File) => {
    const url = URL.createObjectURL(file);
    setScanning({ stage: 'prepare', share: 0, url });
    setNote('');
    try {
      const r = await scanReceipt(file, (stage, share) => setScanning((s) => (s ? { ...s, stage, share } : s)));
      if (r.store) setTitle(r.store);
      if (r.items.length) setRows(toRows(r.items));
      if (r.total) {
        setAmount(show(r.total));
        setTouched(true);
      }
      if (r.date && r.date.slice(0, 7) === ym) setDate(r.date);
      const cat = r.catName && cats.find((c) => c.name === r.catName);
      if (cat) {
        setCatId(cat.id);
        setCatPicked(true);
      }
      setNote(
        r.items.length || r.total
          ? 'Проверьте позиции: распознавание иногда ошибается'
          : 'Не получилось прочитать чек. Попробуйте фото ровнее и при хорошем свете',
      );
    } catch {
      setNote('Не удалось распознать: нет связи или фото не открылось');
    } finally {
      URL.revokeObjectURL(url);
      setScanning(null);
    }
  };

  useEffect(() => {
    if (!scan) {
      const t = setTimeout(() => amountRef.current?.focus(), 380);
      return () => clearTimeout(t);
    }
    const f = takePendingReceipt();
    if (f) void runScan(f);
    // runScan only reads setters and the month's categories at the time of the photo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTitle = (v: string) => {
    setTitle(v);
    const hint = storeHint(v);
    const cat = hint && cats.find((c) => c.name === hint.catName);
    if (cat && !catPicked) setCatId(cat.id);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!total || !catId) return;
    let target = ym;
    let cat = catId;
    const dYm = date.slice(0, 7);
    if (dYm !== ym) {
      // A date in another month files the spend there, under the category of the same name.
      prepareMonth(dYm);
      const name = cats.find((c) => c.id === catId)?.name;
      const other = monthOf(dYm)?.cats ?? [];
      cat = other.find((c) => c.name === name)?.id ?? other[0]?.id ?? catId;
      target = dYm;
    }
    const data: Omit<Spend, 'id' | 'updatedAt'> = {
      ym: target,
      catId: cat,
      amount: Math.round(total * 100) / 100,
      date,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(items.length ? { items } : {}),
    };
    if (editing) actions.updateSpend(editing.id, { ...data, title: data.title, items: data.items });
    else actions.addSpend(data);
    closeSheet();
  };

  return (
    <form className="form sp-form" onSubmit={save}>
      <AnimatePresence>
        {scanning && (
          <motion.div className="sp-scan" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <div className="sp-scan-photo">
              <img src={scanning.url} alt="" />
              <span className="sp-scan-line" />
            </div>
            <div className="sp-scan-text">
              <span className="t-headline">{STAGE[scanning.stage]}</span>
              <span className="sp-scan-bar">
                <motion.span className="sp-scan-fill" animate={{ scaleX: Math.max(0.04, scanning.share) }} transition={{ duration: 0.3 }} />
              </span>
              <span className="t-caption muted">Первый раз дольше: скачивается модель распознавания</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <label className="sp-amount">
        <input
          ref={amountRef}
          className="sp-amount-input t-num"
          inputMode="decimal"
          placeholder="0"
          value={touched || !items.length ? amount : show(sum)}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^\d.,\s]/g, ''));
            setTouched(true);
          }}
          aria-label="Сумма"
        />
        <span className="sp-amount-cur">₽</span>
      </label>
      {items.length > 0 && Math.abs(sum - total) > 0.009 && (
        <button type="button" className="sp-hint t-caption" onClick={() => (setAmount(show(sum)), setTouched(false))}>
          По позициям {money(sum)} — взять эту сумму
        </button>
      )}

      <input className="field t-headline" value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Где: магазин, кафе, такси…" aria-label="Где" maxLength={60} />

      <div className="chips" role="radiogroup" aria-label="Категория">
        {cats.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={catId === c.id}
            className={`chip${catId === c.id ? ' is-on' : ''}`}
            onClick={() => (setCatId(c.id), setCatPicked(true))}
            whileTap={{ scale: 0.92 }}
            style={{ ['--tone' as string]: CAT_TONES[i % CAT_TONES.length] }}
          >
            {catId === c.id && <motion.span layoutId="chip-on" className="chip-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <span className="chip-label t-caption">{c.name}</span>
          </motion.button>
        ))}
      </div>

      <div className="chips">
        {[
          { label: 'Сегодня', v: today },
          { label: 'Вчера', v: dayKey(addDays(new Date(), -1)) },
        ].map((d) => (
          <button key={d.v} type="button" className={`chip${date === d.v ? ' is-on is-plain' : ''}`} onClick={() => setDate(d.v)}>
            <span className="chip-label t-caption">{d.label}</span>
          </button>
        ))}
        <input className="chip chip-date t-caption" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Дата" />
      </div>

      <div className="sp-items">
        <div className="sp-items-head">
          <span className="t-label card-label">Состав покупки</span>
          <button type="button" className="m-link t-caption" onClick={() => void pickReceipt().then((f) => f && runScan(f))} disabled={!!scanning}>
            <Icon name="scan" size={15} /> Фото чека
          </button>
        </div>
        <ul className="sp-rows">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.li
                key={r.key}
                className="sp-row"
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto', transition: { delay: Math.min(i, 12) * 0.03, duration: 0.3, ease: EASE } }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
              >
                <input className="sp-row-name t-body" value={r.name} placeholder="Товар" aria-label="Товар" onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))} />
                <input
                  className="sp-row-price t-body t-num"
                  value={r.price}
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Цена"
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, price: e.target.value.replace(/[^\d.,]/g, '') } : x)))}
                />
                <button type="button" className="sp-row-del" aria-label="Убрать позицию" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Icon name="close" size={14} stroke={2.2} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <button
          type="button"
          className="sp-add t-caption"
          onClick={() => {
            const key = ++rowKey;
            setRows((rs) => [...rs, { key, name: '', price: '' }]);
          }}
        >
          <Icon name="plus" size={15} stroke={2.2} /> Добавить позицию
        </button>
      </div>

      <AnimatePresence>
        {note && (
          <motion.p className="t-caption sp-note" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {note}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.button type="submit" className="primary-btn" disabled={!total || !catId || !!scanning} whileTap={{ scale: 0.96 }}>
        {editing ? 'Сохранить' : `Добавить${total ? ` ${money(total)}` : ''}`}
      </motion.button>
    </form>
  );
}

/* ───────── one spend ───────── */

function SpendView({ id }: { id: string }) {
  const spend = useStore((s) => visible(s.shared.spends).find((x) => x.id === id));
  const month = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === spend?.ym));
  const [confirm, setConfirm] = useState(false);
  if (!spend) return null;
  const cat = month?.cats.find((c) => c.id === spend.catId);
  return (
    <div className="form">
      <div className="sv-head">
        <span className="sv-sum t-num">−{money(spend.amount)}</span>
        <span className="t-headline">{spend.title || spend.note || cat?.name || 'Трата'}</span>
        <span className="t-caption muted">
          {capital(fmtDay(spend.date))} · {cat?.name ?? 'Без категории'}
          {spend.subId ? ' · подписка' : ''}
        </span>
      </div>
      {!!spend.items?.length && (
        <ul className="m-card sv-items">
          {spend.items.map((x, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + Math.min(i, 15) * 0.03, ease: EASE }}>
              <span className="t-body">{x.name}</span>
              <span className="sv-dots" />
              <span className="t-body t-num">{money(x.price)}</span>
            </motion.li>
          ))}
          <li className="sv-total">
            <span className="t-headline">Итого</span>
            <span className="sv-dots" />
            <span className="t-headline t-num">{money(itemsTotal(spend.items))}</span>
          </li>
        </ul>
      )}
      <motion.button type="button" className="ghost-btn" onClick={() => openSheet('spend', { ym: spend.ym, id: spend.id })} whileTap={{ scale: 0.96 }}>
        <Icon name="edit" size={17} /> Изменить
      </motion.button>
      <motion.button
        type="button"
        className={`danger-btn${confirm ? ' is-armed' : ''}`}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          actions.deleteSpend(spend.id);
          closeSheet();
        }}
        whileTap={{ scale: 0.96 }}
      >
        {confirm ? 'Точно удалить?' : 'Удалить'}
      </motion.button>
    </div>
  );
}

/* ───────── income ───────── */

function IncomeForm({ ym }: { ym: string }) {
  const income = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym)?.income ?? 0);
  const [mode, setMode] = useState<'add' | 'set'>('add');
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, []);
  const v = num(value);
  const next = mode === 'add' ? income + v : v;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v && mode === 'add') return;
        actions.updateBudget(ym, { income: Math.round(next) });
        closeSheet();
      }}
    >
      <Segmented value={mode} onChange={setMode} name="income" options={[{ id: 'add', label: 'Прибавить' }, { id: 'set', label: 'Задать весь доход' }]} />
      <label className="sp-amount">
        <input ref={input} className="sp-amount-input t-num" inputMode="decimal" placeholder="0" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,\s]/g, ''))} aria-label="Сумма" />
        <span className="sp-amount-cur">₽</span>
      </label>
      <p className="t-caption muted">
        Доход за {fmtMonth(ym)}: {money(income)}
        {v > 0 && ` → ${money(next)}`}
      </p>
      <motion.button type="submit" className="primary-btn" whileTap={{ scale: 0.96 }}>
        Сохранить
      </motion.button>
    </form>
  );
}

/* ───────── budget: income and limits ───────── */

function BudgetForm({ ym }: { ym: string }) {
  const month = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym));
  const spends = useStore((s) => s.shared.spends);
  const cats = month?.cats ?? [];
  const s = budgetSummary(month, spends, new Date());
  const hasSpends = visible(spends).some((x) => x.ym === ym);
  const [newName, setNewName] = useState('');

  return (
    <div className="form">
      <label className="t-label card-label" htmlFor="b-income">
        Доход за месяц
      </label>
      <NumField id="b-income" value={month?.income ?? 0} onCommit={(n) => actions.updateBudget(ym, { income: n })} big />
      <p className={`t-caption b-free${s.free < 0 ? ' is-over' : ''}`}>
        {s.income ? (s.free >= 0 ? `Не распределено: ${money(s.free)}` : `Лимиты больше дохода на ${money(-s.free)}`) : 'Укажите доход — лимиты можно разложить по шаблону'}
      </p>
      {!hasSpends && (
        <motion.button type="button" className="ghost-btn" onClick={() => actions.applyTemplate(ym)} whileTap={{ scale: 0.96 }}>
          <Icon name="sparkle" size={17} /> Разложить доход по шаблону
        </motion.button>
      )}
      <span className="t-label card-label">Лимиты</span>
      <ul className="b-list">
        <AnimatePresence initial={false}>
          {cats.map((c, i) => (
            <motion.li key={c.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              <span className="m-dot" style={{ background: CAT_TONES[i % CAT_TONES.length] }} />
              <span className="t-body b-name">{c.name}</span>
              <NumField value={c.limit} onCommit={(n) => actions.updateCategory(ym, c.id, { limit: n })} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <form
        className="b-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          actions.addCategory(ym, { name: newName.trim(), icon: 'gift', color: CAT_TONES[cats.length % CAT_TONES.length], limit: 0 });
          setNewName('');
        }}
      >
        <input className="field t-body" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Новая категория" maxLength={30} />
        <motion.button type="submit" className="b-add-btn" aria-label="Добавить категорию" whileTap={{ scale: 0.9 }} disabled={!newName.trim()}>
          <Icon name="plus" size={20} stroke={2.2} />
        </motion.button>
      </form>
    </div>
  );
}

/** A number that saves when it loses focus or Enter is pressed. */
function NumField({ value, onCommit, id, big }: { value: number; onCommit: (n: number) => void; id?: string; big?: boolean }) {
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]);
  const commit = () => {
    const n = Math.round(num(draft));
    if (n !== value) onCommit(n);
  };
  return (
    <span className={`numfield${big ? ' numfield--big' : ''}`}>
      <input
        id={id}
        className="t-num"
        inputMode="numeric"
        value={draft}
        placeholder="0"
        onChange={(e) => setDraft(e.target.value.replace(/[^\d\s]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
      />
      <span>₽</span>
    </span>
  );
}

/* ───────── one category ───────── */

function CategoryView({ ym, id }: { ym: string; id: string }) {
  const month = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym));
  const spends = useStore((s) => s.shared.spends);
  const [confirm, setConfirm] = useState(false);
  const cat = month?.cats.find((c) => c.id === id);
  if (!month || !cat) return null;
  const list = visible(spends)
    .filter((x) => x.ym === ym && x.catId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const spent = list.reduce((t, x) => t + x.amount, 0);
  const tone = toneOf(month.cats, id);
  const pct = cat.limit ? Math.min(100, (spent / cat.limit) * 100) : 0;

  return (
    <div className="form">
      <input className="field t-headline" defaultValue={cat.name} aria-label="Название" onBlur={(e) => e.target.value.trim() && e.target.value !== cat.name && actions.updateCategory(ym, id, { name: e.target.value.trim() })} />
      <div className="c-row">
        <span className="t-label card-label">Лимит на месяц</span>
        <NumField value={cat.limit} onCommit={(n) => actions.updateCategory(ym, id, { limit: n })} />
      </div>
      <span className="m-goal-bar">
        <motion.span className="m-goal-fill" style={{ background: `linear-gradient(90deg, ${tone}55, ${tone})` }} initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ duration: 0.9, ease: EASE }} />
      </span>
      <p className="t-caption muted">
        Потрачено {money(spent)}
        {cat.limit ? ` из ${money(cat.limit)}` : ''}
      </p>
      <ul className="m-card m-tx-list">
        {list.map((x) => (
          <li key={x.id}>
            <button type="button" className="m-tx" onClick={() => openSheet('spendView', { ym, id: x.id })}>
              <span className="m-tx-text">
                <span className="t-body m-tx-title">{x.title || x.note || cat.name}</span>
                <span className="t-caption muted">{capital(fmtDay(x.date))}</span>
              </span>
              <span className="t-headline t-num m-tx-sum">−{money(x.amount)}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="t-body muted c-empty">В этом месяце трат нет</li>}
      </ul>
      <motion.button
        type="button"
        className={`danger-btn${confirm ? ' is-armed' : ''}`}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          actions.deleteCategory(ym, id);
          closeSheet();
        }}
        whileTap={{ scale: 0.96 }}
      >
        {confirm ? (list.length ? 'Траты останутся без категории. Удалить?' : 'Точно удалить?') : 'Удалить категорию'}
      </motion.button>
    </div>
  );
}

/* ───────── subscriptions ───────── */

function SubsView() {
  const subs = useStore((s) => s.shared.subs);
  const list = upcoming(subs, new Date());
  const [editing, setEditing] = useState<Sub | 'new' | null>(list.length ? null : 'new');

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div key="form" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.3, ease: EASE }}>
          <SubForm sub={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        </motion.div>
      ) : (
        <motion.div key="list" className="form" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3, ease: EASE }}>
          <ul className="m-card m-tx-list">
            {list.map(({ sub, days, status }, i) => (
              <motion.li key={sub.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, ease: EASE }}>
                <button type="button" className={`m-tx is-${status}`} onClick={() => setEditing(sub)}>
                  <span className="m-tx-icon">
                    <Icon name={sub.icon} size={18} />
                  </span>
                  <span className="m-tx-text">
                    <span className="t-body m-tx-title">{sub.name}</span>
                    <span className="t-caption m-pay-due">
                      {dueLabel(days)} · {sub.period === 'year' ? 'раз в год' : 'каждый месяц'}
                    </span>
                  </span>
                  <span className="t-headline t-num m-tx-sum">{money(sub.amount)}</span>
                </button>
              </motion.li>
            ))}
          </ul>
          <motion.button type="button" className="primary-btn" onClick={() => setEditing('new')} whileTap={{ scale: 0.96 }}>
            Добавить платёж
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SubForm({ sub, onDone }: { sub?: Sub; onDone: () => void }) {
  const catNames = useStore((s) => {
    const months = visible(s.shared.budgets).sort((a, b) => b.ym.localeCompare(a.ym));
    return (months[0] as BudgetMonth | undefined)?.cats.map((c) => c.name).join('|') ?? '';
  });
  const names = catNames ? catNames.split('|') : ['Связь', 'Развлечения'];
  const [name, setName] = useState(sub?.name ?? '');
  const [amount, setAmount] = useState(sub ? show(sub.amount) : '');
  const [icon, setIcon] = useState(sub?.icon ?? 'repeat');
  const [next, setNext] = useState(sub?.next ?? dayKey(addDays(new Date(), 1)));
  const [period, setPeriod] = useState<Sub['period']>(sub?.period ?? 'month');
  const [catName, setCatName] = useState(sub?.catName ?? (names.includes('Связь') ? 'Связь' : names[0]));
  const [confirm, setConfirm] = useState(false);

  const ok = name.trim() && num(amount) > 0 && next;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const data = { name: name.trim(), amount: num(amount), icon, next, period, catName };
        if (sub) actions.updateSub(sub.id, data);
        else actions.addSub(data);
        onDone();
      }}
    >
      {!sub && (
        <div className="chips">
          {SUB_PRESETS.map((p, i) => (
            <motion.button
              key={p.name}
              type="button"
              className={`chip${name === p.name ? ' is-on is-plain' : ''}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 420, damping: 26 }}
              onClick={() => {
                setName(p.name);
                setIcon(p.icon);
                setAmount(show(p.amount));
                if (names.includes(p.catName)) setCatName(p.catName);
              }}
            >
              <Icon name={p.icon} size={14} />
              <span className="chip-label t-caption">{p.name}</span>
            </motion.button>
          ))}
        </div>
      )}
      <input className="field t-headline" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, интернет" aria-label="Название" maxLength={40} />
      <label className="sp-amount sp-amount--sm">
        <input className="sp-amount-input t-num" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Сумма" />
        <span className="sp-amount-cur">₽</span>
      </label>
      <div className="c-row">
        <span className="t-label card-label">Следующая оплата</span>
        <input className="chip chip-date t-caption" type="date" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} aria-label="Следующая оплата" />
      </div>
      <Segmented value={period} onChange={setPeriod} name="period" options={[{ id: 'month', label: 'Каждый месяц' }, { id: 'year', label: 'Раз в год' }]} />
      <div className="chips" aria-label="Из какой категории">
        {names.map((n) => (
          <button key={n} type="button" className={`chip${catName === n ? ' is-on is-plain' : ''}`} onClick={() => setCatName(n)}>
            <span className="chip-label t-caption">{n}</span>
          </button>
        ))}
      </div>
      <motion.button type="submit" className="primary-btn" disabled={!ok} whileTap={{ scale: 0.96 }}>
        {sub ? 'Сохранить' : 'Добавить'}
      </motion.button>
      <button type="button" className="ghost-btn" onClick={onDone}>
        Назад
      </button>
      {sub && (
        <button
          type="button"
          className={`danger-btn${confirm ? ' is-armed' : ''}`}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            actions.deleteSub(sub.id);
            onDone();
          }}
        >
          {confirm ? 'Точно удалить?' : 'Удалить'}
        </button>
      )}
    </form>
  );
}
