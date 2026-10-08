import type { Dims, Pose } from '../rig';

import type { FighterId } from '../../../shared/fighters';

export { FIGHTER_IDS, type FighterId } from '../../../shared/fighters';

export type HeavyStyle = 'kick' | 'haymaker' | 'palm' | 'slam';

export interface FighterDef {
  id: FighterId;
  name: string;
  archetype: string;
  special: string;
  superName: string;
  /** One-line gameplay pitch for the select screen (PRD-closed-beta § 6). */
  description: string;
  /** UI accent, matches the card frame on the roster sheet. */
  color: string;
  hp: number;
  walk: number;
  backWalk: number;
  dash: number;
  jumpV: number;
  airVx: number;
  gravity: number;
  /** Multiplier on normal-move frame counts; lower is faster. */
  speed: number;
  /** Multiplier on normal-move damage. */
  power: number;
  heavy: HeavyStyle;
  /** Extra horizontal reach on the heavy, in px (CHAIRMAN's bandage lash). */
  heavyReach?: number;
  stance?: Partial<Pose>;
  dims: Dims;
  /** 1-5 bars for the select screen. */
  rating: { power: number; speed: number; defense: number; range: number; difficulty: number };
  introQuote: string;
  winQuotes: [string, string, string];
  rival: FighterId;
  /** Victory quote used when beating the rival. */
  rivalQuote: string;
}

export const ROSTER: Record<FighterId, FighterDef> = {
  daumen: {
    id: 'daumen', name: 'DAUMEN', archetype: 'PRESSURE / CHAOS', special: 'YAP STORM', superName: 'YAP TSUNAMI',
    description: 'Fast hands, faster mouth. Smothers you up close and never stops moving.',
    color: '#ff3b3b', hp: 960, walk: 2.35, backWalk: 1.8, dash: 7.2, jumpV: 7.6, airVx: 2.7, gravity: 0.38,
    speed: 0.86, power: 0.95, heavy: 'haymaker',
    stance: { lean: 0.05, fh: [0.6, 0.0], bh: [0.2, -0.2] },
    dims: { thigh: 10, shin: 11, upperArm: 11, foreArm: 11, torso: 22, neck: 2, headR: 14, chestW: 28, waistW: 26, armW: 8, legW: 6, footLen: 10 },
    rating: { power: 3, speed: 5, defense: 2, range: 2, difficulty: 3 },
    introQuote: 'GM GM GM. LET ME COOK.',
    winQuotes: ['GM. YOU GOT YAPPED.', 'I TALKED THE WHOLE TIME. YOU STILL LOST.', 'SKILL ISSUE. I SAID IT FIRST.'],
    rival: 'pepe',
    rivalQuote: 'SALT DOES NOT STICK TO DUCKS.',
  },
  chairman: {
    id: 'chairman', name: 'CHAIRMAN', archetype: 'TRICKSTER / TRAP', special: 'BEAR TRAP', superName: 'CANDLE CASCADE',
    description: 'Vanishes, lashes from range and plants red candles where you step next.',
    color: '#2f8bff', hp: 950, walk: 1.8, backWalk: 1.7, dash: 6.0, jumpV: 7.4, airVx: 2.4, gravity: 0.36,
    speed: 1.0, power: 0.95, heavy: 'haymaker', heavyReach: 20,
    stance: { lean: 0.02, fh: [0.65, 0.05], bh: [0.15, -0.25] },
    dims: { thigh: 21, shin: 22, upperArm: 16, foreArm: 17, torso: 28, neck: 4, headR: 10, chestW: 19, waistW: 14, armW: 6, legW: 7, footLen: 10 },
    rating: { power: 3, speed: 3, defense: 3, range: 5, difficulty: 5 },
    introQuote: 'THE MEETING IS NOW IN SESSION.',
    winQuotes: ['THE CHAIRMAN DOES NOT LOSE. HE REBALANCES.', 'YOU STEPPED ON A RED CANDLE.', 'MEETING ADJOURNED.'],
    rival: 'buddha',
    rivalQuote: 'YOUR THIRD EYE NEVER SAW THE CANDLE.',
  },
  cate: {
    id: 'cate', name: 'CATE', archetype: 'RUSHDOWN', special: 'NINE LIVES POUNCE', superName: 'NINE LIVES FRENZY',
    description: 'Gets in your face and never leaves. Weak at range, terrifying up close.',
    color: '#c23bff', hp: 950, walk: 2.5, backWalk: 2.0, dash: 7.5, jumpV: 8.2, airVx: 3.1, gravity: 0.4,
    speed: 0.86, power: 1.08, heavy: 'kick',
    stance: { lean: 0.25, hy: -0.12, fh: [0.65, 0.2], bh: [0.45, 0.25] },
    dims: { thigh: 11, shin: 12, upperArm: 10, foreArm: 11, torso: 17, neck: 2, headR: 15, chestW: 17, waistW: 14, armW: 6, legW: 7, footLen: 8 },
    rating: { power: 2, speed: 5, defense: 2, range: 3, difficulty: 2 },
    introQuote: 'NYA. YOU ARE IN MY SPACE NOW.',
    winQuotes: ['NINE LIVES. YOU HAD ONE.', 'TOO CLOSE? THAT IS THE POINT.', 'PURR-FECT ENTRY.'],
    rival: 'doge',
    rivalQuote: 'DOGS HAD THEIR CYCLE. IT IS CAT SEASON.',
  },
  doge: {
    id: 'doge', name: 'DOGE', archetype: 'FUNDAMENTALS / POWER', special: 'SHIBA SLAP', superName: 'MUCH SLAP',
    description: 'Straightforward, hits hard, easy to learn. The best first main.',
    color: '#ffb02e', hp: 980, walk: 2.0, backWalk: 1.7, dash: 6.3, jumpV: 7.4, airVx: 2.5, gravity: 0.38,
    speed: 1.0, power: 0.96, heavy: 'haymaker',
    dims: { thigh: 21, shin: 21, upperArm: 17, foreArm: 18, torso: 32, neck: 5, headR: 15, chestW: 30, waistW: 21, armW: 10, legW: 11, footLen: 11 },
    rating: { power: 4, speed: 3, defense: 4, range: 3, difficulty: 1 },
    introQuote: 'WOW. SUCH ARENA.',
    winQuotes: ['WOW. MUCH WIN. SUCH HANDS.', 'VERY FUNDAMENTALS. MANY BASICS.', 'STILL THE OG.'],
    rival: 'cate',
    rivalQuote: 'CATS ARE JUST DOGS WITH PAPER HANDS.',
  },
  pepe: {
    id: 'pepe', name: 'PEPE', archetype: 'WILDCARD / STATUS', special: 'SALT SPLASH', superName: 'MAXIMUM SALT',
    description: 'Weird timing, salty debuffs, unpredictable projectiles. It works. Nobody knows why.',
    color: '#3ddc4a', hp: 1100, walk: 2.1, backWalk: 1.7, dash: 6.5, jumpV: 7.8, airVx: 2.6, gravity: 0.38,
    speed: 0.95, power: 1.15, heavy: 'kick',
    stance: { lean: 0.18, fh: [0.5, 0.05], bh: [0.3, 0.1] },
    dims: { thigh: 20, shin: 21, upperArm: 16, foreArm: 16, torso: 27, neck: 3, headR: 13, chestW: 23, waistW: 19, armW: 8, legW: 9, footLen: 11 },
    rating: { power: 3, speed: 3, defense: 3, range: 4, difficulty: 3 },
    introQuote: 'FEELS SALTY MAN.',
    winQuotes: ['FEELS GOOD MAN.', 'NOBODY KNOWS HOW. NOT EVEN ME.', 'STAY SALTY.'],
    rival: 'daumen',
    rivalQuote: 'QUACK QUACK. COPE.',
  },
  orangie: {
    id: 'orangie', name: 'ORANGIE', archetype: 'CONTROL / ZONER', special: 'ICEBERG SWEEP', superName: 'GLACIER CALL',
    description: 'Controls the battlefield using ice and spacing tools.',
    color: '#ff8a1e', hp: 1040, walk: 1.8, backWalk: 1.6, dash: 6.0, jumpV: 7.2, airVx: 2.4, gravity: 0.38,
    speed: 1.0, power: 1.08, heavy: 'slam',
    stance: { lean: 0.05, fh: [0.45, -0.3], bh: [0.0, -0.45] },
    dims: { thigh: 9, shin: 9, upperArm: 11, foreArm: 10, torso: 26, neck: 0, headR: 14, chestW: 30, waistW: 28, armW: 7, legW: 7, footLen: 11 },
    rating: { power: 3, speed: 3, defense: 4, range: 4, difficulty: 4 },
    introQuote: 'I ALREADY READ THIS CHART.',
    winQuotes: ['CALLED IT. AS ALWAYS.', 'YOU PLAYED ON MY ICE.', 'TEXTBOOK SETUP.'],
    rival: 'decu',
    rivalQuote: 'FAST IS NOT THE SAME AS RIGHT.',
  },
  buddha: {
    id: 'buddha', name: 'BUDDHA', archetype: 'COUNTER / TANK', special: 'THIRD EYE COUNTER', superName: 'NIRVANA PALM',
    description: 'Waits, absorbs, and punishes. Attack at the wrong moment and meet the third eye.',
    color: '#ff7a2e', hp: 1200, walk: 1.65, backWalk: 1.4, dash: 5.5, jumpV: 7.0, airVx: 2.2, gravity: 0.36,
    speed: 1.1, power: 1.1, heavy: 'palm',
    stance: { lean: -0.02, fh: [0.45, 0.3], bh: [0.3, -0.05] },
    dims: { thigh: 24, shin: 24, upperArm: 19, foreArm: 19, torso: 35, neck: 5, headR: 12, chestW: 29, waistW: 23, armW: 10, legW: 11, footLen: 11 },
    rating: { power: 5, speed: 1, defense: 5, range: 3, difficulty: 4 },
    introQuote: 'BREATHE IN. HOLD.',
    winQuotes: ['PATIENCE IS THE ONLY ALPHA.', 'YOU ATTACKED. I ANSWERED.', 'THE THIRD EYE SAW YOU COMING.'],
    rival: 'chairman',
    rivalQuote: 'NO CANDLE BURNS FOREVER.',
  },
  decu: {
    id: 'decu', name: 'DECU', archetype: 'SPEED / ASSASSIN', special: 'LIGHTNING STEP', superName: 'THUNDER GOD STEP',
    description: 'Extreme speed and burst damage on a glass body. Punishes every whiff.',
    color: '#8b5bff', hp: 820, walk: 2.55, backWalk: 2.2, dash: 8.0, jumpV: 8.4, airVx: 3.2, gravity: 0.42,
    speed: 0.9, power: 0.82, heavy: 'kick',
    stance: { lean: 0.3, hy: -0.14, fh: [0.6, -0.1], bh: [-0.3, -0.2] },
    dims: { thigh: 21, shin: 22, upperArm: 17, foreArm: 17, torso: 27, neck: 4, headR: 11, chestW: 20, waistW: 15, armW: 7, legW: 8, footLen: 10 },
    rating: { power: 2, speed: 5, defense: 1, range: 3, difficulty: 4 },
    introQuote: 'BLINK AND YOU ARE LIQUIDATED.',
    winQuotes: ['TOO SLOW. NEXT.', 'YOU WERE STILL LOADING.', 'FIRST BLOCK. LAST HIT.'],
    rival: 'orangie',
    rivalQuote: 'ICE MELTS. LIGHTNING DOES NOT WAIT.',
  },
};

export const KO_LINES = ['LIQUIDATED', 'JEETED', 'ROUNDTRIPPED', 'EXIT LIQUIDITY', 'REKT', 'PAPER HANDS'];
export const WIN_LINES = ['STILL HOLDING', 'DIAMOND HANDS', 'SEND IT', 'FULL PORT', 'WAGMI'];
