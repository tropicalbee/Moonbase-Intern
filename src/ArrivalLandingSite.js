import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LUNAR_LANDING_PAD as PAD } from './LunarEnvironment.js';
import { AIRLOCK } from './AirlockLayout.js';

function chamferedSection(width, height, corner) {
  const shape = new THREE.Shape();
  const w = width / 2, h = height / 2;
  shape.moveTo(-w + corner, -h);
  for (const [x, y] of [[w-corner,-h],[w,-h+corner],[w,h-corner],[w-corner,h],[-w+corner,h],[-w,h-corner],[-w,-h+corner]]) shape.lineTo(x,y);
  shape.closePath();
  return shape;
}

function retainingSkirt() {
  const rim = chamferedSection(15.6,17.4,2.2).getPoints().slice(0,-1);
  const positions = [];
  const point = (p, lower) => [p.x * (lower ? 1.12 : 1), lower ? -2.5 : -.22, p.y * (lower ? 1.12 : 1)];
  for (let i=0; i<rim.length; i++) {
    const next = rim[(i+1)%rim.length];
    const a=point(rim[i],false), b=point(next,false), c=point(next,true), d=point(rim[i],true);
    positions.push(...a,...b,...d,...b,...c,...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Surface infrastructure only. No hull attachment, orbital dock or gameplay collider. */
export function buildArrivalLandingSite(materials) {
  const site = new THREE.Group();
  site.name = 'Grounded lunar landing apron';
  const batches = new Map();
  const add = (geometry, material, position, rotation = [0,0,0], name) => {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1,1,1));
    geometry.applyMatrix4(transform);
    if (name) {
      const object = new THREE.Mesh(geometry, material); object.name = name; site.add(object);
    } else {
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(geometry);
    }
  };
  const box = (size, material, position, rotation, name) => add(new THREE.BoxGeometry(...size),material,position,rotation,name);
  const { deck, foundation, metal, dark, white, amber, blue } = materials;
  // Sloped retaining skirt sinks below the regolith; the apron is not a floating disc.
  const skirtMaterial = foundation.clone();
  // Keep the opaque side wall distinct from the regolith under the cold menu
  // lighting; matching tones made the apron appear hollow/transparent.
  skirtMaterial.color.multiplyScalar(.52);
  add(retainingSkirt(), skirtMaterial, [PAD.x,PAD.top,PAD.z], [0,0,0], 'Apron retaining foundation');
  const deckGeometry = new THREE.ExtrudeGeometry(chamferedSection(15.4,17.2,2.2),
    { depth:.22, bevelEnabled:false });
  add(deckGeometry, deck, [PAD.x,PAD.top,PAD.z], [Math.PI/2,0,0], 'Apron contact surface');
  // Expansion joints and local landing cues replace the oversized helicopter H/ring.
  for (const x of [-5,-2.5,0,2.5,5]) box([.035,.012,14.6],dark,[PAD.x+x,PAD.top+.008,PAD.z]);
  for (const z of [-5.5,0,5.5]) box([12.8,.012,.035],dark,[PAD.x,PAD.top+.009,PAD.z+z]);
  for (const side of [-1,1]) for (const end of [-1,1]) {
    box([1.7,.02,.1],amber,[PAD.x+side*4.3,PAD.top+.014,PAD.z+end*6]);
    box([.1,.02,1.5],amber,[PAD.x+side*5.1,PAD.top+.014,PAD.z+end*5.3]);
    box([.24,.16,.5],dark,[PAD.x+side*6.85,PAD.top+.08,PAD.z+end*5.7]);
    box([.12,.04,.32],blue,[PAD.x+side*6.85,PAD.top+.18,PAD.z+end*5.7]);
  }
  // A low, supported surface walkway leads to a pressure vestibule at the dome.
  box([3.2,2.3,7.5],foundation,[PAD.x,PAD.top-1.2,36.1]);
  box([3.2,.16,7.5],deck,[PAD.x,PAD.top-.08,36.1]);
  for (const side of [-1,1]) box([.08,.025,7.3],amber,[PAD.x+side*1.42,PAD.top+.016,36.1]);
  for (const z of [33.5,35,36.5,38]) box([2.85,.018,.025],dark,[PAD.x,PAD.top+.018,z]);
  // Chamfered pressure shell, recessed hatch, sill, jambs and roof service panels.
  const shell = new THREE.ExtrudeGeometry(chamferedSection(5.6,5.2,.85),
    {depth:7.6,bevelEnabled:true,bevelSize:.07,bevelThickness:.07,bevelSegments:1});
  add(shell,white,[PAD.x,PAD.top+2.6,26.5]);
  // Habitat-side pressure connector reaches the walking deck. Its hollow
  // section replaces the exposed blank rear wall, and meets a sealed hatch.
  const connector = chamferedSection(5.6,3.9,.7);
  connector.holes.push(new THREE.Path(chamferedSection(4.5,3.45,.55).getPoints().reverse()));
  add(new THREE.ExtrudeGeometry(connector,{depth:26.5-AIRLOCK.innerZ,bevelEnabled:false}),
    white,[AIRLOCK.x,2.17,AIRLOCK.innerZ]);
  box([3.45,3.95,.10],metal,[AIRLOCK.x,2.15,AIRLOCK.innerZ-.09]);
  box([2.9,3.55,.12],dark,[AIRLOCK.x,2.12,AIRLOCK.innerZ-.17],undefined,'Habitat arrival door');
  for(const side of [-1,1]) {
    box([1.32,3.34,.05],metal,[AIRLOCK.x+side*.69,2.12,AIRLOCK.innerZ-.245]);
    box([.045,3.22,.035],amber,[AIRLOCK.x+side*1.54,2.12,AIRLOCK.innerZ-.155]);
    box([.12,.55,.06],dark,[AIRLOCK.x+side*.21,1.98,AIRLOCK.innerZ-.29]);
    box([.6,.055,.04],dark,[AIRLOCK.x+side*.69,2.8,AIRLOCK.innerZ-.28]);
  }
  box([3.8,.19,.5],metal,[AIRLOCK.x,4.05,AIRLOCK.innerZ-.2]);
  box([1.55,.06,.04],blue,[AIRLOCK.x,3.89,AIRLOCK.innerZ-.46]);
  box([3.5,.1,.75],metal,[AIRLOCK.x,.23,AIRLOCK.innerZ-.27]);
  box([5.9,2.2,8],foundation,[PAD.x,PAD.top-1.15,30.3]);
  box([3.45,4.1,.13],dark,[PAD.x,PAD.top+2.15,34.19]);
  box([2.85,3.55,.15],metal,[PAD.x,PAD.top+1.94,34.29]);
  for (const side of [-1,1]) {
    box([1.37,3.35,.08],dark,[PAD.x+side*.707,PAD.top+1.94,34.39]);
    box([.08,3.2,.06],blue,[PAD.x+side*1.56,PAD.top+2.15,34.31]);
    box([.28,2.8,.12],metal,[PAD.x+side*2.23,PAD.top+2.1,34.22]);
    for (const z of [28,30.1,32.2]) {
      box([.09,3.45,.09],metal,[PAD.x+side*2.83,PAD.top+2.6,z]);
      box([.12,1.6,1.55],dark,[PAD.x+side*2.87,PAD.top+2.35,z]);
      box([.14,.045,1.2],amber,[PAD.x+side*2.89,PAD.top+3.08,z]);
    }
  }
  box([3.8,.22,.8],metal,[PAD.x,PAD.top+4.5,34.4]);
  box([2.2,.05,.1],amber,[PAD.x,PAD.top+4.35,34.84]);
  box([3.4,.12,.75],metal,[PAD.x,PAD.top+.06,34.5]);
  for (const z of [28.4,30.5,32.6]) {
    box([3.8,.07,1.2],metal,[PAD.x,PAD.top+5.28,z]);
    for (const x of [-1.2,-.6,0,.6,1.2]) box([.045,.05,.85],dark,[PAD.x+x,PAD.top+5.34,z]);
  }
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    const object = new THREE.Mesh(merged, material); object.name = 'Landing infrastructure details'; site.add(object);
  }
  return site;
}
