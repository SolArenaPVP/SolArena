import { solve, type Pose } from '../rig';
import { idlePose, introPresentation, winPresentation, type Presentation } from '../sim/flair';
import type { Fighter } from '../sim/match';
import { stanceOf } from '../sim/moves';
import { ROSTER, type FighterId } from '../sim/roster';
import { drawFlairBack, drawFlairFront } from './flair';
import { LOOKS, type LookInfo } from './looks';
import { Painter, animStep, pixelize, type PixelFx } from './paint';

const SW = 280;
const SH = 240;
const OX = 140;
const OY = 210;
/** Room around the skeleton for hair, cloth, tails, the lash and aura rings. */
const MARGIN = 50;
const CACHE_MAX = 700;

interface Frame {
  canvas: HTMLCanvasElement;
  /** Floor point inside the frame canvas. */
  ox: number;
  oy: number;
}

/**
 * Painted, pixelized frames keyed by everything that affects them. Poses and
 * clocks are quantized, so idle/walk/attack frames repeat and most frames are
 * cache hits, like a sprite sheet that fills itself in on first use.
 */
const cache = new Map<string, Frame>();

const r2 = (n: number) => Math.round(n * 100);

function poseKey(p: Pose) {
  return [p.hx, p.hy, p.lean, p.head, p.rot, p.fh[0], p.fh[1], p.bh[0], p.bh[1], p.ff[0], p.ff[1], p.bf[0], p.bf[1]].map(r2).join(',') + (p.feetRel ? 'r' : '');
}

function fxKey(fx: PixelFx) {
  const tint = fx.tint ? `${fx.tint.color}${Math.round(fx.tint.amount * 20)}` : '';
  return `${fx.flash ? 'F' : ''}${tint}${fx.dither ? 'D' : ''}${fx.aura ?? ''}${fx.alt ? 'A' : ''}`;
}

let work: CanvasRenderingContext2D | null = null;

function workCtx() {
  if (!work) {
    const c = document.createElement('canvas');
    c.width = SW;
    c.height = SH;
    work = c.getContext('2d', { willReadFrequently: true })!;
  }
  return work;
}

function render(id: FighterId, pose: Pose, facing: 1 | -1, info: LookInfo, fx: PixelFx): Frame {
  const c = workCtx();
  const def = ROSTER[id];
  const j = solve(def.dims, pose);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, SW, SH);
  c.setTransform(facing, 0, 0, -1, OX, OY);
  LOOKS[id](new Painter(c), j, def.dims, info);
  c.setTransform(1, 0, 0, 1, 0, 0);

  const pts = [j.hip, j.neck, j.head, j.fhand, j.bhand, j.ffoot, j.bfoot, j.fk, j.bk, j.fe, j.be];
  const xs = pts.map((p) => OX + facing * p[0]);
  const ys = pts.map((p) => OY - p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - MARGIN));
  const x1 = Math.min(SW, Math.ceil(Math.max(...xs) + MARGIN));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - MARGIN));
  const y1 = Math.min(SH, Math.ceil(Math.max(...ys) + MARGIN * 0.5));
  const img = pixelize(c, x0, y0, x1 - x0, y1 - y0, fx);

  const out = document.createElement('canvas');
  out.width = img.width;
  out.height = img.height;
  out.getContext('2d')!.putImageData(img, 0, 0);
  return { canvas: out, ox: OX - x0, oy: OY - y0 };
}

export class SpriteCanvas {
  private frame: Frame | null = null;

  paint(id: FighterId, pose: Pose, facing: 1 | -1, info: LookInfo, fx: PixelFx) {
    const key = `${id}|${facing}|${poseKey(pose)}|${info.t}|${Math.round(info.speed)}|${info.special ? 1 : 0}${info.powered ? 1 : 0}|${info.lash}|${fxKey(fx)}`;
    let f = cache.get(key);
    if (f) {
      cache.delete(key);
    } else {
      f = render(id, pose, facing, info, fx);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    }
    cache.set(key, f);
    this.frame = f;
  }

  /** Blit with the fighter's floor point at (x, y). */
  blit(target: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
    const f = this.frame;
    if (!f) return;
    target.drawImage(f.canvas, Math.round(x - f.ox * scale), Math.round(y - f.oy * scale), f.canvas.width * scale, f.canvas.height * scale);
  }
}

export type PreviewKind = 'idle' | 'win' | 'intro';

/** Paint and blit a fighter outside of a match (menus, results), including intro/victory staging. */
export function drawPreview(g: CanvasRenderingContext2D, sprite: SpriteCanvas, id: FighterId, kind: PreviewKind, t: number, x: number, y: number, facing: 1 | -1, scale = 1, aura?: string) {
  const def = ROSTER[id];
  const st = stanceOf(def);
  const pres: Presentation = kind === 'idle' ? { pose: idlePose(def, st, t), dx: 0, dy: 0 } : kind === 'win' ? winPresentation(def, t) : introPresentation(def, st, t);
  drawStaged(g, sprite, id, pres, t, x, y, facing, scale, { outline: '#0d0816', aura }, { t: animStep(t), speed: 0, special: false, powered: false, lash: 0 });
}

/** Blit a fighter with its presentation applied: offset, float, turn, vanish, and flair effects. */
export function drawStaged(g: CanvasRenderingContext2D, sprite: SpriteCanvas, id: FighterId, pres: Presentation, t: number, x: number, floorY: number, facing: 1 | -1, scale: number, fx: PixelFx, info: LookInfo) {
  const def = ROSTER[id];
  const et = pres.effectT ?? t;
  g.save();
  g.translate(Math.round(x + facing * pres.dx * scale), floorY);
  g.scale(scale, scale);
  drawFlairBack(g, pres.effect, et, 0, -pres.dy, def);
  if (!pres.hidden) {
    sprite.paint(id, pres.pose, pres.turned ? (facing === 1 ? -1 : 1) : facing, info, pres.dither ? { ...fx, dither: true } : fx);
    sprite.blit(g, 0, -pres.dy, 1);
  }
  drawFlairFront(g, pres.effect, et, 0, -pres.dy, 0, facing, def);
  g.restore();
}

export function fighterLook(f: Fighter): LookInfo {
  const mv = f.move;
  const lashing = f.def.id === 'chairman' && f.state === 'attack' && mv?.slot === 'heavy' && f.mf > mv.startup - 2 && f.mf <= mv.startup + mv.active + 3;
  return {
    t: animStep(f.tick),
    speed: Math.abs(f.vx),
    special: f.state === 'attack' && (mv?.slot === 'special' || mv?.slot === 'super' || mv?.slot === 'counterStrike'),
    powered: f.powered,
    lash: lashing ? f.def.heavyReach ?? 0 : 0,
  };
}

export function fighterFx(f: Fighter, frame: number): PixelFx {
  const fx: PixelFx = { outline: '#0d0816' };
  if (f.flash > 0 && f.flash % 2 === 1) fx.flash = true;
  else if (f.armorFlash > 0) fx.tint = { color: '#ffb02e', amount: 0.45 };
  else if (f.slow > 0) fx.tint = { color: '#5dff5a', amount: 0.22 + 0.08 * Math.sin(frame * 0.3) };
  if (f.vanished()) fx.dither = true;
  if (f.powered || (f.state === 'attack' && f.move?.slot === 'counterStrike')) fx.aura = frame % 4 < 2 ? f.def.color : '#ffffff';
  else if (f.def.id === 'buddha' && f.state === 'attack' && f.move?.counter) fx.aura = frame % 6 < 3 ? '#ffd23a' : '#fff4b0';
  return fx;
}
