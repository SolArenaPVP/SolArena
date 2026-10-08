import type { Sfx } from '../audio';
import { MAX_SEPARATION, METER_MAX, ROUND_FRAMES, ROUNDS_TO_WIN, STAGE_W, WALL_MARGIN } from '../config';
import { emptyInput, BUTTONS, type Button, type PadInput } from '../input';
import { POSES, clamp01, easeOut, lerpPose, solve, type Pose } from '../rig';
import { INTRO_FRAMES, idlePose, introPresentation, winPresentation, type Presentation } from './flair';
import { SALT_LABELS, buildMoves, saltHit, stanceOf, type Box, type HitSpec, type MoveDef, type MoveSlot, type SparkKind } from './moves';
import type { MatchSideStats } from '../../../shared/matches';
import { moveName } from './framedata';
import { KO_LINES, ROSTER, type FighterDef, type FighterId } from './roster';

export type FState =
  | 'intro' | 'idle' | 'walk' | 'crouch' | 'prejump' | 'air' | 'land' | 'dash' | 'backdash'
  | 'attack' | 'block' | 'blockstun' | 'hitstun' | 'launched' | 'knockdown' | 'wakeup'
  | 'thrown' | 'ko' | 'win' | 'lose';

export type SimEvent =
  | { t: 'sfx'; name: Sfx }
  | { t: 'spark'; x: number; y: number; kind: SparkKind; dir: number }
  | { t: 'dust'; x: number; big?: boolean }
  | { t: 'shake'; amount: number }
  | { t: 'flash'; color: string; frames: number }
  | { t: 'announce'; text: string; style: 'round' | 'fight' | 'ko' | 'line' | 'win' | 'small'; voice?: string; sub?: string }
  | { t: 'popup'; x: number; y: number; text: string; color: string }
  | { t: 'super'; side: 0 | 1; name: string }
  | { t: 'combo'; side: 0 | 1; hits: number; damage: number };

export type ProjKind = 'yap' | 'candle' | 'salt' | 'splash' | 'ice' | 'beam';

export interface Projectile {
  owner: 0 | 1;
  kind: ProjKind;
  /** Center-bottom of the hitbox. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  w: number;
  h: number;
  facing: 1 | -1;
  age: number;
  life: number;
  /** Frames before the projectile moves or can hit (warning glow, staggered launches). */
  delay: number;
  /** If set, only hits for this many frames after the delay. */
  activeFor?: number;
  hit: HitSpec;
  hitsLeft: number;
  rehit: number;
  cooldown: number;
  clash: boolean;
  ground: boolean;
  variant: number;
  powered: boolean;
  dead: boolean;
  /** Set on first hit, so multi-hit projectiles count once as a landed special. */
  landed?: boolean;
}

export type ProjectileInit = Omit<Projectile, 'age' | 'dead' | 'cooldown' | 'hitsLeft' | 'rehit' | 'gravity' | 'ground'>
  & Partial<Pick<Projectile, 'hitsLeft' | 'rehit' | 'gravity' | 'ground'>>;

const BUFFER = 7;
const ACTIONABLE: FState[] = ['idle', 'walk', 'crouch', 'block'];
const THROWABLE: FState[] = ['idle', 'walk', 'crouch', 'block', 'land', 'dash', 'backdash', 'attack'];

interface WorldBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlap = (a: WorldBox, b: WorldBox) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function bodyBox(def: FighterDef, pose: Pose): Box {
  const j = solve(def.dims, pose);
  const top = Math.max(j.head[1] + def.dims.headR, j.neck[1]);
  const bottom = Math.max(0, Math.min(j.ffoot[1], j.bfoot[1], j.hip[1]));
  const half = Math.max(def.dims.chestW, def.dims.headR * 2) * 0.5 + 1;
  const cx = (j.hip[0] + j.neck[0]) / 2;
  return { x: cx - half, y: bottom, w: half * 2, h: top - bottom };
}

function downBox(def: FighterDef): Box {
  const j = solve(def.dims, POSES.down);
  const xs = [j.head[0], j.ffoot[0], j.bfoot[0], j.hip[0]];
  const x0 = Math.min(...xs) - 4;
  const x1 = Math.max(...xs) + 4;
  return { x: x0, y: 0, w: x1 - x0, h: def.dims.chestW * 0.7 };
}

export class Fighter {
  readonly def: FighterDef;
  readonly side: 0 | 1;
  readonly moves: Record<MoveSlot, MoveDef>;
  readonly stance: Pose;
  readonly hurt: { stand: Box; crouch: Box; air: Box; down: Box };
  readonly pushW: number;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  prevX = 0;
  facing: 1 | -1 = 1;
  hp: number;
  meter = 0;
  state: FState = 'idle';
  sf = 0;
  tick = 0;

  move: MoveDef | null = null;
  mf = 0;
  moveHit: HitSpec | null = null;
  moveHits = 0;
  hitCooldown = 0;
  moveConnected = false;
  chain = 0;
  powered = false;
  usedAirAttack = false;

  stun = 0;
  stunMax = 1;
  lowHit = false;
  juggle = 0;
  comboHits = 0;
  comboDamage = 0;
  dead = false;

  invuln = 0;
  armorLeft = 0;
  cooldown = 0;
  slow = 0;
  flash = 0;
  armorFlash = 0;
  crouching = false;
  grabbed: Fighter | null = null;
  calmFrames = 0;
  boss = false;
  /** Round 1 plays the full character intro; later rounds just ready up. */
  fullIntro = false;

  input: PadInput = emptyInput();
  private pressedAt: Record<Button, number>;
  stats: FighterStats = {
    damage: 0, maxCombo: 0, specials: 0, supers: 0, specialsLanded: 0, supersLanded: 0,
    counters: 0, throws: 0, blocks: 0, attacks: 0, saltHits: 0, perfects: 0, comebacks: 0,
  };
  /** Worst HP deficit vs the opponent this round (ratio), for COMEBACK. */
  roundDeficit = 0;

  constructor(id: FighterId, side: 0 | 1) {
    this.def = ROSTER[id];
    this.side = side;
    this.moves = buildMoves(this.def);
    this.stance = stanceOf(this.def);
    this.hp = this.def.hp;
    this.pushW = Math.max(16, this.def.dims.chestW * 0.8);
    this.hurt = {
      stand: bodyBox(this.def, this.stance),
      crouch: bodyBox(this.def, POSES.crouch),
      air: bodyBox(this.def, POSES.jump),
      down: downBox(this.def),
    };
    this.pressedAt = Object.fromEntries(BUTTONS.map((b) => [b, -999])) as Record<Button, number>;
  }

  get grounded() {
    return this.y <= 0 && this.vy <= 0;
  }

  recordPresses() {
    for (const b of BUTTONS) if (this.input.pressed[b]) this.pressedAt[b] = this.tick;
  }

  private peek(b: Button) {
    return this.tick - this.pressedAt[b] <= BUFFER;
  }

  private consume(b: Button) {
    this.pressedAt[b] = -999;
  }

  private buf(b: Button) {
    if (!this.peek(b)) return false;
    this.consume(b);
    return true;
  }

  setState(s: FState) {
    if (this.state !== s) {
      this.state = s;
      this.sf = 0;
    }
  }

  isInvuln() {
    if (this.invuln > 0) return true;
    if (this.state === 'knockdown' || this.state === 'wakeup' || this.state === 'thrown') return true;
    const iv = this.state === 'attack' ? this.move?.invuln : undefined;
    return !!iv && this.mf >= iv[0] && this.mf <= iv[1];
  }

  passingThrough() {
    const pt = this.state === 'attack' ? this.move?.passThrough : undefined;
    return !!pt && this.mf >= pt[0] && this.mf <= pt[1];
  }

  /** Tint/visibility hint for CHAIRMAN's vanish. */
  vanished() {
    return this.def.id === 'chairman' && this.state === 'attack' && (this.move?.slot === 'special' || this.move?.slot === 'super') && this.isInvuln();
  }

  toIdle() {
    this.move = null;
    this.powered = false;
    this.moveHit = null;
    this.chain = 0;
    this.endCombo();
    this.setState('idle');
  }

  endCombo() {
    this.comboHits = 0;
    this.comboDamage = 0;
    this.juggle = 0;
  }

  startMove(mv: MoveDef, m: Match) {
    const wasCancel = this.state === 'attack';
    this.state = 'attack';
    this.sf = 0;
    this.move = mv;
    this.mf = 0;
    this.moveHits = 0;
    this.hitCooldown = 0;
    this.moveConnected = false;
    this.moveHit = mv.hit ?? null;
    this.armorLeft = mv.armor ? (mv.slot === 'super' ? 3 : 1) : 0;
    if (!wasCancel) this.chain = 0;
    if (mv.air) this.usedAirAttack = true;
    if (mv.slot === 'special') {
      this.cooldown = Math.round((mv.cooldown ?? 60) * (this.boss ? 0.6 : 1));
      this.stats.specials++;
    }
    if (mv.slot !== 'super') this.powered = false;
    if (mv.slot !== 'throwHold' && mv.slot !== 'counterStrike') this.stats.attacks++;
    if (this.grounded && !mv.ballistic && !mv.air) this.vx = 0;
    void m;
  }

  private startSuper(m: Match) {
    this.meter = 0;
    this.startMove(this.moves.super, m);
    this.powered = true;
    this.stats.supers++;
    m.freeze = 44;
    m.emit({ t: 'super', side: this.side, name: this.def.superName });
    m.emit({ t: 'sfx', name: 'super' });
  }

  private wantsSuper() {
    return this.meter >= METER_MAX && this.peek('special') && (this.peek('heavy') || this.input.held.heavy);
  }

  step(m: Match) {
    this.tick++;
    this.prevX = this.x;
    this.sf++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.invuln > 0) this.invuln--;
    if (this.slow > 0) this.slow--;
    if (this.armorFlash > 0) this.armorFlash--;
    if (this.hitCooldown > 0) this.hitCooldown--;

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'crouch':
      case 'block':
        this.groundControl(m);
        break;
      case 'prejump':
        if (this.sf >= 3) {
          const h = this.input.held;
          const fwd = this.facing === 1 ? h.right : h.left;
          const back = this.facing === 1 ? h.left : h.right;
          const dir = fwd ? 1 : back ? -1 : 0;
          this.vy = this.def.jumpV;
          this.vx = dir * this.facing * this.def.airVx * (this.slow > 0 ? 0.7 : 1);
          this.y = 0.01;
          this.usedAirAttack = false;
          this.setState('air');
          m.emit({ t: 'sfx', name: 'jump' });
        }
        break;
      case 'air':
        if (!this.usedAirAttack) {
          if (this.buf('heavy')) this.startMove(this.moves.aheavy, m);
          else if (this.buf('light')) this.startMove(this.moves.alight, m);
        }
        break;
      case 'land':
        this.vx = 0;
        if (this.sf >= this.stun) this.toIdle();
        break;
      case 'dash': {
        const len = 14;
        this.vx = this.facing * this.def.dash * (1 - (this.sf / len) * 0.7);
        if (this.sf >= len) {
          this.vx = 0;
          this.toIdle();
        }
        break;
      }
      case 'backdash': {
        const len = 16;
        this.vx = -this.facing * this.def.dash * 0.85 * (1 - (this.sf / len) * 0.8);
        if (this.sf >= len) {
          this.vx = 0;
          this.toIdle();
        }
        break;
      }
      case 'attack':
        this.runMove(m);
        break;
      case 'blockstun':
        this.vx *= 0.82;
        this.crouching = this.input.held.down;
        if (--this.stun <= 0) {
          if (this.input.held.block) this.setState('block');
          else this.toIdle();
        }
        break;
      case 'hitstun':
        this.vx *= 0.84;
        if (--this.stun <= 0) this.toIdle();
        break;
      case 'knockdown':
        this.vx = 0;
        if (this.sf >= 34) {
          this.setState('wakeup');
          this.invuln = 14;
        }
        break;
      case 'wakeup':
        if (this.sf >= 12) this.toIdle();
        break;
      case 'ko':
        this.vx *= 0.85;
        break;
      case 'win':
      case 'lose':
      case 'intro':
        this.vx = 0;
        break;
      case 'thrown':
        // The thrower got hit or KO'd mid-throw: drop to the floor instead of hanging forever.
        if (m.other(this).grabbed !== this) {
          this.setState('launched');
          this.vy = Math.max(this.vy, 1.5);
          if (this.y <= 0) this.y = 0.5;
        }
        break;
      case 'launched':
        break;
    }

    if (this.state !== 'thrown') {
      if (this.y > 0 || this.vy > 0) {
        this.vy -= this.def.gravity;
        this.y += this.vy;
        this.x += this.vx;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.onLand(m);
        }
      } else {
        this.x += this.vx;
      }
    }
  }

  private groundControl(m: Match) {
    const h = this.input.held;
    const fwd = this.facing === 1 ? h.right : h.left;
    const back = this.facing === 1 ? h.left : h.right;
    const spd = this.slow > 0 ? 0.6 : 1;
    this.crouching = h.down;

    if (this.wantsSuper()) {
      this.consume('special');
      this.consume('heavy');
      this.startSuper(m);
      return;
    }
    // One frame of latency on the special lets U+K land as a super chord.
    if (this.peek('special') && this.tick - this.pressedAt.special >= 1) {
      this.consume('special');
      if (this.cooldown === 0) {
        this.startMove(this.moves.special, m);
        return;
      }
    }
    if (this.peek('light') && h.block) {
      this.consume('light');
      this.startMove(this.moves.throw, m);
      return;
    }
    if (this.buf('heavy')) {
      this.startMove(h.down ? this.moves.cheavy : this.moves.heavy, m);
      return;
    }
    if (this.buf('light')) {
      this.startMove(h.down ? this.moves.clight : this.moves.light, m);
      return;
    }
    if (this.buf('dash')) {
      if (back) {
        this.setState('backdash');
        this.invuln = 8;
      } else this.setState('dash');
      m.emit({ t: 'sfx', name: 'dash' });
      m.emit({ t: 'dust', x: this.x });
      return;
    }
    if (h.up) {
      this.setState('prejump');
      this.vx = 0;
      return;
    }
    if (h.block) {
      this.vx = 0;
      this.setState('block');
      return;
    }
    if (h.down) {
      this.vx = 0;
      this.setState('crouch');
      return;
    }
    if (fwd) {
      this.vx = this.facing * this.def.walk * spd;
      this.setState('walk');
    } else if (back) {
      this.vx = -this.facing * this.def.backWalk * spd;
      this.setState('walk');
    } else {
      this.vx = 0;
      this.setState('idle');
    }
  }

  private runMove(m: Match) {
    const mv = this.move!;
    this.mf++;
    if (this.grounded && !mv.ballistic) this.vx *= 0.75;
    mv.script?.(m, this, this.mf);
    if (this.move !== mv) return;
    if (this.mf === mv.startup + 1 && mv.sfx) m.emit({ t: 'sfx', name: mv.sfx });

    if (this.moveConnected && mv.cancels && this.mf > mv.startup) {
      const c = mv.cancels;
      const down = this.input.held.down;
      if (c.includes('super') && this.wantsSuper()) {
        this.consume('special');
        this.consume('heavy');
        this.startSuper(m);
        return;
      }
      if (c.includes('special') && this.cooldown === 0 && this.peek('special')) {
        this.consume('special');
        this.startMove(this.moves.special, m);
        return;
      }
      if (this.peek('heavy')) {
        const target = down ? 'cheavy' : 'heavy';
        if (c.includes(target)) {
          this.consume('heavy');
          this.chain++;
          this.startMove(this.moves[target], m);
          return;
        }
      }
      if (this.peek('light') && this.chain < 2) {
        const target = down ? 'clight' : 'light';
        if (c.includes(target)) {
          this.consume('light');
          this.chain++;
          this.startMove(this.moves[target], m);
          return;
        }
      }
    }

    const total = mv.startup + mv.active + mv.recovery;
    if (mv.ballistic) {
      if (this.mf > 150) this.toIdle();
    } else if (this.mf >= total) {
      if (mv.air && this.y > 0) {
        this.move = null;
        this.setState('air');
      } else this.toIdle();
    }
  }

  private onLand(m: Match) {
    if (this.state === 'air') {
      this.vx = 0;
      this.stun = 4;
      this.setState('land');
      m.emit({ t: 'sfx', name: 'land' });
      m.emit({ t: 'dust', x: this.x });
    } else if (this.state === 'attack' && (this.move?.air || this.move?.ballistic)) {
      this.vx = 0;
      this.stun = this.move.landRecovery ?? 5;
      this.move = null;
      this.powered = false;
      this.setState('land');
      m.emit({ t: 'dust', x: this.x });
    } else if (this.state === 'launched') {
      this.vx = 0;
      m.emit({ t: 'dust', x: this.x, big: true });
      m.emit({ t: 'sfx', name: 'land' });
      if (this.dead) this.setState('ko');
      else this.setState('knockdown');
      this.endCombo();
    }
  }

  /** Current pose for rendering. Pure function of state, so the renderer never touches sim internals. */
  pose(): Pose {
    const st = this.stance;
    const t = this.tick;
    switch (this.state) {
      case 'idle':
        return idlePose(this.def, st, t);
      case 'walk': {
        const dir = this.vx * this.facing >= 0 ? 1 : -1;
        const cycles = (t * 0.17 * (this.def.walk / 2)) / (Math.PI * 2);
        const ph = dir * ((Math.floor(cycles * 12) % 12) / 12) * Math.PI * 2;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        return {
          ...st, hy: st.hy - 0.03 * Math.abs(c), lean: st.lean + 0.05 * dir,
          ff: [st.ff[0] + 0.13 * s, Math.max(0, 0.11 * c)], bf: [st.bf[0] - 0.13 * s, Math.max(0, -0.11 * c)],
          fh: [st.fh[0] - 0.05 * s, st.fh[1]], bh: [st.bh[0] + 0.05 * s, st.bh[1]],
        };
      }
      case 'crouch':
        return lerpPose(st, POSES.crouch, easeOut(clamp01(this.sf / 4)));
      case 'prejump':
        return lerpPose(st, POSES.prejump, clamp01(this.sf / 2));
      case 'air':
        return lerpPose(POSES.jump, POSES.fall, clamp01((this.def.jumpV - this.vy) / (2 * this.def.jumpV)));
      case 'land':
        return lerpPose(POSES.prejump, st, clamp01(this.sf / Math.max(1, this.stun)));
      case 'dash':
        return POSES.dash;
      case 'backdash':
        return POSES.backdash;
      case 'attack':
        return this.move!.pose(this.mf, this);
      case 'block':
        return this.input.held.down ? POSES.crouchBlock : POSES.block;
      case 'blockstun': {
        const p = this.crouching ? POSES.crouchBlock : POSES.block;
        return { ...p, hx: p.hx - 0.05 * (this.stun / this.stunMax) };
      }
      case 'hitstun':
        return lerpPose(this.lowHit ? POSES.hitLow : POSES.hit, st, easeOut(1 - this.stun / this.stunMax));
      case 'launched':
        return { ...POSES.launched, rot: POSES.launched.rot - Math.min(1.1, this.sf * 0.035) };
      case 'knockdown':
      case 'ko':
        return POSES.down;
      case 'wakeup':
        return this.sf < 6 ? lerpPose(POSES.down, POSES.wakeup, this.sf / 6) : lerpPose(POSES.wakeup, st, (this.sf - 6) / 6);
      case 'thrown':
        return POSES.thrown;
      case 'win':
        return winPresentation(this.def, this.sf).pose;
      case 'lose':
        return lerpPose(st, POSES.hitLow, clamp01(this.sf / 20));
      case 'intro':
        return this.fullIntro ? introPresentation(this.def, st, this.sf).pose : idlePose(this.def, st, t);
    }
  }

  /** Render-only staging (offsets, visibility, effects) for intros and victories. */
  presentation(): Presentation | null {
    if (this.state === 'intro' && this.fullIntro) return introPresentation(this.def, this.stance, this.sf);
    if (this.state === 'win') return winPresentation(this.def, this.sf);
    return null;
  }

  hurtBoxes(): WorldBox[] {
    let b: Box;
    if (this.state === 'knockdown' || this.state === 'ko') b = this.hurt.down;
    else if (this.y > 0 || this.state === 'launched' || this.state === 'prejump') b = this.hurt.air;
    else if (this.crouching && ['crouch', 'block', 'blockstun', 'hitstun'].includes(this.state)) b = this.hurt.crouch;
    else if (this.state === 'attack' && (this.move?.slot === 'clight' || this.move?.slot === 'cheavy')) b = this.hurt.crouch;
    else b = this.hurt.stand;
    const out = [this.toWorld(b)];
    const mv = this.move;
    if (this.state === 'attack' && mv?.box && mv.slot !== 'counterStrike' && !mv.ballistic && this.mf > mv.startup) {
      const shrunk = { x: mv.box.x + 3, y: mv.box.y + 2, w: Math.max(2, mv.box.w - 8), h: Math.max(2, mv.box.h - 4) };
      out.push(this.toWorld(shrunk));
    }
    return out;
  }

  activeHitBox(): WorldBox | null {
    const mv = this.move;
    if (this.state !== 'attack' || !mv?.box || !this.moveHit) return null;
    if (this.mf <= mv.startup || this.mf > mv.startup + mv.active) return null;
    if (this.moveHits >= (mv.hits ?? 1) || this.hitCooldown > 0) return null;
    return this.toWorld(mv.box);
  }

  toWorld(b: Box): WorldBox {
    const x0 = this.facing === 1 ? this.x + b.x : this.x - b.x - b.w;
    return { x0, y0: this.y + b.y, x1: x0 + b.w, y1: this.y + b.y + b.h };
  }

  canBlock(height: HitSpec['height']) {
    if (this.y > 0) return false;
    const blocking = this.state === 'block' || this.state === 'blockstun'
      || ((this.state === 'idle' || this.state === 'walk' || this.state === 'crouch') && this.input.held.block);
    if (!blocking) return false;
    const low = this.input.held.down;
    if (height === 'low') return low;
    if (height === 'high') return !low;
    return true;
  }
}

export type FighterStats = MatchSideStats;

export interface Finisher {
  side: 0 | 1;
  label: string;
  damage: number;
  isSuper: boolean;
}

export type Phase = 'intro' | 'fight' | 'ko' | 'timeup' | 'matchEnd';

export interface MatchOptions {
  p1: FighterId;
  p2: FighterId;
  training?: boolean;
  seed?: number;
  /** Arcade final boss side: sharper special cooldowns, presented as a boss. */
  boss?: 0 | 1;
}

export interface TrainingOptions {
  infiniteHp: boolean;
  infiniteMeter: boolean;
}

export class Match {
  fighters: [Fighter, Fighter];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  readonly training: boolean;
  readonly boss: 0 | 1 | null;
  trainingOpts: TrainingOptions = { infiniteHp: true, infiniteMeter: true };
  frame = 0;
  phase: Phase = 'intro';
  phaseFrame = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timer = ROUND_FRAMES;
  hitstop = 0;
  freeze = 0;
  slowmo = 0;
  roundWinner: 0 | 1 | -1 | null = null;
  matchWinner: 0 | 1 | null = null;
  winQuote = '';
  /** Winner of each finished round (-1 = draw), in order. */
  roundWinners: (0 | 1 | -1)[] = [];
  /** The hit that ended the last round. */
  finisher: Finisher | null = null;
  /** Frames spent in the fight phase across all rounds: the match clock. */
  fightFrames = 0;
  koLine = '';
  perfect = false;
  private seed: number;

  constructor(opts: MatchOptions) {
    this.fighters = [new Fighter(opts.p1, 0), new Fighter(opts.p2, 1)];
    this.training = !!opts.training;
    this.boss = opts.boss ?? null;
    if (this.boss !== null) this.fighters[this.boss].boss = true;
    this.seed = opts.seed ?? 1337;
    this.resetRound();
    if (this.training) {
      this.phase = 'fight';
      for (const f of this.fighters) {
        f.setState('idle');
        f.meter = METER_MAX;
      }
    }
  }

  get introPlaying() {
    return this.phase === 'intro' && this.round === 1 && this.phaseFrame < INTRO_FRAMES;
  }

  /** Any button during a round-1 intro jumps straight to the ROUND 1 call. */
  skipIntro() {
    if (!this.introPlaying) return;
    this.phaseFrame = INTRO_FRAMES;
    for (const f of this.fighters) f.sf = INTRO_FRAMES + 40;
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  other(f: Fighter) {
    return this.fighters[f.side === 0 ? 1 : 0];
  }

  emit(e: SimEvent) {
    this.events.push(e);
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  spawn(init: ProjectileInit) {
    const p: Projectile = { gravity: 0, ground: false, hitsLeft: 1, rehit: 0, ...init, age: 0, cooldown: 0, dead: false };
    this.projectiles.push(p);
    return p;
  }

  private resetRound() {
    const [a, b] = this.fighters;
    a.x = STAGE_W / 2 - 80;
    b.x = STAGE_W / 2 + 80;
    a.facing = 1;
    b.facing = -1;
    for (const f of this.fighters) {
      f.y = 0;
      f.vx = 0;
      f.vy = 0;
      f.hp = f.def.hp;
      f.dead = false;
      f.move = null;
      f.powered = false;
      f.cooldown = 0;
      f.slow = 0;
      f.invuln = 0;
      f.grabbed = null;
      f.endCombo();
      f.setState('intro');
      f.sf = 0;
      f.fullIntro = this.round === 1;
      f.roundDeficit = 0;
    }
    this.projectiles = [];
    this.timer = ROUND_FRAMES;
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.roundWinner = null;
    this.perfect = false;
  }

  tick(inputs: [PadInput, PadInput]) {
    this.frame++;
    if (this.phase === 'fight') this.fightFrames++;
    const live = this.phase === 'fight';
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      f.input = live ? inputs[i] : emptyInput();
      f.recordPresses();
    }
    // Flash ticks in real time so a hit reads as a 2-frame blink, not a white sprite for the whole hitstop.
    for (const f of this.fighters) if (f.flash > 0) f.flash--;
    if (this.freeze > 0) {
      this.freeze--;
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    this.updatePhase();
    if (this.slowmo > 0) {
      this.slowmo--;
      if (this.slowmo % 3 !== 0) return;
    }

    for (const f of this.fighters) f.step(this);
    this.updateProjectiles();
    if (this.phase === 'fight') this.resolveMelee();
    this.separate();
    this.updateFacing();
    if (this.training) this.trainingUpkeep();
    if (this.phase === 'fight') {
      const [a, b] = this.fighters;
      const ra = a.hp / a.def.hp;
      const rb = b.hp / b.def.hp;
      a.roundDeficit = Math.max(a.roundDeficit, rb - ra);
      b.roundDeficit = Math.max(b.roundDeficit, ra - rb);
      this.checkKO();
    }
  }

  // ---- round flow ----------------------------------------------------------

  private updatePhase() {
    this.phaseFrame++;
    const pf = this.phaseFrame;
    const [a, b] = this.fighters;
    switch (this.phase) {
      case 'intro': {
        const lead = this.round === 1 ? INTRO_FRAMES : 0;
        if (pf === lead + 24) {
          const final = this.wins[0] === ROUNDS_TO_WIN - 1 && this.wins[1] === ROUNDS_TO_WIN - 1;
          const text = final ? 'FINAL ROUND' : `ROUND ${this.round}`;
          this.emit({ t: 'announce', text, style: 'round', voice: final ? 'Final round' : `Round ${this.round}` });
        }
        if (pf === lead + 84) this.emit({ t: 'announce', text: 'FIGHT!', style: 'fight', voice: 'Fight!' });
        if (pf === lead + 96) {
          this.phase = 'fight';
          this.phaseFrame = 0;
          for (const f of this.fighters) f.toIdle();
        }
        break;
      }
      case 'fight':
        if (!this.training && --this.timer <= 0) {
          this.timer = 0;
          this.phase = 'timeup';
          this.phaseFrame = 0;
          const ra = a.hp / a.def.hp;
          const rb = b.hp / b.def.hp;
          this.roundWinner = Math.abs(ra - rb) < 0.001 ? -1 : ra > rb ? 0 : 1;
          this.recordRound();
          this.finisher = this.roundWinner >= 0 ? { side: this.roundWinner as 0 | 1, label: 'TIME OUT', damage: 0, isSuper: false } : null;
          this.emit({ t: 'announce', text: 'TIME', style: 'ko', voice: 'Time!' });
        }
        break;
      case 'ko':
        if (pf === 56) this.emit({ t: 'announce', text: this.koLine, style: 'line', voice: this.koLine.toLowerCase() });
        if (pf === 150) this.declareRoundWinner();
        if (pf === 250) this.endRound();
        break;
      case 'timeup':
        if (pf === 90) this.declareRoundWinner();
        if (pf === 200) this.endRound();
        break;
      case 'matchEnd':
        break;
    }
  }

  private recordRound() {
    const w = this.roundWinner;
    this.roundWinners.push(w ?? -1);
    if (w === null || w < 0) return;
    this.wins[w as 0 | 1]++;
    const winner = this.fighters[w as 0 | 1];
    if (winner.roundDeficit >= 0.45) winner.stats.comebacks++;
  }

  private declareRoundWinner() {
    const w = this.roundWinner;
    if (w === null || w < 0) {
      this.emit({ t: 'announce', text: 'DRAW', style: 'win', voice: 'Draw game' });
      return;
    }
    const winner = this.fighters[w as 0 | 1];
    const loser = this.fighters[w === 0 ? 1 : 0];
    if (winner.state !== 'ko' && !winner.dead) {
      winner.move = null;
      winner.setState('win');
    }
    if (!loser.dead) loser.setState('lose');
    if (this.perfect) this.emit({ t: 'announce', text: 'PERFECT', style: 'win', voice: 'Perfect!' });
  }

  private endRound() {
    const w = this.wins.findIndex((n) => n >= ROUNDS_TO_WIN);
    if (w >= 0) {
      this.matchWinner = w as 0 | 1;
      this.phase = 'matchEnd';
      this.phaseFrame = 0;
      const winner = this.fighters[w].def;
      const loser = this.fighters[w === 0 ? 1 : 0].def;
      this.winQuote = loser.id === winner.rival ? winner.rivalQuote : winner.winQuotes[Math.floor(this.rand() * 3)];
      this.emit({ t: 'announce', text: `${winner.name} WINS`, style: 'win', voice: `${winner.name.toLowerCase()} wins`, sub: `"${this.winQuote}"` });
      return;
    }
    this.round++;
    this.resetRound();
  }

  private checkKO() {
    const [a, b] = this.fighters;
    if (a.hp > 0 && b.hp > 0) return;
    this.phase = 'ko';
    this.phaseFrame = 0;
    this.slowmo = 54;
    this.roundWinner = a.hp <= 0 && b.hp <= 0 ? -1 : a.hp <= 0 ? 1 : 0;
    if (this.roundWinner >= 0) {
      const w = this.fighters[this.roundWinner as 0 | 1];
      this.perfect = w.hp === w.def.hp;
      if (this.perfect) w.stats.perfects++;
    }
    this.recordRound();
    this.koLine = KO_LINES[Math.floor(this.rand() * KO_LINES.length)];
    this.emit({ t: 'announce', text: 'K.O.', style: 'ko', voice: 'K.O.' });
    this.emit({ t: 'sfx', name: 'ko' });
    this.emit({ t: 'flash', color: '#ffffff', frames: 8 });
    this.emit({ t: 'shake', amount: 10 });
  }

  private trainingUpkeep() {
    for (const f of this.fighters) {
      if (this.trainingOpts.infiniteMeter) f.meter = METER_MAX;
      const calm = ACTIONABLE.includes(f.state) && f.comboHits === 0;
      f.calmFrames = calm ? f.calmFrames + 1 : 0;
      if (this.trainingOpts.infiniteHp && f.calmFrames > 50) f.hp = f.def.hp;
    }
  }

  /** Training: put both fighters back at their start marks. */
  resetPositions() {
    this.resetRound();
    this.phase = 'fight';
    for (const f of this.fighters) {
      f.fullIntro = false;
      f.toIdle();
      if (this.trainingOpts.infiniteMeter) f.meter = METER_MAX;
    }
  }

  // ---- hits ------------------------------------------------------------------

  private resolveMelee() {
    const pending: [Fighter, Fighter, HitSpec][] = [];
    for (const att of this.fighters) {
      const hb = att.activeHitBox();
      if (!hb) continue;
      const def = this.other(att);
      if (def.hurtBoxes().some((h) => overlap(hb, h))) pending.push([att, def, att.moveHit!]);
    }
    for (const [att, def, hit] of pending) {
      const res = this.applyHit(att, def, hit, null);
      if (res !== 'none') {
        att.moveConnected = true;
        att.moveHits++;
        att.hitCooldown = att.move?.hitEvery ?? 0;
      }
    }
  }

  applyHit(att: Fighter, d: Fighter, hit: HitSpec, proj: Projectile | null): 'hit' | 'block' | 'counter' | 'none' {
    if (d.isInvuln() || d.state === 'ko' || d.dead) return 'none';
    if (d.state === 'launched' && d.juggle >= 4) return 'none';
    const dir = proj ? proj.facing : att.facing;
    const hb = proj ? this.projBox(proj) : att.activeHitBox();
    const sparkX = hb ? (dir === 1 ? Math.max(hb.x0, d.x - 8) : Math.min(hb.x1, d.x + 8)) : d.x;
    const sparkY = hb ? (Math.max(hb.y0, d.y) + Math.min(hb.y1, d.y + d.hurt.stand.h)) / 2 : d.y + 40;

    const cw = d.move?.counter;
    if (d.state === 'attack' && cw && d.mf >= cw[0] && d.mf <= cw[1]) {
      this.triggerCounter(d, att, proj);
      return 'counter';
    }

    if (d.canBlock(hit.height)) {
      d.move = null;
      d.setState('blockstun');
      d.crouching = d.input.held.down;
      d.stun = d.stunMax = hit.blockstun;
      d.vx = dir * hit.push * 0.9;
      d.hp = Math.max(0, d.hp - (hit.chip ?? 0));
      d.stats.blocks++;
      att.meter = Math.min(METER_MAX, att.meter + 2);
      d.meter = Math.min(METER_MAX, d.meter + 2);
      this.hitstop = proj ? 3 : 5;
      if (!proj && this.atWall(d)) att.vx = -dir * hit.push * 0.7;
      this.emit({ t: 'spark', x: sparkX, y: sparkY, kind: 'block', dir });
      this.emit({ t: 'sfx', name: 'block' });
      if (d.hp <= 0) this.finish(att, proj, hit.chip ?? 0, d, dir);
      return 'block';
    }

    if (d.state === 'attack' && d.move?.armor && d.armorLeft > 0 && d.mf >= d.move.armor[0] && d.mf <= d.move.armor[1]) {
      d.armorLeft--;
      d.hp = Math.max(0, d.hp - Math.round(hit.damage * 0.5));
      d.armorFlash = 10;
      this.hitstop = 8;
      this.emit({ t: 'spark', x: sparkX, y: sparkY, kind: 'armor', dir });
      this.emit({ t: 'sfx', name: 'block' });
      this.emit({ t: 'popup', x: d.x, y: d.y + d.hurt.stand.h + 10, text: 'ARMOR', color: '#ffb02e' });
      if (d.hp <= 0) this.finish(att, proj, Math.round(hit.damage * 0.5), d, dir);
      return 'hit';
    }

    const scale = Math.max(0.35, 1 - 0.1 * d.comboHits);
    const dmg = Math.max(1, Math.round(hit.damage * scale));
    d.hp = Math.max(this.training && this.trainingOpts.infiniteHp ? 1 : 0, d.hp - dmg);
    d.comboHits++;
    d.comboDamage += dmg;
    att.stats.damage += dmg;
    att.stats.maxCombo = Math.max(att.stats.maxCombo, d.comboHits);
    this.countLanded(att, proj);
    if (!att.powered) att.meter = Math.min(METER_MAX, att.meter + (hit.heavy ? 8 : 5));
    d.meter = Math.min(METER_MAX, d.meter + 4);
    if (d.grabbed) d.grabbed = null;
    d.move = null;
    d.powered = false;
    d.flash = 3;
    if (hit.slow) d.slow = hit.slow;

    const airborne = d.y > 0 || d.state === 'launched' || d.state === 'air';
    if (hit.launch || hit.knockdown || airborne) {
      d.setState('launched');
      d.sf = 0;
      d.vy = Math.max(2.4, (hit.launch ?? 3.6) * (1 - Math.min(0.45, d.juggle * 0.12)));
      d.vx = dir * Math.max(1.4, hit.push * 0.55);
      d.juggle++;
      if (d.y <= 0) d.y = 0.5;
    } else {
      d.lowHit = d.crouching;
      d.setState('hitstun');
      d.sf = 0;
      d.stun = d.stunMax = hit.hitstun;
      d.vx = dir * hit.push;
    }
    if (!proj && this.atWall(d)) att.vx = -dir * hit.push * 0.75;

    this.hitstop = hit.hitstop ?? 7;
    this.emit({ t: 'spark', x: sparkX, y: sparkY, kind: hit.spark ?? 'hit', dir });
    this.emit({ t: 'sfx', name: hit.sfx ?? 'light' });
    if (hit.heavy) this.emit({ t: 'shake', amount: hit.hitstop && hit.hitstop >= 14 ? 7 : 4 });
    if (d.comboHits >= 2) this.emit({ t: 'combo', side: att.side, hits: d.comboHits, damage: d.comboDamage });
    if (d.hp <= 0) this.finish(att, proj, dmg, d, dir);
    return 'hit';
  }

  /** Landed specials/supers count once per move or projectile, not per hit. */
  private countLanded(att: Fighter, proj: Projectile | null) {
    if (proj) {
      if (proj.kind === 'salt' || proj.kind === 'splash') att.stats.saltHits++;
      if (proj.landed) return;
      proj.landed = true;
      if (proj.powered) att.stats.supersLanded++;
      else att.stats.specialsLanded++;
      return;
    }
    const slot = att.move?.slot;
    if (att.moveConnected) return;
    if (slot === 'super') att.stats.supersLanded++;
    if (slot === 'special' || slot === 'counterStrike') att.stats.specialsLanded++;
  }

  private sourceLabel(att: Fighter, proj: Projectile | null) {
    if (proj) {
      if (proj.powered) return { label: att.def.superName, isSuper: true };
      return { label: proj.kind === 'beam' ? 'THIRD EYE' : att.def.special, isSuper: false };
    }
    const slot = att.move?.slot;
    if (!slot) return { label: 'THROW', isSuper: false };
    return { label: moveName(att, slot), isSuper: slot === 'super' };
  }

  private finish(att: Fighter, proj: Projectile | null, damage: number, d: Fighter, dir: number) {
    if (!this.training) this.finisher = { side: att.side, damage, ...this.sourceLabel(att, proj) };
    this.markDead(d, dir);
  }

  private markDead(d: Fighter, dir: number) {
    if (this.training) {
      // Training never ends the round; without infinite HP the dummy just refills.
      d.hp = this.trainingOpts.infiniteHp ? 1 : d.def.hp;
      return;
    }
    d.dead = true;
    d.move = null;
    d.setState('launched');
    d.vy = Math.max(d.vy, 5.5);
    d.vx = dir * 2.6;
    if (d.y <= 0) d.y = 0.5;
  }

  private atWall(f: Fighter) {
    return f.x <= WALL_MARGIN + 2 || f.x >= STAGE_W - WALL_MARGIN - 2;
  }

  private triggerCounter(d: Fighter, att: Fighter, proj: Projectile | null) {
    d.facing = att.x >= d.x ? 1 : -1;
    d.startMove(d.moves.counterStrike, this);
    if (proj) proj.dead = true;
    const dist = Math.abs(att.x - d.x);
    // The third eye answers across mid range only; full-screen zoning just gets absorbed.
    if (dist > 120 && dist < 220) {
      this.spawn({
        owner: d.side, kind: 'beam', x: (d.x + att.x) / 2, y: d.def.dims.thigh + d.def.dims.shin + 8, vx: 0, vy: 0,
        w: Math.max(40, dist), h: 26, life: 16, delay: 3, facing: d.facing, clash: false, variant: 1, powered: false,
        hit: { damage: 95, hitstun: 26, blockstun: 14, push: 3, height: 'mid', launch: 6, hitstop: 14, heavy: true, spark: 'counter', sfx: 'counter' },
      });
    }
    this.freeze = 16;
    d.stats.counters++;
    this.emit({ t: 'flash', color: '#ffe9a8', frames: 6 });
    this.emit({ t: 'sfx', name: 'counter' });
    this.emit({ t: 'popup', x: d.x, y: d.y + d.hurt.stand.h + 14, text: 'THIRD EYE!', color: '#ffd23a' });
  }

  // ---- throws ----------------------------------------------------------------

  tryThrow(f: Fighter) {
    const o = this.other(f);
    if (f.grabbed || this.phase !== 'fight') return;
    const range = (f.pushW + o.pushW) / 2 + 18;
    if (Math.abs(o.x - f.x) > range || o.y > 0 || o.isInvuln() || !THROWABLE.includes(o.state)) return;
    if (o.state === 'attack' && o.move?.slot === 'throw' && o.mf <= 8) {
      for (const g of [f, o]) {
        g.toIdle();
        g.vx = (g.x < this.other(g).x ? -1 : 1) * 4;
        g.setState('blockstun');
        g.stun = g.stunMax = 12;
      }
      this.emit({ t: 'sfx', name: 'block' });
      this.emit({ t: 'popup', x: (f.x + o.x) / 2, y: 90, text: 'TECH', color: '#9fe8ff' });
      return;
    }
    o.move = null;
    o.powered = false;
    o.setState('thrown');
    o.vx = 0;
    o.vy = 0;
    f.startMove(f.moves.throwHold, this);
    f.grabbed = o;
    this.emit({ t: 'sfx', name: 'whoosh' });
  }

  holdThrow(f: Fighter, mf: number) {
    const o = f.grabbed;
    if (!o) return;
    if (mf < 18) {
      o.x = f.x + f.facing * (f.pushW / 2 + o.pushW / 2 + 2);
      o.y = Math.min(24, mf * 1.5);
      o.facing = f.facing === 1 ? -1 : 1;
    } else if (mf === 18) {
      f.grabbed = null;
      f.stats.throws++;
      o.setState('hitstun');
      o.y = Math.max(o.y, 1);
      this.applyHit(f, o, {
        damage: Math.round(112 * f.def.power), hitstun: 0, blockstun: 0, push: 5, height: 'mid', launch: 5,
        hitstop: 12, heavy: true, spark: 'heavy', sfx: 'throw',
      }, null);
    }
  }

  // ---- projectiles -----------------------------------------------------------

  projBox(p: Projectile): WorldBox {
    return { x0: p.x - p.w / 2, y0: p.y, x1: p.x + p.w / 2, y1: p.y + p.h };
  }

  private projActive(p: Projectile) {
    if (p.age < p.delay) return false;
    if (p.activeFor !== undefined && p.age >= p.delay + p.activeFor) return false;
    return true;
  }

  private updateProjectiles() {
    for (const p of this.projectiles) {
      p.age++;
      if (p.cooldown > 0) p.cooldown--;
      if (p.age >= p.delay) {
        p.vy -= p.gravity;
        p.x += p.vx;
        p.y += p.vy;
      }
      if (p.kind === 'salt' && p.y <= 0) {
        p.dead = true;
        this.spawn({
          owner: p.owner, kind: 'splash', x: p.x, y: 0, vx: 0, vy: 0, w: p.variant === 1 ? 100 : 66, h: 24,
          life: 26, delay: 0, activeFor: 14, facing: p.facing, ground: true, clash: false, variant: p.variant, powered: p.powered,
          hit: saltHit(p.variant, false),
        });
        this.emit({ t: 'sfx', name: 'salt' });
        this.emit({ t: 'spark', x: p.x, y: 4, kind: 'salt', dir: p.facing });
        continue;
      }
      if (p.age >= p.life || p.x < -60 || p.x > STAGE_W + 60) p.dead = true;
      if (p.dead || p.hitsLeft <= 0 || !this.projActive(p) || p.cooldown > 0 || this.phase !== 'fight') continue;
      const owner = this.fighters[p.owner];
      const target = this.other(owner);
      const box = this.projBox(p);
      if (target.hurtBoxes().some((h) => overlap(box, h))) {
        const res = this.applyHit(owner, target, p.hit, p);
        if (res !== 'none') {
          if (res === 'hit' && (p.kind === 'salt' || p.kind === 'splash')) {
            this.emit({ t: 'popup', x: target.x, y: target.y + target.hurt.stand.h + 12, text: SALT_LABELS[p.variant], color: '#7dff6a' });
          }
          p.hitsLeft--;
          p.cooldown = p.rehit;
          // Ground hazards and beams stay on screen after connecting so the hit reads.
          if (p.hitsLeft <= 0 && !p.ground && p.kind !== 'beam') p.dead = true;
          if (p.kind === 'salt' && res !== 'counter') {
            p.dead = true;
            this.emit({ t: 'sfx', name: 'salt' });
          }
        }
      }
    }
    const clashers = this.projectiles.filter((p) => p.clash && !p.dead && this.projActive(p));
    for (const a of clashers) {
      for (const b of clashers) {
        if (a.owner >= b.owner || a.dead || b.dead) continue;
        if (overlap(this.projBox(a), this.projBox(b))) {
          a.dead = true;
          b.dead = true;
          this.emit({ t: 'spark', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 8, kind: 'block', dir: 1 });
          this.emit({ t: 'sfx', name: 'block' });
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ---- positioning -------------------------------------------------------------

  private separate() {
    const [a, b] = this.fighters;
    const lo = WALL_MARGIN;
    const hi = STAGE_W - WALL_MARGIN;
    for (const f of this.fighters) f.x = Math.max(lo, Math.min(hi, f.x));
    const ghost = a.passingThrough() || b.passingThrough() || a.state === 'thrown' || b.state === 'thrown'
      || a.state === 'knockdown' || b.state === 'knockdown' || a.state === 'ko' || b.state === 'ko';
    if (!ghost && Math.abs(a.y - b.y) < 50) {
      const min = (a.pushW + b.pushW) / 2;
      const dx = b.x - a.x;
      if (Math.abs(dx) < min) {
        const s = dx === 0 ? a.facing : Math.sign(dx);
        const push = (min - Math.abs(dx)) / 2;
        a.x -= s * push;
        b.x += s * push;
        for (const [f, o] of [[a, b], [b, a]] as const) {
          if (f.x < lo) {
            o.x += lo - f.x;
            f.x = lo;
          } else if (f.x > hi) {
            o.x -= f.x - hi;
            f.x = hi;
          }
        }
      }
    }
    const dist = Math.abs(b.x - a.x);
    if (dist > MAX_SEPARATION) {
      const excess = dist - MAX_SEPARATION;
      const aAway = Math.abs(a.x - b.x) > Math.abs(a.prevX - b.x);
      const mover = aAway ? a : b;
      const other = mover === a ? b : a;
      mover.x += Math.sign(other.x - mover.x) * excess;
    }
  }

  private updateFacing() {
    for (const f of this.fighters) {
      const o = this.other(f);
      const canTurn = ACTIONABLE.includes(f.state) || f.state === 'prejump' || f.state === 'land' || f.state === 'intro' || f.state === 'wakeup';
      if (canTurn && Math.abs(o.x - f.x) > 2) f.facing = o.x > f.x ? 1 : -1;
    }
  }
}
