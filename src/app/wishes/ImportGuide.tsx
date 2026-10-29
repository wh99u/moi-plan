import { useEffect, useRef, useState, type ReactNode } from 'react';
import { actions, useStore } from '../../lib/appStore';
import { botAppUrl } from '../../lib/shortcut';
import { haptic, isTelegram } from '../../lib/telegram';
import { Icon } from '../../ui/Icon';
import { toast } from '../../ui/Toast';
import { Segmented } from '../ui/Segmented';
import { bookmarklet, shortcutScript } from './grab';

async function copy(text: string, done = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  haptic('success');
  toast(done, 'success');
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="wg-step">
      <span className="wg-n t-num">{n}</span>
      <div className="wg-body">
        <p className="t-body wg-title">{title}</p>
        {children}
      </div>
    </li>
  );
}

function CopyButton({ text, label, done }: { text: string; label: string; done?: string }) {
  return (
    <button type="button" className="wf-tool is-main t-caption wg-copy" onClick={() => void copy(text, done)}>
      <Icon name="copy" size={16} />
      {label}
    </button>
  );
}

/** Where the shortcut sends the user back: the bot's mini app, or this very page outside Telegram. */
function useBackLink() {
  const saved = useStore((s) => s.personal.settings.botLink);
  const [link, setLink] = useState(saved);
  const here = `${location.origin}${location.pathname}#/wishes`;
  return { link, setLink, save: () => actions.setSettings({ botLink: link.trim() }), url: botAppUrl(link, 'wish') || (isTelegram ? '' : here) };
}

/** How to bring products over from Ozon (or any shop) without typing them in. */
export function ImportGuide() {
  const [side, setSide] = useState<'phone' | 'desk'>('phone');
  const back = useBackLink();
  const script = shortcutScript();

  return (
    <div className="form wg">
      <p className="t-caption muted">
        Ozon не отдаёт товары по ссылке. Зато страница, открытая у вас в браузере, видна целиком: команда перепишет с неё название, цену и фото. С корзины — все товары сразу.
      </p>
      <Segmented
        name="guide"
        value={side}
        onChange={setSide}
        options={[
          { id: 'phone', label: 'iPhone' },
          { id: 'desk', label: 'Компьютер' },
        ]}
      />

      {side === 'phone' ? (
        <>
          <ol className="wg-steps">
            <Step n={1} title="Разрешите командам скрипты">
              <p className="t-caption muted">Настройки → Приложения → Команды → Дополнения → «Разрешать выполнение скриптов».</p>
            </Step>
            <Step n={2} title="Создайте команду «В Мой план»">
              <p className="t-caption muted">В «Командах» нажмите «+». Внизу откройте «ⓘ» и включите «Показывать в меню „Поделиться“», тип — «Веб-страницы Safari».</p>
            </Step>
            <Step n={3} title="Выполнить JavaScript на веб-странице">
              <p className="t-caption muted">Добавьте это действие, сотрите в нём пример и вставьте скрипт.</p>
              <CopyButton text={script} label="Скопировать скрипт" done="Скрипт скопирован" />
            </Step>
            <Step n={4} title="Скопировать в буфер обмена">
              <p className="t-caption muted">На вход — «Результат JavaScript».</p>
            </Step>
            <Step n={5} title="Открыть URL">
              {back.url ? (
                <>
                  <p className="t-caption muted">Эта ссылка вернёт вас в приложение.</p>
                  <CopyButton text={back.url} label="Скопировать ссылку" />
                </>
              ) : (
                <p className="t-caption muted">Укажите ниже ссылку на бота, через которого открываете «Мой план».</p>
              )}
              {isTelegram && (
                <input
                  className="field t-body wg-bot"
                  placeholder="https://t.me/имя_бота/app"
                  value={back.link}
                  onChange={(e) => back.setLink(e.target.value)}
                  onBlur={back.save}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label="Ссылка на бота"
                />
              )}
            </Step>
          </ol>
          <div className="wg-use">
            <p className="t-body wg-title">Как пользоваться</p>
            <p className="t-caption muted">
              Откройте товар или корзину на ozon.ru в Safari (из приложения Ozon: «Поделиться» → «Скопировать» и вставьте в Safari). Нажмите «Поделиться» → «В Мой план», а здесь —
              «Вставить».
            </p>
          </div>
        </>
      ) : (
        <>
          <ol className="wg-steps">
            <Step n={1} title="Сделайте закладку">
              <p className="t-caption muted">Перетащите кнопку на панель закладок. Или создайте любую закладку и вставьте в её адрес скопированный код.</p>
              <div className="wg-row">
                <Bookmarklet />
                <CopyButton text={bookmarklet()} label="Скопировать код" done="Код закладки скопирован" />
              </div>
            </Step>
            <Step n={2} title="Откройте товар или корзину на ozon.ru">
              <p className="t-caption muted">Нажмите закладку — товары скопируются.</p>
            </Step>
            <Step n={3} title="Вставьте сюда">
              <p className="t-caption muted">В поле внизу «Желаний» нажмите «Вставить» или Ctrl+V.</p>
            </Step>
          </ol>
        </>
      )}
      <p className="t-caption muted">Так же работает с Wildberries, Яндекс Маркетом и другими магазинами.</p>
    </div>
  );
}

/** A link to drag onto the bookmarks bar. React refuses `javascript:` links, so the address is set by hand. */
function Bookmarklet() {
  const a = useRef<HTMLAnchorElement>(null);
  useEffect(() => a.current?.setAttribute('href', bookmarklet()), []);
  return (
    <a ref={a} className="wg-mark t-caption" onClick={(e) => (e.preventDefault(), toast('Перетащите кнопку на панель закладок'))}>
      <Icon name="bag" size={15} />В Мой план
    </a>
  );
}
