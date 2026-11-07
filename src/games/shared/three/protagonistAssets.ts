import * as THREE from 'three'

export const MODEL_URL = '/models/ludo/protagonists/characterMedium.fbx'
export const ANIM_IDLE_URL = '/models/ludo/protagonists/animations/idle.fbx'
export const ANIM_RUN_URL = '/models/ludo/protagonists/animations/run.fbx'
export const ANIM_JUMP_URL = '/models/ludo/protagonists/animations/jump.fbx'

// Kenney's FBX kits are typically exported at ~1 unit = 1cm; scale down to meters-ish.
export const FBX_SCALE = 0.0042

/**
 * Adds a view-dependent (fresnel) rim glow to a standard material, so a character picks up colored
 * edge light from its surroundings.
 */
export function applyRimLight(mat: THREE.MeshStandardMaterial, color: string, strength: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: new THREE.Color(color) }
    shader.uniforms.rimStrength = { value: strength }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 rimColor;\nuniform float rimStrength;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
        totalEmissiveRadiance += rimColor * rimF * rimStrength;`,
      )
  }
  mat.customProgramCacheKey = () => `rim-${color}-${strength}`
}
