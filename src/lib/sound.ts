import { usePlayerStore } from '@/social/stores/usePlayerStore'

/*
 * App sounds, synthesised with Web Audio so the app ships no audio files:
 * - effects: a soft tap on buttons, chimes for messages / invites / voice (Settings → Sound Effects)
 * - alerts follow Settings → Notifications
 * - music: generated themes, a calm one on the app screens and one per game (Settings → Music); it pauses
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

const noiseCache = new Map<number, AudioBuffer>()
/** White noise of the given length (seconds), cached per length. */
function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const key = Math.round(seconds * 1000)
  let buf = noiseCache.get(key)
  if (!buf) {
    const len = Math.max(1, Math.floor(c.sampleRate * seconds))
    buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(key, buf)
  }
  return buf
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
  /** A firework rocket leaving the ground: a soft whoosh with a rising whistle. */
  fireworkLaunch() {
    if (!settings().soundOn) return
    const c = audio()
    if (!c || !master) return
    const t0 = c.currentTime
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(600 + Math.random() * 300, t0)
    o.frequency.exponentialRampToValueAtTime(1800 + Math.random() * 700, t0 + 0.7)
    og.gain.setValueAtTime(0.0001, t0)
    og.gain.exponentialRampToValueAtTime(0.012, t0 + 0.08)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75)
    o.connect(og).connect(master)
    o.start(t0)
    o.stop(t0 + 0.8)
    // the whoosh: band-passed noise swelling and fading
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 0.8)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(900, t0)
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.7)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.1)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75)
    src.connect(bp).connect(g).connect(master)
    src.start(t0)
  },
  /**
   * A shell bursting: a deep boom (bigger and further shells boom lower and softer) and, for crackle shells,
   * a spray of tiny pops. `delay` (seconds) lets the sound arrive just after the flash, as it does from far away.
   */
  fireworkBang(size = 1, crackle = false, delay = 0.12) {
    if (!settings().soundOn) return
    const c = audio()
    if (!c || !master) return
    const t0 = c.currentTime + delay
    // low thump
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(120 - size * 30, t0)
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.5)
    og.gain.setValueAtTime(0.0001, t0)
    og.gain.exponentialRampToValueAtTime(0.32 * size, t0 + 0.01)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
    o.connect(og).connect(master)
    o.start(t0)
    o.stop(t0 + 0.65)
    // the crack and rumble
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 1.4)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3200, t0)
    lp.frequency.exponentialRampToValueAtTime(260, t0 + 1.2)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.3 * size, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3)
    src.connect(lp).connect(g).connect(master)
    src.start(t0)
    if (!crackle) return
    // crackling: dozens of tiny scattered pops a moment after the burst
    for (let i = 0; i < 40; i++) {
      const t = t0 + 0.45 + Math.random() * 0.9
      const p = c.createBufferSource()
      p.buffer = noiseBuffer(c, 0.03)
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1800 + Math.random() * 2500
      const pg = c.createGain()
      pg.gain.setValueAtTime(0.06 + Math.random() * 0.06, t)
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025)
      p.connect(hp).connect(pg).connect(master)
      p.start(t)
    }
  },
}

/** A short burst of filtered noise: the body of clicks, rattles, steps and impacts. */
function noiseHit(start: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + start
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, dur + 0.05)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.05)
}

/** Ludo game sounds (Settings → Sound Effects). */
export const ludoSfx = {
  /** The die tumbling: a run of irregular wooden clicks. */
  diceRoll() {
    if (!settings().soundOn) return
    for (let i = 0; i < 9; i++) noiseHit(i * 0.055 + Math.random() * 0.02, 0.035, 0.05 + Math.random() * 0.04, 'bandpass', 1800 + Math.random() * 1600, 4)
  },
  /** The die settling on its face. */
  diceLand() {
    if (!settings().soundOn) return
    noiseHit(0, 0.06, 0.12, 'bandpass', 1400, 3)
    tone(220, 0, 0.12, 0.05, 'triangle')
  },
  /** A rolled six: a quick rising sparkle. */
  six() {
    if (!settings().soundOn) return
    ;[1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.22, 0.04))
  },
  /** One footstep of a warrior hopping to the next square. */
  step() {
    if (!settings().soundOn) return
    noiseHit(0, 0.07, 0.07, 'lowpass', 700)
    tone(110 + Math.random() * 20, 0, 0.08, 0.04, 'sine')
  },
  /** A warrior stepping out of its home onto the board. */
  enter() {
    if (!settings().soundOn) return
    noiseHit(0, 0.35, 0.05, 'bandpass', 1200, 0.8)
    tone(523, 0.08, 0.25, 0.06)
    tone(784, 0.16, 0.35, 0.06)
  },
  /** A capture: a bright sword clash over a heavy thud. */
  capture() {
    if (!settings().soundOn) return
    noiseHit(0, 0.25, 0.22, 'highpass', 3500)
    tone(1760, 0, 0.35, 0.05, 'square')
    tone(2349, 0.01, 0.3, 0.04, 'square')
    tone(80, 0.05, 0.4, 0.25, 'sine')
    noiseHit(0.05, 0.4, 0.18, 'lowpass', 400)
  },
  /** A warrior reaching the centre home: a short brass-like fanfare. */
  home() {
    if (!settings().soundOn) return
    ;[523, 659, 784, 1047].forEach((f, i) => {
      tone(f, i * 0.11, 0.4, 0.06, 'sawtooth')
      tone(f, i * 0.11, 0.5, 0.05)
    })
  },
  /** It is your turn to roll. */
  yourTurn() {
    if (!settings().soundOn) return
    tone(880, 0, 0.18, 0.06)
    tone(1175, 0.1, 0.3, 0.06)
  },
}

/* ---------------- music ---------------- */

/*
 * Generative music, one theme per place: the app screens and each game. Every theme is a short chord loop
 * played by a soft pad and bass with a melody that wanders the scale (chord tones on the strong beats), and
 * light percussion for some. Nothing repeats exactly, it never gets loud, and it crossfades between themes.
 */

type Lead = 'marimba' | 'epiano' | 'bell' | 'pluck' | 'flute'
interface Theme {
  bpm: number
  /** one chord per bar, low root-position voicings (Hz) */
  chords: number[][]
  /** melody scale (Hz), low to high */
  scale: number[]
  lead: Lead
  /** chance a melody note starts on each eighth */
  density: number
  leadVol: number
  padVol: number
  bassVol: number
  /** bass hits per bar, in eighths */
  bass: number[]
  /** shaker hits per bar, in eighths (empty: none) */
  shaker: number[]
  /** pushes every off-beat eighth late (0 straight .. 0.33 full swing) */
  swing?: number
}

const N = (semis: number) => 261.63 * Math.pow(2, semis / 12) // semitones from middle C
const chord = (...semis: number[]) => semis.map(N)
const scale = (root: number, steps: number[], octaves = 2) => {
  const out: number[] = []
  for (let o = 0; o < octaves; o++) for (const st of steps) out.push(N(root + st + 12 * o))
  out.push(N(root + 12 * octaves))
  return out
}
const MAJOR_PENTA = [0, 2, 4, 7, 9]
const MINOR_PENTA = [0, 3, 5, 7, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

export type MusicTheme = 'app' | 'ludo' | 'city' | 'poker' | 'wildbound'

const THEMES: Record<MusicTheme, Theme> = {
  // the app screens: slow and spacious (Cmaj7 – Am7 – Fmaj7 – G6)
  app: { bpm: 66, chords: [chord(-24, -20, -17, -13), chord(-27, -24, -20, -17), chord(-31, -24, -20, -15), chord(-29, -22, -17, -13)], scale: scale(0, MAJOR_PENTA), lead: 'bell', density: 0.16, leadVol: 0.035, padVol: 0.045, bassVol: 0, bass: [], shaker: [] },
  // Ludo: bright and playful, marimba over C – G – Am – F
  ludo: { bpm: 104, chords: [chord(-24, -20, -17), chord(-29, -25, -22), chord(-27, -24, -20), chord(-31, -27, -24)], scale: scale(0, MAJOR_PENTA), lead: 'marimba', density: 0.42, leadVol: 0.05, padVol: 0.028, bassVol: 0.07, bass: [0, 3, 4], shaker: [2, 6] },
  // City: easy, sunny lo-fi, electric piano on Fmaj7 – Em7 – Dm7 – Cmaj7
  city: { bpm: 84, chords: [chord(-31, -27, -24, -20), chord(-32, -29, -25, -22), chord(-34, -31, -27, -24), chord(-36, -32, -29, -25)], scale: scale(-3, MAJOR, 2), lead: 'epiano', density: 0.3, leadVol: 0.045, padVol: 0.035, bassVol: 0.07, bass: [0, 5], shaker: [1, 3, 5, 7], swing: 0.22 },
  // Royal Poker Club: smooth late-night lounge, Dm7 – G7 – Cmaj7 – A7
  poker: { bpm: 92, chords: [chord(-34, -31, -27, -24), chord(-29, -25, -22, -19), chord(-36, -32, -29, -25), chord(-27, -23, -20, -17)], scale: scale(2, DORIAN, 2), lead: 'epiano', density: 0.26, leadVol: 0.04, padVol: 0.03, bassVol: 0.08, bass: [0, 2, 4, 6], shaker: [2, 6], swing: 0.3 },
  // Wildbound: an airy adventure theme that sits under the forest ambience (Am – F – C – G)
  wildbound: { bpm: 96, chords: [chord(-27, -24, -20), chord(-31, -27, -24), chord(-24, -20, -17), chord(-29, -25, -22)], scale: scale(-3, MINOR_PENTA), lead: 'flute', density: 0.24, leadVol: 0.032, padVol: 0.03, bassVol: 0.05, bass: [0, 4], shaker: [] },
}

let musicGain: GainNode | null = null
let musicTimer: ReturnType<typeof setInterval> | undefined
let current: MusicTheme | null = null
let theme: Theme = THEMES.app
let nextStepAt = 0
let step = 0
let lastNote = 4
let noise: AudioBuffer | null = null

function voice(c: AudioContext, kind: Lead, f: number, t: number, vol: number, out: AudioNode) {
  const g = c.createGain()
  g.connect(out)
  const osc = (type: OscillatorType, freq: number, gain: number, dur: number, attack = 0.008) => {
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = type
    o.frequency.value = freq
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(gain, t + attack)
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(og).connect(g)
    o.start(t)
    o.stop(t + dur + 0.05)
    return o
  }
  g.gain.value = vol
  if (kind === 'marimba') {
    osc('sine', f, 1, 0.55)
    osc('sine', f * 4, 0.25, 0.12)
  } else if (kind === 'bell') {
    osc('sine', f * 2, 0.8, 2.4, 0.01)
    osc('sine', f * 2 * 2.76, 0.18, 0.9, 0.01)
  } else if (kind === 'epiano') {
    // a touch of FM: the bark of a Rhodes tine fading into a pure tone
    const car = osc('sine', f, 1, 1.6, 0.01)
    const mod = c.createOscillator()
    const mg = c.createGain()
    mod.frequency.value = f * 2
    mg.gain.setValueAtTime(f * 1.2, t)
    mg.gain.exponentialRampToValueAtTime(1, t + 0.6)
    mod.connect(mg).connect(car.frequency)
    mod.start(t)
    mod.stop(t + 1.7)
    osc('sine', f * 2, 0.12, 0.8)
  } else if (kind === 'pluck') {
    osc('triangle', f, 1, 0.45, 0.004)
  } else {
    // flute: a breathy sine with a slow, gentle vibrato
    const o = osc('sine', f, 1, 1.1, 0.09)
    const lfo = c.createOscillator()
    const lg = c.createGain()
    lfo.frequency.value = 5
    lg.gain.value = f * 0.006
    lfo.connect(lg).connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + 1.2)
    osc('triangle', f * 2, 0.06, 0.9, 0.09)
  }
}

function pad(c: AudioContext, freqs: number[], t: number, dur: number, vol: number, out: AudioNode) {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1200
  lp.connect(out)
  for (const f of freqs) {
    for (const det of [-6, 6]) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'triangle'
      o.frequency.value = f * 2
      o.detune.value = det
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.3))
      g.gain.setValueAtTime(vol, t + dur * 0.75)
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4)
      o.connect(g).connect(lp)
      o.start(t)
      o.stop(t + dur + 0.5)
    }
  }
}

function bassNote(c: AudioContext, f: number, t: number, vol: number, out: AudioNode) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.value = f
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.55)
}

function shaker(c: AudioContext, t: number, out: AudioNode) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = noise
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 6500
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.018, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  src.connect(hp).connect(g).connect(out)
  src.start(t)
  src.stop(t + 0.1)
}

function scheduleSteps() {
  const c = ctx
  if (!c || !musicGain) return
  const th = theme
  const eighth = 60 / th.bpm / 2
  while (nextStepAt < c.currentTime + 1.2) {
    const inBar = step % 8
    const bar = Math.floor(step / 8)
    const ch = th.chords[bar % th.chords.length]
    const t = Math.max(nextStepAt, c.currentTime + 0.03) + (inBar % 2 ? (th.swing ?? 0) * eighth : 0)
    if (inBar === 0) {
      pad(c, ch, t, eighth * 8, th.padVol, musicGain)
      if (th.bassVol) bassNote(c, ch[0] / 2, t, th.bassVol, musicGain)
    } else if (th.bass.includes(inBar) && th.bassVol) {
      bassNote(c, (inBar === 4 || inBar === 6 ? ch[ch.length > 2 ? 2 : 0] : ch[0]) / 2, t, th.bassVol * 0.8, musicGain)
    }
    if (th.shaker.includes(inBar)) shaker(c, t, musicGain)
    // melody: a gentle random walk; strong beats lean to the chord's notes; every fourth bar breathes
    const breathe = bar % 4 === 3 && inBar >= 4
    if (!breathe && Math.random() < th.density * (inBar % 2 ? 0.7 : 1.2)) {
      const sc = th.scale
      if (inBar % 4 === 0) {
        const pcs = ch.map((f) => ((Math.round(12 * Math.log2(f / 261.63)) % 12) + 12) % 12)
        const near = sc.map((f, i) => ({ i, pc: ((Math.round(12 * Math.log2(f / 261.63)) % 12) + 12) % 12 })).filter((x) => pcs.includes(x.pc))
        if (near.length) lastNote = near.reduce((b, x) => (Math.abs(x.i - lastNote) < Math.abs(b.i - lastNote) ? x : b)).i
      } else {
        lastNote += Math.round((Math.random() - 0.5) * 4)
      }
      lastNote = Math.max(1, Math.min(sc.length - 2, lastNote))
      voice(c, th.lead, sc[lastNote], t, th.leadVol, musicGain)
    }
    nextStepAt += eighth
    step++
  }
}

function startMusic(name: MusicTheme) {
  const c = audio()
  if (!c || !master) return
  if (current === name && musicTimer) return
  stopMusic()
  current = name
  theme = THEMES[name]
  musicGain = c.createGain()
  musicGain.gain.setValueAtTime(0.0001, c.currentTime)
  musicGain.gain.linearRampToValueAtTime(name === 'app' ? 0.9 : 1, c.currentTime + 2)
  musicGain.connect(master)
  nextStepAt = c.currentTime + 0.15
  step = 0
  lastNote = Math.floor(theme.scale.length / 2)
  scheduleSteps()
  musicTimer = setInterval(scheduleSteps, 250)
}

function stopMusic() {
  current = null
  if (!musicTimer || !ctx || !musicGain) return
  clearInterval(musicTimer)
  musicTimer = undefined
  const g = musicGain
  g.gain.cancelScheduledValues(ctx.currentTime)
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime)
  g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8)
  setTimeout(() => g.disconnect(), 1500)
  musicGain = null
}

let unlocked = false

interface MusicContext {
  /** the game being played, or null on the app screens */
  gameId: string | null
  inVoice: boolean
}

/** Call whenever something that affects the music changes (route, voice, settings, visibility). */
export function updateMusic(opts: MusicContext) {
  const wanted = settings().musicOn && !opts.inVoice && document.visibilityState === 'visible'
  const name: MusicTheme = opts.gameId && opts.gameId in THEMES ? (opts.gameId as MusicTheme) : 'app'
  if (wanted && unlocked) startMusic(name)
  else if (!wanted) stopMusic()
}

let lastOpts: MusicContext = { gameId: null, inVoice: false }

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

export function setMusicContext(opts: MusicContext) {
  lastOpts = opts
  updateMusic(opts)
}
