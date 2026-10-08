import type { V } from '../rig';

/** dark / base / light ramp for one material. */
export type Ramp = [string, string, string];

const rampCache = new Map<string, Ramp>();

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Shadows lean cool/purple, highlights lean warm, which reads as "painted pixel art" instead of flat shading. */
export function ramp(base: string, back = false): Ramp {
  const key = base + (back ? 'b' : '');
  let r = rampCache.get(key);
  if (!r) {
    const b = back ? mix(base, '#1b1336', 0.28) : base;
    r = [mix(b, '#1b1336', 0.42), b, mix(b, '#fff6dc', 0.38)];
    rampCache.set(key, r);
  }
  return r;
}

export const rgb = parseHex;

/**
 * Sprites animate on a looping 48-step clock (one step = 2 frames), so every
 * idle/walk/cloth frame repeats and the sprite cache can reuse it.
 */
export const ANIM_STEPS = 48;
export const animStep = (tick: number) => (tick >> 1) % ANIM_STEPS;
const STEP_ANGLE = (Math.PI * 2) / ANIM_STEPS;

export class Painter {
  constructor(public ctx: CanvasRenderingContext2D) {}

  line(a: V, b: V, w: number, color: string) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
  }

  polyline(pts: V[], w: number, color: string) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  }

  /** Cylinder-shaded limb segment. */
  limb(a: V, b: V, w: number, r: Ramp) {
    this.line(a, b, w, r[0]);
    const o = Math.min(1, w * 0.12);
    this.line([a[0], a[1] + o], [b[0], b[1] + o], Math.max(1, w - 2), r[1]);
    const ho = w * 0.22;
    this.line([a[0] - 0.3, a[1] + ho], [b[0] - 0.3, b[1] + ho], Math.max(1, w * 0.26), r[2]);
  }

  circle(c: V, rad: number, color: string) {
    const x = this.ctx;
    x.fillStyle = color;
    x.beginPath();
    x.arc(c[0], c[1], Math.max(0.5, rad), 0, Math.PI * 2);
    x.fill();
  }

  ellipse(c: V, rx: number, ry: number, rot: number, color: string) {
    const x = this.ctx;
    x.fillStyle = color;
    x.beginPath();
    x.ellipse(c[0], c[1], Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
    x.fill();
  }

  /** Sphere-shaded ball. */
  ball(c: V, rad: number, r: Ramp) {
    this.circle(c, rad, r[0]);
    this.circle([c[0] + 0.3, c[1] + 0.6], rad - 1.1, r[1]);
    this.circle([c[0] - rad * 0.2, c[1] + rad * 0.38], rad * 0.38, r[2]);
  }

  oval(c: V, rx: number, ry: number, rot: number, r: Ramp) {
    this.ellipse(c, rx, ry, rot, r[0]);
    this.ellipse([c[0] + 0.3, c[1] + 0.6], rx - 1.1, ry - 1.1, rot, r[1]);
    this.ellipse([c[0] - rx * 0.18, c[1] + ry * 0.4], rx * 0.45, ry * 0.32, rot, r[2]);
  }

  poly(pts: V[], color: string) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fill();
  }

  /** Tapered torso slab from hip to neck with a lit front edge. */
  torso(hip: V, neck: V, waistW: number, chestW: number, r: Ramp) {
    const dx = neck[0] - hip[0];
    const dy = neck[1] - hip[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const q = (p: V, s: number, w: number): V => [p[0] + nx * s * w / 2, p[1] + ny * s * w / 2];
    const shape = (w0: number, w1: number): V[] => [q(hip, 1, w0), q(neck, 1, w1), q(neck, -1, w1), q(hip, -1, w0)];
    this.poly(shape(waistW, chestW), r[0]);
    this.circle(neck, chestW / 2, r[0]);
    this.circle(hip, waistW / 2, r[0]);
    this.poly(shape(waistW - 2, chestW - 2), r[1]);
    this.circle([neck[0], neck[1] + 0.5], chestW / 2 - 1, r[1]);
    this.circle(hip, waistW / 2 - 1, r[1]);
    // light falls on the upper-front of the chest
    const lit: V[] = [q(hip, -0.15, waistW), q(neck, -0.15, chestW), q(neck, -0.8, chestW), q(hip, -0.6, waistW)];
    this.poly(lit.map(([x, y]) => [x, y] as V), r[2]);
    this.circle([neck[0] - nx * chestW * 0.2, neck[1] - ny * chestW * 0.2 + 1], chestW * 0.28, r[2]);
  }

  /** Fluttering cloth strip (scarves, bandages, hair). Angle is the trailing direction; positive droop bends a backward-trailing strip toward the floor. */
  ribbon(anchor: V, angle: number, segs: number, segLen: number, w0: number, w1: number, r: Ramp, t: number, flutter: number, droop = 0.25) {
    const pts: V[] = [anchor];
    let a = angle;
    let p = anchor;
    for (let i = 1; i <= segs; i++) {
      const k = i / segs;
      a += Math.sin(t * STEP_ANGLE * 3 + i * 0.9) * flutter * 0.18 * k + droop * 0.12;
      p = [p[0] + Math.cos(a) * segLen, p[1] + Math.sin(a) * segLen];
      pts.push(p);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const w = w0 + (w1 - w0) * (i / (pts.length - 1));
      this.line(pts[i], pts[i + 1], w + 1, r[0]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const w = w0 + (w1 - w0) * (i / (pts.length - 1));
      this.line([pts[i][0], pts[i][1] + 0.5], [pts[i + 1][0], pts[i + 1][1] + 0.5], Math.max(1, w - 1), r[1]);
    }
    return pts;
  }
}

export interface PixelFx {
  outline: string;
  flash?: boolean;
  tint?: { color: string; amount: number };
  dither?: boolean;
  aura?: string;
  /** Alternate costume for mirror matches: rotates the color channels. */
  alt?: boolean;
}

/**
 * Turns the anti-aliased vector drawing into crisp pixel art: hard alpha,
 * a 1px dark outline, plus optional hit flash / tint / dither / aura rings.
 */
export function pixelize(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, fx: PixelFx): ImageData {
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    if (d[i + 3] >= 110) {
      solid[p] = 1;
      d[i + 3] = 255;
      if (fx.flash) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
      } else if (fx.tint) {
        const [tr, tg, tb] = rgb(fx.tint.color);
        const a = fx.tint.amount;
        d[i] += (tr - d[i]) * a;
        d[i + 1] += (tg - d[i + 1]) * a;
        d[i + 2] += (tb - d[i + 2]) * a;
      }
      if (fx.alt) {
        const r = d[i];
        d[i] = d[i + 2];
        d[i + 2] = d[i + 1];
        d[i + 1] = r;
      }
    } else {
      d[i + 3] = 0;
    }
  }
  const [or, og, ob] = rgb(fx.outline);
  const ring = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (solid[p]) continue;
      if (solid[p - 1] || solid[p + 1] || solid[p - w] || solid[p + w]) {
        ring[p] = 1;
        const i = p * 4;
        d[i] = or;
        d[i + 1] = og;
        d[i + 2] = ob;
        d[i + 3] = 255;
      }
    }
  }
  if (fx.aura) {
    const [ar, ag, ab] = rgb(fx.aura);
    for (let pass = 0; pass < 2; pass++) {
      const src = ring.slice();
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (solid[p] || src[p]) continue;
          if (src[p - 1] || src[p + 1] || src[p - w] || src[p + w]) {
            ring[p] = 2;
            const i = p * 4;
            d[i] = ar;
            d[i + 1] = ag;
            d[i + 2] = ab;
            d[i + 3] = pass === 0 ? 255 : 150;
          }
        }
      }
    }
  }
  if (fx.dither) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if ((x + y) % 2 === 0) d[(y * w + x) * 4 + 3] = 0;
    }
  }
  return img;
}
