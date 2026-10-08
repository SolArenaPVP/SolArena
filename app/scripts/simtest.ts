/**
 * Headless CPU-vs-CPU soak test over every matchup: catches crashes and stuck
 * states, and prints win rates so balance problems show up as numbers.
 *
 * npm run simtest [-- matchesPerPair] [difficulty]
 */
import { Bot, type Difficulty } from '../src/ai';
import { ReplayPlayer, ReplayRecorder, checksumOf } from '../src/replay';
import { Match } from '../src/sim/match';
import { FIGHTER_IDS, type FighterId } from '../src/sim/roster';

const perPair = Number(process.argv[2] ?? 6);
const level = (process.argv[3] ?? 'chad') as Difficulty;
const MAX_FRAMES = 60 * 60 * 8;

const wins: Record<string, number> = {};
const played: Record<string, number> = {};
const usage: Record<string, { specials: number; supers: number; damage: number }> = {};
let totalFrames = 0;
let timeouts = 0;
let replaysChecked = 0;
let matches = 0;
const problems: string[] = [];
/** pairWins[a][b] = matches a won against b (from either side). */
const pairWins: Record<string, Record<string, number>> = {};
const pairPlayed: Record<string, Record<string, number>> = {};

for (const id of FIGHTER_IDS) {
  wins[id] = 0;
  played[id] = 0;
  usage[id] = { specials: 0, supers: 0, damage: 0 };
  pairWins[id] = {};
  pairPlayed[id] = {};
  for (const o of FIGHTER_IDS) {
    pairWins[id][o] = 0;
    pairPlayed[id][o] = 0;
  }
}

let seed = 1;
for (const a of FIGHTER_IDS) {
  for (const b of FIGHTER_IDS) {
    if (a === b) continue;
    for (let n = 0; n < perPair; n++) {
      seed++;
      const m = new Match({ p1: a as FighterId, p2: b as FighterId, seed: seed * 7919 });
      const bots = [new Bot(level, seed * 13), new Bot(level, seed * 31)];
      const rec = n === 0 ? new ReplayRecorder({ mode: 'cpu', p1: a as FighterId, p2: b as FighterId, seed: seed * 7919, boss: null }) : null;
      let f = 0;
      try {
        while (m.phase !== 'matchEnd' && f < MAX_FRAMES) {
          const inputs = [bots[0].think(m, m.fighters[0]), bots[1].think(m, m.fighters[1])] as const;
          rec?.push([inputs[0], inputs[1]]);
          m.tick([inputs[0], inputs[1]]);
          m.drain();
          for (const fi of m.fighters) {
            if (!Number.isFinite(fi.x) || !Number.isFinite(fi.y)) throw new Error(`non-finite position ${fi.def.id} ${fi.state}`);
            if (fi.state === 'attack' && fi.mf > 400) throw new Error(`${fi.def.id} stuck in ${fi.move?.slot}`);
            if (fi.state === 'thrown' && fi.sf > 200) throw new Error(`${fi.def.id} stuck thrown`);
          }
          f++;
        }
      } catch (e) {
        problems.push(`${a} vs ${b}: ${(e as Error).message}`);
        continue;
      }
      matches++;
      totalFrames += f;
      if (m.phase !== 'matchEnd') {
        timeouts++;
        problems.push(`${a} vs ${b}: never finished (round ${m.round}, phase ${m.phase})`);
        continue;
      }
      if (rec) {
        // Replays must regenerate the exact match from seed + inputs.
        const replay = rec.finish(m);
        const player = new ReplayPlayer(replay);
        const again = new Match({ p1: replay.p1, p2: replay.p2, seed: replay.seed });
        for (let inp = player.next(); inp && again.phase !== 'matchEnd'; inp = player.next()) {
          again.tick(inp);
          again.drain();
        }
        replaysChecked++;
        if (checksumOf(again) !== replay.checksum) problems.push(`${a} vs ${b}: replay desync (${checksumOf(again)} != ${replay.checksum})`);
      }
      const w = m.matchWinner!;
      wins[m.fighters[w].def.id]++;
      pairWins[m.fighters[w].def.id][m.fighters[w === 0 ? 1 : 0].def.id]++;
      pairPlayed[a][b]++;
      pairPlayed[b][a]++;
      for (const fi of m.fighters) {
        played[fi.def.id]++;
        usage[fi.def.id].specials += fi.stats.specials;
        usage[fi.def.id].supers += fi.stats.supers;
        usage[fi.def.id].damage += fi.stats.damage;
      }
    }
  }
}

console.log(`\n${matches} matches at ${level}, avg ${(totalFrames / Math.max(1, matches) / 60).toFixed(1)}s per match, ${timeouts} timeouts, ${replaysChecked} replays verified`);
console.log('\nfighter    win%   specials/match  supers/match  dmg/match');
for (const id of FIGHTER_IDS) {
  const p = Math.max(1, played[id]);
  console.log(
    `${id.padEnd(10)} ${((wins[id] / p) * 100).toFixed(0).padStart(4)}%  ${(usage[id].specials / p).toFixed(1).padStart(14)}  ${(usage[id].supers / p).toFixed(1).padStart(12)}  ${(usage[id].damage / p).toFixed(0).padStart(9)}`,
  );
}
console.log('\nmatchup win% (row vs column)');
console.log('          ' + FIGHTER_IDS.map((id) => id.slice(0, 5).padStart(6)).join(''));
for (const a of FIGHTER_IDS) {
  console.log(a.padEnd(10) + FIGHTER_IDS.map((b) => (a === b ? '     -' : `${Math.round((pairWins[a][b] / Math.max(1, pairPlayed[a][b])) * 100)}`.padStart(6))).join(''));
}
if (problems.length) {
  console.log(`\n${problems.length} problems:`);
  for (const pr of problems.slice(0, 30)) console.log('  ' + pr);
  process.exitCode = 1;
}
