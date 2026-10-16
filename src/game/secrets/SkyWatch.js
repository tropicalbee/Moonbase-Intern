import * as THREE from 'three';

export const SKY_WATCH_SECONDS=20;
/** Glass permits sky watching; opaque station geometry blocks the view. */
export class SkyWatch {
  constructor({secrets,reveal,occluders=[]}){
    Object.assign(this,{secrets,reveal});this.ray=new THREE.Raycaster();this.direction=new THREE.Vector3();
    this.occluders=[...occluders].filter(mesh=>{
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      return materials.some(material=>material&&material.visible!==false&&!material.transparent);
    });this.reset();
  }
  reset(){this.elapsed=0;this.looking=false;}
  lookingAtSky(camera){
    camera.updateWorldMatrix(true,false);
    if(!camera.matrixWorld.elements.every(Number.isFinite))return false;
    camera.getWorldDirection(this.direction);if(this.direction.y<.6)return false;
    this.ray.set(camera.getWorldPosition(new THREE.Vector3()),this.direction);this.ray.near=0;this.ray.far=60;
    const visible=this.occluders.filter(mesh=>{
      for(let ancestor=mesh;ancestor;ancestor=ancestor.parent)if(!ancestor.visible)return false;
      mesh.updateWorldMatrix(true,false);return true;
    });
    return this.ray.intersectObjects(visible,false).length===0;
  }
  update(delta,looking,context){
    if(!Number.isFinite(delta)||delta<0)return false;
    if(context?.shift?.status!=='running'||this.secrets.has('touch-grass')){this.reset();return false;}
    this.looking=!!looking;
    if(!looking||!this.secrets.canReveal(context)||delta>1)return false;
    // Only actual observation advances progress. Pauses, faults, opaque views
    // and stalled frames retain earned seconds without supplying new ones.
    this.elapsed=Math.min(SKY_WATCH_SECONDS,this.elapsed+delta);
    if(this.elapsed<SKY_WATCH_SECONDS||!this.reveal())return false;
    this.secrets.recordSky(context);this.reset();return true;
  }
}
