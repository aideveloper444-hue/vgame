export type PropId = 'lantern' | 'crate' | 'barrel' | 'torch' | 'chest' | 'rock' | 'flag' | 'basket'

export interface PropDef {
  id: PropId
  color: string
  accent: string
}

export const PROP_LIBRARY: Record<PropId, PropDef> = {
  lantern: { id: 'lantern', color: '#facc15', accent: '#7c2d12' },
  crate: { id: 'crate', color: '#a16207', accent: '#452a0a' },
  barrel: { id: 'barrel', color: '#92400e', accent: '#2b1a08' },
  torch: { id: 'torch', color: '#f97316', accent: '#4a2408' },
  chest: { id: 'chest', color: '#ca8a04', accent: '#3f2d05' },
  rock: { id: 'rock', color: '#78716c', accent: '#292524' },
  flag: { id: 'flag', color: '#ef4444', accent: '#7f1d1d' },
  basket: { id: 'basket', color: '#d97706', accent: '#78350f' },
}
