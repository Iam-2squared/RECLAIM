/** Town/area artwork can be assigned here without changing lobby layout or saves. */
export const HOME_BACKDROPS = {
  shiretoko: { name:'知床', code:'HOKKAIDO / SHIRETOKO', news:'知床 / 北の仮拠点', sky:'#173b70', deep:'#07162e', image:null as string|null },
  'ishikari-mountains': { name:'石狩山地', code:'HOKKAIDO / ISHIKARI', news:'石狩山地 / 山間の仮拠点', sky:'#274b73', deep:'#101e32', image:null as string|null },
  'hidaka-mountains': { name:'日高山脈', code:'HOKKAIDO / HIDAKA', news:'日高山脈 / 稜線の仮拠点', sky:'#22435f', deep:'#0d1a2d', image:null as string|null },
  sapporo: { name:'札幌', code:'HOKKAIDO / SAPPORO', news:'札幌 / 市街地の仮拠点', sky:'#22355f', deep:'#10172f', image:null as string|null },
} as const;
export type HomeRegion = keyof typeof HOME_BACKDROPS;
export function homeBackdrop(area:string) {
  return HOME_BACKDROPS[area as HomeRegion] ?? HOME_BACKDROPS.shiretoko;
}
