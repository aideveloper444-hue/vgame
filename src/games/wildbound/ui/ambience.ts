/**
 * Ambient sound per zone (the music bed). Five continuous layers built from filtered noise and oscillators:
 * wind, water, rain, insects and a low rumble, plus occasional calls: birds, owls, frogs, gulls, an eagle, thunder,
 * cave drips. ambienceScene() picks the mix for the zone's kit, time of day and weather; layers glide over ~2 s.
 */
type Layer = 'wind' | 'water' | 'rain' | 'insects' | 'rumble'
type Call = 'birds' | 'owl' | 'frogs' | 'gulls' | 'eagle' | 'thunder' | 'drips'
interface Mix {
  layers: Partial<Record<Layer, number>>
  calls: Call[]
  /** waves: the water layer swells and falls */
  waves?: boolean
}

const KIT_MIX: Record<string, Mix> = {
  forest: { layers: { wind: 0.5, water: 0.1, insects: 0.15 }, calls: ['birds'] },
  jungle: { layers: { wind: 0.3, water: 0.1, insects: 0.45 }, calls: ['birds', 'frogs'] },
  waterfall: { layers: { wind: 0.3, water: 0.9 }, calls: ['birds'] },
  river: { layers: { wind: 0.4, water: 0.6, insects: 0.1 }, calls: ['birds', 'frogs'] },
  hills: { layers: { wind: 0.85 }, calls: ['eagle', 'birds'] },
  ruins: { layers: { wind: 0.6, insects: 0.2 }, calls: ['birds'] },
  moonlit: { layers: { wind: 0.4, insects: 0.4 }, calls: ['owl'] },
  bamboo: { layers: { wind: 0.7, insects: 0.15 }, calls: ['birds'] },
  pine: { layers: { wind: 0.8 }, calls: ['birds'] },
  autumn: { layers: { wind: 0.7 }, calls: ['birds'] },
  snow: { layers: { wind: 1 }, calls: [] },
  savannah: { layers: { wind: 0.7, insects: 0.35 }, calls: ['birds', 'eagle'] },
  desert: { layers: { wind: 0.9 }, calls: ['eagle'] },
  canyon: { layers: { wind: 0.95 }, calls: ['eagle'] },
  swamp: { layers: { wind: 0.2, water: 0.3, insects: 0.55 }, calls: ['frogs'] },
  volcanic: { layers: { wind: 0.4, rumble: 0.8 }, calls: [] },
  coast: { layers: { wind: 0.55, water: 0.75 }, calls: ['gulls'], waves: true },
  blossom: { layers: { wind: 0.45, insects: 0.15 }, calls: ['birds'] },
  ice: { layers: { wind: 0.95 }, calls: [] },
  birch: { layers: { wind: 0.6, insects: 0.1 }, calls: ['birds'] },
}

let graph: {
  c: AudioContext
  out: GainNode
  gains: Record<Layer, GainNode>
  waveLfo: GainNode
  stop: () => void
} | null = null
let current: Mix = KIT_MIX.forest
let mixKey = ''

export function startZoneAmbience(c: AudioContext, master: GainNode, noise: AudioBuffer, enabled: () => boolean) {
  if (graph) return
  const out = c.createGain()
  out.gain.value = 0.0001
  out.gain.exponentialRampToValueAtTime(0.55, c.currentTime + 2)
  out.connect(master)
  const loop = () => {
    const s = c.createBufferSource()
    s.buffer = noise
    s.loop = true
    s.start(0, Math.random() * 1.5)
    return s
  }
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => {
    const b = c.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = q
    return b
  }
  const gain = (v = 0) => {
    const g = c.createGain()
    g.gain.value = v
    return g
  }
  const nodes: AudioScheduledSourceNode[] = []
  const gains = { wind: gain(), water: gain(), rain: gain(), insects: gain(), rumble: gain() } as Record<Layer, GainNode>
  for (const g of Object.values(gains)) g.connect(out)
  // wind: low-passed noise whose cutoff drifts
  {
    const s = loop()
    const lp = filt('lowpass', 520)
    const lfo = c.createOscillator()
    const lg = gain(260)
    lfo.frequency.value = 0.07
    lfo.connect(lg).connect(lp.frequency)
    const g = gain(0.12)
    s.connect(lp).connect(g).connect(gains.wind)
    lfo.start()
    nodes.push(s, lfo)
  }
  // water: band of rushing noise; on the coast it swells like waves
  const waveLfo = gain(0)
  {
    const s = loop()
    const bp = filt('bandpass', 900, 0.5)
    const lp = filt('lowpass', 2600)
    const g = gain(0.16)
    s.connect(bp).connect(lp).connect(g).connect(gains.water)
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.11
    lfo.connect(waveLfo).connect(g.gain)
    lfo.start()
    nodes.push(s, lfo)
  }
  // rain: bright hiss
  {
    const s = loop()
    const hp = filt('highpass', 2400)
    const g = gain(0.1)
    s.connect(hp).connect(g).connect(gains.rain)
    nodes.push(s)
  }
  // insects: a high chirr pulsing ~16 times a second
  {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = 4300
    const am = gain(0)
    const lfo = c.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 16
    const lg = gain(0.012)
    lfo.connect(lg).connect(am.gain)
    const o2 = c.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = 5100
    const am2 = gain(0.004)
    o.connect(am).connect(gains.insects)
    o2.connect(am2).connect(gains.insects)
    o.start()
    o2.start()
    lfo.start()
    nodes.push(o, o2, lfo)
  }
  // rumble: very low noise (lava, caves, distant storms)
  {
    const s = loop()
    const lp = filt('lowpass', 90)
    const g = gain(0.5)
    s.connect(lp).connect(g).connect(gains.rumble)
    nodes.push(s)
  }

  let alive = true
  const call = (kind: Call) => {
    const t = c.currentTime
    const tone = (f: number, f2: number, dur: number, vol: number, at = 0, type: OscillatorType = 'sine') => {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = type
      o.frequency.setValueAtTime(f, t + at)
      o.frequency.exponentialRampToValueAtTime(f2, t + at + dur)
      g.gain.setValueAtTime(0.0001, t + at)
      g.gain.exponentialRampToValueAtTime(vol, t + at + Math.min(0.03, dur / 3))
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
      o.connect(g).connect(out)
      o.start(t + at)
      o.stop(t + at + dur + 0.05)
    }
    switch (kind) {
      case 'birds': {
        const base = 2200 + Math.random() * 1600
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(base, base * (1.3 + Math.random() * 0.3), 0.1, 0.03, i * 0.13)
        break
      }
      case 'owl':
        tone(420, 380, 0.35, 0.05)
        tone(400, 360, 0.6, 0.05, 0.55)
        break
      case 'frogs':
        for (let i = 0; i < 3; i++) tone(260 + Math.random() * 60, 200, 0.12, 0.05, i * 0.22, 'square')
        break
      case 'gulls':
        tone(1500, 950, 0.35, 0.025, 0, 'sawtooth')
        tone(1400, 900, 0.3, 0.02, 0.4, 'sawtooth')
        break
      case 'eagle':
        tone(2600, 1800, 0.9, 0.025, 0, 'sawtooth')
        break
      case 'drips':
        tone(1900 + Math.random() * 600, 1200, 0.18, 0.04)
        tone(1700, 1100, 0.15, 0.015, 0.25)
        break
      case 'thunder': {
        const s = c.createBufferSource()
        s.buffer = noise
        const lp = filt('lowpass', 260)
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.7, t + 0.08)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
        s.connect(lp).connect(g).connect(out)
        s.start(t, Math.random())
        s.stop(t + 2.7)
        break
      }
    }
  }
  let timer = 0
  const tick = () => {
    if (!alive) return
    const calls = current.calls
    if (enabled() && calls.length) call(calls[Math.floor(Math.random() * calls.length)])
    timer = window.setTimeout(tick, 2200 + Math.random() * 5000)
  }
  timer = window.setTimeout(tick, 1500)

  graph = {
    c,
    out,
    gains,
    waveLfo,
    stop: () => {
      alive = false
      clearTimeout(timer)
      const t = c.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t)
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
      setTimeout(() => {
        for (const n of nodes) n.stop()
        out.disconnect()
      }, 700)
    },
  }
  mixKey = ''
  apply()
}

export function stopZoneAmbience() {
  graph?.stop()
  graph = null
}

function apply() {
  if (!graph) return
  const t = graph.c.currentTime
  for (const l of Object.keys(graph.gains) as Layer[]) graph.gains[l].gain.setTargetAtTime(current.layers[l] ?? 0, t, 0.8)
  graph.waveLfo.gain.setTargetAtTime(current.waves ? 0.14 : 0, t, 0.8)
}

/** Set the mix for the zone's kit, its time of day / weather, and whether the runner is in a cave. */
export function ambienceScene(kit: string, variant: string, cave: boolean) {
  const key = `${kit}|${variant}|${cave}`
  if (key === mixKey) return
  mixKey = key
  const base = KIT_MIX[kit] ?? KIT_MIX.forest
  const layers = { ...base.layers }
  let calls = [...base.calls]
  if (variant === 'rain' || variant === 'storm') {
    layers.rain = variant === 'storm' ? 1 : 0.7
    layers.wind = Math.min(1, (layers.wind ?? 0) + 0.25)
    calls = calls.filter((c) => c !== 'birds')
    if (variant === 'storm') {
      calls.push('thunder', 'thunder')
      layers.rumble = Math.max(layers.rumble ?? 0, 0.35)
    }
  }
  if (variant === 'night') {
    layers.insects = Math.max(layers.insects ?? 0, 0.6)
    calls = calls.filter((c) => c !== 'birds' && c !== 'eagle' && c !== 'gulls')
    calls.push('owl')
  }
  if (variant === 'dawn' || variant === 'golden') calls.push('birds')
  if (variant === 'snowfall') {
    layers.wind = 1
    layers.insects = 0
    calls = []
  }
  if (cave) {
    current = { layers: { wind: 0.15, water: (layers.water ?? 0) * 0.3, rumble: 0.5 }, calls: ['drips'] }
  } else current = { layers, calls, waves: base.waves }
  apply()
}
