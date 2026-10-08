import type { Dims, Joints, V } from '../rig';
import type { FighterId } from '../sim/roster';
import { Painter, ramp, type Ramp } from './paint';

export interface LookInfo {
  /** Step on the looping animation clock (see animStep). */
  t: number;
  speed: number;
  special: boolean;
  powered: boolean;
  /** CHAIRMAN's bandage lash extension in px, 0 when not lashing. */
  lash: number;
}

type Look = (p: Painter, j: Joints, d: Dims, i: LookInfo) => void;

const PI = Math.PI;

/** Point in the head's frame: x toward the face, y toward the crown. */
function headFrame(j: Joints) {
  const a = j.headAng;
  const ux = Math.sin(a);
  const uy = Math.cos(a);
  const fx = Math.cos(a);
  const fy = -Math.sin(a);
  return (x: number, y: number): V => [j.head[0] + fx * x + ux * y, j.head[1] + fy * x + uy * y];
}

/** Point in the torso's frame: origin at the hip, y up the spine, x toward the belly. */
function bodyFrame(j: Joints) {
  const a = j.lean;
  const ux = Math.sin(a);
  const uy = Math.cos(a);
  const fx = Math.cos(a);
  const fy = -Math.sin(a);
  return (x: number, y: number): V => [j.hip[0] + fx * x + ux * y, j.hip[1] + fy * x + uy * y];
}

const fwd = (j: Joints): V => [Math.cos(j.rot), -Math.sin(j.rot)];
const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** Canvas rotation that aligns an ellipse with the head/torso (y-up space). */
const rotOf = (a: number) => -a;

function leg(p: Painter, hip: V, knee: V, foot: V, w: number, r: Ramp) {
  p.limb(hip, knee, w, r);
  p.limb(knee, foot, w * 0.88, r);
}

function arm(p: Painter, sh: V, el: V, hand: V, w: number, r: Ramp) {
  p.limb(sh, el, w, r);
  p.limb(el, hand, w * 0.88, r);
}

function shoe(p: Painter, j: Joints, ankle: V, len: number, w: number, r: Ramp) {
  const f = fwd(j);
  p.limb([ankle[0] - f[0] * 2, ankle[1] - f[1] * 2 + 1], [ankle[0] + f[0] * len, ankle[1] + f[1] * len + 1], w, r);
}

/** Part of a forearm, from elbow (t=0) to hand (t=1), for wraps and cuffs. */
function along(a: V, b: V, t: number): V {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function wraps(p: Painter, a: V, b: V, w: number, color: string, n: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let k = 1; k < n; k++) {
    const c = along(a, b, k / n);
    p.line([c[0] - nx * w * 0.5 - dx / len, c[1] - ny * w * 0.5 - dy / len], [c[0] + nx * w * 0.5 + dx / len, c[1] + ny * w * 0.5 + dy / len], 1, color);
  }
}

function sparks(p: Painter, center: V, t: number, n: number, radius: number, colors: [string, string]) {
  for (let k = 0; k < n; k++) {
    const seed = Math.sin((t >> 1) * 12.9898 + k * 78.233) * 43758.5453;
    const a = (seed - Math.floor(seed)) * PI * 2;
    const r0 = radius * 0.6;
    const pts: V[] = [];
    let x = center[0] + Math.cos(a) * r0;
    let y = center[1] + Math.sin(a) * r0;
    pts.push([x, y]);
    for (let s = 0; s < 3; s++) {
      x += Math.cos(a) * 5 + (s % 2 ? 3 : -3);
      y += Math.sin(a) * 5 + (s % 2 ? -3 : 3);
      pts.push([x, y]);
    }
    p.polyline(pts, 2, colors[0]);
    p.polyline(pts, 1, colors[1]);
  }
}

export const LOOKS: Record<FighterId, Look> = {
  daumen(p, j, d, i) {
    const Y = ramp('#ffd21f');
    const Yb = ramp('#ffd21f', true);
    const O = ramp('#ff8a1a');
    const Ob = ramp('#ff8a1a', true);
    const R = ramp('#e8262e');
    const wing = (sh: V, el: V, hand: V, r: Ramp) => {
      arm(p, sh, el, hand, 8, r);
      const a = Math.atan2(hand[1] - el[1], hand[0] - el[0]);
      for (const s of [-0.45, 0, 0.45]) {
        p.ellipse([hand[0] + Math.cos(a + s) * 4, hand[1] + Math.sin(a + s) * 4], 4.6, 2.2, a + s, r[0]);
        p.ellipse([hand[0] + Math.cos(a + s) * 4, hand[1] + Math.sin(a + s) * 4 + 0.4], 3.6, 1.4, a + s, r[1]);
      }
    };
    const web = (ankle: V, r: Ramp) => {
      const f = fwd(j);
      p.poly([[ankle[0] - f[0] * 2, ankle[1] + 2], [ankle[0] + f[0] * 11, ankle[1] + f[1] * 11 + 1], [ankle[0] + f[0] * 10, ankle[1] + f[1] * 10 - 2], [ankle[0], ankle[1] - 1.5]], r[0]);
      p.poly([[ankle[0], ankle[1] + 1.2], [ankle[0] + f[0] * 9.5, ankle[1] + f[1] * 9.5 + 0.4], [ankle[0] + f[0] * 8.5, ankle[1] + f[1] * 8.5 - 1], [ankle[0], ankle[1] - 0.5]], r[1]);
    };
    p.ribbon([j.neck[0] - 3, j.neck[1]], PI + 0.35, 5, 5, 5, 3, R, i.t, 1 + i.speed * 0.4);
    wing(j.bs, j.be, j.bhand, Yb);
    leg(p, j.bhip, j.bk, j.bfoot, 5, Ob);
    web(j.bfoot, Ob);
    const B = bodyFrame(j);
    p.oval(mid(j.hip, j.neck), d.chestW / 2 + 1, d.torso / 2 + 8, rotOf(j.lean), Y);
    p.ellipse(B(5, d.torso * 0.42), 8, 11, rotOf(j.lean), '#fff2a6');
    leg(p, j.fhip, j.fk, j.ffoot, 5, O);
    web(j.ffoot, O);
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    p.ellipse(j.neck, 10, 4.5, rotOf(j.lean), R[0]);
    p.ellipse([j.neck[0], j.neck[1] + 0.6], 9, 3.4, rotOf(j.lean), R[1]);
    p.ball(j.head, d.headR, Y);
    p.polyline([H(-3, 12), H(-6, 18), H(-1, 21), H(1, 17)], 2.4, Y[0]);
    p.polyline([H(1, 12), H(2, 18), H(6, 19)], 2.2, Y[0]);
    p.ellipse(H(5.5, 3.5), 3.4, 4.4, ha, '#ffffff');
    p.circle(H(7, 3), 2, '#1a1020');
    p.circle(H(7.4, 4.4), 0.8, '#ffffff');
    p.line(H(2.5, 9), H(10, 7), 1.8, '#a86c00');
    p.ellipse(H(13.5, -3.2), 8.4, 5, ha, '#b85300');
    p.ellipse(H(13.5, -2.6), 7.4, 4, ha, '#ff8f1f');
    p.ellipse(H(14, -3.6), 5.6, 2.3, ha, '#7a0f1e');
    p.line(H(9.5, -2.8), H(18, -2.8), 1.6, '#ffffff');
    p.circle(H(3.5, -4.5), 2.2, '#ff9a6a');
    wing(j.fs, j.fe, j.fhand, Y);
  },

  chairman(p, j, d, i) {
    const BAND = ramp('#e8dec5');
    const BANDb = ramp('#e8dec5', true);
    const CL = ramp('#2c2a3c');
    const CLb = ramp('#2c2a3c', true);
    const stripe = '#a2967b';
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    p.ribbon(H(-8, 3), PI + 0.35 - Math.min(0.3, i.speed * 0.06), 7, 5, 4, 2, BAND, i.t, 1.8 + i.speed * 0.4, 0.9);
    p.ribbon(H(-7, -3), PI + 0.6 - Math.min(0.3, i.speed * 0.06), 6, 4.5, 3.5, 2, BANDb, i.t + 9, 1.6 + i.speed * 0.4, 1.1);
    arm(p, j.bs, j.be, j.bhand, 6, BANDb);
    wraps(p, j.bs, j.be, 6, '#8d8269', 3);
    wraps(p, j.be, j.bhand, 5, '#8d8269', 3);
    p.ball(j.bhand, 3, BANDb);
    p.ribbon(j.bhand, PI + 0.6, 4, 4, 2, 1, BANDb, i.t + 4, 1.2);
    leg(p, j.bhip, j.bk, j.bfoot, 7, CLb);
    shoe(p, j, j.bfoot, 8, 5, ramp('#151420', true));
    const B = bodyFrame(j);
    p.torso(j.hip, j.neck, d.waistW, d.chestW, CL);
    p.line(B(-8, 6), B(8, d.torso - 2), 3.4, BAND[0]);
    p.line(B(-8, 6.6), B(8, d.torso - 1.4), 2.2, BAND[1]);
    p.line(B(8, 5), B(-6, d.torso - 6), 3, BAND[0]);
    p.line(B(8, 5.6), B(-6, d.torso - 5.4), 1.8, BAND[1]);
    leg(p, j.fhip, j.fk, j.ffoot, 7, CL);
    shoe(p, j, j.ffoot, 8, 5, ramp('#151420'));
    p.ball(j.head, d.headR + 0.5, BAND);
    for (const k of [-6, -2.5, 4.5, 8]) p.line(H(-9, k + 1), H(9, k - 1.5), 1, stripe);
    p.ellipse(H(4.5, 1), 7, 2.8, ha, '#120e1a');
    const glow = i.special ? '#fff27a' : '#ff8a1a';
    p.circle(H(4, 1.2), 1.7, glow);
    p.circle(H(8.6, 0.9), 1.5, glow);
    p.circle(H(4.2, 1.4), 0.7, '#fff6c8');
    p.circle(H(8.8, 1.1), 0.6, '#fff6c8');
    const crown: V[] = [H(-6, 13), H(-7, 19), H(-3.5, 16.5), H(0, 21), H(3.5, 16.5), H(7, 19), H(6, 13)];
    p.poly(crown, '#2a8fd6');
    p.poly(crown.map((c, k) => (k === 0 || k === crown.length - 1 ? c : ([c[0], c[1] - 1] as V))), '#8ff0ff');
    arm(p, j.fs, j.fe, j.fhand, 6, BAND);
    wraps(p, j.fs, j.fe, 6, stripe, 3);
    wraps(p, j.fe, j.fhand, 5, stripe, 3);
    if (i.lash > 0) {
      // the heavy is a back-hand haymaker, so the bandage whips out of the back hand
      const a = Math.atan2(j.bhand[1] - j.be[1], j.bhand[0] - j.be[0]);
      const tip: V = [j.bhand[0] + Math.cos(a) * i.lash, j.bhand[1] + Math.sin(a) * i.lash];
      p.line(j.bhand, tip, 4.5, BAND[0]);
      p.line([j.bhand[0], j.bhand[1] + 0.5], [tip[0], tip[1] + 0.5], 2.8, BAND[1]);
      wraps(p, j.bhand, tip, 4, stripe, Math.max(2, Math.round(i.lash / 6)));
      p.ribbon(tip, a + Math.PI * 0.9, 3, 3.5, 2.5, 1.5, BAND, i.t, 1.5);
    }
    p.ball(j.fhand, 3.2, BAND);
  },

  cate(p, j, d, i) {
    const FUR = ramp('#ea9445');
    const FURb = ramp('#ea9445', true);
    const CREAM = ramp('#f8e5c6');
    const CREAMb = ramp('#f8e5c6', true);
    const WRAP = ramp('#f6f3ec');
    const RED = ramp('#e0263a');
    const stripe = '#a8541c';
    const B = bodyFrame(j);
    const tail = p.ribbon(B(-6, 3), PI * 0.82 + Math.sin((i.t / 48) * PI * 2) * 0.12, 7, 4.2, 5, 3.5, FURb, i.t, 0.8 + i.speed * 0.3, -2.2);
    for (let k = 2; k < tail.length - 1; k += 2) p.circle(tail[k], 1.6, stripe);
    p.ribbon([j.neck[0] - 4, j.neck[1] - 1], PI + 0.25, 4, 4.5, 4, 2, RED, i.t, 1.2 + i.speed * 0.4);
    p.limb(j.bs, j.be, 6, FURb);
    p.limb(j.be, j.bhand, 5.5, ramp('#f6f3ec', true));
    p.ball(j.bhand, 3.6, CREAMb);
    leg(p, j.bhip, j.bk, j.bfoot, 7, FURb);
    p.ellipse([j.bfoot[0] + fwd(j)[0] * 2, j.bfoot[1] + 1], 4.5, 2.6, 0, CREAMb[1]);
    p.torso(j.hip, j.neck, d.waistW, d.chestW, FUR);
    p.ellipse(B(4, d.torso * 0.45), 5, 7.5, rotOf(j.lean), CREAM[1]);
    p.line(B(-7, 6), B(-4, 8), 1.4, stripe);
    p.line(B(-8, 11), B(-4, 13), 1.4, stripe);
    leg(p, j.fhip, j.fk, j.ffoot, 7, FUR);
    p.ellipse([j.ffoot[0] + fwd(j)[0] * 2, j.ffoot[1] + 1], 4.8, 2.8, 0, CREAM[0]);
    p.ellipse([j.ffoot[0] + fwd(j)[0] * 2, j.ffoot[1] + 1.5], 3.6, 1.8, 0, CREAM[1]);
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    p.ellipse(j.neck, 8, 3.6, rotOf(j.lean), RED[0]);
    p.ellipse([j.neck[0], j.neck[1] + 0.5], 7, 2.6, rotOf(j.lean), RED[1]);
    p.poly([H(-8, 7), H(-12, 19), H(-1, 12)], FURb[0]);
    p.poly([H(-7.5, 8.5), H(-10.5, 16.5), H(-2.5, 12)], FURb[1]);
    p.ball(j.head, d.headR, FUR);
    p.poly([H(0, 12), H(4, 22), H(9, 10)], FUR[0]);
    p.poly([H(1, 12), H(4.3, 20), H(7.8, 11)], FUR[1]);
    p.poly([H(2.5, 12.5), H(4.4, 17.5), H(6.5, 12)], '#ff9fb6');
    for (const k of [-3, 0, 3]) p.line(H(k - 1, 13.5), H(k, 9.5), 1.4, stripe);
    p.ellipse(H(9, -5), 6.4, 4.6, ha, CREAM[1]);
    p.ellipse(H(6, 2.5), 3.8, 4.8, ha, '#2a1408');
    p.ellipse(H(6.4, 2.2), 2.7, 3.6, ha, '#c96b12');
    p.circle(H(6.6, 2.2), 1.6, '#1a0a04');
    p.circle(H(7.2, 4.2), 1.2, '#ffffff');
    p.circle(H(5.4, 0.6), 0.6, '#ffffff');
    p.poly([H(13.5, -1.5), H(15.5, -1.2), H(14.6, -3)], '#ff7f9c');
    p.polyline([H(14.3, -3.5), H(13.2, -5.5), H(11.6, -5)], 1, '#7a3a18');
    p.line(H(12, -3.5), H(18, -2), 0.8, '#fff6e6');
    p.line(H(12, -4.5), H(18, -5.5), 0.8, '#fff6e6');
    p.limb(j.fs, j.fe, 6, FUR);
    p.limb(j.fe, j.fhand, 5.5, WRAP);
    wraps(p, j.fe, j.fhand, 5, '#c9c2b2', 3);
    p.ball(j.fhand, 3.8, CREAM);
    p.circle([j.fhand[0] + fwd(j)[0] * 1.5, j.fhand[1] + 0.5], 1.3, '#ff8fb0');
  },

  doge(p, j, d, i) {
    const FUR = ramp('#e2a453');
    const FURb = ramp('#e2a453', true);
    const CREAM = ramp('#f7dcaa');
    const GI = ramp('#f1ede2');
    const GIb = ramp('#f1ede2', true);
    const WRAP = ramp('#2a2833');
    const WRAPb = ramp('#2a2833', true);
    const B = bodyFrame(j);
    p.ball(B(-12, 9), 6.5, FURb);
    p.circle(B(-12.5, 9.5), 3, CREAM[1]);
    p.ribbon(B(-9, 2), PI + 0.5, 3, 4, 3, 2, ramp('#1d1b22', true), i.t, 1 + i.speed * 0.3);
    p.limb(j.bs, j.be, 10, FURb);
    p.limb(j.be, j.bhand, 9, WRAPb);
    p.ball(j.bhand, 5.2, WRAPb);
    leg(p, j.bhip, j.bk, j.bfoot, 11, GIb);
    shoe(p, j, j.bfoot, 8, 6, FURb);
    p.torso(j.hip, j.neck, d.waistW, d.chestW, FUR);
    p.ellipse(B(5, d.torso * 0.66), 9, 8, rotOf(j.lean), CREAM[1]);
    p.ellipse(B(6, d.torso * 0.36), 7, 8, rotOf(j.lean), CREAM[1]);
    p.line(B(1, d.torso * 0.56), B(12, d.torso * 0.52), 1.2, '#c48a44');
    for (const k of [0.2, 0.32, 0.44]) p.line(B(4, d.torso * k), B(11, d.torso * k), 1, '#d2a066');
    p.line(B(7.5, d.torso * 0.14), B(7.5, d.torso * 0.5), 1, '#d2a066');
    leg(p, j.fhip, j.fk, j.ffoot, 11, GI);
    p.line(B(-11, 2), B(11, 1), 4.5, '#1d1b22');
    p.line(B(-11, 2.6), B(11, 1.6), 1.2, '#4a4656');
    shoe(p, j, j.ffoot, 8, 6, FUR);
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    p.poly([H(-7, 6), H(-9, 19), H(-1, 11)], FURb[0]);
    p.ball(j.head, d.headR, FUR);
    p.poly([H(-1, 10), H(2, 21), H(7, 9)], FUR[0]);
    p.poly([H(0, 10.5), H(2.2, 18.5), H(5.8, 10)], FUR[1]);
    p.poly([H(1.4, 11), H(2.4, 16), H(4.6, 10.5)], CREAM[1]);
    p.ellipse(H(2, -5), 6, 4, ha, CREAM[1]);
    p.ellipse(H(11, -4), 7.6, 5.2, ha, CREAM[0]);
    p.ellipse(H(11, -3.4), 6.8, 4.4, ha, CREAM[1]);
    p.circle(H(17, -1.8), 2.3, '#1a1416');
    p.circle(H(16.6, -1.2), 0.8, '#6a5a60');
    p.polyline([H(16, -5.5), H(13, -6.5), H(10, -5.5)], 1, '#7a4e22');
    p.ellipse(H(5.5, 3), 2.8, 2, ha, '#ffffff');
    p.circle(H(4.4, 3), 1.4, '#1a1416');
    p.circle(H(4.5, 7.5), 1.6, CREAM[1]);
    p.line(H(3, 5.2), H(8, 4.8), 1, '#9a6230');
    p.limb(j.fs, j.fe, 10, FUR);
    p.limb(j.fe, j.fhand, 9, WRAP);
    wraps(p, j.fe, j.fhand, 9, '#4d4a58', 3);
    p.ball(j.fhand, 5.4, WRAP);
  },

  pepe(p, j, d, i) {
    const SKIN = ramp('#64b340');
    const SKINb = ramp('#64b340', true);
    const HOOD = ramp('#2f7b35');
    const HOODb = ramp('#2f7b35', true);
    const PANTS = ramp('#22212c');
    const PANTSb = ramp('#22212c', true);
    const SHOE = ramp('#eeeef2');
    const SHOEb = ramp('#eeeef2', true);
    const BAG = ramp('#8b5a2b');
    void i;
    arm(p, j.bs, j.be, j.bhand, 8, HOODb);
    p.ball(j.bhand, 4, SKINb);
    leg(p, j.bhip, j.bk, j.bfoot, 9, PANTSb);
    shoe(p, j, j.bfoot, 9, 6.5, SHOEb);
    const B = bodyFrame(j);
    p.oval(B(-9, 4), 6, 5, rotOf(j.lean), BAG);
    p.line(B(-10, 6.5), B(-6, 6.5), 1, '#5a3814');
    p.torso(j.hip, j.neck, d.waistW, d.chestW, HOOD);
    p.line(B(-9, 5), B(7, d.torso + 1), 2.4, '#6b4220');
    p.line(B(3, 7), B(9.5, 7), 1.2, HOOD[0]);
    p.line(B(9.5, 7), B(9.5, 13), 1.2, HOOD[0]);
    leg(p, j.fhip, j.fk, j.ffoot, 9, PANTS);
    shoe(p, j, j.ffoot, 9, 6.5, SHOE);
    p.line([j.ffoot[0] - 1, j.ffoot[1] - 1.5], [j.ffoot[0] + fwd(j)[0] * 9, j.ffoot[1] - 1.5], 1.2, '#9a9aa6');
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    p.oval(H(-5, 0.5), 12.5, 12, ha, HOOD);
    p.oval(H(2, -1), 14, 10.5, ha, SKIN);
    p.ball(H(1.5, 7.5), 4.8, ramp('#f4f4f0'));
    p.ball(H(10, 6.5), 4.6, ramp('#f4f4f0'));
    p.circle(H(3.2, 6.4), 1.9, '#141214');
    p.circle(H(11.6, 5.6), 1.8, '#141214');
    p.ellipse(H(1.5, 10.2), 5.2, 2.8, ha, SKIN[0]);
    p.ellipse(H(1.5, 10.6), 4.6, 2.2, ha, SKIN[1]);
    p.ellipse(H(10, 9.2), 5, 2.8, ha, SKIN[0]);
    p.ellipse(H(10, 9.6), 4.4, 2.2, ha, SKIN[1]);
    p.polyline([H(2, -5.5), H(8, -3.8), H(15.5, -5)], 3, '#8f2b22');
    p.polyline([H(2.5, -5.2), H(8, -3.4), H(15, -4.6)], 1.4, '#c4483a');
    p.polyline([H(3, -7), H(9, -6.6), H(14, -6.8)], 1.2, SKIN[0]);
    p.polyline([H(-2, 12.5), H(-9, 8), H(-11, -4), H(-6, -10)], 2.4, HOOD[2]);
    arm(p, j.fs, j.fe, j.fhand, 8, HOOD);
    p.line(along(j.fe, j.fhand, 0.82), along(j.fe, j.fhand, 0.84), 7, HOOD[0]);
    p.ball(j.fhand, 4.3, SKIN);
  },

  orangie(p, j, d, i) {
    const BK = ramp('#2a2a36');
    const BKb = ramp('#2a2a36', true);
    const WH = ramp('#f2f4fa');
    const OR = ramp('#f6871f');
    const ORb = ramp('#f6871f', true);
    const BE = ramp('#f07818');
    const POM = ramp('#38c28d');
    void i;
    const flipper = (sh: V, el: V, hand: V, r: Ramp, tip: Ramp) => {
      arm(p, sh, el, hand, 7.5, r);
      p.oval(hand, 4.4, 3, rotOf(Math.atan2(hand[0] - el[0], hand[1] - el[1]) - PI / 2), tip);
    };
    flipper(j.bs, j.be, j.bhand, BKb, ramp('#d7dbe6', true));
    leg(p, j.bhip, j.bk, j.bfoot, 6, ORb);
    shoe(p, j, j.bfoot, 10, 6, ORb);
    const B = bodyFrame(j);
    p.oval(mid(j.hip, j.neck), d.chestW / 2, d.torso / 2 + 9, rotOf(j.lean), BK);
    p.oval(B(6, d.torso * 0.42), 8, 12, rotOf(j.lean), WH);
    p.line(B(9, d.torso * 0.85), B(10, d.torso * 0.55), 1.2, '#d0d4de');
    p.line(B(11.5, d.torso * 0.85), B(12.5, d.torso * 0.58), 1.2, '#d0d4de');
    p.line(B(2, d.torso * 0.12), B(12, d.torso * 0.12), 1.2, BK[0]);
    leg(p, j.fhip, j.fk, j.ffoot, 6, OR);
    shoe(p, j, j.ffoot, 11, 6.5, OR);
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    p.ball(j.head, d.headR, BK);
    p.oval(H(5, -2), 9.6, 9.6, ha, WH);
    p.circle(H(5.5, 1.5), 2, '#141418');
    p.circle(H(11.5, 1.2), 1.8, '#141418');
    p.circle(H(6.1, 2.2), 0.7, '#ffffff');
    p.circle(H(12, 1.9), 0.6, '#ffffff');
    p.circle(H(3, -4), 1.8, '#ffb3b3');
    p.poly([H(12, -2), H(19.5, -4.2), H(12, -6.5)], OR[0]);
    p.poly([H(12.5, -2.6), H(18.5, -4.2), H(12.5, -5.4)], OR[1]);
    p.oval(H(-1, 8), 15.5, 9.5, ha, BE);
    for (const k of [-10, -6, -2, 2, 6, 10]) p.line(H(k, 3), H(k * 0.8, 15), 1, BE[0]);
    p.limb(H(-14.5, 3.5), H(14.5, 4.5), 5.5, ramp('#d8650f'));
    p.ball(H(-2, 18.5), 4.2, POM);
    flipper(j.fs, j.fe, j.fhand, BK, ramp('#d7dbe6'));
  },

  buddha(p, j, d, i) {
    const SKIN = ramp('#dc8436');
    const SKINb = ramp('#dc8436', true);
    const CL = ramp('#f2e8d2');
    const CLb = ramp('#f2e8d2', true);
    const GOLD = ramp('#f5c03a');
    const HAIR = ramp('#ebe8f7');
    const HAIRb = ramp('#ebe8f7', true);
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    for (let k = 0; k < 4; k++) {
      p.ribbon(H(-8 + k, 6 - k * 3.5), PI + 0.95 + k * 0.1 - Math.min(0.5, i.speed * 0.08), 7, 6, 6.5, 3, k % 2 ? HAIRb : HAIR, i.t + k * 5, 0.8 + i.speed * 0.4, 0.5);
    }
    arm(p, j.bs, j.be, j.bhand, 9, SKINb);
    p.line(along(j.bs, j.be, 0.35), along(j.bs, j.be, 0.5), 9.5, GOLD[0]);
    p.line(along(j.be, j.bhand, 0.75), along(j.be, j.bhand, 0.85), 8.5, GOLD[0]);
    p.ball(j.bhand, 4.4, SKINb);
    leg(p, j.bhip, j.bk, j.bfoot, 12, CLb);
    shoe(p, j, j.bfoot, 8, 5.5, SKINb);
    const B = bodyFrame(j);
    p.torso(j.hip, j.neck, d.waistW, d.chestW, SKIN);
    p.line(B(1, d.torso * 0.6), B(12, d.torso * 0.56), 1.2, SKIN[0]);
    for (const k of [0.22, 0.34, 0.46]) p.line(B(5, d.torso * k), B(11, d.torso * k), 1, '#b8662a');
    p.line(B(-11, 3), B(10, d.torso * 0.92), 4.5, '#8e2219');
    p.line(B(-11, 3.6), B(10, d.torso * 0.92 + 0.6), 2.6, '#c8382c');
    const beads: V[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = PI * (0.15 + k * 0.09);
      beads.push(B(Math.cos(a) * 9 + 3, d.torso - 2 - Math.sin(a) * 9));
    }
    for (const b of beads) p.circle(b, 1.7, '#1a1218');
    p.line(B(-2, d.torso - 1), B(10, d.torso - 3), 2, GOLD[1]);
    p.ellipse(B(0, 1), d.waistW / 2 + 3, 5, rotOf(j.lean), CL[0]);
    p.ellipse(B(0, 1.6), d.waistW / 2 + 2, 4, rotOf(j.lean), CL[1]);
    p.line(B(-d.waistW / 2, -2), B(d.waistW / 2, -2), 1.6, GOLD[1]);
    leg(p, j.fhip, j.fk, j.ffoot, 12, CL);
    p.line(along(j.fk, j.ffoot, 0.85), along(j.fk, j.ffoot, 0.9), 11, GOLD[1]);
    shoe(p, j, j.ffoot, 8, 5.5, SKIN);
    p.ball(H(-2.5, 3), d.headR + 1.5, HAIRb);
    p.ball(j.head, d.headR, SKIN);
    p.oval(H(-5, 7), 9, 6.5, ha, HAIR);
    const crown: V[] = [H(-4, 10), H(-2, 16), H(2, 13), H(5, 18), H(8, 12), H(9, 8)];
    p.poly(crown, GOLD[0]);
    p.poly(crown.map((c) => [c[0], c[1] - 0.8] as V), GOLD[1]);
    p.circle(H(5, 14), 1.4, '#e8302a');
    p.polyline([H(4, 2.5), H(6.5, 1.6), H(9.5, 2.2)], 1.3, '#4a1a08');
    p.line(H(4, 4.8), H(9.5, 5.2), 1, '#7a3612');
    const eye = i.special || i.powered;
    p.ellipse(H(9, 7.5), eye ? 1.8 : 1.2, eye ? 3.2 : 2.4, ha, eye ? '#fff6a0' : '#d4302a');
    p.circle(H(9, 7.5), eye ? 1 : 0.6, eye ? '#ff3a1a' : '#ffd23a');
    p.line(H(9, -4), H(11.5, -4.2), 1.2, '#7a2a10');
    p.ctx.strokeStyle = GOLD[0];
    p.ctx.lineWidth = 1.2;
    p.ctx.beginPath();
    const ear = H(-0.5, -5.5);
    p.ctx.arc(ear[0], ear[1], 2.4, 0, PI * 2);
    p.ctx.stroke();
    arm(p, j.fs, j.fe, j.fhand, 9, SKIN);
    p.line(along(j.fs, j.fe, 0.35), along(j.fs, j.fe, 0.5), 9.5, GOLD[1]);
    p.line(along(j.fe, j.fhand, 0.75), along(j.fe, j.fhand, 0.85), 8.5, GOLD[1]);
    p.ball(j.fhand, 4.6, SKIN);
  },

  decu(p, j, d, i) {
    const SKIN = ramp('#f3d2bb');
    const SKINb = ramp('#f3d2bb', true);
    const HOOD = ramp('#7a52d6');
    const HOODb = ramp('#7a52d6', true);
    const PANTS = ramp('#1f1b2a');
    const PANTSb = ramp('#1f1b2a', true);
    const SHOE = ramp('#e2e2ec');
    const HAIR = ramp('#f1effa');
    const HAIRb = ramp('#f1effa', true);
    if (i.special || i.powered || i.speed > 5) sparks(p, mid(j.hip, j.neck), i.t, i.powered ? 5 : 3, 26, ['#6f3cff', '#e9ddff']);
    arm(p, j.bs, j.be, j.bhand, 7, HOODb);
    p.ball(j.bhand, 3.6, SKINb);
    leg(p, j.bhip, j.bk, j.bfoot, 8, PANTSb);
    shoe(p, j, j.bfoot, 8, 6, ramp('#e2e2ec', true));
    const B = bodyFrame(j);
    p.torso(j.hip, j.neck, d.waistW, d.chestW, HOOD);
    p.ellipse(B(-6, d.torso - 1), 6, 4, rotOf(j.lean), HOODb[1]);
    p.line(B(6, d.torso - 2), B(6.5, d.torso - 10), 1, '#efe8ff');
    p.line(B(8.5, d.torso - 2), B(9, d.torso - 9), 1, '#efe8ff');
    p.line(B(1, 4), B(9, 4), 1.4, HOOD[0]);
    leg(p, j.fhip, j.fk, j.ffoot, 8, PANTS);
    shoe(p, j, j.ffoot, 8, 6, SHOE);
    const H = headFrame(j);
    const ha = rotOf(j.headAng);
    for (let k = 0; k < 9; k++) {
      const a = 0.5 + k * 0.33;
      const base1: V = H(Math.cos(a - 0.22) * d.headR * 0.8, Math.sin(a - 0.22) * d.headR * 0.8);
      const base2: V = H(Math.cos(a + 0.22) * d.headR * 0.8, Math.sin(a + 0.22) * d.headR * 0.8);
      const len = d.headR + 7 + (k % 3) * 2;
      const tip: V = H(Math.cos(a + 0.35) * len, Math.sin(a + 0.35) * len);
      p.poly([base1, tip, base2], k % 2 ? HAIRb[1] : HAIR[1]);
    }
    p.ball(j.head, d.headR, SKIN);
    p.oval(H(-4.5, 5), d.headR * 0.8, d.headR * 0.7, ha, HAIR);
    p.poly([H(2, 10), H(13, 2), H(7, 9)], HAIR[1]);
    p.poly([H(0, 11), H(9, 5.5), H(5, 11)], HAIR[2]);
    p.ellipse(H(6.5, 1.5), 2.4, 2.4, ha, '#ffffff');
    p.circle(H(7.2, 1.3), 1.6, '#2f8cff');
    p.circle(H(7.4, 1.3), 0.7, '#0a1430');
    p.line(H(4, 4.5), H(9.5, 3.4), 1.3, '#9a96b8');
    p.line(H(7.5, -4.5), H(10, -4.2), 1, '#a8705a');
    arm(p, j.fs, j.fe, j.fhand, 7, HOOD);
    p.ball(j.fhand, 3.8, SKIN);
  },
};
