import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { actions, appStore, useStore } from '../../lib/appStore';
import { fmtDay } from '../../lib/dates';
import { visible } from '../../lib/records';
import { BANK_CODES, BANK_NAMES, type BankCode } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { closeSheet, useSheet, useSheetData } from '../sheet';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { ingestBankMessage, noticeOf, setNotice } from './auto';
import { parseBankMessage } from './bankText';
import { money } from './logic';

/** «1 234,5» → 1234.5; empty or junk → 0. */
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.')) || 0;
const show = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function MoneySheets() {
  const kind = useSheet();
  const data = useSheetData();
  return (
    <>
      <Sheet open={kind === 'tx'} onClose={closeSheet} title="Новая операция">
        <TxForm />
      </Sheet>
      <Sheet open={kind === 'txView'} onClose={closeSheet} title="Операция">
        {data.id && <TxView id={data.id} kind={data.tx ?? 'out'} />}
      </Sheet>
      <Sheet open={kind === 'card'} onClose={closeSheet} title={data.id ? 'Карта' : 'Новая карта'}>
        <CardForm key={data.id ?? 'new'} id={data.id} />
      </Sheet>
      <Sheet open={kind === 'auto'} onClose={closeSheet} title="Автодобавление">
        <AutoView />
      </Sheet>
    </>
  );
}

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="b-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={`b-chip t-caption${o.id === value ? ' is-on' : ''}`} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── new operation ───────── */

function TxForm() {
  const banks = useStore((s) => visible(s.shared.banks)).sort((a, b) => a.order - b.order);
  const last = useStore((s) => s.personal.settings.lastTopUpBankId);
  const [kind, setKind] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [bankId, setBankId] = useState(banks.find((b) => b.id === last)?.id ?? banks[0]?.id ?? '');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, []);

  const n = num(amount);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!n || !bankId) return;
    const t = title.trim();
    if (kind === 'out') actions.spendFrom(bankId, n, t ? { title: t } : {});
    else actions.topUp(bankId, n, 'manual', t || undefined);
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
      <input ref={input} className="field t-headline" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма, ₽" aria-label="Сумма" />
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'out' ? 'На что' : 'От кого'} aria-label="Название" maxLength={60} />
      {banks.length > 1 && <Chips label="Карта" value={bankId} onChange={setBankId} options={banks.map((b) => ({ id: b.id, label: BANK_NAMES[b.code] }))} />}
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
  const banks = useStore((s) => visible(s.shared.banks));
  const rec = income ?? spend;
  if (!rec) return null;

  const bank = banks.find((b) => b.id === rec.bankId);
  const title = income ? income.note || 'Пополнение' : spend?.title || spend?.note || 'Трата';
  const auto = income ? income.source === 'shortcut' : !!spend?.auto;
  const remove = () => {
    if (kind === 'in') actions.revertTopUp(id);
    else actions.revertSpend(id);
    closeSheet();
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
        {bank ? `, ${BANK_NAMES[bank.code]}` : ''}
        {auto ? ', добавлено само' : ''}
      </p>
      <motion.button type="button" className="ghost-btn" onClick={remove} whileTap={{ scale: 0.96 }}>
        <Icon name="trash" size={18} />
        Удалить операцию
      </motion.button>
      {bank && <p className="t-caption muted">Сумма {kind === 'in' ? 'спишется с карты' : 'вернётся на карту'}.</p>}
    </div>
  );
}

/* ───────── a card ───────── */

function CardForm({ id }: { id?: string }) {
  const bank = id ? visible(appStore.get().shared.banks).find((b) => b.id === id) : undefined;
  const [code, setCode] = useState<BankCode>(bank?.code ?? 'tbank');
  const [sum, setSum] = useState(bank ? show(bank.sum) : '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (bank) actions.updateBank(bank.id, { code, sum: num(sum) });
    else actions.addBank(code, num(sum));
    closeSheet();
  };

  return (
    <form className="form" onSubmit={save}>
      <Chips label="Банк" value={code} onChange={setCode} options={BANK_CODES.map((c) => ({ id: c, label: BANK_NAMES[c] }))} />
      <input className="field t-headline" inputMode="decimal" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="Сколько на ней сейчас, ₽" aria-label="Остаток на карте" />
      <motion.button type="submit" className="primary-btn" whileTap={{ scale: 0.96 }}>
        {bank ? 'Сохранить' : 'Добавить карту'}
      </motion.button>
      {bank && (
        <motion.button
          type="button"
          className="ghost-btn"
          onClick={() => {
            actions.deleteBank(bank.id);
            closeSheet();
          }}
          whileTap={{ scale: 0.96 }}
        >
          <Icon name="trash" size={18} />
          Удалить карту
        </motion.button>
      )}
    </form>
  );
}

/* ───────── automation ───────── */

function describe(text: string) {
  const m = parseBankMessage(text);
  if (!m) return 'Пока не вижу здесь операцию';
  const parts = [`${m.kind === 'in' ? 'Пополнение' : 'Расход'} ${money(m.amount)}`];
  if (m.title) parts.push(m.title);
  if (m.balance !== undefined) parts.push(`на карте останется ${money(m.balance)}`);
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
      <p className="t-body muted">Сообщение банка само становится операцией: сумма, пополнение или расход, магазин и остаток на карте.</p>

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
      <p className="t-caption muted">Ссылка открывается в Safari, поэтому и карты веди там: у иконки на экране «Домой» отдельные данные.</p>
    </div>
  );
}
