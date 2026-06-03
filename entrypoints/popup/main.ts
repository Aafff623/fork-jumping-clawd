import { browser } from 'wxt/browser';
import {
  BACKDROP_BLUR_STEP_PX,
  DEFAULT_BACKDROP_BLUR_PX,
  MAX_BACKDROP_BLUR_PX,
  MIN_BACKDROP_BLUR_PX,
  getStoredBackdropBlur,
  normalizeBackdropBlur,
  saveStoredBackdropBlur,
} from '../../src/extension/backdrop-blur';
import { openGameInActiveTab } from '../../src/extension/open-game';
import { SET_BACKDROP_BLUR_MESSAGE } from '../../src/extension/messages';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing popup root');
}

app.innerHTML = `
  <main class="popup" aria-label="Happy Clawd">
    <header class="popup-header">
      <div class="mascot-mark" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 274 178" focusable="false">
          <path d="M9.23 42.62H48.9V74.28H9.23V42.62Z" fill="#DA7756" />
          <path d="M224 42.62H264.17V74.28H224V42.62Z" fill="#DA7756" />
          <path d="M40.9 8.74H232.5V136.59H40.9V8.74Z" fill="#DA7756" />
          <path d="M57.4 144.59H72.79V172.77H57.4V144.59Z" fill="#DA7756" />
          <path d="M89.29 144.59H105.05V172.77H89.29V144.59Z" fill="#DA7756" />
          <path d="M168.67 144.59H184.27V172.77H168.67V144.59Z" fill="#DA7756" />
          <path d="M200.04 144.59H215.22V172.77H200.04V144.59Z" fill="#DA7756" />
          <path d="m73.24 42.62h16.26v30.66h-16.26v-30.66z" fill="#000" />
          <path d="m183.9 42.62h16.26v30.66h-16.26v-30.66z" fill="#000" />
        </svg>
      </div>
      <div class="brand-copy">
        <h1>Happy Clawd</h1>
        <p>在当前页面开始游戏</p>
      </div>
    </header>

    <section class="shortcut-panel" aria-label="快捷键">
      <div class="shortcut-row">
        <span>打开游戏</span>
        <span class="key-combo" aria-label="Ctrl H">
          <kbd>Ctrl</kbd>
          <span class="shortcut-plus">+</span>
          <kbd>H</kbd>
        </span>
      </div>
      <div class="shortcut-row">
        <span>退出游戏</span>
        <span class="key-combo" aria-label="Escape">
          <kbd>Esc</kbd>
        </span>
      </div>
    </section>

    <button id="start-game" class="start-button" type="button">
      开始游戏
    </button>

    <section class="setting" aria-labelledby="backdrop-blur-label">
      <div class="setting-header">
        <label id="backdrop-blur-label" for="backdrop-blur">
          毛玻璃模糊
        </label>
        <output id="backdrop-blur-value" class="setting-value" for="backdrop-blur">
          ${DEFAULT_BACKDROP_BLUR_PX}px
        </output>
      </div>
      <input
        id="backdrop-blur"
        class="blur-slider"
        type="range"
        min="${MIN_BACKDROP_BLUR_PX}"
        max="${MAX_BACKDROP_BLUR_PX}"
        step="${BACKDROP_BLUR_STEP_PX}"
        value="${DEFAULT_BACKDROP_BLUR_PX}"
      />
    </section>

    <p id="status" class="status" role="status" aria-live="polite"></p>
  </main>
`;

const startButton =
  document.querySelector<HTMLButtonElement>('#start-game');
const backdropBlurSlider =
  document.querySelector<HTMLInputElement>('#backdrop-blur');
const backdropBlurValue =
  document.querySelector<HTMLOutputElement>('#backdrop-blur-value');
const statusText = document.querySelector<HTMLParagraphElement>('#status');

if (!startButton || !backdropBlurSlider || !backdropBlurValue || !statusText) {
  throw new Error('Missing popup controls');
}

let currentBackdropBlurPx = DEFAULT_BACKDROP_BLUR_PX;
let hasAdjustedBackdropBlur = false;

const setStatus = (message: string) => {
  statusText.textContent = message;
};

const isMissingReceiverError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('Could not establish connection') ||
    message.includes('Receiving end does not exist')
  );
};

const setBackdropBlurControlValue = (value: unknown) => {
  currentBackdropBlurPx = normalizeBackdropBlur(value);
  backdropBlurSlider.value = String(currentBackdropBlurPx);
  backdropBlurValue.textContent = `${currentBackdropBlurPx}px`;

  return currentBackdropBlurPx;
};

const sendBackdropBlurToActiveTab = async (blurPx: number) => {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id == null) {
    return;
  }

  try {
    await browser.tabs.sendMessage(activeTab.id, {
      type: SET_BACKDROP_BLUR_MESSAGE,
      blurPx,
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      console.warn('Failed to update Happy Clawd backdrop blur', error);
    }
  }
};

const handleBackdropBlurInput = () => {
  hasAdjustedBackdropBlur = true;
  const blurPx = setBackdropBlurControlValue(backdropBlurSlider.value);

  void saveStoredBackdropBlur(blurPx).catch((error) => {
    console.warn('Failed to save Happy Clawd backdrop blur setting', error);
  });
  void sendBackdropBlurToActiveTab(blurPx);
};

void getStoredBackdropBlur()
  .then((blurPx) => {
    if (!hasAdjustedBackdropBlur) {
      setBackdropBlurControlValue(blurPx);
    }
  })
  .catch((error) => {
    console.warn('Failed to load Happy Clawd backdrop blur setting', error);
  });

const handleStartGame = async () => {
  startButton.disabled = true;
  setStatus('正在打开...');

  try {
    await openGameInActiveTab();
    await sendBackdropBlurToActiveTab(currentBackdropBlurPx);
    setStatus('已打开');
    window.setTimeout(() => window.close(), 80);
  } catch (error) {
    console.warn('Failed to open Happy Clawd game', error);
    startButton.disabled = false;
    setStatus('当前页面无法打开游戏');
  }
};

startButton.addEventListener('click', () => {
  void handleStartGame();
});

backdropBlurSlider.addEventListener('input', handleBackdropBlurInput);
