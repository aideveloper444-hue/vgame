import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'
import { MESS_PLAYER_COLORS, TRACK_ZONES, type ZoneType } from './messTrackData'

export type PowerType = 'freeze' | 'push' | 'reverse' | 'trap'
export type MessPhase = 'IDLE' | 'COUNTDOWN' | 'RACING' | 'FINISHED'

interface PowerConfig {
  cooldownMs: number
  label: string
  icon: string
  needsTarget: boolean
}

export const POWER_CONFIG: Record<PowerType, PowerConfig> = {
  freeze: { cooldownMs: 9000, label: 'Freeze', icon: '❄️', needsTarget: true },
  push: { cooldownMs: 7000, label: 'Push', icon: '👋', needsTarget: true },
  reverse: { cooldownMs: 10000, label: 'Reverse', icon: '🔄', needsTarget: true },
  trap: { cooldownMs: 8000, label: 'Trap', icon: '🕸️', needsTarget: false },
}

const FREEZE_MS = 3000
const REVERSE_MS = 2200
const BOOST_MS = 2500
const SLOW_MS = 1200
const TRAP_FREEZE_MS = 2200
const PUSH_AMOUNT = 10
const TRAP_AHEAD = 9
const OBSTACLE_PENALTY = 5
const SHORTCUT_BONUS = 7
const BASE_SPEED_PER_TICK = 1.35
const TICK_MS = 150
const MAX_RACE_MS = 75000

export interface MessPlayer {
  id: string
  name: string
  avatarEmoji: string
  color: string
  isBot: boolean
  progress: number
  finished: boolean
  rank: number | null
  frozenUntil: number
  reversedUntil: number
  boostedUntil: number
  slowedUntil: number
  triggeredZones: string[]
  hitsLanded: number
  timesHit: number
  lastHitAt: number
  lastHitKind: PowerType | ZoneType | null
  nextBotDecisionAt: number
}

interface MessTrap {
  id: string
  atProgress: number
  ownerId: string
}

export interface MessToast {
  id: string
  text: string
  ts: number
}

interface MessState {
  phase: MessPhase
  players: MessPlayer[]
  traps: MessTrap[]
  cooldowns: Record<string, Partial<Record<PowerType, number>>>
  finishOrder: string[]
  countdown: number
  lastEvent: MessToast | null
  raceStartedAt: number

  startGame: (participants: { id: string; name: string; avatarEmoji: string; isBot: boolean }[]) => void
  usePower: (playerId: string, power: PowerType, targetId?: string) => void
  resetGame: () => void
}

let raceInterval: ReturnType<typeof setInterval> | null = null
let countdownInterval: ReturnType<typeof setInterval> | null = null

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export const useMessStore = create<MessState>()(
  immer((set, get) => {
    function pushToast(text: string) {
      set((state) => {
        state.lastEvent = { id: makeId('toast'), text, ts: Date.now() }
      })
    }

    function stopIntervals() {
      if (raceInterval) {
        clearInterval(raceInterval)
        raceInterval = null
      }
      if (countdownInterval) {
        clearInterval(countdownInterval)
        countdownInterval = null
      }
    }

    function tick() {
      const now = Date.now()
      set((state) => {
        if (state.phase !== 'RACING') return

        for (const player of state.players) {
          if (player.finished) continue

          let delta = 0
          if (now >= player.frozenUntil) {
            const dirMul = now < player.reversedUntil ? -1 : 1
            const speedMul = (now < player.boostedUntil ? 1.8 : 1) * (now < player.slowedUntil ? 0.55 : 1)
            const variance = 0.9 + Math.random() * 0.2
            delta = dirMul * BASE_SPEED_PER_TICK * speedMul * variance
          }

          const prev = player.progress
          let next = clamp(prev + delta, 0, 100)

          for (const zone of TRACK_ZONES) {
            if (player.triggeredZones.includes(zone.id)) continue
            if (prev < zone.progress && next >= zone.progress) {
              player.triggeredZones.push(zone.id)
              if (zone.type === 'boost') {
                player.boostedUntil = now + BOOST_MS
                pushToast(`⚡ ${player.name} hit a boost pad!`)
              } else if (zone.type === 'freeze') {
                player.frozenUntil = Math.max(player.frozenUntil, now + 1400)
                pushToast(`❄️ ${player.name} slipped on ice!`)
              } else if (zone.type === 'obstacle') {
                next = clamp(next - OBSTACLE_PENALTY, 0, 100)
                player.slowedUntil = now + SLOW_MS
                player.lastHitAt = now
                player.lastHitKind = 'obstacle'
                pushToast(`⚠️ ${player.name} hit an obstacle!`)
              } else if (zone.type === 'shortcut') {
                next = clamp(next + SHORTCUT_BONUS, 0, 100)
                pushToast(`🚀 ${player.name} found a shortcut!`)
              }
            }
          }

          for (const trap of [...state.traps]) {
            if (trap.ownerId === player.id) continue
            if (prev < trap.atProgress && next >= trap.atProgress) {
              player.frozenUntil = now + TRAP_FREEZE_MS
              player.timesHit += 1
              player.lastHitAt = now
              player.lastHitKind = 'trap'
              const owner = state.players.find((p) => p.id === trap.ownerId)
              if (owner) owner.hitsLanded += 1
              state.traps = state.traps.filter((t) => t.id !== trap.id)
              pushToast(`🕸️ ${player.name} triggered ${owner?.name ?? 'a'}'s trap!`)
            }
          }

          if (next >= 100 && !player.finished) {
            player.finished = true
            player.rank = state.finishOrder.length + 1
            state.finishOrder.push(player.id)
          }
          player.progress = next

          if (player.isBot && now >= player.nextBotDecisionAt) {
            player.nextBotDecisionAt = now + 1500 + Math.random() * 1500
            runBotDecision(state, player, now)
          }
        }

        const timeUp = now - state.raceStartedAt > MAX_RACE_MS
        if (timeUp) {
          const unfinished = state.players.filter((p) => !p.finished).sort((a, b) => b.progress - a.progress)
          for (const p of unfinished) {
            p.finished = true
            p.rank = state.finishOrder.length + 1
            state.finishOrder.push(p.id)
          }
        }

        if (state.finishOrder.length >= state.players.length) {
          state.phase = 'FINISHED'
        }
      })

      if (get().phase === 'FINISHED') stopIntervals()
    }

    function runBotDecision(state: MessState, bot: MessPlayer, now: number) {
      if (Math.random() > 0.55) return
      const rivals = state.players.filter((p) => p.id !== bot.id && !p.finished)
      if (rivals.length === 0) return
      const cds = state.cooldowns[bot.id] ?? {}
      const available: PowerType[] = (['freeze', 'push', 'reverse', 'trap'] as PowerType[]).filter(
        (p) => (cds[p] ?? 0) <= now,
      )
      if (available.length === 0) return
      const power = available[Math.floor(Math.random() * available.length)]
      const target = [...rivals].sort((a, b) => b.progress - a.progress)[0]
      applyPower(state, bot, power, power === 'trap' ? undefined : target.id, now)
    }

    function applyPower(state: MessState, caster: MessPlayer, power: PowerType, targetId: string | undefined, now: number) {
      const cfg = POWER_CONFIG[power]
      if (!state.cooldowns[caster.id]) state.cooldowns[caster.id] = {}
      state.cooldowns[caster.id][power] = now + cfg.cooldownMs

      if (power === 'trap') {
        state.traps.push({ id: makeId('trap'), atProgress: clamp(caster.progress + TRAP_AHEAD, 0, 100), ownerId: caster.id })
        pushToast(`🕸️ ${caster.name} set a trap ahead!`)
        return
      }

      const target = state.players.find((p) => p.id === targetId)
      if (!target || target.finished) return

      if (power === 'freeze') target.frozenUntil = now + FREEZE_MS
      else if (power === 'reverse') target.reversedUntil = now + REVERSE_MS
      else if (power === 'push') target.progress = clamp(target.progress - PUSH_AMOUNT, 0, 100)

      target.timesHit += 1
      target.lastHitAt = now
      target.lastHitKind = power
      caster.hitsLanded += 1
      pushToast(`${cfg.icon} ${caster.name} used ${cfg.label} on ${target.name}!`)
    }

    return {
      phase: 'IDLE',
      players: [],
      traps: [],
      cooldowns: {},
      finishOrder: [],
      countdown: 3,
      lastEvent: null,
      raceStartedAt: 0,

      startGame(participants) {
        stopIntervals()
        set((state) => {
          state.players = participants.map((p, i) => ({
            id: p.id,
            name: p.name,
            avatarEmoji: p.avatarEmoji,
            color: MESS_PLAYER_COLORS[i % MESS_PLAYER_COLORS.length],
            isBot: p.isBot,
            progress: 0,
            finished: false,
            rank: null,
            frozenUntil: 0,
            reversedUntil: 0,
            boostedUntil: 0,
            slowedUntil: 0,
            triggeredZones: [],
            hitsLanded: 0,
            timesHit: 0,
            lastHitAt: 0,
            lastHitKind: null,
            nextBotDecisionAt: Date.now() + 2000 + Math.random() * 1500,
          }))
          state.traps = []
          state.cooldowns = {}
          state.finishOrder = []
          state.lastEvent = null
          state.countdown = 3
          state.phase = 'COUNTDOWN'
        })

        countdownInterval = setInterval(() => {
          set((state) => {
            state.countdown -= 1
          })
          if (get().countdown <= 0) {
            clearInterval(countdownInterval!)
            countdownInterval = null
            set((state) => {
              state.phase = 'RACING'
              state.raceStartedAt = Date.now()
            })
            raceInterval = setInterval(tick, TICK_MS)
          }
        }, 700)
      },

      usePower(playerId, power, targetId) {
        const state = get()
        if (state.phase !== 'RACING') return
        const caster = state.players.find((p) => p.id === playerId)
        if (!caster || caster.finished) return
        const now = Date.now()
        const cds = state.cooldowns[playerId] ?? {}
        if ((cds[power] ?? 0) > now) return
        if (POWER_CONFIG[power].needsTarget && !targetId) return
        set((s) => {
          const c = s.players.find((p) => p.id === playerId)!
          applyPower(s, c, power, targetId, now)
        })
      },

      resetGame() {
        stopIntervals()
        set((state) => {
          state.phase = 'IDLE'
          state.players = []
          state.traps = []
          state.cooldowns = {}
          state.finishOrder = []
          state.lastEvent = null
          state.countdown = 3
        })
      },
    }
  }),
)
