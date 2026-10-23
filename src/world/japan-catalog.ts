/**
 * Region-wide address book for future Japan exploration work.
 * Names, JIS prefecture codes and region grouping are identifiers only;
 * no map coordinates, surveying accuracy, unlocked progress or playable
 * terrain are implied by presence in this catalog.
 */
import type { AreaId } from './types.ts';

export const JAPAN_REGIONS = [
  'hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu', 'okinawa',
] as const;
export type JapanRegion = typeof JAPAN_REGIONS[number];
export type PrefectureStage = 'catalog-only' | 'terrain-prototype' | 'explorable' | 'polished';
export type PrefectureRecord = Readonly<{
  code: string;
  nameJa: string;
  region: JapanRegion;
  stage: PrefectureStage;
  /** Existing LOCAL demo cells only. Never used for unlocking the campaign. */
  prototypeAreaIds: readonly AreaId[];
}>;

const source: readonly (readonly [string, JapanRegion])[] = [
  ['北海道','hokkaido'],
  ['青森県','tohoku'],['岩手県','tohoku'],['宮城県','tohoku'],['秋田県','tohoku'],['山形県','tohoku'],['福島県','tohoku'],
  ['茨城県','kanto'],['栃木県','kanto'],['群馬県','kanto'],['埼玉県','kanto'],['千葉県','kanto'],['東京都','kanto'],['神奈川県','kanto'],
  ['新潟県','chubu'],['富山県','chubu'],['石川県','chubu'],['福井県','chubu'],['山梨県','chubu'],['長野県','chubu'],['岐阜県','chubu'],['静岡県','chubu'],['愛知県','chubu'],
  ['三重県','kinki'],['滋賀県','kinki'],['京都府','kinki'],['大阪府','kinki'],['兵庫県','kinki'],['奈良県','kinki'],['和歌山県','kinki'],
  ['鳥取県','chugoku'],['島根県','chugoku'],['岡山県','chugoku'],['広島県','chugoku'],['山口県','chugoku'],
  ['徳島県','shikoku'],['香川県','shikoku'],['愛媛県','shikoku'],['高知県','shikoku'],
  ['福岡県','kyushu'],['佐賀県','kyushu'],['長崎県','kyushu'],['熊本県','kyushu'],['大分県','kyushu'],['宮崎県','kyushu'],['鹿児島県','kyushu'],
  ['沖縄県','okinawa'],
];

/** A local four-area prototype exists within Hokkaido, NOT across Hokkaido. */
const hokkaidoDemos = Object.freeze(['shiretoko','ishikari-mountains','hidaka-mountains','sapporo'] as const satisfies readonly AreaId[]);
const none: readonly AreaId[] = Object.freeze([]);
export const JAPAN_PREFECTURES: readonly PrefectureRecord[] = Object.freeze(source.map(([nameJa,region],i) => Object.freeze({
  code: String(i+1).padStart(2,'0'), nameJa, region,
  stage: 'catalog-only' as const,
  prototypeAreaIds: region === 'hokkaido' ? hokkaidoDemos : none,
})));
const index: ReadonlyMap<string,PrefectureRecord> = new Map(JAPAN_PREFECTURES.map(p=>[p.code,p]));

export function prefectureByCode(code: string): PrefectureRecord | undefined { return index.get(code); }
export function prefecturesIn(region: JapanRegion): readonly PrefectureRecord[] {
  return JAPAN_PREFECTURES.filter(p=>p.region===region);
}
/** An explicit area count; catalog records must never be mistaken for playable content. */
export function catalogCoverage(): Readonly<{ catalogued: number; withLocalPrototype: number; terrainPrototypes: number; explorable: number; polished: number }> {
  return Object.freeze({
    catalogued: JAPAN_PREFECTURES.length,
    withLocalPrototype: JAPAN_PREFECTURES.filter(p=>p.prototypeAreaIds.length>0).length,
    terrainPrototypes: JAPAN_PREFECTURES.filter(p=>p.stage==='terrain-prototype').length,
    explorable: JAPAN_PREFECTURES.filter(p=>p.stage==='explorable').length,
    polished: JAPAN_PREFECTURES.filter(p=>p.stage==='polished').length,
  });
}
/** Static invariants that future terrain/streaming stages must continue to satisfy. */
export function validateJapanCatalog(): readonly string[] {
  const errors: string[]=[];
  if(JAPAN_PREFECTURES.length!==47)errors.push('prefecture count is not 47');
  if(new Set(JAPAN_PREFECTURES.map(p=>p.code)).size!==47)errors.push('duplicate prefecture code');
  if(new Set(JAPAN_PREFECTURES.map(p=>p.nameJa)).size!==47)errors.push('duplicate prefecture name');
  if(JAPAN_REGIONS.some(r=>prefecturesIn(r).length===0))errors.push('missing region');
  for(const [i,p] of JAPAN_PREFECTURES.entries()) {
    if(p.code!==String(i+1).padStart(2,'0'))errors.push("noncanonical code at "+i);
    if(!JAPAN_REGIONS.includes(p.region))errors.push("unknown region "+p.code);
    if(p.prototypeAreaIds.length&&p.code!=='01')errors.push("unsupported demo linkage "+p.code);
  }
  return errors;
}
