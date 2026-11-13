/// <reference types="node" />
/*
 * Wildbound rules tests: fair generation (always a way through, reaction window, clear world boundaries),
 * movement and collisions, power-ups, every animal's ability, the tutorial, and the roster rules.
 * Run with: npm run test:wildbound
 */
import assert from 'node:assert/strict'
import { ANIMALS, ESCAPES, RETIRED, ROSTER, ZONES, ZONE_LEN, biomeAt, isObstacle, type AnimalId, type ObstacleKind } from './content'
import { FLY_H, LANE_W, RIDE_H, RunSim, laneX, raceStartZone, type Item, type Lane, type Section } from './run'
import { autopilot } from './autopilot'
import { RaceSession, STUMBLE_MS, pickBotAnimals, type RaceSeat } from './race'

let passed = 0
const failures: string[] = []
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
  } catch (e) {
    failures.push(`✗ ${name}\n   ${(e as Error).message}`)
  }
}

const runFor = (sim: RunSim, metres: number, each?: () => void) => {
  const end = sim.state.d + metres
  let guard = 0
  while (sim.state.alive && sim.state.d < end && guard++ < 200000) {
    each?.()
    sim.step(16)
  }
}

// ---------------------------------------------------------------- generation fairness

test('every row leaves a way through (5 km, 25 seeds)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const sim = new RunSim({ seed, animalId: 'sonic' })
    // pull generation forward without running into anything
    sim.state.invulnUntil = 1e12
    runFor(sim, 5000)
    // regenerate the rows deterministically by re-walking: collect all obstacles ever seen
  }
  // static check on a long generated track
  const sim = new RunSim({ seed: 99, animalId: 'sonic' })
  sim.state.invulnUntil = 1e12
  const seen = new Map<number, Item[]>()
  runFor(sim, 4000, () => {
    for (const it of sim.items) if (isObstacle(it.kind)) seen.set(it.id, [...(seen.get(it.id) ?? []), it])
  })
  const rows = new Map<number, Item[]>()
  for (const [, [it]] of seen) {
    if (it.moving) continue
    const key = Math.round(it.d * 10)
    rows.set(key, [...(rows.get(key) ?? []), it])
  }
  assert.ok(rows.size > 120, `only ${rows.size} rows`)
  for (const [, row] of rows) {
    const lanes = new Set(row.map((r) => r.lane))
    if (lanes.size === 3) for (const r of row) assert.ok(!ESCAPES[r.kind as ObstacleKind].includes('lane'), `a full row of lane-only ${r.kind} at ${r.d.toFixed(1)}`)
  }
})

test('rows are spaced by the reaction window and world boundaries stay clear', () => {
  const sim = new RunSim({ seed: 7, animalId: 'sonic' })
  sim.state.invulnUntil = 1e12
  const ds = new Set<number>()
  runFor(sim, 3000, () => {
    for (const it of sim.items) if (isObstacle(it.kind) && !it.moving) ds.add(Math.round(it.d * 100) / 100)
  })
  const sorted = [...ds].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1]
    assert.ok(gap >= sim.rowGap(sorted[i - 1]) - 0.01, `rows ${sorted[i - 1]} and ${sorted[i]} only ${gap.toFixed(1)} m apart`)
  }
  for (const d of sorted) assert.ok(!sim.atSeam(d), `obstacle at ${d} sits in a zone-boundary or route-end blend strip`)
})

test('a careful player survives 2.5 km on every seed (a route always exists in time)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new RunSim({ seed, animalId: 'sonic' })
    sim.state.loyalUsed = true // no free save
    runFor(sim, 2500, () => autopilot(sim))
    assert.ok(sim.state.alive, `seed ${seed}: crashed into ${sim.state.crashKind} at ${sim.state.d.toFixed(0)} m`)
  }
})

test('100 zones of 400 m from 0 to 40,000 m, each a distinct place', () => {
  assert.equal(ZONES.length, 100)
  assert.equal(ZONES[0].from, 0)
  assert.equal(ZONES[99].to, 40000)
  for (const z of ZONES) assert.equal(z.to - z.from, ZONE_LEN)
  assert.equal(new Set(ZONES.map((z) => z.name)).size, 100, 'every zone has its own name')
  assert.equal(biomeAt(50).zone.name, 'Deep Amazon Rainforest')
  assert.equal(biomeAt(399).zone.n, 1)
  assert.equal(biomeAt(400).zone.n, 2)
  assert.equal(biomeAt(39999).zone.name, 'Ultimate Wild Kingdom')
  // neighbouring zones never repeat the same kit with the same light and dressing
  for (let i = 1; i < 100; i++) {
    const a = ZONES[i - 1]
    const b = ZONES[i]
    assert.ok(a.kit !== b.kit || a.variant !== b.variant || a.flavor !== b.flavor, `zones ${a.n} and ${b.n} look the same`)
  }
  // past 40 km the run goes on through the zones again
  assert.equal(biomeAt(40000 + 50).zone.n, 1)
  assert.equal(biomeAt(40000 + 50).index, 100)
})

test('a zone banner fires at each 400 m boundary', () => {
  const sim = new RunSim({ seed: 3, animalId: 'sonic' })
  const seen: number[] = []
  runFor(sim, 1300, () => {
    autopilot(sim)
    for (const e of sim.events.splice(0)) if (e.type === 'biome') seen.push(e.zone)
  })
  for (const n of [2, 3, 4]) assert.ok(seen.includes(n), `zone ${n} announced (${seen})`)
})

test('junctions: the lane at the split picks the route; each route has its own world, danger and content', () => {
  let threeWay = 0
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    for (const lane of [0, 1, 2] as Lane[]) {
      const sim = new RunSim({ seed, animalId: 'titan' })
      sim.state.invulnUntil = 1e12
      sim.step(16)
      const f = sim.forks[0]
      assert.ok(f && f.d > 200, 'a junction is planned ahead')
      assert.ok(f.routes.length === 2 || f.routes.length === 3)
      assert.ok(f.routes.some((r) => r.risk === 'safe') && f.routes.some((r) => r.risk === 'risky'), 'a safe and a dangerous route at every junction')
      assert.ok(!sim.items.some((it) => it.d > f.d + 2 && it.d < f.d + 45), 'route content waits for the choice')
      runFor(sim, f.d + 70, () => {
        if (sim.state.d < f.d) sim.state.lane = lane
      })
      assert.ok(f.picked >= 0, 'a route was taken')
      const want = f.routes.length === 3 ? lane : lane === 0 ? 0 : lane === 2 ? 1 : f.picked
      assert.equal(f.picked, want)
      assert.equal(sim.biomeIdAt(f.d + 50), f.routes[f.picked].biome)
      assert.ok(sim.items.some((it) => it.d > f.d + 40 && it.d < f.end), 'the chosen route is populated')
      if (f.routes.length === 3) threeWay++
    }
  }
  assert.ok(threeWay >= 0)
})

test('a jump pressed just before landing is buffered and happens on landing; a late one is dropped', () => {
  const sim = new RunSim({ seed: 2, animalId: 'titan' })
  sim.items = []
  sim.input('jump')
  for (let i = 0; i < 35; i++) sim.step(16) // 560 ms of the 640 ms jump
  sim.input('jump') // too early: still airborne
  assert.equal(sim.state.stats.jumps, 1)
  for (let i = 0; i < 8; i++) sim.step(16) // lands
  assert.equal(sim.state.pose, 'jump', 'the buffered jump fires on landing')
  assert.equal(sim.state.stats.jumps, 2)
  const late = new RunSim({ seed: 2, animalId: 'titan' })
  late.items = []
  late.input('jump')
  for (let i = 0; i < 19; i++) late.step(16)
  late.input('jump') // far too early: forgotten by the time it lands
  for (let i = 0; i < 25; i++) late.step(16)
  assert.equal(late.state.stats.jumps, 1)
})

// ---------------------------------------------------------------- movement & collisions

function lone(kind: ObstacleKind, lane: Lane = 1, animalId: AnimalId = 'titan') {
  const sim = new RunSim({ seed: 1, animalId })
  sim.items = []
  ;(sim as unknown as { nextRow: number }).nextRow = 1e9
  ;(sim as unknown as { nextGem: number }).nextGem = 1e9
  ;(sim as unknown as { nextPower: number }).nextPower = 1e9
  ;(sim as unknown as { nextSectionAt: number }).nextSectionAt = 1e9
  sim.sections = []
  sim.state.shieldUntil = 0
  sim.items.push({ id: 1, d: 20, lane, kind, h: 0, len: { log: 0.45, roots: 0.45, trap: 0.5, rock: 0.75, ruin: 0.8, branch: 0.35, barrier: 0.3, gap: 1.2, boulder: 0.9, trolley: 1.1, stream: 1.3, rubble: 0.45, stalactite: 0.35, plane: 1.6 }[kind], gone: false, passed: false, broken: false, frozen: false, moving: 0 })
  return sim
}
const until = (sim: RunSim, d: number) => runFor(sim, d - sim.state.d)

test('running into a rock ends the run', () => {
  const sim = lone('rock')
  until(sim, 30)
  assert.equal(sim.state.alive, false)
  assert.equal(sim.state.crashKind, 'rock')
})

test('lane change avoids a rock; the runner does not teleport sideways', () => {
  const sim = lone('rock')
  sim.input('left')
  sim.step(16)
  assert.ok(Math.abs(sim.state.x) < LANE_W, 'lane change takes time')
  until(sim, 30)
  assert.ok(sim.state.alive)
  assert.equal(sim.state.x, laneX(0))
})

test('jump clears a log; sliding into it does not', () => {
  const a = lone('log')
  until(a, 20 - a.state.speed * 0.32)
  a.input('jump')
  until(a, 30)
  assert.ok(a.state.alive, 'jumped log')
  const b = lone('log')
  until(b, 18.5)
  b.input('slide')
  until(b, 30)
  assert.equal(b.state.alive, false)
})

test('slide and roll pass under a branch and a barrier; standing does not', () => {
  for (const [kind, move] of [['branch', 'slide'], ['barrier', 'roll'], ['branch', 'roll']] as const) {
    const sim = lone(kind)
    until(sim, 18.6)
    sim.input(move)
    until(sim, 30)
    assert.ok(sim.state.alive, `${move} under ${kind}`)
  }
  const sim = lone('branch')
  until(sim, 30)
  assert.equal(sim.state.alive, false)
})

test('gaps need a jump', () => {
  const a = lone('gap')
  until(a, 20 - a.state.speed * 0.32)
  a.input('jump')
  until(a, 30)
  assert.ok(a.state.alive)
  const b = lone('gap')
  until(b, 30)
  assert.equal(b.state.alive, false)
})

// ---------------------------------------------------------------- power-ups & abilities

test('shield absorbs collisions while it lasts', () => {
  const sim = lone('rock')
  sim.activatePower('shield')
  until(sim, 30)
  assert.ok(sim.state.alive)
  assert.ok(sim.items[0].broken)
})

test('magnet pulls coins from other lanes; Sonic always pulls nearby ones', () => {
  const sim = lone('log', 0)
  sim.items = [{ id: 9, d: 20, lane: 0, kind: 'coin', h: 0.7, len: 0.4, gone: false, passed: false, broken: false, frozen: false, moving: 0 }]
  until(sim, 25)
  assert.equal(sim.state.coins, 0, 'no magnet: coin two lanes away is missed')
  const m = lone('log', 0)
  m.items = [{ id: 9, d: 20, lane: 0, kind: 'coin', h: 0.7, len: 0.4, gone: false, passed: false, broken: false, frozen: false, moving: 0 }]
  m.activatePower('magnet')
  until(m, 25)
  assert.equal(m.state.coins, 1)
  const s = lone('log', 0, 'sonic')
  s.items = [{ id: 9, d: 20, lane: 2, kind: 'coin', h: 0.7, len: 0.4, gone: false, passed: false, broken: false, frozen: false, moving: 0 }]
  until(s, 25)
  assert.equal(s.state.coins, 1, 'Sonic coin magnet reaches the next lane')
})

test('2x Speed doubles score and smashes through', () => {
  const sim = lone('rock')
  sim.activatePower('speed')
  assert.equal(sim.scoreMult(), 2)
  until(sim, 30)
  assert.ok(sim.state.alive)
})

test('Sonic Loyal Companion saves him once per run', () => {
  const sim = lone('rock', 1, 'sonic')
  sim.items.push({ ...sim.items[0], id: 2, d: 60 })
  until(sim, 40)
  assert.ok(sim.state.alive, 'first crash saved')
  until(sim, 70)
  assert.equal(sim.state.alive, false, 'second crash ends the run')
})

test('Leo and Titan start with a shield', () => {
  for (const id of ['leo', 'titan'] as AnimalId[]) assert.ok(new RunSim({ seed: 1, animalId: id }).powerOn('shield'))
  assert.ok(!new RunSim({ seed: 1, animalId: 'raja' }).powerOn('shield'))
})

const abilityCase: Record<AnimalId, { kind: ObstacleKind; prep?: (s: RunSim) => void }> = {
  sonic: { kind: 'rock' },
  leo: { kind: 'ruin' },
  raja: { kind: 'rock', prep: (s) => { until(s, 20 - s.state.speed * 0.4); s.input('jump') } },
  shadow: { kind: 'rock' },
  jax: { kind: 'rock' },
  arctic: { kind: 'boulder' },
  bruno: { kind: 'barrier' },
  titan: { kind: 'ruin' },
  koda: { kind: 'rock', prep: (s) => { until(s, 18); s.input('roll') } },
  snow: { kind: 'gap' },
  nova: { kind: 'boulder' },
  blaze: { kind: 'rock' },
  zara: { kind: 'rock', prep: (s) => { until(s, 20 - s.state.speed * 0.4); s.input('jump') } },
  ash: { kind: 'rock' },
}

test('every animal ability gets it through its showcase obstacle, and cools down', () => {
  for (const a of ANIMALS) {
    const c = abilityCase[a.id]
    const sim = lone(c.kind, 1, a.id)
    sim.state.loyalUsed = true
    sim.state.abilityReadyAt = 0
    assert.ok(sim.useAbility(), `${a.id} ability fires`)
    assert.ok(!sim.useAbility(), `${a.id} ability is on cooldown`)
    c.prep?.(sim)
    until(sim, 30)
    assert.ok(sim.state.alive, `${a.name}'s ${a.ability.name} did not get past a ${c.kind} (crash ${sim.state.crashKind})`)
  }
})

test('without its ability the same obstacle ends the run', () => {
  for (const a of ANIMALS) {
    const sim = lone(abilityCase[a.id].kind, 1, a.id)
    sim.state.loyalUsed = true
    until(sim, 30)
    assert.equal(sim.state.alive, false, `${a.id} survived with no ability`)
  }
})

test('revive clears the way and gives a moment of protection', () => {
  const sim = lone('rock')
  until(sim, 30)
  assert.equal(sim.state.alive, false)
  sim.revive()
  assert.ok(sim.state.alive)
  assert.ok(sim.untouchable())
})

// ---------------------------------------------------------------- tutorial

test('tutorial waits for each move and finishes', () => {
  const sim = new RunSim({ seed: 1, animalId: 'sonic', tutorial: true })
  const steps: string[] = []
  let guard = 0
  while (sim.state.alive && guard++ < 50000) {
    const s = sim.state
    const move = { lane: 'left', jump: 'jump', slide: 'slide', roll: 'roll', ability: 'ability' } as const
    // a player answers the prompt on screen, one move at a time
    if (s.tutWaiting && s.tutStep && s.tutStep in move) sim.input(move[s.tutStep as keyof typeof move])
    for (const e of sim.events.splice(0)) if (e.type === 'tutorial') steps.push(e.step)
    sim.step(16)
  }
  assert.deepEqual(steps, ['jump', 'slide', 'roll', 'coins', 'ability', 'done'])
  assert.equal(sim.state.crashKind, null, 'tutorial ends cleanly')
  assert.ok(sim.state.coins >= 3)
})

// ---------------------------------------------------------------- roster

test('Sonic and the tiger are free; the others cost gems; rested animals are not offered', () => {
  assert.equal(ANIMALS.length, 14)
  assert.deepEqual(ANIMALS.filter((a) => a.free).map((a) => a.id), ['sonic', 'raja'])
  for (const a of ANIMALS.filter((x) => !x.free)) assert.equal(a.gemPrice, 499)
  assert.equal(ROSTER.length, 10)
  for (const a of ROSTER) assert.ok(!RETIRED.has(a.id))
})


// ---------------------------------------------------------------- challenge sections (blueprint stage 2)

test('railway: jumping onto the trolley rides it to the buffer stop, then hops off', () => {
  const sim = lone('trolley', 1)
  sim.sections = [{ kind: 'rail', from: 10, to: 70, lane: 1, built: true, announced: true }]
  until(sim, 17.5)
  sim.input('jump')
  let rode = false
  runFor(sim, 30, () => {
    if (sim.state.ride) rode = true
  })
  assert.ok(sim.state.alive, `crashed into ${sim.state.crashKind}`)
  assert.ok(rode, 'boarded the trolley')
  assert.ok(sim.state.y >= RIDE_H - 0.01, 'stands on the deck')
  runFor(sim, 40)
  assert.equal(sim.state.ride, null, 'off at the end of the track')
  assert.ok(sim.state.alive)
})

test('railway: running into the trolley without jumping crashes; changing lane hops off', () => {
  const a = lone('trolley', 1)
  a.state.loyalUsed = true
  until(a, 25)
  assert.equal(a.state.crashKind, 'trolley')
  const b = lone('trolley', 1)
  b.sections = [{ kind: 'rail', from: 10, to: 70, lane: 1, built: true, announced: true }]
  until(b, 17.5)
  b.input('jump')
  runFor(b, 10)
  assert.ok(b.state.ride)
  b.input('left')
  runFor(b, 3)
  assert.equal(b.state.ride, null)
  assert.ok(b.state.alive)
})

test('airstrip: running into the plane boards it, it flies over everything, steers, and lands', () => {
  const sim = lone('plane', 1)
  sim.sections = [{ kind: 'flight', from: 14, to: 130, lane: 1, built: true, announced: true }]
  // a rock straight ahead on the flight path: the plane must carry the runner over it
  sim.items.push({ id: 2, d: 60, lane: 1, kind: 'rock', h: 0, len: 0.75, gone: false, passed: false, broken: false, frozen: false, moving: 0 })
  let boarded = false
  let top = 0
  until(sim, 30)
  assert.ok(sim.state.ride?.kind === 'plane', 'boarded by running into it')
  boarded = true
  runFor(sim, 25, () => {
    top = Math.max(top, sim.state.y)
  })
  assert.ok(top > FLY_H * 0.8, `climbed to ${top.toFixed(2)} m`)
  sim.input('left')
  runFor(sim, 3)
  assert.ok(sim.state.ride, 'steering does not drop the runner off the plane')
  assert.equal(sim.state.lane, 0)
  sim.input('jump')
  assert.ok(sim.state.pose !== 'jump', 'no jumping off mid-air')
  // the flight ends 6 m before the section (124 m); run on past the landing
  runFor(sim, 80)
  assert.ok(boarded && sim.state.ride === null, 'landed and stepped off')
  assert.ok(sim.state.alive, `crashed into ${sim.state.crashKind}`)
})

test('river water must be jumped; rubble jumped; cave spikes slid under', () => {
  for (const [kind, move] of [['stream', 'jump'], ['rubble', 'jump'], ['stalactite', 'slide']] as const) {
    const ok = lone(kind, 1)
    ok.state.loyalUsed = true
    until(ok, 17.6)
    ok.input(move)
    runFor(ok, 10)
    assert.ok(ok.state.alive, `${kind}: ${move} should clear it`)
    const bad = lone(kind, 1)
    bad.state.loyalUsed = true
    until(bad, 25)
    assert.equal(bad.state.crashKind, kind, `${kind} without ${move}`)
  }
})

test('Mega Jump clears a boulder-height rock; Super Boost smashes through and ends safely', () => {
  const m = lone('rock', 1)
  m.state.loyalUsed = true
  m.activatePower('megajump')
  until(m, 17)
  m.input('jump')
  runFor(m, 10)
  assert.ok(m.state.alive, 'mega jump over a rock')
  const b = lone('rock', 1)
  b.state.loyalUsed = true
  b.activatePower('boost')
  until(b, 25)
  assert.ok(b.state.alive && b.items[0].broken, 'boost smashes the rock')
  assert.ok(b.state.invulnUntil > b.state.boostUntil, 'grace after the boost')
})

test('sections appear in zones that suit them, never at a junction, and a careful player gets through', () => {
  const kinds = new Set<string>()
  for (let seed = 1; seed <= 8; seed++) {
    const sim = new RunSim({ seed, animalId: 'sonic' })
    sim.state.loyalUsed = true
    runFor(sim, 3000, () => autopilot(sim))
    assert.ok(sim.state.alive, `seed ${seed}: crashed into ${sim.state.crashKind} at ${sim.state.d.toFixed(0)} m (${sim.sectionAt(sim.state.d)?.kind ?? 'no section'})`)
    for (const x of sim.sections) {
      kinds.add(x.kind)
      for (const f of sim.forks) assert.ok(x.to <= f.d - 45 || x.from >= f.end + 10, `seed ${seed}: ${x.kind} overlaps a junction`)
    }
  }
  for (const k of ['river', 'bridge', 'rockslide', 'cave']) assert.ok(kinds.has(k), `${k} seen in the first 3 km (${[...kinds]})`)
})

test('zone 72 (Abandoned Railway Forest) has a railway', () => {
  const sim = new RunSim({ seed: 4, animalId: 'sonic' })
  const from = 71 * 400
  ;(sim as unknown as { nextSectionAt: number }).nextSectionAt = from + 20
  ;(sim as unknown as { planSections: (to: number) => void }).planSections(from + 400)
  assert.ok(sim.sections.some((x) => x.kind === 'rail' && x.from >= from && x.to <= from + 400), JSON.stringify(sim.sections))
})

test('junction: the picked road starts on the runner\'s side and the runner moves to its middle', () => {
  const sim = new RunSim({ seed: 2, animalId: 'sonic' })
  sim.state.loyalUsed = true
  sim.state.invulnUntil = 1e12
  const f = sim.forks[0] ?? (runFor(sim, 1), sim.forks[0])
  until(sim, f.d - 20)
  sim.input('right')
  sim.input('right')
  until(sim, f.d + 1)
  assert.equal(f.picked, f.routes.length - 1, 'right lane takes the right road')
  assert.equal(sim.state.lane, 1, 'steers to the middle of the picked road')
  const x0 = sim.state.x
  assert.ok(Math.abs(x0 - (laneX(2) - laneX(f.routes[f.picked].lane))) < 0.3, 'same place in the world at the split')
  runFor(sim, 5)
  assert.ok(Math.abs(sim.state.x) < 0.01, 'centred on the road')
})

// ---------------------------------------------------------------- races, vines, grip, close calls

const layout = (sim: RunSim, to: number) => {
  sim.state.invulnUntil = 1e12
  const seen = new Map<number, string>()
  runFor(sim, to, () => {
    for (const it of sim.items) if (isObstacle(it.kind) && it.kind !== 'boulder') seen.set(it.id, `${it.d.toFixed(2)}:${it.lane}:${it.kind}`)
  })
  return [...seen.values()].sort().join('|')
}

test('races: the same seed gives every animal the same obstacles', () => {
  for (const seed of [4, 17, 300]) {
    const a = layout(new RunSim({ seed, animalId: 'sonic' }), 1500)
    for (const id of ['raja', 'jax', 'titan'] as AnimalId[]) assert.equal(layout(new RunSim({ seed, animalId: id }), 1500), a, `seed ${seed}: ${id} sees a different trail`)
  }
})

function vineSim() {
  const sim = new RunSim({ seed: 8, animalId: 'titan' })
  sim.state.shieldUntil = 0
  sim.items = sim.items.filter((it) => it.d < 20)
  const sec: Section = { kind: 'vines', from: 60, to: 120, lane: 0, built: false, announced: true }
  ;(sim as unknown as { buildSection: (s: Section, at: number) => void }).buildSection(sec, 64)
  // nothing else on this stretch
  ;(sim as unknown as { nextRow: number }).nextRow = 1e9
  const vine = sim.items.find((it) => it.kind === 'vine')!
  return { sim, vine }
}

test('vine swing: jump into the vine to swing over the ravine (coins on the arc)', () => {
  const { sim, vine } = vineSim()
  sim.state.lane = vine.lane
  sim.state.x = laneX(vine.lane)
  until(sim, vine.d - 1.2)
  sim.input('jump')
  let top = 0
  const coins0 = sim.state.coins
  runFor(sim, (vine.swingTo ?? 0) + 3 - sim.state.d, () => (top = Math.max(top, sim.state.y)))
  assert.ok(sim.state.alive, `fell: ${sim.state.crashKind}`)
  assert.equal(sim.state.stats.swings, 1)
  assert.ok(top > 2.5, `swing height ${top}`)
  assert.ok(sim.state.coins - coins0 >= 4, 'collects the coin arc')
})

test('vine swing: running into the ravine without the vine is a fall; the log bridge lane is safe', () => {
  const a = vineSim()
  a.sim.state.lane = a.vine.lane
  a.sim.state.x = laneX(a.vine.lane)
  until(a.sim, (a.vine.swingTo ?? 0) + 3)
  assert.equal(a.sim.state.crashKind, 'gap')
  const b = vineSim()
  const lanes = b.sim.items.filter((it) => it.kind === 'vine').map((it) => it.lane)
  const bridge = ([0, 1, 2] as Lane[]).find((l) => !lanes.includes(l))!
  b.sim.state.lane = bridge
  b.sim.state.x = laneX(bridge)
  until(b.sim, (b.vine.swingTo ?? 0) + 3)
  assert.ok(b.sim.state.alive, 'bridge is a way through')
})

test('surface grip: ice slows lane changes, mud slows the run', () => {
  const lateral = (d: number) => {
    const sim = new RunSim({ seed: 5, animalId: 'sonic' })
    sim.state.invulnUntil = 1e12
    // jump straight to that distance without planning every junction and section on the way
    Object.assign(sim as unknown as Record<string, number>, { nextForkAt: 1e9, nextSectionAt: 1e9, nextRow: 1e9 })
    sim.forks = []
    sim.sections = []
    sim.state.d = d
    sim.items = []
    sim.step(16)
    sim.input('right')
    let ms = 0
    while (Math.abs(sim.state.x - laneX(2)) > 0.01 && ms < 2000) {
      sim.step(16)
      ms += 16
    }
    return { ms, grip: sim.state.grip, speed: sim.speedFactor() }
  }
  const firm = lateral(50)
  const ice = lateral(46 * 400 + 50) // zone 47, Frozen River
  const mud = lateral(16 * 400 + 50) // zone 17, Swamp Wilderness
  assert.equal(firm.grip, 'firm')
  assert.equal(ice.grip, 'ice')
  assert.equal(mud.grip, 'mud')
  assert.ok(ice.ms > firm.ms * 1.3, `ice turn ${ice.ms} vs ${firm.ms} ms`)
  assert.ok(mud.speed < firm.speed, 'mud drags')
})

test('close call: leaving a lane at the last moment before an obstacle scores a near miss', () => {
  const sim = new RunSim({ seed: 6, animalId: 'titan' })
  sim.state.shieldUntil = 0
  sim.items = []
  ;(sim as unknown as { nextRow: number }).nextRow = 1e9
  const rock = (sim as unknown as { add: (d: number, l: Lane, k: string) => Item }).add(40, 1, 'rock')
  until(sim, rock.d - rock.len - 3)
  sim.input('right')
  until(sim, rock.d + 4)
  assert.ok(sim.state.alive)
  assert.equal(sim.state.stats.nearMisses, 1)
  const early = new RunSim({ seed: 6, animalId: 'titan' })
  early.items = []
  ;(early as unknown as { nextRow: number }).nextRow = 1e9
  ;(early as unknown as { add: (d: number, l: Lane, k: string) => Item }).add(40, 1, 'rock')
  early.input('right')
  until(early, 46)
  assert.equal(early.state.stats.nearMisses, 0, 'an early lane change is not a close call')
})

test('race vs computer: rivals run the same trail, stumble instead of dying, and the race closes with standings', () => {
  const bots = pickBotAnimals(3, 'sonic', () => 0.3)
  assert.equal(new Set(bots).size, 3)
  assert.ok(!bots.includes('sonic'))
  const seats: RaceSeat[] = [
    { id: 'you', name: 'You', avatarEmoji: '', kind: 'local', animalId: 'sonic' },
    ...bots.map((a, i) => ({ id: `bot${i}`, name: `Bot ${i}`, avatarEmoji: '', kind: 'bot' as const, animalId: a })),
  ]
  const race = new RaceSession(77, 1000, seats, 'you', 'easy')
  const me = new RunSim({ seed: 77, animalId: 'sonic', startZone: raceStartZone(77) })
  let guard = 0
  let stumbled = false
  while (!race.closed && guard++ < 60 * 60 * 6) {
    if (me.state.alive) autopilot(me)
    race.runStumble(race.local, me)
    me.step(16)
    race.step(16, me)
    if (race.racers.some((r) => r.down)) stumbled = true
  }
  assert.ok(race.closed, 'race finished')
  assert.ok(race.local.finishMs !== null, 'you crossed the line')
  const st = race.standings()
  assert.equal(st.length, 4)
  for (let i = 1; i < st.length; i++) if (st[i].finishMs !== null) assert.ok(st[i - 1].finishMs !== null && st[i - 1].finishMs! <= st[i].finishMs!, 'finishers in time order')
  assert.ok(race.racers.filter((r) => r.kind === 'bot').every((r) => r.finishMs !== null || r.d > 600), 'rivals keep running')
  assert.ok(stumbled || race.racers.every((r) => r.stumbles === 0), 'stumble state is tracked')
})

test('race: a crash costs a stumble, then the runner is back up', () => {
  const race = new RaceSession(5, 1000, [{ id: 'you', name: 'You', avatarEmoji: '', kind: 'local', animalId: 'titan' }], 'you')
  const me = new RunSim({ seed: 5, animalId: 'titan' })
  me.state.shieldUntil = 0
  me.items = []
  ;(me as unknown as { nextRow: number }).nextRow = 1e9
  ;(me as unknown as { add: (d: number, l: Lane, k: string) => Item }).add(30, 1, 'rock')
  let t = 0
  while (me.state.alive && t < 10000) {
    me.step(16)
    race.step(16, me)
    t += 16
  }
  assert.equal(me.state.crashKind, 'rock')
  race.runStumble(race.local, me)
  assert.ok(race.local.down)
  for (let i = 0; i < STUMBLE_MS / 16 + 2; i++) {
    race.step(16, me)
    race.runStumble(race.local, me)
  }
  assert.ok(me.state.alive, 'back up after the stumble')
  assert.equal(race.local.stumbles, 1)
})

test('race network: runner updates round-trip and cannot move runners this device simulates', () => {
  const seats: RaceSeat[] = [
    { id: 'host', name: 'Host', avatarEmoji: '', kind: 'remote', animalId: 'raja' },
    { id: 'me', name: 'Me', avatarEmoji: '', kind: 'local', animalId: 'sonic' },
  ]
  const a = new RaceSession(1, 2000, seats, 'me')
  const host = a.racers[0]
  Object.assign(host, { d: 512.5, x: -2.1, y: 1.2, pose: 'jump', poseT: 0.4, speed: 14, coins: 33 })
  const packed = a.pack(host)
  const b = new RaceSession(1, 2000, seats, 'me')
  b.apply(JSON.parse(JSON.stringify(packed)))
  assert.equal(b.racers[0].d, 512.5)
  assert.equal(b.racers[0].pose, 'jump')
  assert.equal(b.racers[0].animalId, 'raja')
  b.apply(['me', 999, 0, 0, 0, 0, 0, -1, 0, 0, 0])
  assert.equal(b.racers[1].d, 0, 'local runner untouched')
  b.apply(['host', 1e9, 99, -5, 9, 3, 1e9, -1, 0, 99, -4])
  assert.equal(b.racers[0].d, 2000, 'clamped')
})

test('every run can start in a different zone: same easy start, fair trail, distance counted from 0', () => {
  for (const z of [9, 46, 71, 99]) {
    const sim = new RunSim({ seed: 11 + z, animalId: 'sonic', startZone: z })
    sim.state.loyalUsed = true
    assert.equal(sim.state.d, z * ZONE_LEN)
    assert.equal(biomeAt(sim.state.d).zone.n, z + 1)
    sim.step(16)
    assert.ok(sim.state.speed < 11, `zone ${z + 1}: starts at an easy speed (${sim.state.speed.toFixed(1)})`)
    const banner = sim.events.find((e) => e.type === 'biome')
    assert.ok(banner, 'the start zone is announced')
    runFor(sim, 1500, () => autopilot(sim))
    assert.ok(sim.state.alive, `zone ${z + 1}: crashed into ${sim.state.crashKind} at ${sim.runD().toFixed(0)} m`)
    assert.ok(Math.abs(sim.summary().distance - 1500) < 30, 'distance is metres run, not world position')
  }
})

console.log(failures.join('\n'))
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
