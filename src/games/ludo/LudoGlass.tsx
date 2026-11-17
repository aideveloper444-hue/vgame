import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/*
 * A sheet of polished glass over the playing surface. It mirrors the warriors, neon tubes, rim LEDs and
 * the city lights, and the mirror image is *added* to the board below rather than painted over it, so the
 * board stays fully readable and only gains reflections, like light on a glass table top.
 *
 * three's Reflector clips with an oblique near plane, which only works for perspective cameras; the board
 * camera is orthographic, so this renders the mirror view itself: the camera reflected across the glass,
 * with a clipping plane that drops everything below it.
 */

const RT_SIZE = 1024

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vUv;
  varying vec2 vLocal;
  void main() {
    vUv = textureMatrix * vec4( position, 1.0 );
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float strength;
  uniform float halfSize;
  uniform float texel;
  varying vec4 vUv;
  varying vec2 vLocal;
  void main() {
    // a light 5-tap blur: polished glass, not a perfect mirror
    vec2 uv = vUv.xy / vUv.w;
    vec2 px = vec2( texel * 1.6 );
    vec3 c = texture2D( tDiffuse, uv ).rgb * 0.36;
    c += texture2D( tDiffuse, uv + vec2( px.x, 0.0 ) ).rgb * 0.16;
    c += texture2D( tDiffuse, uv - vec2( px.x, 0.0 ) ).rgb * 0.16;
    c += texture2D( tDiffuse, uv + vec2( 0.0, px.y ) ).rgb * 0.16;
    c += texture2D( tDiffuse, uv - vec2( 0.0, px.y ) ).rgb * 0.16;
    // reflections fade toward the edges of the sheet so it has no hard border
    vec2 e = abs( vLocal ) / halfSize;
    float edge = 1.0 - smoothstep( 0.88, 1.0, max( e.x, e.y ) );
    gl_FragColor = vec4( c * strength * edge, 1.0 );
  }
`

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)

export default function LudoGlass({ size, height, strength = 0.42 }: { size: number; height: number; strength?: number }) {
  const { gl, scene, camera } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)

  const target = useMemo(() => new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, { type: THREE.HalfFloatType }), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: target.texture },
          textureMatrix: { value: new THREE.Matrix4() },
          strength: { value: strength },
          halfSize: { value: size / 2 },
          texel: { value: 1 / RT_SIZE },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [target, strength, size],
  )
  useEffect(
    () => () => {
      target.dispose()
      material.dispose()
    },
    [target, material],
  )

  const tmp = useMemo(
    () => ({
      mirror: null as THREE.Camera | null,
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      point: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      up: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      clear: new THREE.Color(),
      backdrop: undefined as THREE.Object3D | null | undefined,
    }),
    [],
  )

  // before the main render (and before post-processing), draw the mirror view into the target
  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = tmp
    if (!t.mirror || t.mirror.type !== camera.type) t.mirror = camera.clone()
    const mirror = t.mirror as THREE.OrthographicCamera | THREE.PerspectiveCamera
    mirror.copy(camera as never)

    mesh.updateMatrixWorld()
    t.point.setFromMatrixPosition(mesh.matrixWorld)
    t.normal.set(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(t.q)).normalize()

    // reflect the camera's position, view direction and up vector across the glass
    camera.getWorldPosition(t.camPos)
    camera.getWorldDirection(t.look)
    t.up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(t.q))
    const reflectPoint = (p: THREE.Vector3) => p.sub(t.normal.clone().multiplyScalar(2 * p.clone().sub(t.point).dot(t.normal)))
    const lookAt = t.camPos.clone().add(t.look)
    reflectPoint(t.camPos)
    reflectPoint(lookAt)
    t.up.reflect(t.normal)
    mirror.position.copy(t.camPos)
    mirror.up.copy(t.up)
    mirror.lookAt(lookAt)
    mirror.updateMatrixWorld()
    mirror.projectionMatrix.copy(camera.projectionMatrix)
    mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
    ;(material.uniforms.textureMatrix.value as THREE.Matrix4).copy(BIAS).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse).multiply(mesh.matrixWorld)

    // keep only what is above the glass
    t.plane.setFromNormalAndCoplanarPoint(t.normal, t.point)
    t.plane.constant -= 0.002

    const prevTarget = gl.getRenderTarget()
    const prevClip = gl.clippingPlanes
    const prevShadow = gl.shadowMap.autoUpdate
    const prevAlpha = gl.getClearAlpha()
    gl.getClearColor(t.clear)
    // only the board's own lights and warriors reflect; the distant skyline would just add noise
    if (t.backdrop === undefined || (t.backdrop && !t.backdrop.parent)) t.backdrop = scene.getObjectByName('ludo-backdrop') ?? null
    const backdropWasVisible = t.backdrop?.visible ?? false
    if (t.backdrop) t.backdrop.visible = false
    mesh.visible = false
    gl.clippingPlanes = [t.plane]
    gl.shadowMap.autoUpdate = false
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, mirror)
    gl.setRenderTarget(prevTarget)
    gl.setClearColor(t.clear, prevAlpha)
    gl.shadowMap.autoUpdate = prevShadow
    gl.clippingPlanes = prevClip
    mesh.visible = true
    if (t.backdrop) t.backdrop.visible = backdropWasVisible
  }, -1)

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position-y={height} renderOrder={2} material={material}>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}
