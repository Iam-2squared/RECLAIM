import assault from './ui-weapons/assault.webp?inline';
import sniper from './ui-weapons/sniper.webp?inline';
import knife from './ui-weapons/knife.webp?inline';

/** Supplied weapon renders, embedded so HOME's standalone HTML stays offline. */
export const WEAPON_PREVIEWS = { assault, sniper, knife } as const;
