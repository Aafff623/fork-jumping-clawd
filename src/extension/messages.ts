export const OPEN_GAME_MESSAGE = 'happy-clawd:open-game';
export const CLOSE_GAME_MESSAGE = 'happy-clawd:close-game';
export const GET_GAME_STATE_MESSAGE = 'happy-clawd:get-game-state';
export const SET_BACKDROP_BLUR_MESSAGE = 'happy-clawd:set-backdrop-blur';

export const GAME_MODES = ['casual', 'competitive'] as const;
export const DEFAULT_GAME_MODE = 'casual';

export type GameMode = (typeof GAME_MODES)[number];

export const isGameMode = (value: unknown): value is GameMode =>
  typeof value === 'string' && GAME_MODES.includes(value as GameMode);

export type OpenGameMessage = {
  type: typeof OPEN_GAME_MESSAGE;
  mode?: GameMode;
};

export type SetBackdropBlurMessage = {
  type: typeof SET_BACKDROP_BLUR_MESSAGE;
  blurPx: number;
};
