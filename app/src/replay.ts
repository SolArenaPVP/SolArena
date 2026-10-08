import { VERSION } from './config';
import type { ReplayData } from '../../shared/matches';
import { BUTTONS, type PadInput } from './input';
import type { Match } from './sim/match';

/**
 * A replay is the match's inputs, not video: the sim is deterministic, so
 * feeding the same seed + inputs regenerates the exact match
 * (PRD-closed-beta § 15). Inputs are packed per tick and run-length encoded.
 * The shape lives in shared/ because the server stores and re-simulates it.
 */
export type Replay = ReplayData;

/** 9 held bits + 9 pressed bits per player; P2 sits above P1, still well inside a safe integer. */
const SIDE = 1 << 18;

function pack(p: PadInput) {
  let n = 0;
  BUTTONS.forEach((b, i) => {
    if (p.held[b]) n |= 1 << i;
    if (p.pressed[b]) n |= 1 << (i + 9);
  });
  return n;
}

function unpack(n: number): PadInput {
  const held = {} as PadInput['held'];
  const pressed = {} as PadInput['pressed'];
  BUTTONS.forEach((b, i) => {
    held[b] = (n & (1 << i)) !== 0;
    pressed[b] = (n & (1 << (i + 9))) !== 0;
  });
  return { held, pressed };
}

export const checksumOf = (m: Match) => `${m.matchWinner}|${m.fighters[0].hp}|${m.fighters[1].hp}|${m.fightFrames}`;

export class ReplayRecorder {
  private rle: number[] = [];
  private last = -1;
  private ticks = 0;
  private skipAt: number | null = null;

  constructor(private meta: Pick<Replay, 'mode' | 'p1' | 'p2' | 'seed' | 'boss'>) {}

  /** Call with the exact inputs passed to Match.tick, once per tick. */
  push(inputs: [PadInput, PadInput]) {
    const code = pack(inputs[0]) + pack(inputs[1]) * SIDE;
    if (code === this.last) this.rle[this.rle.length - 1]++;
    else {
      this.rle.push(code, 1);
      this.last = code;
    }
    this.ticks++;
  }

  /** Call right before the tick on which the intro was skipped. */
  markSkip() {
    if (this.skipAt === null) this.skipAt = this.ticks;
  }

  finish(m: Match): Replay {
    return {
      version: VERSION,
      id: `${Date.now().toString(36)}-${this.meta.seed.toString(36)}`,
      date: Date.now(),
      ...this.meta,
      skipAt: this.skipAt,
      ticks: this.ticks,
      rle: this.rle,
      checksum: checksumOf(m),
    };
  }
}

export class ReplayPlayer {
  private i = 0;
  private left = 0;
  private code = 0;
  /** Number of ticks handed out so far. */
  tick = 0;

  constructor(readonly replay: Replay) {}

  get skipNow() {
    return this.replay.skipAt === this.tick;
  }

  next(): [PadInput, PadInput] | null {
    if (this.left === 0) {
      if (this.i >= this.replay.rle.length) return null;
      this.code = this.replay.rle[this.i];
      this.left = this.replay.rle[this.i + 1];
      this.i += 2;
    }
    this.left--;
    this.tick++;
    return [unpack(this.code % SIDE), unpack(Math.floor(this.code / SIDE))];
  }
}

const STORE_KEY = 'solarena.replays';
const KEEP = 8;

export function saveReplay(r: Replay) {
  try {
    const list = loadReplays().filter((x) => x.id !== r.id);
    list.unshift(r);
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, KEEP)));
  } catch {
    // storage full or blocked; the replay still works for this session
  }
}

export function loadReplays(): Replay[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Replay[]) : [];
  } catch {
    return [];
  }
}
