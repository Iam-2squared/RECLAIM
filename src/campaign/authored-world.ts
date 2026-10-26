import { CAMPAIGN_KEY, CampaignStore, type AreaCampaignRule, type CampaignStorage } from './index.ts';
import { AUTHORED_MAP_META as map } from '../world/authored-map-meta.ts';

export const AUTHORED_CAMPAIGN_KEY=`reclaim.campaign.${map.worldId}.v1`;
export const AUTHORED_CAMPAIGN_RULE:AreaCampaignRule=Object.freeze({
 bounds:map.bounds,spawn:map.spawn,exit:map.exit,
 checkpoints:[map.checkpoint],minimumTravel:800,minY:-100,maxY:600,
 opening:{cabin:map.cabin,radio:map.radio,door:map.door,leaveRadius:18},
});

/** A new coordinate system gets its own save. Earlier map saves remain intact. */
export function authoredCampaignStore(storage:CampaignStorage|null):CampaignStore {
 const scoped=storage?{
  getItem:(key:string)=>storage.getItem(key===CAMPAIGN_KEY?AUTHORED_CAMPAIGN_KEY:key),
  setItem:(key:string,value:string)=>storage.setItem(key===CAMPAIGN_KEY?AUTHORED_CAMPAIGN_KEY:key,value),
 }:null;
 return new CampaignStore(scoped,{shiretoko:AUTHORED_CAMPAIGN_RULE});
}
