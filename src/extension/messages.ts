export const OPEN_GAME_MESSAGE = 'happy-clawd:open-game';
export const SET_BACKDROP_BLUR_MESSAGE = 'happy-clawd:set-backdrop-blur';

export type SetBackdropBlurMessage = {
  type: typeof SET_BACKDROP_BLUR_MESSAGE;
  blurPx: number;
};
