import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Metres in local coordinates: nose -Z, exhaust +Z, dorsal +Y.
// Flight origin is the pressure hull, not the feet. No scene, camera or input ownership.
const SECTIONS = [
  [-5.15, .32, -.22, .12], [-4.35, .90, -.46, .66],
  [-3.15, 1.42, -.64, 1.19], [-1.65, 1.69, -.72, 1.48],
  [.35, 1.75, -.72, 1.48], [2.15, 1.69, -.70, 1.37],
  [3.55, 1.43, -.63, 1.04], [4.05, 1.18, -.54, .80],
];
const UP = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const finiteUnit = (value) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

function crossSection([z, width, bottom, top]) {
  const height = top - bottom;
  return [v(-width * .68, top, z), v(width * .68, top, z),
    v(width, top - height * .24, z), v(width, bottom + height * .23, z),
    v(width * .69, bottom, z), v(-width * .69, bottom, z),
    v(-width, bottom + height * .23, z), v(-width, top - height * .24, z)];
}

function triangleGeometry(triangles) {
  const geometry = new THREE.BufferGeometry();
  const positions = triangles.flatMap(triangle => triangle.flatMap(point => point.toArray()));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function loft(sections) {
  const rings = sections.map(crossSection);
  const triangles = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < 8; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % 8];
      const c = rings[i + 1][(j + 1) % 8], d = rings[i + 1][j];
      triangles.push([a, d, b], [b, d, c]);
    }
  }
  for (const [ring, reverse] of [[rings[0], false], [rings.at(-1), true]]) {
    const center = ring.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 8);
    for (let j = 0; j < 8; j++) {
      const a = ring[j], b = ring[(j + 1) % 8];
      triangles.push(reverse ? [center, b, a] : [center, a, b]);
    }
  }
  return triangleGeometry(triangles);
}

// Bevel a polygon in its own plane. Unlike stacked boxes, plating follows the hull facets.
function plate(points, thickness = .035, bevel = .012) {
  const origin = points[0];
  const xAxis = points[1].clone().sub(origin).normalize();
  const normal = xAxis.clone().cross(points.at(-1).clone().sub(origin)).normalize();
  const yAxis = normal.clone().cross(xAxis).normalize();
  const shape = new THREE.Shape(points.map(point => {
    const offset = point.clone().sub(origin);
    return new THREE.Vector2(offset.dot(xAxis), offset.dot(yAxis));
  }));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: bevel > 0, bevelSegments: 2,
    steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 1,
  });
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal).setPosition(origin));
  return geometry;
}

function inset(points, ratio, lift = 0) {
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const normal = points[1].clone().sub(points[0]).cross(points.at(-1).clone().sub(points[0])).normalize();
  return points.map(point => center.clone().lerp(point, ratio).addScaledVector(normal, lift));
}

function roundedBlock(width, height, depth, radius = .04) {
  const shape = new THREE.Shape();
  const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 3, height / 3);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y); shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r); shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true,
    bevelSize: r / 3, bevelThickness: r / 3, bevelSegments: 2, curveSegments: 3 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** Standalone spacecraft. Call update with elapsed seconds; all motion is local mechanism motion. */
export class LunarShuttle {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'LS-07 lunar personnel shuttle';
    this.disposed = false;
    this.thrust = { main: 0, lift: 0 };
    this.gearDeployment = 1;
    this._materials = new Set();
    this._textures = new Set();
    this._geometries = new Set();
    this._batches = new Map();
    this._gear = [];
    this._engines = [];
    this.materials = {
      hull: this._material(0x222c34, .62, .42),
      titanium: this._material(0x8e999a, .68, .36),
      alternate: this._material(0x657780, .65, .4),
      dark: this._material(0x11191e, .40, .52),
      metal: this._material(0x68777f, .88, .28),
      ceramic: this._material(0x363838, .22, .78),
      amber: this._material(0xc58b3c, .38, .43),
      radiator: this._material(0x233238, .60, .50),
      glass: this._material(0x082b3b, .78, .16),
      stencil: this._material(0xc6ccc7, .1, .70),
    };
    // Fine metal grain, generated locally. No downloaded textures or canvas/DOM dependency.
    const grain = new Uint8Array(128 * 128 * 4);
    let seed = 701;
    for (let i = 0; i < grain.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 190 + (seed >>> 26);
      grain[i] = grain[i + 1] = grain[i + 2] = value; grain[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(grain, 128, 128);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.repeat.set(3, 3); texture.needsUpdate = true;
    this._textures.add(texture);
    for (const material of [this.materials.titanium, this.materials.alternate, this.materials.hull]) {
      material.bumpMap = texture; material.bumpScale = .004;
      material.roughnessMap = texture;
    }
    this._buildHull();
    this._buildCockpit();
    this._buildSystems();
    this._buildPropulsion();
    this._buildLandingGear();
    this._flush(this.group);
    this.setLandingGear(1);
    this.setThrusterIntensity(0, 0);
    this.update(0);
    this.group.updateMatrixWorld(true);
    // Physical bounds exclude exhaust. Stable fitting/landing reference independent of throttle.
    this.physicalBounds = new THREE.Box3();
    this.group.traverseVisible(object => {
      if (!object.isMesh) return;
      object.geometry.computeBoundingBox();
      this.physicalBounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    this.landingHeight = -this.physicalBounds.min.y;
  }

  _material(color, metalness, roughness) {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this._materials.add(material);
    return material;
  }

  _add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], parent = null) {
    this._geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (parent) parent.add(mesh);
    else {
      mesh.updateMatrix();
      const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      copy.applyMatrix4(mesh.matrix);
      this._geometries.add(copy);
      if (!this._batches.has(material)) this._batches.set(material, []);
      this._batches.get(material).push(copy);
      geometry.dispose(); this._geometries.delete(geometry);
    }
    return mesh;
  }

  _flush(parent) {
    for (const [material, geometries] of this._batches) {
      const merged = mergeGeometries(geometries);
      if (!merged) throw new Error('Shuttle detail batch has incompatible attributes');
      this._geometries.add(merged);
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `Batched structure ${material.color.getHexString()}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      // Source geometries are construction-only; merged meshes own the final GPU resources.
      for (const geometry of geometries) { geometry.dispose(); this._geometries.delete(geometry); }
    }
    this._batches.clear();
  }

  _mergeChildren(parent, exclude = []) {
    const batches = new Map();
    for (const child of [...parent.children]) {
      if (!child.isMesh || exclude.includes(child)) continue;
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material).push(geometry);
      parent.remove(child);
      this._geometries.delete(child.geometry); child.geometry.dispose();
    }
    for (const [material, geometries] of batches) {
      this._add(mergeGeometries(geometries), material, [0, 0, 0], [0, 0, 0], parent);
      geometries.forEach(geometry => geometry.dispose());
    }
  }

  _block(size, position, material, rotation = [0, 0, 0], parent = null) {
    return this._add(roundedBlock(...size), material, position, rotation, parent);
  }

  _rod(start, end, radius, material, parent = null, segments = 10) {
    const a = v(...start), b = v(...end), delta = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), segments), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
    mesh.updateMatrix();
    const geometry = mesh.geometry;
    geometry.applyMatrix4(mesh.matrix);
    return this._add(geometry, material, [0, 0, 0], [0, 0, 0], parent);
  }

  _pipe(points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => v(...point)), false, 'centripetal');
    this._add(new THREE.TubeGeometry(curve, points.length * 6, radius, 6, false), material);
  }

  _buildHull() {
    const m = this.materials;
    this._add(loft(SECTIONS), m.hull);
    const rings = SECTIONS.map(crossSection);
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < 8; j++) {
        const points = [rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % 8], rings[i][(j + 1) % 8]];
        const material = j === 4 ? m.ceramic : (j === 2 || j === 6) && i > 3 ? m.alternate : m.titanium;
        this._add(plate(inset(points, .958, .016)), material);
        // Fasteners at the panel corners sit within a dark recessed perimeter reveal.
        const normal = points[1].clone().sub(points[0]).cross(points[3].clone().sub(points[0])).normalize();
        for (const corner of inset(points, .85, .062)) {
          const geometry = new THREE.CylinderGeometry(.026, .026, .014, 6);
          geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, normal));
          this._add(geometry, m.dark, corner.toArray());
        }
      }
    }
    // Load-bearing belly keel and dorsal avionics spine are custom tapered sections.
    this._add(loft([[-3.4, .34, -.83, -.65], [-1.9, .45, -.98, -.70],
      [2.65, .45, -.98, -.69], [3.6, .28, -.75, -.61]]), m.ceramic);
    this._add(loft([[-1.55, .35, 1.43, 1.57], [-1.1, .47, 1.43, 1.70],
      [1.7, .47, 1.35, 1.62], [2.8, .29, 1.15, 1.37]]), m.hull);
    for (const z of [-.8, -.4, 0, .4, .8, 1.2]) {
      this._block([.74, .025, .13], [0, 1.71 - Math.max(0, z) * .027, z], m.metal);
    }
    // Nose bumper, recessed navigation camera, paired flush optical apertures.
    this._block([.40, .15, .08], [0, -.02, -5.19], m.dark);
    for (const x of [-.13, .13]) {
      this._add(new THREE.CylinderGeometry(.047, .047, .03, 16), m.glass, [x, -.02, -5.24], [Math.PI / 2, 0, 0]);
    }
  }

  _buildCockpit() {
    const m = this.materials;
    // Glazing follows the sloped roof. Broad armour eyebrows protect two small pressure windows.
    for (const side of [-1, 1]) {
      const points = side === 1
        ? [v(.12, 1.25, -3.06), v(.80, 1.25, -3.06), v(1.02, 1.468, -1.93), v(.12, 1.468, -1.93)]
        : [v(-.80, 1.25, -3.06), v(-.12, 1.25, -3.06), v(-.12, 1.468, -1.93), v(-1.02, 1.468, -1.93)];
      points.reverse();
      this._add(plate(points, .035, .02), m.dark);
      this._add(plate(inset(points, .88, .05), .008, .009), m.metal);
      this._add(plate(inset(points, .79, .064), .009, .009), m.glass);
      this._rod([side * .15, 1.52, -1.91], [side * 1.05, 1.52, -1.91], .027, m.titanium);
    }
    this._block([.095, .05, 1.13], [0, 1.42, -2.49], m.titanium, [-.19, 0, 0]);
  }

  _stencil(text, position, scale, rotation = [0, 0, 0]) {
    const font = {
      L: [[0,6],[0,0],[4,0]],
      S: [[4,6],[1,6],[0,5],[0,4],[1,3],[3,3],[4,2],[4,1],[3,0],[0,0]],
      '0': [[1,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,1],[1,0]],
      '7': [[0,6],[4,6],[1.2,0]],
      '-': [[0,3],[4,3]],
    };
    const transform = new THREE.Matrix4().compose(v(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), v(scale, scale, scale));
    [...text].forEach((character, c) => {
      const path = font[character];
      for (let i = 0; i < path.length - 1; i++) {
        const a = v(c * 6 + path[i][0], path[i][1], 0);
        const b = v(c * 6 + path[i + 1][0], path[i + 1][1], 0);
        const delta = b.clone().sub(a).normalize();
        const normal = v(-delta.y, delta.x, 0).multiplyScalar(.25);
        const corners = [a.clone().sub(normal), b.clone().sub(normal), b.clone().add(normal), a.clone().add(normal)];
        const geometry = triangleGeometry([[corners[0], corners[1], corners[3]], [corners[1], corners[2], corners[3]]]);
        geometry.applyMatrix4(transform);
        this._add(geometry, this.materials.stencil);
      }
    });
  }

  _buildSystems() {
    const m = this.materials;
    for (const side of [-1, 1]) {
      // Engine nacelle armour is a separate tapered fairing integrated into the aft fuselage.
      const nacelle = loft([[.15, .32, -.35, .45], [1.0, .57, -.85, .61],
        [3.4, .59, -.87, .52], [4.15, .53, -.76, .36]]);
      this._add(nacelle, m.hull, [side * 1.75, 0, 0]);
      this._block([.06, .52, 2.08], [side * 2.35, -.05, 2.18], m.alternate);
      for (let i = 0; i < 12; i++) {
        this._block([.026, .35, .046], [side * 2.39, -.04, 1.24 + i * .16], m.dark, [.28, 0, 0]);
      }
      this._pipe([[side * 1.81, .69, .50], [side * 2.03, .73, 1.05],
        [side * 2.03, .61, 2.9], [side * 1.89, .41, 3.66]], .042, m.metal);
      for (const z of [1.15, 2.0, 2.8]) {
        this._block([.25, .10, .09], [side * 2.03, .67 - (z - 1.15) * .052, z], m.dark);
      }
      // Short heat rejection surfaces, not aerodynamic/solar wings.
      const fin = [v(side * 2.0, .30, .7), v(side * 3.0, .02, 1.25),
        v(side * 2.9, .02, 3.28), v(side * 2.10, .29, 3.0)];
      if (side === 1) fin.reverse();
      this._add(plate(fin, .07, .015), m.metal);
      this._add(plate(inset(fin, .86, .09), .02, .004), m.radiator);
      for (let i = 0; i < 10; i++) {
        const z = 1.38 + i * .155;
        this._rod([side * 2.22, .34, z], [side * 2.84, .155, z + .05], .018, m.dark);
      }
      // Recessed service access panels and small amber warning strips.
      this._block([.035, .57, 1.37], [side * 1.777, .22, -.20], m.dark);
      this._block([.025, .46, 1.23], [side * 1.804, .22, -.20], m.alternate);
      this._block([.026, .052, .43], [side * 1.831, .29, -.21], m.metal);
      this._block([.025, .08, .84], [side * 1.833, -.04, -.20], m.amber);
      this._block([.035, .42, .67], [side * 1.73, .2, -1.33], m.dark);
      for (let i = 0; i < 5; i++) {
        this._block([.021, .034, .51], [side * 1.76, .04 + i * .07, -1.33], m.metal);
      }
      this._stencil('LS-07', [side * 1.81, .76, .95], .029,
        [0, side * Math.PI / 2, 0]);
      // Local RCS pods: manifold plus three recessed orthogonal nozzles.
      for (const z of [-2.95, 3.18]) {
        const x = side * (z < 0 ? 1.44 : 2.2);
        this._block([.30, .35, .47], [x, .1, z], m.hull);
        for (const offset of [-.12, .12]) {
          this._add(new THREE.TorusGeometry(.053, .013, 6, 16), m.metal,
            [x + side * .169, .1, z + offset], [0, Math.PI / 2, 0]);
          this._add(new THREE.CircleGeometry(.042, 16), m.dark,
            [x + side * .160, .1, z + offset], [0, side * Math.PI / 2, 0]);
        }
      }
    }
    // Port-side forward pressure hatch. Boarding seal is separate from the cockpit.
    this._block([1.13, .97, .10], [-1.49, .13, -2.35], m.dark, [0, -Math.PI / 2, 0]);
    this._block([.96, .82, .09], [-1.565, .13, -2.35], m.metal, [0, -Math.PI / 2, 0]);
    this._block([.82, .71, .08], [-1.63, .13, -2.35], m.titanium, [0, -Math.PI / 2, 0]);
    this._block([.035, .23, .09], [-1.70, .13, -2.14], m.dark);
    for (const y of [-.22, .48]) {
      this._block([.13, .095, .22], [-1.68, y, -2.64], m.amber);
    }
    this._rod([-1.74, -.35, -2.83], [-1.74, .61, -2.83], .025, m.metal);
    this._rod([-1.74, -.35, -1.87], [-1.74, .61, -1.87], .025, m.metal);
    this._block([.38, .08, .83], [-1.79, -.58, -2.35], m.dark);
    // Asymmetric starboard communications mast on a reinforced pedestal.
    this._block([.4, .18, .50], [.83, 1.45, .88], m.hull);
    this._rod([.83, 1.54, .88], [.83, 2.03, .88], .032, m.metal);
    this._block([.37, .17, .09], [.83, 2.06, .88], m.alternate, [.2, 0, .15]);
    this._rod([-.65, 1.48, 2.1], [-.65, 1.95, 2.40], .015, m.dark);
    for (const [x, color] of [[-2.40, 0xed4436], [2.40, 0x60d6b0]]) {
      const material = this._material(color, .1, .25);
      material.emissive.setHex(color); material.emissiveIntensity = 1.4;
      this._block([.12, .07, .20], [x, .31, 3.08], material);
    }
    this._stencil('07', [.25, .968, -3.90], .05, [-Math.PI / 2 - .415, 0, Math.PI]);
  }

  _engine(position, direction, radius, length, kind) {
    const mount = new THREE.Group();
    mount.name = `${kind} engine`;
    mount.position.fromArray(position);
    mount.quaternion.setFromUnitVectors(UP, v(...direction).normalize());
    this.group.add(mount);
    const m = this.materials;
    // Closed double-wall nozzle section: the throat is deep inside a hollow flared bell.
    const profile = [[.26, 0], [.31, .15], [.35, .36], [.47, .66], [.70, 1],
      [.70, 1.035], [.65, 1.035], [.44, .66], [.31, .36], [.22, .13], [.22, 0]];
    const bell = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius / .70, y * length)), 40);
    this._add(bell, m.ceramic, [0, 0, 0], [0, 0, 0], mount);
    for (const y of [.12, .35, .60, 1.015]) {
      const outer = profile.slice(0, 6);
      const next = outer.findIndex(([, h]) => h >= y);
      const lower = outer[Math.max(0, next - 1)], upper = outer[next];
      const r = THREE.MathUtils.lerp(lower[0], upper[0], (y - lower[1]) / (upper[1] - lower[1])) * radius / .70;
      this._add(new THREE.TorusGeometry(r + .025, .026, 6, 40), m.metal,
        [0, y * length, 0], [Math.PI / 2, 0, 0], mount);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      this._rod([Math.cos(a) * radius * .46, .24 * length, Math.sin(a) * radius * .46],
        [Math.cos(a) * radius * .93, .96 * length, Math.sin(a) * radius * .93], .015, m.metal, mount, 6);
    }
    const coreMaterial = this._material(0x527d92, .12, .35);
    coreMaterial.emissive.setHex(0x9cdfff);
    const core = this._add(new THREE.SphereGeometry(radius * .29, 20, 10), coreMaterial,
      [0, .19 * length, 0], [0, 0, 0], mount);
    core.scale.y = .36;
    for (const [r, y] of [[.34, .44], [.45, .72]]) {
      this._add(new THREE.TorusGeometry(r * radius / .70, .015, 6, 40), m.ceramic,
        [0, y * length, 0], [Math.PI / 2, 0, 0], mount);
    }
    const exhaust = new THREE.Group();
    exhaust.name = 'Nonphysical exhaust';
    mount.add(exhaust);
    const plumeMaterials = [];
    for (let layer = 0; layer < 3; layer++) {
      const plumeLength = length * (1.25 + layer * .5);
      const material = new THREE.ShaderMaterial({
        uniforms: { tint: { value: new THREE.Color(layer === 0 ? 0xc1efff : 0x4d9ee5) },
          power: { value: 0 }, plumeLength: { value: plumeLength }, time: { value: 0 } },
        vertexShader: 'varying vec3 local; void main(){local=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `uniform vec3 tint; uniform float power,plumeLength,time; varying vec3 local;
          void main(){float h=clamp(local.y/plumeLength+.5,0.0,1.0);
          float ripple=.90+.10*sin(h*38.0-time*25.0);
          float alpha=power*pow(1.0-h,1.8)*smoothstep(0.0,.12,h)*ripple;
          gl_FragColor=vec4(tint,alpha);}`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      this._materials.add(material); plumeMaterials.push(material);
      const plume = this._add(new THREE.ConeGeometry(radius * (.40 + layer * .16), length * (1.25 + layer * .5), 24, 1, true),
        material, [0, length * (1.55 + layer * .25), 0], [0, 0, 0], exhaust);
      plume.castShadow = false; plume.receiveShadow = false;
    }
    const light = kind === 'main' ? new THREE.PointLight(0x8bd4ff, 0, radius * 6, 2) : null;
    if (light) { light.position.y = length * .78; mount.add(light); }
    this._mergeChildren(mount, [core]);
    this._engines.push({ mount, coreMaterial, exhaust, plumeMaterials, light, kind, length });
  }

  _buildPropulsion() {
    for (const x of [-1.74, 1.74]) this._engine([x, -.15, 4.15], [0, 0, 1], .67, 1.25, 'main');
    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.7, 1.72]) this._engine([x, -.67, z], [0, -1, 0], .27, .44, 'lift');
    }
  }

  _buildLandingGear() {
    const m = this.materials;
    for (const side of [-1, 1]) {
      for (const z of [-2.4, 2.15]) {
        this._block([.39, .30, .60], [side * 1.28, -.60, z], m.hull);
        const gear = new THREE.Group();
        gear.name = `Landing support ${side}:${z}`;
        gear.position.set(side * 1.31, -.57, z);
        this.group.add(gear);
        const pad = new THREE.Group();
        pad.name = 'Self levelling landing foot';
        pad.position.set(side * 1.06, -1.37, .14);
        gear.add(pad);
        // Articulated scissor brace and telescopic damper, with real pivot housings.
        this._rod([0, 0, 0], [side * 1.02, -1.22, .14], .075, m.hull, gear);
        this._rod([side * .11, -.11, -.29], [side * .97, -1.16, .12], .038, m.metal, gear);
        this._rod([side * .10, -.16, .29], [side * .65, -.80, .18], .075, m.dark, gear);
        this._rod([side * .65, -.80, .18], [side * 1.05, -1.31, .14], .038, m.metal, gear);
        this._rod([side * .18, -.02, .05], [side * .75, -.62, .08], .024, m.amber, gear);
        for (const [x, y] of [[0, 0], [side * .65, -.80], [side * 1.02, -1.22]]) {
          this._add(new THREE.CylinderGeometry(.12, .12, .19, 16), m.metal, [x, y, .14], [Math.PI / 2, 0, 0], gear);
        }
        this._block([.72, .10, .85], [0, -.09, 0], m.dark, [0, 0, 0], pad);
        this._block([.55, .055, .63], [0, -.015, 0], m.alternate, [0, 0, 0], pad);
        for (const dz of [-.24, 0, .24]) this._block([.50, .028, .032], [0, .033, dz], m.metal, [0, 0, 0], pad);
        this._gear.push({ group: gear, foot: pad, side });
        // Batch each mechanism by material while retaining its articulated root.
        this._mergeChildren(gear);
        this._mergeChildren(pad);
      }
    }
  }

  /** Main and underside braking intensity, independently clamped to [0,1]. */
  setThrusterIntensity(main = 0, lift = 0) {
    if (this.disposed) return;
    this.thrust.main = finiteUnit(main); this.thrust.lift = finiteUnit(lift);
    this.update(this._elapsed ?? 0);
  }

  /** 0 stowed, 1 deployed. Foot attitude stays level throughout deployment. */
  setLandingGear(deployment = 1) {
    if (this.disposed) return;
    this.gearDeployment = finiteUnit(deployment);
    for (const gear of this._gear) {
      const angle = -gear.side * (1 - this.gearDeployment) * 1.85;
      const travel = .35 + this.gearDeployment * .65;
      gear.group.rotation.z = angle;
      gear.group.scale.setScalar(travel);
      gear.foot.rotation.z = -angle;
      gear.foot.scale.setScalar(1 / travel);
    }
  }

  update(elapsedSeconds = 0) {
    if (this.disposed) return;
    this._elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    const flutter = 1 + .035 * Math.sin(this._elapsed * 37) + .018 * Math.sin(this._elapsed * 61);
    for (const engine of this._engines) {
      const intensity = this.thrust[engine.kind];
      engine.coreMaterial.emissiveIntensity = intensity * 3.2 * flutter;
      engine.exhaust.visible = intensity > .001;
      engine.exhaust.scale.y = (.35 + intensity * .65) * flutter;
      engine.plumeMaterials.forEach((material, i) => {
        material.uniforms.power.value = intensity * [.30, .12, .055][i];
        material.uniforms.time.value = this._elapsed;
      });
      if (engine.light) engine.light.intensity = intensity * .55 * flutter;
    }
  }

  /** Owns only this asset's resources. Safe to call twice or after removal from a scene. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this._geometries.forEach(geometry => geometry.dispose());
    this._materials.forEach(material => material.dispose());
    this._textures.forEach(texture => texture.dispose());
    this._geometries.clear(); this._materials.clear(); this._textures.clear();
    this.group.clear();
  }
}
