/**
 * Skeletal rig shared by the simulation (hitboxes/hurtboxes are derived from
 * solved poses, so they always match what's drawn) and the renderer.
 *
 * Local space: x points the way the fighter faces, y points up, origin is the
 * floor directly under the fighter. Poses are normalized so one animation
 * library works for a 70px kitten and a 120px sage:
 *  - hip offset and feet are in units of leg length L
 *  - hands are relative to the shoulder, in units of arm length A
 */

export type V = [number, number];

export interface Dims {
  thigh: number;
  shin: number;
  upperArm: number;
  foreArm: number;
  torso: number;
  neck: number;
  headR: number;
  chestW: number;
  waistW: number;
  armW: number;
  legW: number;
  footLen: number;
}

export interface Pose {
  hx: number;
  hy: number;
  /** Torso lean, radians; positive tips forward. */
  lean: number;
  head: number;
  /** Whole-body rotation around the hip; positive tips forward. */
  rot: number;
  fh: V;
  bh: V;
  ff: V;
  bf: V;
  /** Feet relative to the hip instead of the floor (for flips and lying down). */
  feetRel?: boolean;
}

export interface Joints {
  hip: V;
  neck: V;
  head: V;
  fs: V;
  bs: V;
  fe: V;
  be: V;
  fhand: V;
  bhand: V;
  fhip: V;
  bhip: V;
  fk: V;
  bk: V;
  ffoot: V;
  bfoot: V;
  lean: number;
  headAng: number;
  rot: number;
}

export const legLen = (d: Dims) => d.thigh + d.shin;
export const armLen = (d: Dims) => d.upperArm + d.foreArm;
export const standHipH = (d: Dims) => legLen(d) * 0.96;

function ik(a: V, t: V, l1: number, l2: number, bend: 1 | -1): [V, V] {
  let dx = t[0] - a[0];
  let dy = t[1] - a[1];
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.001;
  const min = Math.abs(l1 - l2) + 0.001;
  if (d < 0.0001) {
    dx = 0;
    dy = -min;
    d = min;
  }
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  } else if (d < min) {
    dx *= min / d;
    dy *= min / d;
    d = min;
  }
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  const joint: V = [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
  return [joint, [a[0] + dx, a[1] + dy]];
}

export function solve(d: Dims, p: Pose): Joints {
  const L = legLen(d);
  const A = armLen(d);
  const hip: V = [p.hx * L, standHipH(d) + p.hy * L];
  const sl = Math.sin(p.lean);
  const cl = Math.cos(p.lean);
  const neck: V = [hip[0] + sl * d.torso, hip[1] + cl * d.torso];
  const ha = p.lean + p.head;
  const headDist = d.neck + d.headR * 0.85;
  const head: V = [neck[0] + Math.sin(ha) * headDist, neck[1] + Math.cos(ha) * headDist];
  const sh: V = [neck[0] - sl * d.torso * 0.1, neck[1] - cl * d.torso * 0.1];
  const fs: V = [sh[0] + 1.5, sh[1]];
  const bs: V = [sh[0] - 1.5, sh[1]];
  const [fe, fhand] = ik(fs, [fs[0] + p.fh[0] * A, fs[1] + p.fh[1] * A], d.upperArm, d.foreArm, -1);
  const [be, bhand] = ik(bs, [bs[0] + p.bh[0] * A, bs[1] + p.bh[1] * A], d.upperArm, d.foreArm, -1);
  const fhip: V = [hip[0] + 1.5, hip[1]];
  const bhip: V = [hip[0] - 1.5, hip[1]];
  const ffT: V = p.feetRel ? [hip[0] + p.ff[0] * L, hip[1] + p.ff[1] * L] : [p.ff[0] * L, p.ff[1] * L];
  const bfT: V = p.feetRel ? [hip[0] + p.bf[0] * L, hip[1] + p.bf[1] * L] : [p.bf[0] * L, p.bf[1] * L];
  const [fk, ffoot] = ik(fhip, ffT, d.thigh, d.shin, 1);
  const [bk, bfoot] = ik(bhip, bfT, d.thigh, d.shin, 1);
  const j: Joints = { hip, neck, head, fs, bs, fe, be, fhand, bhand, fhip, bhip, fk, bk, ffoot, bfoot, lean: p.lean, headAng: ha, rot: p.rot };
  if (p.rot !== 0) {
    const c = Math.cos(-p.rot);
    const s = Math.sin(-p.rot);
    for (const k of ['neck', 'head', 'fs', 'bs', 'fe', 'be', 'fhand', 'bhand', 'fhip', 'bhip', 'fk', 'bk', 'ffoot', 'bfoot'] as const) {
      const v = j[k];
      const x = v[0] - hip[0];
      const y = v[1] - hip[1];
      j[k] = [hip[0] + x * c - y * s, hip[1] + x * s + y * c];
    }
    j.lean += p.rot;
    j.headAng += p.rot;
  }
  return j;
}

const lv = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    hx: n(a.hx, b.hx), hy: n(a.hy, b.hy), lean: n(a.lean, b.lean), head: n(a.head, b.head), rot: n(a.rot, b.rot),
    fh: lv(a.fh, b.fh, t), bh: lv(a.bh, b.bh, t), ff: lv(a.ff, b.ff, t), bf: lv(a.bf, b.bf, t),
    feetRel: t < 0.5 ? a.feetRel : b.feetRel,
  };
}

export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export const P = (p: Partial<Pose>): Pose => ({
  hx: 0, hy: -0.06, lean: 0.12, head: 0, rot: 0,
  fh: [0.55, 0.12], bh: [0.38, 0.18], ff: [0.3, 0], bf: [-0.26, 0],
  ...p,
});

/** Shared pose library. Specials and character quirks override these. */
export const POSES = {
  stance: P({}),
  crouch: P({ hx: 0.04, hy: -0.4, lean: 0.38, head: -0.25, fh: [0.6, 0.05], bh: [0.42, 0.12], ff: [0.36, 0], bf: [-0.32, 0] }),
  prejump: P({ hy: -0.2, lean: 0.25, ff: [0.25, 0], bf: [-0.22, 0] }),
  jump: P({ hy: 0.06, lean: 0.1, fh: [0.5, 0.35], bh: [0.3, 0.4], ff: [0.22, 0.42], bf: [-0.12, 0.3] }),
  fall: P({ hy: 0.02, lean: 0.05, fh: [0.55, 0.25], bh: [0.2, 0.35], ff: [0.25, 0.12], bf: [-0.2, 0.06] }),
  block: P({ hx: -0.04, hy: -0.08, lean: -0.06, head: 0.2, fh: [0.38, 0.42], bh: [0.42, 0.3], ff: [0.28, 0], bf: [-0.3, 0] }),
  crouchBlock: P({ hx: 0, hy: -0.4, lean: 0.25, head: 0, fh: [0.4, 0.4], bh: [0.45, 0.28], ff: [0.36, 0], bf: [-0.32, 0] }),
  hit: P({ hx: -0.08, hy: -0.08, lean: -0.38, head: -0.45, fh: [0.2, -0.3], bh: [-0.3, -0.2], ff: [0.36, 0], bf: [-0.2, 0] }),
  hitLow: P({ hx: -0.04, hy: -0.32, lean: 0.55, head: 0.3, fh: [0.3, -0.5], bh: [0.1, -0.5], ff: [0.36, 0], bf: [-0.32, 0] }),
  launched: P({ hy: 0.05, lean: -0.5, head: -0.5, rot: -0.6, fh: [-0.3, 0.6], bh: [-0.6, 0.3], ff: [0.25, 0.35], bf: [0.05, 0.1] }),
  down: P({ hx: 0, hy: -0.84, lean: 0, head: 0.2, rot: -Math.PI / 2, fh: [0.0, -0.9], bh: [0.15, -0.8], ff: [0.04, -0.98], bf: [-0.02, -0.95], feetRel: true }),
  wakeup: P({ hy: -0.35, lean: 0.4, fh: [0.6, -0.1], bh: [0.4, 0], ff: [0.3, 0], bf: [-0.3, 0] }),
  dash: P({ hx: 0.08, hy: -0.18, lean: 0.55, head: -0.35, fh: [0.4, -0.2], bh: [-0.5, -0.1], ff: [0.5, 0.05], bf: [-0.45, 0.1] }),
  backdash: P({ hx: -0.06, hy: -0.04, lean: -0.3, head: 0.1, fh: [0.5, 0.25], bh: [0.2, 0.3], ff: [0.1, 0.12], bf: [-0.4, 0] }),
  win: P({ hy: -0.02, lean: -0.05, head: -0.2, fh: [0.2, 1.0], bh: [-0.3, 0.2], ff: [0.22, 0], bf: [-0.22, 0] }),
  taunt: P({ hy: -0.03, lean: -0.1, head: -0.15, fh: [0.7, 0.3], bh: [-0.25, -0.35], ff: [0.25, 0], bf: [-0.25, 0] }),
  thrown: P({ hy: 0.1, lean: -0.6, head: -0.6, rot: -0.3, fh: [0.5, 0.6], bh: [-0.2, 0.7], ff: [0.3, 0.2], bf: [-0.1, 0.3] }),
  grab: P({ hx: 0.08, hy: -0.1, lean: 0.35, fh: [0.9, 0.05], bh: [0.8, 0.0], ff: [0.42, 0], bf: [-0.25, 0] }),
  toss: P({ hx: -0.04, hy: -0.04, lean: -0.35, head: -0.3, fh: [-0.2, 0.9], bh: [-0.4, 0.8], ff: [0.3, 0], bf: [-0.32, 0] }),
};

export interface StrikePoses {
  windup: Pose;
  hit: Pose;
}

/** Normal-attack poses per attack slot. Heavy has a few styles so fighters feel different. */
export const STRIKES = {
  light: {
    windup: P({ lean: 0.15, fh: [0.32, 0.15], bh: [0.38, 0.2] }),
    hit: P({ hx: 0.06, lean: 0.32, head: -0.15, fh: [1.0, 0.2], bh: [0.25, 0.1], ff: [0.36, 0] }),
  },
  kick: {
    windup: P({ hx: -0.04, lean: -0.1, fh: [0.4, 0.3], bh: [0.2, 0.2], ff: [0.15, 0.3], bf: [-0.2, 0] }),
    hit: P({ hx: -0.06, lean: -0.4, head: 0.25, fh: [0.2, 0.25], bh: [-0.3, 0.1], ff: [0.95, 0.72], bf: [-0.18, 0] }),
  },
  haymaker: {
    windup: P({ hx: -0.05, lean: -0.1, fh: [0.3, 0.2], bh: [-0.45, 0.2], ff: [0.3, 0], bf: [-0.3, 0] }),
    hit: P({ hx: 0.16, hy: -0.12, lean: 0.5, head: -0.3, fh: [0.2, -0.1], bh: [1.05, 0.15], ff: [0.55, 0], bf: [-0.3, 0] }),
  },
  palm: {
    windup: P({ hx: -0.04, lean: -0.05, fh: [0.2, 0.0], bh: [-0.3, 0.3], ff: [0.3, 0], bf: [-0.3, 0] }),
    hit: P({ hx: 0.14, hy: -0.14, lean: 0.35, head: -0.2, fh: [0.2, -0.2], bh: [1.05, 0.3], ff: [0.55, 0], bf: [-0.32, 0] }),
  },
  slam: {
    windup: P({ hx: -0.08, hy: -0.1, lean: -0.25, fh: [-0.3, 0.3], bh: [-0.5, 0.2], ff: [0.25, 0], bf: [-0.3, 0] }),
    hit: P({ hx: 0.42, hy: -0.05, lean: 0.85, head: -0.6, fh: [0.95, 0.1], bh: [0.85, 0.25], ff: [0.75, 0.05], bf: [-0.1, 0.15] }),
  },
  clight: {
    windup: P({ hx: 0.04, hy: -0.4, lean: 0.38, head: -0.25, fh: [0.4, 0.0], bh: [0.42, 0.12], ff: [0.36, 0], bf: [-0.32, 0] }),
    hit: P({ hx: 0.08, hy: -0.4, lean: 0.48, head: -0.35, fh: [1.0, -0.25], bh: [0.3, 0.05], ff: [0.4, 0], bf: [-0.32, 0] }),
  },
  sweep: {
    windup: P({ hx: 0, hy: -0.5, lean: 0.3, fh: [0.4, -0.3], bh: [0.4, 0], ff: [0.2, 0.02], bf: [-0.3, 0] }),
    hit: P({ hx: -0.1, hy: -0.55, lean: 0.15, head: 0.1, fh: [-0.1, -0.7], bh: [0.4, -0.5], ff: [1.15, 0.03], bf: [-0.3, 0] }),
  },
  alight: {
    windup: P({ hy: 0.04, lean: 0.2, fh: [0.4, 0.2], bh: [0.3, 0.3], ff: [0.25, 0.4], bf: [-0.1, 0.3] }),
    hit: P({ hy: 0.04, lean: 0.4, head: -0.2, fh: [0.85, -0.45], bh: [0.2, 0.3], ff: [0.3, 0.35], bf: [-0.1, 0.25] }),
  },
  aheavy: {
    windup: P({ hy: 0.06, lean: -0.1, fh: [0.4, 0.4], bh: [0.2, 0.4], ff: [0.25, 0.45], bf: [-0.1, 0.35] }),
    hit: P({ hy: 0.04, lean: -0.3, head: 0.3, fh: [0.3, 0.4], bh: [-0.3, 0.4], ff: [0.8, -0.18], bf: [-0.15, 0.3] }),
  },
} satisfies Record<string, StrikePoses>;
