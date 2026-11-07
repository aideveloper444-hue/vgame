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
