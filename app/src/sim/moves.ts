import type { Sfx } from '../audio';
import { P, POSES, STRIKES, easeInOut, easeOut, lerpPose, solve, type Dims, type Pose, type StrikePoses, type V } from '../rig';
import type { FighterDef } from './roster';
import type { Fighter, Match } from './match';

export type Height = 'mid' | 'low' | 'high';

/** Axis-aligned box in fighter-local space: x forward from body center, y up from the floor. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HitSpec {
  damage: number;
  hitstun: number;
  blockstun: number;
  push: number;
  height: Height;
  /** Upward velocity on hit; any launch puts the defender into a juggle state. */
  launch?: number;
  knockdown?: boolean;
  chip?: number;
  hitstop?: number;
  heavy?: boolean;
  spark?: SparkKind;
  sfx?: Sfx;
  /** Extra effect applied on hit (PEPE's slow). */
  slow?: number;
}

export type SparkKind = 'hit' | 'heavy' | 'block' | 'counter' | 'armor' | 'zap' | 'ice' | 'salt' | 'candle' | 'yap' | 'claw' | 'slap';

export type MoveSlot =
  | 'light' | 'heavy' | 'clight' | 'cheavy' | 'alight' | 'aheavy'
  | 'throw' | 'throwHold' | 'special' | 'super' | 'counterStrike';

export interface MoveDef {
  slot: MoveSlot;
  startup: number;
  active: number;
  recovery: number;
  hit?: HitSpec;
  box?: Box;
  hits?: number;
  hitEvery?: number;
  cancels?: MoveSlot[];
  air?: boolean;
  /** Gravity applies during the move and landing ends it (pounces, leaps). */
  ballistic?: boolean;
  landRecovery?: number;
  invuln?: [number, number];
  armor?: [number, number];
  counter?: [number, number];
  passThrough?: [number, number];
  cooldown?: number;
  pose: (mf: number, f: Fighter) => Pose;
  script?: (m: Match, f: Fighter, mf: number) => void;
  sfx?: Sfx;
}

type Limb = 'fh' | 'bh' | 'ff' | 'bf' | 'body';

/** Hitbox around the limb that does the hitting in the given pose, so boxes always match the art. */
export function boxAround(d: Dims, pose: Pose, limbs: Limb[], pad: number, extend = 0): Box {
  const j = solve(d, pose);
  const pts: V[] = [];
  for (const limb of limbs) {
    if (limb === 'fh') pts.push(j.fe, j.fhand);
    if (limb === 'bh') pts.push(j.be, j.bhand);
    if (limb === 'ff') pts.push(j.fk, j.ffoot);
    if (limb === 'bf') pts.push(j.bk, j.bfoot);
    if (limb === 'body') pts.push(j.hip, j.neck, j.head);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad + extend;
  const y0 = Math.max(0, Math.min(...ys) - pad);
  const y1 = Math.max(...ys) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const stanceOf = (def: FighterDef): Pose => P({ ...def.stance });

/** Wind up, snap to the hit pose for the active frames, ease back during recovery. */
export function strikeAnim(base: Pose, sp: StrikePoses, s: number, a: number, r: number) {
  return (mf: number): Pose => {
    if (mf <= s) {
      const t = mf / s;
      return t < 0.55 ? lerpPose(base, sp.windup, easeOut(t / 0.55)) : lerpPose(sp.windup, sp.hit, easeOut((t - 0.55) / 0.45));
    }
    if (mf <= s + a) return sp.hit;
    return lerpPose(sp.hit, base, easeInOut(Math.min(1, (mf - s - a) / r)));
  };
}

/** Keyframed animation: [frame, pose] pairs, eased between. */
export function keyed(keys: [number, Pose][]) {
  return (mf: number): Pose => {
    if (mf <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (mf <= keys[i][0]) {
        const [f0, p0] = keys[i - 1];
        const [f1, p1] = keys[i];
        return lerpPose(p0, p1, easeInOut((mf - f0) / Math.max(1, f1 - f0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}

interface StrikeOpts {
  startup: number;
  active: number;
  recovery: number;
  hit: HitSpec;
  limbs: Limb[];
  pad?: number;
  extend?: number;
  cancels?: MoveSlot[];
  air?: boolean;
}

function strike(def: FighterDef, slot: MoveSlot, sp: StrikePoses, base: Pose, o: StrikeOpts): MoveDef {
  const s = Math.max(3, Math.round(o.startup * def.speed));
  const a = o.active;
  const r = Math.max(4, Math.round(o.recovery * def.speed));
  return {
    slot, startup: s, active: a, recovery: r,
    hit: { ...o.hit, damage: Math.round(o.hit.damage * def.power) },
    box: boxAround(def.dims, sp.hit, o.limbs, o.pad ?? 4, o.extend ?? 0),
    cancels: o.cancels,
    air: o.air,
    landRecovery: o.air ? 5 : undefined,
    pose: strikeAnim(base, sp, s, a, r),
    sfx: 'whoosh',
  };
}

const HEAVY_STYLE: Record<FighterDef['heavy'], { limbs: Limb[]; startup: number; active: number; recovery: number; damage: number; pad: number }> = {
  kick: { limbs: ['ff'], startup: 10, active: 4, recovery: 17, damage: 82, pad: 4 },
  haymaker: { limbs: ['bh'], startup: 11, active: 4, recovery: 18, damage: 88, pad: 5 },
  palm: { limbs: ['bh'], startup: 12, active: 5, recovery: 18, damage: 92, pad: 6 },
  slam: { limbs: ['body', 'fh'], startup: 11, active: 5, recovery: 19, damage: 86, pad: 3 },
};

export function buildMoves(def: FighterDef): Record<MoveSlot, MoveDef> {
  const stance = stanceOf(def);
  const hs = HEAVY_STYLE[def.heavy];
  const light = strike(def, 'light', STRIKES.light, stance, {
    startup: 5, active: 3, recovery: 9, limbs: ['fh'],
    hit: { damage: 40, hitstun: 16, blockstun: 11, push: 3, height: 'mid', hitstop: 6, spark: 'hit', sfx: 'light' },
    cancels: ['light', 'heavy', 'special', 'super'],
  });
  const heavy = strike(def, 'heavy', STRIKES[def.heavy], stance, {
    startup: hs.startup, active: hs.active, recovery: hs.recovery, limbs: hs.limbs, pad: hs.pad, extend: def.heavyReach,
    hit: { damage: hs.damage, hitstun: 22, blockstun: 16, push: 5, height: 'mid', hitstop: 10, heavy: true, spark: 'heavy', sfx: 'heavy' },
    cancels: ['special', 'super'],
  });
  if (def.heavy === 'slam') {
    heavy.script = (_m, f, mf) => {
      if (mf > heavy.startup - 4 && mf <= heavy.startup + 2) f.vx = f.facing * 3.2;
      else if (mf === heavy.startup + 3) f.vx = 0;
    };
  }
  // BUDDHA's palm walks through one hit: counter/tank identity.
  if (def.id === 'buddha') heavy.armor = [3, heavy.startup];
  const clight = strike(def, 'clight', STRIKES.clight, POSES.crouch, {
    startup: 5, active: 3, recovery: 9, limbs: ['fh'],
    hit: { damage: 32, hitstun: 15, blockstun: 10, push: 2.6, height: 'low', hitstop: 6, spark: 'hit', sfx: 'light' },
    cancels: ['clight', 'light', 'heavy', 'cheavy', 'special', 'super'],
  });
  const cheavy = strike(def, 'cheavy', STRIKES.sweep, POSES.crouch, {
    startup: 9, active: 4, recovery: 22, limbs: ['ff'], pad: 4,
    hit: { damage: 70, hitstun: 30, blockstun: 15, push: 3, height: 'low', knockdown: true, launch: 2.6, hitstop: 10, heavy: true, spark: 'heavy', sfx: 'heavy' },
    cancels: ['special', 'super'],
  });
  const alight = strike(def, 'alight', STRIKES.alight, POSES.jump, {
    startup: 5, active: 8, recovery: 6, limbs: ['fh'], air: true,
    hit: { damage: 38, hitstun: 16, blockstun: 11, push: 2.5, height: 'high', hitstop: 6, spark: 'hit', sfx: 'light' },
  });
  const aheavy = strike(def, 'aheavy', STRIKES.aheavy, POSES.jump, {
    startup: 8, active: 9, recovery: 8, limbs: ['ff'], air: true, pad: 5,
    hit: { damage: 72, hitstun: 20, blockstun: 14, push: 3.5, height: 'high', hitstop: 10, heavy: true, spark: 'heavy', sfx: 'heavy' },
  });

  const throwMove: MoveDef = {
    slot: 'throw', startup: 3, active: 3, recovery: 22,
    pose: keyed([[0, stance], [3, POSES.grab], [8, POSES.grab], [28, stance]]),
    script: (m, f, mf) => {
      if (mf >= 4 && mf <= 6) m.tryThrow(f);
    },
    sfx: 'whoosh',
  };
  const throwHold: MoveDef = {
    slot: 'throwHold', startup: 22, active: 1, recovery: 16,
    pose: keyed([[0, POSES.grab], [10, POSES.grab], [20, POSES.toss], [39, stance]]),
    script: (m, f, mf) => m.holdThrow(f, mf),
  };

  const sp = SPECIALS[def.id](def, stance);
  return { light, heavy, clight, cheavy, alight, aheavy, throw: throwMove, throwHold, ...sp };
}

// ---------------------------------------------------------------------------
// Signature specials. Each fighter's special is one button (U); its super is
// the same idea, powered up, for a full meter (U+K).
// ---------------------------------------------------------------------------

type SpecialSet = Pick<Record<MoveSlot, MoveDef>, 'special' | 'super' | 'counterStrike'>;

const noop: MoveDef = { slot: 'counterStrike', startup: 1, active: 0, recovery: 1, pose: () => POSES.stance };

const SPECIALS: Record<FighterDef['id'], (def: FighterDef, stance: Pose) => SpecialSet> = {
  daumen: (_def, stance) => {
    const talkA = P({ lean: -0.12, head: -0.3, fh: [0.85, 0.45], bh: [-0.35, 0.3] });
    const talkB = P({ lean: 0.1, head: 0.1, fh: [0.95, 0.15], bh: [-0.2, 0.5] });
    const yapPose = (startup: number, total: number) => (mf: number) => {
      if (mf <= startup) return lerpPose(stance, talkA, easeOut(mf / startup));
      if (mf > total - 14) return lerpPose(talkA, stance, easeInOut((mf - (total - 14)) / 14));
      return Math.floor(mf / 5) % 2 ? talkA : talkB;
    };
    // Short-range spray rather than a fullscreen fireball: DAUMEN is pressure, not zoning.
    const fire = (m: Match, f: Fighter, heights: number[], speed: number, damage: number, powered: boolean, life: number) => {
      for (let i = 0; i < heights.length; i++) {
        m.spawn({
          owner: f.side, kind: 'yap', x: f.x + f.facing * 26, y: heights[i], vx: f.facing * speed * (1 + i * 0.05), vy: 0,
          w: powered ? 30 : 24, h: powered ? 20 : 16, life, delay: i * (powered ? 5 : 4), facing: f.facing,
          hit: { damage, hitstun: 17, blockstun: 11, push: 2, height: 'mid', chip: 4, hitstop: 5, spark: 'yap', sfx: 'light', launch: i === heights.length - 1 ? 3.5 : undefined },
          clash: true, variant: Math.floor(m.rand() * 6), powered,
        });
      }
    };
    const special: MoveDef = {
      slot: 'special', startup: 10, active: 16, recovery: 12, cooldown: 80, pose: yapPose(10, 38),
      script: (m, f, mf) => {
        if (mf >= 4 && mf <= 16) f.vx = f.facing * 2.4;
        else if (mf === 17) f.vx = 0;
        if (mf === 10) {
          fire(m, f, [30, 52, 38, 60], 4.6, 22, false, 40);
          m.emit({ t: 'sfx', name: 'yap' });
        }
      },
    };
    const sup: MoveDef = {
      slot: 'super', startup: 10, active: 30, recovery: 16, invuln: [0, 12], pose: yapPose(10, 56),
      script: (m, f, mf) => {
        if (mf === 10) {
          fire(m, f, [22, 50, 34, 62, 28, 44, 56, 30], 5, 36, true, 80);
          m.emit({ t: 'sfx', name: 'yap' });
        }
        if (mf === 20) m.emit({ t: 'sfx', name: 'yap' });
      },
    };
    return { special, super: sup, counterStrike: noop };
  },

  chairman: (_def, stance) => {
    const cast = P({ hy: -0.18, lean: 0.25, head: -0.2, fh: [0.6, -0.65], bh: [0.2, -0.5], ff: [0.34, 0], bf: [-0.3, 0] });
    const pose = keyed([[0, stance], [8, P({ lean: -0.15, fh: [0.4, 0.8], bh: [0.1, 0.7] })], [14, cast], [30, cast], [44, stance]]);
    const trap = (m: Match, f: Fighter, x: number, delay: number, damage: number, powered: boolean) => {
      m.spawn({
        owner: f.side, kind: 'candle', x, y: 0, vx: 0, vy: 0, w: powered ? 30 : 26, h: powered ? 130 : 112,
        life: delay + 16, delay, facing: f.facing, ground: true, clash: false, variant: 0, powered,
        hit: { damage, hitstun: 26, blockstun: 14, push: 1.5, height: 'mid', launch: 7.5, chip: 8, hitstop: 10, heavy: true, spark: 'candle', sfx: 'heavy' },
      });
    };
    const special: MoveDef = {
      slot: 'special', startup: 14, active: 4, recovery: 26, cooldown: 185, invuln: [5, 18], pose,
      script: (m, f, mf) => {
        if (mf === 10) {
          // Bear Trap: under the opponent, or just ahead of them if they're rushing in.
          const o = m.other(f);
          const toward = Math.sign(f.x - o.x);
          const rushing = Math.sign(o.vx) === toward && Math.abs(o.vx) > 0.5;
          trap(m, f, rushing ? o.x + toward * 36 : o.x, 36, 62, false);
          m.emit({ t: 'sfx', name: 'candle' });
        }
      },
    };
    const sup: MoveDef = {
      slot: 'super', startup: 14, active: 20, recovery: 22, invuln: [0, 34], pose: keyed([[0, stance], [8, cast], [44, cast], [56, stance]]),
      script: (m, f, mf) => {
        if (mf === 10) {
          const ox = m.other(f).x;
          trap(m, f, ox, 18, 70, true);
          trap(m, f, ox - 46, 30, 70, true);
          trap(m, f, ox + 46, 30, 70, true);
          trap(m, f, ox, 44, 90, true);
          m.emit({ t: 'sfx', name: 'candle' });
        }
      },
    };
    return { special, super: sup, counterStrike: noop };
  },

  cate: (def, stance) => {
    const crouch = P({ hx: 0, hy: -0.42, lean: 0.6, head: -0.5, fh: [0.6, -0.2], bh: [0.5, -0.1], ff: [0.3, 0], bf: [-0.35, 0] });
    const leap = P({ hy: 0.05, lean: 1.0, head: -0.9, rot: 0.35, fh: [1.05, 0.05], bh: [0.95, 0.25], ff: [-0.35, 0.35], bf: [-0.7, 0.5] });
    const claw = P({ hy: 0.05, lean: 0.95, head: -0.8, rot: 0.3, fh: [0.85, -0.3], bh: [1.05, 0.2], ff: [-0.3, 0.4], bf: [-0.65, 0.5] });
    const box = boxAround(def.dims, leap, ['fh', 'bh', 'body'], 4);
    const mk = (slot: 'special' | 'super', hits: number, vx: number, damage: number): MoveDef => ({
      slot, startup: 7, active: 40, recovery: 1, hits, hitEvery: slot === 'super' ? 5 : 6, ballistic: true, landRecovery: 12,
      cooldown: 60, invuln: slot === 'super' ? [0, 16] : undefined, box,
      hit: { damage, hitstun: 20, blockstun: 9, push: 1.2, height: 'mid', chip: 3, hitstop: 5, spark: 'claw', sfx: 'light' },
      pose: (mf) => (mf <= 7 ? lerpPose(stance, crouch, easeOut(mf / 7)) : Math.floor(mf / 4) % 2 ? leap : claw),
      script: (m, f, mf) => {
        if (mf === 7) {
          f.vy = slot === 'super' ? 5.6 : 4.8;
          f.vx = f.facing * vx;
          m.emit({ t: 'sfx', name: 'pounce' });
        }
        if (mf > 7 && f.moveHits === hits - 1) f.moveHit = { ...f.move!.hit!, launch: slot === 'super' ? 7 : 4.5, hitstop: 10, sfx: 'heavy' };
      },
    });
    return { special: mk('special', 3, 6.4, 33), super: mk('super', 6, 7.4, 32), counterStrike: noop };
  },

  doge: (def, stance) => {
    const wind = P({ hx: -0.12, lean: -0.3, head: 0.15, fh: [0.4, 0.1], bh: [-0.55, 0.65], ff: [0.3, 0], bf: [-0.35, 0] });
    const slap = P({ hx: 0.22, hy: -0.12, lean: 0.6, head: -0.3, fh: [0.0, -0.3], bh: [1.1, 0.1], ff: [0.6, 0], bf: [-0.3, 0] });
    const slap2 = P({ hx: 0.2, hy: -0.12, lean: 0.55, head: -0.3, fh: [1.1, 0.15], bh: [-0.2, 0.2], ff: [0.6, 0], bf: [-0.3, 0] });
    const box = boxAround(def.dims, slap, ['bh'], 9);
    const special: MoveDef = {
      slot: 'special', startup: 15, active: 4, recovery: 26, cooldown: 105, armor: [6, 12], box,
      hit: { damage: 100, hitstun: 30, blockstun: 18, push: 7, height: 'mid', launch: 4.5, knockdown: true, chip: 10, hitstop: 16, heavy: true, spark: 'slap', sfx: 'slap' },
      pose: keyed([[0, stance], [10, wind], [15, slap], [19, slap], [43, stance]]),
      script: (_m, f, mf) => {
        if (mf >= 8 && mf <= 17) f.vx = f.facing * 3.4;
        else if (mf === 18) f.vx = 0;
      },
    };
    const sup: MoveDef = {
      slot: 'super', startup: 12, active: 28, recovery: 22, armor: [0, 40], invuln: [0, 12], box, hits: 3, hitEvery: 11,
      hit: { damage: 78, hitstun: 26, blockstun: 16, push: 2.5, height: 'mid', chip: 10, hitstop: 12, heavy: true, spark: 'slap', sfx: 'slap' },
      pose: keyed([[0, stance], [8, wind], [12, slap], [20, slap2], [24, wind], [30, slap], [38, slap2], [62, stance]]),
      script: (_m, f, mf) => {
        if (mf >= 6 && mf <= 38) f.vx = f.facing * 2.6;
        else if (mf === 39) f.vx = 0;
        if (f.moveHits === 2) f.moveHit = { ...f.move!.hit!, damage: 140, launch: 7.5, push: 6, hitstop: 20 };
      },
    };
    return { special, super: sup, counterStrike: noop };
  },

  pepe: (_def, stance) => {
    const wind = P({ hx: -0.06, lean: -0.3, head: 0.1, fh: [0.5, 0.2], bh: [-0.55, 0.7], ff: [0.32, 0], bf: [-0.32, 0] });
    const toss = P({ hx: 0.1, lean: 0.45, head: -0.2, fh: [0.1, -0.2], bh: [1.0, 0.45], ff: [0.45, 0], bf: [-0.3, 0] });
    const pose = keyed([[0, stance], [9, wind], [13, toss], [18, toss], [34, stance]]);
    // Lobbed like a mortar: speed is picked so the shaker lands on the opponent, give or take a wildcard wobble.
    const SALT_FLIGHT = 47;
    const aim = (m: Match, f: Fighter, offset = 0) => {
      const dist = Math.abs(m.other(f).x + offset - (f.x + f.facing * 20));
      return Math.max(1.6, Math.min(5.2, dist / SALT_FLIGHT)) * (0.9 + m.rand() * 0.2);
    };
    const throwShaker = (m: Match, f: Fighter, vx: number, variant: number, powered: boolean) => {
      m.spawn({
        owner: f.side, kind: 'salt', x: f.x + f.facing * 20, y: 62, vx: f.facing * vx, vy: 4.4, gravity: 0.24,
        w: 14, h: 16, life: 140, delay: 0, facing: f.facing, clash: true, variant, powered,
        hit: saltHit(variant, true),
      });
    };
    const special: MoveDef = {
      slot: 'special', startup: 11, active: 2, recovery: 13, cooldown: 62, pose,
      script: (m, f, mf) => {
        if (mf === 11) {
          throwShaker(m, f, aim(m, f), Math.floor(m.rand() * 3), false);
          m.emit({ t: 'sfx', name: 'whoosh' });
        }
      },
    };
    const sup: MoveDef = {
      slot: 'super', startup: 13, active: 2, recovery: 22, invuln: [0, 15], pose,
      script: (m, f, mf) => {
        if (mf === 13) {
          for (const off of [-40, 0, 40]) throwShaker(m, f, aim(m, f, off * f.facing), 1, true);
          m.emit({ t: 'sfx', name: 'whoosh' });
        }
      },
    };
    return { special, super: sup, counterStrike: noop };
  },

  orangie: (_def, stance) => {
    const up = P({ hy: 0.02, lean: -0.2, head: -0.2, fh: [0.3, 0.9], bh: [0.15, 0.85], ff: [0.25, 0], bf: [-0.25, 0] });
    const down = P({ hy: -0.3, lean: 0.65, head: -0.4, fh: [0.95, -0.75], bh: [0.8, -0.65], ff: [0.35, 0], bf: [-0.3, 0] });
    const pose = keyed([[0, stance], [9, up], [14, down], [22, down], [40, stance]]);
    const wave = (m: Match, f: Fighter, powered: boolean, delay: number, trailing = false) => {
      m.spawn({
        owner: f.side, kind: 'ice', x: f.x + f.facing * 30, y: 0, vx: f.facing * (powered ? 5 : 4.8), vy: 0,
        w: powered ? 40 : 28, h: powered ? 64 : 30, life: powered ? 80 : 62, delay, facing: f.facing, ground: true, clash: false, variant: 0, powered,
        hit: trailing
          ? { damage: 42, hitstun: 24, blockstun: 12, push: 2, height: 'mid', launch: 4, chip: 6, hitstop: 8, heavy: true, spark: 'ice', sfx: 'heavy' }
          : powered
          ? { damage: 110, hitstun: 30, blockstun: 18, push: 3, height: 'mid', launch: 8, chip: 12, hitstop: 14, heavy: true, spark: 'ice', sfx: 'heavy' }
          : { damage: 74, hitstun: 28, blockstun: 14, push: 2.5, height: 'low', knockdown: true, launch: 3, chip: 6, hitstop: 9, heavy: true, spark: 'ice', sfx: 'heavy' },
      });
    };
    const special: MoveDef = {
      slot: 'special', startup: 14, active: 2, recovery: 15, cooldown: 58, pose,
      script: (m, f, mf) => {
        if (mf === 14) {
          wave(m, f, false, 0);
          m.emit({ t: 'sfx', name: 'ice' });
          m.emit({ t: 'shake', amount: 3 });
        }
      },
    };
    const sup: MoveDef = {
      slot: 'super', startup: 14, active: 2, recovery: 24, invuln: [0, 16], pose,
      script: (m, f, mf) => {
        if (mf === 14) {
          // Glacier Call floods the floor: one big wave and two trailing ones lock down most of the arena.
          wave(m, f, true, 0);
          wave(m, f, true, 12, true);
          wave(m, f, true, 24, true);
          m.emit({ t: 'sfx', name: 'ice' });
          m.emit({ t: 'shake', amount: 6 });
        }
      },
    };
    return { special, super: sup, counterStrike: noop };
  },

  buddha: (def, stance) => {
    const zen = P({ hy: -0.1, lean: 0, head: 0.05, fh: [0.38, 0.4], bh: [0.35, -0.05], ff: [0.25, 0], bf: [-0.28, 0] });
    const palm = P({ hx: 0.2, hy: -0.12, lean: 0.4, head: -0.2, fh: [0.2, -0.2], bh: [1.1, 0.32], ff: [0.55, 0], bf: [-0.32, 0] });
    const special: MoveDef = {
      slot: 'special', startup: 4, active: 28, recovery: 24, cooldown: 70, counter: [4, 32],
      pose: keyed([[0, stance], [4, zen], [32, zen], [56, stance]]),
      script: (m, _f, mf) => {
        if (mf === 4) m.emit({ t: 'sfx', name: 'eye' });
      },
    };
    const counterStrike: MoveDef = {
      slot: 'counterStrike', startup: 3, active: 6, recovery: 20, invuln: [0, 14],
      box: { x: 0, y: 0, w: 140, h: 120 },
      hit: { damage: 132, hitstun: 30, blockstun: 18, push: 6, height: 'mid', launch: 7.5, hitstop: 18, heavy: true, spark: 'counter', sfx: 'counter' },
      pose: keyed([[0, zen], [3, palm], [9, palm], [29, stance]]),
    };
    const beamPose = keyed([[0, stance], [10, zen], [14, palm], [52, palm], [68, stance]]);
    const sup: MoveDef = {
      slot: 'super', startup: 14, active: 38, recovery: 16, invuln: [0, 20], pose: beamPose,
      script: (m, f, mf) => {
        if (mf === 14) {
          const reach = 420;
          m.spawn({
            owner: f.side, kind: 'beam', x: f.x + f.facing * (reach / 2 + 24), y: def.dims.thigh + def.dims.shin + 6, vx: 0, vy: 0,
            w: reach, h: 34, life: 36, delay: 0, facing: f.facing, clash: false, variant: 0, powered: true,
            hitsLeft: 5, rehit: 7,
            hit: { damage: 42, hitstun: 22, blockstun: 10, push: 1, height: 'mid', chip: 8, hitstop: 5, spark: 'counter', sfx: 'heavy', launch: 2 },
          });
          m.emit({ t: 'sfx', name: 'eye' });
          m.emit({ t: 'shake', amount: 5 });
        }
      },
    };
    return { special, super: sup, counterStrike };
  },

  decu: (def, stance) => {
    const crouch = P({ hy: -0.35, lean: 0.7, head: -0.5, fh: [0.4, -0.4], bh: [-0.5, -0.2], ff: [0.35, 0], bf: [-0.35, 0] });
    const run = P({ hx: 0.12, hy: -0.26, lean: 1.0, head: -0.8, fh: [1.0, -0.3], bh: [-0.95, 0.05], ff: [0.65, 0.02], bf: [-0.7, 0.3] });
    const box = boxAround(def.dims, run, ['body', 'fh'], 6);
    const special: MoveDef = {
      slot: 'special', startup: 6, active: 12, recovery: 21, cooldown: 110, invuln: [4, 8], passThrough: [5, 20], box,
      hit: { damage: 62, hitstun: 26, blockstun: 14, push: 2, height: 'mid', chip: 6, hitstop: 9, heavy: true, spark: 'zap', sfx: 'zap' },
      pose: keyed([[0, stance], [6, crouch], [7, run], [18, run], [34, stance]]),
      script: (m, f, mf) => {
        if (mf === 6) m.emit({ t: 'sfx', name: 'zap' });
        if (mf > 6 && mf <= 17) f.vx = f.facing * 10;
        else if (mf === 18) f.vx = 0;
      },
    };
    const sup: MoveDef = {
      slot: 'super', startup: 6, active: 36, recovery: 16, invuln: [0, 42], passThrough: [5, 44], box, hits: 3, hitEvery: 10,
      hit: { damage: 76, hitstun: 30, blockstun: 12, push: 0.5, height: 'mid', chip: 6, hitstop: 8, heavy: true, spark: 'zap', sfx: 'zap' },
      pose: (mf) => (mf <= 6 ? lerpPose(stance, crouch, mf / 6) : mf > 42 ? lerpPose(run, stance, Math.min(1, (mf - 42) / 16)) : run),
      script: (m, f, mf) => {
        const seg = Math.floor((mf - 7) / 12);
        if (mf > 6 && mf <= 42) {
          const local = (mf - 7) % 12;
          f.vx = local < 9 ? f.facing * (seg % 2 === 0 ? 11 : -11) : 0;
          if (local === 0) m.emit({ t: 'sfx', name: 'zap' });
        } else if (mf === 43) f.vx = 0;
        if (f.moveHits === 2) f.moveHit = { ...f.move!.hit!, damage: 96, launch: 7, hitstop: 14 };
      },
    };
    return { special, super: sup, counterStrike: noop };
  },
};

export function saltHit(variant: number, direct: boolean): HitSpec {
  const base = { hitstop: 7, spark: 'salt' as const, sfx: 'light' as const, chip: 5, height: 'mid' as const };
  // Every salt variant leaves a slow: PEPE is the status fighter.
  if (variant === 1) return { ...base, damage: direct ? 70 : 100, hitstun: 26, blockstun: 14, push: 3, knockdown: true, launch: 4, heavy: true, slow: 90 };
  if (variant === 2) return { ...base, damage: direct ? 46 : 60, hitstun: 22, blockstun: 12, push: 2, slow: 200 };
  return { ...base, damage: direct ? 70 : 92, hitstun: 22, blockstun: 12, push: 2.5, slow: 90 };
}

export const SALT_LABELS = ['SALTY!', 'MEGA SALT!', 'SLOWED!'];
