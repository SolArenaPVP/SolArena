import { FONT, GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';

const FLOOR_TOP = 212;
const BACK_PARALLAX = 0.25;
const MID_PARALLAX = 0.55;
const BACK_W = Math.ceil(VIEW_W + (STAGE_W - VIEW_W) * BACK_PARALLAX) + 4;
const MID_W = Math.ceil(VIEW_W + (STAGE_W - VIEW_W) * MID_PARALLAX) + 4;
const SCREEN = { x: Math.round(BACK_W / 2 - 82), y: 14, w: 164, h: 74 };
const PILLARS = [22, 168, MID_W - 202, MID_W - 56].map(Math.round);

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Deterministic hash noise so the arena is identical every load. */
function rnd(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function solLogo(g: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const bar = Math.max(2, Math.round(w / 6));
  const grad = g.createLinearGradient(x, y, x + w, y + bar * 5);
  grad.addColorStop(0, '#14f195');
  grad.addColorStop(1, '#9945ff');
  g.fillStyle = grad;
  for (let k = 0; k < 3; k++) {
    const yy = y + k * bar * 2;
    g.beginPath();
    if (k === 1) {
      g.moveTo(x, yy);
      g.lineTo(x + w - bar, yy);
      g.lineTo(x + w, yy + bar);
      g.lineTo(x + bar, yy + bar);
    } else {
      g.moveTo(x + bar, yy);
      g.lineTo(x + w, yy);
      g.lineTo(x + w - bar, yy + bar);
      g.lineTo(x, yy + bar);
    }
    g.closePath();
    g.fill();
  }
}

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

export class Arena {
  private back: HTMLCanvasElement[];
  private mid: HTMLCanvasElement;
  private candles: Candle[] = [];
  private price = 50;
  private embers: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private seed = 7;

  constructor() {
    this.back = [this.buildBack(0), this.buildBack(1)];
    this.mid = this.buildMid();
    for (let i = 0; i < 22; i++) this.pushCandle();
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private pushCandle() {
    const o = this.price;
    const drift = (this.rand() - 0.42) * 9;
    const c = Math.max(12, Math.min(88, o + drift));
    this.candles.push({ o, c, h: Math.max(o, c) + this.rand() * 4, l: Math.min(o, c) - this.rand() * 4 });
    this.price = c;
    if (this.candles.length > 22) this.candles.shift();
  }

  private buildBack(frame: number) {
    const c = canvas(BACK_W, FLOOR_TOP + 2);
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, FLOOR_TOP);
    sky.addColorStop(0, '#07051a');
    sky.addColorStop(0.55, '#140e3a');
    sky.addColorStop(1, '#231656');
    g.fillStyle = sky;
    g.fillRect(0, 0, BACK_W, FLOOR_TOP + 2);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = rnd(i) > 0.8 ? '#a9c8ff' : '#4b4790';
      g.fillRect(Math.floor(rnd(i + 1) * BACK_W), Math.floor(rnd(i + 2) * 40), 1, 1);
    }
    // stadium light rigs
    for (let x = 30; x < BACK_W; x += 110) {
      g.fillStyle = '#1c1740';
      g.fillRect(x, 0, 2, 12);
      g.fillStyle = '#fff4c2';
      g.fillRect(x - 4, 12, 10, 3);
      g.fillStyle = 'rgba(255,240,190,0.08)';
      g.beginPath();
      g.moveTo(x - 4, 15);
      g.lineTo(x + 6, 15);
      g.lineTo(x + 40, FLOOR_TOP);
      g.lineTo(x - 38, FLOOR_TOP);
      g.fill();
    }
    // three seating tiers of the coliseum
    const tiers = [
      { y: 96, h: 34, wall: '#1d1744', head: ['#3b2f6c', '#4b3c84', '#2e2559', '#5a3f8c'] },
      { y: 132, h: 36, wall: '#221a4e', head: ['#463885', '#57449a', '#352a68', '#6b4a9e'] },
      { y: 170, h: 40, wall: '#281f58', head: ['#52418f', '#6650a8', '#3f3278', '#7d58b0'] },
    ];
    let n = 0;
    for (const t of tiers) {
      g.fillStyle = t.wall;
      g.fillRect(0, t.y, BACK_W, t.h);
      g.fillStyle = '#3d3374';
      g.fillRect(0, t.y, BACK_W, 2);
      g.fillStyle = '#120e2c';
      g.fillRect(0, t.y + t.h - 3, BACK_W, 3);
      const rowH = 9;
      for (let row = 0; row < Math.floor((t.h - 6) / rowH); row++) {
        for (let x = 2; x < BACK_W; x += 6) {
          n++;
          if (rnd(n) < 0.12) continue;
          const bob = (frame + Math.floor(rnd(n + 9) * 2)) % 2;
          const hx = x + Math.floor(rnd(n + 3) * 2);
          const hy = t.y + 5 + row * rowH + bob;
          g.fillStyle = t.head[Math.floor(rnd(n + 5) * t.head.length)];
          g.fillRect(hx, hy + 3, 5, 6);
          g.fillRect(hx + 1, hy, 3, 3);
          if (rnd(n + 7) < 0.035) {
            g.fillStyle = rnd(n + 8) < 0.5 ? '#9ff4ff' : '#14f195';
            g.fillRect(hx + 1, hy - 3 - bob, 2, 2);
          }
          if (frame === 1 && rnd(n + 11) < 0.06) {
            g.fillStyle = t.head[1];
            g.fillRect(hx + 4, hy - 4, 2, 5);
          }
        }
      }
    }
    // screen housing (the chart itself is drawn live)
    g.fillStyle = '#0d0a22';
    g.fillRect(SCREEN.x - 6, SCREEN.y - 6, SCREEN.w + 12, SCREEN.h + 12);
    g.fillStyle = '#3a2f78';
    g.fillRect(SCREEN.x - 6, SCREEN.y - 6, SCREEN.w + 12, 2);
    g.fillRect(SCREEN.x - 6, SCREEN.y + SCREEN.h + 4, SCREEN.w + 12, 2);
    g.fillStyle = '#17123a';
    g.fillRect(SCREEN.x + 10, SCREEN.y + SCREEN.h + 6, 6, 96 - SCREEN.h - SCREEN.y);
    g.fillRect(SCREEN.x + SCREEN.w - 16, SCREEN.y + SCREEN.h + 6, 6, 96 - SCREEN.h - SCREEN.y);
    return c;
  }

  private buildMid() {
    const c = canvas(MID_W, FLOOR_TOP + 4);
    const g = c.getContext('2d')!;
    // banners between pillars
    for (const i of [0, 2]) {
      const cx = Math.round((PILLARS[i] + 34 + PILLARS[i + 1]) / 2);
      this.banner(g, cx - 18, 58, 36, 92);
    }
    for (const px of PILLARS) {
      const top = 40;
      g.fillStyle = '#211b46';
      g.fillRect(px, top, 34, FLOOR_TOP + 4 - top);
      for (let y = top + 10; y < FLOOR_TOP; y += 10) {
        g.fillStyle = '#171236';
        g.fillRect(px, y, 34, 1);
        const off = (y / 10) % 2 ? 0 : 17;
        g.fillRect(px + off, y - 10, 1, 10);
        for (let k = 0; k < 4; k++) {
          const r = rnd(px + y * 3 + k);
          g.fillStyle = r > 0.5 ? '#2a2357' : '#1b163d';
          g.fillRect(px + Math.floor(r * 32), y - 8 + Math.floor(rnd(px + k + y) * 7), 2, 1);
        }
      }
      g.fillStyle = '#3c3278';
      g.fillRect(px, top, 3, FLOOR_TOP + 4 - top);
      g.fillStyle = '#120e2a';
      g.fillRect(px + 31, top, 3, FLOOR_TOP + 4 - top);
      g.fillStyle = '#2d2660';
      g.fillRect(px - 4, top - 8, 42, 8);
      g.fillStyle = '#4a3f8c';
      g.fillRect(px - 4, top - 8, 42, 2);
      g.fillStyle = '#2d2660';
      g.fillRect(px - 3, FLOOR_TOP - 6, 40, 8);
      // torch bracket
      g.fillStyle = '#5b4a2a';
      g.fillRect(px + 13, 116, 8, 3);
      g.fillStyle = '#8a6b33';
      g.fillRect(px + 11, 108, 12, 8);
      g.fillStyle = '#c99a45';
      g.fillRect(px + 11, 108, 12, 2);
    }
    return c;
  }

  private banner(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    g.fillStyle = '#5c3d9a';
    g.fillRect(x - 3, y - 3, w + 6, 3);
    g.fillStyle = '#2a1458';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w, y + h);
    g.lineTo(x + w / 2, y + h - 10);
    g.lineTo(x, y + h);
    g.fill();
    g.fillStyle = '#3b1f78';
    g.fillRect(x + 3, y, w - 6, h - 14);
    g.fillStyle = '#7a4fd0';
    g.fillRect(x + 3, y, 1, h - 12);
    g.fillRect(x + w - 4, y, 1, h - 12);
    solLogo(g, x + 8, y + 14, w - 16);
    g.fillStyle = '#d9ccff';
    g.font = `8px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText('SOL', x + w / 2 + 1, y + 44);
  }

  update(frame: number) {
    if (frame % 45 === 0) this.pushCandle();
    if (frame % 3 === 0) {
      const px = PILLARS[Math.floor(this.rand() * PILLARS.length)];
      this.embers.push({ x: px + 17 + (this.rand() - 0.5) * 6, y: 104, vx: (this.rand() - 0.5) * 0.3, vy: -0.3 - this.rand() * 0.5, life: 50 + this.rand() * 40 });
    }
    for (const e of this.embers) {
      e.x += e.vx + Math.sin((frame + e.y) * 0.05) * 0.15;
      e.y += e.vy;
      e.life--;
    }
    this.embers = this.embers.filter((e) => e.life > 0);
  }

  /** bear: the final-boss look, with an all-red chart and a blood-red wash over the arena. */
  draw(g: CanvasRenderingContext2D, camX: number, frame: number, hype = 0, bear = false) {
    const bx = Math.round(-camX * BACK_PARALLAX);
    const crowdFrame = Math.floor(frame / (hype > 0 ? 6 : 18)) % 2;
    g.drawImage(this.back[crowdFrame], bx, 0);
    this.drawScreen(g, bx + SCREEN.x, SCREEN.y, frame, bear);
    const mx = Math.round(-camX * MID_PARALLAX);
    g.drawImage(this.mid, mx, 0);
    for (const px of PILLARS) this.torch(g, mx + px + 17, 106, frame + px);
    for (const e of this.embers) {
      g.fillStyle = e.life > 30 ? '#ffcf5a' : '#ff6a2a';
      g.fillRect(Math.round(mx + e.x), Math.round(e.y), 1, 1);
    }
    if (bear) {
      g.fillStyle = `rgba(255,30,70,${0.12 + 0.04 * Math.sin(frame * 0.05)})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.drawFloor(g, camX, frame);
  }

  private torch(g: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const glow = g.createRadialGradient(x, y, 2, x, y, 30);
    glow.addColorStop(0, 'rgba(255,170,60,0.35)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = glow;
    g.fillRect(x - 30, y - 30, 60, 60);
    const f = Math.floor(t / 4) % 4;
    const shapes = [
      [[-4, 0, 9, 3], [-3, -4, 7, 4], [-2, -8, 4, 4], [0, -11, 2, 3]],
      [[-4, 0, 9, 3], [-4, -4, 7, 4], [-2, -9, 5, 5], [-1, -12, 2, 3]],
      [[-4, 0, 9, 3], [-3, -5, 8, 5], [-1, -9, 4, 4], [1, -12, 2, 3]],
      [[-4, 0, 9, 3], [-3, -4, 7, 4], [-3, -8, 5, 4], [-2, -11, 2, 3]],
    ][f];
    const cols = ['#ff5a1f', '#ff8a1e', '#ffc23a', '#fff1a8'];
    shapes.forEach(([dx, dy, w, h], k) => {
      g.fillStyle = cols[k];
      g.fillRect(x + dx, y + dy, w, h);
    });
    g.fillStyle = '#fff8d8';
    g.fillRect(x, y - 3, 2, 3);
  }

  private drawScreen(g: CanvasRenderingContext2D, x: number, y: number, frame: number, bear: boolean) {
    g.fillStyle = '#05040f';
    g.fillRect(x, y, SCREEN.w, SCREEN.h);
    g.fillStyle = '#0f1430';
    for (let gy = y + 8; gy < y + SCREEN.h; gy += 12) g.fillRect(x, gy, SCREEN.w, 1);
    g.fillStyle = '#9fe8ff';
    g.font = `8px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('$SOL', x + 4, y + 3);
    const last = this.candles[this.candles.length - 1];
    const up = last.c >= last.o && !bear;
    g.fillStyle = up ? '#14f195' : '#ff3d6a';
    g.textAlign = 'right';
    g.fillText((last.c * 4.2).toFixed(1), x + SCREEN.w - 4, y + 3);
    const cw = Math.floor((SCREEN.w - 8) / this.candles.length);
    const yOf = (v: number) => Math.round(y + SCREEN.h - 4 - ((v - 5) / 90) * (SCREEN.h - 18));
    this.candles.forEach((c, i) => {
      const live = i === this.candles.length - 1;
      const close = live ? c.c + Math.sin(frame * 0.2) * 2 : c.c;
      const green = close >= c.o && !bear;
      const cx = x + 4 + i * cw;
      g.fillStyle = green ? '#14f195' : '#ff3d6a';
      g.fillRect(cx + Math.floor(cw / 2) - 1, yOf(c.h), 1, Math.max(1, yOf(c.l) - yOf(c.h)));
      const top = yOf(Math.max(c.o, close));
      g.fillRect(cx + 1, top, Math.max(2, cw - 2), Math.max(2, yOf(Math.min(c.o, close)) - top));
    });
    if (frame % 60 < 40) {
      g.fillStyle = '#ffd23a';
      g.textAlign = 'center';
      g.fillText(bear ? 'BEAR MARKET' : 'THE TRENCHES', x + SCREEN.w / 2, y + SCREEN.h + 7);
    }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x, y + ((frame * 2) % SCREEN.h), SCREEN.w, 2);
  }

  private drawFloor(g: CanvasRenderingContext2D, camX: number, frame: number) {
    const grad = g.createLinearGradient(0, FLOOR_TOP, 0, VIEW_H);
    grad.addColorStop(0, '#2b2160');
    grad.addColorStop(0.35, '#1d1645');
    grad.addColorStop(1, '#0f0b26');
    g.fillStyle = grad;
    g.fillRect(0, FLOOR_TOP, VIEW_W, VIEW_H - FLOOR_TOP);
    g.fillStyle = '#4a3d92';
    g.fillRect(0, FLOOR_TOP, VIEW_W, 1);
    g.fillStyle = '#120e2c';
    g.fillRect(0, FLOOR_TOP + 1, VIEW_W, 2);
    const center = camX + VIEW_W / 2;
    const k0 = 0.62;
    const k1 = 1.3;
    const proj = (wx: number, k: number) => VIEW_W / 2 + (wx - center) * k;
    g.strokeStyle = '#2f2668';
    g.lineWidth = 1;
    g.beginPath();
    for (let wx = 0; wx <= STAGE_W; wx += 40) {
      g.moveTo(Math.round(proj(wx, k0)) + 0.5, FLOOR_TOP + 3);
      g.lineTo(Math.round(proj(wx, k1)) + 0.5, VIEW_H);
    }
    for (const t of [0.12, 0.28, 0.5, 0.78]) {
      const y = Math.round(FLOOR_TOP + 3 + (VIEW_H - FLOOR_TOP - 3) * t) + 0.5;
      g.moveTo(0, y);
      g.lineTo(VIEW_W, y);
    }
    g.stroke();
    // emblem at stage center
    const ex = proj(STAGE_W / 2, (k0 + k1) / 2 + 0.06);
    const ey = GROUND_Y - 6;
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.05);
    g.strokeStyle = `rgba(153,69,255,${0.45 + pulse * 0.3})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(ex, ey, 74, 15, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `rgba(20,241,149,${0.3 + pulse * 0.25})`;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(ex, ey, 60, 11, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `rgba(255,210,58,${0.35 + pulse * 0.2})`;
    g.beginPath();
    g.moveTo(ex - 14, ey + 3);
    g.lineTo(ex - 16, ey - 5);
    g.lineTo(ex - 7, ey - 1);
    g.lineTo(ex, ey - 7);
    g.lineTo(ex + 7, ey - 1);
    g.lineTo(ex + 16, ey - 5);
    g.lineTo(ex + 14, ey + 3);
    g.closePath();
    g.fill();
    // trench cracks glowing at the front edge
    g.fillStyle = 'rgba(20,241,149,0.18)';
    g.fillRect(0, VIEW_H - 6, VIEW_W, 6);
    g.fillStyle = '#14f195';
    for (let wx = 20; wx < STAGE_W; wx += 97) {
      const sx = Math.round(proj(wx, k1));
      g.fillRect(sx, VIEW_H - 3, 14, 1);
      g.fillRect(sx + 14, VIEW_H - 4, 9, 1);
      g.fillRect(sx + 23, VIEW_H - 3, 6, 1);
    }
  }
}
