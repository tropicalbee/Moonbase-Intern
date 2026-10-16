import * as THREE from 'three';
import {sampleEnding} from './EndingChoreography.js';

/** Shared terminal camera/lighting owner; thermal effects stay pooled and bounded. */
export class FailureSequence {
  constructor({scene,camera,renderer,destructionRoots=[],reducedMotion=false,labSurfaces=null}){
    Object.assign(this,{scene,camera,renderer,destructionRoots,reducedMotion,labSurfaces});this.active=false;
    this.lights=[];this.fixtures=[];this.shell=[];this.tint=new THREE.Color();
    scene.traverse(object=>{
      if(['Lab control light','Lab sample light'].includes(object.name))this.lights.push(object);
      if(object.name==='Lab ceiling fixture')this.fixtures.push(object);
      if(['Continuous pressure glazing','Dome ribs and sealing rings'].includes(object.name))this.shell.push(object);
    });
  }
  start(reason){
    this.reset();this.reason=reason;this.active=true;this.elapsed=0;
    this.saved={exposure:this.renderer.toneMappingExposure,fov:this.camera.fov,position:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),
      lights:this.lights.map(object=>({object,intensity:object.intensity,color:object.color.clone()})),
      fixtures:this.fixtures.map(object=>({object,color:object.material.color.clone()})),shell:this.shell.map(object=>({object,visible:object.visible})),roots:this.destructionRoots.map(object=>({object,visible:object.visible})),surfaceOutput:this.labSurfaces?.uniform.value};
    if(sampleEnding(reason,0).kind==='thermal')this.prepareWreckage();
    if(sampleEnding(reason,0).kind==='thermal'&&!this.reducedMotion)this.prepareEffects();
    return this.apply();
  }
  prepareWreckage(){
    if(this.wreckage)return;
    this.wreckage=new THREE.Group();this.wreckage.name='Terminal station wreckage';this.wreckage.visible=false;this.scene.add(this.wreckage);
    this.wreckGeometry=new THREE.BoxGeometry(1,1,1);this.wreckMaterial=new THREE.MeshStandardMaterial({color:0x262b2e,roughness:.95,metalness:.25});
    const rubble=new THREE.InstancedMesh(this.wreckGeometry,this.wreckMaterial,96),dummy=new THREE.Object3D();rubble.frustumCulled=false;this.wreckage.add(rubble);
    for(let i=0;i<96;i++){
      const angle=i*2.39996,radius=3+Math.sqrt(i/96)*23;
      dummy.position.set(Math.cos(angle)*radius,-1.5+(i%7)*.25,Math.sin(angle)*radius);
      dummy.rotation.set((i%5)*.16,angle,(i%7-3)*.13);dummy.scale.set(3+i%7,.25+(i%4)*.15,.35+(i%5)*.35);dummy.updateMatrix();rubble.setMatrixAt(i,dummy.matrix);
    }
    this.scorchGeometry=new THREE.CircleGeometry(32,72);this.scorchMaterial=new THREE.MeshBasicMaterial({color:0x171b1e,transparent:true,opacity:.8,depthWrite:false});
    const scorch=new THREE.Mesh(this.scorchGeometry,this.scorchMaterial);scorch.rotation.x=-Math.PI/2;scorch.position.y=-2.5;this.wreckage.add(scorch);
  }
  prepareEffects(){
    if(this.effects){this.effects.visible=false;return;}
    this.effects=new THREE.Group();this.effects.name='Terminal thermal cascade';this.effects.visible=false;this.scene.add(this.effects);
    // A full-habitat cascade rather than a small plume over the lab roof.
    this.origin=new THREE.Vector3(0,8,0);
    this.debrisGeometry=new THREE.BoxGeometry(1,1,1);this.debrisMaterial=new THREE.MeshStandardMaterial({color:0x626a6c,roughness:.93,metalness:.35});
    this.debris=new THREE.InstancedMesh(this.debrisGeometry,this.debrisMaterial,96);this.debris.frustumCulled=false;this.effects.add(this.debris);this.dummy=new THREE.Object3D();
    this.fragmentData=Array.from({length:96},(_,i)=>{const angle=i*2.3999632297,radius=5+(i%13)*1.2;return {offset:new THREE.Vector3(Math.cos(angle)*radius,(i%5)*1.1,Math.sin(angle)*radius),velocity:new THREE.Vector3(Math.cos(angle)*(8+i%9),8+(i%11),Math.sin(angle)*(8+i%9)),size:.5+(i%7)*.18};});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const context=canvas.getContext('2d'),gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,.85)');gradient.addColorStop(.3,'rgba(255,255,255,.5)');gradient.addColorStop(1,'rgba(255,255,255,0)');context.fillStyle=gradient;context.fillRect(0,0,128,128);
    this.texture=new THREE.CanvasTexture(canvas);this.spriteMaterials=[];this.clouds=[];
    for(let i=0;i<16;i++){
      const material=new THREE.SpriteMaterial({map:this.texture,color:i<7?(i%2?0xe0863c:0xffdeb0):0x555b5e,transparent:true,opacity:0,depthWrite:false,blending:i<7?THREE.AdditiveBlending:THREE.NormalBlending});
      this.spriteMaterials.push(material);const sprite=new THREE.Sprite(material);sprite.renderOrder=i<7?2:1;this.effects.add(sprite);this.clouds.push(sprite);
    }
    this.ringGeometry=new THREE.RingGeometry(.85,1,64);this.ringMaterial=new THREE.MeshBasicMaterial({color:0xa39e93,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
    this.dust=new THREE.Mesh(this.ringGeometry,this.ringMaterial);this.dust.rotation.x=-Math.PI/2;this.dust.position.set(0,-2.4,0);this.effects.add(this.dust);
    this.blastLight=new THREE.PointLight(0xf1b080,0,80,2);this.blastLight.position.copy(this.origin);this.effects.add(this.blastLight);
  }
  update(delta){
    if(!this.active||!Number.isFinite(delta)||delta<0||!Number.isFinite(this.elapsed+delta))return null;
    if(this.pose.reportReady)return this.pose;
    this.elapsed=Math.min(this.pose.duration,this.elapsed+delta);return this.apply();
  }
  skip(){if(!this.active||!this.pose.canSkip)return false;this.elapsed=this.pose.duration;this.apply();return true;}
  apply(){
    const pose=this.pose=sampleEnding(this.reason,this.elapsed,{reducedMotion:this.reducedMotion});
    this.renderer.toneMappingExposure=this.saved.exposure*pose.exposure;
    if(pose.exterior){this.camera.position.set(...pose.position);this.camera.lookAt(...pose.target);this.camera.fov=pose.fov;}
    else{this.camera.position.copy(this.saved.position);this.camera.quaternion.copy(this.saved.quaternion);this.camera.rotateY(pose.interiorYaw);this.camera.rotateX(pose.interiorPitch);this.camera.rotateZ(pose.interiorRoll);this.camera.fov=this.saved.fov+pose.interiorFovOffset;}
    this.camera.updateProjectionMatrix();
    const kind=pose.kind;
    if(kind==='blackout')this.labSurfaces?.setOutput(this.saved.surfaceOutput*pose.lightOutput,{allowOff:true});
    this.tint.setHex(pose.lightTint);
    for(const {object,intensity,color} of this.saved.lights){object.intensity=intensity*pose.lightOutput;object.color.copy(color).lerp(this.tint,pose.lightTintMix);}
    for(const {object,color} of this.saved.fixtures)object.material.color.copy(color).lerp(this.tint,pose.lightTintMix*.5).multiplyScalar(pose.fixtureOutput);
    for(const {object,visible} of this.saved.shell)object.visible=visible&&!pose.rupture;
    for(const {object,visible} of this.saved.roots)object.visible=visible&&!pose.destroyed;
    if(this.wreckage)this.wreckage.visible=pose.destroyed;
    if(this.effects){this.effects.visible=kind==='thermal'&&!this.reducedMotion&&pose.destroyed;if(this.effects.visible)this.updateEffects(pose.effectTime);}
    return pose;
  }
  updateEffects(time){
    const t=Math.min(8,time);
    for(let i=0;i<this.fragmentData.length;i++){
      const fragment=this.fragmentData[i];this.dummy.position.copy(this.origin).add(fragment.offset).addScaledVector(fragment.velocity,t);this.dummy.position.y=Math.max(-1.9,this.dummy.position.y-.81*t*t);
      this.dummy.rotation.set(i*.13+t*.8,i*.31+t*.5,i*.07-t*.3);this.dummy.scale.set(fragment.size*2.8,fragment.size*.25,fragment.size);this.dummy.updateMatrix();this.debris.setMatrixAt(i,this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.clouds.length;i++){
      const sprite=this.clouds[i],glow=i<7,angle=i*2.4,spread=glow?8+t*3:15+t*5;
      const age=Math.max(0,t-(glow?i*.07:0));
      sprite.position.copy(this.origin).add(new THREE.Vector3(Math.cos(angle)*spread,(glow?0:2)+t*(glow?2:3),Math.sin(angle)*spread));
      const size=glow?28+Math.min(2,age)*26:32+t*12;sprite.scale.setScalar(size);
      sprite.material.opacity=glow?Math.exp(-age*1.4)*.85:.55*Math.min(1,t/.7)*Math.max(0,1-t/8);
    }
    this.blastLight.intensity=700*Math.exp(-t*2);
    this.dust.scale.setScalar(20+t*17);this.ringMaterial.opacity=.3*Math.min(1,t/.4)*Math.max(0,1-t/4);
  }
  reset(){
    if(this.saved){
      this.renderer.toneMappingExposure=this.saved.exposure;this.camera.fov=this.saved.fov;this.camera.position.copy(this.saved.position);this.camera.quaternion.copy(this.saved.quaternion);this.camera.updateProjectionMatrix();
      for(const {object,intensity,color} of this.saved.lights){object.intensity=intensity;object.color.copy(color);}
      for(const {object,color} of this.saved.fixtures)object.material.color.copy(color);
      for(const {object,visible} of this.saved.shell)object.visible=visible;
      if(this.labSurfaces)this.labSurfaces.setOutput(this.saved.surfaceOutput,{allowOff:true});
      for(const {object,visible} of this.saved.roots)object.visible=visible;this.saved=null;
    }
    if(this.effects)this.effects.visible=false;if(this.wreckage)this.wreckage.visible=false;this.active=false;this.elapsed=0;this.pose=null;
  }
  dispose(){this.reset();if(this.wreckage){this.wreckage.removeFromParent();this.wreckGeometry.dispose();this.wreckMaterial.dispose();this.scorchGeometry.dispose();this.scorchMaterial.dispose();this.wreckage=null;}if(!this.effects)return;this.effects.removeFromParent();this.debrisGeometry.dispose();this.debrisMaterial.dispose();this.ringGeometry.dispose();this.ringMaterial.dispose();this.texture.dispose();for(const material of this.spriteMaterials)material.dispose();this.effects=null;}
}
