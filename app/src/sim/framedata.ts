import type { Fighter } from './match';
import type { MoveDef, MoveSlot } from './moves';

export interface FrameRow {
  name: string;
  startup: number;
  active: number;
  recovery: number;
  damage: string;
  onHit: string;
  onBlock: string;
  meter: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function moveName(f: Fighter, slot: MoveSlot) {
  const names: Partial<Record<MoveSlot, string>> = {
    light: 'LIGHT', heavy: 'HEAVY', clight: 'CR. LIGHT', cheavy: 'CR. HEAVY', alight: 'JUMP LIGHT', aheavy: 'JUMP HEAVY',
    throw: 'THROW', throwHold: 'THROW', special: f.def.special, super: f.def.superName, counterStrike: 'THIRD EYE STRIKE',
  };
  return names[slot] ?? slot.toUpperCase();
}

/**
 * Static frame data from the move table. Advantage is stun minus what the
 * attacker still has left after the first active frame; launches/knockdowns
 * read KD. Projectile specials have no melee hitbox, so their advantage is "-".
 */
export function frameRow(f: Fighter, mv: MoveDef): FrameRow {
  const hit = mv.hit;
  const remaining = mv.active - 1 + mv.recovery;
  const hits = mv.hits ?? 1;
  return {
    name: moveName(f, mv.slot),
    startup: mv.startup,
    active: mv.active,
    recovery: mv.recovery,
    damage: hit ? (hits > 1 ? `${hit.damage}x${hits}` : String(hit.damage)) : '-',
    onHit: !hit || !mv.box ? '-' : hit.launch || hit.knockdown ? 'KD' : signed(hit.hitstun - remaining),
    onBlock: !hit || !mv.box ? '-' : signed(hit.blockstun - remaining),
    meter: mv.slot === 'super' ? '-100' : hit ? `+${hit.heavy ? 8 : 5} / +2` : '-',
  };
}
