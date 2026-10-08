import { art } from '../art';
import { audio } from '../audio';
import { beta } from '../beta';
import { FONT, GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';
import { game, type Scene, type Session } from '../game';
import { input } from '../input';
import { SpriteCanvas, drawPreview } from '../render/sprite';
import { formatTime, type MatchReport } from '../report';
import { ROSTER, type FighterId } from '../sim/roster';
import { framed, panel, text, wrap } from '../ui';
import { FightScene } from './fight';
import { SelectScene } from './select';
import { TitleScene } from './title';
import { VersusScene } from './versus';

/** Seconds of match end kept in a KO replay. */
const KO_REPLAY_SECONDS = 7;

export class ResultsScene implements Scene {
  private t = 0;
  private cursor = 0;
  private sprite = new SpriteCanvas();
  private saved = false;

  constructor(private session: Session, private r: MatchReport) {
    audio.playTrack('menu');
  }

  private get playerWon() {
    return this.r.winnerSide === 0;
  }

  private get items(): string[] {
    const replay = this.r.replay ? ['VIEW REPLAY', 'WATCH KO'] : [];
    if (this.session.mode === 'arcade') {
      const last = (this.session.ladder?.length ?? 1) <= 1;
      return [this.playerWon ? (last ? 'CLAIM THE ARENA' : 'NEXT FIGHT') : 'RETRY', 'SAVE SHARE CARD', ...replay, 'MAIN MENU'];
    }
    return ['REMATCH', 'CHARACTER SELECT', 'SAVE SHARE CARD', ...replay, 'MAIN MENU'];
  }

  update() {
    this.t++;
    game.arena.update(this.t);
    const a = input.menu();
    const items = this.items;
    if (a.has('up')) {
      this.cursor = (this.cursor + items.length - 1) % items.length;
      audio.play('menuMove');
    }
    if (a.has('down')) {
      this.cursor = (this.cursor + 1) % items.length;
      audio.play('menuMove');
    }
    if (a.has('confirm') && this.t > 30) {
      audio.play('menuConfirm');
      this.choose(items[this.cursor]);
    }
    input.endFrame();
  }

  private choose(item: string) {
    const s = this.session;
    const replay = this.r.replay;
    switch (item) {
      case 'REMATCH':
        beta.track('rematch', { mode: s.mode });
        game.go(new FightScene({ ...s, rematches: s.rematches + 1 }));
        break;
      case 'RETRY':
        beta.track('rematch', { mode: s.mode });
        game.go(new VersusScene({ ...s, rematches: s.rematches + 1 }));
        break;
      case 'NEXT FIGHT': {
        const ladder = s.ladder!.slice(1);
        game.go(new VersusScene({ ...s, ladder, p2: ladder[0], rematches: 0 }));
        break;
      }
      case 'CLAIM THE ARENA':
        game.go(new ChampionScene(s.p1));
        break;
      case 'CHARACTER SELECT':
        beta.track('char_select_return', { mode: s.mode });
        game.go(new SelectScene(s.mode, { p1: s.p1, p2: s.p2 }));
        break;
      case 'SAVE SHARE CARD':
        beta.track('share_card', { winner: this.r.winner, loser: this.r.loser });
        saveShareCard(this.r);
        this.saved = true;
        break;
      case 'VIEW REPLAY':
        beta.track('replay_view', { from: 'results' });
        if (replay) game.go(new FightScene(s, { replay, report: this.r }));
        break;
      case 'WATCH KO':
        beta.track('replay_view', { from: 'ko' });
        if (replay) game.go(new FightScene(s, { replay, report: this.r, from: Math.max(0, replay.ticks - KO_REPLAY_SECONDS * 60 - 150) }));
        break;
      case 'MAIN MENU':
        game.go(new TitleScene(true));
        break;
    }
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    const r = this.r;
    const wd = ROSTER[r.winner];
    const ld = ROSTER[r.loser];
    game.arena.draw(w, (STAGE_W - VIEW_W) / 2, this.t, 120);
    w.fillStyle = 'rgba(5,3,13,0.6)';
    w.fillRect(0, 0, VIEW_W, VIEW_H);
    w.fillStyle = 'rgba(5,3,13,0.6)';
    w.beginPath();
    w.ellipse(170, GROUND_Y + 22, 34, 6, 0, 0, Math.PI * 2);
    w.fill();
    drawPreview(w, this.sprite, r.winner, 'win', this.t, 170, GROUND_Y + 22, 1, 1.2);

    text(ui, `${wd.name} DESTROYED ${ld.name}`, VIEW_W / 2, 13, 12, '#ffd23a', { outline: '#7a1a00', shadow: '#05030d' });
    // headline award, the rest as chips
    const pop = this.t < 10 ? 1.6 - this.t * 0.06 : 1;
    ui.save();
    ui.translate(VIEW_W / 2, 34);
    ui.scale(pop, pop);
    text(ui, r.award.title, 0, 0, 16, '#14f195', { outline: '#05030d', shadow: '#05030d' });
    ui.restore();
    text(ui, r.award.detail, VIEW_W / 2, 49, 6, '#d9ccff', { outline: '#05030d' });
    const chips = r.awards.slice(1, 4).filter((a) => a.title !== 'STILL HOLDING');
    const chipW = 86;
    chips.forEach((a, i) => {
      const cx = VIEW_W / 2 + (i - (chips.length - 1) / 2) * (chipW + 6);
      ui.fillStyle = 'rgba(20,241,149,0.15)';
      ui.fillRect(cx - chipW / 2, 56, chipW, 10);
      text(ui, a.title, cx, 61, 6, '#14f195');
    });

    framed(ui, art.cards[r.winner], 16, 72, 80, 100, wd.color);
    wrap(`"${r.quote}"`, 6, 104).slice(0, 4).forEach((line, i) => text(ui, line, 56, 182 + i * 9, 6, '#ffffff', { outline: '#05030d' }));

    // stat table, both players side by side
    const x = 254;
    panel(ui, x, 72, 246, 124, wd.color);
    const names = [ROSTER[r.winnerSide === 0 ? r.winner : r.loser], ROSTER[r.winnerSide === 1 ? r.winner : r.loser]];
    text(ui, `SCORE ${r.score[0]}-${r.score[1]}`, x + 10, 82, 8, '#ffffff', { align: 'left', outline: '#05030d' });
    text(ui, `TIME ${formatTime(r.duration)}`, x + 236, 82, 8, '#ffffff', { align: 'right', outline: '#05030d' });
    text(ui, 'FINISHER', x + 10, 95, 6, '#9fe8ff', { align: 'left', outline: '#05030d' });
    text(ui, r.finisher, x + 236, 95, 8, '#ffd23a', { align: 'right', outline: '#05030d' });
    text(ui, 'P1', x + 168, 108, 6, names[0].color, { outline: '#05030d' });
    text(ui, 'P2', x + 214, 108, 6, names[1].color, { outline: '#05030d' });
    const rows: [string, keyof MatchReport['stats'][0]][] = [
      ['DAMAGE', 'damage'],
      ['MAX COMBO', 'maxCombo'],
      ['SPECIALS LANDED', 'specialsLanded'],
      ['SUPERS LANDED', 'supersLanded'],
      ['COUNTERS', 'counters'],
      ['THROWS', 'throws'],
      ['BLOCKS', 'blocks'],
    ];
    rows.forEach(([label, key], i) => {
      const y = 119 + i * 10;
      text(ui, label, x + 10, y, 6, '#9fe8ff', { align: 'left', outline: '#05030d' });
      for (const k of [0, 1] as const) {
        const mine = r.stats[k][key];
        const theirs = r.stats[k === 0 ? 1 : 0][key];
        text(ui, String(mine), x + (k === 0 ? 168 : 214), y, 6, mine > theirs && key !== 'blocks' ? '#ffd23a' : '#ffffff', { outline: '#05030d' });
      }
    });
    if (this.session.rematches > 0) text(ui, `REMATCH #${this.session.rematches}`, x + 123, 190, 6, '#14f195', { outline: '#05030d' });

    const items = this.items;
    const rowH = 12;
    const my = 202;
    panel(ui, x, my, 246, 10 + items.length * rowH, '#9945ff');
    items.forEach((item, i) => {
      const sel = i === this.cursor;
      const y = my + 11 + i * rowH;
      if (sel) {
        ui.fillStyle = 'rgba(153,69,255,0.35)';
        ui.fillRect(x + 4, y - 6, 238, 12);
      }
      const label = item === 'SAVE SHARE CARD' && this.saved ? 'SAVED! SAVE AGAIN' : item;
      text(ui, label, x + 123, y, 8, sel ? '#ffd23a' : '#d9ccff', { outline: '#05030d' });
    });
  }
}

function saveShareCard(r: MatchReport) {
  const a = document.createElement('a');
  a.download = `solarena-${r.winner}-vs-${r.loser}.png`;
  a.href = renderShareCard(r).toDataURL('image/png');
  a.click();
}

/** 1200x630 results card, sized for X / Telegram / Discord previews (PRD-closed-beta § 17). */
export function renderShareCard(r: MatchReport) {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const bg = document.createElement('canvas');
  bg.width = VIEW_W;
  bg.height = VIEW_H;
  game.arena.draw(bg.getContext('2d')!, (STAGE_W - VIEW_W) / 2, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(bg, 0, -22, W, (W / VIEW_W) * VIEW_H);
  const shade = g.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(5,3,13,0.55)');
  shade.addColorStop(0.45, 'rgba(5,3,13,0.85)');
  shade.addColorStop(1, 'rgba(5,3,13,0.94)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const wd = ROSTER[r.winner];
  const ld = ROSTER[r.loser];
  g.imageSmoothingEnabled = true;
  g.fillStyle = wd.color;
  g.fillRect(52, 72, 376, 470);
  g.drawImage(art.cards[r.winner], 58, 78, 364, 458);
  g.save();
  g.globalCompositeOperation = 'screen';
  const lw = 520;
  g.drawImage(art.logo, 560, 20, lw, (art.logo.height / art.logo.width) * lw);
  g.restore();

  const t = (str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') => {
    g.font = `${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = '#05030d';
    g.fillText(str, x + 4, y + 4);
    g.fillStyle = color;
    g.fillText(str, x, y);
  };
  const head = (id: FighterId, x: number, y: number, size: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x - 4, y - 4, size + 8, size + 8);
    g.drawImage(art.heads[id], x, y, size, size);
  };

  head(r.winner, 470, 150, 96, wd.color);
  head(r.loser, 1050, 150, 96, ld.color);
  t(`${r.score[0]} - ${r.score[1]}`, 808, 198, 48, '#ffffff', 'center');
  t(wd.name, 470, 290, 40, wd.color);
  t('DESTROYED', 470, 340, 22, '#ffffff');
  t(ld.name, 470, 388, 40, ld.color);
  const stats: [string, string][] = [
    ['FINISHER', r.finisher],
    ['MAX COMBO', `${r.stats[r.winnerSide].maxCombo}`],
    ['DAMAGE', `${r.stats[r.winnerSide].damage}`],
    ['MATCH TIME', formatTime(r.duration)],
    ['ARENA', 'THE TRENCHES'],
  ];
  stats.forEach(([k, v], i) => {
    t(k, 470, 440 + i * 30, 16, '#9fe8ff');
    t(v, 1150, 440 + i * 30, 16, '#ffffff', 'right');
  });
  g.fillStyle = 'rgba(20,241,149,0.16)';
  g.fillRect(52, 556, 376, 56);
  g.strokeStyle = '#14f195';
  g.lineWidth = 3;
  g.strokeRect(52, 556, 376, 56);
  t(r.award.title, 240, 576, 24, '#14f195', 'center');
  g.font = `10px ${FONT}`;
  g.textAlign = 'center';
  g.fillStyle = '#d9ccff';
  g.fillText(r.award.detail, 240, 600);
  t('8 LEGENDS · 1 ARENA · INFINITE ALPHA', 1150, 604, 12, '#8a7cc4', 'right');
  return c;
}

export class ChampionScene implements Scene {
  private t = 0;
  private sprite = new SpriteCanvas();

  constructor(private id: FighterId) {
    audio.announce(`${ROSTER[id].name.toLowerCase()}. champion of the trenches`);
  }

  update() {
    this.t++;
    game.arena.update(this.t);
    const a = input.menu();
    if (this.t > 60 && (a.has('confirm') || a.has('back') || a.has('pause'))) game.go(new TitleScene(true));
    input.endFrame();
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    const d = ROSTER[this.id];
    game.arena.draw(w, (STAGE_W - VIEW_W) / 2 + Math.sin(this.t * 0.01) * 100, this.t, 240);
    w.fillStyle = 'rgba(5,3,13,0.45)';
    w.fillRect(0, 0, VIEW_W, VIEW_H);
    drawPreview(w, this.sprite, this.id, 'win', this.t, VIEW_W / 2, GROUND_Y + 20, 1, 2, this.t % 20 < 10 ? d.color : '#ffd23a');
    text(ui, 'CHAMPION', VIEW_W / 2, 30, 24, '#ffd23a', { outline: '#7a1a00', shadow: '#05030d', thick: 2 });
    text(ui, 'OF THE TRENCHES', VIEW_W / 2, 56, 12, '#ffffff', { outline: '#9945ff', shadow: '#05030d' });
    text(ui, d.name, VIEW_W / 2, 78, 16, d.color, { outline: '#ffffff', shadow: '#05030d' });
    text(ui, `"${d.winQuotes[0]}"`, VIEW_W / 2, 96, 8, '#d9ccff', { outline: '#05030d' });
    if (this.t > 60 && this.t % 60 < 40) text(ui, 'PRESS START', VIEW_W / 2, VIEW_H - 12, 8, '#14f195', { outline: '#05030d' });
  }
}
