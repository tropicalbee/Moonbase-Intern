import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import boldData from 'three/examples/fonts/helvetiker_bold.typeface.json';
import regularData from 'three/examples/fonts/helvetiker_regular.typeface.json';
import { sampleArrival } from './ArrivalChoreography.js';

/** Title-screen staging only. Restore the original scene before arrival starts. */
export class MenuScene {
  constructor(scene, camera, renderer, arrival) {
    Object.assign(this, { scene, camera, renderer, arrival, active: false });
    this.title = new THREE.Group();
    this.title.name = 'Cinematic menu title';
    this.title.visible = false;
    const loader = new FontLoader();
    const front = new THREE.MeshStandardMaterial({ color: 0xa7afb4, roughness: .78,
      metalness: .18, emissive: 0x858f98, emissiveIntensity: .3 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x59636c, roughness: .84, metalness: .3 });
    const letters = (value, font, size, y, depth) => {
      const geometry = new TextGeometry(value, { font, size, depth, curveSegments: 16,
        bevelEnabled: true, bevelSize: .05, bevelThickness: .06, bevelSegments: 3 });
      geometry.computeBoundingBox();
      geometry.translate(-geometry.boundingBox.min.x, -geometry.boundingBox.min.y, 0);
      geometry.computeBoundingBox();
      const mesh = new THREE.Mesh(geometry, [front, edge]);
      mesh.position.y = y;
      mesh.receiveShadow = true;
      this.title.add(mesh);
      return mesh;
    };
    const word = letters('INTERN', loader.parse(boldData), 10, 0, 1.5);
    this.wordWidth = word.geometry.boundingBox.max.x;
    letters('MOONBASE', loader.parse(regularData), 1.65, word.geometry.boundingBox.max.y + 1.1, .2);
    scene.add(this.title);
  }

  show({ returnToTitle = false } = {}) {
    if (this.active || (this.arrival.started && !returnToTitle)) return;
    this.active = true;
    const { scene, camera, renderer, arrival } = this;
    this.saved = { fog: scene.fog, exposure: renderer.toneMappingExposure,
      position: camera.position.clone(), rotation: camera.quaternion.clone(), fov: camera.fov,
      groupVisible: arrival.group.visible, airlockVisible: arrival.airlock.visible,
      craftPosition: arrival.shuttle.group.position.clone(), craftRotation: arrival.shuttle.group.quaternion.clone(),
      visibility: arrival.hiddenDetails.map(([object]) => [object, object.visible]), lights: [] };
    scene.traverse(object => {
      if (!object.isHemisphereLight && !object.isDirectionalLight) return;
      this.saved.lights.push({ object, intensity: object.intensity, color: object.color.clone(),
        ground: object.groundColor?.clone(), position: object.position.clone(), castShadow: object.castShadow });
      if (object.isHemisphereLight) {
        object.intensity = .65; object.color.set(0xb6c2ce); object.groundColor.set(0x252b32);
      } else {
        object.castShadow = false;
        if (object.intensity === 3) {
          object.intensity = 3.3; object.color.set(0xe5e7e7); object.position.set(-45, 35, 45);
        } else {
          object.intensity = .45; object.color.set(0x9daebb); object.position.set(15, 10, 90);
        }
      }
    });
    scene.fog = new THREE.FogExp2(0x111923, .0015);
    renderer.toneMappingExposure = .86;
    arrival.group.visible = true;
    arrival.airlock.visible = false;
    for (const [object] of this.saved.visibility) object.visible = false;
    const shot = sampleArrival(10.2, { touchdownY: arrival.touchdownY, baseY: arrival.baseY });
    arrival.shuttle.group.position.fromArray(shot.craftPosition);
    arrival.shuttle.group.rotation.set(...shot.craftRotation, 'YXZ');
    arrival.shuttle.setLandingGear(shot.gear);
    arrival.shuttle.setThrusterIntensity(0, 0);
    this.title.visible = true;
    this.resize();
  }

  resize() {
    if (!this.active) return;
    const { camera, title } = this;
    camera.position.set(15, 9, 92); camera.lookAt(-8, 6, 33);
    camera.fov = 42; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const distance = 80;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    const halfWidth = halfHeight * camera.aspect;
    title.position.copy(camera.position)
      .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), distance)
      .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), -.91 * halfWidth)
      .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), .11 * halfHeight);
    title.quaternion.copy(camera.quaternion); title.rotateY(-.06);
    title.scale.setScalar(halfWidth * .86 / this.wordWidth);
  }

  hide() {
    if (!this.active) return;
    this.active = false;
    const { saved, scene, camera, renderer, arrival } = this;
    this.title.visible = false;
    scene.fog = saved.fog; renderer.toneMappingExposure = saved.exposure;
    camera.position.copy(saved.position); camera.quaternion.copy(saved.rotation);
    camera.fov = saved.fov; camera.updateProjectionMatrix();
    arrival.group.visible = saved.groupVisible; arrival.airlock.visible = saved.airlockVisible;
    arrival.shuttle.group.position.copy(saved.craftPosition);
    arrival.shuttle.group.quaternion.copy(saved.craftRotation);
    for (const [object, visible] of saved.visibility) object.visible = visible;
    for (const state of saved.lights) {
      state.object.intensity = state.intensity; state.object.color.copy(state.color);
      state.object.position.copy(state.position); state.object.castShadow = state.castShadow;
      if (state.ground) state.object.groundColor.copy(state.ground);
    }
    renderer.shadowMap.needsUpdate = true;
  }
}
