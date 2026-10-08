import type { MatchResult, ReplayData } from './matches';

export * from './fighters';
export * from './matches';
export * from './players';

/** HTTP routes, so the client and server can't drift apart. */
export const API = {
  health: '/health',
  players: '/players',
  player: (id: string) => `/players/${encodeURIComponent(id)}`,
  playerMatches: (id: string) => `/players/${encodeURIComponent(id)}/matches`,
  matches: '/matches',
  match: (id: string) => `/matches/${encodeURIComponent(id)}`,
  telemetry: '/telemetry',
  feedback: '/feedback',
} as const;

export interface HealthResponse {
  status: 'ok';
  version: string;
  /** Game version whose sim the server uses to verify replays. */
  simVersion: string;
  database?: 'ok' | 'error';
}

export interface PlayerMatchesResponse {
  matches: MatchResult[];
}

export const TELEMETRY_EVENTS = [
  'game_started', 'fighter_selected', 'match_started', 'match_completed', 'match_quit', 'rematch_selected',
  'char_select_return', 'share_card_created', 'replay_viewed', 'profile_opened', 'feedback_submitted',
] as const;
export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];
export const TELEMETRY_BATCH_MAX = 100;

/** Anonymous gameplay event. installId is a random per-browser id; nothing personal goes in payload. */
export interface TelemetryEvent {
  playerId: string | null;
  installId: string;
  eventName: TelemetryEventName;
  /** Client epoch ms. */
  timestamp: number;
  gameVersion: string;
  payload: Record<string, unknown>;
}

export interface TelemetryBatch {
  events: TelemetryEvent[];
}

export const FEEDBACK_CATEGORIES = ['bug', 'feedback'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_MESSAGE_MAX = 2000;

export interface FeedbackSubmission {
  playerId: string | null;
  installId: string;
  gameVersion: string;
  browser: string;
  /** Server match id, when the report is about a stored match. */
  matchId: string | null;
  fighterMatchup: string | null;
  round: number | null;
  category: FeedbackCategory;
  message: string;
  /** Replay of the match in progress when the report was filed, for reproduction. */
  replay: ReplayData | null;
  timestamp: number;
}

export interface ApiErrorBody {
  error: string;
  details?: string[];
}
