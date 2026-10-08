import { art } from '../art';
import { METER_MAX, ROUNDS_TO_WIN, VIEW_H, VIEW_W } from '../config';
import type { Match, SimEvent } from '../sim/match';
import { framed, text, wrap } from '../ui';

type AnnounceStyle = Extract<SimEvent, { t: 'announce' }>['style'];

interface Announcement {
  text: string;
  sub?: string;
  style: AnnounceStyle;
  t: number;
  dur: number;
}

const DURATION: Record<AnnounceStyle, number> = { round: 58, fight: 42, ko: 60, line: 92, win: 150, small: 60 };

const BAR_W = 190;
const BAR_H = 11;
const BAR_Y = 12;

export class Hud {
  private trail: [number, number];
  private combos: ({ hits: number; damage: number; t: number } | null)[] = [null, null];
  private announce: Announcement | null = null;
  private superBanner: { side: 0 | 1; name: string; t: number } | null = null;

  constructor(m: Match) {
    this.trail = [m.fighters[0].hp, m.fighters[1].hp];
  }

  onEvent(e: SimEvent) {
    if (e.t === 'announce') this.announce = { text: e.text, sub: e.sub, style: e.style, t: 0, dur: DURATION[e.style] };
    if (e.t === 'combo') this.combos[e.side] = { hits: e.hits, damage: e.damage, t: 0 };
    if (e.t === 'super') this.superBanner = { side: e.side, name: e.name, t: 0 };
  }

  update(m: Match) {
    for (let i = 0; i < 2; i++) {
      const hp = m.fighters[i].hp;
      if (this.trail[i] < hp) this.trail[i] = hp;
      else if (m.hitstop === 0 && m.freeze === 0) this.trail[i] = Math.max(hp, this.trail[i] - m.fighters[i].def.hp * 0.006);
      const c = this.combos[i];
      if (c && ++c.t > 70) this.combos[i] = null;
    }
    if (this.announce && ++this.announce.t > this.announce.dur) this.announce = null;
    if (this.superBanner && ++this.superBanner.t > 46) this.superBanner = null;
  }

  draw(g: CanvasRenderingContext2D, m: Match, frame: number) {
    for (const side of [0, 1] as const) this.drawSide(g, m, side, frame);
    this.drawTimer(g, m, frame);
    for (const side of [0, 1] as const) this.drawCombo(g, side);
    if (this.superBanner) this.drawSuper(g, m);
    if (this.announce) this.drawAnnounce(g, this.announce, frame);
  }

  private drawSide(g: CanvasRenderingContext2D, m: Match, side: 0 | 1, frame: number) {
    const f = m.fighters[side];
    const left = side === 0;
    const x0 = left ? 40 : VIEW_W - 40 - BAR_W;
    framed(g, art.heads[f.def.id], left ? 8 : VIEW_W - 36, 5, 28, 28, f.def.color, !left);

    g.fillStyle = '#05030d';
    g.fillRect(x0 - 2, BAR_Y - 2, BAR_W + 4, BAR_H + 4);
    g.fillStyle = '#231a40';
    g.fillRect(x0, BAR_Y, BAR_W, BAR_H);
    const ratio = Math.max(0, f.hp / f.def.hp);
    const trail = Math.max(0, this.trail[side] / f.def.hp);
    const span = (r: number): [number, number] => (left ? [x0, BAR_W * r] : [x0 + BAR_W * (1 - r), BAR_W * r]);
    let [tx, tw] = span(trail);
    g.fillStyle = '#ff2d55';
    g.fillRect(tx, BAR_Y, tw, BAR_H);
    const danger = ratio < 0.25;
    const grad = g.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
    if (danger && frame % 20 < 10) {
      grad.addColorStop(0, '#ff9aa8');
      grad.addColorStop(1, '#d6123e');
    } else {
      grad.addColorStop(0, '#fff27a');
      grad.addColorStop(0.5, '#ffc23a');
      grad.addColorStop(1, '#ff8a1e');
    }
    [tx, tw] = span(ratio);
    g.fillStyle = grad;
    g.fillRect(tx, BAR_Y, tw, BAR_H);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(tx, BAR_Y + 1, tw, 2);
    g.fillStyle = 'rgba(5,3,13,0.35)';
    for (let k = 1; k < 10; k++) g.fillRect(x0 + (BAR_W * k) / 10, BAR_Y, 1, BAR_H);
    g.strokeStyle = f.def.color;
    g.strokeRect(x0 - 1.5, BAR_Y - 1.5, BAR_W + 3, BAR_H + 3);

    text(g, f.def.name, left ? x0 : x0 + BAR_W, BAR_Y + BAR_H + 9, 8, '#ffffff', { align: left ? 'left' : 'right', outline: '#05030d' });
    for (let k = 0; k < ROUNDS_TO_WIN; k++) {
      const won = m.wins[side] > k;
      const cx = left ? x0 + BAR_W - 6 - k * 13 : x0 + 6 + k * 13;
      const cy = BAR_Y + BAR_H + 9;
      g.fillStyle = '#05030d';
      g.beginPath();
      g.moveTo(cx, cy - 6);
      g.lineTo(cx + 6, cy);
      g.lineTo(cx, cy + 6);
      g.lineTo(cx - 6, cy);
      g.fill();
      g.fillStyle = won ? '#ffd23a' : '#3a2f63';
      g.beginPath();
      g.moveTo(cx, cy - 4);
      g.lineTo(cx + 4, cy);
      g.lineTo(cx, cy + 4);
      g.lineTo(cx - 4, cy);
      g.fill();
    }

    // super meter + special readiness
    const mw = 112;
    const mx = left ? 14 : VIEW_W - 14 - mw;
    const my = VIEW_H - 14;
    const full = f.meter >= METER_MAX;
    g.fillStyle = '#05030d';
    g.fillRect(mx - 2, my - 2, mw + 4, 9);
    g.fillStyle = '#1b1438';
    g.fillRect(mx, my, mw, 5);
    const mr = f.meter / METER_MAX;
    g.fillStyle = full ? (frame % 10 < 5 ? f.def.color : '#ffffff') : '#14f195';
    g.fillRect(left ? mx : mx + mw * (1 - mr), my, mw * mr, 5);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(left ? mx : mx + mw * (1 - mr), my, mw * mr, 1);
    text(g, full ? 'MAX' : 'SUPER', left ? mx : mx + mw, my - 7, 8, full ? '#ffd23a' : '#9fe8ff', { align: left ? 'left' : 'right', outline: '#05030d' });
    const sx = left ? mx + mw + 14 : mx - 14;
    const ready = f.cooldown === 0;
    g.fillStyle = '#05030d';
    g.beginPath();
    g.arc(sx, my + 2, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ready ? f.def.color : '#3a2f63';
    g.beginPath();
    g.moveTo(sx, my + 2);
    const cd = f.moves.special.cooldown ?? 60;
    const fill = ready ? 1 : 1 - f.cooldown / cd;
    g.arc(sx, my + 2, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
    g.fill();
    text(g, 'SP', sx, my + 3, 8, ready ? '#ffffff' : '#8a7cc4', { outline: '#05030d' });
  }

  private drawTimer(g: CanvasRenderingContext2D, m: Match, frame: number) {
    const cx = VIEW_W / 2;
    g.fillStyle = '#05030d';
    g.fillRect(cx - 18, 4, 36, 28);
    g.strokeStyle = '#9945ff';
    g.strokeRect(cx - 17.5, 4.5, 35, 27);
    g.fillStyle = '#14f195';
    g.fillRect(cx - 18, 4, 36, 2);
    if (m.training) {
      text(g, 'TRN', cx, 19, 8, '#9fe8ff');
      return;
    }
    const secs = Math.ceil(m.timer / 60);
    const low = secs <= 10 && m.phase === 'fight';
    text(g, String(secs).padStart(2, '0'), cx, 19, 16, low && frame % 30 < 15 ? '#ff2d55' : '#ffffff', { outline: '#05030d' });
  }

  private drawCombo(g: CanvasRenderingContext2D, side: 0 | 1) {
    const c = this.combos[side];
    if (!c) return;
    const left = side === 0;
    const x = left ? 14 : VIEW_W - 14;
    const pop = c.t < 6 ? 1.4 - c.t * 0.066 : 1;
    g.save();
    g.translate(x, 84);
    g.scale(pop, pop);
    text(g, `${c.hits} HITS`, 0, 0, 16, '#ffd23a', { align: left ? 'left' : 'right', outline: '#7a1a00', shadow: '#05030d' });
    g.restore();
    text(g, `${c.damage} DMG`, x, 102, 8, '#ffffff', { align: left ? 'left' : 'right', outline: '#05030d' });
  }

  private drawSuper(g: CanvasRenderingContext2D, m: Match) {
    const b = this.superBanner!;
    const f = m.fighters[b.side];
    const left = b.side === 0;
    const k = Math.min(1, b.t / 8);
    g.fillStyle = `rgba(5,3,13,${0.45 * k})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const y = 96;
    g.fillStyle = 'rgba(5,3,13,0.9)';
    g.fillRect(0, y, VIEW_W, 84);
    g.fillStyle = f.def.color;
    g.fillRect(0, y, VIEW_W, 2);
    g.fillRect(0, y + 82, VIEW_W, 2);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      const sx = ((b.t * 12 + i * 47) % (VIEW_W + 40)) - 20;
      g.fillRect(left ? sx : VIEW_W - sx, y + 6 + (i * 13) % 72, 30, 2);
    }
    const slide = (1 - k) * 160;
    const cardX = left ? 24 - slide : VIEW_W - 24 - 64 + slide;
    framed(g, art.cards[f.def.id], cardX, y - 14, 64, 80, f.def.color);
    const tx = left ? 104 : VIEW_W - 104;
    text(g, 'SUPER', tx, y + 26, 8, '#9fe8ff', { align: left ? 'left' : 'right', outline: '#05030d' });
    text(g, b.name, tx, y + 48, 16, f.def.color, { align: left ? 'left' : 'right', outline: '#ffffff', shadow: '#05030d' });
  }

  private drawAnnounce(g: CanvasRenderingContext2D, a: Announcement, frame: number) {
    const size = { round: 24, fight: 40, ko: 48, line: 24, win: 24, small: 12 }[a.style];
    const color = {
      round: '#ffffff', fight: '#ffd23a', ko: '#ff2d55', line: '#ffffff', win: '#ffd23a', small: '#ffffff',
    }[a.style];
    const outline = { round: '#9945ff', fight: '#c2410c', ko: '#ffffff', line: '#9945ff', win: '#7a1a00', small: '#05030d' }[a.style];
    const pop = a.t < 8 ? 2 - a.t / 8 : 1;
    const fade = a.t > a.dur - 10 ? (a.dur - a.t) / 10 : 1;
    const y = a.style === 'win' || a.style === 'line' ? 120 : 110;
    g.save();
    g.globalAlpha = Math.max(0, fade);
    if (a.style === 'line') {
      g.fillStyle = 'rgba(5,3,13,0.75)';
      g.fillRect(0, y - 24, VIEW_W, 48);
      g.fillStyle = '#9945ff';
      g.fillRect(0, y - 24, VIEW_W, 2);
      g.fillRect(0, y + 22, VIEW_W, 2);
    }
    g.translate(VIEW_W / 2, y);
    g.scale(pop, pop);
    const shake = a.style === 'ko' && a.t < 20 ? (frame % 2 ? 2 : -2) : 0;
    text(g, a.text, shake, 0, size, color, { outline, shadow: '#05030d', thick: Math.max(2, Math.round(size / 12)) });
    g.restore();
    if (a.sub && a.t > 10) {
      g.save();
      g.globalAlpha = Math.max(0, fade);
      wrap(a.sub, 8, VIEW_W - 60).forEach((line, i) => text(g, line, VIEW_W / 2, y + 26 + i * 12, 8, '#ffffff', { outline: '#05030d' }));
      g.restore();
    }
  }
}
