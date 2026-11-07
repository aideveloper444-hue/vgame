import { currentProfile } from '../state/profileStore'

/* Short synthesized table sounds (no audio files to download). Respects the club's Sound setting. */

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (currentProfile()?.settings.sound === false) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function noise(at: number, dur: number, freq: number, gain: number) {
  const a = audio()
  if (!a) return
  const len = Math.floor(a.sampleRate * dur)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(a.destination)
  src.start(a.currentTime + at)
}

function tone(at: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine') {
  const a = audio()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.value = freq
  const t = a.currentTime + at
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

const vibrate = (ms: number) => {
  if (currentProfile()?.settings.vibration !== false) navigator.vibrate?.(ms)
}

export const pokerSfx = {
  deal() {
    for (let i = 0; i < 6; i++) noise(i * 0.07, 0.06, 3200, 0.25)
  },
  flip() {
    noise(0, 0.05, 2600, 0.3)
  },
  chips() {
    for (let i = 0; i < 3; i++) tone(i * 0.035, 0.05, 2400 + i * 300, 0.05, 'triangle')
  },
  check() {
    noise(0, 0.03, 900, 0.5)
    noise(0.09, 0.03, 900, 0.5)
  },
  fold() {
    noise(0, 0.09, 1500, 0.2)
  },
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(i * 0.09, 0.32, f, 0.06))
    vibrate(60)
  },
  turn() {
    tone(0, 0.12, 880, 0.06)
    vibrate(30)
  },
  tap() {
    tone(0, 0.05, 1200, 0.03, 'triangle')
  },
}
