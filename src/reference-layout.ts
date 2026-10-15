/** Pixel positions measured on the two owner-supplied 1536 x 864 references. */
export const REFERENCE_SIZE = { width: 1536, height: 864 } as const;
export const REFERENCE_QUERY = '(min-width: 960px) and (min-height: 441px)';
export const REFERENCE_RECTS = {
  titleLogo: [424, 345, 681, 107],
  titleStart: [578, 520, 379, 39],
  titleContinue: [578, 560, 379, 41],
  titleSettings: [578, 602, 379, 40],
  titleExtras: [578, 644, 379, 41],
  titleSound: [1255, 33, 114, 36],
  titleMotion: [1377, 33, 110, 36],
  homeBack: [40, 27, 419, 100],
  homeMap: [60, 307, 297, 50],
  homeCharacter: [60, 357, 297, 51],
  homeWeapons: [60, 408, 297, 51],
  homeBoss: [60, 459, 297, 51],
  homeRanking: [60, 510, 297, 53],
  homeSolo: [1161, 43, 138, 40],
  homeSquad: [1299, 43, 132, 40],
  homeSettings: [1437, 13, 30, 30],
  homeMail: [1479, 14, 30, 28],
  homeEquipment: [40, 640, 450, 177],
  homeDestination: [1073, 572, 424, 120],
  homeStart: [1073, 701, 424, 117],
} as const;
export type ReferenceRect = keyof typeof REFERENCE_RECTS;
export function referencePercent(id: ReferenceRect) {
  const [x,y,width,height] = REFERENCE_RECTS[id];
  return { left: x / REFERENCE_SIZE.width * 100, top: y / REFERENCE_SIZE.height * 100,
    width: width / REFERENCE_SIZE.width * 100, height: height / REFERENCE_SIZE.height * 100 };
}
