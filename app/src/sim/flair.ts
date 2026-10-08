import { P, POSES, clamp01, easeInOut, easeOut, lerpPose, type Pose } from '../rig';
import { keyed } from './moves';
import type { FighterDef, FighterId } from './roster';

/**
 * Per-fighter personality: idle loops, round-1 intros and victory animations.
 * Pure functions of a frame counter, so they stay deterministic and the
 * renderer can replay them on menus without a match.
 */

/** Length of a round-1 intro before the ROUND 1 call. */
export const INTRO_FRAMES = 170;

export type FlairEffect = 'bandages' | 'unwrap' | 'halo' | 'ice' | 'iceTrail' | 'lightning' | 'yap' | 'salt' | 'dust' | 'flex';

export interface Presentation {
  pose: Pose;
  /** Visual offset in px; dx is along the fighter's facing (negative = from behind). */
  dx: number;
  dy: number;
  hidden?: boolean;
  dither?: boolean;
  /** Face away from the opponent (PEPE ignores you at first). */
  turned?: boolean;
  effect?: FlairEffect;
  effectT?: number;
}

const TAU = Math.PI * 2;
const loop = (t: number, period: number) => Math.sin(((t % period) / period) * TAU);

const MEDITATE = P({ hx: 0, hy: -0.72, lean: 0, head: 0.08, fh: [0.42, -0.55], bh: [0.38, -0.6], ff: [0.42, 0.08], bf: [0.12, 0.02] });
const ARMS_CROSSED = P({ lean: -0.06, head: 0.18, fh: [0.28, -0.08], bh: [0.34, 0.02] });
const POCKETS = P({ lean: -0.05, head: 0.22, fh: [0.06, -0.62], bh: [0.0, -0.62] });
const SLIDE = P({ hx: 0.05, hy: -0.3, lean: 0.55, head: -0.4, fh: [-0.4, -0.35], bh: [-0.55, -0.3], ff: [0.3, 0.02], bf: [-0.2, 0.02] });
const LEAP = P({ hy: 0.05, lean: 0.95, head: -0.85, rot: 0.3, fh: [1.0, 0.1], bh: [0.9, 0.25], ff: [-0.35, 0.35], bf: [-0.7, 0.5] });
const BOW = P({ hy: -0.05, lean: 0.65, head: 0.3, fh: [0.35, -0.25], bh: [0.35, -0.2], ff: [0.2, 0], bf: [-0.2, 0] });
const HORSE = P({ hy: -0.26, lean: 0.02, head: -0.05, fh: [0.75, 0.22], bh: [0.05, -0.18], ff: [0.46, 0], bf: [-0.46, 0] });
const SMUG = P({ hx: -0.04, lean: -0.22, head: -0.4, fh: [0.12, -0.25], bh: [0.05, -0.2], ff: [0.28, 0], bf: [-0.24, 0] });
const POINT = P({ lean: -0.05, head: -0.1, fh: [1.0, 0.4], bh: [-0.2, -0.45] });
const PAW_WAVE = P({ hy: -0.08, lean: 0.12, head: -0.15, fh: [0.4, 0.95], bh: [0.35, 0.15] });
const PAW_LICK = P({ hy: -0.15, lean: 0.3, head: 0.25, fh: [0.18, 0.28], bh: [0.4, 0.05] });
const WING_FLAP_UP = P({ hy: 0.02, lean: -0.15, head: -0.2, fh: [0.2, 0.9], bh: [-0.4, 0.8] });
const WING_FLAP_DOWN = P({ hy: -0.06, lean: 0.1, head: 0.1, fh: [0.6, -0.4], bh: [-0.5, -0.4] });
const FINGER_GUNS = P({ lean: -0.12, head: -0.15, fh: [1.0, 0.35], bh: [-0.35, 0.1] });

interface IdleStyle {
  bob: number;
  /** Breath cycles per 96-frame loop. */
  rate: number;
  sway: number;
  head: number;
}

const IDLE: Record<FighterId, IdleStyle> = {
  daumen: { bob: 0.04, rate: 4, sway: 0.04, head: 0.12 },
  chairman: { bob: 0.006, rate: 1, sway: 0.015, head: 0.03 },
  cate: { bob: 0.03, rate: 3, sway: 0.02, head: 0.08 },
  doge: { bob: 0.013, rate: 1, sway: 0, head: 0.02 },
  pepe: { bob: 0.02, rate: 1, sway: 0.05, head: 0.06 },
  orangie: { bob: 0.012, rate: 2, sway: 0.08, head: 0.04 },
  buddha: { bob: 0.01, rate: 1, sway: 0, head: 0 },
  decu: { bob: 0.035, rate: 3, sway: 0.01, head: 0.03 },
};

/** Looping idle on the 96-frame animation clock (see animStep), so frames cache. */
export function idlePose(def: FighterDef, st: Pose, tick: number): Pose {
  const s = IDLE[def.id];
  const step = (tick >> 1) % 48;
  const b = Math.sin((step / 48) * TAU * s.rate);
  const sw = Math.sin((step / 48) * TAU);
  return {
    ...st,
    hy: st.hy + b * s.bob,
    rot: st.rot + sw * s.sway,
    head: st.head + Math.sin((step / 48) * TAU * s.rate + 1) * s.head,
    fh: [st.fh[0], st.fh[1] + b * 0.025],
    bh: [st.bh[0], st.bh[1] + b * 0.02],
  };
}

const settle = (from: Pose, st: Pose, sf: number, at: number, len = 18) => lerpPose(from, st, easeInOut(clamp01((sf - at) / len)));

export function introPresentation(def: FighterDef, st: Pose, sf: number): Presentation {
  switch (def.id) {
    case 'chairman': {
      const pose = sf < 120 ? ARMS_CROSSED : settle(ARMS_CROSSED, st, sf, 120);
      if (sf < 34) return { pose, dx: 0, dy: 0, hidden: true, effect: 'bandages', effectT: sf };
      if (sf < 76) return { pose, dx: 0, dy: 0, dither: sf < 62 || sf % 4 < 2, effect: 'bandages', effectT: sf };
      return { pose, dx: 0, dy: 0 };
    }
    case 'buddha': {
      const float = sf < 110 ? 6 + loop(sf, 60) * 2 : Math.max(0, 6 * (1 - (sf - 110) / 16));
      const pose = sf < 110 ? MEDITATE : settle(MEDITATE, st, sf, 110, 24);
      return { pose, dx: 0, dy: float, effect: 'halo', effectT: sf };
    }
    case 'orangie': {
      if (sf < 56) return { pose: SLIDE, dx: -170 * (1 - easeOut(sf / 56)), dy: 0, effect: 'iceTrail', effectT: sf };
      const pose = sf < 76 ? lerpPose(SLIDE, POINT, easeOut((sf - 56) / 20)) : sf < 130 ? POINT : settle(POINT, st, sf, 130);
      return { pose, dx: 0, dy: 0, effect: sf < 90 ? 'ice' : undefined, effectT: sf };
    }
    case 'cate': {
      if (sf < 30) {
        const k = sf / 30;
        return { pose: LEAP, dx: -150 * (1 - k), dy: Math.sin(k * Math.PI) * 46, effect: undefined };
      }
      if (sf < 40) return { pose: POSES.crouch, dx: 0, dy: 0, effect: 'dust', effectT: sf - 30 };
      const pose = sf < 70 ? lerpPose(POSES.crouch, PAW_LICK, easeOut((sf - 40) / 30)) : sf < 125 ? PAW_LICK : settle(PAW_LICK, st, sf, 125);
      return { pose, dx: 0, dy: 0 };
    }
    case 'decu': {
      if (sf < 18) return { pose: POSES.crouch, dx: 0, dy: 0, hidden: true, effect: 'lightning', effectT: sf };
      const pose = sf < 50 ? lerpPose(POSES.crouch, POCKETS, easeOut((sf - 18) / 32)) : sf < 125 ? POCKETS : settle(POCKETS, st, sf, 125);
      return { pose, dx: 0, dy: 0, effect: sf < 60 ? 'lightning' : undefined, effectT: sf };
    }
    case 'daumen': {
      if (sf < 54) {
        const k = sf / 54;
        const hop = Math.abs(Math.sin(k * Math.PI * 4)) * 22;
        return { pose: Math.floor(sf / 5) % 2 ? WING_FLAP_UP : WING_FLAP_DOWN, dx: -160 * (1 - k), dy: hop };
      }
      const pose = sf < 125 ? (Math.floor(sf / 6) % 2 ? FINGER_GUNS : WING_FLAP_UP) : settle(FINGER_GUNS, st, sf, 125);
      return { pose, dx: 0, dy: 0, effect: sf < 125 ? 'yap' : undefined, effectT: sf };
    }
    case 'doge': {
      if (sf < 50) {
        const k = sf / 50;
        const ph = (Math.floor(sf / 4) % 4) / 4;
        const s = Math.sin(ph * TAU);
        const walk = { ...st, ff: [st.ff[0] + 0.13 * s, Math.max(0, 0.1 * Math.cos(ph * TAU))], bf: [st.bf[0] - 0.13 * s, Math.max(0, -0.1 * Math.cos(ph * TAU))] } as Pose;
        return { pose: walk, dx: -90 * (1 - k), dy: 0 };
      }
      const pose = keyed([[50, st], [64, BOW], [96, BOW], [110, HORSE], [140, HORSE], [158, st]])(sf);
      return { pose, dx: 0, dy: 0 };
    }
    case 'pepe': {
      if (sf < 50) return { pose: SMUG, dx: 0, dy: 0, turned: true, effect: 'salt', effectT: sf };
      const pose = sf < 130 ? SMUG : settle(SMUG, st, sf, 130);
      return { pose, dx: 0, dy: 0 };
    }
  }
}

/** Victory animation; loops forever after the opening beat so results screens can hold on it. */
export function winPresentation(def: FighterDef, sf: number): Presentation {
  switch (def.id) {
    case 'pepe': {
      const laugh = Math.floor(sf / 4) % 2 ? 0.03 : -0.01;
      return { pose: { ...SMUG, hy: SMUG.hy + laugh, head: SMUG.head + laugh * 3 }, dx: 0, dy: 0, effect: 'salt', effectT: sf };
    }
    case 'buddha': {
      const pose = sf < 20 ? lerpPose(POSES.stance, MEDITATE, easeOut(sf / 20)) : MEDITATE;
      return { pose, dx: 0, dy: sf < 20 ? (sf / 20) * 6 : 6 + loop(sf, 60) * 2, effect: 'halo', effectT: sf };
    }
    case 'orangie':
      return { pose: POINT, dx: 0, dy: Math.min(8, sf * 0.25), effect: 'ice', effectT: sf + 60 };
    case 'chairman': {
      const t = sf % 220;
      if (t < 50) return { pose: ARMS_CROSSED, dx: 0, dy: 0, effect: 'unwrap', effectT: t };
      if (t < 90) return { pose: ARMS_CROSSED, dx: 0, dy: 0, dither: true, effect: 'unwrap', effectT: t };
      if (t < 170) return { pose: ARMS_CROSSED, dx: 0, dy: 0, hidden: true };
      return { pose: ARMS_CROSSED, dx: 0, dy: 0, dither: t < 190, effect: 'bandages', effectT: t - 170 };
    }
    case 'cate': {
      const hop = Math.abs(Math.sin((sf % 40) / 40 * Math.PI)) * (sf % 120 < 80 ? 10 : 0);
      const pose = Math.floor(sf / 8) % 2 ? PAW_WAVE : { ...PAW_WAVE, fh: [0.6, 0.85] as [number, number] };
      return { pose, dx: 0, dy: hop };
    }
    case 'doge': {
      const pose = sf < 16 ? lerpPose(POSES.stance, HORSE, easeOut(sf / 16)) : { ...HORSE, hy: HORSE.hy + loop(sf, 90) * 0.01 };
      return { pose, dx: 0, dy: 0, effect: 'flex', effectT: sf };
    }
    case 'decu':
      return { pose: { ...POCKETS, hy: POCKETS.hy + loop(sf, 48) * 0.012 }, dx: 0, dy: 0, effect: 'lightning', effectT: sf % 70 };
    case 'daumen': {
      const pose = Math.floor(sf / 5) % 2 ? WING_FLAP_UP : FINGER_GUNS;
      return { pose: { ...pose, rot: loop(sf, 20) * 0.15 }, dx: 0, dy: Math.abs(loop(sf, 36)) * 14, effect: 'yap', effectT: sf };
    }
  }
}
