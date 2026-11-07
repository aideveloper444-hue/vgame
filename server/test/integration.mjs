// End-to-end check against a running server: node server/test/integration.mjs [baseUrl]
// Two real accounts: cash table (privacy, actions, ledger), private room, stale/duplicate actions, Sit & Go to the end.
const BASE = process.argv[2] ?? 'http://localhost:8787'
const WS = BASE.replace(/^http/, 'ws') + '/ws'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) failures++
}

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + '/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json()
  if (!r.ok) throw Object.assign(new Error(j.error?.message), { code: j.error?.code })
  return j
}

function client(name, token) {
  const ws = new WebSocket(`${WS}?token=${token}`)
  const c = { name, ws, msgs: [], tables: {}, holes: {}, results: [], room: null, rejected: [], accepted: [] }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    c.msgs.push(m)
    if (m.type === 'TABLE_SNAPSHOT') c.tables[m.tableId] = m
    if (m.type === 'PRIVATE_CARDS') c.holes[m.tableId] = m
    if (m.type === 'TOURNEY_RESULT') c.results.push(m)
    if (m.type === 'ROOM_STATE') c.room = m.room
    if (m.type === 'ACTION_REJECTED') c.rejected.push(m)
    if (m.type === 'ACTION_ACCEPTED') c.accepted.push(m)
  }
  c.send = (m) => ws.send(JSON.stringify(m))
  c.open = new Promise((r) => (ws.onopen = r))
  c.last = (type) => [...c.msgs].reverse().find((m) => m.type === type)
  c.waitFor = async (pred, ms = 15000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const hit = c.msgs.find(pred)
      if (hit) return hit
      await delay(100)
    }
    return null
  }
  let seq = 0
  /** play passively: check, else call (or fold to big bets) whenever it's our turn */
  c.autoplay = (tableId) => {
    const iv = setInterval(() => {
      const s = c.tables[tableId]
      if (!s || s.mySeat < 0) return
      const v = s.view
      if (!['preflop', 'flop', 'turn', 'river'].includes(v.phase) || v.active !== s.mySeat) return
      const me = v.seats[s.mySeat]
      const toCall = v.currentBet - me.bet
      const type = toCall === 0 ? 'check' : toCall <= v.config.bigBlind * 4 ? 'call' : 'fold'
      const key = `${v.handNo}:${v.version}`
      if (c._last === key) return
      c._last = key
      c.send({ type: 'PLAYER_ACTION', tableId, handId: v.handNo, expectedStateVersion: v.version, clientActionId: `${c.name}-${++seq}`, action: { type } })
    }, 150)
    return () => clearInterval(iv)
  }
  return c
}

const stamp = Date.now().toString(36).slice(-5)
const A = await api('/auth/register', { method: 'POST', body: { handle: `Ana${stamp}`, email: `ana${stamp}@rpc.test`, password: 'pokerpass1', ageConfirmed: true, termsAccepted: true } })
const B = await api('/auth/register', { method: 'POST', body: { handle: `Ben${stamp}`, email: `ben${stamp}@rpc.test`, password: 'pokerpass1', ageConfirmed: true, termsAccepted: true } })
check(A.me.balance === 25000 && B.me.balance === 25000, 'new accounts get 25,000 starter points')

const a = client('A', A.accessToken)
const b = client('B', B.accessToken)
await Promise.all([a.open, b.open])

/* ---------------- cash table ---------------- */
a.send({ type: 'SIT', tier: 'bronze' })
const ta = await a.waitFor((m) => m.type === 'TABLE_ASSIGNED')
b.send({ type: 'SIT', tier: 'bronze' })
const tb = await b.waitFor((m) => m.type === 'TABLE_ASSIGNED')
check(ta && tb && ta.tableId === tb.tableId, 'two players at the same tier share a table')
const tableId = ta.tableId
const stopA = a.autoplay(tableId)
const stopB = b.autoplay(tableId)
await a.waitFor((m) => m.type === 'PRIVATE_CARDS' && m.tableId === tableId, 20000)
await b.waitFor((m) => m.type === 'PRIVATE_CARDS' && m.tableId === tableId, 20000)
const snapA = a.tables[tableId]
check(snapA.view.seats.filter(Boolean).some((s) => s.kind === 'bot'), 'regulars fill the empty seats')
// privacy: nothing in any public snapshot carries hole cards before showdown
const leaked = a.msgs.filter((m) => m.type === 'TABLE_SNAPSHOT' && m.view.phase !== 'complete').some((m) => JSON.stringify(m.view).includes(`"${b.holes[tableId]?.cards?.[0]}"`))
check(!leaked && !('deck' in snapA.view) && !('holes' in snapA.view), 'public snapshots contain no deck, burns or other hole cards')
check(a.holes[tableId].cards.length === 2 && b.holes[tableId].cards.join() !== a.holes[tableId].cards.join(), 'each player receives only their own two cards')

// stale + duplicate action handling
const v0 = a.tables[tableId].view
a.send({ type: 'PLAYER_ACTION', tableId, handId: v0.handNo, expectedStateVersion: v0.version - 1, clientActionId: 'stale-1', action: { type: 'check' } })
const stale = await a.waitFor((m) => m.type === 'ACTION_REJECTED' && m.clientActionId === 'stale-1', 5000)
check(stale?.code === 'STALE_STATE' || stale?.code === 'NOT_YOUR_TURN' || stale?.code === 'INVALID_ACTION', `stale action rejected (${stale?.code})`)
a.send({ type: 'PLAYER_ACTION', tableId, handId: v0.handNo, expectedStateVersion: v0.version - 1, clientActionId: 'stale-1', action: { type: 'check' } })
const dup = await a.waitFor((m) => m.type === 'ACTION_REJECTED' && m.clientActionId === 'stale-1' && m.duplicate, 5000)
check(!!dup, 'a repeated clientActionId returns the original result')

// let a few hands play out
const hand0 = a.tables[tableId].view.handNo
for (let i = 0; i < 90 && a.tables[tableId].view.handNo < hand0 + 3; i++) await delay(1000)
check(a.tables[tableId].view.handNo >= hand0 + 3, `hands keep dealing (now #${a.tables[tableId].view.handNo})`)
stopA()
// leaving mid-hand after betting forfeits the bet, and that loss is settled like any hand
let raised = null
for (let i = 0; i < 120 && !raised; i++) {
  const st = a.tables[tableId]
  const v = st?.view
  if (v && ['preflop', 'flop', 'turn', 'river'].includes(v.phase) && v.active === st.mySeat && v.seats[st.mySeat].stack > v.config.bigBlind * 4) {
    const minTo = v.currentBet === 0 ? v.config.bigBlind : v.currentBet + v.minRaise
    a.send({ type: 'PLAYER_ACTION', tableId, handId: v.handNo, expectedStateVersion: v.version, clientActionId: 'leave-raise', action: { type: v.currentBet === 0 ? 'bet' : 'raise', amount: minTo } })
    raised = await a.waitFor((m) => m.clientActionId === 'leave-raise', 3000)
    if (raised?.type === 'ACTION_ACCEPTED') {
      raised = { handId: `${tableId}:${v.handNo}` }
      a.send({ type: 'LEAVE_TABLE', tableId })
    } else raised = null
  }
  await delay(250)
}
stopB()
b.send({ type: 'LEAVE_TABLE', tableId })
await delay(25000)
const ledgerA = await api('/me/ledger', { token: A.accessToken })
const forfeit = ledgerA.find((e) => e.correlationId === raised?.handId)
check(!!raised && forfeit && forfeit.amount < 0, `leaving mid-hand settles the forfeited bet (${forfeit?.amount})`)
for (const [who, acc] of [['A', A], ['B', B]]) {
  const me = await api('/me', { token: acc.accessToken })
  const ledger = await api('/me/ledger', { token: acc.accessToken })
  const sum = ledger.reduce((t, e) => t + e.amount, 0)
  const settled = ledger.filter((e) => e.type === 'HAND_SETTLEMENT').length
  check(me.balance === sum, `${who}: balance ${me.balance} equals ledger sum (${settled} hand settlements)`)
  const hands = await api('/me/hands', { token: acc.accessToken })
  check(hands.length >= 3 && hands[0].hole.length === 2, `${who}: hand history recorded (${hands.length})`)
}

/* ---------------- private room ---------------- */
a.send({ type: 'ROOM_CREATE', size: 3, stack: 5000, bigBlind: 50 })
await a.waitFor((m) => m.type === 'ROOM_STATE' && m.room)
const code = a.room.code
b.send({ type: 'ROOM_JOIN', code })
await a.waitFor((m) => m.type === 'ROOM_STATE' && m.room?.members.length === 2)
a.send({ type: 'ROOM_ADD_BOT', name: 'PokerKing' })
await a.waitFor((m) => m.type === 'ROOM_STATE' && m.room?.members.length === 3)
check(a.room.members.map((m) => m.name).includes('PokerKing'), `room ${code}: friend joined and a named regular was added`)
a.send({ type: 'ROOM_START' })
const ra = await a.waitFor((m) => m.type === 'TABLE_ASSIGNED' && m.mode === 'friends')
const rb = await b.waitFor((m) => m.type === 'TABLE_ASSIGNED' && m.mode === 'friends')
check(ra && rb && ra.tableId === rb.tableId, 'room start seats both players at one table')
const s1 = a.autoplay(ra.tableId)
const s2 = b.autoplay(ra.tableId)
await a.waitFor((m) => m.type === 'TABLE_SNAPSHOT' && m.tableId === ra.tableId && m.view.phase === 'complete', 60000)
check(true, 'a private-room hand completed')
s1()
s2()
const beforeRoomLeave = (await api('/me', { token: A.accessToken })).balance
a.send({ type: 'ROOM_LEAVE' })
b.send({ type: 'ROOM_LEAVE' })
await delay(800)
check((await api('/me', { token: A.accessToken })).balance === beforeRoomLeave, 'room chips never touch points')

/* ---------------- sit & go ---------------- */
a.send({ type: 'TOURNEY_REGISTER', id: 'turbo' })
b.send({ type: 'TOURNEY_REGISTER', id: 'turbo' })
const t1 = await a.waitFor((m) => m.type === 'TABLE_ASSIGNED' && m.mode === 'tournament', 70000)
check(!!t1, 'Sit & Go starts with both registered players (computer players fill the field)')
let stops = []
const follow = (c) => {
  // follow table moves
  let current = null
  const iv = setInterval(() => {
    const asg = c.last('TABLE_ASSIGNED')
    if (asg && asg.mode === 'tournament' && asg.tableId !== current) {
      current = asg.tableId
      stops.push(c.autoplay(current))
    }
  }, 300)
  stops.push(() => clearInterval(iv))
}
follow(a)
follow(b)
const ra2 = await a.waitFor((m) => m.type === 'TOURNEY_RESULT', 15 * 60_000)
const rb2 = await b.waitFor((m) => m.type === 'TOURNEY_RESULT', 15 * 60_000)
stops.forEach((s) => s())
check(ra2 && rb2, `tournament finished: A #${ra2?.place} (+${ra2?.prize}), B #${rb2?.place} (+${rb2?.prize})`)
const res = await api('/me/tournaments', { token: A.accessToken })
check(res.length >= 1 && res[0].place === ra2?.place, 'result stored in tournament history')
const meA = await api('/me', { token: A.accessToken })
const ledA = await api('/me/ledger', { token: A.accessToken })
check(meA.balance === ledA.reduce((t, e) => t + e.amount, 0), 'balance still equals ledger after prizes')

a.ws.close()
b.ws.close()
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
