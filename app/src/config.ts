export const VIEW_W = 512;
export const VIEW_H = 288;
export const STAGE_W = 800;
/** Screen-space y of the arena floor. World y is height above it. */
export const GROUND_Y = 258;
export const WALL_MARGIN = 22;
/** Fighters can't drift further apart than this, so both always stay on screen. */
export const MAX_SEPARATION = VIEW_W - 70;
export const ROUND_FRAMES = 99 * 60;
export const ROUNDS_TO_WIN = 2;
export const METER_MAX = 100;
export const FONT = '"Press Start 2P", monospace';
/** Stamped into replays and feedback reports; headless tools (simtest) run without Vite's define. */
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
