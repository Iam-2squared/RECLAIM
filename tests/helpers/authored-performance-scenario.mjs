import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createAuthoredMapPhysics} from '../../src/world/authored-map-physics.ts';
import {createAuthoredHorde} from '../../src/mission/horde-director.ts';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function authoredScenarioData(){
 const html=await readFile(new URL('../../public/home-map/shiretoko.html',import.meta.url),'utf8');
 const encoded=html.match(/const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;/);
 if(!encoded)throw Error('Missing actual authored map');
 return JSON.parse(gunzipSync(Buffer.from(JSON.parse(encoded[1]),'base64')).toString('utf8'));
}
export function physicsScenario(data){
 const started=performance.now(),physics=createAuthoredMapPhysics(data),createdMs=performance.now()-started,points=[];
 for(const y of [undefined,81.9,86.1])for(let x=-182;x<=-156;x+=2)for(let z=592;z<=614;z+=1.5)points.push([x,z,y]);
 for(let index=0;index<data.trail.path.length;index+=19){const [x,y,z]=data.trail.path[index];for(const offset of [-.31,0,.31])points.push([x+offset,-y,z]);}
 for(let x=-211;x<=-170;x+=2.5)for(let z=-108;z<=-77;z+=2.5)points.push([x,z,110.24]);
 for(const p of [[25,-195],[-177,599,86.1],[15,-628.9,270],[-400,600],[-169,597,NaN]])points.push(p);
 const measured=performance.now(),results=[];
 for(const [x,z,reference]of points){const height=physics.heightAt(x,z,reference);results.push([height,physics.slopeAt(x,z,reference),physics.inWater(x,z,reference),physics.isWalkable(x,z,reference),physics.blockedAt(x,z,height)]);}
 return{digest:digest(results),samples:points.length,createdMs,queryMs:performance.now()-measured,stats:physics.stats};
}
export function hordeScenario(data){
 const physics=createAuthoredMapPhysics(data),started=performance.now(),horde=createAuthoredHorde(data,physics),createdMs=performance.now()-started,snapshots=[horde.snapshot()],times=[5,10,30,60,120,180,240],player={...physics.spawn};
 const measured=performance.now();let previous=0;
 for(const at of times){horde.step(at-previous,player,{combatEnabled:false});snapshots.push(horde.snapshot());previous=at;}
 return{digest:digest(snapshots),createdMs,simulationMs:performance.now()-measured,spawned:horde.spawned,elapsed:horde.elapsed,roadLength:horde.road.length,warehouseLength:{human:horde.warehouseRoad.humanoid.length,drone:horde.warehouseRoad.drone.length}};
}
