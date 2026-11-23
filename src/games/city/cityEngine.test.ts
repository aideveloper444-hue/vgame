// Headless World Tycoon checks: rule-book values, Casino / Grand Club / Jail rules, and full bot
// games that must finish without stalls or broken invariants.
// Run: npm run test:city
// (run by Node: only process.exit and process.env are used, declared here so the app's browser tsconfig needs no Node types)
declare const process: { exit(code?: number): never; env: Record<string, string | undefined> }
import { useCityStore, botAuctionRaise, botBuyDecision, botCasinoDecision, botRedeemDecision, botTradeAcceptDecision, botTradeProposal, botUpgradeDecision, computeRent } from './cityStore'
import { buildBoard, isProperty, VARIANTS, type PropertyTile, type VariantId } from './cityBoardData'

let failures = 0
function check(cond: unknown, msg: string) {
  if (!cond) {
    failures++
    console.error('FAIL:', msg)
  }
}

const st = () => useCityStore.getState()
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatarEmoji: '', isBot: true }))

/* ---------------- board matches the rule book */
{
  const b = buildBoard()
  check(b.length === 36, 'board has 36 squares')
  const props = b.filter(isProperty)
  check(props.filter((t) => t.kind === 'SITE').length === 20, '20 cities')
  check(props.filter((t) => t.kind === 'COMPANY').length === 6, '6 companies')
  const byName = Object.fromEntries(props.map((t) => [t.name, t]))
  check(byName['New York'].basePrice === 5000 && byName['New York'].rentTable.join() === '600,1550,2850,4300' && byName['New York'].upgradeCost === 4000, 'New York deed')
  check(byName['Budapest'].basePrice === 1600 && byName['Vienna'].basePrice === 2300 && byName['Cape Town'].basePrice === 1500, 'chart prices')
  check(byName['Airport'].basePrice === 5000 && byName['Airport'].rentTable.join() === '700,1500' && b[byName['Airport'].partnerId!].name === 'Cruise Line', 'Airport deed')
  check(byName['Railway'].partnerId === byName['Transport Co.'].id && byName['Postal Service'].partnerId === byName['Radio Station'].id, 'partners')
  check(b[0].type === 'GO' && b[9].type === 'JAIL' && b[18].type === 'CASINO' && b[27].type === 'CLUB', 'corners')
}

/* ---------------- rent rules */
{
  st().startGame(seats(2))
  useCityStore.setState((s) => {
    for (const id of [2, 3, 4]) (s.tiles[id] as PropertyTile).ownerId = 'p0'
  })
  const tiles = st().tiles
  check(computeRent(tiles[3] as PropertyTile, tiles) === 350, 'full set doubles empty site rent (Rome 175 → 350)')
  useCityStore.setState((s) => {
    ;(s.tiles[3] as PropertyTile).level = 1
  })
  check(computeRent(st().tiles[3] as PropertyTile, st().tiles) === 450, 'office rent')
  useCityStore.setState((s) => {
    ;(s.tiles[31] as PropertyTile).ownerId = 'p1'
  })
  check(computeRent(st().tiles[31] as PropertyTile, st().tiles) === 700, 'company alone')
  useCityStore.setState((s) => {
    ;(s.tiles[12] as PropertyTile).ownerId = 'p1'
  })
  check(computeRent(st().tiles[31] as PropertyTile, st().tiles) === 1500, 'company with partner')
  useCityStore.setState((s) => {
    ;(s.tiles[31] as PropertyTile).mortgaged = true
  })
  check(computeRent(st().tiles[31] as PropertyTile, st().tiles) === 0, 'mortgaged collects nothing')
}

/* ---------------- tax into the pot, Grand Club pays it out */
{
  st().startGame(seats(2))
  useCityStore.setState((s) => {
    s.currentPlayerIndex = 0
    for (const id of [2, 3, 4, 6, 8, 10, 11, 12, 13, 14, 15]) (s.tiles[id] as PropertyTile).ownerId = 'p0'
    s.players[0].position = 3
    s.phase = 'MOVING'
    s.pendingMovePath = [4, 5]
  })
  const before = st().players[0].cash
  st().completeMove()
  check(st().clubPot === 500 && st().players[0].cash === before - 500, `income tax capped at $500 into pot (pot ${st().clubPot})`)
  useCityStore.setState((s) => {
    s.currentPlayerIndex = 1
    s.players[1].position = 25
    s.phase = 'MOVING'
    s.pendingMovePath = [26, 27]
  })
  const c1 = st().players[1].cash
  st().completeMove()
  check(st().players[1].cash === c1 + 500 && st().clubPot === 0, 'Grand Club collects the pot')
  useCityStore.setState((s) => {
    s.players[1].position = 25
    s.phase = 'MOVING'
    s.pendingMovePath = [26, 27]
  })
  const c2 = st().players[1].cash
  st().completeMove()
  check(st().players[1].cash === c2 + 500, 'empty pot: $500 welcome gift')
}

/* ---------------- Casino */
{
  let jackpots = 0
  let pushes = 0
  let losses = 0
  for (let i = 0; i < 300; i++) {
    st().startGame(seats(2))
    useCityStore.setState((s) => {
      s.currentPlayerIndex = 0
      s.phase = 'CASINO'
    })
    const cash = st().players[0].cash
    const tray = st().casinoTray
    st().casinoDecision(true)
    const r = st().casinoResult!
    if (r.outcome === 'JACKPOT') {
      jackpots++
      check(st().players[0].cash === cash + tray + 1000 && st().casinoTray === 0, 'jackpot pays tray + $1000')
    } else if (r.outcome === 'PUSH') {
      pushes++
      check(st().players[0].cash === cash, 'push returns the bet')
    } else {
      losses++
      check(st().players[0].cash === cash - 1000 && st().casinoTray === tray + 1000, 'loss feeds the tray')
    }
  }
  check(jackpots > 20 && pushes > 20 && losses > 150, `casino odds look right (${jackpots}/${pushes}/${losses})`)
}

/* ---------------- Jail: three failed rolls then pay and move */
{
  st().startGame(seats(2))
  useCityStore.setState((s) => {
    s.currentPlayerIndex = 0
    s.players[0].inJail = true
    s.players[0].position = 9
  })
  let moved = false
  for (let k = 0; k < 3 && !moved; k++) {
    useCityStore.setState({ phase: 'ROLLING', currentPlayerIndex: 0 })
    st().rollAndMove()
    moved = st().phase === 'MOVING'
  }
  check(moved, 'leaves Jail by the third roll at the latest')
  check(!st().players[0].inJail, 'out of Jail')
}

/* ---------------- full bot games */
const asked = new Map<string, number>()
function playOut(n: number, variant: VariantId): { rounds: number; steps: number; ended: boolean } {
  st().startGame(seats(n), variant)
  let steps = 0
  while (st().phase !== 'GAME_OVER' && steps < 60000) {
    steps++
    const s = st()
    const me = s.players[s.currentPlayerIndex]
    switch (s.phase) {
      case 'ROLLING':
        if (me.inJail && me.freePasses.length > 0) s.useFreePass()
        else if (me.inJail && me.cash > 8000) s.payJailFine()
        st().rollAndMove()
        break
      case 'MOVING':
        s.completeMove()
        break
      case 'AWAITING_BUY_DECISION':
        s.resolveBuyDecision(botBuyDecision(me, s.tiles[me.position] as PropertyTile, s.tiles))
        break
      case 'CASINO':
        s.casinoDecision(botCasinoDecision(me, s.casinoTray, s.config))
        break
      case 'AUCTION': {
        const a = s.auction!
        const bidder = s.players.find((p) => p.id === a.queue[0])!
        const raise = botAuctionRaise(bidder, s.tiles[a.tileId] as PropertyTile, a, s.tiles, s.config)
        s.submitAuctionAction(bidder.id, raise === null ? 'PASS' : 'BID', raise ?? undefined)
        break
      }
      case 'POST_MOVE_ACTIONS': {
        const r = botRedeemDecision(me, s.tiles, s.config)
        if (r !== null) s.redeemProperty(r)
        for (let k = 0; k < 3; k++) {
          const u = botUpgradeDecision(st().players[st().currentPlayerIndex], st().tiles, st().config)
          if (u === null) break
          st().upgradeProperty(u)
        }
        const proposal = botTradeProposal(me, s.tiles, s.players, (id) => s.roundNumber - (asked.get(`${me.id}:${id}`) ?? -99) < 6)
        if (proposal) {
          asked.set(`${me.id}:${proposal.request.propertyIds[0]}`, s.roundNumber)
          st().proposeTrade(proposal)
          const t = st().pendingTrades.find((x) => x.status === 'PENDING')
          if (t) st().respondToTrade(t.id, botTradeAcceptDecision(t, st().tiles, st().config))
        }
        // occasionally trade to exercise the trade path
        if (steps % 97 === 0) {
          const other = st().players.find((p) => p.id !== me.id && !p.bankrupt)
          const mine = st().tiles.find((t) => isProperty(t) && t.ownerId === me.id && t.level === 0)
          if (other && mine) {
            st().proposeTrade({ fromPlayerId: me.id, toPlayerId: other.id, offer: { cash: 500, propertyIds: [mine.id] }, request: { cash: 0, propertyIds: [] } })
            const t = st().pendingTrades.find((x) => x.status === 'PENDING')
            if (t) st().respondToTrade(t.id, botTradeAcceptDecision(t, st().tiles, st().config))
          }
        }
        st().endTurn()
        break
      }
    }
    // invariants
    const now = st()
    for (const p of now.players) {
      if (!p.bankrupt) check(p.cash >= 0, `${variant}: ${p.name} has negative cash ${p.cash}`)
      if (p.bankrupt) check(now.tiles.every((t) => !isProperty(t) || t.ownerId !== p.id), `${variant}: bankrupt ${p.name} still owns deeds`)
    }
    for (const t of now.tiles) if (isProperty(t)) check(t.level >= 0 && t.level <= t.maxLevel, 'building level in range')
    check(now.clubPot >= 0 && now.casinoTray >= 0, 'pots never negative')
    if (failures > 20) break
  }
  if (process.env.CITY_STATS) {
    const t = st().tiles.filter(isProperty)
    console.log(variant, n, 'owned', t.filter((x) => x.ownerId).length, 'built', t.filter((x) => x.level > 0).map((x) => `${x.name}:${x.level}`).join(' '), 'cash', st().players.map((p) => p.cash).join('/'), 'pot', st().clubPot)
  }
  return { rounds: st().roundNumber, steps, ended: st().phase === 'GAME_OVER' }
}

const results: string[] = []
const totalRounds: Record<string, number> = {}
for (const variant of Object.keys(VARIANTS) as VariantId[]) {
  for (const n of [2, 3, 4]) {
    for (let g = 0; g < 8; g++) {
      const r = playOut(n, variant)
      check(r.ended, `${variant} ${n}p game ${g} did not finish (${r.steps} steps, round ${r.rounds})`)
      totalRounds[`${variant} ${n}p`] = (totalRounds[`${variant} ${n}p`] ?? 0) + r.rounds
      if (g === 0) results.push(`${variant} ${n}p: ${r.rounds} rounds, winner ${st().finalRanking?.[0].playerId}, bankrupt ${st().players.filter((p) => p.bankrupt).length}`)
    }
  }
}
console.log(results.join('\n'))
console.log(Object.entries(totalRounds).map(([k, v]) => `${k}: avg ${Math.round(v / 8)} rounds`).join('\n'))
if (failures > 0) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('All World Tycoon checks passed')
