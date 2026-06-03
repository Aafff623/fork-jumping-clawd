import { browser } from 'wxt/browser';

const OPEN_GAME_MESSAGE = 'happy-clawd:open-game';
const GAME_PAGE = '/game.html';
const OVERLAY_ID = 'happy-clawd-game-overlay';

type SavedScrollStyles = {
  bodyOverflow: string | null;
  htmlOverflow: string;
};

let overlayHost: HTMLDivElement | null = null;
let overlayFrame: HTMLIFrameElement | null = null;
let savedScrollStyles: SavedScrollStyles | null = null;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOpenGameMessage = (message: unknown) =>
  isObject(message) && message.type === OPEN_GAME_MESSAGE;

const isCloseGameMessage = (message: unknown) =>
  isObject(message) &&
  message.source === 'happy-clawd-game' &&
  message.type === 'close-game';

const isOpenGameShortcut = (event: KeyboardEvent) =>
  event.ctrlKey &&
  !event.altKey &&
  !event.metaKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'h';

const setImportantStyle = (
  element: HTMLElement,
  property: string,
  value: string,
) => {
  element.style.setProperty(property, value, 'important');
};

const lockPageScroll = () => {
  if (savedScrollStyles) {
    return;
  }

  savedScrollStyles = {
    htmlOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body?.style.overflow ?? null,
  };

  document.documentElement.style.overflow = 'hidden';
  if (document.body) {
    document.body.style.overflow = 'hidden';
  }
};

const restorePageScroll = () => {
  if (!savedScrollStyles) {
    return;
  }

  document.documentElement.style.overflow = savedScrollStyles.htmlOverflow;
  if (document.body && savedScrollStyles.bodyOverflow !== null) {
    document.body.style.overflow = savedScrollStyles.bodyOverflow;
  }
  savedScrollStyles = null;
};

const focusGameFrame = () => {
  requestAnimationFrame(() => {
    overlayFrame?.focus();
  });
};

const closeGameOverlay = () => {
  overlayHost?.remove();
  overlayHost = null;
  overlayFrame = null;
  restorePageScroll();
};

const createOverlayHost = () => {
  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  setImportantStyle(host, 'position', 'fixed');
  setImportantStyle(host, 'inset', '0');
  setImportantStyle(host, 'width', '100vw');
  setImportantStyle(host, 'height', '100vh');
  setImportantStyle(host, 'z-index', '2147483647');
  setImportantStyle(host, 'pointer-events', 'auto');
  setImportantStyle(host, 'display', 'block');

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .overlay {
        position: fixed;
        inset: 0;
        overflow: hidden;
        background: rgba(248, 250, 252, 0.2);
        pointer-events: auto;
      }

      .backdrop {
        position: absolute;
        inset: 0;
        z-index: 0;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08)),
          rgba(255, 255, 255, 0.12);
        -webkit-backdrop-filter: blur(14px) saturate(1.1);
        backdrop-filter: blur(14px) saturate(1.1);
      }

      iframe {
        position: absolute;
        inset: 0;
        z-index: 1;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
        color-scheme: light;
      }

      .close {
        position: absolute;
        top: 14px;
        right: 14px;
        z-index: 2;
        display: grid;
        width: 38px;
        height: 38px;
        padding: 0;
        place-items: center;
        border: 1px solid rgba(17, 24, 39, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.42);
        color: #111827;
        cursor: pointer;
        font: 400 26px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-backdrop-filter: blur(16px) saturate(1.2);
        backdrop-filter: blur(16px) saturate(1.2);
      }

      .close:hover {
        background: rgba(255, 255, 255, 0.68);
      }

      .close:focus-visible {
        outline: 2px solid rgba(17, 24, 39, 0.62);
        outline-offset: 2px;
      }
    </style>
    <div class="overlay">
      <div class="backdrop"></div>
      <iframe title="Happy Clawd game" allowtransparency="true"></iframe>
      <button class="close" type="button" aria-label="Exit game">×</button>
    </div>
  `;

  const iframe = shadow.querySelector<HTMLIFrameElement>('iframe');
  const closeButton = shadow.querySelector<HTMLButtonElement>('.close');

  if (!iframe || !closeButton) {
    throw new Error('Failed to create Happy Clawd overlay');
  }

  iframe.src = browser.runtime.getURL(GAME_PAGE);
  iframe.addEventListener('load', focusGameFrame);
  closeButton.addEventListener('click', closeGameOverlay);

  return { host, iframe };
};

const openGameOverlay = () => {
  if (overlayHost?.isConnected) {
    focusGameFrame();
    return 'already-open';
  }

  const { host, iframe } = createOverlayHost();
  overlayHost = host;
  overlayFrame = iframe;
  lockPageScroll();
  document.documentElement.append(host);
  focusGameFrame();

  return 'opened';
};

export default defineContentScript({
  matches: ['<all_urls>'],
  matchAboutBlank: true,
  runAt: 'document_idle',
  main(ctx) {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isOpenGameShortcut(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openGameOverlay();
        return;
      }

      if (event.key === 'Escape' && overlayHost?.isConnected) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeGameOverlay();
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (!overlayFrame || event.source !== overlayFrame.contentWindow) {
        return;
      }

      if (isCloseGameMessage(event.data)) {
        closeGameOverlay();
      }
    };

    const handleRuntimeMessage = (message: unknown) => {
      if (!isOpenGameMessage(message)) {
        return;
      }

      return Promise.resolve({
        ok: true,
        state: openGameOverlay(),
      });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('message', handleWindowMessage);
    browser.runtime.onMessage.addListener(handleRuntimeMessage);

    ctx.onInvalidated(() => {
      closeGameOverlay();
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('message', handleWindowMessage);
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    });
  },
});
