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
  /** Shield power-up: this many of the owner's turns left during which the token can't be captured or bombed. */
  shieldTurns?: number
}

export type PowerKind = 'speed' | 'shield' | 'bomb'
export type PowerStock = Record<PowerKind, number>
export const START_POWERS: PowerStock = { speed: 3, shield: 3, bomb: 3 }
/** How far ahead (in ring cells) a Bomb can reach from one of your tokens. */
export const STRIKE_RANGE = 6
/** A Shield lasts this many of the owner's turns. */
export const SHIELD_TURNS = 2

export interface LudoPlayer {
  id: string
  name: string
  avatarEmoji: string
  color: LudoColor
  isBot: boolean
  tokens: LudoToken[]
  captures: number
  finishedCount: number
  powers: PowerStock
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
  /** Token that struck (its character plays the attack); null for a bomb, which has no attacker on the board. */
  attackerId?: string | null
}

export interface PendingMove {
  tokenId: string
  path: number[]
  finalDistance: number
}

export type LudoLogKind = 'roll' | 'move' | 'capture' | 'finish' | 'win' | 'warn' | 'chat' | 'power'

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
  bestRoll: number
  eventLog: LudoLogEntry[]
  startedAt: number
  /** Speed is on for the current turn: the next move goes double the roll. */
  speedActive: boolean
  /** The current player already used a power-up this turn. */
  powerUsed: boolean

  startGame: (participants: { id: string; name: string; avatarEmoji: string; isBot: boolean }[]) => void
  rollDice: () => void
  logChat: (playerId: string, text: string) => void
  selectToken: (tokenId: string) => void
  completeMove: () => void
  resetGame: () => void
  useSpeed: () => boolean
  useShield: (tokenId: string) => boolean
  useBomb: (tokenId: string) => boolean
}

function makeTokens(color: LudoColor): LudoToken[] {
  return [0, 1, 2, 3].map((i) => ({ id: makeId(`${color}-tok`), color, tokenIndex: i as 0 | 1 | 2 | 3, distance: -1, shieldTurns: 0 }))
}

function buildPath(from: number, to: number): number[] {
  if (from === -1) return [0]
  const path: number[] = []
  for (let d = from + 1; d <= to; d++) path.push(d)
  return path
}

export function getLegalMoves(board: LudoBoard, players: LudoPlayer[], playerIndex: number, dice: number, steps = dice): LegalMove[] {
  const player = players[playerIndex]
  const moves: LegalMove[] = []
  for (const token of player.tokens) {
    if (token.distance === board.finish) continue
    if (token.distance === -1) {
      if (dice === 6) moves.push({ tokenId: token.id, kind: 'ENTER', from: -1, to: 0, path: [0] })
      continue
    }
    const to = token.distance + steps
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
      if ((t.shieldTurns ?? 0) > 0) continue
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

/** Ring cells from `from` forward to `to` (0 if equal), going around the shared ring. */
function ringGap(board: LudoBoard, from: number, to: number): number {
  const n = board.ringSize
  return (((to - from) % n) + n) % n
}

export interface StrikePair {
  attacker: LudoToken
  defender: LudoToken
  gap: number
}

/**
 * Opponent tokens a player can Bomb: on the shared ring, not on a safe cell, not shielded,
 * and 1..STRIKE_RANGE cells ahead of one of the player's own ring tokens.
 */
export function strikePairs(board: LudoBoard, players: LudoPlayer[], playerIndex: number): StrikePair[] {
  const me = players[playerIndex]
  if (!me) return []
  const pairs: StrikePair[] = []
  const mine = me.tokens
    .map((t) => ({ t, abs: tokenAbs(board, t.color, t.distance) }))
    .filter((x) => x.abs !== null && x.t.distance >= 0 && x.t.distance <= board.ringSpan)
  for (const p of players) {
    if (p.color === me.color) continue
    for (const d of p.tokens) {
      if ((d.shieldTurns ?? 0) > 0 || d.distance < 0 || d.distance > board.ringSpan) continue
      const dAbs = tokenAbs(board, d.color, d.distance)
      if (dAbs === null || board.isSafe(dAbs)) continue
      let best: StrikePair | null = null
      for (const m of mine) {
        const gap = ringGap(board, m.abs!, dAbs)
        // the attacker must be able to step onto that cell without passing its own home turn
        if (gap >= 1 && gap <= STRIKE_RANGE && m.t.distance + gap <= board.ringSpan && (!best || gap < best.gap)) best = { attacker: m.t, defender: d, gap }
      }
      if (best) pairs.push(best)
    }
  }
  return pairs
}

/** Own ring tokens that an opponent could strike next turn (worth shielding). */
export function threatenedTokens(board: LudoBoard, players: LudoPlayer[], playerIndex: number): LudoToken[] {
  const out: LudoToken[] = []
  players.forEach((_, i) => {
    if (i === playerIndex) return
    for (const pair of strikePairs(board, players, i)) {
      if (players[playerIndex].tokens.some((t) => t.id === pair.defender.id) && !out.some((t) => t.id === pair.defender.id)) out.push(pair.defender)
    }
  })
  return out
}

export type BotPower =
  | { kind: 'bomb'; target: string }
  | { kind: 'shield'; token: string }
  | { kind: 'speed' }
  | null

/** What a computer player does before rolling: bomb, shield, speed up, or nothing. */
export function botChoosePower(board: LudoBoard, players: LudoPlayer[], playerIndex: number, level: 'easy' | 'smart'): BotPower {
  const me = players[playerIndex]
  if (!me) return null
  const eager = level === 'smart' ? 1 : 0.55
  // go after the rival who has walked furthest
  const pairs = strikePairs(board, players, playerIndex).sort((a, b) => b.defender.distance - a.defender.distance)
  if (pairs.length && me.powers.bomb > 0 && Math.random() < 0.45 * eager) return { kind: 'bomb', target: pairs[0].defender.id }
  const threatened = threatenedTokens(board, players, playerIndex).sort((a, b) => b.distance - a.distance)
  if (threatened.length && me.powers.shield > 0 && Math.random() < 0.5 * eager) return { kind: 'shield', token: threatened[0].id }
  if (me.powers.speed > 0 && me.tokens.some((t) => t.distance >= 0 && t.distance < board.ringSpan - 12) && Math.random() < 0.18 * eager) return { kind: 'speed' }
  return null
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
        state.speedActive = false
        if (!playerGoesAgain) {
          state.powerUsed = false
          // shields wear off as their owner's turns pass
          for (const t of state.players[state.currentPlayerIndex]?.tokens ?? []) if ((t.shieldTurns ?? 0) > 0) t.shieldTurns = (t.shieldTurns ?? 0) - 1
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
      bestRoll: 0,
      eventLog: [],
      startedAt: Date.now(),
      speedActive: false,
      powerUsed: false,

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
          powers: { ...START_POWERS },
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
          bestRoll: 0,
          eventLog: [],
          startedAt: Date.now(),
          speedActive: false,
          powerUsed: false,
        })
      },

      logChat: (playerId, text) => {
        const player = get().players.find((p) => p.id === playerId)
        if (!player) return
        pushLog({ kind: 'chat', icon: '💬', text: `${player.name}: ${text}`, actor: player.name, color: player.color })
      },

      rollDice: () => {
        if (get().phase !== 'rolling') return
        const dice = 1 + Math.floor(Math.random() * 6)
        const players = get().players
        const idx = get().currentPlayerIndex
        const board0 = getBoard(get().arms)
        // Speed doubles the move; if nothing can go that far, the roll counts normally
        let moves = getLegalMoves(board0, players, idx, dice, get().speedActive ? dice * 2 : dice)
        if (get().speedActive && !moves.some((m) => m.kind === 'ADVANCE')) moves = getLegalMoves(board0, players, idx, dice)

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
              text: `💥 ${st.name} captured ${captured.length} token${captured.length > 1 ? 's' : ''}!`,
              effectId: makeId('fx'),
              effectPos: tokenPos(board, token.color, pending.finalDistance, token.tokenIndex),
              tokenIds: captured.map((c) => c.id),
              attackerId: token.id,
            }
          } else if (finished) {
            state.lastEvent = {
              type: 'finish',
              text: `✓ ${st.name}'s token is home!`,
              effectId: makeId('fx'),
              tokenIds: [pending.tokenId],
            }
          } else {
            state.lastEvent = null
          }

          if (st.finishedCount >= 4) {
            state.phase = 'gameOver'
            state.winnerId = st.id
            state.lastEvent = { type: 'win', text: `🏆 ${st.name} wins!` }
          }
        })

        const actor = { actor: player.name, color: player.color }
        if (captured.length > 0) {
          const victim = players.find((p) => p.tokens.some((t) => t.id === captured[0].id))
          const victimName = victim?.name ?? 'a rival'
          pushLog({
            kind: 'capture',
            icon: '💀',
            text: `${player.name} killed ${victimName}!`,
            ...actor,
            target: victim?.name,
            targetColor: victim?.color,
          })
        } else if (finished) {
          pushLog({ kind: 'finish', icon: '🏁', text: `${player.name} brought a token home!`, ...actor })
        } else if (entered) {
          pushLog({ kind: 'move', icon: '➤', text: `${player.name} entered a new token`, ...actor })
        } else {
          pushLog({ kind: 'move', icon: '➤', text: `${player.name} moved ${dice} step${dice > 1 ? 's' : ''}`, ...actor })
        }
        if (get().phase === 'gameOver') pushLog({ kind: 'win', icon: '🏆', text: `${player.name} wins the game!`, ...actor })

        if (get().phase === 'gameOver') return

        const goAgain = (dice === 6 && get().consecutiveSixes < 3) || captured.length > 0 || finished
        advanceTurn(goAgain)
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
          bestRoll: 0,
          eventLog: [],
          speedActive: false,
          powerUsed: false,
        })
      },

      useSpeed: () => {
        const st = get()
        const p = st.players[st.currentPlayerIndex]
        if (!p || st.phase !== 'rolling' || st.powerUsed || p.powers.speed <= 0) return false
        set((state) => {
          state.players[state.currentPlayerIndex].powers.speed -= 1
          state.speedActive = true
          state.powerUsed = true
        })
        pushLog({ kind: 'power', icon: '⚡', text: `${p.name} used Speed: next move goes double`, actor: p.name, color: p.color })
        return true
      },

      useShield: (tokenId) => {
        const st = get()
        const board = getBoard(st.arms)
        const p = st.players[st.currentPlayerIndex]
        const tok = p?.tokens.find((t) => t.id === tokenId)
        if (!p || !tok || st.phase !== 'rolling' || st.powerUsed || p.powers.shield <= 0 || tok.distance < 0 || tok.distance >= board.finish) return false
        set((state) => {
          const sp = state.players[state.currentPlayerIndex]
          sp.powers.shield -= 1
          // +1: the turn it is raised on wears one off when it ends
          sp.tokens.find((t) => t.id === tokenId)!.shieldTurns = SHIELD_TURNS + 1
          state.powerUsed = true
        })
        pushLog({ kind: 'power', icon: '🛡️', text: `${p.name} shielded a token`, actor: p.name, color: p.color })
        return true
      },

      useBomb: (tokenId) => {
        const st = get()
        const board = getBoard(st.arms)
        const p = st.players[st.currentPlayerIndex]
        const pair = strikePairs(board, st.players, st.currentPlayerIndex).find((x) => x.defender.id === tokenId)
        if (!p || !pair || st.phase !== 'rolling' || st.powerUsed || p.powers.bomb <= 0) return false
        const victim = st.players.find((pl) => pl.tokens.some((t) => t.id === tokenId))!
        const d = pair.defender
        set((state) => {
          state.players[state.currentPlayerIndex].powers.bomb -= 1
          state.powerUsed = true
          state.players.find((pl) => pl.color === victim.color)!.tokens.find((t) => t.id === tokenId)!.distance = -1
          state.lastEvent = {
            type: 'capture',
            text: `💣 ${p.name} bombed ${victim.name}!`,
            effectId: makeId('fx'),
            effectPos: tokenPos(board, d.color, d.distance, d.tokenIndex),
            tokenIds: [tokenId],
            attackerId: null,
          }
        })
        pushLog({ kind: 'capture', icon: '💣', text: `${p.name} bombed ${victim.name}!`, actor: p.name, color: p.color, target: victim.name, targetColor: victim.color })
        return true
      },

    }
  }),
)
