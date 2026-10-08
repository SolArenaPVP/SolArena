import { art } from '../art';
import { audio } from '../audio';
import { STAGE_W, VIEW_H, VIEW_W } from '../config';
import { arcadeStage, game, type Scene, type Session } from '../game';
import { input } from '../input';
import { ROSTER } from '../sim/roster';
import { framed, text, wrap } from '../ui';
import { FightScene } from './fight';

/** Pre-fight splash: both cards slam in, VS, arena name. */
export class VersusScene implements Scene {
  private t = 0;

  constructor(private session: Session) {
    audio.playTrack(null);
  }

  update() {
    this.t++;
    game.arena.update(this.t);
    if (this.t === 12) audio.play('heavy');
    if (this.t === 30) {
      audio.play('ko');
      const a = ROSTER[this.session.p1].name.toLowerCase();
      const b = ROSTER[this.session.p2].name.toLowerCase();
      audio.announce(`${a}. versus. ${b}`);
    }
    const a = input.menu();
    if (this.t > 150 || (this.t > 40 && a.has('confirm'))) game.go(new FightScene(this.session));
    input.endFrame();
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    game.arena.draw(w, (STAGE_W - VIEW_W) / 2, this.t);
    w.fillStyle = 'rgba(5,3,13,0.7)';
    w.fillRect(0, 0, VIEW_W, VIEW_H);
    const s = this.session;
    const d1 = ROSTER[s.p1];
    const d2 = ROSTER[s.p2];
    const k = Math.min(1, this.t / 12);
    const ease = 1 - (1 - k) * (1 - k);

    ui.save();
    ui.fillStyle = d1.color;
    ui.globalAlpha = 0.35;
    ui.beginPath();
    ui.moveTo(0, 0);
    ui.lineTo(VIEW_W / 2 + 30, 0);
    ui.lineTo(VIEW_W / 2 - 30, VIEW_H);
    ui.lineTo(0, VIEW_H);
    ui.fill();
    ui.fillStyle = d2.color;
    ui.beginPath();
    ui.moveTo(VIEW_W / 2 + 30, 0);
    ui.lineTo(VIEW_W, 0);
    ui.lineTo(VIEW_W, VIEW_H);
    ui.lineTo(VIEW_W / 2 - 30, VIEW_H);
    ui.fill();
    ui.restore();

    const cw = 150;
    const ch = 188;
    framed(ui, art.cards[s.p1], 30 - (1 - ease) * 220, 36, cw, ch, d1.color);
    framed(ui, art.cards[s.p2], VIEW_W - 30 - cw + (1 - ease) * 220, 36, cw, ch, d2.color);
    text(ui, d1.name, 30 + cw / 2, 240, 16, d1.color, { outline: '#ffffff', shadow: '#05030d' });
    text(ui, d2.name, VIEW_W - 30 - cw / 2, 240, 16, d2.color, { outline: '#ffffff', shadow: '#05030d' });
    text(ui, d1.archetype, 30 + cw / 2, 256, 6, '#ffffff', { outline: '#05030d' });
    text(ui, d2.archetype, VIEW_W - 30 - cw / 2, 256, 6, '#ffffff', { outline: '#05030d' });

    if (this.t >= 26) {
      const pop = this.t < 34 ? 2.4 - (this.t - 26) * 0.175 : 1;
      ui.save();
      ui.translate(VIEW_W / 2, 124);
      ui.scale(pop, pop);
      text(ui, 'VS', 0, 0, 40, '#ffd23a', { outline: '#c2410c', shadow: '#05030d', thick: 3 });
      ui.restore();
    }
    const rivals = d1.rival === d2.id || d2.rival === d1.id;
    if (rivals && this.t >= 34) {
      const blink = this.t % 30 < 20;
      text(ui, 'RIVAL MATCH', VIEW_W / 2, 170, 12, blink ? '#ff2d55' : '#ffd23a', { outline: '#05030d', shadow: '#05030d' });
      const line = d1.rival === d2.id ? d1.rivalQuote : d2.rivalQuote;
      wrap(`"${line}"`, 6, 150).forEach((l, i) => text(ui, l, VIEW_W / 2, 186 + i * 9, 6, '#ffffff', { outline: '#05030d' }));
    }
    const stage = arcadeStage(s);
    if (stage) {
      text(ui, `${stage.label}  ${stage.index + 1} / ${stage.total}`, VIEW_W / 2, 20, 8, stage.boss ? '#ff2d55' : '#14f195', { outline: '#05030d' });
      if (stage.boss && this.t >= 34) {
        text(ui, 'FINAL BOSS', VIEW_W / 2, 170, 16, this.t % 20 < 12 ? '#ff2d55' : '#ffffff', { outline: '#05030d', shadow: '#05030d' });
        text(ui, 'BEAR MARKET CONDITIONS', VIEW_W / 2, 188, 6, '#ff8aa0', { outline: '#05030d' });
      }
    }
    text(ui, 'THE TRENCHES', VIEW_W / 2, VIEW_H - 16, 8, '#9fe8ff', { outline: '#05030d' });
  }
}
