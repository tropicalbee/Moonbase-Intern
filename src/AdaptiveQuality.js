/** Fast protection, gradual recovery, and a backoff after an unsuccessful increase. */
export class AdaptiveQuality {
  constructor(){this.reset();}
  reset(){this.suspend();this.cooldown=0;this.retryDelay=30;this.probe=null;}
  // Idle/cinematic frames cannot count as evidence that gameplay has headroom.
  suspend(){this.frames=0;this.elapsed=0;this.healthy=0;}

  update(delta,{ratio,minimum,maximum,frameRate,profile,shadows,allowShadows}){
    if(!Number.isFinite(delta)||delta<=0||delta>1){this.suspend();return null;}
    if(![ratio,minimum,maximum,frameRate].every(Number.isFinite)||minimum<=0||maximum<=0||frameRate<=0)return null;
    const floor=Math.min(minimum,maximum),clamp=value=>Math.min(maximum,Math.max(floor,Math.round(value*1e6)/1e6));
    this.cooldown=Math.max(0,this.cooldown-delta);
    this.frames++;this.elapsed+=delta;
    if(this.elapsed+1e-7<3)return null;
    const fps=this.frames/this.elapsed,windowTime=this.elapsed;
    this.frames=0;this.elapsed=0;
    const state={ratio,shadows};
    if(this.probe){
      const previous=this.probe;this.probe=null;
      if(fps<frameRate*.9){
        this.healthy=0;this.retryDelay=Math.min(120,this.retryDelay*2);this.cooldown=this.retryDelay;
        return {ratio:clamp(previous.ratio),shadows:!!allowShadows&&previous.shadows};
      }
      this.retryDelay=30;
    }
    if(fps<(frameRate===30?24:40)){
      this.healthy=0;this.cooldown=Math.max(this.cooldown,30);
      const next={ratio:clamp(ratio-.15),shadows:profile==='tablet'?false:shadows};
      return next.ratio!==ratio||next.shadows!==shadows?next:null;
    }
    this.healthy=fps>=frameRate*.95?this.healthy+windowTime:0;
    if(this.healthy+1e-7<12||this.cooldown>1e-7)return null;
    this.healthy=0;
    let next=null;
    if(ratio<maximum-1e-7)next={ratio:clamp(ratio+.05),shadows};
    else if(profile==='tablet'&&allowShadows&&!shadows)next={ratio,shadows:true};
    if(next)this.probe=state;
    return next;
  }
}
