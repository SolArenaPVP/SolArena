import { FIGHTER_IDS, type FighterId } from './sim/roster';

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export interface Art {
  cards: Record<FighterId, HTMLImageElement>;
  heads: Record<FighterId, HTMLImageElement>;
  logo: HTMLImageElement;
}

export let art: Art;

export async function loadArt() {
  const base = import.meta.env.BASE_URL;
  const cards = await Promise.all(FIGHTER_IDS.map((id) => load(`${base}art/card-${id}.png`)));
  const heads = await Promise.all(FIGHTER_IDS.map((id) => load(`${base}art/head-${id}.png`)));
  art = {
    cards: Object.fromEntries(FIGHTER_IDS.map((id, i) => [id, cards[i]])) as Record<FighterId, HTMLImageElement>,
    heads: Object.fromEntries(FIGHTER_IDS.map((id, i) => [id, heads[i]])) as Record<FighterId, HTMLImageElement>,
    logo: await load(`${base}art/logo.png`),
  };
}
