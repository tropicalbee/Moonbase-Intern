import * as THREE from 'three';

const directionalCall = 'getDirectionalLightInfo( directionalLight, directLight );';
const roomLights = THREE.ShaderChunk.lights_fragment_begin.replace(
  directionalCall, `${directionalCall}\n\t\tdirectLight.color *= labRoomLight;`
);
const indirectScale = `
#if defined( RE_IndirectDiffuse )
  irradiance *= labRoomLight;
#endif
#if defined( RE_IndirectSpecular )
  iblIrradiance *= labRoomLight;
  radiance *= labRoomLight;
  clearcoatRadiance *= labRoomLight;
#endif
`;

/** Local presentation fill: the room's global light contribution follows its supply.
 * Point/spot lights keep their own intensity and hue; emissive displays stay independent.
 * No global light, material albedo, camera exposure or gameplay state is modified.
 */
export class LabSurfaceLighting {
  constructor(scene) {
    this.uniform = { value: 1 };
    this.meshes = [];
    this.materials = new Map();
    const visited = new Set();
    const visit = object => {
      if (!object.isMesh || ['Lab ceiling fixture', 'Lab transfer indicator'].includes(object.name)) return;
      if (visited.has(object)) return;
      visited.add(object);
      const original = object.material;
      const material = Array.isArray(original) ? original.map(source => this.copy(source)) : this.copy(original);
      if (material !== original) {
        object.material = material;
        this.meshes.push({ object, original, material });
      }
    };
    scene.traverse(object => {
      if (object.userData.labPowerSurface) object.traverse(visit);
    });
  }

  copy(source) {
    if (this.materials.has(source)) return this.materials.get(source);
    if (!source.isMeshStandardMaterial && !source.isMeshPhongMaterial &&
        !source.isMeshLambertMaterial && !source.isMeshBasicMaterial) return source;
    const material = source.clone(), previousCompile = source.onBeforeCompile;
    const previousKey = source.customProgramCacheKey.call(source);
    const uniform = this.uniform;
    material.onBeforeCompile = function(shader, renderer) {
      previousCompile.call(this, shader, renderer);
      shader.uniforms.labRoomLight = uniform;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>', '#include <common>\nuniform float labRoomLight;'
      );
      if (this.isMeshBasicMaterial) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <aomap_fragment>',
          '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= labRoomLight;'
        );
      } else {
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', roomLights)
          .replace('#include <lights_fragment_end>', `${indirectScale}\n#include <lights_fragment_end>`);
      }
    };
    material.customProgramCacheKey = () => `${previousKey}|lab-surface-light-v1`;
    this.materials.set(source, material);
    return material;
  }

  setOutput(output, { allowOff = false } = {}) {
    if (Number.isFinite(output)) this.uniform.value = THREE.MathUtils.clamp(output, allowOff ? 0 : .12, 1);
  }

  reset() { this.uniform.value = 1; }

  dispose() {
    this.reset();
    for (const { object, original, material } of this.meshes) {
      if (object.material === material) object.material = original;
    }
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.meshes = [];
  }
}
