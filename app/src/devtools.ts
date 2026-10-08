/**
 * Dev-server-only console helpers for frame-stepping fights and inspecting
 * sprites. Loaded from main.ts behind import.meta.env.DEV, so never shipped.
 *
 *   await sol.train('pepe', 'doge')      start a training fight
 *   sol.freeze(); await sol.step(10)     pause the loop, advance N frames
 *   await sol.hold(['KeyU'], 2)          hold keys for N frames
 *   await sol.poses(['doge'], 'heavy')   paint a move's active pose at 2x
 */
import { game, type Mode, type Scene } from './game';
import { SpriteCanvas } from './render/sprite';
import { FightScene } from './scenes/fight';
import { buildMoves, type MoveDef, type MoveSlot } from './sim/moves';
import { ROSTER, type FighterId } from './sim/roster';

let pending = 0;
let inner: Scene | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));

const sol = {
  game,
  get scene() {
    return inner ?? game.scene;
  },
  async train(p1: FighterId, p2: FighterId, mode: Mode = 'training') {
    inner = null;
    game.go(new FightScene({ mode, p1, p2, rematches: 0 }));
  },
  freeze() {
    inner = game.scene;
    const target = inner;
    pending = 0;
    game.go({
      update() {
        if (pending > 0) {
          pending--;
          target.update();
        }
      },
      draw: (w, u) => target.draw(w, u),
    });
  },
  async step(n: number) {
    pending += n;
    for (let guard = 0; pending > 0 && guard < 4000; guard++) await sleep(4);
  },
  async hold(codes: string[], frames: number) {
    codes.forEach((c) => key('keydown', c));
    await sol.step(frames);
    codes.forEach((c) => key('keyup', c));
  },
  async move(id: FighterId, opp: FighterId, codes: string[], at: number) {
    await sol.train(id, opp);
    sol.freeze();
    await sol.step(4);
    await sol.hold(codes, 2);
    await sol.step(at);
  },
  poses(ids: FighterId[], slot: MoveSlot, frame: (mv: MoveDef) => number = (mv) => mv.startup + 1, scale = 2) {
    document.getElementById('lab')?.remove();
    const c = document.createElement('canvas');
    c.id = 'lab';
    c.width = 800;
    c.height = 450;
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9;background:#2a2060;image-rendering:pixelated';
    c.onclick = () => c.remove();
    document.body.appendChild(c);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const sp = new SpriteCanvas();
    ids.forEach((id, i) => {
      const mv = buildMoves(ROSTER[id])[slot];
      const x = ids.length === 1 ? 300 : 90 + i * (600 / (ids.length - 1));
      const lash = id === 'chairman' && slot === 'heavy' ? ROSTER[id].heavyReach ?? 0 : 0;
      sp.paint(id, mv.pose(frame(mv), null as never), 1, { t: 0, speed: 0, special: slot === 'special', powered: false, lash }, { outline: '#0d0816' });
      sp.blit(g, x, 420, scale);
      if (mv.box) {
        g.strokeStyle = '#ff2d55';
        g.strokeRect(x + mv.box.x * scale, 420 - (mv.box.y + mv.box.h) * scale, mv.box.w * scale, mv.box.h * scale);
      }
    });
  },
};

(window as unknown as { sol: typeof sol }).sol = sol;
