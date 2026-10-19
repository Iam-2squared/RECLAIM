/**
 * PROVISIONAL RECLAIM FPS encounter seam. Game-only ballistics, collision,
 * feedback receipts and visible tracers share the same fixed-step clock.
 * Rendering, saves, enemy HP and campaign progression remain with the host.
 */
import {
  PROJECTILE_RULES, ProjectilePool,
  type ProjectileEvent, type Vector3,
} from './ballistics.ts';
import {
  resolveSegmentImpact, TracerHistory,
  type TaggedImpact, type SegmentWorld, type TracerSpan,
} from './trajectory-effects.ts';

export type FireOwner = 'player';
export type ShotPayload = Readonly<{owner:FireOwner; damage:number; weapon:'assault'|'sniper'|'rifle'}>;
export type ImpactReceipt = Readonly<{
  projectileId:number; from:Vector3; to:Vector3; owner:FireOwner;
  weapon:ShotPayload['weapon']; damage:number;
  impact:TaggedImpact;
}>;
export type ShotFrame = Readonly<{
  moves:readonly ProjectileEvent[];
  impacts:readonly ImpactReceipt[];
  expirations:readonly number[];
  tracer:readonly TracerSpan[];
  active:number;
}>;
const finiteVec=(v:Vector3)=>[v.x,v.y,v.z].every(Number.isFinite);
/**
 * Call tick twice per existing 1/60 second mission tick. Both collision
 * and cosmetic paths use exactly the same 1/120 second movement segments.
 */
export class MissionProjectilePipeline {
  private readonly pool=new ProjectilePool();
  private readonly trails=new TracerHistory();
  private readonly payload=new Map<number,ShotPayload>();
  get active():number {return this.pool.size;}
  get visibleTracers():readonly TracerSpan[] {return this.trails.visible;}
  fire(position:Vector3,direction:Vector3,payload:ShotPayload):number|null {
    if(!finiteVec(position)||!finiteVec(direction)||payload.owner!=='player'||
       !['assault','sniper','rifle'].includes(payload.weapon)||
       !Number.isFinite(payload.damage)||payload.damage<=0||payload.damage>100)
      throw new RangeError('invalid fictional shot');
    const id=this.pool.spawn(position,direction);
    if(id!==null)this.payload.set(id,{...payload});
    return id;
  }
  tick(world:SegmentWorld,dt=PROJECTILE_RULES.fixedStep):ShotFrame {
    if(!Number.isFinite(dt)||dt<=0||dt>PROJECTILE_RULES.fixedStep+1e-8)
      throw new RangeError('invalid projectile clock');
    const contacts=new Map<number,TaggedImpact>();
    const moves=this.pool.step(dt,(from,to,id)=>{
      const hit=resolveSegmentImpact(from,to,world);
      if(hit)contacts.set(id,hit);
      return hit;
    });
    this.trails.step(dt);
    this.trails.observe(moves);
    const impacts:ImpactReceipt[]=[],expirations:number[]=[];
    for(const event of moves){
      if(!event.hit&&!event.expired)continue;
      const shot=this.payload.get(event.id);
      if(!shot)throw new Error('untracked projectile ownership');
      if(event.hit){
        const impact=contacts.get(event.id);
        if(!impact)throw new Error('terminal event missing collision receipt');
        // Renderer and authoritative collision must share an exact endpoint.
        if(impact.point.x!==event.to.x||impact.point.y!==event.to.y||impact.point.z!==event.to.z)
          throw new Error('visual impact endpoint diverged from simulation');
        impacts.push({projectileId:event.id,from:event.from,to:event.to,owner:shot.owner,
          damage:shot.damage,weapon:shot.weapon,impact});
      } else expirations.push(event.id);
      this.payload.delete(event.id);
    }
    return {moves,impacts,expirations,tracer:this.trails.visible,active:this.pool.size};
  }
  clear():void {this.pool.clear();this.payload.clear();this.trails.clear();}
  get pendingReceipts():number {return this.payload.size;}
}
