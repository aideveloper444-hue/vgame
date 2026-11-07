import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ALL_COLORS, COLOR_GLOW } from './ludoBoardLayout'
import { CLIP, buildHero, heroAnimations, useHeroAssets } from './ludoCharacters'
import { useLudoPortraits } from './ludoPortraits'

const SIZE = 384
const OUT = 192

/**
 * Renders each team's human character once into an offscreen target — a lit head-and-shoulders shot
 * with a team-colored rim light — and publishes the images, so every player-card avatar is the same
 * person who stands on the board.
 */
export default function LudoPortraitStudio() {
  const gl = useThree((s) => s.gl)
  const assets = useHeroAssets()
  const setPortraits = useLudoPortraits((s) => s.setPortraits)

  useEffect(() => {
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE)
    rt.texture.colorSpace = THREE.SRGBColorSpace
    const prevTarget = gl.getRenderTarget()
    const prevClear = gl.getClearColor(new THREE.Color())
    const prevAlpha = gl.getClearAlpha()
    const buf = new Uint8Array(SIZE * SIZE * 4)
    const out: Record<string, string> = {}

    ALL_COLORS.forEach((color) => {
      const scene = new THREE.Scene()
      const { root: model } = buildHero(color, assets)
      const mixer = new THREE.AnimationMixer(model)
      const idle = heroAnimations(assets, color).find((a) => a.name === CLIP.idle)
      if (idle) mixer.clipAction(idle).play()
      mixer.update(0.6)
      scene.add(model)
      model.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(model, true)
      const h = box.max.y - box.min.y
      const focusY = box.max.y - h * 0.13
      const cam = new THREE.PerspectiveCamera(22, 1, 0.01, 100)
      cam.position.set(h * 0.2, focusY + h * 0.03, h * 0.9)
      cam.lookAt(0, focusY - h * 0.02, 0)

      scene.add(new THREE.AmbientLight('#ffffff', 1))
      const key = new THREE.DirectionalLight('#fff1dc', 2.6)
      key.position.set(1.4, 2, 2.4)
      scene.add(key)
      const rim = new THREE.DirectionalLight(COLOR_GLOW[color], 4.5)
      rim.position.set(-1.6, 1.4, -2)
      scene.add(rim)
      const fill = new THREE.DirectionalLight('#9fb4ff', 0.8)
      fill.position.set(-2, 0.5, 1.5)
      scene.add(fill)

      gl.setRenderTarget(rt)
      gl.setClearColor(0x000000, 0)
      gl.clear()
      gl.render(scene, cam)
      gl.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, buf)

      // WebGL reads bottom-up; flip into a canvas, then downsample for smooth edges
      const big = document.createElement('canvas')
      big.width = SIZE
      big.height = SIZE
      const bctx = big.getContext('2d')!
      const img = bctx.createImageData(SIZE, SIZE)
      for (let y = 0; y < SIZE; y++) img.data.set(buf.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
      bctx.putImageData(img, 0, 0)
      const small = document.createElement('canvas')
      small.width = OUT
      small.height = OUT
      const sctx = small.getContext('2d')!
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(big, 0, 0, OUT, OUT)
      out[color] = small.toDataURL('image/png')
      mixer.stopAllAction()
    })

    gl.setRenderTarget(prevTarget)
    gl.setClearColor(prevClear, prevAlpha)
    rt.dispose()
    setPortraits(out)
  }, [gl, assets, setPortraits])

  return null
}
