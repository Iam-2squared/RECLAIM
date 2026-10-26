export type MouseLookBounds={left:number;top:number;width:number;height:number};
export type MouseLookDelta={dx:number;dy:number};

const SENSITIVITY=.0022;
const EDGE_BAND=36;
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

/** Client-coordinate fallback for environments that cannot grant pointer lock. */
export class FreeMouseLook {
  private bounds:MouseLookBounds|null=null;
  private point:{x:number;y:number}|null=null;
  private previous:{x:number;y:number}|null=null;

  reset():void {this.bounds=null;this.point=null;this.previous=null;}

  private coordinates(clientX:number,clientY:number,bounds:MouseLookBounds):{x:number;y:number}|null {
    if(![clientX,clientY,bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0){this.reset();return null;}
    const changed=!this.bounds||this.bounds.left!==bounds.left||this.bounds.top!==bounds.top||this.bounds.width!==bounds.width||this.bounds.height!==bounds.height;
    if(changed){this.point=null;this.previous=null;this.bounds={left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height};}
    const x=clientX-bounds.left,y=clientY-bounds.top;
    if(!Number.isFinite(x)||!Number.isFinite(y)){this.reset();return null;}
    return{x,y};
  }

  move(clientX:number,clientY:number,bounds:MouseLookBounds):MouseLookDelta|null {
    const point=this.coordinates(clientX,clientY,bounds);if(!point)return null;
    const {x,y}=point;
    if(x<0||x>bounds.width||y<0||y>bounds.height){this.leave(clientX,clientY,bounds);return null;}
    const previous=this.previous;this.point=this.previous=point;
    if(!previous)return null;
    const dx=x-previous.x,dy=y-previous.y;
    // An OS/browser cursor warp establishes a fresh baseline without a view jump.
    if(Math.abs(dx)>180||Math.abs(dy)>180)return null;
    return{dx,dy};
  }

  /** A real perimeter exit keeps turning even when no more mouse events arrive. */
  leave(clientX:number,clientY:number,bounds:MouseLookBounds):void {
    const point=this.coordinates(clientX,clientY,bounds);if(!point)return;
    this.previous=null;
    // Embedded views can report the last inside pixel rather than an outside
    // coordinate when the OS cursor reaches their perimeter.
    const inset=Math.min(2,bounds.width/4,bounds.height/4);
    if(point.x>inset&&point.x<bounds.width-inset&&point.y>inset&&point.y<bounds.height-inset){this.point=null;return;}
    const clampEdge=(value:number,size:number)=>value<=inset?0:value>=size-inset?size:Math.max(0,Math.min(size,value));
    this.point={x:clampEdge(point.x,bounds.width),y:clampEdge(point.y,bounds.height)};
  }

  step(seconds:number):MouseLookDelta {
    if(!this.bounds||!this.point||!Number.isFinite(seconds)||seconds<=0)return{dx:0,dy:0};
    const dt=Math.min(seconds,.1);
    const edge=(position:number,extent:number)=>{
      const band=Math.min(EDGE_BAND,extent/2);
      if(band<=0)return 0;
      return smooth((position-extent+band)/band)-smooth((band-position)/band);
    };
    return{dx:edge(this.point.x,this.bounds.width)*1.3*dt/SENSITIVITY,dy:edge(this.point.y,this.bounds.height)*.7*dt/SENSITIVITY};
  }
}
