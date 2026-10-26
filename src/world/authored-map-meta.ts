/** Small boot metadata for the authored, metre-scale Shiretoko world.
 * Blender (x,y,z) maps to Three (x,z,-y). Campaign saves use this world's own namespace.
 */
export const AUTHORED_MAP_META = Object.freeze({
  worldId: 'shiretoko-authored-20261026',
  revision: 'd83fee5592d9bebee08c766a95dce2bb23240860c440dac30f9a02afc86a1764',
  bounds: {minX:-388.25787353515625,maxX:431.47998046875,minZ:-628.75,maxZ:728.8173828125},
  // The front entrance hall, seven metres in front of the house centre.
  spawn: {x:-169,y:81.9,z:597,yaw:0},
  sourceSpawn: {x:-169,y:81.37,z:587.4,yaw:0},
  cabin: {minX:-181,maxX:-157,minZ:595,maxZ:613,floorY:81.9,upperFloorY:86.1},
  houseCenter: {x:-169,y:81.25,z:604},
  // A visible runtime radio is placed beside the entrance hall's west wall.
  radio: {x:-170.9,y:82.8,z:597.2,radius:2.4},
  door: {x:-169,y:81.9,z:591.5,radius:3},
  drone: {x:-168.717,y:80.9134,z:549.9517,radius:12},
  checkpoint: {id:'trail-checkpoint',x:-156.281,y:107.7205,z:-179.9596,radius:7},
  exit: {id:'shiretoko-exit',x:15.67973,y:270.35992,z:-628.72534,radius:7},
  warehouse: {x:-190,y:110.2,z:-95},
  boundary: {minZ:-628.75,warningZ:-550,fogZ:-570},
});
