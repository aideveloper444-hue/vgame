import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

/**
 * Contrast-adaptive sharpening (the idea behind AMD FidelityFX CAS): each pixel is pushed away from its four
 * neighbours by an amount that shrinks where the local contrast is already high, so fine texture detail (fur,
 * bark, gravel) gets crisper without bright halos on hard edges. Runs as its own pass (it reads neighbours).
 */
const frag = /* glsl */ `
uniform float sharpness;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 e = inputColor.rgb;
  vec3 a = texture2D(inputBuffer, uv + vec2(0.0, -texelSize.y)).rgb;
  vec3 b = texture2D(inputBuffer, uv + vec2(-texelSize.x, 0.0)).rgb;
  vec3 c = texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb;
  vec3 d = texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb;
  vec3 mn = min(e, min(min(a, b), min(c, d)));
  vec3 mx = max(e, max(max(a, b), max(c, d)));
  vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, sharpness));
  vec3 res = (e + (a + b + c + d) * w) / (1.0 + 4.0 * w);
  outputColor = vec4(clamp(res, 0.0, 1.0), inputColor.a);
}
`

export class SharpenEffect extends Effect {
  constructor(sharpness = 0.5) {
    super('SharpenEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([['sharpness', new THREE.Uniform(sharpness)]]),
    })
  }
}
