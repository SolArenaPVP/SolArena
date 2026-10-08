import { DIFFICULTIES, type Difficulty } from './ai';
import { audio } from './audio';
import { Arena } from './render/arena';
import type { MatchMode } from '../../shared/matches';
import type { FighterId } from './sim/roster';

export interface Scene {
  update(): void;
  /** world: 512x288 pixel buffer. ui: display-resolution context pre-scaled to the same virtual coordinates. */
  draw(world: CanvasRenderingContext2D, ui: CanvasRenderingContext2D): void;
}

export type Mode = MatchMode;

export interface Session {
  mode: Mode;
  p1: FighterId;
  p2: FighterId;
  /** Arcade ladder: remaining opponents, current opponent first. */
  ladder?: FighterId[];
  ladderTotal?: number;
  rematches: number;
}

/** Arcade run: three fights, the rival, a semi-final, then the final boss (PRD-closed-beta § 12). */
export const ARCADE_STAGES = ['FIGHT 1', 'FIGHT 2', 'FIGHT 3', 'RIVAL FIGHT', 'SEMI-FINAL', 'FINAL BOSS'];

export function arcadeStage(s: Session) {
  if (s.mode !== 'arcade' || !s.ladder || !s.ladderTotal) return null;
  const index = s.ladderTotal - s.ladder.length;
  return { index, total: s.ladderTotal, label: ARCADE_STAGES[index] ?? `FIGHT ${index + 1}`, boss: index === ARCADE_STAGES.length - 1 };
}

export function buildLadder(p1: FighterId, pool: readonly FighterId[], rival: FighterId): FighterId[] {
  const others = pool.filter((id) => id !== p1 && id !== rival).sort(() => Math.random() - 0.5);
  return [others[0], others[1], others[2], rival, others[3], others[4]];
}

export interface Settings {
  difficulty: Difficulty;
  sfx: boolean;
  music: boolean;
  voice: boolean;
}

const SETTINGS_KEY = 'solarena.settings';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked (private mode); settings just won't persist
  }
}

class Game {
  scene!: Scene;
  frame = 0;
  arena!: Arena;
  settings: Settings = read<Settings>(SETTINGS_KEY, { difficulty: 'trencher', sfx: true, music: true, voice: true });
  /** Dev-server debug overlay, toggled with backquote in a fight (PRD-closed-beta § 27). */
  debug = false;

  init() {
    // Settings saved before the four named CPU levels existed.
    if (!DIFFICULTIES.includes(this.settings.difficulty)) this.settings.difficulty = 'trencher';
    this.arena = new Arena();
    this.applyAudio();
  }

  go(scene: Scene) {
    this.scene = scene;
  }

  saveSettings() {
    write(SETTINGS_KEY, this.settings);
    this.applyAudio();
  }

  private applyAudio() {
    audio.settings.sfx = this.settings.sfx;
    audio.settings.voice = this.settings.voice;
    audio.setMusic(this.settings.music);
  }
}

export const game = new Game();
