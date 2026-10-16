import * as THREE from 'three';

const labels={power:['WATT','POWER CELL','Repair circuit'],oxygen:['CAPSULE','LIFE SUPPORT','Balance and prime'],cooling:['PATCH','THERMAL CONTROL','Vent and synchronize'],communications:['RELAY / WATT','GROUND UPLINK','Tune carrier'],rover:['SCOUT','SURVEY DRIVE','Verify drive']};

/** Render-only projection: use the real hit surface; never raycast or change focus/aim. */
export function equipmentPromptPosition(point,camera,width,height,size={width:230,height:114},scratch={view:new THREE.Vector3(),projected:new THREE.Vector3()}){
  camera.updateWorldMatrix(true,false);
  const view=scratch.view.copy(point).applyMatrix4(camera.matrixWorldInverse),projected=scratch.projected.copy(point).project(camera);
  if(width<=24||height<=24||![width,height,size.width,size.height,view.z,projected.x,projected.y,projected.z].every(Number.isFinite)||view.z>=0||projected.z < -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1)return null;
  const anchorX=(projected.x*.5+.5)*width,anchorY=(-projected.y*.5+.5)*height;
  const panelWidth=Math.min(size.width,width-24),panelHeight=Math.min(size.height,height-24);
  const right=anchorX+32+panelWidth<=width*.76;
  const x=Math.max(12,Math.min(width-panelWidth-12,right?anchorX+32:anchorX-panelWidth-32));
  const y=Math.max(Math.min(100,height-panelHeight-12),Math.min(height-panelHeight-12,anchorY-panelHeight*.5));
  return {x,y,right};
}

export class EquipmentPrompt {
  constructor({host,controllers}){
    this.host=host;this.entries=[];this.world=new THREE.Vector3();this.scratch={view:new THREE.Vector3(),projected:new THREE.Vector3()};
    for(const [id,controller] of Object.entries(controllers)){
      if(!controller)continue;
      const element=controller.prompt,[name,channel,action]=labels[id];
      element.classList.add('equipment-hologram');element.dataset.projected='false';
      element.innerHTML=`<b>${name}</b><span class="equipment-channel">${channel}</span><div class="equipment-action"><kbd>E</kbd><span>${action}</span><i aria-hidden="true">››</i></div>`;
      this.entries.push({controller,element,size:{width:230,height:114},anchor:new THREE.Vector3(),hit:new THREE.Vector3(Infinity,Infinity,Infinity)});
    }
    this.observer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
      for(const {target,borderBoxSize} of entries){const entry=this.entries.find(e=>e.element===target),box=borderBoxSize?.[0];if(entry&&box?.inlineSize>0)entry.size={width:box.inlineSize,height:box.blockSize};}
    }):null;
    for(const entry of this.entries)this.observer?.observe(entry.element);
  }
  update(camera){
    const width=this.host.clientWidth,height=this.host.clientHeight;
    for(const entry of this.entries){
      const {controller,element}=entry,focus=controller.manager.focus,point=controller.manager.focusPoint;
      element.dataset.projected='false';
      if(element.hidden||!controller.active||controller.repairOpen||!focus||!point)continue;
      let visible=true;for(let ancestor=focus.object;ancestor;ancestor=ancestor.parent)if(!ancestor.visible){visible=false;break;}
      if(!visible)continue;
      if(entry.object!==focus.object||!entry.hit.equals(point)){
        entry.object=focus.object;entry.hit.copy(point);entry.anchor.copy(point);entry.object.worldToLocal(entry.anchor);
      }
      this.world.copy(entry.anchor);entry.object.localToWorld(this.world);
      const pose=equipmentPromptPosition(this.world,camera,width,height,entry.size,this.scratch);if(!pose)continue;
      element.style.left=`${pose.x}px`;element.style.top=`${pose.y}px`;element.dataset.side=pose.right?'right':'left';element.dataset.projected='true';
    }
  }
  hide(){for(const {element} of this.entries)element.dataset.projected='false';}
  dispose(){this.hide();this.observer?.disconnect();}
}
