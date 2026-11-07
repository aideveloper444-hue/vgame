/// <reference types="node" />
/*
 * Rules test suite (QA matrix: hand ranks, kickers, ties, split and side pots, short all-ins, blind
 * all-ins, uncalled bets, fold to win, heads-up button, timeouts, privacy, replay).
 * Run with: npm run test:poker
 */
import assert from 'node:assert/strict'
import { evaluate } from './evaluator'
import { freshDeck } from './cards'
import { decideBot } from './bot'
import {
  act,
  createTable,
  holeCards,
  legalActions,
  publicView,
  replayHand,
  sitDown,
  startHand,
  timeout,
  type HandInput,
  type PlayerAction,
  type TableState,
} from './table'

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

const h = (s: string) => s.split(' ')
const cat = (s: string) => evaluate(h(s)).name
const beats = (a: string, b: string) => evaluate(h(a)).score > evaluate(h(b)).score
const ties = (a: string, b: string) => evaluate(h(a)).score === evaluate(h(b)).score

/* ------------------------------------------------------------ evaluator */

test('royal flush through high card', () => {
  assert.equal(cat('As Ks Qs Js Ts 2d 3c'), 'Royal Flush')
  assert.equal(cat('9h 8h 7h 6h 5h Ad Ac'), 'Straight Flush')
  assert.equal(cat('9h 9d 9s 9c 5h Ad Kc'), 'Four of a Kind')
  assert.equal(cat('9h 9d 9s 5c 5h Ad Kc'), 'Full House')
  assert.equal(cat('2h 9h Jh 5h Kh Ad Kc'), 'Flush')
  assert.equal(cat('5d 6h 7s 8c 9h Ad Kc'), 'Straight')
  assert.equal(cat('9h 9d 9s 2c 5h Ad Kc'), 'Three of a Kind')
  assert.equal(cat('9h 9d 2s 2c 5h Ad Kc'), 'Two Pair')
  assert.equal(cat('9h 9d 2s 3c 5h Ad Kc'), 'One Pair')
  assert.equal(cat('9h Td 2s 3c 5h Ad Kc'), 'High Card')
})

test('wheel is the lowest straight', () => {
  assert.equal(cat('Ah 2d 3s 4c 5h 9d Kc'), 'Straight')
  assert.ok(beats('2h 3d 4s 5c 6h 9d Kc', 'Ah 2d 3s 4c 5h 9d Kc'))
  assert.ok(beats('Ah Kd Qs Jc Th 2d 3c', 'Ah 2d 3s 4c 5h 9d Kc'))
})

test('kicker comparison', () => {
  assert.ok(beats('Ah Ad Ks 7c 5h 3d 2c', 'Ah Ad Qs 7c 5h 3d 2c'))
  assert.ok(beats('Kh Kd 9s 9c Ah 3d 2c', 'Kh Kd 9s 9c Qh 3d 2c'))
  assert.ok(beats('Qh Qd Qs 9c 8h', 'Qh Qd Qs 9c 7h'))
})

test('board plays: tie', () => {
  assert.ok(ties('2h 3d As Ks Qs Js Ts', '4h 5d As Ks Qs Js Ts'))
  assert.ok(ties('Ah Kd 7s 7c 9h 9d Jc', 'As Kc 7s 7c 9h 9d Jc'))
})

/* ------------------------------------------------------------ table helpers */

const NOW = 1_000_000
function table(stacks: number[], sb = 50, bb = 100): TableState {
  let s = createTable({ tableId: 't1', name: 'Test', smallBlind: sb, bigBlind: bb, turnMs: 15000, maxSeats: 6 })
  stacks.forEach((stack, i) => {
    if (stack > 0) s = sitDown(s, i, { id: `p${i}`, name: `P${i}`, avatar: '', kind: 'human', stack })
  })
  return s
}

/** Deck that deals the given hole cards (in deal order from left of the button) and then the board. */
function rigged(holesInDealOrder: string[][], board: string[]): string[] {
  const top: string[] = []
  for (let r = 0; r < 2; r++) for (const hc of holesInDealOrder) top.push(hc[r])
  const burn = (k: number) => `burn${k}`
  const seq = [...top, burn(1), board[0], board[1], board[2], burn(2), board[3], burn(3), board[4]]
  const used = new Set(seq)
  const rest = freshDeck().filter((c) => !used.has(c))
  // burn placeholders must be real cards that are unused
  return seq.map((c) => (c.startsWith('burn') ? rest.shift()! : c)).concat(rest)
}

function play(s: TableState, ...moves: [number, PlayerAction][]): TableState {
  for (const [seat, a] of moves) {
    const r = act(s, seat, a, NOW)
    if (!r.ok) throw new Error(`seat ${seat} ${a.type} ${a.amount ?? ''}: ${r.code} ${r.reason} (active ${s.active})`)
    s = r.state
  }
  return s
}
const chipsTotal = (s: TableState) => s.seats.reduce((t, x) => t + (x?.stack ?? 0), 0)

/* ------------------------------------------------------------ rules */

test('blinds, first to act, dealer rotation (3-handed)', () => {
  let s = startHand(table([1000, 1000, 1000]), NOW)
  assert.equal(s.dealer, 0)
  assert.equal(s.sb, 1)
  assert.equal(s.bb, 2)
  assert.equal(s.active, 0, 'UTG (left of BB) acts first pre-flop')
  s = play(s, [0, { type: 'fold' }], [1, { type: 'fold' }])
  assert.equal(s.phase, 'complete')
  s = startHand(s, NOW)
  assert.equal(s.dealer, 1, 'button moves one seat left')
})

test('heads-up button rules', () => {
  let s = startHand(table([1000, 1000]), NOW)
  assert.equal(s.dealer, 0)
  assert.equal(s.sb, 0, 'button posts the small blind')
  assert.equal(s.bb, 1)
  assert.equal(s.active, 0, 'button acts first pre-flop')
  s = play(s, [0, { type: 'call' }], [1, { type: 'check' }])
  assert.equal(s.phase, 'flop')
  assert.equal(s.active, 1, 'big blind acts first after the flop')
})

test('fold to win: uncontested, no cards shown, chips conserved', () => {
  let s = startHand(table([1000, 1000, 1000]), NOW)
  s = play(s, [0, { type: 'raise', amount: 300 }], [1, { type: 'fold' }], [2, { type: 'fold' }])
  assert.equal(s.result!.uncontested, true)
  assert.deepEqual(Object.keys(s.result!.reveals), [])
  assert.equal(s.seats[0]!.stack, 1150)
  assert.equal(chipsTotal(s), 3000)
})

test('check / call legality and minimum raise', () => {
  let s = startHand(table([1000, 1000, 1000]), NOW)
  const l = legalActions(s, 0)!
  assert.equal(l.canCheck, false)
  assert.equal(l.toCall, 100)
  assert.equal(l.minTo, 200)
  assert.equal(act(s, 0, { type: 'check' }, NOW).ok, false)
  assert.equal(act(s, 0, { type: 'raise', amount: 150 }, NOW).ok, false, 'below min raise')
  assert.equal(act(s, 1, { type: 'fold' }, NOW).ok, false, 'not your turn')
  s = play(s, [0, { type: 'raise', amount: 300 }])
  assert.equal(legalActions(s, 1)!.minTo, 500, 'next raise at least the last increment')
})

test('big blind option', () => {
  let s = startHand(table([1000, 1000, 1000]), NOW)
  s = play(s, [0, { type: 'call' }], [1, { type: 'call' }])
  assert.equal(s.active, 2)
  assert.equal(legalActions(s, 2)!.canCheck, true)
  assert.equal(legalActions(s, 2)!.canRaise, true)
})

test('split pot with odd chip to first seat left of the button', () => {
  // seats 0 (button) 1 (sb) 2 (bb); deal order 1,2,0
  const deck = rigged([['2c', '3d'], ['2d', '3c'], ['4h', '5h']], ['As', 'Ks', 'Qs', 'Js', 'Ts'])
  let s = startHand(table([1000, 1000, 1000], 25, 50), NOW, deck)
  s = play(s, [0, { type: 'fold' }], [1, { type: 'call' }], [2, { type: 'check' }])
  // the folded button's nothing; 1 and 2 each put 50: 100 split
  for (let k = 0; k < 3; k++) s = play(s, [1, { type: 'check' }], [2, { type: 'check' }])
  assert.equal(s.phase, 'complete')
  assert.deepEqual(s.result!.winners.sort(), [1, 2])
  assert.equal(s.seats[1]!.stack, 1000)
  assert.equal(s.seats[2]!.stack, 1000)
})

test('odd chip goes to the first winner left of the button', () => {
  // sb 5 folds into a 25 pot that the button (seat 0) and big blind (seat 2) split: 13 / 12
  const deck = rigged([['2c', '3d'], ['2d', '3c'], ['4h', '5h']], ['As', 'Ks', 'Qs', 'Js', 'Ts'])
  let s = startHand(table([1000, 1000, 1000], 5, 10), NOW, deck)
  s = play(s, [0, { type: 'call' }], [1, { type: 'fold' }], [2, { type: 'check' }])
  while (s.phase !== 'complete') s = play(s, [s.active, { type: 'check' }])
  assert.equal(s.result!.pots[0].amount, 25)
  assert.equal(s.seats[2]!.stack, 1003, 'big blind is first left of the button among the winners')
  assert.equal(s.seats[0]!.stack, 1002)
})

test('side pots: short all-in wins main pot, bigger stack wins side pot', () => {
  // seat 0 button 500, seat 1 sb 3000, seat 2 bb 3000
  // deal order: 1, 2, 0
  const deck = rigged([['Kd', 'Kc'], ['Qd', 'Qc'], ['Ah', 'Ad']], ['2s', '7h', '9c', '3d', '8s'])
  let s = startHand(table([500, 3000, 3000]), NOW, deck)
  s = play(s, [0, { type: 'allin' }], [1, { type: 'raise', amount: 1500 }], [2, { type: 'call' }])
  // 1 and 2 still have chips: they play on
  while (s.phase !== 'complete') s = play(s, [s.active, { type: 'check' }])
  const pots = s.result!.pots
  assert.equal(pots.length, 2)
  assert.equal(pots[0].amount, 1500)
  assert.deepEqual(pots[0].winners, [0], 'aces win the main pot')
  assert.equal(pots[1].amount, 2000)
  assert.deepEqual(pots[1].winners, [1], 'kings win the side pot')
  assert.equal(s.seats[0]!.stack, 1500)
  assert.equal(s.seats[1]!.stack, 3500)
  assert.equal(s.seats[2]!.stack, 1500)
})

test('uncalled bet is returned', () => {
  let s = startHand(table([1000, 5000]), NOW)
  // heads-up: 0 is button/sb
  s = play(s, [0, { type: 'allin' }], [1, { type: 'fold' }])
  assert.equal(s.seats[0]!.stack, 1100)
  const deck = rigged([['Ah', 'Ad'], ['Kd', 'Kc']], ['2s', '7h', '9c', '3d', '8s'])
  // 2nd hand: dealer moves to seat 1 (sb), seat 0 is bb; deal order 0 then 1
  s = startHand(s, NOW, deck)
  s = play(s, [1, { type: 'allin' }], [0, { type: 'call' }])
  const returned = s.result!.pots.find((p) => p.returned)
  assert.ok(returned, 'excess over the covered amount comes back')
  assert.equal(returned!.amount, 4900 - 1100)
  assert.equal(s.seats[0]!.stack + s.seats[1]!.stack, 6000)
})

test('short all-in raise does not reopen action', () => {
  // seat 0 btn 10000, 1 sb 10000, 2 bb 10000, 3 utg 650
  let s = startHand(table([10000, 10000, 10000, 650]), NOW)
  assert.equal(s.active, 3)
  s = play(s, [3, { type: 'call' }], [0, { type: 'raise', amount: 500 }], [1, { type: 'fold' }], [2, { type: 'call' }])
  // UTG (seat 3, already acted) faces a full raise: can raise, goes all-in for 650 (short: +150 < 400)
  s = play(s, [3, { type: 'allin' }])
  assert.equal(s.currentBet, 650)
  const l0 = legalActions(s, 0)!
  assert.equal(l0.canRaise, false, 'the raiser may only call or fold after a short all-in')
  assert.equal(l0.toCall, 150)
  s = play(s, [0, { type: 'call' }])
  assert.equal(legalActions(s, 2)!.canRaise, false)
  s = play(s, [2, { type: 'call' }])
  assert.equal(s.phase, 'flop')
})

test('blind all-in', () => {
  let s = startHand(table([1000, 1000, 60]), NOW)
  assert.equal(s.seats[2]!.allIn, true, 'BB posts what it has')
  assert.equal(s.currentBet, 100)
  s = play(s, [0, { type: 'call' }], [1, { type: 'call' }])
  assert.equal(s.phase, 'flop')
  while (s.phase !== 'complete') s = play(s, [s.active, { type: 'check' }])
  const total = s.seats.reduce((t, x) => t + (x?.stack ?? 0), 0)
  assert.equal(total, 2060)
})

test('everyone all-in runs the board out', () => {
  let s = startHand(table([1000, 1000]), NOW)
  s = play(s, [0, { type: 'allin' }], [1, { type: 'call' }])
  assert.equal(s.phase, 'complete')
  assert.equal(s.board.length, 5)
  assert.equal(s.seats[0]!.stack + s.seats[1]!.stack, 2000)
})

test('timeout checks when free, otherwise folds', () => {
  let s = startHand(table([1000, 1000, 1000]), NOW)
  s = timeout(s, NOW + 20000)
  assert.equal(s.seats[0]!.folded, true)
  assert.equal(s.seats[0]!.last!.type, 'timeout')
  s = play(s, [1, { type: 'call' }])
  s = timeout(s, NOW + 40000)
  assert.equal(s.seats[2]!.folded, false, 'BB with the option checks')
  assert.equal(s.phase, 'flop')
})

test('privacy: public view has no deck, burns or hole cards', () => {
  const s = startHand(table([1000, 1000, 1000]), NOW)
  const v = publicView(s) as unknown as Record<string, unknown>
  assert.equal('deck' in v, false)
  assert.equal('burned' in v, false)
  assert.equal('holes' in v, false)
  const json = JSON.stringify(v)
  for (const c of [...holeCards(s, 0), ...holeCards(s, 1), ...holeCards(s, 2)]) assert.equal(json.includes(`"${c}"`), false, `leaked ${c}`)
})

test('duplicate / stale actions are rejected', () => {
  let s = startHand(table([1000, 1000, 1000]), NOW)
  s = play(s, [0, { type: 'fold' }])
  assert.equal(act(s, 0, { type: 'fold' }, NOW).ok, false)
})

test('replay reproduces the final state; chips conserved over 300 bot hands', () => {
  let s = table([4000, 4000, 4000, 4000, 4000, 4000])
  for (let hand = 0; hand < 300; hand++) {
    if (s.seats.filter((x) => x && x.stack > 0).length < 2) break
    const start = s
    s = startHand(start, NOW)
    const fullDeck = reconstructDeck(s)
    const inputs: HandInput[] = []
    let guard = 0
    while (s.phase !== 'complete' && guard++ < 200) {
      const a = decideBot(s, s.active, (['tight', 'loose', 'aggressive', 'balanced'] as const)[s.active % 4])
      const r = act(s, s.active, a, NOW)
      assert.ok(r.ok, `bot action rejected: ${JSON.stringify(a)}`)
      inputs.push({ kind: 'act', seat: s.active, action: a, now: NOW })
      s = r.ok ? r.state : s
    }
    assert.equal(s.phase, 'complete')
    const total = s.seats.reduce((t, x) => t + (x?.stack ?? 0), 0)
    assert.equal(total, 24000, `hand ${hand}: chips not conserved`)
    if (hand % 25 === 0) {
      const re = replayHand({ start, deck: fullDeck, startedAt: NOW, inputs })
      assert.deepEqual(re.seats.map((x) => x?.stack), s.seats.map((x) => x?.stack), 'replay diverged')
      assert.equal(re.version, s.version)
    }
    // busted players leave
    s = { ...s, seats: s.seats.map((x) => (x && x.stack === 0 ? null : x)) }
  }
})

/** Hole cards in deal order, then everything left in the deck, gives the original order back for replay. */
function reconstructDeck(s: TableState): string[] {
  const dealt: string[] = []
  const order = (s.events[0].payload.seats as number[])
  for (let r = 0; r < 2; r++) for (const i of order) dealt.push(s.holes[i][r])
  return [...dealt, ...s.deck]
}

console.log(failures.join('\n'))
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
