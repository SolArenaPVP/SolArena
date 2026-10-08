import { VERSION } from './config';
import type { Mode, Session } from './game';
import type { MatchReport } from './report';
import { FIGHTER_IDS, type FighterId } from './sim/roster';

/**
 * Closed-beta instrumentation (PRD-closed-beta § 22–26): anonymous telemetry,
 * the local profile, match history and feedback reports. Everything is stored
 * in the browser first. If VITE_TELEMETRY_URL / VITE_FEEDBACK_URL are set at
 * build time, events and reports are also POSTed there; otherwise testers
 * export a JSON file from the profile screen.
 */

const KEYS = {
  install: 'solarena.install',
  events: 'solarena.events',
  profile: 'solarena.profile',
  history: 'solarena.history',
  feedback: 'solarena.feedback',
};
const MAX_EVENTS = 800;
const MAX_HISTORY = 30;
const TELEMETRY_URL: string | undefined = import.meta.env.VITE_TELEMETRY_URL;
const FEEDBACK_URL: string | undefined = import.meta.env.VITE_FEEDBACK_URL;

export type BetaEventType =
  | 'session_start' | 'match_start' | 'match_end' | 'match_quit' | 'rematch' | 'char_select_return'
  | 'share_card' | 'replay_view' | 'feedback';

export interface BetaEvent {
  type: BetaEventType;
  at: number;
  session: string;
  [k: string]: unknown;
}

export interface Profile {
  username: string;
  favorite: FighterId | null;
  matches: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  damage: number;
  bestCombo: number;
  picks: Partial<Record<FighterId, number>>;
}

export interface HistoryEntry {
  date: number;
  mode: Mode;
  p1: FighterId;
  p2: FighterId;
  result: 'W' | 'L';
  score: [number, number];
  duration: number;
  maxCombo: number;
  finisher: string;
  award: string;
  replayId: string | null;
}

export interface FeedbackReport {
  kind: 'bug' | 'feedback';
  message: string;
  version: string;
  matchup: string | null;
  round: number | null;
  browser: string;
  replayId: string | null;
  at: number;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked; instrumentation must never break the game
  }
}

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const emptyProfile = (): Profile => ({
  username: 'ANON', favorite: null, matches: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, damage: 0, bestCombo: 0, picks: {},
});

class Beta {
  /** Random per-browser id: groups one tester's events without identifying them. */
  readonly install: string;
  readonly session = randomId();
  private matchLive = false;

  constructor() {
    let id = load<string | null>(KEYS.install, null);
    if (!id) {
      id = randomId();
      store(KEYS.install, id);
    }
    this.install = id;
  }

  track(type: BetaEventType, data: Record<string, unknown> = {}) {
    const e: BetaEvent = { type, at: Date.now(), session: this.session, ...data };
    const events = load<BetaEvent[]>(KEYS.events, []);
    events.push(e);
    store(KEYS.events, events.slice(-MAX_EVENTS));
    if (TELEMETRY_URL) this.send(TELEMETRY_URL, { install: this.install, version: VERSION, events: [e] });
  }

  private send(url: string, body: unknown) {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon?.(url, new Blob([json], { type: 'application/json' }))) return;
    fetch(url, { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }

  // ---- match lifecycle ------------------------------------------------------

  matchStart(s: Session, difficulty: string) {
    this.matchLive = true;
    this.track('match_start', { mode: s.mode, p1: s.p1, p2: s.p2, difficulty: s.mode === 'versus' ? null : difficulty, rematch: s.rematches > 0 });
  }

  matchQuit(s: Session, round: number) {
    if (!this.matchLive) return;
    this.matchLive = false;
    this.track('match_quit', { mode: s.mode, p1: s.p1, p2: s.p2, round });
  }

  matchEnd(s: Session, r: MatchReport) {
    this.matchLive = false;
    const p1Won = r.winnerSide === 0;
    this.track('match_end', {
      mode: s.mode, p1: s.p1, p2: s.p2, winner: r.winner, winnerSide: r.winnerSide, score: r.score, duration: r.duration,
      damage: [r.stats[0].damage, r.stats[1].damage], maxCombo: [r.stats[0].maxCombo, r.stats[1].maxCombo],
      specials: [r.stats[0].specials, r.stats[1].specials], supers: [r.stats[0].supers, r.stats[1].supers],
      finisher: r.finisher, award: r.award.title,
    });
    if (s.mode === 'training') return;
    const p = this.profile();
    p.matches++;
    if (p1Won) {
      p.wins++;
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
    } else {
      p.losses++;
      p.streak = 0;
    }
    p.damage += r.stats[0].damage;
    p.bestCombo = Math.max(p.bestCombo, r.stats[0].maxCombo);
    p.picks[s.p1] = (p.picks[s.p1] ?? 0) + 1;
    p.favorite = mostPlayed(p);
    store(KEYS.profile, p);
    const entry: HistoryEntry = {
      date: Date.now(), mode: s.mode, p1: s.p1, p2: s.p2, result: p1Won ? 'W' : 'L',
      score: p1Won ? r.score : [r.score[1], r.score[0]], duration: r.duration,
      maxCombo: r.stats[0].maxCombo, finisher: r.finisher, award: r.award.title, replayId: r.replay?.id ?? null,
    };
    store(KEYS.history, [entry, ...this.history()].slice(0, MAX_HISTORY));
  }

  // ---- profile / history -------------------------------------------------------

  profile(): Profile {
    return { ...emptyProfile(), ...load<Partial<Profile>>(KEYS.profile, {}) };
  }

  setUsername(name: string) {
    const p = this.profile();
    p.username = name.toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').slice(0, 14) || 'ANON';
    store(KEYS.profile, p);
  }

  history(): HistoryEntry[] {
    return load<HistoryEntry[]>(KEYS.history, []);
  }

  // ---- feedback -------------------------------------------------------------------

  feedback(r: Omit<FeedbackReport, 'version' | 'browser' | 'at'>): FeedbackReport {
    const report: FeedbackReport = { ...r, version: VERSION, browser: navigator.userAgent, at: Date.now() };
    store(KEYS.feedback, [...load<FeedbackReport[]>(KEYS.feedback, []), report].slice(-50));
    this.track('feedback', { kind: r.kind, matchup: r.matchup });
    if (FEEDBACK_URL) this.send(FEEDBACK_URL, { install: this.install, report });
    return report;
  }

  get remoteFeedback() {
    return !!FEEDBACK_URL;
  }

  // ---- beta metrics (PRD-closed-beta § 25), computed from this browser's events ----

  metrics() {
    const events = load<BetaEvent[]>(KEYS.events, []);
    const starts = events.filter((e) => e.type === 'match_start' && e.mode !== 'training');
    const ends = events.filter((e) => e.type === 'match_end' && e.mode !== 'training');
    const rematches = starts.filter((e) => e.rematch).length;
    const shares = events.filter((e) => e.type === 'share_card').length;
    const picks: Record<string, number> = {};
    const wins: Record<string, number> = {};
    const played: Record<string, number> = {};
    for (const e of ends) {
      const p1 = e.p1 as FighterId;
      picks[p1] = (picks[p1] ?? 0) + 1;
      for (const id of [e.p1, e.p2] as FighterId[]) played[id] = (played[id] ?? 0) + 1;
      wins[e.winner as string] = (wins[e.winner as string] ?? 0) + 1;
    }
    const rate = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    return {
      matches: ends.length,
      rematchRate: rate(rematches, ends.length),
      completionRate: rate(ends.length, starts.length),
      shareRate: rate(shares, ends.length),
      pickRate: FIGHTER_IDS.map((id) => ({ id, pct: rate(picks[id] ?? 0, ends.length) })),
      winRate: FIGHTER_IDS.map((id) => ({ id, pct: rate(wins[id] ?? 0, played[id] ?? 0), n: played[id] ?? 0 })),
    };
  }

  /** Everything a tester can send back by hand when no endpoint is configured. */
  exportData() {
    const data = {
      version: VERSION,
      install: this.install,
      exportedAt: new Date().toISOString(),
      profile: this.profile(),
      history: this.history(),
      metrics: this.metrics(),
      feedback: load<FeedbackReport[]>(KEYS.feedback, []),
      events: load<BetaEvent[]>(KEYS.events, []),
    };
    const a = document.createElement('a');
    a.download = `solarena-beta-${this.install.slice(0, 6)}-${new Date().toISOString().slice(0, 10)}.json`;
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function mostPlayed(p: Profile): FighterId | null {
  let best: FighterId | null = null;
  for (const id of FIGHTER_IDS) if ((p.picks[id] ?? 0) > (best ? p.picks[best] ?? 0 : 0)) best = id;
  return best;
}

export const beta = new Beta();
