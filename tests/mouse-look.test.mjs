import test from 'node:test';
import assert from 'node:assert/strict';
import { FreeMouseLook } from '../src/mission/mouse-look.ts';

const bounds={left:40,top:20,width:800,height:600};
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const zero={dx:0,dy:0};

test('client motion looks around without a mouse-button state or a first-event jump',()=>{
  const look=new FreeMouseLook();assert.deepEqual(look.step(.05),zero);
  assert.equal(look.move(200,200,bounds),null);
  assert.deepEqual(look.move(213,194,bounds),{dx:13,dy:-6});
  assert.deepEqual(look.move(208,203,bounds),{dx:-5,dy:9});
  assert.deepEqual(look.step(.05),zero);
});

test('leaving the canvas keeps edge turning and reentry establishes a new baseline',()=>{
  const look=new FreeMouseLook();look.move(840,320,bounds);assert(look.step(.05).dx>0);
  assert.equal(look.move(841,320,bounds),null);assert(look.step(.05).dx>0);
  assert.equal(look.move(830,320,bounds),null);
  assert.deepEqual(look.move(825,323,bounds),{dx:-5,dy:3});
  look.move(400,19,bounds);assert(look.step(.05).dy<0);
  assert.equal(look.move(400,300,bounds),null);assert.deepEqual(look.step(.05),zero);
});

test('a latched outer edge turns for hundreds of frames without another mouse event',()=>{
  const look=new FreeMouseLook();look.move(840,320,bounds);const beforeExit=look.step(1/60);
  look.leave(841,320,bounds);
  const total={dx:0,dy:0};
  for(let frame=0;frame<600;frame++){
    const delta=look.step(1/60);close(delta.dx,beforeExit.dx);assert.equal(delta.dy,0);
    total.dx+=delta.dx;total.dy+=delta.dy;
  }
  close(total.dx,1.3*10/.0022);assert.equal(total.dy,0);
  assert.equal(look.move(800,300,bounds),null);
  assert.deepEqual(look.move(798,301,bounds),{dx:-2,dy:1});
});

test('perimeter exits clamp each edge and retain both directions at corners',()=>{
  for(const [x,y,horizontal,vertical] of [[841,320,1,0],[39,320,-1,0],[440,19,0,-1],[440,621,0,1],[841,19,1,-1],[39,621,-1,1]]){
    const look=new FreeMouseLook();look.move(440,320,bounds);look.leave(x,y,bounds);
    const delta=look.step(.1);close(delta.dx,horizontal*1.3*.1/.0022);close(delta.dy,vertical*.7*.1/.0022);
    assert.equal(look.move(440,320,bounds),null);assert.deepEqual(look.step(.1),zero);
  }
});

test('inside UI exits and reset clear the latch, invalid exits cannot preserve stale motion',()=>{
  const look=new FreeMouseLook();look.leave(840,320,bounds);assert(look.step(.1).dx>0);
  look.leave(440,320,bounds);assert.deepEqual(look.step(.1),zero);
  look.leave(840,320,bounds);look.reset();assert.deepEqual(look.step(.1),zero);
  for(const [x,y,rect] of [[NaN,320,bounds],[840,Infinity,bounds],[840,320,{...bounds,width:0}]]){
    look.leave(840,320,bounds);look.leave(x,y,rect);assert.deepEqual(look.step(.1),zero);
  }
});

test('cursor warps reject either large axis and safely replace the coordinate baseline',()=>{
  const look=new FreeMouseLook();look.move(100,100,bounds);
  assert.equal(look.move(281,100,bounds),null);
  assert.deepEqual(look.move(283,101,bounds),{dx:2,dy:1});
  assert.equal(look.move(283,282,bounds),null);
  assert.deepEqual(look.move(284,280,bounds),{dx:1,dy:-2});
  look.reset();look.move(100,100,bounds);
  assert.deepEqual(look.move(280,280,bounds),{dx:180,dy:180});
});

test('any bounds change clears the old baseline, including a mutated bounds object',()=>{
  const look=new FreeMouseLook(),moving={...bounds};look.move(200,200,moving);
  for(const key of ['left','top','width','height']){
    moving[key]++;
    assert.equal(look.move(210,210,moving),null);
    assert.deepEqual(look.move(211,212,moving),{dx:1,dy:2});
  }
});

test('edge turning has a smooth 36px band, bounded yaw/pitch and the correct directions',()=>{
  const look=new FreeMouseLook();look.move(840,20,bounds);
  const corner=look.step(.05);close(corner.dx,1.3*.05/.0022);close(corner.dy,-.7*.05/.0022);
  look.move(40,620,bounds);const opposite=look.step(.05);close(opposite.dx,-corner.dx);close(opposite.dy,-corner.dy);
  look.move(822,320,bounds);close(look.step(.05).dx,corner.dx*.5);
  look.move(804,320,bounds);assert.deepEqual(look.step(.05),zero);
});

test('edge turning depends on elapsed seconds instead of event or frame frequency',()=>{
  const accumulate=frames=>{
    const look=new FreeMouseLook();look.move(840,20,bounds);const total={dx:0,dy:0};
    for(let i=0;i<frames;i++){const delta=look.step(1/frames);total.dx+=delta.dx;total.dy+=delta.dy;}
    return total;
  };
  const a=accumulate(30),b=accumulate(60);close(a.dx,b.dx);close(a.dy,b.dy);
  close(a.dx,1.3/.0022);close(a.dy,-.7/.0022);
});

test('reset and invalid coordinates leave no active edge or stale client-coordinate delta',()=>{
  const look=new FreeMouseLook();look.move(840,20,bounds);look.reset();assert.deepEqual(look.step(.1),zero);
  assert.equal(look.move(200,200,bounds),null);
  for(const invalid of [NaN,Infinity,-Infinity]){
    assert.equal(look.move(invalid,200,bounds),null);assert.deepEqual(look.step(.1),zero);
    assert.equal(look.move(200,200,bounds),null);
    assert.equal(look.move(200,invalid,bounds),null);assert.deepEqual(look.step(.1),zero);
  }
});

test('invalid or hidden bounds deactivate motion and invalid time never produces nonfinite output',()=>{
  const look=new FreeMouseLook();
  for(const invalidBounds of [{...bounds,width:0},{...bounds,height:-1},{...bounds,left:Infinity},{...bounds,top:NaN},{...bounds,width:NaN}]){
    look.move(840,20,bounds);assert.equal(look.move(200,200,invalidBounds),null);assert.deepEqual(look.step(.1),zero);
  }
  look.move(840,20,bounds);
  for(const dt of [NaN,Infinity,-Infinity,-.1,0])assert.deepEqual(look.step(dt),zero);
  assert.deepEqual(look.step(10),look.step(.1));
});

test('small viewports retain a stationary centre and finite edge turning',()=>{
  const look=new FreeMouseLook(),small={left:0,top:0,width:40,height:20};
  look.move(20,10,small);assert.deepEqual(look.step(.05),zero);
  look.move(40,0,small);const delta=look.step(.05);close(delta.dx,1.3*.05/.0022);close(delta.dy,-.7*.05/.0022);
  look.move(0,0,{left:0,top:0,width:Number.MIN_VALUE,height:Number.MIN_VALUE});
  assert.deepEqual(look.step(.05),zero);
});
test('browser DOMRect-style inherited bounds do not reset the baseline on every event',()=>{
 const look=new FreeMouseLook(),rect=Object.create({left:0,top:0,width:900,height:700});
 assert.equal(look.move(450,350,rect),null);
 assert.deepEqual(look.move(490,320,rect),{dx:40,dy:-30});
});
test('last-inside-pixel perimeter exits keep turning in embedded views',()=>{
 const look=new FreeMouseLook();look.move(800,320,bounds);look.leave(839,320,bounds);
 close(look.step(.05).dx,1.3*.05/.0022);
 look.leave(41,320,bounds);close(look.step(.05).dx,-1.3*.05/.0022);
 assert.equal(look.move(400,320,bounds),null);assert.deepEqual(look.step(.05),zero);
});
