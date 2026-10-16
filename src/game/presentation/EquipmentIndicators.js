import * as THREE from 'three';
import { DialogueAnchors } from '../ui/DialogueAnchors.js';

const colors={normal:0x87d6df,warning:0xe0af5b,critical:0xf09087,working:0xb9dded};

/** Small status instruments attached by pose, never added to equipment/collision geometry. */
export class EquipmentIndicators {
  constructor({scene,sources}) {
    this.group=new THREE.Group();this.group.name='Station equipment status indicators';this.group.visible=false;scene.add(this.group);
    this.plates=[];this.materials=[];this.geometry=new THREE.BoxGeometry(1,1,1);
    this.position=new THREE.Vector3();this.quaternion=new THREE.Quaternion();this.scale=new THREE.Vector3();
    for(const [system,id] of [['power','power-cell'],['oxygen','pod'],['cooling','console'],['communications','power-cell'],['rover','rover']]) {
      const source=sources.get(id);if(!source)continue;
      const anchors=system==='rover'?new DialogueAnchors(source.nearbyObject,id,{serviceHeight:1.2}):source.anchors;
      const candidate=anchors.candidates.find(c=>c.id==='front');
      if(!candidate)continue;
      this.addPlate(system,source.nearbyObject,candidate.point,system==='communications'?.25:0);
    }
    // Independent guidance on the lab frontage is legible from the habitat side.
    this.addPlate('power',null,new THREE.Vector3(1,6.3,-17.24),0,true);
  }
  addPlate(system,source,point,offset=0,frontage=false) {
    const plate=new THREE.Group();plate.name=`${system} status instrument`;plate.userData.presentationOnly=true;
    const base=new THREE.MeshBasicMaterial({color:0x0b1720});this.materials.push(base);
    const backing=new THREE.Mesh(this.geometry,base);backing.scale.set(frontage?1.8:.32,.19,.025);plate.add(backing);
    const bars=[];
    for(let i=0;i<3;i++){
      const material=new THREE.MeshBasicMaterial({color:colors.normal});this.materials.push(material);
      const bar=new THREE.Mesh(this.geometry,material);bar.scale.set(frontage?.4:.065,.07+i*.025,.015);bar.position.set((i-1)*(frontage?.5:.09),0,.022);plate.add(bar);bars.push(bar);
    }
    const crossMaterial=new THREE.MeshBasicMaterial({color:colors.critical});this.materials.push(crossMaterial);
    const cross=new THREE.Group();for(const sign of [-1,1]){const line=new THREE.Mesh(this.geometry,crossMaterial);line.scale.set(.14,.025,.018);line.position.z=.035;line.rotation.z=sign*Math.PI/4;cross.add(line);}plate.add(cross);cross.visible=false;
    this.group.add(plate);this.plates.push({system,source,point:point.clone(),offset,frontage,plate,bars,cross,status:null});
  }
  update(snapshot,delta,events,context) {
    for(const item of this.plates){
      const model=context.systems[item.system], incident=snapshot.incidents.find(i=>i.system===item.system);
      if(item.source){item.source.updateWorldMatrix(true,false);this.position.copy(item.point).applyMatrix4(item.source.matrixWorld);this.position.y+=item.offset;item.plate.position.copy(this.position);item.source.matrixWorld.decompose(this.position,this.quaternion,this.scale);item.plate.quaternion.copy(this.quaternion);}
      else item.plate.position.copy(item.point);
      const working=item.system==='oxygen'?!!model?.holding:item.system==='communications'?!!model?.handshaking:item.system==='rover'?!!model?.holding:false;
      const severity=working?'working':incident?.severity??(incident?'warning':'normal');
      const stopped=['blackout','lost','stalled'].includes(model?.status), blocked=!!incident?.blockedBy;
      // Segment count and cross distinguish states without requiring color perception.
      const count=working?3:stopped?0:incident?.severity==='critical'?1:incident?2:3;
      const progress=item.system==='oxygen'?(model?.holdElapsed??0)/2:item.system==='communications'?(model?.handshakeElapsed??0)/2:(model?.verifyElapsed??0)/3;
      for(const [index,bar] of item.bars.entries()){bar.visible=index<count;bar.material.color.setHex(colors[severity]);bar.scale.y=working?(index<Math.floor(progress*3)?.14:.035):.07+index*.025;}
      item.cross.visible=stopped||blocked;
      // The independent frontage guide remains steady even when the primary feed is offline.
      if(item.frontage){for(const bar of item.bars){bar.visible=true;bar.material.color.setHex(incident?colors.warning:colors.normal);}item.cross.visible=!!incident;}
      item.status=model?.status??'nominal';item.plate.userData.status=item.status;
      item.plate.userData.detail=item.system==='cooling'&&model?.vented?(blocked?'Vented; restore Watt before pumping':'Vented; pump still required'):working?'Verification in progress':item.status;
    }
  }
  setActive(active){this.group.visible=!!active;}
  terminate(){this.group.visible=false;}
  reset(){this.group.visible=false;for(const item of this.plates){item.status=null;item.cross.visible=false;for(const bar of item.bars){bar.visible=true;bar.material.color.setHex(colors.normal);}}}
  dispose(){this.group.removeFromParent();this.geometry.dispose();for(const material of this.materials)material.dispose();this.materials=[];this.plates=[];}
}
