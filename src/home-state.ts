/** Device-only visual preferences. Never inventory, campaign progress or party authority. */
export const HOME_KEY = 'reclaim.home-preview.v1';
export const MAX_NAME = 16;
export const PALETTES = [
  { id: 'olive', name: 'オリーブ', color: '#757b58', armor: '#3d443b', note: '森に馴染む、使い込まれた装備。' },
  { id: 'slate', name: 'スレート', color: '#65737b', armor: '#343d46', note: '曇天に溶ける、青みのある灰色。' },
  { id: 'clay', name: 'クレイ', color: '#97755e', armor: '#51463c', note: '土と錆を思わせる、乾いた色。' },
] as const;
export type PaletteId = typeof PALETTES[number]['id'];
export const GUNS = [
  { id: 'assault', name: 'アサルト', code: 'AR / 01', description: '箱形の機関部と短いハンドガード。' },
  { id: 'sniper', name: 'スナイパー', code: 'SR / 02', description: '長い銃身と光学スコープを備えた形状。' },
  { id: 'rifle', name: '小銃', code: 'RF / 03', description: '木製ストックの軽量な銃。分類は設計上の仮置き。' },
] as const;
export type GunId = typeof GUNS[number]['id'];
export type Appearance = { name: string; palette: PaletteId };
export type HomePreview = { version: 1; appearance: Appearance; primary: GunId; secondary: GunId; held: 'primary' | 'secondary' };
export const defaults = (): HomePreview => ({ version: 1, appearance: { name: 'SURVIVOR', palette: 'olive' }, primary: 'assault', secondary: 'sniper', held: 'primary' });
export const gunName = (id: GunId) => GUNS.find(g => g.id === id)!.name;
export function normalizeName(name: string): string {
  return Array.from(name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()).slice(0, MAX_NAME).join('') || 'SURVIVOR';
}
export function parseHome(raw: string | null): HomePreview {
  const d = defaults();
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || v.version !== 1) return d;
    if (v.appearance && typeof v.appearance === 'object') {
      if (typeof v.appearance.name === 'string') d.appearance.name = normalizeName(v.appearance.name);
      if (PALETTES.some(p => p.id === v.appearance.palette)) d.appearance.palette = v.appearance.palette;
    }
    if (GUNS.some(g => g.id === v.primary)) d.primary = v.primary;
    if (GUNS.some(g => g.id === v.secondary) && v.secondary !== d.primary) d.secondary = v.secondary;
    else d.secondary = GUNS.find(g => g.id !== d.primary)!.id;
    if (v.held === 'secondary') d.held = 'secondary';
    return d;
  } catch { return d; }
}
/** Choosing the other slot's gun swaps the pair, preserving two distinct guns. */
export function chooseGun(preview: HomePreview, slot: 'primary' | 'secondary', id: GunId): HomePreview {
  const other = slot === 'primary' ? 'secondary' : 'primary';
  return { ...preview, [slot]: id, [other]: preview[other] === id ? preview[slot] : preview[other] };
}
export const RARITIES = ['コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー', 'ディビィアン'] as const;
// Positions are an original schematic, not geographic survey data. Two Tokyo stops are intentional.
export const ROUTE = [
  ['shiretoko', '知床', 299, 56, '奪還の旅の出発点。北の仮拠点で、最初の出撃を準備する。'],
  ['sapporo', '札幌', 254, 82, '北海道を南下する旅の予定地。'],
  ['hakodate', '函館', 236, 112, '海峡へ向かう、日本縦断の予定地。'],
  ['aomori', '青森', 235, 141, '本州に渡った先の予定地。'],
  ['yamagata', '山形', 217, 176, '東北を進む旅の予定地。'],
  ['miyagi', '宮城', 242, 191, '太平洋側へ向かう予定地。'],
  ['niigata', '新潟', 202, 207, '日本海側をたどる予定地。'],
  ['gunma', '群馬', 213, 239, '関東へ進む予定地。'],
  ['saitama', '埼玉', 235, 253, '東京へ続く旅の予定地。'],
  ['tokyo-first', '東京［初回：撤退］', 251, 274, '最初の東京到達。物語では撤退を経て、旅が続く予定。'],
  ['kanagawa', '神奈川', 232, 294, '東京を離れ、西へ向かう予定地。'],
  ['yamanashi', '山梨［富士］', 207, 277, '富士を望む、旅の予定地。'],
  ['shizuoka', '静岡', 191, 299, '東海道を進む予定地。'],
  ['aichi', '愛知［豊田・名古屋］', 160, 295, '豊田・名古屋を経由する予定地。'],
  ['shiga', '滋賀［琵琶湖］', 130, 280, '琵琶湖をたどる予定地。'],
  ['kyoto', '京都', 106, 284, '古都を進む予定地。'],
  ['osaka', '大阪', 95, 308, '西日本の旅の予定地。'],
  ['tokyo-return', '東京［再突入］', 277, 265, 'ヘリで東京に再突入する、日本編最後の予定ルート。'],
] as const;
