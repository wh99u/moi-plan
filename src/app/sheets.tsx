import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { actions } from '../lib/appStore';
import { addDays, dayKey } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { GOOGLE_CLIENT_ID, renderGoogleButton } from './google';
import { setProfile, useProfile } from './profile';
import { MoneySheets } from './money/sheets';
import { setGeminiKey, useGeminiKey } from './wishes/ai';
import { WishesSheets } from './wishes/sheets';
import { EXTRAS, navigate } from './route';
import { closeSheet, useSheet } from './sheet';
import { setThemePref, useTheme, type ThemePref } from './theme';
import { Segmented } from './ui/Segmented';
import { Sheet } from './ui/Sheet';

export function Sheets() {
  const open = useSheet();
  return (
    <>
      <Sheet open={open === 'more'} onClose={closeSheet} title="Ещё">
        <MoreGrid />
      </Sheet>
      <Sheet open={open === 'task'} onClose={closeSheet} title="Новая задача">
        <TaskForm />
      </Sheet>
      <Sheet open={open === 'profile'} onClose={closeSheet} title="Профиль">
        <ProfileForm />
      </Sheet>
      <MoneySheets />
      <WishesSheets />
    </>
  );
}

const item = (i: number) => ({
  initial: { opacity: 0, y: 18, scale: 0.94 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { delay: 0.08 + i * 0.05, type: 'spring', stiffness: 420, damping: 30 },
} as const);

function MoreGrid() {
  return (
    <div className="more-grid">
      {EXTRAS.map((x, i) => (
        <motion.button
          key={x.id}
          type="button"
          className={`more-tile${i === 0 ? ' more-tile--wide' : ''}`}
          onClick={() => {
            closeSheet();
            navigate(x.id);
          }}
          {...item(i)}
          whileTap={{ scale: 0.95 }}
        >
          <span className="more-icon">
            <Icon name={x.icon} size={22} />
          </span>
          <span className="more-text">
            <span className="t-headline">{x.label}</span>
            <span className="t-caption muted">{x.hint}</span>
          </span>
          <span className="soon-badge t-label">скоро</span>
        </motion.button>
      ))}
    </div>
  );
}

function TaskForm() {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // After the sheet has sprung up, so the keyboard does not fight the animation.
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const now = new Date();
    actions.addTask({ title: t, desc: '', due: dayKey(when === 'today' ? now : addDays(now, 1)) });
    closeSheet();
  };

  return (
    <form className="form" onSubmit={submit}>
      <input
        ref={input}
        className="field t-headline"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Что нужно сделать?"
        aria-label="Задача"
        maxLength={120}
        enterKeyHint="done"
      />
      <Segmented
        value={when}
        onChange={setWhen}
        options={[
          { id: 'today', label: 'Сегодня' },
          { id: 'tomorrow', label: 'Завтра' },
        ]}
        name="when"
      />
      <motion.button type="submit" className="primary-btn" disabled={!title.trim()} whileTap={{ scale: 0.96 }}>
        Добавить
      </motion.button>
    </form>
  );
}

function ProfileForm() {
  const { name, via } = useProfile();
  const { pref } = useTheme();
  const [draft, setDraft] = useState(name);
  const aiKey = useGeminiKey();
  const [keyDraft, setKeyDraft] = useState('');
  const slot = useRef<HTMLDivElement>(null);
  const showGoogle = !!GOOGLE_CLIENT_ID && via !== 'google';

  useEffect(() => {
    if (!showGoogle || !slot.current) return;
    renderGoogleButton(slot.current, (p) => setProfile({ name: p.name, picture: p.picture, via: 'google' })).catch(() => {
      /* offline or blocked: the name can still be typed by hand */
    });
  }, [showGoogle]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setProfile({ name: draft.trim(), via: 'manual', picture: undefined });
    if (keyDraft.trim()) setGeminiKey(keyDraft.trim());
    closeSheet();
  };

  return (
    <form className="form" onSubmit={save}>
      <label className="t-label card-label" htmlFor="profile-name">
        Как к тебе обращаться
      </label>
      <input
        id="profile-name"
        className="field t-headline"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Имя"
        maxLength={40}
        autoComplete="given-name"
      />
      {showGoogle && (
        <div className="google-in">
          <div ref={slot} />
          <span className="t-caption muted">или имя подтянется из аккаунта Google</span>
        </div>
      )}
      <span className="t-label card-label">Тема</span>
      <Segmented
        value={pref}
        onChange={(p: ThemePref) => setThemePref(p)}
        options={[
          { id: 'system', label: 'Как в системе' },
          { id: 'light', label: 'Светлая' },
          { id: 'dark', label: 'Тёмная' },
        ]}
        name="theme"
      />
      <label className="t-label card-label" htmlFor="profile-ai">
        Ключ Gemini
      </label>
      <input
        id="profile-ai"
        className="field t-body"
        type="password"
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        placeholder={aiKey ? 'Сохранён · новый заменит его' : 'Для скринов товаров и 3D-картинок'}
        autoComplete="off"
      />
      {aiKey && (
        <button type="button" className="ghost-btn" onClick={() => setGeminiKey('')}>
          Удалить ключ с этого устройства
        </button>
      )}
      <motion.button type="submit" className="primary-btn" whileTap={{ scale: 0.96 }}>
        Сохранить
      </motion.button>
    </form>
  );
}
