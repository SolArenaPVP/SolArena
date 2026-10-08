import { FONT, GROUND_Y } from '../config';
import type { SparkKind } from '../sim/moves';
import type { Projectile } from '../sim/match';

interface Particle {
  kind: 'dot' | 'line' | 'ring' | 'shard' | 'text' | 'bubble' | 'slash';
  x: number;
  y: number;
  vx: number;
  vy: number;
  grav: number;
  life: number;
  max: number;
  size: number;
  color: string;
  color2?: string;
  angle?: number;
  text?: string;
}

const PALETTE: Record<SparkKind, [string, string]> = {
  hit: ['#fff6c8', '#ffb02e'],
  heavy: ['#ffffff', '#ff6a1e'],
  block: ['#c9f4ff', '#3aa8ff'],
  counter: ['#fff6a0', '#ffb800'],
  armor: ['#ffe2a0', '#ff8a1e'],
  zap: ['#efe4ff', '#8b5bff'],
  ice: ['#e8fbff', '#46c8ff'],
  salt: ['#e9ffe0', '#3ddc4a'],
  candle: ['#ffd0d8', '#ff2d55'],
  yap: ['#ffffff', '#ff3b3b'],
  claw: ['#ffe0f6', '#ff4fd8'],
  slap: ['#fff3c4', '#ffb02e'],
};

export class Fx {
  parts: Particle[] = [];

  private add(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'life' | 'color'>) {
    this.parts.push({ vx: 0, vy: 0, grav: 0, size: 1, max: p.life, ...p });
  }

  spark(x: number, y: number, kind: SparkKind, dir: number) {
    const [c1, c2] = PALETTE[kind];
    const big = kind === 'heavy' || kind === 'counter' || kind === 'slap' || kind === 'candle';
    const n = big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = (big ? 3.4 : 2.4) + Math.random() * 1.6;
      this.add({ kind: 'line', x, y, vx: Math.cos(a) * sp + dir * 0.8, vy: Math.sin(a) * sp, life: big ? 14 : 10, color: i % 2 ? c1 : c2, size: big ? 6 : 4 });
    }
    this.add({ kind: 'ring', x, y, life: big ? 14 : 9, color: c2, size: big ? 26 : 14 });
    if (kind === 'block') this.add({ kind: 'ring', x, y, life: 10, color: c1, size: 10 });
    if (kind === 'slap') this.add({ kind: 'text', x, y: y + 22, vy: 0.6, life: 34, color: '#ffd23a', text: 'SLAP!', size: 16 });
    if (kind === 'counter') this.add({ kind: 'ring', x, y, life: 20, color: '#ffffff', size: 44 });
    if (kind === 'claw') {
      for (let k = 0; k < 3; k++) this.add({ kind: 'slash', x: x - 6 + k * 6, y, life: 10, color: k === 1 ? c1 : c2, size: 16, angle: dir > 0 ? -0.9 : 0.9 + Math.PI });
    }
    if (kind === 'ice' || kind === 'candle' || kind === 'salt') {
      for (let i = 0; i < 8; i++) {
        this.add({ kind: 'shard', x, y, vx: (Math.random() - 0.5) * 4 + dir, vy: 2 + Math.random() * 3, grav: 0.25, life: 26, color: i % 2 ? c1 : c2, size: 3 });
      }
    }
    if (kind === 'yap') this.add({ kind: 'bubble', x, y: y + 10, vy: 0.5, life: 24, color: '#ffffff', size: 6 });
  }

  dust(x: number, big = false) {
    const n = big ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.add({ kind: 'dot', x: x + dir * Math.random() * 8, y: 1, vx: dir * (0.6 + Math.random() * (big ? 2 : 1.2)), vy: Math.random() * 1.2, grav: 0.05, life: 22 + Math.random() * 10, color: '#8a7cc4', size: big ? 3 : 2 });
    }
  }

  popup(x: number, y: number, text: string, color: string) {
    this.add({ kind: 'text', x, y, vy: 0.5, life: 50, color, text, size: 8 });
  }

  update() {
    for (const p of this.parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= p.grav;
      p.vx *= 0.92;
      if (p.kind === 'line') p.vy *= 0.92;
      p.life--;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  }

  draw(g: CanvasRenderingContext2D, camX: number) {
    for (const p of this.parts) {
      const sx = Math.round(p.x - camX);
      const sy = Math.round(GROUND_Y - p.y);
      const t = p.life / p.max;
      switch (p.kind) {
        case 'dot':
          g.globalAlpha = Math.min(1, t * 1.5);
          g.fillStyle = p.color;
          g.fillRect(sx, sy, p.size, p.size);
          break;
        case 'shard':
          g.fillStyle = p.color;
          g.fillRect(sx, sy, p.size, p.size);
          break;
        case 'line': {
          const len = p.size * t + 1;
          const a = Math.atan2(-p.vy, p.vx);
          g.strokeStyle = p.color;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(sx - Math.cos(a) * len, sy - Math.sin(a) * len);
          g.stroke();
          break;
        }
        case 'ring':
          g.globalAlpha = t;
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(1, 3 * t);
          g.beginPath();
          g.arc(sx, sy, p.size * (1 - t * 0.7), 0, Math.PI * 2);
          g.stroke();
          break;
        case 'slash': {
          g.strokeStyle = p.color;
          g.lineWidth = 2;
          const a = p.angle ?? 0;
          const len = p.size * (1 - t * 0.3);
          g.beginPath();
          g.moveTo(sx - Math.cos(a) * len, sy - Math.sin(a) * len);
          g.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
          g.stroke();
          break;
        }
        case 'bubble':
          g.globalAlpha = t;
          g.fillStyle = p.color;
          g.fillRect(sx - p.size, sy - p.size / 2, p.size * 2, p.size);
          g.fillStyle = '#ff3b3b';
          g.fillRect(sx - 3, sy - 1, 2, 2);
          g.fillRect(sx + 1, sy - 1, 2, 2);
          break;
        case 'text':
          g.globalAlpha = Math.min(1, t * 2);
          g.font = `${p.size}px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = '#0d0816';
          g.fillText(p.text!, sx + 1, sy + 1);
          g.fillStyle = p.color;
          g.fillText(p.text!, sx, sy);
          break;
      }
      g.globalAlpha = 1;
    }
  }
}

const YAP_WORDS = ['YAP', 'GM', 'SER', 'FUD', 'NGMI', 'WEN'];

export function drawProjectile(g: CanvasRenderingContext2D, p: Projectile, camX: number, frame: number) {
  const sx = Math.round(p.x - camX);
  const sy = Math.round(GROUND_Y - p.y);
  const waiting = p.age < p.delay;
  switch (p.kind) {
    case 'yap': {
      if (waiting) return;
      const w = p.w;
      const h = p.h;
      const wob = Math.round(Math.sin((p.age + p.variant * 7) * 0.3) * 1.5);
      const x0 = sx - w / 2;
      const y0 = sy - h + wob;
      g.fillStyle = '#0d0816';
      g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
      g.fillStyle = p.powered ? '#fff2a0' : '#ffffff';
      g.fillRect(x0, y0, w, h);
      g.fillStyle = '#0d0816';
      const tx = p.facing === 1 ? x0 + 3 : x0 + w - 7;
      g.fillRect(tx, y0 + h, 4, 3);
      g.fillStyle = p.powered ? '#fff2a0' : '#ffffff';
      g.fillRect(tx + 1, y0 + h, 2, 2);
      g.fillStyle = '#e8262e';
      g.font = `${p.powered ? 8 : 6}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(YAP_WORDS[p.variant % YAP_WORDS.length], sx, y0 + h / 2 + 1);
      break;
    }
    case 'candle': {
      if (waiting) {
        const pulse = 0.4 + 0.4 * Math.sin(p.age * 0.6);
        g.fillStyle = `rgba(255,45,85,${pulse})`;
        g.beginPath();
        g.ellipse(sx, sy - 1, p.w * 0.8, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ff2d55';
        g.fillRect(sx - 1, sy - 6 - (p.age % 6), 2, 2);
        return;
      }
      const t = p.age - p.delay;
      const rise = Math.min(1, t / 4);
      const fade = p.age > p.life - 6 ? (p.life - p.age) / 6 : 1;
      const h = Math.round(p.h * rise);
      const bw = Math.round(p.w * 0.62);
      g.globalAlpha = fade;
      g.fillStyle = 'rgba(255,45,85,0.25)';
      g.fillRect(sx - p.w / 2 - 4, sy - h - 6, p.w + 8, h + 6);
      g.fillStyle = '#ff9fb2';
      g.fillRect(sx - 1, sy - h - 10, 2, h + 10);
      g.fillStyle = '#c4123a';
      g.fillRect(sx - bw / 2 - 1, sy - h + 8, bw + 2, h - 8);
      g.fillStyle = '#ff2d55';
      g.fillRect(sx - bw / 2, sy - h + 9, bw, h - 9);
      g.fillStyle = '#ff8aa0';
      g.fillRect(sx - bw / 2 + 2, sy - h + 10, 2, h - 12);
      g.globalAlpha = 1;
      break;
    }
    case 'salt': {
      const spin = Math.floor(p.age / 3) % 4;
      g.save();
      g.translate(sx, sy - p.h / 2);
      g.rotate((spin * Math.PI) / 2);
      g.fillStyle = '#0d0816';
      g.fillRect(-5, -8, 10, 16);
      g.fillStyle = '#f0f4f2';
      g.fillRect(-4, -4, 8, 11);
      g.fillStyle = '#9aa3a8';
      g.fillRect(-4, -7, 8, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(-3, -3, 2, 8);
      g.fillStyle = '#3ddc4a';
      g.fillRect(-2, 1, 4, 3);
      g.restore();
      if (p.age % 3 === 0) {
        g.fillStyle = '#ffffff';
        g.fillRect(sx - p.facing * 6, sy - 4, 1, 1);
      }
      break;
    }
    case 'splash': {
      const t = p.age / p.life;
      const w = p.w;
      g.globalAlpha = 1 - t * 0.7;
      for (let k = 0; k < 9; k++) {
        const ox = ((k / 8) - 0.5) * w;
        const hh = (Math.sin(k * 2.3) * 0.5 + 0.8) * p.h * (1 - t) * (k % 2 ? 1 : 0.7);
        g.fillStyle = k % 3 === 0 ? '#9cff7a' : '#3ddc4a';
        g.fillRect(Math.round(sx + ox - 3), Math.round(sy - hh), 6, Math.round(hh));
        g.fillStyle = '#e9ffe0';
        g.fillRect(Math.round(sx + ox - 1), Math.round(sy - hh - 3 - t * 10), 2, 2);
      }
      g.fillStyle = '#2aa83a';
      g.fillRect(Math.round(sx - w / 2), sy - 3, w, 3);
      g.globalAlpha = 1;
      break;
    }
    case 'ice': {
      const n = p.powered ? 6 : 4;
      for (let k = 0; k < n; k++) {
        const ox = sx - p.facing * k * 9;
        const scale = 1 - k / (n + 1);
        const hh = Math.round(p.h * scale * (0.8 + 0.2 * Math.sin(frame * 0.5 + k)));
        const ww = Math.round((p.w / 2) * scale);
        g.fillStyle = '#1a6fa8';
        g.beginPath();
        g.moveTo(ox - ww - 1, sy);
        g.lineTo(ox + p.facing * 2, sy - hh - 1);
        g.lineTo(ox + ww + 1, sy);
        g.fill();
        g.fillStyle = k === 0 ? '#e8fbff' : '#7fdcff';
        g.beginPath();
        g.moveTo(ox - ww, sy);
        g.lineTo(ox + p.facing * 2, sy - hh);
        g.lineTo(ox + ww, sy);
        g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(ox - 1, sy - Math.round(hh * 0.7), 1, Math.round(hh * 0.4));
      }
      g.fillStyle = 'rgba(160,230,255,0.35)';
      g.fillRect(Math.min(sx, sx - p.facing * n * 9), sy - 2, n * 9, 2);
      break;
    }
    case 'beam': {
      if (waiting) return;
      const t = p.age / p.life;
      const h = Math.round(p.h * (1 - Math.abs(t - 0.4) * 0.8));
      const x0 = Math.round(sx - p.w / 2);
      g.fillStyle = 'rgba(255,200,40,0.35)';
      g.fillRect(x0, sy - p.h / 2 - h / 2 - 4, p.w, h + 8);
      g.fillStyle = '#ffd23a';
      g.fillRect(x0, sy - p.h / 2 - h / 2, p.w, h);
      g.fillStyle = '#fff6c8';
      g.fillRect(x0, sy - p.h / 2 - h / 4, p.w, Math.max(2, h / 2));
      for (let k = 0; k < 6; k++) {
        const rx = x0 + ((frame * 9 + k * 53) % p.w);
        g.fillStyle = '#ffffff';
        g.fillRect(rx, sy - p.h / 2 - 1, 6, 2);
      }
      break;
    }
  }
}
