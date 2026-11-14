import { useSave } from '../state/progress'
import { startZoneAmbience, stopZoneAmbience } from './ambience'
export { ambienceScene } from './ambience'

/*
 * Sound for Wildbound, synthesised with Web Audio (no downloads): pickups, moves, power-ups, crashes and a
 * per-zone ambience (wind, water, rain, insects, rumble and calls) as the music bed.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let ambience: { stop: () => void } | null = null

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.7
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

let noiseBuf: AudioBuffer | null = null
function noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqTo?: number, delay = 0) {
  const c = ac()
  if (!c || !master) return
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = c.currentTime + delay
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = filter
  f.frequency.setValueAtTime(freq, t)
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t, Math.random())
  s.stop(t + dur + 0.05)
}

const on = () => useSave.getState().settings.sound

export const sfx = {
  tap() {
    if (on()) tone(880, 0.06, 'triangle', 0.12)
  },
  coin() {
    if (!on()) return
    tone(1568, 0.08, 'square', 0.05)
    tone(2093, 0.16, 'square', 0.05, undefined, 0.06)
  },
  gem() {
    if (!on()) return
    for (const [i, f] of [1319, 1760, 2349, 2794].entries()) tone(f, 0.14, 'triangle', 0.09, undefined, i * 0.05)
  },
  token() {
    if (!on()) return
    tone(988, 0.1, 'triangle', 0.1)
    tone(1480, 0.18, 'triangle', 0.1, undefined, 0.08)
  },
  jump() {
    if (!on()) return
    noise(0.22, 0.12, 'bandpass', 600, 1.2, 2200)
    tone(300, 0.18, 'sine', 0.06, 620)
  },
  slide() {
    if (on()) noise(0.32, 0.12, 'lowpass', 1800, 0.7, 400)
  },
  lane() {
    if (on()) noise(0.12, 0.06, 'bandpass', 1400, 2, 900)
  },
  power() {
    if (!on()) return
    for (const [i, f] of [523, 659, 784, 1047].entries()) tone(f, 0.2, 'sawtooth', 0.04, undefined, i * 0.06)
  },
  ability() {
    if (!on()) return
    noise(0.6, 0.18, 'lowpass', 300, 1, 2400)
    tone(110, 0.5, 'sawtooth', 0.08, 220)
  },
  roar() {
    if (!on()) return
    noise(0.9, 0.3, 'bandpass', 220, 0.8, 120)
    tone(90, 0.8, 'sawtooth', 0.12, 60)
  },
  smash() {
    if (!on()) return
    noise(0.35, 0.3, 'lowpass', 900, 0.8, 120)
    tone(70, 0.3, 'sine', 0.2, 40)
  },
  saved() {
    if (!on()) return
    tone(660, 0.3, 'triangle', 0.1, 990)
  },
  crash() {
    if (!on()) return
    noise(0.7, 0.4, 'lowpass', 1200, 0.7, 80)
    tone(120, 0.5, 'sine', 0.25, 40)
  },
  milestone() {
    if (!on()) return
    tone(784, 0.12, 'triangle', 0.08)
    tone(1175, 0.22, 'triangle', 0.08, undefined, 0.1)
  },
  win() {
    if (!on()) return
    for (const [i, f] of [523, 659, 784, 1047, 1319].entries()) tone(f, 0.3, 'triangle', 0.09, undefined, i * 0.09)
  },
  /**
   * A warning cue for each challenge as it is announced (design brief §9: every major hazard has a recognisable
   * sound before impact): the sound of the thing itself, kept low and short under the ambience.
   */
  warn(kind: string) {
    if (!on()) return
    switch (kind) {
      case 'treefall':
        // timber creaking, then a sharp crack
        tone(95, 0.55, 'sawtooth', 0.05, 70)
        noise(0.5, 0.06, 'bandpass', 380, 6, 260)
        noise(0.12, 0.22, 'highpass', 2400, 0.8, undefined, 0.5)
        break
      case 'quicksand':
        // a slow wet gurgle
        for (let i = 0; i < 3; i++) tone(140 + i * 25, 0.18, 'sine', 0.07, 70, i * 0.16)
        noise(0.6, 0.05, 'lowpass', 500, 1, 200)
        break
      case 'temple':
        // stone grinding and a metal click of a mechanism arming
        noise(0.8, 0.12, 'lowpass', 260, 2, 120)
        tone(1800, 0.05, 'square', 0.05, undefined, 0.55)
        tone(1300, 0.06, 'square', 0.05, undefined, 0.66)
        break
      case 'swinglog':
        // rope creak and a heavy whoosh
        noise(0.35, 0.07, 'bandpass', 900, 8, 600)
        noise(0.55, 0.16, 'bandpass', 300, 1, 900, 0.3)
        break
      case 'rockslide':
      case 'cave':
        noise(1.1, 0.2, 'lowpass', 180, 1, 60)
        tone(48, 0.9, 'sine', 0.14, 38)
        break
      case 'river':
      case 'bridge':
        noise(0.9, 0.08, 'bandpass', 1400, 0.6, 800)
        if (kind === 'bridge') tone(220, 0.25, 'triangle', 0.05, 180, 0.4)
        break
      case 'rail':
        tone(660, 0.18, 'triangle', 0.06)
        tone(880, 0.3, 'triangle', 0.06, undefined, 0.16)
        break
      case 'stampede':
        // the ground drumming under a herd, and a bull's trumpet
        noise(1.6, 0.22, 'lowpass', 120, 1.5, 70)
        tone(40, 1.4, 'sine', 0.16, 34)
        tone(330, 0.5, 'sawtooth', 0.05, 520, 0.5)
        tone(520, 0.4, 'sawtooth', 0.04, 420, 0.95)
        break
      case 'jaguar':
        // a low, close growl
        noise(0.9, 0.16, 'lowpass', 260, 2.5, 140)
        tone(70, 0.9, 'sawtooth', 0.06, 55)
        break
      case 'spikeroll':
        // iron rumbling over stone
        noise(1.0, 0.14, 'lowpass', 220, 2, 140)
        tone(1500, 0.06, 'square', 0.03, undefined, 0.3)
        tone(1700, 0.06, 'square', 0.03, undefined, 0.55)
        break
      case 'pitfall':
        // the ground creaking under strain
        noise(0.7, 0.1, 'bandpass', 160, 4, 90)
        noise(0.08, 0.14, 'highpass', 1800, 1, undefined, 0.6)
        break
      case 'blades':
        // a blade whistling through the air, twice
        noise(0.35, 0.1, 'bandpass', 2600, 6, 900)
        noise(0.35, 0.1, 'bandpass', 2600, 6, 900, 0.5)
        break
      case 'swarm':
        // a rising drone of wings
        tone(220, 1.1, 'sawtooth', 0.025, 260)
        tone(233, 1.1, 'sawtooth', 0.025, 275)
        noise(1.0, 0.04, 'bandpass', 900, 3, 1200)
        break
      case 'webs':
        // a taut thread plucked
        tone(660, 0.5, 'triangle', 0.05, 640)
        tone(990, 0.3, 'triangle', 0.03, undefined, 0.12)
        break
      case 'toxic':
        // frogs calling over still water
        for (let i = 0; i < 4; i++) tone(1200 + (i % 2) * 300, 0.06, 'square', 0.035, 900, i * 0.13)
        break
      case 'cointunnel':
        // a bright echo in the rock
        tone(1568, 0.12, 'triangle', 0.05)
        tone(2093, 0.4, 'triangle', 0.04, undefined, 0.1)
        break
      case 'glider':
        // wind over a wing
        noise(1.2, 0.1, 'bandpass', 500, 0.7, 1400)
        break
      case 'raft':
        // the roar of rapids building
        noise(1.4, 0.16, 'bandpass', 700, 0.5, 1600)
        noise(1.2, 0.08, 'lowpass', 300, 1, 160, 0.2)
        break
      case 'jeep':
        // an engine turning over and catching
        tone(70, 0.25, 'sawtooth', 0.06, 90)
        tone(80, 0.7, 'sawtooth', 0.06, 140, 0.28)
        noise(0.7, 0.05, 'lowpass', 400, 1, 900, 0.28)
        break
      case 'flight':
        tone(85, 1.0, 'sawtooth', 0.04, 140)
        break
      case 'lightning':
        // distant thunder rolling in
        noise(1.6, 0.16, 'lowpass', 220, 0.8, 70)
        tone(55, 1.2, 'sine', 0.1, 40, 0.15)
        break
      case 'wildfire':
        // crackling fire
        for (let i = 0; i < 6; i++) noise(0.05, 0.12, 'highpass', 2500 + i * 300, 1, undefined, i * 0.09)
        noise(1.0, 0.08, 'bandpass', 500, 0.8, 300)
        break
      case 'flood':
        // a rushing swell of water
        noise(1.3, 0.14, 'bandpass', 600, 0.5, 1600)
        break
      case 'quake':
        // a deep rumble and the ground cracking
        noise(1.4, 0.24, 'lowpass', 120, 1, 50)
        tone(38, 1.2, 'sine', 0.16, 30)
        noise(0.12, 0.15, 'highpass', 1800, 0.8, undefined, 0.9)
        break
      case 'coinstorm':
      case 'camp':
      case 'supply':
        // a reward ahead: a light rising chime
        for (const [i, f] of [784, 988, 1175].entries()) tone(f, 0.22, 'triangle', 0.06, undefined, i * 0.08)
        break
      case 'speedboat':
        // an outboard revving up over the water
        tone(110, 0.9, 'sawtooth', 0.05, 240)
        noise(1.0, 0.08, 'bandpass', 900, 0.6, 1800)
        break
      case 'atv':
        // a small engine buzzing up through the gears
        tone(130, 0.3, 'sawtooth', 0.05, 200)
        tone(150, 0.5, 'sawtooth', 0.05, 260, 0.3)
        break
      case 'cablecar':
        // a cable humming, the cabin's chime
        tone(98, 1.0, 'sine', 0.06, 104)
        for (const [i, f] of [659, 523].entries()) tone(f, 0.3, 'triangle', 0.05, undefined, 0.2 + i * 0.25)
        break
      case 'drone':
        // rotors spinning up
        tone(180, 1.0, 'sawtooth', 0.025, 420)
        tone(186, 1.0, 'sawtooth', 0.025, 430)
        break
      case 'symbols':
        // stone grinding, then a low resonant note from the carvings
        noise(0.6, 0.1, 'lowpass', 300, 1, 140)
        tone(196, 0.9, 'sine', 0.07, undefined, 0.45)
        tone(294, 0.9, 'sine', 0.04, undefined, 0.45)
        break
      case 'sandstorm':
        // a howling wind full of sand
        noise(1.6, 0.14, 'bandpass', 1200, 0.6, 500)
        noise(1.4, 0.05, 'highpass', 4000, 1, undefined, 0.2)
        break
      case 'toxicgas':
        // a long hiss of escaping gas
        noise(1.4, 0.1, 'highpass', 3200, 0.7, 2400)
        break
      case 'volcano':
        // a deep eruption rumble and spitting rock
        noise(1.6, 0.26, 'lowpass', 110, 1, 45)
        tone(34, 1.4, 'sine', 0.18, 28)
        for (let i = 0; i < 4; i++) noise(0.05, 0.12, 'highpass', 2000, 1, undefined, 0.4 + i * 0.15)
        break
      case 'truck':
        // a big diesel clattering into life
        tone(55, 0.4, 'sawtooth', 0.07, 70)
        tone(62, 0.8, 'sawtooth', 0.06, 110, 0.35)
        noise(0.8, 0.06, 'lowpass', 300, 1, 600, 0.35)
        break
      case 'helicopter':
        // rotor blades chopping the air
        for (let i = 0; i < 8; i++) noise(0.06, 0.12, 'lowpass', 400, 1, undefined, i * 0.11)
        break
      case 'plates':
        // a stone click and a mechanism waking in the walls
        tone(880, 0.05, 'square', 0.05)
        noise(0.5, 0.08, 'bandpass', 500, 3, 250, 0.1)
        break
      case 'climb':
        // wind on a cliff face, a pebble skittering down
        noise(1.0, 0.08, 'bandpass', 700, 0.8, 1100)
        for (let i = 0; i < 3; i++) tone(1400 - i * 200, 0.04, 'triangle', 0.04, undefined, 0.3 + i * 0.12)
        break
      case 'wallrun':
        // a rush of air and quick paws on stone
        noise(0.8, 0.1, 'bandpass', 1000, 0.7, 2200)
        for (let i = 0; i < 4; i++) tone(240, 0.03, 'square', 0.04, undefined, 0.2 + i * 0.09)
        break
      case 'swim':
        // a splash, then muffled bubbles
        noise(0.3, 0.16, 'highpass', 1800, 0.8)
        for (let i = 0; i < 5; i++) tone(500 + i * 90, 0.05, 'sine', 0.04, 700 + i * 90, 0.3 + i * 0.1)
        break
      case 'rival':
        // a challenger's horn call
        tone(392, 0.25, 'sawtooth', 0.05)
        tone(523, 0.45, 'sawtooth', 0.05, undefined, 0.22)
        break
      case 'guide':
        // a bright, magical trill
        for (const [i, f] of [1319, 1568, 1976, 2349].entries()) tone(f, 0.14, 'sine', 0.05, undefined, i * 0.07)
        break
      default:
        // anything newer: a low, neutral heads-up
        tone(330, 0.18, 'triangle', 0.06)
        tone(247, 0.3, 'triangle', 0.06, undefined, 0.14)
    }
  },
  /** a lightning strike: a sharp crack and a long roll of thunder */
  thunder() {
    if (!on()) return
    noise(0.12, 0.35, 'highpass', 1600, 0.7)
    noise(1.8, 0.3, 'lowpass', 400, 0.8, 60, 0.05)
    tone(48, 1.4, 'sine', 0.18, 32, 0.05)
  },
  /** the golden chest: a rich cascade */
  chest() {
    if (!on()) return
    for (const [i, f] of [523, 659, 784, 1047, 1319, 1568].entries()) tone(f, 0.35, 'triangle', 0.08, undefined, i * 0.07)
  },
  /** a falling tree hits the ground */
  timber() {
    if (!on()) return
    noise(0.1, 0.25, 'highpass', 2000, 0.7)
    noise(0.7, 0.3, 'lowpass', 600, 0.8, 70, 0.35)
    tone(60, 0.5, 'sine', 0.22, 35, 0.35)
  },
  /** a challenge cleared: a rising figure, one note per star */
  cleared(stars: number) {
    if (!on()) return
    const notes = [587, 740, 880, 1175]
    for (let i = 0; i <= stars; i++) tone(notes[i], 0.32, 'triangle', 0.08, undefined, i * 0.11)
    if (stars === 3) tone(1760, 0.6, 'sine', 0.05, undefined, 0.5)
  },
  /** the run steps up a difficulty tier: low and grand */
  tier() {
    if (!on()) return
    tone(196, 0.9, 'sawtooth', 0.04)
    tone(294, 0.9, 'triangle', 0.07, undefined, 0.12)
    tone(392, 1.1, 'triangle', 0.07, undefined, 0.24)
  },
  count(final = false) {
    if (on()) tone(final ? 1046 : 523, final ? 0.35 : 0.14, 'square', 0.06)
  },
}

/** The music bed: ambient sound that follows the zone (see ambience.ts). */
export function startAmbience() {
  if (ambience || !useSave.getState().settings.music) return
  const c = ac()
  if (!c || !master) return
  if (!noiseBuf) noise(0.01, 0.0001, 'lowpass', 100)
  startZoneAmbience(c, master, noiseBuf!, () => useSave.getState().settings.music)
  ambience = { stop: stopZoneAmbience }
}

export function stopAmbience() {
  ambience?.stop()
  ambience = null
}

export function haptic(ms = 18) {
  if (useSave.getState().settings.haptics) navigator.vibrate?.(ms)
}
