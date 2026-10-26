import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authoredCampaignStore,AUTHORED_CAMPAIGN_KEY} from '../src/campaign/authored-world.ts';
import {CAMPAIGN_KEY} from '../src/campaign/index.ts';
import {AUTHORED_MAP_META as map} from '../src/world/authored-map-meta.ts';

test('new map saves preserve the earlier coordinate-system save and use actual house story locations',()=>{
 const previous='previous map save remains intact',items=new Map([[CAMPAIGN_KEY,previous]]);
 const storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)};
 const store=authoredCampaignStore(storage),p={x:map.spawn.x,y:map.spawn.y,z:map.spawn.z};
 assert.equal(store.value.checkpoint,null);assert.equal(store.beginSession('shiretoko',false),true);
 assert.equal(store.record({type:'position',areaId:'shiretoko',position:p,grounded:true}),true);
 for(const step of ['wake','radio','friend-contact'])assert.equal(store.record({type:'opening',step,areaId:'shiretoko',position:p,grounded:true}),true);
 assert.equal(store.value.introStep,3);
 assert.equal(store.record({type:'opening',step:'leave-cabin',areaId:'shiretoko',position:p,grounded:true}),false);
 const outside={...p,z:map.cabin.minZ-1};
 assert.equal(store.record({type:'position',areaId:'shiretoko',position:outside,grounded:true}),true);
 assert.equal(store.record({type:'opening',step:'leave-cabin',areaId:'shiretoko',position:outside,grounded:true}),true);
 assert.equal(store.checkpoint({areaId:'shiretoko',...outside,yaw:0,pitch:0,hp:100}),true);
 assert.equal(items.get(CAMPAIGN_KEY),previous);assert.ok(items.has(AUTHORED_CAMPAIGN_KEY));
 const restored=authoredCampaignStore(storage);assert.equal(restored.value.introStep,4);assert.equal(restored.value.checkpoint.z,outside.z);
 assert.equal(restored.reset(true),true);assert.equal(items.get(CAMPAIGN_KEY),previous);
});
