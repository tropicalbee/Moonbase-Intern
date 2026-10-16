import * as THREE from 'three';
import { circleOverlapsBox } from './DoorCollision.js';
import { LAB } from './LabLayout.js';
import { AIRLOCK_DOOR_COLLIDER } from './AirlockLayout.js';

const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.38;
const DOOR_Z = LAB.front;
const DOOR_X = -6.85;
const HABITAT_RADIUS = 20;
// Keep large props clear of the perimeter so there is room to follow the rail.
const OBSTACLES = [
  [-15, -3, 2.7],
  [-14, 4, 2.1],
  [15, -5, 1.4],
  [-12, 10, 1.7],
  [15, 0, 1.05],
  [-13, -10, 1.2],
  [15, 7, 1.4]
];

export class FirstPersonController {
  constructor(camera, canvas, floorHeight, doorOpening, onLockChange, movingColliders = () => []) {
    this.camera = camera;
    this.canvas = canvas;
    this.floorHeight = floorHeight;
    this.doorOpening = doorOpening;
    this.onLockChange = onLockChange;
    this.movingColliders = movingColliders;
    this.position = new THREE.Vector3(0, 0, 10);
    this.velocity = new THREE.Vector2();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.04;
    this.locked = false;
    this.inputEnabled = true;
    this.lookSensitivity = 0.0014;
    this.eyeY = undefined;
    camera.rotation.order = 'YXZ';
    camera.fov = 68;
    camera.updateProjectionMatrix();
    this.updateCamera();

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.clearInput();
      this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked || !this.inputEnabled) return;
      this.yaw -= event.movementX * this.lookSensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * this.lookSensitivity, -1.1, 1.1);
    });
    document.addEventListener('keydown', (event) => {
      if (!this.locked || !this.inputEnabled) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'KeyR') {
        event.preventDefault();
        this.reset();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'].includes(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });
    document.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clearInput());
  }

  lock() {
    try{
      const request=this.canvas.requestPointerLock();
      request?.catch?.(()=>this.onLockChange(false));
    }catch{this.onLockChange(false);}
  }

  clearInput() {
    this.keys.clear();
    this.velocity.set(0, 0);
  }

  reset() {
    this.clearInput();
    this.position.set(0, 0, 10);
    this.yaw = 0;
    this.pitch = -0.04;
    this.eyeY = undefined;
    this.updateCamera();
    this.onReset?.();
  }

  get nearDoor() {
    return Math.hypot(this.position.x - DOOR_X, this.position.z - DOOR_Z) < 4.2;
  }

  get radius() {
    return PLAYER_RADIUS;
  }

  isWalkable(x, z) {
    const inLab = x > LAB.left + PLAYER_RADIUS && x < LAB.right - PLAYER_RADIUS &&
      z > LAB.back + PLAYER_RADIUS && z < DOOR_Z - PLAYER_RADIUS;
    // The sand ends at radius 21.2; stop the player's eyes well before the
    // inner rail so its beams cannot engulf the first-person camera.
    const inHabitat = Math.hypot(x, z) < HABITAT_RADIUS;
    if (!inLab && !inHabitat) return false;
    if (circleOverlapsBox(x,z,PLAYER_RADIUS,AIRLOCK_DOOR_COLLIDER)) return false;

    // Keep a player-sized gap from all four room walls. Only the open door
    // allows crossing the front wall.
    if (z > LAB.back - PLAYER_RADIUS && z < DOOR_Z + PLAYER_RADIUS) {
      if (Math.abs(x - LAB.left) < PLAYER_RADIUS || Math.abs(x - LAB.right) < PLAYER_RADIUS) return false;
    }
    if (x > LAB.left - PLAYER_RADIUS && x < LAB.right + PLAYER_RADIUS) {
      if (Math.abs(z - LAB.back) < PLAYER_RADIUS) return false;
      if (Math.abs(z - DOOR_Z) < PLAYER_RADIUS &&
        (Math.abs(x - DOOR_X) > 1.55 || this.doorOpening() < 0.75)) return false;
    }

    // The cockpit is a large piece of equipment, not walkable floor.
    if (x > -1.9 && x < 3.9 && z > -26.2 && z < -20.5) return false;
    for (const [cx, cz, radius] of OBSTACLES) {
      if (Math.hypot(x - cx, z - cz) < radius + PLAYER_RADIUS) return false;
    }
    for (const box of this.movingColliders()) {
      if (circleOverlapsBox(x, z, PLAYER_RADIUS, box)) return false;
    }
    return true;
  }

  move(dx, dz) {
    const startX = this.position.x;
    const startZ = this.position.z;
    const nextX = startX + dx;
    const nextZ = startZ + dz;
    if (this.isWalkable(nextX, nextZ)) {
      this.position.set(nextX, 0, nextZ);
      return;
    }

    // Follow the circular railing before trying axis-by-axis wall sliding.
    // Projection preserves the angle of an attempted step and keeps the
    // camera at a comfortable distance from the physical rail.
    const stepLength = Math.hypot(dx, dz);
    const distanceFromCenter = Math.hypot(nextX, nextZ);
    if (Math.hypot(startX, startZ) < HABITAT_RADIUS && distanceFromCenter >= HABITAT_RADIUS) {
      const scale = (HABITAT_RADIUS - .02) / distanceFromCenter;
      const railX = nextX * scale;
      const railZ = nextZ * scale;
      if (Math.hypot(railX - startX, railZ - startZ) <= stepLength + .001 && this.isWalkable(railX, railZ)) {
        this.position.set(railX, 0, railZ);
        return;
      }
    }

    let best = null;
    let bestProgress = 0;
    const consider = (x, z) => {
      if (Math.hypot(x - startX, z - startZ) > stepLength + .001) return;
      const progress = (x - startX) * dx + (z - startZ) * dz;
      if (progress > bestProgress && this.isWalkable(x, z)) {
        best = [x, z];
        bestProgress = progress;
      }
    };
    // Sliding along straight walls works in either movement direction.
    consider(nextX, startZ);
    consider(startX, nextZ);

    // Project a diagonal step onto the curved perimeter or round equipment.
    if (distanceFromCenter >= HABITAT_RADIUS) {
      const scale = (HABITAT_RADIUS - .01) / distanceFromCenter;
      consider(nextX * scale, nextZ * scale);
    }
    for (const [cx, cz, radius] of OBSTACLES) {
      const fromX = nextX - cx;
      const fromZ = nextZ - cz;
      const distance = Math.hypot(fromX, fromZ);
      const clearance = radius + PLAYER_RADIUS + .01;
      if (distance < clearance && distance > .001) {
        consider(cx + fromX / distance * clearance, cz + fromZ / distance * clearance);
      }
    }
    if (best) this.position.set(best[0], 0, best[1]);
    else this.velocity.set(0, 0);
  }

  updateCamera(delta = 0) {
    const inLab = this.position.z < DOOR_Z - PLAYER_RADIUS;
    const targetY = (inLab ? 0.6 : this.floorHeight(this.position.x, this.position.z)) + EYE_HEIGHT;
    this.eyeY = this.eyeY === undefined || delta === 0
      ? targetY
      : THREE.MathUtils.damp(this.eyeY, targetY, 9, delta);
    this.camera.position.set(
      this.position.x,
      this.eyeY,
      this.position.z
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  update(delta) {
    if (this.locked && this.inputEnabled) {
      const side = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
      const length = Math.hypot(side, forward) || 1;
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4.8 : 3.2;
      const goalX = (Math.cos(this.yaw) * side - Math.sin(this.yaw) * forward) / length * speed;
      const goalZ = (-Math.sin(this.yaw) * side - Math.cos(this.yaw) * forward) / length * speed;
      const easing = 1 - Math.exp(-12 * delta);
      // Integrate the easing curve analytically so low-FPS substeps cover the
      // same distance as fine frames, including acceleration from rest.
      const dx=goalX*delta+(this.velocity.x-goalX)*easing/12;
      const dz=goalZ*delta+(this.velocity.y-goalZ)*easing/12;
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, goalX, easing);
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, goalZ, easing);
      this.move(dx, dz);
    }
    this.updateCamera(delta);
  }
}
