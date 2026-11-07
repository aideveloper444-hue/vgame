import { create } from 'zustand'

export type AimMode = 'shield' | 'bomb'

interface AimState {
  /** A power-up waiting for its target token, chosen on this device. */
  mode: AimMode | null
  /** Token ids that light up and can be tapped for the current mode. */
  targets: string[]
  onPick: ((tokenId: string) => void) | null
  start: (mode: AimMode, targets: string[], onPick: (tokenId: string) => void) => void
  cancel: () => void
}

/** Local "pick a token" state for Shield and Bomb; the 3D board highlights the targets. */
export const useLudoAim = create<AimState>((set) => ({
  mode: null,
  targets: [],
  onPick: null,
  start: (mode, targets, onPick) => set({ mode, targets, onPick }),
  cancel: () => set({ mode: null, targets: [], onPick: null }),
}))

export const AIM_COLOR: Record<AimMode, string> = { shield: '#5ad7ff', bomb: '#ff6a3d' }
