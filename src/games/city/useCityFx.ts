import { useEffect, useRef, useState } from 'react'
import { useCityStore } from './cityStore'
import type { CityTile } from './cityBoardData'

export interface CashDelta {
  id: number
  amount: number
}

export interface LandingToast {
  id: number
  playerName: string
  color: string
  tileName: string
}

export interface SoldFx {
  id: number
  tile: CityTile
  playerName: string
  color: string
}

export type CardKind = 'CHANCE' | 'COMMUNITY' | 'EVENT'

export interface CardReveal {
  id: number
  kind: CardKind
  text: string
  playerName: string
  byBot: boolean
}

export interface TurnBanner {
  id: number
  text: string
  color: string
  mine: boolean
}

let seq = 0
const nextId = () => ++seq

function useExpiring<T extends { id: number }>(ms: number) {
  const [items, setItems] = useState<T[]>([])
  const push = (item: T) => {
    setItems((all) => [...all, item])
    setTimeout(() => setItems((all) => all.filter((x) => x.id !== item.id)), ms)
  }
  return [items, push] as const
}

/**
 * Watches the store and turns state changes into short-lived presentation events.
 * Read-only: it never calls store actions, so game behaviour is unaffected.
 */
export function useCityFx() {
  const players = useCityStore((s) => s.players)
  const tiles = useCityStore((s) => s.tiles)
  const phase = useCityStore((s) => s.phase)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const lastEvent = useCityStore((s) => s.lastEvent)

  const [cashDeltas, setCashDeltas] = useState<Record<string, CashDelta[]>>({})
  const [landing, pushLanding] = useExpiring<LandingToast>(3200)
  const [sold, pushSold] = useExpiring<SoldFx>(2200)
  const [banner, pushBanner] = useExpiring<TurnBanner>(1700)
  const [card, setCard] = useState<CardReveal | null>(null)
  const [lastCard, setLastCard] = useState<CardReveal | null>(null)

  const prevCash = useRef<Record<string, number>>({})
  const prevOwners = useRef<Record<number, string | null>>({})
  const prevPhase = useRef(phase)
  const prevTurn = useRef<number | null>(null)

  useEffect(() => {
    const next: Record<string, number> = {}
    for (const p of players) {
      next[p.id] = p.cash
      const before = prevCash.current[p.id]
      if (before !== undefined && before !== p.cash) {
        const delta: CashDelta = { id: nextId(), amount: p.cash - before }
        setCashDeltas((all) => ({ ...all, [p.id]: [...(all[p.id] ?? []), delta] }))
        setTimeout(() => setCashDeltas((all) => ({ ...all, [p.id]: (all[p.id] ?? []).filter((d) => d.id !== delta.id) })), 1800)
      }
    }
    prevCash.current = next
  }, [players])

  useEffect(() => {
    const next: Record<number, string | null> = {}
    for (const t of tiles) {
      if (t.type !== 'PROPERTY') continue
      next[t.id] = t.ownerId
      const before = prevOwners.current[t.id]
      if (before === null && t.ownerId) {
        const owner = players.find((p) => p.id === t.ownerId)
        if (owner) pushSold({ id: nextId(), tile: t, playerName: owner.name, color: owner.color })
      }
    }
    prevOwners.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles])

  useEffect(() => {
    const was = prevPhase.current
    prevPhase.current = phase
    if (was === 'MOVING' && phase !== 'MOVING') {
      const p = players[currentPlayerIndex]
      const tile = p ? tiles[p.position] : null
      if (p && tile) pushLanding({ id: nextId(), playerName: p.name, color: p.color, tileName: tile.name })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (!lastEvent || (lastEvent.type !== 'card' && lastEvent.type !== 'event')) return
    const p = players[currentPlayerIndex]
    const icon = useCityStore.getState().eventLog[0]?.icon
    const kind: CardKind = lastEvent.type === 'event' ? 'EVENT' : (lastEvent.deck ?? (icon === '🤝' ? 'COMMUNITY' : 'CHANCE'))
    const reveal: CardReveal = { id: nextId(), kind, text: lastEvent.text, playerName: p?.name ?? '', byBot: Boolean(p?.isBot) }
    setCard(reveal)
    setLastCard(reveal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent])

  useEffect(() => {
    if (players.length === 0 || phase === 'GAME_OVER') return
    if (prevTurn.current === currentPlayerIndex) return
    prevTurn.current = currentPlayerIndex
    const p = players[currentPlayerIndex]
    if (!p) return
    pushBanner({ id: nextId(), text: p.isBot ? `${p.name}'s turn` : 'Your turn!', color: p.color, mine: !p.isBot })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerIndex, players.length])

  // bots don't need to dismiss their cards
  useEffect(() => {
    if (!card?.byBot) return
    const t = setTimeout(() => setCard((c) => (c?.id === card.id ? null : c)), 2600)
    return () => clearTimeout(t)
  }, [card])

  return {
    cashDeltas,
    landing: landing[landing.length - 1] ?? null,
    sold: sold[sold.length - 1] ?? null,
    banner: banner[banner.length - 1] ?? null,
    card,
    lastCard,
    dismissCard: () => setCard(null),
  }
}
