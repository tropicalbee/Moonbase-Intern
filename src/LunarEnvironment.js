import * as THREE from 'three';

export const LUNAR_LANDING_PAD = Object.freeze({ x: -5.5, z: 48, radius: 9, top: -1.05 });

// Deterministic scenery only. The current player remains inside the habitat;
// this regolith is not an exterior walking surface or a terrain collider.
export function lunarSurfaceHeight(x, z) {
  const distance = Math.hypot(x, z);
  const relief = THREE.MathUtils.smoothstep(distance, 38, 85);
  const dunes = 3.5 * Math.sin(x * .028 + .8) * Math.cos(z * .021)
    + 1.3 * Math.sin(x * .075 + z * .048);
  return -2.6 + relief * dunes;
}

export function buildLunarEnvironment() {
  const group = new THREE.Group();
  group.name = 'Lunar surface backdrop';
  const geometry = new THREE.PlaneGeometry(600, 600, 90, 90);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    position.setY(i, lunarSurfaceHeight(x, z));
    const shade = .36 + .035 * Math.sin(x * .13 + z * .2);
    color.setRGB(shade, shade * .98, shade * .94);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, flatShading: true }));
  terrain.name = 'Exterior regolith';
  group.add(terrain);
  // A low jagged crater rim closes the horizon without atmospheric fog.
  const rim = new THREE.BufferGeometry();
  const rimVertices = [];
  for (let i = 0; i < 72; i++) {
    const a = i * Math.PI / 36, b = (i + 1) * Math.PI / 36;
    const height = angle => 6 + 13 * (.5 + .5 * Math.sin(angle * 7 + 1.2))
      + 8 * (.5 + .5 * Math.sin(angle * 13));
    const point = (angle, radius, y) => [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
    const innerA = point(a, 170, lunarSurfaceHeight(Math.sin(a) * 170, Math.cos(a) * 170));
    const innerB = point(b, 170, lunarSurfaceHeight(Math.sin(b) * 170, Math.cos(b) * 170));
    const peakA = point(a, 210, height(a)), peakB = point(b, 210, height(b));
    rimVertices.push(...innerA, ...peakA, ...innerB, ...innerB, ...peakA, ...peakB);
  }
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rimVertices, 3));
  rim.computeVertexNormals();
  const ridge = new THREE.Mesh(rim, new THREE.MeshStandardMaterial({ color: 0x6b6965,
    roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  ridge.name = 'Distant crater rim';
  group.add(ridge);
  // Grounded rocks outside the shell, using one instanced draw call.
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x797771, roughness: 1, flatShading: true }), 36);
  rocks.name = 'Exterior boulders';
  const transform = new THREE.Object3D();
  for (let i = 0; i < rocks.count; i++) {
    const angle = i * 2.399963;
    let radius = 43 + (i % 7) * 9;
    if (Math.hypot(Math.sin(angle) * radius - LUNAR_LANDING_PAD.x,
      Math.cos(angle) * radius - LUNAR_LANDING_PAD.z) < LUNAR_LANDING_PAD.radius + 6) radius += 25;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const height = .6 + (i % 4) * .35;
    transform.position.set(x, lunarSurfaceHeight(x, z) + height * .5, z);
    transform.rotation.set(.1 * i, angle, .07 * i);
    transform.scale.set(height * 1.5, height, height * 1.1);
    transform.updateMatrix();
    rocks.setMatrixAt(i, transform.matrix);
  }
  rocks.computeBoundingSphere();
  group.add(rocks);
  return group;
}
