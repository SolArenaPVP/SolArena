import { METER_MAX } from './config';
import { emptyButtons, type Button, type PadInput } from './input';
import type { Fighter, Match } from './sim/match';
import type { FighterId } from './sim/roster';

export type Difficulty = 'paper' | 'trencher' | 'chad' | 'marketMaker';
export const DIFFICULTIES: Difficulty[] = ['paper', 'trencher', 'chad', 'marketMaker'];
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  paper: 'PAPER HANDS',
  trencher: 'TRENCHER',
  chad: 'CHAD',
  marketMaker: 'MARKET MAKER',
};

/**
 * Difficulty is behavior only (PRD-closed-beta § 20): reaction time, how often
 * the CPU blocks/punishes/combos, how well it spaces, and whether it adapts.
 * No level ever gets extra health or damage.
 */
interface Level {
  react: number;
  blockP: number;
  antiAirP: number;
  punishP: number;
  comboP: number;
  think: [number, number];
  aggression: number;
  /** Chance per decision of a pointless wiggle or jump. */
  random: number;
  /** Reads the player's habits (jumps, lows, throws, turtling). */
  adapt: boolean;
  techP: number;
  /** How strictly it holds its fighter's ideal range, 0-1. */
  spacing: number;
  counterP: number;
}

const LEVELS: Record<Difficulty, Level> = {
  paper: { react: 24, blockP: 0.15, antiAirP: 0.1, punishP: 0.1, comboP: 0.2, think: [24, 44], aggression: 0.35, random: 0.25, adapt: false, techP: 0, spacing: 0.3, counterP: 0.1 },
  trencher: { react: 14, blockP: 0.5, antiAirP: 0.4, punishP: 0.45, comboP: 0.55, think: [14, 28], aggression: 0.5, random: 0.06, adapt: false, techP: 0.15, spacing: 0.6, counterP: 0.3 },
  chad: { react: 9, blockP: 0.78, antiAirP: 0.7, punishP: 0.8, comboP: 0.85, think: [9, 18], aggression: 0.58, random: 0.01, adapt: true, techP: 0.45, spacing: 0.85, counterP: 0.55 },
  marketMaker: { react: 6, blockP: 0.9, antiAirP: 0.85, punishP: 0.92, comboP: 0.95, think: [6, 12], aggression: 0.6, random: 0, adapt: true, techP: 0.7, spacing: 1, counterP: 0.75 },
};

/** Fighter-specific game plans (PRD-closed-beta § 21). */
interface Persona {
  /** Distance band the CPU tries to fight from. */
  ideal: [number, number];
  aggression: number;
  special: [number, number];
  specialBias: number;
  jumpRate: number;
  /** Uses the special to punish whiffs (DECU's Lightning Step). */
  whiffSpecial?: boolean;
  /** Fishes for counters instead of throwing the special in neutral (BUDDHA). */
  counter?: boolean;
  /** Backs off when the opponent gets close (ORANGIE). */
  keepAway?: boolean;
}

const PERSONAS: Record<FighterId, Persona> = {
  daumen: { ideal: [24, 70], aggression: 1.35, special: [30, 150], specialBias: 1.4, jumpRate: 0.6 },
  chairman: { ideal: [100, 170], aggression: 0.8, special: [90, 400], specialBias: 1.2, jumpRate: 0.3 },
  cate: { ideal: [20, 60], aggression: 1.45, special: [60, 180], specialBias: 1.3, jumpRate: 1 },
  doge: { ideal: [35, 85], aggression: 1, special: [0, 75], specialBias: 1, jumpRate: 0.5 },
  pepe: { ideal: [60, 140], aggression: 1, special: [80, 200], specialBias: 1, jumpRate: 0.9 },
  orangie: { ideal: [130, 220], aggression: 0.8, special: [90, 360], specialBias: 1.3, jumpRate: 0.3, keepAway: true },
  buddha: { ideal: [55, 110], aggression: 0.55, special: [0, 0], specialBias: 0, jumpRate: 0.2, counter: true },
  decu: { ideal: [70, 140], aggression: 1.1, special: [50, 170], specialBias: 0.9, jumpRate: 0.7, whiffSpecial: true },
};

type Plan = 'approach' | 'retreat' | 'wait' | 'crouch' | 'poke' | 'heavy' | 'sweep' | 'special' | 'super' | 'jumpIn' | 'dash' | 'backdash' | 'throw' | 'guard' | 'wiggle';

/** Decaying counts of what the opponent keeps doing. */
interface Habits {
  jumps: number;
  lows: number;
  throws: number;
  turtle: number;
}

export class Bot {
  private plan: Plan = 'wait';
  private planUntil = 0;
  private threatStart = -1;
  private willBlock = false;
  private antiAirDecided = -1;
  private antiAir = false;
  private pressQueue: { at: number; buttons: Button[]; hold?: Button[] }[] = [];
  private seed: number;
  private habits: Habits = { jumps: 0, lows: 0, throws: 0, turtle: 0 };
  private lastOppState = '';
  private lastOppSlot = '';

  constructor(public level: Difficulty, seed = 99) {
    this.seed = seed;
  }

  get currentPlan() {
    return this.plan;
  }

  private rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private watch(opp: Fighter) {
    const h = this.habits;
    for (const k of Object.keys(h) as (keyof Habits)[]) h[k] *= 0.997;
    if (opp.state === 'prejump' && this.lastOppState !== 'prejump') h.jumps++;
    const slot = opp.state === 'attack' ? opp.move?.slot ?? '' : '';
    if (slot && slot !== this.lastOppSlot) {
      if (slot === 'clight' || slot === 'cheavy') h.lows++;
      if (slot === 'throw') h.throws++;
    }
    if (opp.state === 'block' || opp.state === 'blockstun') h.turtle += 0.05;
    this.lastOppState = opp.state;
    this.lastOppSlot = slot;
  }

  think(m: Match, me: Fighter): PadInput {
    const L = LEVELS[this.level];
    const P = PERSONAS[me.def.id];
    const opp = m.other(me);
    const t = m.frame;
    const held = emptyButtons();
    const pressed = emptyButtons();
    const fwd: Button = me.facing === 1 ? 'right' : 'left';
    const back: Button = me.facing === 1 ? 'left' : 'right';
    const dist = Math.abs(opp.x - me.x);
    const press = (...bs: Button[]) => {
      for (const b of bs) {
        pressed[b] = true;
        held[b] = true;
      }
    };
    const out = () => ({ held, pressed });
    if (L.adapt) this.watch(opp);
    const h = this.habits;

    const queued = this.pressQueue.filter((q) => q.at <= t);
    this.pressQueue = this.pressQueue.filter((q) => q.at > t);
    for (const q of queued) {
      press(...q.buttons);
      for (const b of q.hold ?? []) held[b] = true;
    }

    const canAct = ['idle', 'walk', 'crouch', 'block', 'blockstun'].includes(me.state);

    // ---- throw tech -------------------------------------------------------
    if (canAct && opp.state === 'attack' && opp.move?.slot === 'throw' && opp.mf <= 3 && dist < 60) {
      if (this.rand() < L.techP * (1 + Math.min(1, h.throws * 0.2)) * 0.5) {
        held.block = true;
        press('light');
        return out();
      }
    }

    // ---- defense --------------------------------------------------------
    const oppStartup = opp.state === 'attack' && opp.move && opp.mf <= opp.move.startup + opp.move.active && opp.move.slot !== 'throw';
    const reach = opp.move?.box ? opp.move.box.x + opp.move.box.w + 30 : 160;
    const incoming = m.projectiles.find((p) => p.owner === opp.side && p.hitsLeft > 0 && (
      p.vx === 0 ? Math.abs(p.x - me.x) < p.w / 2 + 30 && p.age + 14 >= p.delay : Math.abs(p.x - me.x) < 110 && Math.sign(me.x - p.x) === Math.sign(p.vx)));
    const threat = (oppStartup && dist < reach) || !!incoming;
    if (threat) {
      if (this.threatStart < 0) {
        this.threatStart = t;
        this.willBlock = this.rand() < L.blockP;
      }
    } else this.threatStart = -1;

    if (canAct && threat && t - this.threatStart >= L.react) {
      const low = (opp.move?.hit?.height === 'low' && oppStartup) || incoming?.hit.height === 'low';
      const high = opp.y > 0 || incoming?.hit.height === 'high';
      if (P.counter && me.cooldown === 0 && oppStartup && !low && this.rand() < L.counterP) {
        press('special');
        return out();
      }
      if (this.willBlock) {
        held.block = true;
        held.down = !!low && !high;
        return out();
      }
    }

    // ---- anti-air -------------------------------------------------------
    if (opp.y > 0 && opp.state !== 'launched') {
      if (this.antiAirDecided < 0) {
        this.antiAirDecided = t;
        this.antiAir = this.rand() < Math.min(0.97, L.antiAirP * (1 + Math.min(1, h.jumps * 0.15)));
      }
      if (this.antiAir && canAct && dist < 85 && opp.vy < 1 && t - this.antiAirDecided >= L.react * 0.6) {
        press('heavy');
        this.antiAir = false;
        return out();
      }
    } else this.antiAirDecided = -1;

    // ---- keep combos going -----------------------------------------------
    if (me.state === 'attack' && me.moveConnected && me.move) {
      if (this.rand() < L.comboP * 0.25) {
        const slot = me.move.slot;
        if (me.meter >= METER_MAX && this.rand() < 0.5 && slot !== 'super') press('special', 'heavy');
        else if (slot === 'light' || slot === 'clight') press(me.chain < 1 && this.rand() < 0.5 ? 'light' : 'heavy');
        else if ((slot === 'heavy' || slot === 'cheavy') && me.cooldown === 0 && !P.counter) press('special');
      }
      return out();
    }

    // ---- punish whiffs ---------------------------------------------------------
    // Projectile specials have no melee hitbox: their recovery is only a whiff if we're close enough to punish it.
    const oppRecovering = opp.state === 'attack' && opp.move && opp.mf > opp.move.startup + opp.move.active && !opp.moveConnected && (!!opp.move.box || dist < 90);
    const myReach = (me.moves.heavy.box?.x ?? 0) + (me.moves.heavy.box?.w ?? 40);
    if (canAct && (oppRecovering || opp.state === 'land') && this.rand() < L.punishP * 0.3) {
      if (P.whiffSpecial && me.cooldown === 0 && dist < 140) {
        press('special');
        return out();
      }
      if (dist < myReach + 10) {
        press('heavy');
        if (this.rand() < L.comboP && me.cooldown === 0 && !P.counter) this.queue(t + 10, ['special']);
        return out();
      }
    }

    if (!canAct) return out();

    // ---- neutral game ---------------------------------------------------------
    if (t >= this.planUntil) this.choosePlan(t, me, opp, dist, L, P);
    const lightReach = (me.moves.light.box?.x ?? 0) + (me.moves.light.box?.w ?? 30);

    switch (this.plan) {
      case 'approach':
        held[fwd] = true;
        if (dist < Math.max(lightReach + 4, P.ideal[0])) this.planUntil = t;
        break;
      case 'retreat':
        held[back] = true;
        if (dist > P.ideal[1]) this.planUntil = t;
        break;
      case 'crouch':
        held.down = true;
        break;
      case 'guard':
        held.block = true;
        held.down = this.rand() < (L.adapt ? Math.min(0.8, 0.3 + h.lows * 0.1) : 0.4);
        break;
      case 'wait':
        break;
      case 'wiggle':
        held[this.rand() < 0.5 ? fwd : back] = true;
        if (this.rand() < 0.05) held.up = true;
        break;
      case 'poke':
        if (dist < lightReach + 6) {
          press('light');
          if (this.rand() < L.comboP) this.queue(t + 8, ['light']);
          if (this.rand() < L.comboP * 0.8) this.queue(t + 17, ['heavy']);
          this.planUntil = t + 22;
          this.plan = 'wait';
        } else held[fwd] = true;
        break;
      case 'heavy':
        if (dist < myReach) {
          press('heavy');
          this.planUntil = t + 24;
          this.plan = 'wait';
        } else held[fwd] = true;
        break;
      case 'sweep':
        if (dist < myReach + 6) {
          held.down = true;
          press('heavy');
          this.planUntil = t + 30;
          this.plan = 'wait';
        } else held[fwd] = true;
        break;
      case 'special':
        if (me.cooldown === 0) press('special');
        this.planUntil = t + 30;
        this.plan = 'wait';
        break;
      case 'super':
        press('special', 'heavy');
        this.planUntil = t + 40;
        this.plan = 'wait';
        break;
      case 'jumpIn':
        held.up = true;
        held[fwd] = true;
        this.queue(t + 16, [this.rand() < 0.6 ? 'heavy' : 'light']);
        this.planUntil = t + 4;
        this.plan = 'wait';
        break;
      case 'dash':
        press('dash');
        held[fwd] = true;
        this.planUntil = t + 14;
        this.plan = 'wait';
        break;
      case 'backdash':
        press('dash');
        held[back] = true;
        this.planUntil = t + 16;
        this.plan = 'wait';
        break;
      case 'throw':
        if (dist < 44) {
          held.block = true;
          press('light');
          this.planUntil = t + 24;
          this.plan = 'wait';
        } else held[fwd] = true;
        break;
    }
    return out();
  }

  private queue(at: number, buttons: Button[], hold?: Button[]) {
    this.pressQueue.push({ at, buttons, hold });
  }

  private choosePlan(t: number, me: Fighter, opp: Fighter, dist: number, L: Level, P: Persona) {
    const [smin, smax] = P.special;
    const specialOk = !P.counter && me.cooldown === 0 && dist >= smin && dist <= smax;
    const superOk = me.meter >= METER_MAX && (me.def.id === 'buddha' ? dist < 400 : dist <= Math.max(smax, 120) && dist >= Math.max(0, smin - 30));
    const a = L.aggression * P.aggression;
    const close = dist < 60;
    const mid = dist >= 60 && dist < 150;
    // How far outside the fighter's ideal band we are, scaled by how disciplined this level is.
    const tooFar = dist > P.ideal[1] ? L.spacing : 0;
    const tooClose = dist < P.ideal[0] ? L.spacing : 0;
    const turtling = L.adapt ? Math.min(2, this.habits.turtle * 0.1) : 0;
    const weights: [Plan, number][] = [
      ['approach', (dist > 70 ? 3 * a + 0.5 : 0.2) + tooFar * 3],
      ['retreat', (close ? 0.6 : dist < 200 ? 0.35 : 0.05) + tooClose * (P.keepAway ? 3 : 0.6)],
      ['backdash', P.keepAway && close ? 1.2 * L.spacing : 0],
      ['wait', P.counter ? 1.4 : 0.6],
      ['crouch', 0.25],
      ['guard', close ? 0.8 * (1 - a * 0.6) + (P.counter ? 0.8 : 0) : 0.15],
      ['poke', close ? 3 * a : mid ? 1 * a : 0],
      ['heavy', close ? 1.4 * a : mid ? 0.5 + (me.def.heavyReach ? 1.2 : 0) : 0],
      ['sweep', close ? 0.9 * a : 0.15],
      ['special', specialOk ? 2.2 * P.specialBias : 0],
      ['super', superOk ? 2.5 : 0],
      ['jumpIn', dist > 80 && dist < 170 ? 0.7 * a * P.jumpRate : 0.1 * P.jumpRate],
      ['dash', dist > 130 ? 0.9 * a + tooFar : 0],
      ['throw', close && (opp.state === 'block' || opp.state === 'idle') ? 1.2 + turtling : 0],
      ['wiggle', L.random * 6],
    ];
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let r = this.rand() * total;
    for (const [plan, w] of weights) {
      r -= w;
      if (r <= 0) {
        this.plan = plan;
        break;
      }
    }
    const [lo, hi] = L.think;
    this.planUntil = t + lo + Math.floor(this.rand() * (hi - lo));
  }
}

// ---------------------------------------------------------------------------
// Training dummy (PRD-closed-beta § 10)
// ---------------------------------------------------------------------------

export type DummyBlock = 'never' | 'always' | 'afterFirst' | 'random';
export type DummyAction = 'stand' | 'crouch' | 'jump' | 'attack' | 'counter' | 'cpu';
export const DUMMY_BLOCKS: DummyBlock[] = ['never', 'always', 'afterFirst', 'random'];
export const DUMMY_ACTIONS: DummyAction[] = ['stand', 'crouch', 'jump', 'attack', 'counter', 'cpu'];
export const DUMMY_LABELS: Record<DummyBlock | DummyAction, string> = {
  never: 'NEVER', always: 'ALWAYS', afterFirst: 'AFTER FIRST HIT', random: 'RANDOM',
  stand: 'STAND', crouch: 'CROUCH', jump: 'JUMP', attack: 'ATTACK', counter: 'COUNTERATTACK', cpu: 'CPU',
};

export class Dummy {
  block: DummyBlock = 'never';
  action: DummyAction = 'stand';
  private guardUntil = 0;
  private randomFor = '';
  private randomBlock = false;
  private wasStunned = false;
  private bot = new Bot('chad', 4242);
  private rng = 77;

  private rand() {
    this.rng = (this.rng * 16807) % 2147483647;
    return this.rng / 2147483647;
  }

  think(m: Match, me: Fighter): PadInput {
    if (this.action === 'cpu') return this.bot.think(m, me);
    const held = emptyButtons();
    const pressed = emptyButtons();
    const opp = m.other(me);
    const t = m.frame;
    const stunned = me.state === 'hitstun' || me.state === 'launched' || me.state === 'knockdown' || me.state === 'blockstun' || me.state === 'wakeup';
    const actionable = ['idle', 'walk', 'crouch', 'block'].includes(me.state);

    // Reversal: the first actionable frame after being hit or blocking.
    if (this.action === 'counter' && this.wasStunned && actionable) {
      pressed.heavy = held.heavy = true;
    }
    if (me.state === 'hitstun' || me.state === 'launched') this.guardUntil = t + 90;
    this.wasStunned = stunned;

    const attacking = opp.state === 'attack' || m.projectiles.some((p) => p.owner === opp.side);
    let guard = false;
    if (this.block === 'always') guard = true;
    if (this.block === 'afterFirst') guard = t < this.guardUntil;
    if (this.block === 'random' && attacking) {
      const key = `${opp.move?.slot}:${opp.tick - opp.mf}`;
      if (key !== this.randomFor) {
        this.randomFor = key;
        this.randomBlock = this.rand() < 0.5;
      }
      guard = this.randomBlock;
    }
    if (guard) {
      held.block = true;
      const low = (opp.state === 'attack' && opp.move?.hit?.height === 'low') || m.projectiles.some((p) => p.owner === opp.side && p.hit.height === 'low');
      held.down = low || this.action === 'crouch';
    }
    if (this.action === 'crouch') held.down = true;
    if (this.action === 'jump' && actionable && t % 50 === 0) held.up = true;
    if (this.action === 'attack' && actionable && Math.abs(opp.x - me.x) < 70 && t % 36 === 0) {
      pressed.light = held.light = true;
      held.block = false;
    }
    return { held, pressed };
  }
}
