/** Camera framing for opt-in Shiretoko nature review links only.
 * The unmodified baseline URL returns null, leaving its intro and view intact.
 * Coordinates are metres in the standalone 2400m terrain, not campaign saves.
 */
export type NatureReviewFocus = Readonly<{
  kind: 'cabin' | 'boardwalk' | 'flora' | 'highland';
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  title: string;
  description: string;
}>;

export function natureReviewFocus(
  query: URLSearchParams, terrainHeightAt: (x: number, z: number) => number,
): NatureReviewFocus | null {
  const on = (name: string) => ['1', 'true', 'on'].includes(query.get(name) ?? '');
  // Match the exact opt-in parameters that create visible content in preview.ts.
  const floraOn = ['1', 'low', 'balanced'].includes(query.get('flora') ?? '');
  const kind = on('cabin') ? 'cabin'
    : on('boardwalk') ? 'boardwalk'
    : floraOn && on('highland') ? 'highland'
    : floraOn ? 'flora' : null;
  if (!kind) return null;
  // Choose camera sites above their actual subjects; an old coastal camera
  // was 80m below the cliff house, making OrbitControls clamp the opening.
  const positions = {
    cabin: {from: [-60, 820, 12], to: [-100, 835, 2],
      title: '崖上の家を見つける。', description: '室内と階段のある住宅。視点を回し、木道へ向かえます。'},
    boardwalk: {from: [-50, 610, 10], to: [-118, 500, 2],
      title: '湿原の木道を辿る。', description: '地形から浮いた木道をたどり、湿原と森林を観察します。'},
    flora: {from: [-130, 410, 15], to: [-210, 370, 2],
      title: '森と低湿地を歩く。', description: '低負荷・標準密度の植生と、地形に沿う草木を比較します。'},
    highland: {from: [145, -810, 35], to: [170, -850, 2],
      title: '高原の低木を歩く。', description: '高原の不規則な低木・岩石帯を、実際の山岳地点から徒歩で観察します。'},
  } as const;
  const spec = positions[kind];
  const makePoint = ([x, z, lift]: readonly [number, number, number]) =>
    [x, terrainHeightAt(x, z) + lift, z] as const;
  return Object.freeze({kind, position: makePoint(spec.from), target: makePoint(spec.to),
    title: spec.title, description: spec.description});
}
