import { browser } from 'wxt/browser';
import { openGameInActiveTab } from '../src/extension/open-game';

const OPEN_GAME_COMMAND = 'happy-clawd-open-game';

export default defineBackground(() => {
  browser.commands.onCommand.addListener((command) => {
    if (command === OPEN_GAME_COMMAND) {
      void openGameInActiveTab().catch((error) => {
        console.warn('Failed to open Happy Clawd game from command', error);
      });
    }
  });
});
