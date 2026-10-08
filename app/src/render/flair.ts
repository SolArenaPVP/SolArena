import { FONT } from '../config';
import { standHipH } from '../rig';
import type { FlairEffect } from '../sim/flair';
import type { FighterDef } from '../sim/roster';

const TAU = Math.PI * 2;
const YAP = ['GM', 'YAP', 'SER', 'WAGMI', 'LFG'];

/** Pseudo-random but stable per (t, k), so effects don't shimmer between identical frames. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export function fighterHeight(def: FighterDef) {
  return standHipH(def.dims) + def.dims.torso + def.dims.neck + def.dims.headR * 2;
}

/** Effects drawn behind the sprite. */
export function drawFlairBack(g: CanvasRenderingContext2D, effect: FlairEffect | undefined, t: number, x: number, y: number, def: FighterDef) {
  if (effect !== 'halo') return;
  const h = fighterHeight(def);
  const cy = y - h * 0.62;
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.12);
  g.strokeStyle = `rgba(255,210,58,${0.35 + pulse * 0.35})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, cy, 26 + pulse * 3, 0, TAU);
  g.stroke();
  g.fillStyle = `rgba(255,226,122,${0.12 + pulse * 0.1})`;
  g.beginPath();
  g.arc(x, cy, 24, 0, TAU);
  g.fill();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + t * 0.02;
    g.fillStyle = '#ffd23a';
    g.fillRect(Math.round(x + Math.cos(a) * 34), Math.round(cy + Math.sin(a) * 34), 2, 2);
  }
}

/** Effects drawn over the sprite. dir is the fighter's facing. */
/** y is the (possibly floating) body floor point; floor is the real floor line for ground effects. */
export function drawFlairFront(g: CanvasRenderingContext2D, effect: FlairEffect | undefined, t: number, x: number, y: number, floor: number, dir: number, def: FighterDef) {
  if (!effect) return;
  const h = fighterHeight(def);
  switch (effect) {
    case 'bandages':
    case 'unwrap': {
      const inward = effect === 'bandages';
      const span = inward ? 76 : 90;
      const k = Math.min(1, t / span);
      const r = inward ? 46 * (1 - k) + 8 : 10 + k * 60;
      const alpha = inward ? 1 : 1 - k;
      g.globalAlpha = alpha;
      for (let s = 0; s < 5; s++) {
        const base = t * 0.16 + (s / 5) * TAU;
        const cy = y - h * (0.25 + s * 0.13);
        const pts: [number, number][] = [];
        for (let i = 0; i < 6; i++) {
          const a = base + i * 0.22;
          pts.push([x + Math.cos(a) * r, cy + Math.sin(a) * r * 0.35]);
        }
        for (const [w, c] of [[4, '#6d6656'], [2, '#e8dec5']] as const) {
          g.strokeStyle = c;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(pts[0][0], pts[0][1]);
          for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      break;
    }
    case 'lightning': {
      if (t % 70 > 12) break;
      const flash = 1 - (t % 70) / 12;
      const pts: [number, number][] = [[x + (hash(t, 1) - 0.5) * 30, y - 260]];
      let px = pts[0][0];
      for (let py = y - 240; py < y; py += 20) {
        px += (hash(t, py) - 0.5) * 26;
        pts.push([px, py]);
      }
      pts.push([x, y - 4]);
      for (const [w, c] of [[6, `rgba(139,91,255,${0.6 * flash})`], [2, `rgba(255,255,255,${flash})`]] as const) {
        g.strokeStyle = c;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
        g.stroke();
      }
      g.fillStyle = `rgba(200,170,255,${0.35 * flash})`;
      g.beginPath();
      g.ellipse(x, floor - 2, 30, 6, 0, 0, TAU);
      g.fill();
      break;
    }
    case 'ice': {
      const k = Math.min(1, t / 40);
      for (let s = -4; s <= 4; s++) {
        const sx = x + s * 7;
        const sh = Math.round((6 + hash(s, 3) * 10) * k * (1 - Math.abs(s) / 6));
        if (sh <= 0) continue;
        g.fillStyle = '#1a6fa8';
        g.beginPath();
        g.moveTo(sx - 4, floor + 1);
        g.lineTo(sx, floor - sh - 1);
        g.lineTo(sx + 4, floor + 1);
        g.fill();
        g.fillStyle = s % 2 ? '#7fdcff' : '#e8fbff';
        g.beginPath();
        g.moveTo(sx - 3, floor);
        g.lineTo(sx, floor - sh);
        g.lineTo(sx + 3, floor);
        g.fill();
      }
      g.fillStyle = 'rgba(160,230,255,0.35)';
      g.fillRect(Math.round(x - 34 * k), floor - 1, Math.round(68 * k), 3);
      break;
    }
    case 'iceTrail': {
      g.fillStyle = 'rgba(160,230,255,0.45)';
      g.fillRect(Math.round(dir > 0 ? x - 90 : x), floor - 1, 90, 2);
      for (let i = 0; i < 6; i++) {
        const sx = x - dir * (10 + hash(t >> 1, i) * 80);
        g.fillStyle = i % 2 ? '#e8fbff' : '#7fdcff';
        g.fillRect(Math.round(sx), Math.round(floor - 2 - hash(i, t >> 1) * 8), 2, 2);
      }
      break;
    }
    case 'yap': {
      for (let i = 0; i < 3; i++) {
        const phase = (t + i * 14) % 42;
        if (phase > 30) continue;
        const bx = Math.round(x + dir * (8 + i * 10) + (hash(i, Math.floor((t + i * 14) / 42)) - 0.5) * 20);
        const by = Math.round(y - h - 6 - phase * 0.8);
        const word = YAP[(Math.floor((t + i * 14) / 42) + i) % YAP.length];
        const w = word.length * 5 + 6;
        g.fillStyle = '#0d0816';
        g.fillRect(bx - w / 2 - 1, by - 7, w + 2, 12);
        g.fillStyle = '#ffffff';
        g.fillRect(bx - w / 2, by - 6, w, 10);
        g.fillStyle = '#e8262e';
        g.font = `6px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(word, bx, by - 1);
      }
      break;
    }
    case 'salt': {
      const hx = x + dir * 14;
      for (let i = 0; i < 10; i++) {
        const fall = ((t * 2 + i * 9) % 40);
        g.fillStyle = i % 3 ? '#ffffff' : '#9cff7a';
        g.fillRect(Math.round(hx + (hash(i, 7) - 0.5) * 10), Math.round(y - h * 0.55 + fall), 1, 1);
      }
      break;
    }
    case 'dust': {
      if (t > 12) break;
      g.fillStyle = `rgba(138,124,196,${1 - t / 12})`;
      for (let i = -3; i <= 3; i++) g.fillRect(Math.round(x + i * (4 + t)), floor - 2 - Math.abs(i), 3, 2);
      break;
    }
    case 'flex': {
      if (t % 60 > 16) break;
      for (const side of [-1, 1]) {
        const sx = Math.round(x + side * 18);
        const sy = Math.round(y - h * 0.72);
        g.fillStyle = '#fff6c8';
        g.fillRect(sx - 3, sy, 7, 1);
        g.fillRect(sx, sy - 3, 1, 7);
      }
      break;
    }
    case 'halo':
      break;
  }
}
