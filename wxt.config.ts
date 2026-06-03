import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Jumping Clawd',
    description: 'Play Jumping Clawd on the current page.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://xletejbcfylwplhnlbjo.supabase.co/*'],
    web_accessible_resources: [
      {
        resources: ['game.html'],
        matches: ['<all_urls>'],
      },
    ],
    commands: {
      'jumping-clawd-open-casual-game': {
        suggested_key: {
          default: 'Ctrl+Comma',
          mac: 'MacCtrl+Comma',
        },
        description: 'Start Jumping Clawd casual mode on the current page',
      },
      'jumping-clawd-open-challenge-game': {
        suggested_key: {
          default: 'Ctrl+Period',
          mac: 'MacCtrl+Period',
        },
        description: 'Start Jumping Clawd challenge mode on the current page',
      },
    },
  },
});
