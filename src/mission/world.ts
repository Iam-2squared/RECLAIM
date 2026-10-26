import type * as T from 'three';
import type { AreaDefinition, Collider, WorldQuality } from '../world/types.ts';
import type { WalkingTerrain } from './controller.ts';
import type { AuthoredMapPhysicsData } from '../world/authored-map-physics.ts';

/** Shared gameplay contract for procedural fixtures and the supplied authored map. */
export interface MissionWorld {
 readonly scene:T.Scene;
 readonly area:Omit<AreaDefinition,'spawn'>&{spawn:{x:number;y?:number;z:number;yaw:number}};
 readonly terrain:WalkingTerrain&{inWater:(x:number,z:number,referenceY?:number)=>boolean};
 readonly colliders:readonly Collider[];
 readonly worldId?:string;
 readonly data?:AuthoredMapPhysicsData;
 combatColliders?(x:number,z:number):readonly Collider[];
 update(x:number,z:number):void;
 setQuality(quality:WorldQuality):void;
 stats():unknown;
 dispose():void;
}
