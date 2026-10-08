import type { FighterId } from './fighters';

export const MATCH_MODES = ['arcade', 'cpu', 'versus', 'training'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/** Modes the server stores; only these count toward a player's profile. */
export const SUBMITTABLE_MODES = ['cpu', 'arcade'] as const satisfies readonly MatchMode[];
export type SubmittableMode = (typeof SUBMITTABLE_MODES)[number];

/** Matches are only submitted once they finish. */
export type MatchStatus = 'completed';

/**
 * - verified: the server re-ran the replay and got the submitted result exactly
 * - mismatch: the replay produces a different result than the one submitted
 * - version_mismatch: built by a different game version than the server's sim, so it can't be re-run
 * - verified_structure_only: fields and replay shape check out, but the replay was not re-simulated
 */
export const VERIFICATION_STATUSES = ['verified', 'mismatch', 'version_mismatch', 'verified_structure_only'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Deterministic replay: seed + run-length-encoded inputs regenerate the whole match. */
export interface ReplayData {
  version: string;
  id: string;
  date: number;
  mode: MatchMode;
  p1: FighterId;
  p2: FighterId;
  seed: number;
  boss: 0 | 1 | null;
  /** Tick index at which the round-1 intro was skipped, if it was. */
  skipAt: number | null;
  ticks: number;
  /** [packedInputs, repeatCount] pairs. */
  rle: number[];
  /** Winner, final HP and fight frames, to detect a desync on playback. */
  checksum: string;
}

export type ReplayMetadata = Omit<ReplayData, 'rle'>;

export interface MatchSideStats {
  damage: number;
  maxCombo: number;
  specials: number;
  supers: number;
  specialsLanded: number;
  supersLanded: number;
  counters: number;
  throws: number;
  blocks: number;
  /** Moves started, for FULL PORT. */
  attacks: number;
  saltHits: number;
  perfects: number;
  /** Rounds won from a big HP deficit. */
  comebacks: number;
}

/** What the game POSTs to /matches. The submitting player is always P1 (side 0). */
export interface MatchSubmission {
  playerId: string;
  /** The replay id; makes resubmits idempotent. */
  clientMatchId: string;
  gameVersion: string;
  mode: SubmittableMode;
  playerFighter: FighterId;
  opponentFighter: FighterId;
  winnerSide: 0 | 1;
  scorePlayer: number;
  scoreOpponent: number;
  stats: { player: MatchSideStats; opponent: MatchSideStats };
  finisher: string;
  /** Seconds of fighting. */
  matchTime: number;
  award: string;
  completedAt: number;
  replayChecksum: string;
  replay: ReplayData;
}

/** A stored match as the server returns it. */
export interface MatchResult {
  id: string;
  playerId: string;
  clientMatchId: string;
  mode: SubmittableMode;
  status: MatchStatus;
  gameVersion: string;
  playerFighter: FighterId;
  opponentFighter: FighterId;
  winnerSide: 0 | 1;
  scorePlayer: number;
  scoreOpponent: number;
  damagePlayer: number;
  damageOpponent: number;
  maxComboPlayer: number;
  maxComboOpponent: number;
  finisher: string;
  matchTime: number;
  award: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  verificationDetail: string | null;
  replayChecksum: string;
  hasReplay: boolean;
  createdAt: string;
  completedAt: string;
}

export interface MatchWithReplay extends MatchResult {
  replay: ReplayData | null;
}
