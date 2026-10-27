import type * as T from 'three';
import type { AreaDefinition, Collider, WorldQuality } from '../world/types.ts';
import type { WalkingTerrain } from './controller.ts';
import type { AuthoredMapPhysicsData } from '../world/authored-map-physics.ts';
import type { SAPPORO_MAP_META } from '../world/sapporo-map-meta.ts';
import type { ShiretokoEncounterLayout } from '../world/shiretoko-encounter-layout.ts';

/** Shared gameplay contract for procedural fixtures and the supplied authored map. */
export interface MissionWorld {
 readonly scene:T.Scene;
 readonly area:Omit<AreaDefinition,'spawn'>&{spawn:{x:number;y?:number;z:number;yaw:number}};
 readonly terrain:WalkingTerrain&{inWater:(x:number,z:number,referenceY?:number)=>boolean};
 readonly colliders:readonly Collider[];
 readonly worldId?:string;
 readonly data?:AuthoredMapPhysicsData;
 readonly encounterLayout?:ShiretokoEncounterLayout;
 readonly sapporoLayout?:typeof SAPPORO_MAP_META;
 setPhase?(phase:number):void;
 routeStats?():unknown;
 combatColliders?(x:number,z:number):readonly Collider[];
 sightColliders?(x:number,z:number):readonly Collider[];
 update(x:number,z:number):void;
 setQuality(quality:WorldQuality):void;
 stats():unknown;
 dispose():void;
}
