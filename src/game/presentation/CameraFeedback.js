import * as THREE from 'three';

/** Add only for rendering/marker projection, then restore before aim queries or ending ownership. */
export class CameraFeedback {
  constructor(camera) {
    this.camera=camera;this.mode='full';this.active=false;this.age=Infinity;this.applied=false;
    this.basePosition=new THREE.Vector3();this.baseQuaternion=new THREE.Quaternion();
    this.offset=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.euler=new THREE.Euler(0,0,0,'YXZ');
    this.seen=new Set();
  }
  configure({cameraMode='full',reducedMotion=false}={}){this.mode=reducedMotion?'off':cameraMode;if(this.mode==='off'){this.age=Infinity;this.restore();}}
  setActive(active){this.active=!!active;if(!active)this.restore();}
  update(snapshot,delta,events){
    if(!this.active)return;
    this.age+=delta;
    for(const event of events){
      if(event.system!=='power'||!event.type.endsWith('-fault')||this.seen.has(event.id))continue;
      this.seen.add(event.id);this.age=Number.isFinite(event.at)&&Number.isFinite(snapshot.elapsed)?Math.max(0,snapshot.elapsed-event.at):0;
      if(this.seen.size>64)this.seen.delete(this.seen.values().next().value);
    }
    this.offset.set(0,0,0);this.rotation.identity();
    if(this.mode==='off'||this.age>=.32)return;
    const t=this.age/.32, envelope=(1-t)**2*Math.sin(t*Math.PI), scale=this.mode==='reduced'?.3:1;
    this.offset.set(Math.sin(t*Math.PI*4)*.018,Math.sin(t*Math.PI*3)*.012,0).multiplyScalar(envelope*scale);
    this.euler.set(Math.sin(t*Math.PI*4)*.003*envelope*scale,0,Math.sin(t*Math.PI*3)*.002*envelope*scale);
    this.rotation.setFromEuler(this.euler);
  }
  apply(precision=false){
    this.restore();if(!this.active||precision||this.mode==='off'||this.age>=.32)return;
    this.basePosition.copy(this.camera.position);this.baseQuaternion.copy(this.camera.quaternion);
    this.camera.position.add(this.offset);this.camera.quaternion.multiply(this.rotation);this.camera.updateMatrixWorld(true);this.applied=true;
  }
  restore(){if(!this.applied)return;this.camera.position.copy(this.basePosition);this.camera.quaternion.copy(this.baseQuaternion);this.camera.updateMatrixWorld(true);this.applied=false;}
  terminate(){this.restore();this.active=false;this.age=Infinity;this.offset.set(0,0,0);this.rotation.identity();}
  reset(){this.terminate();this.seen.clear();}
  dispose(){this.reset();}
}
