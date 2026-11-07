import { RunSim, type RunOptions, type SimEvent } from '../engine/run'
import type { RaceSession } from '../engine/race'
import { assistStep } from '../engine/autopilot'

/*
 * Owns the live run. The 3D scene steps the simulation once per rendered frame (so motion and logic never
 * drift apart) and every simulation event is fanned out to the scene (particles, camera shake) and the UI
 * (sounds, toasts, HUD) through listeners. In a race it also steps the race (rivals, stumbles, finish line).
 */

export type RunPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'over'

type Listener = (e: SimEvent) => void

export const run = {
  sim: null as RunSim | null,
  /** the race this run is part of (Play with Friends / vs Computer), if any */
  race: null as RaceSession | null,
  phase: 'idle' as RunPhase,
  /** ms left on the 3-2-1 countdown */
  countdown: 0,
  /** camera shake strength, decays in the scene */
  shake: 0,
  /** ms of slow motion left (close calls); never in races */
  slow: 0,
  /** assisted controls: jumps and slides are timed for the player */
  assist: false,
  /** shaders and textures are ready (the countdown waits for the scene's warm-up) */
  warm: true,
  listeners: new Set<Listener>(),
  phaseListeners: new Set<(p: RunPhase) => void>(),
}

/** Menu scenes (home lineup, character preview): ground speed and the celebration after Select. */
export const showcase = { speed: 6.5, target: 6.5, victory: false }

export function setPhase(p: RunPhase) {
  if (run.phase === p) return
  run.phase = p
  for (const l of run.phaseListeners) l(p)
}

export function startRun(opts: RunOptions, countdownMs = 2400, race: RaceSession | null = null) {
  run.sim = new RunSim(opts)
  run.race = race
  run.countdown = countdownMs
  run.shake = 0
  run.slow = 0
  setPhase(countdownMs > 0 ? 'countdown' : 'running')
}

export function endRun() {
  run.sim = null
  run.race = null
  setPhase('idle')
}

export function onSimEvent(l: Listener) {
  run.listeners.add(l)
  return () => void run.listeners.delete(l)
}

export function onPhase(l: (p: RunPhase) => void) {
  run.phaseListeners.add(l)
  return () => void run.phaseListeners.delete(l)
}

/** Advance the run by one rendered frame. */
export function tickRun(dtMs: number) {
  const sim = run.sim
  if (!sim) return
  if (run.phase === 'countdown') {
    // hold on "3" until the scene has finished compiling, so nothing freezes mid-run
    if (!run.warm) return
    run.countdown -= dtMs
    if (run.countdown <= 0) setPhase('running')
    return
  }
  const race = run.race
  if (run.phase === 'running') {
    // a close call slows time for a moment (solo runs only: in a race it would cost real time)
    let dt = dtMs
    if (run.slow > 0 && !race) {
      run.slow -= dtMs
      dt *= 0.42
    }
    if (run.assist && !race) assistStep(sim)
    sim.step(dt)
    if (sim.events.length) {
      const evs = sim.events.splice(0, sim.events.length)
      for (const e of evs) {
        if (e.type === 'crash') run.shake = 1
        else if (e.type === 'saved' || e.type === 'break') run.shake = Math.max(run.shake, 0.35)
        for (const l of run.listeners) l(e)
      }
    }
  }
  if (race) {
    // in a race a crash is a stumble, and only the finish line (or the race closing) ends the run
    if (run.phase === 'running' || run.phase === 'over') {
      race.runStumble(race.local, sim)
      race.step(dtMs, sim)
    }
    if (race.local.finishMs !== null || race.closed) setPhase('over')
    return
  }
  if (!sim.state.alive) setPhase('over')
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __wbRun: typeof run }).__wbRun = run
