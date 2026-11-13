import { useEffect, useRef, useState } from 'react'
import type { Section } from '../engine/run'
import { onSimEvent, run } from '../scene/runController'
import { haptic, sfx } from './sfx'
import { SURPRISE_SECTIONS } from '../engine/content'
import { challengeTally, nameOf, resetChallengeTally, textOf } from './challenges'

/*
 * The challenge card (design brief §7 challenge stars, §9 clear success response): one glass card under the top bar
 * that follows each challenge section through three states:
 *   ahead  – the name, what to do and the distance to it (replaces the old centre banner, so nothing is doubled)
 *   live   – a thin progress line while the runner is inside it
 *   done   – "Cleared" with 1-3 stars and the bonus: 1 for getting through, 1 for doing it without a save (shield or
 *            Sonic's extra life), 1 for collecting 80% of its coins
 * A crash inside a challenge simply drops the card. Bonus score is added in solo runs only (races stay even).
 */

/** the run the tally belongs to (a revive keeps the same run, a retry starts a new one) */
let tallyRun: object | null = null
/** the bonus for clearing all three gauntlet legs in a row */
const GAUNTLET_BONUS = 1000
/** the bonus for each star */
const STAR_BONUS = 100
/** how long the cleared card stays up (ms) */
const DONE_MS = 2100

type Card =
  | { mode: 'ahead'; kind: string; dist: number; leg?: number }
  | { mode: 'live'; kind: string; p: number; leg?: number }
  | { mode: 'done'; kind: string; stars: number; bonus: number; id: number; leg?: number; conquered?: boolean }

interface Track {
  sec: Section
  coins: number
  got: number
  saved: boolean
}

export default function ChallengeHud({ runKey, solo }: { runKey: number; solo: boolean }) {
  const [card, setCard] = useState<Card | null>(null)
  const track = useRef<Track | null>(null)
  const done = useRef<{ until: number; card: Card } | null>(null)
  const finished = useRef(new WeakSet<Section>())
  /** gauntlet legs cleared in a row */
  const streak = useRef(0)

  useEffect(() => {
    track.current = null
    done.current = null
    finished.current = new WeakSet()
  }, [runKey])

  // coins picked up and saves used inside the challenge; a crash ends it
  useEffect(
    () =>
      onSimEvent((e) => {
        const t = track.current
        if (!t) return
        if (e.type === 'coin' && e.d >= t.sec.from - 6 && e.d <= t.sec.to + 2) t.got++
        else if (e.type === 'saved' && (e.by === 'shield' || e.by === 'loyal')) t.saved = true
        else if (e.type === 'crash') {
          streak.current = 0
          finished.current.add(t.sec)
          track.current = null
        }
      }),
    [],
  )

  useEffect(() => {
    let raf = 0
    let last = 0
    let shown = ''
    // while the junction route cards are up (RouteChooser: an unchosen split within 110 m) the choice matters more:
    // the card steps aside (tracking, the cleared sound and the sweep carry on)
    let routeUp = false
    const show = (c: Card | null) => {
      if (routeUp) c = null
      const key = c ? `${c.mode}|${c.kind}|${c.mode === 'ahead' ? Math.ceil(c.dist / 5) : c.mode === 'live' ? Math.round(c.p * 60) : c.id}` : ''
      if (key === shown) return
      shown = key
      setCard(c)
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 50) return
      last = now
      const sim = run.sim
      if (!sim) return show(null)
      if (sim !== tallyRun) {
        tallyRun = sim
        resetChallengeTally()
        finished.current = new WeakSet()
        track.current = null
      }
      const s = sim.state
      routeUp = sim.forks.some((f) => f.picked < 0 && f.d - s.d < 110 && f.d - s.d > -1)
      if (done.current) {
        if (now < done.current.until) return show(done.current.card)
        done.current = null
      }
      const t = track.current
      if (t) {
        if (!s.alive) return show(null)
        if (s.d >= t.sec.to) {
          // through it alive
          finished.current.add(t.sec)
          track.current = null
          const stars = 1 + (t.saved ? 0 : 1) + (t.coins === 0 || t.got >= t.coins * 0.8 ? 1 : 0)
          const leg = t.sec.gauntlet
          if (leg) streak.current = leg === 1 ? 1 : streak.current === leg - 1 ? leg : 0
          const conquered = leg === 3 && streak.current === 3
          if (conquered) challengeTally.gauntlets++
          const bonus = solo ? stars * STAR_BONUS + (conquered ? GAUNTLET_BONUS : 0) : 0
          if (bonus) s.score += bonus
          challengeTally.cleared++
          challengeTally.kinds.push(t.sec.kind)
          challengeTally.stars += stars
          challengeTally.bonus += bonus
          if (stars === 3) challengeTally.perfect++
          sfx.cleared(stars)
          haptic(stars === 3 ? 60 : 30)
          const c: Card = { mode: 'done', kind: t.sec.kind, stars, bonus, id: now, leg, conquered }
          done.current = { until: now + DONE_MS, card: c }
          window.dispatchEvent(new CustomEvent('wb-cleared', { detail: stars }))
          return show(c)
        }
        return show({ mode: 'live', kind: t.sec.kind, leg: t.sec.gauntlet, p: Math.max(0, Math.min(1, (s.d - t.sec.from) / Math.max(1, t.sec.to - t.sec.from))) })
      }
      if (!s.alive) return show(null)
      const next = sim.sections.filter((x) => x.announced && x.to > s.d && !finished.current.has(x)).sort((a, b) => a.from - b.from)[0]
      if (!next) return show(null)
      if (s.d >= next.from) {
        // entering: count what there is to collect
        const coins = sim.items.filter((it) => it.kind === 'coin' && !it.gone && it.d >= next.from - 6 && it.d <= next.to + 2).length
        track.current = { sec: next, coins, got: 0, saved: false }
        challengeTally.seen++
        return show({ mode: 'live', kind: next.kind, leg: next.gauntlet, p: 0 })
      }
      const dist = next.from - s.d
      show(dist < 75 ? { mode: 'ahead', kind: next.kind, dist, leg: next.gauntlet } : null)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [runKey, solo])

  if (!card) return null
  const t = textOf(card.kind)
  return (
    <div className={`wb-chal ${card.leg ? 'is-gauntlet' : ''}`} data-mode={card.mode} key={card.mode === 'done' ? card.id : card.mode + card.kind}>
      <div className="wb-chal-top">
        <span className="wb-chal-eyebrow">
          {card.mode === 'done' && card.conquered
            ? 'Gauntlet conquered'
            : card.leg
              ? `Final gauntlet · ${card.leg}/3`
              : (SURPRISE_SECTIONS as string[]).includes(card.kind)
                ? card.mode === 'ahead'
                  ? 'Surprise ahead'
                  : 'Surprise'
                : card.mode === 'done'
                  ? 'Challenge cleared'
                  : card.mode === 'live'
                    ? 'Challenge'
                    : 'Challenge ahead'}
        </span>
        {card.mode === 'ahead' && <span className="wb-chal-dist">{Math.max(0, Math.ceil(card.dist / 5) * 5)} m</span>}
        {card.mode === 'done' && card.bonus > 0 && <span className="wb-chal-dist">+{card.bonus}</span>}
      </div>
      <div className="wb-chal-name">{nameOf(card.kind)}</div>
      {card.mode === 'ahead' && t.small && <div className="wb-chal-hint">{t.small}</div>}
      {card.mode === 'live' && (
        <div className="wb-chal-bar">
          <span style={{ transform: `scaleX(${card.p})` }} />
        </div>
      )}
      {card.mode === 'done' && (
        <div className="wb-chal-stars" aria-label={`${card.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} on={i < card.stars} delay={i * 140} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Star({ on, delay = 0, size = 22 }: { on: boolean; delay?: number; size?: number }) {
  return (
    <svg className={`wb-star ${on ? 'is-on' : ''}`} style={{ animationDelay: `${delay}ms` }} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.8l2.75 5.86 6.4.74-4.74 4.37 1.27 6.33L12 16.9l-5.68 3.2 1.27-6.33L2.85 9.4l6.4-.74z" />
    </svg>
  )
}
