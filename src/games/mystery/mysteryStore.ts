import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { MYSTERY_CASES, getCase } from './mysteryCaseData'

export type MysteryPhase = 'MAP' | 'INTRO' | 'INVESTIGATING' | 'RESULT'

export interface CaseProgress {
  stars: number
  completed: boolean
}

interface Accusation {
  suspectId: string
  itemId: string
  locationId: string
}

interface MysteryResult {
  caseId: string
  stars: number
  coins: number
  xp: number
  correct: Accusation
  /** Two-player games: index of the detective who solved it, or null if both accused wrongly. */
  winner?: number | null
}

export type MysteryMode = 'solo' | 'duo'

/** One of the two detectives sharing a phone. */
export interface Detective {
  name: string
  emoji: string
  /** Clues this detective knows; the other player never sees them. */
  clueIds: string[]
  /** A wrong accusation takes a detective out of the case. */
  out: boolean
  /** Has seen their secret police clue. */
  briefed: boolean
}

export const DUO_EMOJIS = ['🕵️', '🕵️‍♀️']

interface MysteryState {
  progress: Record<string, CaseProgress>
  phase: MysteryPhase
  currentCaseId: string | null
  revealedClueIds: string[]
  /** Evidence already inspected in the crime-scene rooms (clues and decoys). */
  foundEvidenceIds: string[]
  wrongAccusations: number
  wrongFlash: number
  lastResult: MysteryResult | null

  mode: MysteryMode
  duoNames: [string, string]
  detectives: Detective[]
  turn: number
  /** Show the "pass the phone" screen before the current detective's turn. */
  handoff: boolean
  /** evidence id -> detective index who found it (two-player games). */
  evidenceOwner: Record<string, number>

  isUnlocked: (order: number) => boolean
  startCase: (id: string) => void
  beginInvestigation: () => void
  askInvestigator: (slot: number) => void
  inspectEvidence: (evidenceId: string) => void
  makeAccusation: (accusation: Accusation) => void
  backToMap: () => void
  nextCase: () => void
  resetProgress: () => void
  setMode: (mode: MysteryMode) => void
  setDuoName: (index: number, name: string) => void
  endTurn: () => void
  takeTurn: () => void
  markBriefed: () => void
}

function starsForAttempts(attempts: number): number {
  if (attempts === 0) return 3
  if (attempts === 1) return 2
  return 1
}

export const useMysteryStore = create<MysteryState>()(
  persist(
    immer((set, get) => ({
      progress: {},
      phase: 'MAP',
      currentCaseId: null,
      revealedClueIds: [],
      foundEvidenceIds: [],
      wrongAccusations: 0,
      wrongFlash: 0,
      lastResult: null,
      mode: 'solo',
      duoNames: ['Player 1', 'Player 2'],
      detectives: [],
      turn: 0,
      handoff: false,
      evidenceOwner: {},

      isUnlocked(order) {
        if (order === 0) return true
        const prev = MYSTERY_CASES[order - 1]
        return Boolean(prev && get().progress[prev.id]?.completed)
      },

      startCase(id) {
        set((state) => {
          state.currentCaseId = id
          state.phase = 'INTRO'
          state.revealedClueIds = []
          state.foundEvidenceIds = []
          state.wrongAccusations = 0
          state.wrongFlash = 0
          state.lastResult = null
          state.detectives = []
          state.turn = 0
          state.handoff = false
          state.evidenceOwner = {}
        })
      },

      beginInvestigation() {
        const caseData = get().currentCaseId ? getCase(get().currentCaseId!) : undefined
        if (!caseData) return
        // the police report hands over a couple of clues; the rest of yours are hidden in the rooms
        set((state) => {
          state.phase = 'INVESTIGATING'
          state.revealedClueIds = [...caseData.openingClueIds]
          state.foundEvidenceIds = []
          if (state.mode === 'duo') {
            // each detective gets one of the police clues in secret, then the first turn is handed over
            state.detectives = state.duoNames.map((name, i) => ({
              name: name.trim() || `Player ${i + 1}`,
              emoji: DUO_EMOJIS[i],
              clueIds: caseData.openingClueIds[i] ? [caseData.openingClueIds[i]] : [],
              out: false,
              briefed: false,
            }))
            state.turn = 0
            state.handoff = true
            state.evidenceOwner = {}
          }
        })
      },

      askInvestigator(slot) {
        const state = get()
        const caseData = state.currentCaseId ? getCase(state.currentCaseId) : undefined
        if (!caseData) return
        if (state.mode === 'duo') {
          const me = state.detectives[state.turn]
          const next = caseData.clues.find((c) => c.slot === slot && !me.clueIds.includes(c.id))
          if (!next) return
          set((s) => {
            s.detectives[s.turn].clueIds.push(next.id)
          })
          return
        }
        const next = caseData.clues.find((c) => c.slot === slot && !state.revealedClueIds.includes(c.id))
        if (!next) return
        set((s) => {
          s.revealedClueIds.push(next.id)
        })
      },

      inspectEvidence(evidenceId) {
        const state = get()
        const caseData = state.currentCaseId ? getCase(state.currentCaseId) : undefined
        const ev = caseData?.evidence.find((e) => e.id === evidenceId)
        if (!ev || state.foundEvidenceIds.includes(ev.id)) return
        set((s) => {
          s.foundEvidenceIds.push(ev.id)
          if (s.mode === 'duo') {
            s.evidenceOwner[ev.id] = s.turn
            if (ev.clueId) s.detectives[s.turn].clueIds.push(ev.clueId)
            return
          }
          if (ev.clueId && !s.revealedClueIds.includes(ev.clueId)) s.revealedClueIds.push(ev.clueId)
        })
      },

      makeAccusation(accusation) {
        const state = get()
        const caseData = state.currentCaseId ? getCase(state.currentCaseId) : undefined
        if (!caseData) return
        const { solution } = caseData
        const isCorrect =
          accusation.suspectId === solution.suspectId && accusation.itemId === solution.itemId && accusation.locationId === solution.locationId
        if (state.mode === 'duo') {
          const finish = (winner: number | null) =>
            set((s) => {
              const existing = s.progress[caseData.id]
              if (winner !== null) s.progress[caseData.id] = { stars: Math.max(existing?.stars ?? 0, 3), completed: true }
              s.lastResult = { caseId: caseData.id, stars: winner === null ? 0 : 3, coins: winner === null ? 20 : 120, xp: winner === null ? 15 : 60, correct: solution, winner }
              s.phase = 'RESULT'
            })
          if (isCorrect) {
            finish(state.turn)
            return
          }
          set((s) => {
            s.detectives[s.turn].out = true
            s.wrongAccusations += 1
            s.wrongFlash += 1
          })
          if (get().detectives.every((d) => d.out)) finish(null)
          return
        }
        if (!isCorrect) {
          set((s) => {
            s.wrongAccusations += 1
            s.wrongFlash += 1
          })
          return
        }
        const stars = starsForAttempts(state.wrongAccusations)
        const coins = 60 + stars * 25
        const xp = 25 + stars * 12
        set((s) => {
          const existing = s.progress[caseData.id]
          s.progress[caseData.id] = { stars: Math.max(existing?.stars ?? 0, stars), completed: true }
          s.lastResult = { caseId: caseData.id, stars, coins, xp, correct: accusation }
          s.phase = 'RESULT'
        })
      },

      backToMap() {
        set((state) => {
          state.phase = 'MAP'
          state.currentCaseId = null
        })
      },

      nextCase() {
        const state = get()
        const caseData = state.currentCaseId ? getCase(state.currentCaseId) : undefined
        if (!caseData) return
        const next = MYSTERY_CASES[caseData.caseNumber + 1]
        if (next) {
          get().startCase(next.id)
        } else {
          get().backToMap()
        }
      },

      setMode(mode) {
        set((s) => {
          s.mode = mode
        })
      },

      setDuoName(index, name) {
        set((s) => {
          s.duoNames[index] = name.slice(0, 16)
        })
      },

      endTurn() {
        set((s) => {
          if (s.mode !== 'duo' || s.phase !== 'INVESTIGATING') return
          const n = s.detectives.length
          for (let step = 1; step <= n; step++) {
            const next = (s.turn + step) % n
            if (!s.detectives[next].out) {
              s.handoff = next !== s.turn
              s.turn = next
              return
            }
          }
        })
      },

      takeTurn() {
        set((s) => {
          s.handoff = false
        })
      },

      markBriefed() {
        set((s) => {
          const d = s.detectives[s.turn]
          if (d) d.briefed = true
        })
      },

      resetProgress() {
        set((state) => {
          state.progress = {}
          state.phase = 'MAP'
          state.currentCaseId = null
        })
      },
    })),
    { name: 'mw-mystery-cases', partialize: (state) => ({ progress: state.progress, mode: state.mode, duoNames: state.duoNames }) },
  ),
)
