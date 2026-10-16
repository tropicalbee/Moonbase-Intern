import * as THREE from 'three';

/** Single live screen-effect owner. Keep edge navigation and service panels readable. */
export class ScreenFeedback {
  constructor({canvas,vignette}){this.canvas=canvas;this.vignette=vignette;this.baseline=canvas.style.filter??'';this.severity=0;this.active=false;this.mode='full';this.reducedMotion=false;}
  configure({screenMode='full',reducedMotion=false}={}){this.mode=screenMode;this.reducedMotion=reducedMotion;if(this.mode==='off')this.clear();}
  setActive(active){this.active=!!active;if(!active)this.clear();}
  update(snapshot,delta,events,context){
    if(!this.active)return;
    const oxygen=context.systems.oxygen;
    const goal=this.mode==='off'||!oxygen?.needsRepair?0:Math.max(0,(32-oxygen.reserve)/32);
    this.severity=this.reducedMotion?goal:THREE.MathUtils.damp(this.severity,goal,8,delta);
    if(this.severity<.001)this.severity=0;
    const strength=this.mode==='reduced'?.45:1;
    const filter=this.severity?`${this.baseline} grayscale(${(this.severity*.24*strength).toFixed(3)})`.trim():this.baseline;
    const opacity=(this.severity*.34*strength).toFixed(3);
    if(this.canvas.style.filter!==filter)this.canvas.style.filter=filter;
    if(this.vignette.style.opacity!==opacity)this.vignette.style.opacity=opacity;
  }
  clear(){this.severity=0;this.canvas.style.filter=this.baseline;this.vignette.style.opacity='0';}
  terminate(){this.active=false;this.clear();}
  reset(){this.terminate();}
  dispose(){this.reset();}
}
