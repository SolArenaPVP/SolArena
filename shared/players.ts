import type { FighterId } from './fighters';

export const USERNAME_MAX = 14;

/** Player as the server stores it. Identity tonight is just this server-generated id kept in the browser. */
export interface PlayerProfile {
  id: string;
  username: string;
  mainFighter: FighterId | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  bestCombo: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlayerRequest {
  username: string;
}

export interface UpdatePlayerRequest {
  username: string;
}

/** Uppercase pixel-font-safe name, 1-14 chars, or null if nothing usable is left. */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').trim().slice(0, USERNAME_MAX);
  return name.length ? name : null;
}
