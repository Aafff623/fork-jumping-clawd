import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Happy Clawd',
    description: 'Play Happy Clawd on the current page.',
    permissions: ['activeTab', 'scripting', 'storage'],
    web_accessible_resources: [
      {
        resources: ['game.html'],
        matches: ['<all_urls>'],
      },
    ],
    commands: {
      'happy-clawd-open-game': {
        suggested_key: {
          default: 'Ctrl+H',
          mac: 'MacCtrl+H',
        },
        description: 'Start Happy Clawd on the current page',
      },
    },
  },
});
