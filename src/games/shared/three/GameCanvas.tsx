import { Suspense, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Loader, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import SceneErrorBoundary from './SceneErrorBoundary'

interface GameCanvasProps {
  children: ReactNode
  cameraPosition?: [number, number, number]
  fov?: number
  className?: string
  background?: string
  shadows?: boolean
  glow?: boolean
  /** Skip the opaque background color so a CSS backdrop behind the canvas shows through. */
  transparent?: boolean
  /** Soft reflections from a locally generated light-rig environment (no network download). */
  environment?: boolean
  environmentIntensity?: number
  /** Warm/cool key-light tuning for a more cinematic rig; falls back to the neutral default rig. */
  keyLightColor?: string
  fillLightColor?: string
  bloomIntensity?: number
  bloomThreshold?: number
  bloomRadius?: number
  vignetteDarkness?: number
  /** Show the asset-loading progress bar over the canvas (default true). */
  showLoader?: boolean
  /** MSAA samples for the post-processing pass; 0 (default) leaves edges un-antialiased. */
  multisampling?: number
  /** Flat fill light levels. Dark, premium materials need less fill so the key lights can model them. */
  ambientIntensity?: number
  hemisphereIntensity?: number
  /** Highest device-pixel ratio to render at (default 2). */
  maxDpr?: number
}

export default function GameCanvas({
  children,
  cameraPosition = [0, 9, 9],
  fov = 40,
  className = '',
  background = '#0b0f1a',
  shadows = true,
  glow = true,
  transparent = false,
  environment = false,
  environmentIntensity = 0.5,
  keyLightColor = '#ffffff',
  fillLightColor = '#ffffff',
  bloomIntensity = 0.55,
  bloomThreshold = 0.35,
  bloomRadius = 0.6,
  vignetteDarkness = 0.6,
  showLoader = true,
  multisampling = 0,
  ambientIntensity = 0.85,
  hemisphereIntensity = 0.55,
  maxDpr = 2,
}: GameCanvasProps) {
  return (
    <div className={`relative ${className}`}>
      <Canvas
        // 'percentage' = PCF shadows; plain `true` asks for PCFSoft, which three.js removed (it warns and falls back to PCF)
        shadows={shadows ? 'percentage' : false}
        camera={{ position: cameraPosition, fov }}
        dpr={[1, maxDpr]}
        gl={{ alpha: transparent }}
        style={transparent ? { background: 'transparent' } : undefined}
      >
        {!transparent && <color attach="background" args={[background]} />}
        <ambientLight intensity={ambientIntensity} />
        <hemisphereLight intensity={hemisphereIntensity} groundColor="#1a1830" color={keyLightColor} />
        <directionalLight
          position={[2, 12, 3]}
          intensity={1.1}
          color={keyLightColor}
          castShadow={shadows}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
        <directionalLight position={[-4, 6, -3]} intensity={0.4} color={fillLightColor} />
        {environment && (
          <SceneErrorBoundary label="environment">
            <Suspense fallback={null}>
              <Environment resolution={256} environmentIntensity={environmentIntensity}>
                <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
                <Lightformer form="rect" intensity={1.4} color="#ffd9a8" position={[-7, 2.5, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
                <Lightformer form="rect" intensity={1.4} color="#8fb4ff" position={[7, 2.5, -4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
                <Lightformer form="ring" intensity={1.6} color="#c084fc" position={[0, 3, -9]} scale={5} />
              </Environment>
            </Suspense>
          </SceneErrorBoundary>
        )}
        <SceneErrorBoundary label="scene">
          <Suspense fallback={null}>{children}</Suspense>
        </SceneErrorBoundary>
        {glow && (
          <SceneErrorBoundary label="postprocessing">
            <EffectComposer multisampling={multisampling}>
              <Bloom intensity={bloomIntensity} luminanceThreshold={bloomThreshold} luminanceSmoothing={0.25} mipmapBlur radius={bloomRadius} />
              <Vignette eskil={false} offset={0.15} darkness={vignetteDarkness} />
            </EffectComposer>
          </SceneErrorBoundary>
        )}
      </Canvas>
      {showLoader && (
      <Loader
        containerStyles={{ background: 'transparent' }}
        innerStyles={{ background: '#232c4a', width: 160 }}
        barStyles={{ background: 'linear-gradient(90deg,#7c5cff,#22d3ee)' }}
        dataStyles={{ color: '#e2e8f0', fontSize: 12 }}
      />
      )}
    </div>
  )
}
