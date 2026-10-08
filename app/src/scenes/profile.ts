import { art } from '../art';
import { audio } from '../audio';
import { beta } from '../beta';
import { STAGE_W, VIEW_H, VIEW_W } from '../config';
import { game, type Scene } from '../game';
import { input } from '../input';
import { promptText } from '../overlay';
import { formatTime } from '../report';
import { loadReplays } from '../replay';
import { ROSTER } from '../sim/roster';
import { framed, panel, text } from '../ui';
import { FightScene } from './fight';
import { TitleScene } from './title';

const ACTIONS = ['EDIT NAME', 'EXPORT BETA DATA', 'BACK'];

/** Local profile, recent matches (watchable when the replay is still stored) and this browser's beta metrics. */
export class ProfileScene implements Scene {
  private t = 0;
  /** Cursor runs over the action buttons, then the history rows. */
  private cursor = 0;

  update() {
    this.t++;
    game.arena.update(this.t);
    const a = input.menu();
    const history = beta.history().slice(0, 8);
    const count = ACTIONS.length + history.length;
    if (a.has('up')) {
      this.cursor = (this.cursor + count - 1) % count;
      audio.play('menuMove');
    }
    if (a.has('down')) {
      this.cursor = (this.cursor + 1) % count;
      audio.play('menuMove');
    }
    if (a.has('back') || a.has('pause')) {
      audio.play('menuBack');
      game.go(new TitleScene(true));
    } else if (a.has('confirm')) {
      audio.play('menuConfirm');
      if (this.cursor < ACTIONS.length) this.act(ACTIONS[this.cursor]);
      else this.watch(this.cursor - ACTIONS.length);
    }
    input.endFrame();
  }

  private act(action: string) {
    if (action === 'EDIT NAME') promptText('PLAYER NAME', beta.profile().username, 14, (v) => beta.setUsername(v));
    if (action === 'EXPORT BETA DATA') beta.exportData();
    if (action === 'BACK') game.go(new TitleScene(true));
  }

  private watch(i: number) {
    const entry = beta.history()[i];
    const replay = entry && loadReplays().find((r) => r.id === entry.replayId);
    if (!replay) {
      audio.play('menuBack');
      return;
    }
    beta.track('replay_view', { from: 'history' });
    game.go(new FightScene({ mode: replay.mode, p1: replay.p1, p2: replay.p2, rematches: 0 }, { replay, exitTo: () => new ProfileScene() }));
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    game.arena.draw(w, (STAGE_W - VIEW_W) / 2, this.t);
    w.fillStyle = 'rgba(5,3,13,0.7)';
    w.fillRect(0, 0, VIEW_W, VIEW_H);
    const p = beta.profile();
    const m = beta.metrics();
    const history = beta.history().slice(0, 8);
    const stored = new Set(loadReplays().map((r) => r.id));

    text(ui, 'PROFILE', VIEW_W / 2, 14, 12, '#ffd23a', { outline: '#7a1a00', shadow: '#05030d' });

    // player card
    panel(ui, 8, 28, 160, 150, '#9945ff');
    if (p.favorite) framed(ui, art.heads[p.favorite], 16, 38, 40, 40, ROSTER[p.favorite].color);
    text(ui, p.username, 64, 46, 8, '#ffffff', { align: 'left', outline: '#05030d' });
    text(ui, p.favorite ? `MAIN: ${ROSTER[p.favorite].name}` : 'NO MAIN YET', 64, 60, 6, p.favorite ? ROSTER[p.favorite].color : '#8a7cc4', { align: 'left', outline: '#05030d' });
    const wr = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
    const rows: [string, string][] = [
      ['MATCHES', String(p.matches)],
      ['W / L', `${p.wins} / ${p.losses}`],
      ['WIN RATE', `${wr}%`],
      ['STREAK', `${p.streak} (BEST ${p.bestStreak})`],
      ['TOTAL DAMAGE', String(p.damage)],
      ['BEST COMBO', `${p.bestCombo} HITS`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 92 + i * 12;
      text(ui, k, 16, y, 6, '#9fe8ff', { align: 'left', outline: '#05030d' });
      text(ui, v, 160, y, 6, '#ffffff', { align: 'right', outline: '#05030d' });
    });

    // actions
    ACTIONS.forEach((label, i) => {
      const sel = this.cursor === i;
      const y = 196 + i * 14;
      if (sel) {
        ui.fillStyle = 'rgba(153,69,255,0.35)';
        ui.fillRect(8, y - 7, 160, 14);
      }
      text(ui, label, 88, y, 8, sel ? '#ffd23a' : '#d9ccff', { outline: '#05030d' });
    });
    text(ui, beta.remoteFeedback ? 'DATA: SENT TO BETA SERVER' : 'DATA: THIS DEVICE ONLY', 88, 246, 6, '#8a7cc4', { outline: '#05030d' });

    // match history
    panel(ui, 176, 28, 328, 132, '#14f195');
    text(ui, 'RECENT MATCHES', 186, 38, 8, '#14f195', { align: 'left', outline: '#05030d' });
    if (!history.length) text(ui, 'PLAY A MATCH TO START YOUR HISTORY', 340, 90, 6, '#8a7cc4', { outline: '#05030d' });
    history.forEach((h, i) => {
      const y = 52 + i * 13;
      const sel = this.cursor === ACTIONS.length + i;
      if (sel) {
        ui.fillStyle = 'rgba(20,241,149,0.2)';
        ui.fillRect(180, y - 6, 320, 12);
      }
      const color = h.result === 'W' ? '#14f195' : '#ff2d55';
      text(ui, h.result, 188, y, 8, color, { align: 'left', outline: '#05030d' });
      text(ui, `${ROSTER[h.p1].name} VS ${ROSTER[h.p2].name}`, 202, y, 6, '#ffffff', { align: 'left', outline: '#05030d' });
      text(ui, `${h.score[0]}-${h.score[1]} ${formatTime(h.duration)} ${h.award}`, 410, y, 6, '#d9ccff', { align: 'right', outline: '#05030d' });
      if (h.replayId && stored.has(h.replayId)) text(ui, sel ? 'WATCH' : 'REPLAY', 496, y, 6, sel ? '#ffd23a' : '#9fe8ff', { align: 'right', outline: '#05030d' });
    });

    // beta metrics
    panel(ui, 176, 166, 328, 112, '#ffd23a');
    text(ui, `BETA METRICS: ${m.matches} MATCHES`, 186, 176, 6, '#ffd23a', { align: 'left', outline: '#05030d' });
    text(ui, 'FIGHTER PICK% / WIN%', 496, 176, 6, '#9fe8ff', { align: 'right', outline: '#05030d' });
    const headline: [string, number][] = [['REMATCH', m.rematchRate], ['COMPLETED', m.completionRate], ['SHARED', m.shareRate]];
    headline.forEach(([k, v], i) => {
      text(ui, `${v}%`, 220 + i * 100, 194, 12, '#ffffff', { outline: '#05030d' });
      text(ui, k, 220 + i * 100, 208, 6, '#9fe8ff', { outline: '#05030d' });
    });
    m.winRate.forEach((r, i) => {
      const x = 186 + (i % 4) * 80;
      const y = 226 + Math.floor(i / 4) * 24;
      const d = ROSTER[r.id];
      text(ui, d.name, x, y, 6, d.color, { align: 'left', outline: '#05030d' });
      const pick = m.pickRate.find((q) => q.id === r.id)!.pct;
      text(ui, r.n ? `${pick}% / ${r.pct}%` : '-', x, y + 9, 6, '#d9ccff', { align: 'left', outline: '#05030d' });
    });
  }
}
