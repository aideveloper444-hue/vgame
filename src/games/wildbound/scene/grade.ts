import * as THREE from 'three'

/*
 * The film look for Wildbound, done inside tone mapping so it costs nothing: no extra render pass, no
 * post-processing composer (which stalled phones on High), and it applies on every quality setting.
 * renderer.toneMapping = THREE.CustomToneMapping runs this instead of plain ACES:
 * - ACES filmic curve (as before), so exposure and highlight roll-off are unchanged
 * - restrained vibrance (vivid colours are pulled back slightly), film-like highlight desaturation, olive greens
 * - split toning: slightly cool shadows, warm sunlit highlights, like a graded nature film
 * - a soft S-curve in perceptual space for depth without crushing the darks
 * Only this game sets CustomToneMapping, so other scenes in the app are unaffected.
 */
const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float mx = max( c.r, max( c.g, c.b ) );
  float mn = min( c.r, min( c.g, c.b ) );
  float sat = ( mx - mn ) / max( mx, 1e-4 );
  // gentle vibrance only: a filmed nature look, not saturated game colours
  c = max( mix( vec3( l ), c, 1.0 + 0.14 * ( 1.0 - sat ) - 0.06 * sat ), 0.0 );
  // highlights lose a little colour as they roll off, like film stock
  c = mix( c, vec3( l ), smoothstep( 0.62, 1.0, l ) * 0.22 );
  // greens drift slightly towards olive (real foliage on camera is rarely pure green)
  c.g -= max( c.g - max( c.r, c.b ), 0.0 ) * 0.12;
  c *= mix( vec3( 0.96, 0.99, 1.045 ), vec3( 1.035, 1.0, 0.955 ), smoothstep( 0.04, 0.55, l ) );
  vec3 g = pow( c, vec3( 1.0 / 2.2 ) );
  g = mix( g, g * g * ( 3.0 - 2.0 * g ), 0.24 );
  return saturate( pow( max( g, 0.0 ), vec3( 2.2 ) ) );
}`

let installed = false
/** Patch three's (empty) custom tone-mapping hook once, before any material compiles. */
export function installGrade() {
  if (installed) return
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
  const hook = 'vec3 CustomToneMapping( vec3 color ) { return color; }'
  if (!chunk.includes(hook)) return
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(hook, GRADE)
  installed = true
}

/** The tone mapping Wildbound renders with: the graded curve when the hook could be installed, else ACES. */
export const gradeToneMapping = (): THREE.ToneMapping => (installed ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping)
