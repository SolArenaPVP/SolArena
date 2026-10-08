/** Canonical fighter IDs, shared by the game and the server. Order is the select-screen order. */
export const FIGHTER_IDS = ['daumen', 'chairman', 'cate', 'doge', 'pepe', 'orangie', 'buddha', 'decu'] as const;
export type FighterId = (typeof FIGHTER_IDS)[number];

export const isFighterId = (v: unknown): v is FighterId => typeof v === 'string' && (FIGHTER_IDS as readonly string[]).includes(v);
