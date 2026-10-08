import { DIFFICULTIES, DIFFICULTY_NAMES } from '../ai';
import { art } from '../art';
import { audio } from '../audio';
import { beta } from '../beta';
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';
import { game, type Mode, type Scene } from '../game';
import { input } from '../input';
import { openFeedback } from '../overlay';
import { SpriteCanvas, drawPreview } from '../render/sprite';
import { FIGHTER_IDS } from '../sim/roster';
import { panel, text } from '../ui';
import { ProfileScene } from './profile';
import { SelectScene } from './select';

type Screen = 'press' | 'menu' | 'options' | 'controls';

const MENU: { label: string; mode?: Mode; screen?: Screen; action?: 'profile' | 'feedback'; hint: string }[] = [
  { label: 'ARCADE', mode: 'arcade', hint: '6 FIGHTS: RIVAL, SEMI, FINAL BOSS' },
  { label: 'VS CPU', mode: 'cpu', hint: 'ONE MATCH VS THE CPU' },
  { label: 'VERSUS', mode: 'versus', hint: 'LOCAL 2 PLAYER' },
  { label: 'TRAINING', mode: 'training', hint: 'LAB IT OUT' },
  { label: 'PROFILE', action: 'profile', hint: 'STATS, HISTORY, REPLAYS' },
  { label: 'OPTIONS', screen: 'options', hint: 'CPU LEVEL, AUDIO' },
  { label: 'CONTROLS', screen: 'controls', hint: 'KEYS + MOVES' },
  { label: 'FEEDBACK', action: 'feedback', hint: 'REPORT A BUG OR SEND FEEDBACK' },
];

export class TitleScene implements Scene {
  private screen: Screen;
  private cursor = 0;
  private opt = 0;
  private t = 0;
  private sprites = FIGHTER_IDS.map(() => new SpriteCanvas());

  constructor(skipPress = false) {
    this.screen = skipPress ? 'menu' : 'press';
  }

  update() {
    this.t++;
    game.arena.update(this.t);
    if (this.screen !== 'press') audio.playTrack('menu');
    const a = input.menu();
    switch (this.screen) {
      case 'press':
        if (a.has('confirm') || a.has('pause')) {
          audio.unlock();
          audio.playTrack('menu');
          audio.play('menuConfirm');
          this.screen = 'menu';
        }
        break;
      case 'menu':
        if (a.has('up')) this.move(-1);
        if (a.has('down')) this.move(1);
        if (a.has('back')) {
          audio.play('menuBack');
          this.screen = 'press';
        }
        if (a.has('confirm')) {
          const item = MENU[this.cursor];
          audio.play('menuConfirm');
          if (item.mode) {
            input.soloKeyboard = item.mode !== 'versus';
            game.go(new SelectScene(item.mode));
          } else if (item.action === 'profile') {
            game.go(new ProfileScene());
          } else if (item.action === 'feedback') {
            openFeedback('version, browser', beta.remoteFeedback, (d) => beta.feedback({ ...d, matchup: null, round: null, replayId: null }));
          } else if (item.screen) {
            this.screen = item.screen;
            this.opt = 0;
          }
        }
        break;
      case 'options': {
        if (a.has('up')) this.opt = (this.opt + 4) % 5;
        if (a.has('down')) this.opt = (this.opt + 1) % 5;
        if (a.has('up') || a.has('down')) audio.play('menuMove');
        const s = game.settings;
        const flip = a.has('left') || a.has('right') || a.has('confirm');
        if (flip) {
          if (this.opt === 0) {
            const i = DIFFICULTIES.indexOf(s.difficulty);
            s.difficulty = DIFFICULTIES[(i + (a.has('left') ? DIFFICULTIES.length - 1 : 1)) % DIFFICULTIES.length];
          }
          if (this.opt === 1) s.music = !s.music;
          if (this.opt === 2) s.sfx = !s.sfx;
          if (this.opt === 3) s.voice = !s.voice;
          if (this.opt === 4 && a.has('confirm')) this.screen = 'menu';
          game.saveSettings();
          audio.play('menuMove');
        }
        if (a.has('back')) {
          audio.play('menuBack');
          this.screen = 'menu';
        }
        break;
      }
      case 'controls':
        if (a.has('back') || a.has('confirm')) {
          audio.play('menuBack');
          this.screen = 'menu';
        }
        break;
    }
    input.endFrame();
  }

  private move(d: number) {
    this.cursor = (this.cursor + d + MENU.length) % MENU.length;
    audio.play('menuMove');
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    const camX = (Math.sin(this.t * 0.004) * 0.5 + 0.5) * (STAGE_W - VIEW_W);
    game.arena.draw(w, camX, this.t);
    w.fillStyle = 'rgba(5,3,13,0.35)';
    w.fillRect(0, 0, VIEW_W, VIEW_H);
    FIGHTER_IDS.forEach((id, i) => {
      const x = 38 + i * 62;
      w.fillStyle = 'rgba(5,3,13,0.5)';
      w.beginPath();
      w.ellipse(x, GROUND_Y, 20, 4, 0, 0, Math.PI * 2);
      w.fill();
      drawPreview(w, this.sprites[i], id, 'idle', this.t + i * 17, x, GROUND_Y, i < 4 ? 1 : -1);
    });

    // The logo crop has the sheet's dark backdrop; screen-blending it onto the world buffer drops that out.
    w.save();
    w.globalCompositeOperation = 'screen';
    w.imageSmoothingEnabled = true;
    const lw = 340;
    const lh = (art.logo.height / art.logo.width) * lw;
    const bob = Math.round(Math.sin(this.t * 0.05) * 2);
    w.drawImage(art.logo, Math.round((VIEW_W - lw) / 2), 8 + bob, lw, lh);
    w.restore();
    text(ui, '8 LEGENDS  ·  1 ARENA  ·  INFINITE ALPHA', VIEW_W / 2, 74, 8, '#9fe8ff', { outline: '#05030d' });

    if (this.screen === 'press') {
      if (this.t % 60 < 40) text(ui, 'PRESS START', VIEW_W / 2, 118, 16, '#ffd23a', { outline: '#7a1a00', shadow: '#05030d' });
      text(ui, 'ENTER / J / SPACE', VIEW_W / 2, 138, 8, '#ffffff', { outline: '#05030d' });
      text(ui, 'A MEMECOIN TEK GAME', VIEW_W / 2, VIEW_H - 8, 6, '#8a7cc4', { outline: '#05030d' });
      return;
    }
    if (this.screen === 'menu') this.drawMenu(ui);
    if (this.screen === 'options') this.drawOptions(ui);
    if (this.screen === 'controls') this.drawControls(ui);
  }

  private drawMenu(ui: CanvasRenderingContext2D) {
    const x = VIEW_W / 2 - 80;
    panel(ui, x, 84, 160, 12 + MENU.length * 13, '#9945ff');
    MENU.forEach((m, i) => {
      const sel = i === this.cursor;
      const y = 96 + i * 13;
      if (sel) {
        ui.fillStyle = 'rgba(153,69,255,0.35)';
        ui.fillRect(x + 4, y - 6, 152, 12);
        text(ui, '>', x + 14 + (this.t % 30 < 15 ? 0 : 2), y, 8, '#14f195');
      }
      text(ui, m.label, VIEW_W / 2, y, sel ? 12 : 8, sel ? '#ffd23a' : '#d9ccff', { outline: '#05030d' });
    });
    text(ui, MENU[this.cursor].hint, VIEW_W / 2, 210, 8, '#14f195', { outline: '#05030d' });
    text(ui, `CPU: ${DIFFICULTY_NAMES[game.settings.difficulty]}`, VIEW_W - 8, VIEW_H - 8, 6, '#8a7cc4', { align: 'right', outline: '#05030d' });
  }

  private drawOptions(ui: CanvasRenderingContext2D) {
    const s = game.settings;
    const rows = [
      ['CPU LEVEL', DIFFICULTY_NAMES[s.difficulty]],
      ['MUSIC', s.music ? 'ON' : 'OFF'],
      ['SOUND FX', s.sfx ? 'ON' : 'OFF'],
      ['ANNOUNCER', s.voice ? 'ON' : 'OFF'],
      ['BACK', ''],
    ];
    const x = VIEW_W / 2 - 110;
    panel(ui, x, 90, 220, 110, '#14f195');
    rows.forEach(([k, v], i) => {
      const sel = i === this.opt;
      const y = 106 + i * 18;
      if (sel) {
        ui.fillStyle = 'rgba(20,241,149,0.2)';
        ui.fillRect(x + 4, y - 8, 212, 16);
      }
      text(ui, k, x + 14, y, 8, sel ? '#ffd23a' : '#d9ccff', { align: 'left', outline: '#05030d' });
      if (v) text(ui, `< ${v} >`, x + 206, y, 8, '#14f195', { align: 'right', outline: '#05030d' });
    });
  }

  private drawControls(ui: CanvasRenderingContext2D) {
    panel(ui, 16, 84, VIEW_W - 32, 190, '#ffd23a');
    const rows: [string, string, string][] = [
      ['', 'P1', 'P2'],
      ['MOVE', 'W A S D', 'ARROWS'],
      ['JUMP', 'W / SPACE', 'UP'],
      ['LIGHT', 'J', 'NUM1 / ,'],
      ['HEAVY', 'K', 'NUM2 / .'],
      ['BLOCK', 'L', 'NUM3 / /'],
      ['SPECIAL', 'U', 'NUM5 / ;'],
      ['DASH', 'L-SHIFT', 'NUM0 / R-SHIFT'],
    ];
    rows.forEach(([a, b, c], i) => {
      const y = 98 + i * 13;
      const col = i === 0 ? '#ffd23a' : '#ffffff';
      text(ui, a, 30, y, 8, '#9fe8ff', { align: 'left', outline: '#05030d' });
      text(ui, b, 150, y, 8, col, { align: 'left', outline: '#05030d' });
      text(ui, c, 250, y, 8, col, { align: 'left', outline: '#05030d' });
    });
    const tips = [
      'SUPER: SPECIAL + HEAVY WITH FULL METER',
      'THROW: BLOCK + LIGHT UP CLOSE (BEATS BLOCK)',
      'DOWN + ATTACK HITS LOW: CROUCH-BLOCK IT',
      'JUMP ATTACKS HIT HIGH: STAND-BLOCK THEM',
      'CHAIN: LIGHT > LIGHT > HEAVY > SPECIAL',
      'GAMEPAD: X/Y/B ATTACKS, A JUMP, RB BLOCK',
    ];
    tips.forEach((tip, i) => text(ui, tip, 30, 210 + i * 10, 6, i === 0 ? '#14f195' : '#d9ccff', { align: 'left', outline: '#05030d' }));
  }
}
