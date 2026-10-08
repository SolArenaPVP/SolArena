import type { Replay } from './replay';
import type { FighterStats, Match } from './sim/match';
import type { FighterId } from './sim/roster';

export interface Award {
  title: string;
  detail: string;
}

/** Everything the results screen, share card, history and telemetry need about a finished match. */
export interface MatchReport {
  winner: FighterId;
  loser: FighterId;
  winnerSide: 0 | 1;
  score: [number, number];
  stats: [FighterStats, FighterStats];
  /** Seconds of actual fighting (intros and KO slow-mo excluded). */
  duration: number;
  finisher: string;
  award: Award;
  awards: Award[];
  quote: string;
  replay: Replay | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Contextual awards (PRD-closed-beta § 18), most impressive first. The first
 * one is the headline; the rest show as chips and make the card more shareable.
 */
function awardsFor(m: Match, side: 0 | 1): Award[] {
  const w = m.fighters[side];
  const s = w.stats;
  const out: Award[] = [];
  const winnerRounds = m.roundWinners.filter((r) => r === side).length;
  const ratio = w.hp / w.def.hp;
  const fin = m.finisher?.side === side ? m.finisher : null;
  const minutes = Math.max(0.25, m.fightFrames / 3600);
  if (s.perfects > 0 && s.perfects >= winnerRounds) out.push({ title: 'PERFECT', detail: 'Won without taking a single hit.' });
  if (s.comebacks > 0 || (m.roundWinners[0] !== side && m.roundWinners[0] !== -1)) {
    out.push({ title: 'COMEBACK', detail: s.comebacks > 0 ? 'Won a round from way behind on health.' : 'Dropped round one. Took the match anyway.' });
  }
  if (ratio > 0 && ratio <= 0.15) out.push({ title: 'DIAMOND HANDS', detail: `Held on and won with ${pct(ratio)} HP left.` });
  if (s.counters >= 3) out.push({ title: 'COUNTER GOD', detail: `Landed ${s.counters} counters.` });
  if (fin && (fin.damage >= 100 || fin.isSuper)) out.push({ title: 'LIQUIDATOR', detail: `Finished it with ${fin.label}.` });
  if (w.def.id === 'pepe' && s.saltHits >= 4) out.push({ title: 'SALTY', detail: `${s.saltHits} salt hits. Feels good man.` });
  if (s.attacks / minutes >= 45 && s.blocks <= 6) out.push({ title: 'FULL PORT', detail: `${s.attacks} attacks thrown, ${s.blocks} blocked.` });
  if (s.blocks <= 1) out.push({ title: 'NO BLOCK BUTTON', detail: s.blocks === 0 ? 'Did not block once.' : 'Blocked exactly once.' });
  out.push({ title: 'STILL HOLDING', detail: 'Got the W. Kept the bag.' });
  return out;
}

export function buildReport(m: Match, replay: Replay | null): MatchReport {
  const side = m.matchWinner ?? 0;
  const other = side === 0 ? 1 : 0;
  const awards = awardsFor(m, side);
  return {
    winner: m.fighters[side].def.id,
    loser: m.fighters[other].def.id,
    winnerSide: side,
    score: [m.wins[side], m.wins[other]],
    stats: [m.fighters[0].stats, m.fighters[1].stats],
    duration: Math.round(m.fightFrames / 60),
    finisher: m.finisher?.label ?? 'KO',
    award: awards[0],
    awards,
    quote: m.winQuote || m.fighters[side].def.winQuotes[0],
    replay,
  };
}

export const formatTime = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
