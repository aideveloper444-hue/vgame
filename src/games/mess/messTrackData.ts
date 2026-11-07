export type ZoneType = 'boost' | 'obstacle' | 'freeze' | 'shortcut'

export interface TrackZone {
  id: string
  progress: number
  type: ZoneType
}

export const MESS_PLAYER_COLORS = ['#f59e0b', '#38bdf8', '#f472b6', '#4ade80']

export const TRACK_HALF_LENGTH = 8
export const LANE_X = [-1.8, -0.6, 0.6, 1.8]

export function trackZ(progress: number): number {
  return -TRACK_HALF_LENGTH + (progress / 100) * (TRACK_HALF_LENGTH * 2)
}

export const TRACK_ZONES: TrackZone[] = [
  { id: 'z1', progress: 14, type: 'boost' },
  { id: 'z2', progress: 28, type: 'obstacle' },
  { id: 'z3', progress: 42, type: 'freeze' },
  { id: 'z4', progress: 58, type: 'shortcut' },
  { id: 'z5', progress: 74, type: 'obstacle' },
  { id: 'z6', progress: 88, type: 'boost' },
]

export const ZONE_ICON: Record<ZoneType, string> = {
  boost: '⚡',
  obstacle: '⚠️',
  freeze: '❄️',
  shortcut: '🚀',
}

export const ZONE_COLOR: Record<ZoneType, string> = {
  boost: '#22d3ee',
  obstacle: '#f97316',
  freeze: '#38bdf8',
  shortcut: '#facc15',
}

export const ZONE_LABEL: Record<ZoneType, string> = {
  boost: 'Boost Pad',
  obstacle: 'Obstacle',
  freeze: 'Ice Patch',
  shortcut: 'Shortcut',
}
