import { Bot, DIFFICULTIES, DUMMY_ACTIONS, DUMMY_BLOCKS, DUMMY_LABELS, Dummy, type Difficulty } from '../ai';
import { audio } from '../audio';
import { beta } from '../beta';
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';
import { arcadeStage, game, type Scene, type Session } from '../game';
import { input } from '../input';
import { openFeedback } from '../overlay';
import { Fx, drawProjectile } from '../render/fx';
import { Hud } from '../render/hud';
import { SpriteCanvas, drawStaged, fighterFx, fighterLook } from '../render/sprite';
import { INTRO_FRAMES } from '../sim/flair';
import { frameRow, moveName, type FrameRow } from '../sim/framedata';
import { Match, type Fighter, type SimEvent } from '../sim/match';
import type { MoveSlot } from '../sim/moves';
import { buildReport, type MatchReport } from '../report';
import { ReplayPlayer, ReplayRecorder, checksumOf, saveReplay, type Replay } from '../replay';
import { panel, text, wrap } from '../ui';
import { ResultsScene } from './results';
import { SelectScene } from './select';
import { TitleScene } from './title';

const GROUND_KINDS = new Set(['candle', 'ice', 'splash']);
const ACTIONABLE = new Set(['idle', 'walk', 'crouch', 'block']);

/** Arcade ramps the CPU up from the player's chosen level; the boss is always at least CHAD. */
function arcadeLevel(base: Difficulty, stage: number, boss: boolean): Difficulty {
  const offsets = [-1, -1, 0, 0, 1];
  const i = DIFFICULTIES.indexOf(base) + (boss ? 2 : offsets[Math.min(stage, offsets.length - 1)]);
  const level = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, i))];
  return boss && DIFFICULTIES.indexOf(level) < 2 ? 'chad' : level;
}

export interface FightOptions {
  /** Play this replay back instead of reading controllers. */
  replay?: Replay;
  /** Results to return to when the replay ends. */
  report?: MatchReport;
  /** Fast-forward the replay to this tick first (WATCH KO). */
  from?: number;
  /** Where to go when a replay without results ends (profile history). */
  exitTo?: () => Scene;
}

/** Ticks simulated per rendered frame while rewinding to a KO. */
const REWIND_CHUNK = 500;

interface Measure {
  slot: MoveSlot;
  outcome: 'hit' | 'block';
  attackerReady: number;
  defenderReady: number;
}

export class FightScene implements Scene {
  readonly m: Match;
  private hud: Hud;
  private fx = new Fx();
  private sprites = [new SpriteCanvas(), new SpriteCanvas()];
  private bots: (Bot | null)[];
  private dummy = new Dummy();
  private camX = (STAGE_W - VIEW_W) / 2;
  private shake = 0;
  private flash: { color: string; frames: number } | null = null;
  private hype = 0;
  private t = 0;
  private paused = false;
  private pauseCursor = 0;
  private done = false;

  // training display
  private showHit = false;
  private showHurt = false;
  private showFrames = true;
  private lastRow: FrameRow | null = null;
  private lastSlot: MoveSlot | null = null;
  private measure: Measure | null = null;
  private measured = '';
  private lastCombo = { hits: 0, damage: 0 };
  /** P1 damage total at the last reset, for the training damage counter. */
  private damageBase = 0;
  private fps = 60;
  private lastNow = performance.now();

  private recorder: ReplayRecorder | null = null;
  private player: ReplayPlayer | null = null;
  private desync = false;

  constructor(private session: Session, private opts: FightOptions = {}) {
    const training = session.mode === 'training';
    const stage = arcadeStage(session);
    const r = opts.replay;
    const seed = r?.seed ?? Math.floor(Math.random() * 1e9);
    const boss = r ? r.boss ?? undefined : stage?.boss ? 1 : undefined;
    this.m = new Match({ p1: r?.p1 ?? session.p1, p2: r?.p2 ?? session.p2, training, seed, boss });
    this.hud = new Hud(this.m);
    const cpu = !r && (session.mode === 'cpu' || session.mode === 'arcade');
    const level = stage ? arcadeLevel(game.settings.difficulty, stage.index, stage.boss) : game.settings.difficulty;
    this.bots = [null, cpu ? new Bot(level, Math.floor(Math.random() * 1e6)) : null];
    if (r) this.player = new ReplayPlayer(r);
    else if (!training) {
      this.recorder = new ReplayRecorder({ mode: session.mode, p1: session.p1, p2: session.p2, seed, boss: boss ?? null });
      beta.matchStart(session, level);
    }
    input.soloKeyboard = session.mode !== 'versus';
    audio.playTrack('fight');
  }

  private get rewinding() {
    return !!this.player && (this.opts.from ?? 0) > this.player.tick;
  }

  private get pauseItems() {
    if (this.player) return ['RESUME', 'EXIT REPLAY'];
    const items = ['RESUME'];
    if (this.m.training) {
      const o = this.m.trainingOpts;
      items.push(
        `DUMMY: ${DUMMY_LABELS[this.dummy.action]}`,
        `DUMMY BLOCK: ${DUMMY_LABELS[this.dummy.block]}`,
        `INFINITE HP: ${o.infiniteHp ? 'ON' : 'OFF'}`,
        `INFINITE METER: ${o.infiniteMeter ? 'ON' : 'OFF'}`,
        `HITBOXES: ${this.showHit ? 'ON' : 'OFF'}`,
        `HURTBOXES: ${this.showHurt ? 'ON' : 'OFF'}`,
        `FRAME DATA: ${this.showFrames ? 'ON' : 'OFF'}`,
        'RESET POSITIONS',
      );
    } else items.push('REMATCH');
    items.push('SEND FEEDBACK', 'CHARACTER SELECT', 'MAIN MENU');
    return items;
  }

  update() {
    this.t++;
    const menu = input.menu(0);
    if (this.m.training) this.trainingHotkeys();
    if (import.meta.env.DEV && input.tappedCode('Backquote')) game.debug = !game.debug;
    if (this.paused) {
      this.updatePause(menu);
      input.endFrame();
      return;
    }
    if (menu.has('pause') && this.m.phase !== 'matchEnd') {
      this.paused = true;
      this.pauseCursor = 0;
      audio.play('menuBack');
      input.endFrame();
      return;
    }

    if (this.player) {
      input.poll();
      if (this.rewinding) {
        this.rewind();
        input.endFrame();
        return;
      }
      if (!this.stepReplay(false)) this.leaveReplay();
    } else {
      const inputs = input.poll();
      if (this.m.introPlaying) {
        const humans = this.bots.map((b, i) => !b && !(this.m.training && i === 1));
        const any = inputs.some((inp, i) => humans[i] && Object.values(inp.pressed).some(Boolean));
        if (any || menu.has('confirm')) {
          this.recorder?.markSkip();
          this.m.skipIntro();
        }
      }
      for (const side of [0, 1] as const) {
        const f = this.m.fighters[side];
        const bot = this.bots[side];
        if (bot) inputs[side] = bot.think(this.m, f);
        else if (this.m.training && side === 1) inputs[1] = this.dummy.think(this.m, f);
      }
      this.recorder?.push(inputs);
      this.m.tick(inputs);
    }
    for (const e of this.m.drain()) this.onEvent(e);
    if (this.m.training) this.trackTraining();
    this.fx.update();
    this.hud.update(this.m);
    game.arena.update(this.t);
    this.hype = Math.max(0, this.hype - 1);

    const [a, b] = this.m.fighters;
    const target = Math.max(0, Math.min(STAGE_W - VIEW_W, (a.x + b.x) / 2 - VIEW_W / 2));
    this.camX += (target - this.camX) * 0.16;
    this.shake *= 0.86;
    if (this.flash && --this.flash.frames <= 0) this.flash = null;

    if (this.m.phase === 'matchEnd' && this.m.phaseFrame > 150 && !this.done) {
      this.done = true;
      if (this.player) {
        this.leaveReplay();
        return;
      }
      const replay = this.recorder!.finish(this.m);
      saveReplay(replay);
      const report = buildReport(this.m, replay);
      beta.matchEnd(this.session, report);
      game.go(new ResultsScene(this.session, report));
    }
  }

  /** Feed one recorded tick into the sim. Returns false when the recording runs out. */
  private stepReplay(silent: boolean) {
    const p = this.player!;
    if (p.skipNow) this.m.skipIntro();
    const inputs = p.next();
    if (!inputs) return false;
    this.m.tick(inputs);
    if (silent) this.m.drain();
    if (this.m.phase === 'matchEnd' && this.m.phaseFrame === 1) this.desync = checksumOf(this.m) !== p.replay.checksum;
    return true;
  }

  /** WATCH KO: simulate up to the start tick in chunks, without sound or effects. */
  private rewind() {
    const target = this.opts.from ?? 0;
    for (let i = 0; i < REWIND_CHUNK && this.player!.tick < target; i++) {
      if (!this.stepReplay(true)) break;
    }
    this.hud = new Hud(this.m);
    const [a, b] = this.m.fighters;
    this.camX = Math.max(0, Math.min(STAGE_W - VIEW_W, (a.x + b.x) / 2 - VIEW_W / 2));
  }

  private leaveReplay() {
    this.done = true;
    const report = this.opts.report;
    if (report) game.go(new ResultsScene(this.session, report));
    else game.go(this.opts.exitTo?.() ?? new TitleScene(true));
  }

  /** Leaving through the pause menu before the match ends counts as a quit for the beta metrics. */
  private quit() {
    if (!this.player && !this.m.training && this.m.phase !== 'matchEnd') beta.matchQuit(this.session, this.m.round);
  }

  private sendFeedback() {
    let replayId: string | null = null;
    if (this.recorder) {
      // Snapshot the match so far, so the report points at a replay of the bug.
      const snap = this.recorder.finish(this.m);
      saveReplay(snap);
      replayId = snap.id;
    }
    const [a, b] = this.m.fighters;
    const matchup = `${a.def.name} VS ${b.def.name}`;
    openFeedback(`version, ${matchup}, round ${this.m.round}, browser${replayId ? ', replay of this match' : ''}`, beta.remoteFeedback,
      (d) => beta.feedback({ ...d, matchup, round: this.m.round, replayId }));
  }

  private trainingHotkeys() {
    const k = (code: string) => input.tappedCode(code);
    if (k('F1')) this.showHit = !this.showHit;
    if (k('F2')) this.showHurt = !this.showHurt;
    if (k('F3')) this.showFrames = !this.showFrames;
    if (k('F4')) this.resetTraining();
    if (k('F5')) this.cycleAction();
    if (k('F6')) this.cycleBlock();
  }

  private resetTraining() {
    this.m.resetPositions();
    this.camX = (STAGE_W - VIEW_W) / 2;
    this.damageBase = this.m.fighters[0].stats.damage;
    this.lastCombo = { hits: 0, damage: 0 };
    this.measure = null;
    audio.play('menuConfirm');
  }

  private cycleAction() {
    this.dummy.action = DUMMY_ACTIONS[(DUMMY_ACTIONS.indexOf(this.dummy.action) + 1) % DUMMY_ACTIONS.length];
    audio.play('menuMove');
  }

  private cycleBlock() {
    this.dummy.block = DUMMY_BLOCKS[(DUMMY_BLOCKS.indexOf(this.dummy.block) + 1) % DUMMY_BLOCKS.length];
    audio.play('menuMove');
  }

  /** Frame data for P1's latest move, plus advantage measured from when each side can act again. */
  private trackTraining() {
    const [p1, p2] = this.m.fighters;
    if (p1.state === 'attack' && p1.move && p1.move.slot !== this.lastSlot && p1.move.slot !== 'throwHold') {
      this.lastRow = frameRow(p1, p1.move);
    }
    this.lastSlot = p1.state === 'attack' ? p1.move?.slot ?? null : null;
    if (p1.state === 'attack' && p1.move && p1.moveConnected && !this.measure) {
      this.measure = { slot: p1.move.slot, outcome: p2.state === 'blockstun' ? 'block' : 'hit', attackerReady: -1, defenderReady: -1 };
    }
    const ms = this.measure;
    if (ms) {
      // A cancel or follow-up hit restarts the measurement on the newest move.
      if (p1.state === 'attack' && p1.move && p1.move.slot !== ms.slot && p1.moveConnected) {
        this.measure = { slot: p1.move.slot, outcome: p2.state === 'blockstun' ? 'block' : 'hit', attackerReady: -1, defenderReady: -1 };
      } else {
        if (ms.attackerReady < 0 && ACTIONABLE.has(p1.state)) ms.attackerReady = this.m.frame;
        if (ms.defenderReady < 0 && ACTIONABLE.has(p2.state)) ms.defenderReady = this.m.frame;
        if (p2.state === 'knockdown' || p2.state === 'launched') {
          this.measured = `${moveName(p1, ms.slot)}: KNOCKDOWN`;
          this.measure = null;
        } else if (ms.attackerReady >= 0 && ms.defenderReady >= 0) {
          const adv = ms.defenderReady - ms.attackerReady;
          this.measured = `${moveName(p1, ms.slot)}: ${adv > 0 ? '+' : ''}${adv} ON ${ms.outcome.toUpperCase()}`;
          this.measure = null;
        } else if (this.m.frame - (ms.attackerReady >= 0 ? ms.attackerReady : this.m.frame) > 120) this.measure = null;
      }
    }
    if (p2.comboHits > 0) this.lastCombo = { hits: p2.comboHits, damage: p2.comboDamage };
  }

  private updatePause(a: Set<string>) {
    const items = this.pauseItems;
    if (a.has('up')) {
      this.pauseCursor = (this.pauseCursor + items.length - 1) % items.length;
      audio.play('menuMove');
    }
    if (a.has('down')) {
      this.pauseCursor = (this.pauseCursor + 1) % items.length;
      audio.play('menuMove');
    }
    if (a.has('pause') || a.has('back')) {
      this.paused = false;
      return;
    }
    if (!a.has('confirm')) return;
    audio.play('menuConfirm');
    const item = items[this.pauseCursor];
    const o = this.m.trainingOpts;
    if (item === 'RESUME') this.paused = false;
    else if (item === 'EXIT REPLAY') this.leaveReplay();
    else if (item === 'SEND FEEDBACK') this.sendFeedback();
    else if (item.startsWith('DUMMY BLOCK')) this.cycleBlock();
    else if (item.startsWith('DUMMY')) this.cycleAction();
    else if (item.startsWith('INFINITE HP')) o.infiniteHp = !o.infiniteHp;
    else if (item.startsWith('INFINITE METER')) o.infiniteMeter = !o.infiniteMeter;
    else if (item.startsWith('HITBOXES')) this.showHit = !this.showHit;
    else if (item.startsWith('HURTBOXES')) this.showHurt = !this.showHurt;
    else if (item.startsWith('FRAME DATA')) this.showFrames = !this.showFrames;
    else if (item === 'RESET POSITIONS') {
      this.resetTraining();
      this.paused = false;
    } else if (item === 'REMATCH') {
      this.quit();
      game.go(new FightScene({ ...this.session, rematches: this.session.rematches + 1 }));
    } else if (item === 'CHARACTER SELECT') {
      this.quit();
      game.go(new SelectScene(this.session.mode, { p1: this.session.p1, p2: this.session.p2 }));
    } else if (item === 'MAIN MENU') {
      this.quit();
      game.go(new TitleScene(true));
    }
  }

  private onEvent(e: SimEvent) {
    switch (e.t) {
      case 'sfx':
        audio.play(e.name);
        break;
      case 'spark':
        this.fx.spark(e.x, e.y, e.kind, e.dir);
        if (e.kind !== 'block') this.hype = Math.min(240, this.hype + 40);
        break;
      case 'dust':
        this.fx.dust(e.x, e.big);
        break;
      case 'shake':
        this.shake = Math.max(this.shake, e.amount);
        break;
      case 'flash':
        this.flash = { color: e.color, frames: e.frames };
        break;
      case 'announce':
        this.hud.onEvent(e);
        if (e.voice) audio.announce(e.voice);
        break;
      case 'popup':
        this.fx.popup(e.x, e.y, e.text, e.color);
        break;
      case 'super':
        this.hud.onEvent(e);
        this.flash = { color: this.m.fighters[e.side].def.color, frames: 4 };
        this.hype = 240;
        break;
      case 'combo':
        this.hud.onEvent(e);
        break;
    }
  }

  draw(w: CanvasRenderingContext2D, ui: CanvasRenderingContext2D) {
    const now = performance.now();
    this.fps += (1000 / Math.max(1, now - this.lastNow) - this.fps) * 0.05;
    this.lastNow = now;
    const m = this.m;
    const camX = Math.round(this.camX);
    const sx = Math.round((Math.random() - 0.5) * this.shake);
    const sy = Math.round((Math.random() - 0.5) * this.shake);
    w.save();
    w.translate(sx, sy);
    game.arena.draw(w, camX, this.t, this.hype, m.boss !== null);

    const staged = m.fighters.map((f) => f.presentation());
    for (const f of m.fighters) {
      const pres = staged[f.side];
      if (pres?.hidden) continue;
      const s = Math.max(0.4, 1 - (f.y + (pres?.dy ?? 0)) / 140);
      w.fillStyle = 'rgba(5,3,13,0.55)';
      w.beginPath();
      w.ellipse(Math.round(f.x - camX + f.facing * (pres?.dx ?? 0)), GROUND_Y + 1, 20 * s, 4 * s, 0, 0, Math.PI * 2);
      w.fill();
    }
    for (const p of m.projectiles) if (GROUND_KINDS.has(p.kind) && p.age < p.delay) drawProjectile(w, p, camX, this.t);

    const order = [...m.fighters].sort((a, b) => this.layer(a) - this.layer(b));
    const mirror = m.fighters[0].def.id === m.fighters[1].def.id;
    for (const f of order) {
      const fx = fighterFx(f, this.t);
      if (mirror && f.side === 1) fx.alt = true;
      if (f.boss && !fx.aura) fx.aura = '#ff2d55';
      const sprite = this.sprites[f.side];
      const pres = staged[f.side];
      if (pres) {
        drawStaged(w, sprite, f.def.id, pres, f.tick, f.x - camX, GROUND_Y - f.y, f.facing, 1, fx, fighterLook(f));
      } else {
        sprite.paint(f.def.id, f.pose(), f.facing, fighterLook(f), fx);
        sprite.blit(w, f.x - camX, GROUND_Y - f.y);
      }
    }
    for (const p of m.projectiles) if (!(GROUND_KINDS.has(p.kind) && p.age < p.delay)) drawProjectile(w, p, camX, this.t);
    this.fx.draw(w, camX);
    if (this.showHit || this.showHurt || (import.meta.env.DEV && game.debug)) this.drawBoxes(w, camX);
    w.restore();

    if (this.flash) {
      w.globalAlpha = Math.min(0.7, this.flash.frames / 8);
      w.fillStyle = this.flash.color;
      w.fillRect(0, 0, VIEW_W, VIEW_H);
      w.globalAlpha = 1;
    }

    this.hud.draw(ui, m, this.t);
    if (this.player) this.drawReplayTag(ui);
    if (m.introPlaying) this.drawIntroQuotes(ui);
    if (m.training) this.drawTraining(ui);
    if (import.meta.env.DEV && game.debug) this.drawDebug(ui);
    if (this.paused) this.drawPause(ui);
  }

  private drawReplayTag(ui: CanvasRenderingContext2D) {
    if (this.rewinding) {
      ui.fillStyle = 'rgba(5,3,13,0.85)';
      ui.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = (this.player!.tick / Math.max(1, this.opts.from ?? 1));
      text(ui, 'REWINDING TO THE KO', VIEW_W / 2, VIEW_H / 2 - 10, 12, '#ffd23a', { outline: '#05030d' });
      ui.fillStyle = '#2a2357';
      ui.fillRect(VIEW_W / 2 - 80, VIEW_H / 2 + 6, 160, 6);
      ui.fillStyle = '#14f195';
      ui.fillRect(VIEW_W / 2 - 80, VIEW_H / 2 + 6, 160 * Math.min(1, k), 6);
      return;
    }
    if (this.t % 60 < 40) {
      ui.fillStyle = '#ff2d55';
      ui.beginPath();
      ui.arc(VIEW_W / 2 - 26, 41, 3, 0, Math.PI * 2);
      ui.fill();
    }
    text(ui, this.opts.from ? 'KO REPLAY' : 'REPLAY', VIEW_W / 2 + 4, 41, 8, '#ffffff', { outline: '#05030d' });
    if (this.desync) text(ui, 'REPLAY DESYNC', VIEW_W / 2, 54, 6, '#ff2d55', { outline: '#05030d' });
  }

  /** Each fighter's intro line types out under their health bar. */
  private drawIntroQuotes(ui: CanvasRenderingContext2D) {
    const pf = this.m.phaseFrame;
    for (const f of this.m.fighters) {
      const start = f.side === 0 ? 40 : 90;
      if (pf < start) continue;
      const full = `"${f.def.introQuote}"`;
      const shown = full.slice(0, Math.floor((pf - start) / 1.5));
      const lines = wrap(shown, 8, 170);
      const left = f.side === 0;
      const x = left ? 40 : VIEW_W - 40;
      lines.forEach((line, i) => text(ui, line, x, 52 + i * 11, 8, f.def.color, { align: left ? 'left' : 'right', outline: '#05030d' }));
    }
    if (pf < INTRO_FRAMES && this.t % 60 < 40) text(ui, 'PRESS ANY BUTTON TO SKIP', VIEW_W / 2, VIEW_H - 30, 6, '#9fe8ff', { outline: '#05030d' });
  }

  /** Attackers draw on top so their strike reads over the defender. */
  private layer(f: Fighter) {
    if (f.state === 'attack') return 2;
    if (f.state === 'knockdown' || f.state === 'ko') return 0;
    return 1;
  }

  private drawBoxes(w: CanvasRenderingContext2D, camX: number) {
    const debug = import.meta.env.DEV && game.debug;
    const rect = (b: { x0: number; y0: number; x1: number; y1: number }, color: string) => {
      w.strokeStyle = color;
      w.lineWidth = 1;
      w.strokeRect(Math.round(b.x0 - camX) + 0.5, Math.round(GROUND_Y - b.y1) + 0.5, Math.round(b.x1 - b.x0), Math.round(b.y1 - b.y0));
    };
    for (const f of this.m.fighters) {
      if (this.showHurt || debug) for (const h of f.hurtBoxes()) rect(h, f.isInvuln() ? '#ffffff' : '#14f195');
      const hb = f.activeHitBox();
      if (hb && (this.showHit || debug)) rect(hb, '#ff2d55');
    }
    if (this.showHit || debug) for (const p of this.m.projectiles) rect(this.m.projBox(p), '#ffb02e');
  }

  private drawTraining(ui: CanvasRenderingContext2D) {
    ui.fillStyle = 'rgba(5,3,13,0.7)';
    ui.fillRect(VIEW_W / 2 - 150, 38, 300, 12);
    text(ui, 'F1 HIT  F2 HURT  F3 FRAMES  F4 RESET  F5 DUMMY  F6 BLOCK', VIEW_W / 2, 44, 6, '#9fe8ff');
    const lines = [
      `DUMMY: ${DUMMY_LABELS[this.dummy.action]} / BLOCK ${DUMMY_LABELS[this.dummy.block]}`,
      `COMBO: ${this.lastCombo.hits} HITS  ${this.lastCombo.damage} DMG   TOTAL ${this.m.fighters[0].stats.damage - this.damageBase}`,
    ];
    if (this.showFrames && this.lastRow) {
      const r = this.lastRow;
      lines.push(
        r.name,
        `STARTUP ${r.startup}  ACTIVE ${r.active}  RECOVERY ${r.recovery}`,
        `DAMAGE ${r.damage}  METER ${r.meter}`,
        `ON HIT ${r.onHit}  ON BLOCK ${r.onBlock}`,
      );
      if (this.measured) lines.push(`MEASURED ${this.measured}`);
    }
    const h = 8 + lines.length * 9;
    panel(ui, 8, 56, 214, h, '#14f195', 'rgba(5,3,13,0.78)');
    lines.forEach((l, i) => text(ui, l, 14, 62 + i * 9, 6, i === 2 ? '#ffd23a' : '#ffffff', { align: 'left' }));
  }

  /** Dev-server only (backquote): the PRD § 27 debug readout. */
  private drawDebug(ui: CanvasRenderingContext2D) {
    const m = this.m;
    const lines = [`FPS ${this.fps.toFixed(0)}  FRAME ${m.frame}  PHASE ${m.phase}  HITSTOP ${m.hitstop}`];
    for (const f of m.fighters) {
      const mv = f.move;
      const bot = this.bots[f.side];
      lines.push(
        `${f.side ? 'P2' : 'P1'} ${f.def.name} ${f.state} sf${f.sf}${mv ? ` ${mv.slot} mf${f.mf}/${mv.startup}+${mv.active}+${mv.recovery}` : ''}`,
        `   x${f.x.toFixed(1)} y${f.y.toFixed(1)} vx${f.vx.toFixed(2)} vy${f.vy.toFixed(2)} hp${f.hp} meter${f.meter} scale${Math.max(0.35, 1 - 0.1 * f.comboHits).toFixed(2)}${bot ? ` cpu:${bot.level}/${bot.currentPlan}` : ''}`,
      );
    }
    ui.fillStyle = 'rgba(5,3,13,0.75)';
    ui.fillRect(4, VIEW_H - 8 - lines.length * 8, VIEW_W - 8, lines.length * 8 + 4);
    lines.forEach((l, i) => text(ui, l, 8, VIEW_H - 4 - (lines.length - i) * 8, 6, '#14f195', { align: 'left' }));
  }

  private drawPause(ui: CanvasRenderingContext2D) {
    ui.fillStyle = 'rgba(5,3,13,0.6)';
    ui.fillRect(0, 0, VIEW_W, VIEW_H);
    const items = this.pauseItems;
    const rowH = items.length > 6 ? 15 : 18;
    const h = 40 + items.length * rowH;
    const y0 = (VIEW_H - h) / 2;
    panel(ui, VIEW_W / 2 - 110, y0, 220, h, '#9945ff');
    text(ui, this.m.training ? 'TRAINING' : 'PAUSED', VIEW_W / 2, y0 + 16, 12, '#ffd23a', { outline: '#05030d' });
    items.forEach((item, i) => {
      const sel = i === this.pauseCursor;
      const y = y0 + 38 + i * rowH;
      if (sel) {
        ui.fillStyle = 'rgba(153,69,255,0.35)';
        ui.fillRect(VIEW_W / 2 - 104, y - 7, 208, 14);
      }
      text(ui, item, VIEW_W / 2, y, 8, sel ? '#ffd23a' : '#d9ccff', { outline: '#05030d' });
    });
  }
}
