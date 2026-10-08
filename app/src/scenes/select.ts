import { art } from '../art';
import { audio } from '../audio';
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';
import { buildLadder, game, type Mode, type Scene, type Session } from '../game';
import { input, type MenuAction } from '../input';
import { SpriteCanvas, drawPreview } from '../render/sprite';
import { FIGHTER_IDS, ROSTER, type FighterId } from '../sim/roster';
import { framed, panel, text, wrap } from '../ui';
import { TitleScene } from './title';
import { VersusScene } from './versus';

const COLS = 4;
const CARD_W = 46;
const CARD_H = 57;
const GAP = 6;
const GRID_X = (VIEW_W - (COLS * CARD_W + (COLS - 1) * GAP)) / 2;
const GRID_Y = 34;
const P_COLORS = ['#ff3b3b', '#2f8bff'];

export class SelectScene implements Scene {
  private cur: [number, number] = [3, 2];
  private locked: [boolean, boolean] = [false, false];
  private t = 0;
  private doneAt = -1;
  private sprites = [new SpriteCanvas(), new SpriteCanvas()];

  constructor(private mode: Mode, preset?: { p1: FighterId; p2: FighterId }) {
    if (preset) this.cur = [FIGHTER_IDS.indexOf(preset.p1), FIGHTER_IDS.indexOf(preset.p2)];
  }

  private get needsP2Pick() {
    return this.mode !== 'arcade';
  }

  update() {
    this.t++;
    game.arena.update(this.t);
    audio.playTrack('menu');
    if (this.doneAt >= 0) {
      if (this.t - this.doneAt > 40) this.finish();
      input.endFrame();
      return;
    }
    if (this.mode === 'versus') {
      this.handle(0, input.menu(0));
      this.handle(1, input.menu(1));
    } else {
      const active = this.locked[0] ? 1 : 0;
      this.handle(active, input.menu());
    }
    const allLocked = this.locked[0] && (!this.needsP2Pick || this.locked[1]);
    if (allLocked) this.doneAt = this.t;
    input.endFrame();
  }

  private handle(p: 0 | 1, a: Set<MenuAction>) {
    if (a.has('back') || a.has('pause')) {
      audio.play('menuBack');
      if (this.locked[p]) this.locked[p] = false;
      else if (p === 1 && this.mode !== 'versus') this.locked[0] = false;
      else game.go(new TitleScene(true));
      return;
    }
    if (this.locked[p]) return;
    let c = this.cur[p];
    const col = c % COLS;
    const row = Math.floor(c / COLS);
    if (a.has('left')) c = row * COLS + ((col + COLS - 1) % COLS);
    if (a.has('right')) c = row * COLS + ((col + 1) % COLS);
    if (a.has('up') || a.has('down')) c = ((row + 1) % 2) * COLS + col;
    if (a.has('random')) c = Math.floor(Math.random() * FIGHTER_IDS.length);
    if (c !== this.cur[p]) {
      this.cur[p] = c;
      audio.play('menuMove');
    }
    if (a.has('confirm')) {
      this.locked[p] = true;
      audio.play('select');
      audio.announce(ROSTER[FIGHTER_IDS[c]].name.toLowerCase());
    }
  }

  private finish() {
    const p1 = FIGHTER_IDS[this.cur[0]];
    let session: Session;
    if (this.mode === 'arcade') {
      const ladder = buildLadder(p1, FIGHTER_IDS, ROSTER[p1].rival);
      session = { mode: 'arcade', p1, p2: ladder[0], ladder, ladderTotal: ladder.length, rematches: 0 };
    } else {
      session = { mode: this.mode, p1, p2: FIGHTER_IDS[this.cur[1]], rematches: 0 };
    }
    game.go(new VersusScene(session));
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    game.arena.draw(w, (STAGE_W - VIEW_W) / 2, this.t);
    w.fillStyle = 'rgba(5,3,13,0.55)';
    w.fillRect(0, 0, VIEW_W, VIEW_H);

    const showP2 = this.needsP2Pick && (this.mode === 'versus' || this.locked[0]);
    const ids: FighterId[] = [FIGHTER_IDS[this.cur[0]], FIGHTER_IDS[this.cur[1]]];
    for (const p of [0, 1] as const) {
      if (p === 1 && !showP2) continue;
      const x = p === 0 ? VIEW_W / 2 - 52 : VIEW_W / 2 + 52;
      w.fillStyle = 'rgba(0,0,0,0.5)';
      w.beginPath();
      w.ellipse(x, GROUND_Y + 14, 22, 4, 0, 0, Math.PI * 2);
      w.fill();
      drawPreview(w, this.sprites[p], ids[p], this.locked[p] ? 'win' : 'idle', this.t, x, GROUND_Y + 14, p === 0 ? 1 : -1, 1, this.locked[p] ? ROSTER[ids[p]].color : undefined);
    }

    const title = this.mode === 'arcade' ? 'ARCADE' : this.mode === 'training' ? 'TRAINING' : this.mode === 'versus' ? 'VERSUS' : 'VS CPU';
    text(ui, 'SELECT YOUR LEGEND', VIEW_W / 2, 14, 12, '#ffd23a', { outline: '#7a1a00', shadow: '#05030d' });
    text(ui, title, VIEW_W / 2, 26, 6, '#9fe8ff', { outline: '#05030d' });

    FIGHTER_IDS.forEach((id, i) => {
      const x = GRID_X + (i % COLS) * (CARD_W + GAP);
      const y = GRID_Y + Math.floor(i / COLS) * (CARD_H + GAP);
      framed(ui, art.cards[id], x, y, CARD_W, CARD_H, '#2a2357');
    });
    for (const p of [0, 1] as const) {
      if (p === 1 && !showP2) continue;
      const i = this.cur[p];
      const x = GRID_X + (i % COLS) * (CARD_W + GAP);
      const y = GRID_Y + Math.floor(i / COLS) * (CARD_H + GAP);
      const blink = this.locked[p] || this.t % 20 < 14;
      ui.strokeStyle = blink ? P_COLORS[p] : '#ffffff';
      ui.lineWidth = 2;
      const inset = p === 1 && this.cur[0] === this.cur[1] ? 3 : 0;
      ui.strokeRect(x - 2 + inset, y - 2 + inset, CARD_W + 4 - inset * 2, CARD_H + 4 - inset * 2);
      const label = p === 0 ? '1P' : this.mode === 'versus' ? '2P' : 'CPU';
      ui.fillStyle = P_COLORS[p];
      ui.fillRect(p === 0 ? x - 2 : x + CARD_W - 20, y - 9, 22, 8);
      text(ui, label, p === 0 ? x + 9 : x + CARD_W - 9, y - 5, 6, '#ffffff');
      if (this.locked[p]) {
        ui.fillStyle = 'rgba(5,3,13,0.55)';
        ui.fillRect(x, y + CARD_H - 12, CARD_W, 12);
        text(ui, 'READY', x + CARD_W / 2, y + CARD_H - 6, 6, '#14f195');
      }
    }

    this.drawInfo(ui, 0, ids[0]);
    if (showP2) this.drawInfo(ui, 1, ids[1]);
    else if (this.mode === 'arcade') {
      panel(ui, VIEW_W - 140, 32, 132, 120, '#ffd23a');
      text(ui, 'ARCADE', VIEW_W - 74, 50, 12, '#ffd23a', { outline: '#05030d' });
      text(ui, '3 FIGHTS', VIEW_W - 74, 72, 8, '#ffffff', { outline: '#05030d' });
      text(ui, 'YOUR RIVAL', VIEW_W - 74, 86, 8, '#ffd23a', { outline: '#05030d' });
      text(ui, 'SEMI-FINAL', VIEW_W - 74, 100, 8, '#ffffff', { outline: '#05030d' });
      text(ui, 'FINAL BOSS', VIEW_W - 74, 116, 8, '#ff2d55', { outline: '#05030d' });
    }

    const hint = this.mode === 'versus' ? 'P1: WASD + J    P2: ARROWS + NUM1 / ,' : 'MOVE + CONFIRM    R: RANDOM    ESC: BACK';
    text(ui, hint, VIEW_W / 2, VIEW_H - 6, 6, '#8a7cc4', { outline: '#05030d' });
  }

  private drawInfo(ui: CanvasRenderingContext2D, p: 0 | 1, id: FighterId) {
    const d = ROSTER[id];
    const x = p === 0 ? 6 : VIEW_W - 140;
    const cx = x + 67;
    panel(ui, x, 32, 134, 244, P_COLORS[p]);
    framed(ui, art.cards[id], x + 27, 38, 80, 100, d.color);
    text(ui, d.name, cx, 149, 12, d.color, { outline: '#05030d' });
    text(ui, d.archetype, cx, 161, 6, '#ffd23a', { outline: '#05030d' });
    wrap(d.description, 6, 124).slice(0, 4).forEach((line, i) => text(ui, line, cx, 172 + i * 8, 6, '#d9ccff', { outline: '#05030d' }));
    text(ui, `U  ${d.special}`, cx, 207, 6, '#14f195', { outline: '#05030d' });
    text(ui, `U+K  ${d.superName}`, cx, 216, 6, '#ffd23a', { outline: '#05030d' });
    const stats: [string, number][] = [
      ['POWER', d.rating.power], ['SPEED', d.rating.speed], ['DEFENSE', d.rating.defense],
      ['RANGE', d.rating.range], ['DIFFICULTY', d.rating.difficulty],
    ];
    stats.forEach(([k, v], i) => {
      const y = 228 + i * 9;
      text(ui, k, x + 8, y, 6, k === 'DIFFICULTY' ? '#ff8aa0' : '#9fe8ff', { align: 'left', outline: '#05030d' });
      for (let s = 0; s < 5; s++) {
        ui.fillStyle = s < v ? (k === 'DIFFICULTY' ? '#ff2d55' : d.color) : '#2a2357';
        ui.fillRect(x + 70 + s * 12, y - 3, 10, 6);
      }
    });
  }
}
