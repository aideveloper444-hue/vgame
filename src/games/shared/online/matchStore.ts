import { create } from 'zustand'

/** How a match was set up from the mode menu. */
export type GameMode = 'online' | 'friends' | 'local' | 'solo' | 'computer'

/** How computer players pick moves: 'easy' plays loosely, 'smart' plays the game's best-looking move. */
export type BotLevel = 'easy' | 'smart'

/** Who controls a seat: a person on this device, a person on another device, or the computer. */
export type SeatKind = 'local' | 'remote' | 'bot'

export interface Seat {
  id: string
  name: string
  avatarEmoji: string
  kind: SeatKind
}

export interface BotName {
  name: string
  avatarEmoji: string
}

/**
 * - `solo`: this device runs the whole game (vs computer, pass & play).
 * - `host`: this device runs the game and streams it to connected friends.
 * - `guest`: this device mirrors a host's game and sends its moves to the host.
 */
export type MatchRole = 'solo' | 'host' | 'guest'

export interface MatchState {
  screen: 'menu' | 'game'
  mode: GameMode | null
  role: MatchRole
  seats: Seat[]
  /** Seat ids whose turns are played on this device. */
  localSeatIds: string[]
  botLevel: BotLevel
  /** Bumped on every start so the game view remounts cleanly. */
  matchId: number
  begin: (mode: GameMode, role: MatchRole, seats: Seat[], localSeatIds: string[], botLevel?: BotLevel) => void
  backToMenu: () => void
}

/** One match store per game: which mode was picked, who sits where and who plays on this device. */
export function createMatchStore() {
  return create<MatchState>((set) => ({
    screen: 'menu',
    mode: null,
    role: 'solo',
    seats: [],
    localSeatIds: [],
    botLevel: 'smart',
    matchId: 0,
    begin: (mode, role, seats, localSeatIds, botLevel = 'smart') =>
      set((s) => ({ screen: 'game', mode, role, seats, localSeatIds, botLevel, matchId: s.matchId + 1 })),
    backToMenu: () => set({ screen: 'menu', mode: null, role: 'solo', seats: [], localSeatIds: [] }),
  }))
}

export type MatchStore = ReturnType<typeof createMatchStore>
