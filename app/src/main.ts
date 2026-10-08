import '@fontsource/press-start-2p';
import { loadArt } from './art';
import { audio } from './audio';
import { beta } from './beta';
import { FONT, VIEW_H, VIEW_W } from './config';
import { game } from './game';
import { input } from './input';
import { TitleScene } from './scenes/title';

const display = document.getElementById('screen') as HTMLCanvasElement;
const dctx = display.getContext('2d')!;
const world = document.createElement('canvas');
world.width = VIEW_W;
world.height = VIEW_H;
const wctx = world.getContext('2d')!;
const uiCanvas = document.createElement('canvas');
const uctx = uiCanvas.getContext('2d')!;
let scale = 1;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  // A hidden tab can report a 0x0 window; never let the canvases collapse to zero.
  const cssW = Math.max(VIEW_W / 4, Math.floor(VIEW_W * s));
  const cssH = Math.max(VIEW_H / 4, Math.floor(VIEW_H * s));
  display.style.width = `${cssW}px`;
  display.style.height = `${cssH}px`;
  display.width = Math.round(cssW * dpr);
  display.height = Math.round(cssH * dpr);
  uiCanvas.width = display.width;
  uiCanvas.height = display.height;
  scale = display.width / VIEW_W;
}

function drawLoading(msg: string) {
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.fillStyle = '#05030d';
  dctx.fillRect(0, 0, display.width, display.height);
  dctx.setTransform(scale, 0, 0, scale, 0, 0);
  dctx.fillStyle = '#9fe8ff';
  dctx.font = `8px ${FONT}, monospace`;
  dctx.textAlign = 'center';
  dctx.fillText(msg, VIEW_W / 2, VIEW_H / 2);
}

const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number) {
  acc += Math.min(100, now - last);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    game.scene.update();
    game.frame++;
    acc -= STEP;
    steps++;
  }
  if (steps === 4) acc = 0;

  wctx.setTransform(1, 0, 0, 1, 0, 0);
  wctx.imageSmoothingEnabled = false;
  wctx.globalAlpha = 1;
  uctx.setTransform(1, 0, 0, 1, 0, 0);
  uctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  uctx.setTransform(scale, 0, 0, scale, 0, 0);
  uctx.imageSmoothingEnabled = true;
  game.scene.draw(wctx, uctx);

  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(world, 0, 0, display.width, display.height);
  dctx.drawImage(uiCanvas, 0, 0);
  requestAnimationFrame(frame);
}

async function boot() {
  resize();
  window.addEventListener('resize', resize);
  drawLoading('LOADING...');
  input.attach(window);
  input.anyKeyListeners.push(() => audio.unlock());
  await Promise.all([document.fonts.load(`16px ${FONT}`), loadArt()]);
  game.init();
  beta.track('session_start', { screen: `${window.innerWidth}x${window.innerHeight}` });
  game.go(new TitleScene());
  display.focus();
  if (import.meta.env.DEV) await import('./devtools');
  last = performance.now();
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  drawLoading('FAILED TO LOAD - CHECK CONSOLE');
});
