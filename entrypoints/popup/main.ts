import { openGameInActiveTab } from '../../src/extension/open-game';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing popup root');
}

app.innerHTML = `
  <main class="popup" aria-label="Happy Clawd">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"></div>
      <div>
        <h1>Happy Clawd</h1>
        <p>在当前页面开始游戏</p>
      </div>
    </div>

    <button id="start-game" class="start-button" type="button">
      开始游戏
    </button>

    <p id="status" class="status" role="status" aria-live="polite"></p>
  </main>
`;

const startButton =
  document.querySelector<HTMLButtonElement>('#start-game');
const statusText = document.querySelector<HTMLParagraphElement>('#status');

if (!startButton || !statusText) {
  throw new Error('Missing popup controls');
}

const setStatus = (message: string) => {
  statusText.textContent = message;
};

const handleStartGame = async () => {
  startButton.disabled = true;
  setStatus('正在打开...');

  try {
    await openGameInActiveTab();
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
