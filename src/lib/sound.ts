import { usePlayerStore } from '@/social/stores/usePlayerStore'

/*
 * App sounds, synthesised with Web Audio so the app ships no audio files:
 * - effects: a soft tap on buttons, chimes for messages / invites / voice (Settings → Sound Effects)
 * - alerts follow Settings → Notifications
 * - music: a slow ambient chord loop on the app screens (Settings → Music); it pauses inside games,
 *   during voice chat and while the app is in the background.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const settings = () => usePlayerStore.getState().settings

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(dest ?? master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

export const sfx = {
  tap() {
    if (!settings().soundOn) return
    tone(880, 0, 0.06, 0.05, 'triangle')
  },
  message() {
    if (!settings().notificationsOn) return
    tone(988, 0, 0.18, 0.09)
    tone(1319, 0.09, 0.26, 0.08)
  },
  invite() {
    if (!settings().notificationsOn) return
    tone(659, 0, 0.2, 0.09)
    tone(880, 0.1, 0.22, 0.09)
    tone(1175, 0.2, 0.36, 0.09)
  },
  voiceOn() {
    if (!settings().soundOn) return
    tone(523, 0, 0.12, 0.08)
    tone(784, 0.08, 0.18, 0.08)
  },
  voiceOff() {
    if (!settings().soundOn) return
    tone(784, 0, 0.12, 0.08)
    tone(523, 0.08, 0.2, 0.08)
  },
  success() {
    if (!settings().soundOn) return
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 0.07))
  },
}

/* ---------------- music ---------------- */

// Cmaj7 – Am7 – Fmaj7 – G6, voiced low and soft
const CHORDS = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [87.31, 130.81, 164.81, 220.0],
  [98.0, 146.83, 196.0, 246.94],
]
const BAR = 4.8
let musicGain: GainNode | null = null
let musicTimer: ReturnType<typeof setInterval> | undefined
let nextBarAt = 0
let barIndex = 0
let musicWanted = false

function scheduleBar() {
  const c = ctx
  if (!c || !musicGain) return
  while (nextBarAt < c.currentTime + BAR * 1.5) {
    const chord = CHORDS[barIndex % CHORDS.length]
    const start = Math.max(nextBarAt, c.currentTime + 0.05)
    for (const f of chord) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, start)
      g.gain.linearRampToValueAtTime(0.05, start + 1.4)
      g.gain.linearRampToValueAtTime(0.0001, start + BAR + 0.6)
      o.connect(g).connect(musicGain)
      o.start(start)
      o.stop(start + BAR + 0.7)
    }
    // a slow, quiet arpeggio on top
    chord.forEach((f, i) => {
      const t = start + 0.6 + i * 1.0
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'triangle'
      o.frequency.value = f * 4
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.018, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      o.connect(g).connect(musicGain!)
      o.start(t)
      o.stop(t + 1.7)
    })
    nextBarAt = start + BAR
    barIndex++
  }
}

function startMusic() {
  const c = audio()
  if (!c || !master || musicTimer) return
  musicGain = c.createGain()
  musicGain.gain.setValueAtTime(0.0001, c.currentTime)
  musicGain.gain.linearRampToValueAtTime(0.55, c.currentTime + 2)
  musicGain.connect(master)
  nextBarAt = c.currentTime + 0.1
  scheduleBar()
  musicTimer = setInterval(scheduleBar, 1000)
}

function stopMusic() {
  if (!musicTimer || !ctx || !musicGain) return
  clearInterval(musicTimer)
  musicTimer = undefined
  const g = musicGain
  g.gain.cancelScheduledValues(ctx.currentTime)
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime)
  g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8)
  setTimeout(() => g.disconnect(), 1200)
  musicGain = null
}

let unlocked = false

/** Call whenever something that affects the music changes (route, voice, settings, visibility). */
export function updateMusic(opts: { inGame: boolean; inVoice: boolean }) {
  musicWanted = settings().musicOn && !opts.inGame && !opts.inVoice && document.visibilityState === 'visible'
  if (musicWanted && unlocked) startMusic()
  else if (!musicWanted) stopMusic()
}

let lastOpts = { inGame: false, inVoice: false }

/** Hook up taps and the music lifecycle once at startup. */
export function initSound() {
  // browsers only allow audio after the first tap
  const unlock = () => {
    unlocked = true
    audio()
    updateMusic(lastOpts)
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest('button, a[href], [role=button], [role=tab]')
      if (el && !(el as HTMLButtonElement).disabled) sfx.tap()
    },
    { capture: true },
  )
  document.addEventListener('visibilitychange', () => updateMusic(lastOpts))
  usePlayerStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings) updateMusic(lastOpts)
  })
}

export function setMusicContext(opts: { inGame: boolean; inVoice: boolean }) {
  lastOpts = opts
  updateMusic(opts)
}
