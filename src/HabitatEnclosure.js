import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAB } from './LabLayout.js';
import { clearStationArcs } from './StationClearance.js';
import { AIRLOCK } from './AirlockLayout.js';

export const SPACE_BACKGROUND = 0x020912;
export const DOME_BASE = 14.5;
export const DOME_RISE = 6.4;

// Visual pressure shell outside the existing walking bounds. Coordinates
// remain in world space so the expanded lab keeps its existing clearances.
export function buildHabitatEnclosure(scale) {
  const group = new THREE.Group();
  group.name = 'Sunlit lunar glass habitat';
  const radius = 23.7 * scale;
  const solid = [], glazing = [], frames = [], lights = [];
  const panel = (list, start, end, bottom, top) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, top - bottom,
      Math.max(2, Math.ceil((end - start) * 24)), 1, true, start, end - start);
    geometry.translate(0, (bottom + top) / 2, 0);
    list.push(geometry.toNonIndexed());
  };
  const box = (list, size, position) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.translate(...position);
    list.push(geometry.toNonIndexed());
  };
  panel(glazing, 0, Math.PI * 2, 7.6, DOME_BASE);
  for (const [start, end] of clearStationArcs(radius)) {
    panel(solid, start, end, -.2, 1.6);
    panel(glazing, start, end, 1.6, 7.6);
  }
  // Close the pressure shell above and beside the low arrival connector;
  // clearing the rail must not leave a floor-to-ceiling hole in the glazing.
  const halfOpening=AIRLOCK.halfWidth+1;
  const start=Math.PI*2+Math.asin((AIRLOCK.x-halfOpening)/radius);
  const end=Math.PI*2+Math.asin((AIRLOCK.x+halfOpening)/radius);
  panel(glazing,start,end,4.3,7.6);
  for(const side of [-1,1]) {
    const x=AIRLOCK.x+side*(AIRLOCK.halfWidth+.5);
    box(solid,[1,4.6,1.1],[x,2,Math.sqrt(radius*radius-x*x)]);
  }
  const junctionZ=Math.sqrt(radius*radius-AIRLOCK.x*AIRLOCK.x);
  box(solid,[halfOpening*2,.35,1.2],[AIRLOCK.x,4.15,junctionZ]);
  box(solid,[halfOpening*2,.6,1.2],[AIRLOCK.x,-.05,junctionZ]);
  const dome = new THREE.SphereGeometry(1, 72, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(radius, DOME_RISE, radius);
  dome.translate(0, DOME_BASE, 0);
  glazing.push(dome.toNonIndexed());

  // Continuous meridian ribs follow the glass profile, rather than beams
  // suspended over an empty roof. Shared rings visibly seal their junctions.
  for (let rib = 0; rib < 12; rib++) {
    const angle = rib * Math.PI / 6;
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const theta = i / 24 * Math.PI / 2;
      points.push(new THREE.Vector3(Math.sin(angle) * radius * Math.sin(theta),
        DOME_BASE + DOME_RISE * Math.cos(theta), Math.cos(angle) * radius * Math.sin(theta)));
    }
    frames.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, .13, 5, false).toNonIndexed());
  }
  for (const theta of [Math.PI / 6, Math.PI / 3, Math.PI / 2]) {
    const ring = new THREE.TorusGeometry(radius * Math.sin(theta), .14, 5, 72);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, DOME_BASE + DOME_RISE * Math.cos(theta), 0);
    frames.push(ring.toNonIndexed());
  }
  // Keep the annex roof at the lab's height. A second slab at dome height
  // would obscure the glazed roof and read as a floating upper floor.
  const annexHeight = 7.6;
  box(solid, [LAB.width + 2.8, .3, LAB.depth + 2.8], [LAB.centerX, annexHeight + .16, LAB.centerZ]);
  box(solid, [LAB.width + 2.8, annexHeight, .3], [LAB.centerX, annexHeight / 2, LAB.back - 1.3]);
  for (const x of [LAB.left - 1.3, LAB.right + 1.3]) {
    box(solid, [.3, annexHeight, LAB.depth + 2.8], [x, annexHeight / 2, LAB.centerZ]);
  }
  for (const x of [-12, 12]) {
    box(lights, [.1, .12, 19], [x, 13.35, -1]);
    box(frames, [.24, .18, 19.2], [x, 13.45, -1]);
  }
  const addBatch = (geometries, material, name) => {
    const geometry = mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  };
  addBatch(solid, new THREE.MeshStandardMaterial({ color: 0x5b727c,
    roughness: .72, metalness: .2, side: THREE.DoubleSide }), 'Habitat plinth and lab annex');
  addBatch(glazing, new THREE.MeshPhysicalMaterial({ color: 0xb4d7df,
    transparent: true, opacity: .085, roughness: .08, metalness: .05,
    depthWrite: false, side: THREE.DoubleSide }), 'Continuous pressure glazing');
  addBatch(frames, new THREE.MeshStandardMaterial({ color: 0xc3d0d1,
    metalness: .35, roughness: .42 }), 'Dome ribs and sealing rings');
  addBatch(lights, new THREE.MeshBasicMaterial({ color: 0xffe4b9 }), 'Habitat service lights');
  return group;
}
