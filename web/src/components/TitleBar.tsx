import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Brand from './Brand';
import { useI18n } from '../i18n';
import {
  hasTrafficLights,
  isWindowState,
  titleBarLabel,
  windowChrome,
  type DesktopWindowState,
  type WindowCommand,
} from '../lib/desktop';
import './title-bar.css';

/**
 * The window's title bar, drawn by the app instead of by the system.
 *
 * In a browser this renders nothing at all — there is no window to draw. In
 * the desktop shell the window arrives with no frame (see
 * desktop/src/window-chrome.ts) and this is what stands in its place: the
 * mark, where you are, and the three buttons, in the product's own type and
 * colours. A strip of Windows grey above a Freecord was the one surface the
 * design did not reach, and it was the first thing anyone saw.
 *
 * Three rules hold it together:
 *
 * - **The whole strip drags the window** (`-webkit-app-region: drag`); every
 *   control opts back out, or it could not be clicked.
 * - **macOS keeps its traffic lights.** There they are the platform's own
 *   affordance and an app without them reads as broken, so the shell leaves
 *   them on and the bar leaves them room — and draws no buttons of its own.
 * - **The bar steps aside in full screen**: the height it reserves
 *   (`--titlebar-h`, read by every full-height screen in styles.css) drops
 *   back to zero, so a shared screen is not two pixels short of the display.
 */

/** What the menu offers. Same verbs as the application menu, our face. */
type MenuEntry =
  | { kind: 'separator'; id: string }
  | { kind: 'item'; id: string; label: string; hint?: string; command: WindowCommand };

const IDLE: DesktopWindowState = { maximized: false, fullScreen: false, focused: true };

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.6" y="0.6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Two sheets, the way every platform draws "put it back". */
function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.6 2.6V0.6h6.8v6.8h-2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="0.6" y="2.6" width="6.8" height="6.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0 10 10M10 0 0 10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 3.8 5 6.8 8 3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TitleBar() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  // Resolved once: the bridge is injected before the page's first script runs
  // and never changes for the life of the window.
  const chrome = useMemo(() => windowChrome(), []);
  const mac = useMemo(() => hasTrafficLights(), []);
  const [state, setState] = useState<DesktopWindowState>(IDLE);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Tell the shell a bar exists (it puts the menu bar back for a page that
  // never does), then follow the window: maximized, full screen, focused.
  useEffect(() => {
    if (!chrome) {
      return;
    }
    chrome.ready();
    let live = true;
    void Promise.resolve(chrome.state())
      .then((value) => {
        if (live && isWindowState(value)) {
          setState(value);
        }
      })
      .catch(() => undefined);
    const stop = chrome.onState((value) => {
      if (isWindowState(value)) {
        setState(value);
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, [chrome]);

  /*
   * The height the bar occupies is a token, not a number this file owns:
   * every full-height screen subtracts it (--app-h in styles.css). In full
   * screen it goes back to zero and the bar is gone with it.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!chrome || state.fullScreen) {
      delete root.dataset.desktopChrome;
      return;
    }
    root.dataset.desktopChrome = 'bar';
    return () => {
      delete root.dataset.desktopChrome;
    };
  }, [chrome, state.fullScreen]);

  const run = useCallback(
    (command: WindowCommand) => {
      setMenuOpen(false);
      chrome?.run(command);
    },
    [chrome],
  );

  // A menu that outlives its click would sit over the room: Escape, a click
  // anywhere else, or the window losing focus all close it.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onBlur = () => setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [menuOpen]);

  const entries = useMemo<MenuEntry[]>(
    () => [
      { kind: 'item', id: 'reload', label: t('desktop.menu.reload'), hint: 'Ctrl+R', command: 'reload' },
      { kind: 'separator', id: 'after-reload' },
      { kind: 'item', id: 'zoom-in', label: t('desktop.menu.zoomIn'), hint: 'Ctrl++', command: 'zoom-in' },
      { kind: 'item', id: 'zoom-out', label: t('desktop.menu.zoomOut'), hint: 'Ctrl+-', command: 'zoom-out' },
      { kind: 'item', id: 'zoom-reset', label: t('desktop.menu.resetZoom'), hint: 'Ctrl+0', command: 'zoom-reset' },
      { kind: 'item', id: 'fullscreen', label: t('desktop.menu.fullscreen'), hint: 'F11', command: 'fullscreen' },
      { kind: 'separator', id: 'after-view' },
      { kind: 'item', id: 'devtools', label: t('desktop.menu.devTools'), hint: 'Ctrl+Shift+I', command: 'devtools' },
      { kind: 'separator', id: 'after-devtools' },
      { kind: 'item', id: 'browser', label: t('desktop.menu.openInBrowser'), command: 'open-browser' },
      { kind: 'item', id: 'source', label: t('desktop.menu.sourceCode'), command: 'source' },
      { kind: 'separator', id: 'after-links' },
      { kind: 'item', id: 'quit', label: t('desktop.menu.quit'), command: 'quit' },
    ],
    [t],
  );

  /** Up and down walk the menu; the ends wrap, as a menu does. */
  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = items[(at + step + items.length) % items.length];
    next?.focus();
  }

  if (!chrome || state.fullScreen) {
    return null;
  }

  const label = titleBarLabel(pathname);
  const maximized = state.maximized;

  return (
    <header
      className="titlebar"
      data-mac={mac ? 'true' : undefined}
      data-blurred={state.focused ? undefined : 'true'}
    >
      {/* The mark is also the way in: on Windows and Linux the application
          menu has nowhere to live, so it hangs here. On macOS it is in the
          system menu bar where it belongs, and this is just the brand. */}
      {mac ? (
        <span className="titlebar-brand">
          <Brand size={15} />
        </span>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="titlebar-brand titlebar-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('desktop.menu.open')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Brand size={15} />
          <span className="titlebar-chevron" aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
      )}

      {label ? <span className="titlebar-label">{t(label)}</span> : null}

      <span className="titlebar-drag" />

      {mac ? null : (
        <div className="titlebar-controls">
          <button
            type="button"
            className="titlebar-button"
            aria-label={t('desktop.window.minimize')}
            onClick={() => run('minimize')}
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            className="titlebar-button"
            aria-label={maximized ? t('desktop.window.restore') : t('desktop.window.maximize')}
            onClick={() => run('toggle-maximize')}
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            className="titlebar-button titlebar-close"
            aria-label={t('desktop.window.close')}
            onClick={() => run('close')}
          >
            <CloseGlyph />
          </button>
        </div>
      )}

      {menuOpen ? (
        <div className="titlebar-menu" role="menu" ref={menuRef} onKeyDown={onMenuKeyDown}>
          {entries.map((entry) =>
            entry.kind === 'separator' ? (
              <span key={entry.id} className="titlebar-menu-rule" role="separator" />
            ) : (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                className="titlebar-menu-item"
                onClick={() => run(entry.command)}
              >
                <span>{entry.label}</span>
                {entry.hint ? <span className="titlebar-menu-hint">{entry.hint}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </header>
  );
}
