import { browser } from 'wxt/browser';
import {
  CLOSE_GAME_MESSAGE,
  GET_GAME_STATE_MESSAGE,
  OPEN_GAME_MESSAGE,
} from './messages';

const GAME_PAGE = '/game.html';
const CONTENT_SCRIPT_PUBLIC_FILE = '/content-scripts/content.js';
const CONTENT_SCRIPT_INJECTION_FILE =
  'content-scripts/content.js' as typeof CONTENT_SCRIPT_PUBLIC_FILE;

export type GameOverlayState = {
  ok: true;
  state?: string;
  isOpen: boolean;
};

const isTopLevelAboutBlankUrl = (url: string | undefined) =>
  typeof url === 'string' && /^about:(blank|srcdoc)([?#].*)?$/i.test(url);

const isStandaloneGameUrl = (url: string | undefined) =>
  typeof url === 'string' && url === browser.runtime.getURL(GAME_PAGE);

const assertContentScriptIsBundled = () => {
  const manifest = browser.runtime.getManifest();
  const contentScript = manifest.content_scripts?.find((script) =>
    script.js?.some(
      (file) =>
        file === CONTENT_SCRIPT_PUBLIC_FILE ||
        file === CONTENT_SCRIPT_PUBLIC_FILE.slice(1),
    ),
  );

  if (!contentScript) {
    throw new Error('Happy Clawd content script is missing from the manifest');
  }
};

const sendOpenGameMessage = (tabId: number) =>
  browser.tabs.sendMessage(tabId, {
    type: OPEN_GAME_MESSAGE,
  });

const sendCloseGameMessage = (tabId: number) =>
  browser.tabs.sendMessage(tabId, {
    type: CLOSE_GAME_MESSAGE,
  });

const sendGetGameStateMessage = (tabId: number) =>
  browser.tabs.sendMessage(tabId, {
    type: GET_GAME_STATE_MESSAGE,
  });

const isMissingReceiverError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('Could not establish connection') ||
    message.includes('Receiving end does not exist')
  );
};

const injectContentScript = async (tabId: number) => {
  if (!browser.scripting?.executeScript) {
    throw new Error('The scripting API is unavailable');
  }

  assertContentScriptIsBundled();

  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_INJECTION_FILE],
  });
};

const openStandaloneGameInTab = async (tabId: number) => {
  await browser.tabs.update(tabId, {
    url: browser.runtime.getURL(GAME_PAGE),
  });

  return {
    ok: true,
    state: 'standalone-game-page',
    isOpen: true,
  };
};

export const openGameInTab = async (tabId: number) => {
  try {
    return await sendOpenGameMessage(tabId);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await injectContentScript(tabId);
    return sendOpenGameMessage(tabId);
  }
};

export const openGameInActiveTab = async () => {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id == null) {
    throw new Error('No active tab found');
  }

  if (isTopLevelAboutBlankUrl(activeTab.url)) {
    return openStandaloneGameInTab(activeTab.id);
  }

  if (isStandaloneGameUrl(activeTab.url)) {
    return {
      ok: true,
      state: 'already-open',
      isOpen: true,
    };
  }

  return openGameInTab(activeTab.id);
};

export const closeGameInActiveTab = async (): Promise<GameOverlayState> => {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id == null) {
    throw new Error('No active tab found');
  }

  if (isStandaloneGameUrl(activeTab.url)) {
    await browser.tabs.update(activeTab.id, {
      url: 'about:blank',
    });

    return {
      ok: true,
      state: 'closed',
      isOpen: false,
    };
  }

  try {
    return await sendCloseGameMessage(activeTab.id);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    return {
      ok: true,
      state: 'already-closed',
      isOpen: false,
    };
  }
};

export const getGameStateInActiveTab = async (): Promise<GameOverlayState> => {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id == null) {
    throw new Error('No active tab found');
  }

  if (isStandaloneGameUrl(activeTab.url)) {
    return {
      ok: true,
      state: 'standalone-game-page',
      isOpen: true,
    };
  }

  try {
    return await sendGetGameStateMessage(activeTab.id);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    return {
      ok: true,
      state: 'closed',
      isOpen: false,
    };
  }
};
