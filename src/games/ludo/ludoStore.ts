import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { LudoColor } from './ludoBoardLayout'
import { armsFor, getBoard, seatColors, tokenAbs, tokenPos, type LudoBoard, type Vec2 } from './ludoBoards'
import { makeId } from '@/lib/id'

export interface LudoToken {
  id: string
  color: LudoColor
  tokenIndex: 0 | 1 | 2 | 3
  distance: number // -1 base, 0..board.ringSpan ring, then home lane, board.finish finished
}

export interface LudoPlayer {
  id: string
  name: string
  avatarEmoji: string
  color: LudoColor
  isBot: boolean
  tokens: LudoToken[]
  captures: number
  finishedCount: number
}

export interface LegalMove {
  tokenId: string
  kind: 'ENTER' | 'ADVANCE'
  from: number
  to: number
  path: number[] // intermediate distances to animate through, ending at `to`
}

export type LudoPhase = 'idle' | 'rolling' | 'selecting' | 'moving' | 'gameOver'

export interface LudoLastEvent {
  type: 'capture' | 'finish' | 'noMove' | 'win' | 'forfeit'
  text: string
  effectId?: string
  /** World position [x, z] of the effect. */
  effectPos?: Vec2
  tokenIds?: string[]
  /** Token that struck (its character plays the attack). */
  attackerId?: string | null
  /** 'win': the player who just brought all four tokens home, and the place they finished in (1 = first). */
  playerId?: string
  rank?: number
}

export interface PendingMove {
  tokenId: string
  path: number[]
  finalDistance: number
}

export type LudoLogKind = 'roll' | 'move' | 'capture' | 'finish' | 'win' | 'warn' | 'chat'

export interface LudoLogEntry {
  id: string
  kind: LudoLogKind
  icon: string
  text: string
  timestamp: number
  /** Player who caused the event; `text` starts with this name. */
  actor?: string
  color?: LudoColor
  /** Player on the receiving end (captures), mentioned inside `text`. */
  target?: string
  targetColor?: LudoColor
}

type LogInput = Omit<LudoLogEntry, 'id' | 'timestamp'>

interface LudoState {
  /** Arms on the board: 4 for the classic board (2–4 players), otherwise 5–8. */
  arms: number
  players: LudoPlayer[]
  currentPlayerIndex: number
  diceValue: number | null
  /** Most recent roll; unlike `diceValue` it survives the turn passing, so the die can keep showing it. */
  lastRoll: number | null
  rollCount: number
  consecutiveSixes: number
  legalMoves: LegalMove[]
  phase: LudoPhase
  pendingMove: PendingMove | null
  lastEvent: LudoLastEvent | null
  winnerId: string | null
  /** Player ids in the order they brought all four tokens home; the last player left is appended when the match ends. */
  rankings: string[]
  bestRoll: number
  eventLog: LudoLogEntry[]
  startedAt: number

  startGame: (participants: { id: string; name: string; avatarEmoji: string; isBot: boolean }[]) => void
  rollDice: () => void
  logChat: (playerId: string, text: string) => void
  selectToken: (tokenId: string) => void
  completeMove: () => void
  resetGame: () => void
  /** The current player let the roll timer run out: their turn passes to the next player. */
  skipTurn: () => void
}

/** How long a player has to roll before their turn passes on. */
export const ROLL_TIMEOUT_MS = 10000

/**
 * Match pacing (never shown to players): from PACE_START_MS the dice start quietly helping (see `pacedRoll`),
 * ramping to full help by PACE_FULL_MS, so long matches move toward a finish.
 */
export const PACE_START_MS = 6 * 60 * 1000
export const PACE_FULL_MS = 16 * 60 * 1000
/** From this point sixes come up about twice as often (1 in 3 instead of 1 in 6). */
export const SIX_BOOST_MS = 7 * 60 * 1000
/** Extra chance of a forced six once the boost is on: 0.2 + 0.8 × 1/6 ≈ 1/3 overall. */
const SIX_BOOST_CHANCE = 0.2

/**
 * A die roll that leans toward ending the match as time goes on. `pace` runs 0 → 1; at 0 it is a fair die.
 * With rising probability it either hands a token in the home stretch the exact number it needs to get home
 * (the slowest part of Ludo), gives a six to a player stuck with everyone in base, or takes the better of two rolls.
 */
function pacedRoll(board: LudoBoard, player: LudoPlayer, pace: number, sixBoost: boolean, sixesInARow: number): number {
  const fair = () => 1 + Math.floor(Math.random() * 6)
  // more sixes later in the match — but never the one that would be a third in a row and forfeit the turn
  // two sixes already: a fair roll, so the help never pushes anyone into the three-sixes forfeit
  if (sixesInARow >= 2) return fair()
  const boostSix = sixBoost && Math.random() < SIX_BOOST_CHANCE
  if (pace <= 0) return boostSix ? 6 : fair()
  const live = player.tokens.filter((t) => t.distance >= 0 && t.distance < board.finish)
  const inBase = player.tokens.some((t) => t.distance === -1)
  // exact roll home for a token close to the finish
  const needs = live.map((t) => board.finish - t.distance).filter((n) => n >= 1 && n <= 6)
  if (needs.length && Math.random() < pace * 0.6) return needs[Math.floor(Math.random() * needs.length)]
  if (boostSix) return 6
  // nothing on the board: a six to bring someone out
  if (!live.length && inBase && Math.random() < pace * 0.5) return 6
  // otherwise lean toward bigger steps (3–5; sixes are left to the boost above so they don't pile up)
  if (Math.random() < pace * 0.6) return 3 + Math.floor(Math.random() * 3)
  return fair()
}


function makeTokens(color: LudoColor): LudoToken[] {
  return [0, 1, 2, 3].map((i) => ({ id: makeId(`${color}-tok`), color, tokenIndex: i as 0 | 1 | 2 | 3, distance: -1 }))
}

function buildPath(from: number, to: number): number[] {
  if (from === -1) return [0]
  const path: number[] = []
  for (let d = from + 1; d <= to; d++) path.push(d)
  return path
}

export function getLegalMoves(board: LudoBoard, players: LudoPlayer[], playerIndex: number, dice: number): LegalMove[] {
  const player = players[playerIndex]
  const moves: LegalMove[] = []
  for (const token of player.tokens) {
    if (token.distance === board.finish) continue
    if (token.distance === -1) {
      if (dice === 6) moves.push({ tokenId: token.id, kind: 'ENTER', from: -1, to: 0, path: [0] })
      continue
    }
    const to = token.distance + dice
    if (to > board.finish) continue
    moves.push({ tokenId: token.id, kind: 'ADVANCE', from: token.distance, to, path: buildPath(token.distance, to) })
  }
  return moves
}

function checkCapture(board: LudoBoard, players: LudoPlayer[], moved: LudoToken): LudoToken[] {
  const absCellOf = (t: LudoToken) => tokenAbs(board, t.color, t.distance)
  const abs = absCellOf(moved)
  if (abs === null || board.isSafe(abs)) return []
  const captured: LudoToken[] = []
  for (const p of players) {
    if (p.color === moved.color) continue
    for (const t of p.tokens) {
      const otherAbs = absCellOf(t)
      if (otherAbs !== null && otherAbs === abs) captured.push(t)
    }
  }
  return captured
}

export function botChooseMove(board: LudoBoard, moves: LegalMove[], players: LudoPlayer[], botColor: LudoColor): string {
  for (const m of moves) {
    const hypothetical: LudoToken = { id: '', color: botColor, tokenIndex: 0, distance: m.to }
    if (checkCapture(board, players, hypothetical).length > 0) return m.tokenId
  }
  const enter = moves.find((m) => m.kind === 'ENTER')
  if (enter) return enter.tokenId
  const finish = moves.find((m) => m.to === board.finish)
  if (finish) return finish.tokenId
  return moves.reduce((best, m) => (m.to > best.to ? m : best), moves[0]).tokenId
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function rankEmoji(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅'
}

export const useLudoStore = create<LudoState>()(
  immer((set, get) => {
    function pushLog(entry: LogInput) {
      set((state) => {
        state.eventLog = [{ ...entry, id: makeId('log'), timestamp: Date.now() }, ...state.eventLog].slice(0, 30)
      })
    }

    function advanceTurn(playerGoesAgain = false) {
      set((state) => {
        if (!playerGoesAgain) {
          state.consecutiveSixes = 0
          let next = state.currentPlayerIndex
          for (let i = 0; i < state.players.length; i++) {
            next = (next + 1) % state.players.length
            if (state.players[next].finishedCount < 4) break
          }
          state.currentPlayerIndex = next
        }
        state.diceValue = null
        state.phase = 'rolling'
      })
    }

    return {
      arms: 4,
      players: [],
      currentPlayerIndex: 0,
      diceValue: null,
      lastRoll: null,
      rollCount: 0,
      consecutiveSixes: 0,
      legalMoves: [],
      phase: 'idle',
      pendingMove: null,
      lastEvent: null,
      winnerId: null,
      rankings: [],
      bestRoll: 0,
      eventLog: [],
      startedAt: Date.now(),

      startGame: (participants) => {
        const seated = participants.slice(0, 8)
        const colors = seatColors(seated.length)
        const players: LudoPlayer[] = seated.map((p, i) => ({
          id: p.id,
          name: p.name,
          avatarEmoji: p.avatarEmoji,
          color: colors[i],
          isBot: p.isBot,
          tokens: makeTokens(colors[i]),
          captures: 0,
          finishedCount: 0,
        }))
        set({
          arms: armsFor(seated.length),
          players,
          currentPlayerIndex: 0,
          diceValue: null,
          lastRoll: null,
          rollCount: 0,
          consecutiveSixes: 0,
          legalMoves: [],
          phase: 'rolling',
          pendingMove: null,
          lastEvent: null,
          winnerId: null,
          rankings: [],
          bestRoll: 0,
          eventLog: [],
          startedAt: Date.now(),
        })
      },

      logChat: (playerId, text) => {
        const player = get().players.find((p) => p.id === playerId)
        if (!player) return
        pushLog({ kind: 'chat', icon: '💬', text: `${player.name}: ${text}`, actor: player.name, color: player.color })
      },

      rollDice: () => {
        if (get().phase !== 'rolling') return
        const players = get().players
        const idx = get().currentPlayerIndex
        const board0 = getBoard(get().arms)
        const elapsed = Date.now() - get().startedAt
        const pace = Math.min(1, Math.max(0, (elapsed - PACE_START_MS) / (PACE_FULL_MS - PACE_START_MS)))
        const dice = pacedRoll(board0, players[idx], pace, elapsed >= SIX_BOOST_MS, get().consecutiveSixes)
        const moves = getLegalMoves(board0, players, idx, dice)

        set((state) => {
          state.diceValue = dice
          state.lastRoll = dice
          state.rollCount += 1
          state.bestRoll = Math.max(state.bestRoll, dice)
          state.lastEvent = null
          if (dice === 6) state.consecutiveSixes += 1
          else state.consecutiveSixes = 0
        })
        const roller = players[idx]
        pushLog({ kind: 'roll', icon: '🎲', text: `${roller.name} rolled a ${dice}${dice === 6 ? '!' : ''}`, actor: roller.name, color: roller.color })

        if (dice === 6 && get().consecutiveSixes >= 3) {
          set((state) => {
            state.lastEvent = { type: 'forfeit', text: `${roller.name} rolled three 6s — turn forfeited!` }
            state.consecutiveSixes = 0
          })
          pushLog({ kind: 'warn', icon: '⚠️', text: `${roller.name} rolled three 6s — turn lost`, actor: roller.name, color: roller.color })
          advanceTurn()
          return
        }

        if (moves.length === 0) {
          set((state) => {
            state.lastEvent = { type: 'noMove', text: 'No available move' }
          })
          pushLog({ kind: 'warn', icon: '🚫', text: `${roller.name} had no move`, actor: roller.name, color: roller.color })
          advanceTurn(dice === 6)
          return
        }

        set((state) => {
          state.legalMoves = moves
          state.phase = moves.length === 1 ? 'moving' : 'selecting'
          if (moves.length === 1) {
            state.pendingMove = { tokenId: moves[0].tokenId, path: moves[0].path, finalDistance: moves[0].to }
          }
        })
      },

      selectToken: (tokenId) => {
        const move = get().legalMoves.find((m) => m.tokenId === tokenId)
        if (!move || get().phase !== 'selecting') return
        set((state) => {
          state.phase = 'moving'
          state.pendingMove = { tokenId: move.tokenId, path: move.path, finalDistance: move.to }
        })
      },

      completeMove: () => {
        const pending = get().pendingMove
        if (!pending) return
        const dice = get().diceValue ?? 0
        const players = get().players
        const idx = get().currentPlayerIndex
        const player = players[idx]
        const token = player.tokens.find((t) => t.id === pending.tokenId)
        if (!token) return

        const board = getBoard(get().arms)
        const captured = checkCapture(board, players, { ...token, distance: pending.finalDistance })
        const finished = pending.finalDistance === board.finish
        const entered = token.distance === -1

        set((state) => {
          const st = state.players[idx]
          const tok = st.tokens.find((t) => t.id === pending.tokenId)!
          tok.distance = pending.finalDistance
          if (captured.length > 0) {
            st.captures += captured.length
            for (const c of captured) {
              const owner = state.players.find((p) => p.tokens.some((t) => t.id === c.id))!
              const ownerToken = owner.tokens.find((t) => t.id === c.id)!
              ownerToken.distance = -1
            }
          }
          if (finished) st.finishedCount += 1
          state.pendingMove = null
          state.legalMoves = []

          if (captured.length > 0) {
            state.lastEvent = {
              type: 'capture',
              text: `💥 ${st.name} captured ${captured.length} warrior${captured.length > 1 ? 's' : ''}!`,
              effectId: makeId('fx'),
              effectPos: tokenPos(board, token.color, pending.finalDistance, token.tokenIndex),
              tokenIds: captured.map((c) => c.id),
              attackerId: token.id,
            }
          } else if (finished) {
            state.lastEvent = {
              type: 'finish',
              text: `✓ ${st.name}'s warrior is home!`,
              effectId: makeId('fx'),
              tokenIds: [pending.tokenId],
            }
          } else {
            state.lastEvent = null
          }

          if (st.finishedCount >= 4 && !state.rankings.includes(st.id)) {
            // this player is done and takes the next place; everyone else keeps playing for the rest
            state.rankings.push(st.id)
            const rank = state.rankings.length
            if (rank === 1) state.winnerId = st.id
            state.lastEvent = {
              type: 'win',
              text: `${rankEmoji(rank)} ${st.name} finished ${ordinal(rank)}!`,
              effectId: makeId('fx'),
              tokenIds: [pending.tokenId],
              playerId: st.id,
              rank,
            }
            const left = state.players.filter((p) => !state.rankings.includes(p.id))
            if (left.length <= 1) {
              for (const p of left) state.rankings.push(p.id)
              state.phase = 'gameOver'
            }
          }
        })

        const actor = { actor: player.name, color: player.color }
        if (captured.length > 0) {
          const victim = players.find((p) => p.tokens.some((t) => t.id === captured[0].id))
          const victimName = victim?.name ?? 'a rival'
          pushLog({
            kind: 'capture',
            icon: '💥',
            text: `${player.name} killed ${victimName}!`,
            ...actor,
            target: victim?.name,
            targetColor: victim?.color,
          })
        } else if (finished) {
          pushLog({ kind: 'finish', icon: '🏁', text: `${player.name} brought a warrior home!`, ...actor })
        } else if (entered) {
          pushLog({ kind: 'move', icon: '➤', text: `${player.name} sent out a new warrior`, ...actor })
        } else {
          pushLog({ kind: 'move', icon: '➤', text: `${player.name} moved ${dice} step${dice > 1 ? 's' : ''}`, ...actor })
        }
        const rank = get().rankings.indexOf(player.id) + 1
        const justRanked = get().lastEvent?.type === 'win'
        if (justRanked) pushLog({ kind: 'win', icon: rankEmoji(rank), text: `${player.name} finished ${ordinal(rank)}!`, ...actor })

        if (get().phase === 'gameOver') {
          const last = get().players.find((p) => p.id === get().rankings[get().rankings.length - 1])
          if (last) pushLog({ kind: 'win', icon: '🏁', text: `Match over — ${last.name} came last`, actor: last.name, color: last.color })
          return
        }

        // a player who just finished hands the turn on; everyone else keeps the usual bonus turns
        const goAgain = !justRanked && ((dice === 6 && get().consecutiveSixes < 3) || captured.length > 0 || finished)
        advanceTurn(goAgain)
      },

      skipTurn: () => {
        if (get().phase !== 'rolling') return
        const p = get().players[get().currentPlayerIndex]
        if (!p) return
        set((state) => {
          state.lastEvent = null
        })
        pushLog({ kind: 'warn', icon: '⏱️', text: `${p.name} took too long — turn skipped`, actor: p.name, color: p.color })
        advanceTurn()
      },

      resetGame: () => {
        set({
          arms: 4,
          players: [],
          currentPlayerIndex: 0,
          diceValue: null,
          lastRoll: null,
          rollCount: 0,
          consecutiveSixes: 0,
          legalMoves: [],
          phase: 'idle',
          pendingMove: null,
          lastEvent: null,
          winnerId: null,
          rankings: [],
          bestRoll: 0,
          eventLog: [],
        })
      },

    }
  }),
)
