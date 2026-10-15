import { isAreaUnlocked, visibleAreas, type Campaign, type AreaId } from './campaign/index.ts';

export type HomeViewMode = 'cinematic' | 'model';
export const HOME_ART_IDS = ['shiretoko', 'ishikari-mountains', 'hidaka-mountains'] as const;
export type HomeArtId = typeof HOME_ART_IDS[number];

/** Viewing art is not a completion event and does not write campaign progress. */
export function selectHomeArea(campaign: Campaign, current: AreaId, requested: string): AreaId {
  const safe = isAreaUnlocked(campaign, current) ? current : 'shiretoko';
  return visibleAreas(campaign).some(a => a.id === requested) ? requested as AreaId : safe;
}
export function homeArtId(area: AreaId): HomeArtId | null {
  return HOME_ART_IDS.includes(area as HomeArtId) ? area as HomeArtId : null;
}
export function normalizeHomeView(requested: string, webglAvailable: boolean): HomeViewMode {
  return requested === 'model' && webglAvailable ? 'model' : 'cinematic';
}
