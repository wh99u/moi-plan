import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { actions, useStore } from '../../lib/appStore';
import { dayKey, daysInMonth, fmtDay, ymKey } from '../../lib/dates';
import { visible } from '../../lib/records';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../lib/template';
import type { SpendItem } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { closeSheet, useSheet, useSheetData } from '../sheet';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { accountId, balance, setBalance } from './account';
import { ingestBankMessage, noticeOf, setNotice } from './auto';
import { parseBankMessage } from './bankText';
import { money } from './logic';
import type { ParsedReceipt } from './receipt';
import { pickReceipt, scanReceipt, type ScanStage } from './scan';

/** «1 234,5» → 1234.5; empty or junk → 0. */
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.')) || 0;
const show = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const round2 = (n: number) => Math.round(n * 100) / 100;

export function MoneySheets() {
  const kind = useSheet();
  const data = useSheetData();
  return (
    <>
      <Sheet open={kind === 'tx'} onClose={closeSheet} title="Новая операция">
        <TxForm ym={data.ym ?? ymKey(new Date())} />
      </Sheet>
      <Sheet open={kind === 'txView'} onClose={closeSheet} title="Операция">
        {data.id && <TxView id={data.id} kind={data.tx ?? 'out'} />}
      </Sheet>
      <Sheet open={kind === 'balance'} onClose={closeSheet} title="Сумма на счёте">
        <BalanceForm />
      </Sheet>
      <Sheet open={kind === 'cat'} onClose={closeSheet} title={data.id ? 'Категория' : 'Новая категория'}>
        <CategoryForm key={data.id ?? 'new'} ym={data.ym ?? ymKey(new Date())} id={data.id} />
      </Sheet>
      <Sheet open={kind === 'planIncome'} onClose={closeSheet} title="Доход на месяц">
        <PlanIncomeForm ym={data.ym ?? ymKey(new Date())} />
      </Sheet>
      <Sheet open={kind === 'auto'} onClose={closeSheet} title="Автодобавление">
        <AutoView />
      </Sheet>
    </>
  );
}

/* ───────── receipt by photo ───────── */

interface Line {
  key: number;
  name: string;
  price: string;
}
let lineKey = 0;
const toLines = (items: SpendItem[] = []): Line[] => items.map((x) => ({ key: ++lineKey, name: x.name, price: show(x.price) }));
const toItems = (lines: Line[]): SpendItem[] => lines.filter((l) => l.name.trim() || num(l.price)).map((l) => ({ name: l.name.trim() || 'Позиция', price: num(l.price) }));
const itemsSum = (items: SpendItem[]) => round2(items.reduce((t, x) => t + x.price, 0));

const STAGE: Record<ScanStage, string> = {
  prepare: 'Готовлю фото',
  qr: 'Ищу QR-код чека',
  model: 'Загружаю распознавание',
  text: 'Читаю позиции',
  done: 'Готово',
};

function useReceiptScan(onResult: (r: ParsedReceipt) => void) {
  const [progress, setProgress] = useState<{ stage: ScanStage; share: number } | null>(null);
  const [note, setNote] = useState('');

  const start = () => {
    // The picker opens only straight from a tap.
    void pickReceipt().then(async (file) => {
      if (!file) return;
      setNote('');
      setProgress({ stage: 'prepare', share: 0 });
      try {
        const r = await scanReceipt(file, (stage, share) => setProgress({ stage, share }));
        if (r.items.length || r.total) {
          onResult(r);
          setNote('Проверь позиции: распознавание иногда ошибается');
        } else {
          setNote('Не получилось прочитать чек. Сфотографируй ровнее и при хорошем свете');
        }
      } catch {
        setNote('Не удалось распознать чек: нет связи или фото не открылось');
      } finally {
        setProgress(null);
      }
    });
  };
  return { start, progress, note };
}

function ScanButton({ scan, label }: { scan: ReturnType<typeof useReceiptScan>; label: string }) {
  return (
    <>
      {scan.progress ? (
        <div className="b-scan" role="status">
          <span className="t-caption muted">{STAGE[scan.progress.stage]}</span>
          <span className="b-scan-bar">
            <motion.span className="b-scan-fill" animate={{ scaleX: Math.max(0.04, scan.progress.share) }} transition={{ duration: 0.3 }} />
          </span>
        </div>
      ) : (
        <motion.button type="button" className="ghost-btn b-scan-btn" onClick={scan.start} whileTap={{ scale: 0.96 }}>
          <Icon name="scan" size={18} />
          {label}
        </motion.button>
      )}
      {scan.note && <p className="t-caption muted">{scan.note}</p>}
    </>
  );
}

function LinesEditor({ lines, onChange }: { lines: Line[]; onChange: (lines: Line[]) => void }) {
  const patch = (key: number, p: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  return (
    <div className="b-lines">
      {lines.map((l) => (
        <div key={l.key} className="b-line">
          <input className="field b-line-field" value={l.name} onChange={(e) => patch(l.key, { name: e.target.value })} placeholder="Название" aria-label="Название позиции" maxLength={80} />
          <input className="field b-line-field b-line-price" inputMode="decimal" value={l.price} onChange={(e) => patch(l.key, { price: e.target.value })} placeholder="₽" aria-label="Цена" />
          <button type="button" className="b-line-del" aria-label={`Убрать позицию ${l.name}`} onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="b-link t-caption b-line-add" onClick={() => onChange([...lines, { key: ++lineKey, name: '', price: '' }])}>
        Добавить позицию
      </button>
    </div>
  );
}

/** Budget categories of a month to pick from; nothing to show when it has none. */
function CatChips({ ym, value, onChange }: { ym: string; value: string; onChange: (id: string) => void }) {
  const cats = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym)?.cats ?? []);
  if (!cats.length) return null;
  return (
    <div className="b-chips" role="group" aria-label="Категория">
      {cats.map((c) => (
        <button key={c.id} type="button" className={`b-chip t-caption${c.id === value ? ' is-on' : ''}`} aria-pressed={c.id === value} onClick={() => onChange(c.id === value ? '' : c.id)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

/* ───────── new operation ───────── */

function TxForm({ ym }: { ym: string }) {
  const today = dayKey(new Date());
  const [kind, setKind] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(ym === today.slice(0, 7) ? today : `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`);
  const [lines, setLines] = useState<Line[]>([]);
  const [catId, setCatId] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const scan = useReceiptScan((r) => {
    setKind('out');
    if (r.store) setTitle(r.store);
    setLines(toLines(r.items));
    const total = r.total ?? itemsSum(r.items);
    if (total) setAmount(show(total));
    if (r.date) setDate(r.date);
    setCatId('');
  });

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, []);

  const n = num(amount);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!n) return;
    const t = title.trim();
    const day = date || today;
    if (kind === 'out') {
      const items = toItems(lines);
      actions.spendFrom(accountId(), n, { catId, ...(t ? { title: t } : {}), ...(items.length ? { items } : {}) }, day);
    } else {
      actions.topUp(accountId(), n, 'manual', t || undefined, day);
    }
    closeSheet();
  };

  return (
    <form className="form" onSubmit={save}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { id: 'out', label: 'Расход' },
          { id: 'in', label: 'Пополнение' },
        ]}
        name="tx-kind"
      />
      {kind === 'out' && <ScanButton scan={scan} label="Сфотографировать чек" />}
      <input ref={input} className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма, ₽" aria-label="Сумма" />
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'out' ? 'На что' : 'От кого'} aria-label="Название" maxLength={60} />
      <input
        className="field"
        type="date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          // Each month has categories of its own.
          if (e.target.value.slice(0, 7) !== date.slice(0, 7)) setCatId('');
        }}
        aria-label="Дата"
      />
      {kind === 'out' && <CatChips ym={(date || today).slice(0, 7)} value={catId} onChange={setCatId} />}
      {kind === 'out' && lines.length > 0 && <LinesEditor lines={lines} onChange={setLines} />}
      <motion.button type="submit" className="primary-btn" disabled={!n} whileTap={{ scale: 0.96 }}>
        Добавить
      </motion.button>
    </form>
  );
}

/* ───────── one operation ───────── */

function TxView({ id, kind }: { id: string; kind: 'in' | 'out' }) {
  const income = useStore((s) => (kind === 'in' ? visible(s.shared.incomes).find((x) => x.id === id) : undefined));
  const spend = useStore((s) => (kind === 'out' ? visible(s.shared.spends).find((x) => x.id === id) : undefined));
  const [draft, setDraft] = useState<Line[] | null>(null);
  const scan = useReceiptScan((r) => {
    setDraft(toLines(r.items));
    if (spend && r.store && !spend.title) actions.updateSpend(spend.id, { title: r.store });
  });
  const rec = income ?? spend;
  if (!rec) return null;

  const title = income ? income.note || 'Пополнение' : spend?.title || spend?.note || 'Трата';
  const auto = income ? income.source === 'shortcut' : !!spend?.auto;
  const moves = kind === 'in' || !!spend?.bankId;
  const items = spend?.items ?? [];
  const remove = () => {
    if (kind === 'in') actions.revertTopUp(id);
    else actions.revertSpend(id);
    closeSheet();
  };
  const saveReceipt = () => {
    actions.updateSpend(id, { items: toItems(draft ?? []) });
    setDraft(null);
  };

  return (
    <div className="form">
      <p className="b-view-sum t-num">
        {kind === 'in' ? '+' : '−'}
        {money(rec.amount)}
      </p>
      <p className="t-headline">{title}</p>
      <p className="t-body muted">
        {fmtDay(rec.date, true)}
        {auto ? ', добавлено само' : ''}
      </p>

      {spend && <CatChips ym={spend.ym} value={spend.catId} onChange={(catId) => actions.updateSpend(spend.id, { catId })} />}

      {kind === 'out' &&
        (draft ? (
          <>
            <h3 className="t-headline b-auto-head">Чек</h3>
            <LinesEditor lines={draft} onChange={setDraft} />
            {scan.note && <p className="t-caption muted">{scan.note}</p>}
            <motion.button type="button" className="primary-btn" onClick={saveReceipt} whileTap={{ scale: 0.96 }}>
              Сохранить чек
            </motion.button>
          </>
        ) : (
          <>
            {items.length > 0 && <Receipt items={items} amount={rec.amount} onEdit={() => setDraft(toLines(items))} />}
            <ScanButton scan={scan} label={items.length ? 'Заменить чек по фото' : 'Добавить чек по фото'} />
          </>
        ))}

      <motion.button type="button" className="ghost-btn" onClick={remove} whileTap={{ scale: 0.96 }}>
        <Icon name="trash" size={18} />
        Удалить операцию
      </motion.button>
      {moves && <p className="t-caption muted">Сумма {kind === 'in' ? 'спишется со счёта' : 'вернётся на счёт'}.</p>}
    </div>
  );
}

function Receipt({ items, amount, onEdit }: { items: SpendItem[]; amount: number; onEdit: () => void }) {
  const sum = itemsSum(items);
  return (
    <section className="b-receipt" aria-label="Чек">
      <div className="b-receipt-head">
        <h3 className="t-headline">Чек</h3>
        <button type="button" className="b-link t-caption" onClick={onEdit}>
          Изменить
        </button>
      </div>
      <ul className="b-receipt-list">
        {items.map((x, i) => (
          <li key={i} className="t-body">
            <span>{x.name}</span>
            <span className="t-num">{money(x.price)}</span>
          </li>
        ))}
      </ul>
      <div className="b-receipt-total t-headline">
        <span>Итого</span>
        <span className="t-num">{money(sum)}</span>
      </div>
      {sum !== round2(amount) && <p className="t-caption muted">Сумма операции другая: {money(amount)}. Возможно, скидка или ошибка распознавания.</p>}
    </section>
  );
}

/* ───────── how much there is ───────── */

function BalanceForm() {
  const [sum, setSum] = useState(() => show(balance()));
  const save = (e: FormEvent) => {
    e.preventDefault();
    setBalance(num(sum));
    closeSheet();
  };
  return (
    <form className="form" onSubmit={save}>
      <input className="field" inputMode="decimal" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="Сколько сейчас на счёте, ₽" aria-label="Сумма на счёте" />
      <motion.button type="submit" className="primary-btn" whileTap={{ scale: 0.96 }}>
        Сохранить
      </motion.button>
    </form>
  );
}

/* ───────── planner ───────── */

function CategoryForm({ ym, id }: { ym: string; id?: string }) {
  const cat = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym)?.cats.find((c) => c.id === id));
  const [name, setName] = useState(cat?.name ?? '');
  const [limit, setLimit] = useState(cat ? show(cat.limit) : '');
  const [color, setColor] = useState(cat?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(cat?.icon ?? CATEGORY_ICONS[0]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (cat) actions.updateCategory(ym, cat.id, { name: n, limit: num(limit), color, icon });
    else actions.addCategory(ym, { name: n, limit: num(limit), color, icon });
    closeSheet();
  };

  return (
    <form className="form" onSubmit={save}>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" aria-label="Название категории" maxLength={40} />
      <input className="field" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Сколько запланировать, ₽" aria-label="План на месяц" />
      <div className="b-picks" role="group" aria-label="Цвет">
        {CATEGORY_COLORS.map((c) => (
          <button key={c} type="button" className={`b-pick b-pick--color${c === color ? ' is-on' : ''}`} style={{ background: c }} aria-label={`Цвет ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="b-picks" role="group" aria-label="Значок">
        {CATEGORY_ICONS.map((x) => (
          <button key={x} type="button" className={`b-pick${x === icon ? ' is-on' : ''}`} aria-label={`Значок ${x}`} aria-pressed={x === icon} onClick={() => setIcon(x)}>
            <Icon name={x} size={20} />
          </button>
        ))}
      </div>
      <motion.button type="submit" className="primary-btn" disabled={!name.trim()} whileTap={{ scale: 0.96 }}>
        {cat ? 'Сохранить' : 'Добавить категорию'}
      </motion.button>
      {cat && (
        <motion.button
          type="button"
          className="ghost-btn"
          onClick={() => {
            actions.deleteCategory(ym, cat.id);
            closeSheet();
          }}
          whileTap={{ scale: 0.96 }}
        >
          <Icon name="trash" size={18} />
          Удалить категорию
        </motion.button>
      )}
    </form>
  );
}

function PlanIncomeForm({ ym }: { ym: string }) {
  const current = useStore((s) => visible(s.shared.budgets).find((b) => b.ym === ym)?.income ?? 0);
  const [sum, setSum] = useState(current ? show(current) : '');
  const save = (e: FormEvent) => {
    e.preventDefault();
    actions.updateBudget(ym, { income: num(sum) });
    closeSheet();
  };
  return (
    <form className="form" onSubmit={save}>
      <input className="field" inputMode="decimal" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="Сколько планируешь получить, ₽" aria-label="Доход на месяц" />
      <motion.button type="submit" className="primary-btn" whileTap={{ scale: 0.96 }}>
        Сохранить
      </motion.button>
    </form>
  );
}

/* ───────── automation ───────── */

function describe(text: string) {
  const m = parseBankMessage(text);
  if (!m) return 'Пока не вижу здесь операцию';
  const parts = [`${m.kind === 'in' ? 'Пополнение' : 'Расход'} ${money(m.amount)}`];
  if (m.title) parts.push(m.title);
  if (m.balance !== undefined) parts.push(`на счёте останется ${money(m.balance)}`);
  return parts.join(', ');
}

function AutoView() {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}#/money?sms=`;

  const add = (e: FormEvent) => {
    e.preventDefault();
    setNotice(noticeOf(ingestBankMessage(text)));
    closeSheet();
  };
  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="form">
      <p className="t-body muted">Сообщение банка само становится операцией: сумма, пополнение или расход, магазин и остаток на счёте.</p>

      <form className="form" onSubmit={add}>
        <h3 className="t-headline">Проверить на сообщении</h3>
        <textarea className="field b-area" value={text} onChange={(e) => setText(e.target.value)} placeholder="Покупка 450 ₽ PYATEROCHKA. Баланс 12 300 ₽" aria-label="Текст сообщения банка" rows={3} />
        {text.trim() && <p className="t-caption muted">{describe(text)}</p>}
        <motion.button type="submit" className="primary-btn" disabled={!parseBankMessage(text)} whileTap={{ scale: 0.96 }}>
          Добавить операцию
        </motion.button>
      </form>

      <h3 className="t-headline b-auto-head">Настроить на iPhone</h3>
      <ol className="b-steps t-body">
        <li>В «Командах» открой «Автоматизацию», нажми «+» и выбери «Сообщение». Отправитель — банк, запуск — сразу.</li>
        <li>Добавь действие «Кодировать URL» и подай в него содержимое сообщения.</li>
        <li>Добавь «Открыть URL»: ссылка ниже, сразу за ней результат кодирования.</li>
      </ol>
      <div className="b-copy">
        <code className="t-caption">{link}</code>
        <button type="button" className="b-link t-caption" onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
      <p className="t-caption muted">
        Банк шлёт только пуши? iPhone не отдаёт их командам. Тогда собери обычную команду: «Сделать снимок экрана», «Извлечь текст из изображения» и те же два шага, а запускай её двойным касанием задней панели.
      </p>
      <p className="t-caption muted">Ссылка открывается в Safari, поэтому и счёт веди там: у иконки на экране «Домой» отдельные данные.</p>
    </div>
  );
}
