import { useEffect, useRef, useState } from 'react'
import { useCityStore, type CityLastEvent } from './cityStore'

export interface CashDelta {
  id: number
  amount: number
}

export interface TurnBanner {
  id: number
  text: string
  color: string
}

export interface CardReveal {
  id: number
  event: CityLastEvent
  playerName: string
  /** Drawn by someone not playing on this device: closes by itself. */
  byOther: boolean
}

let seq = 0
const nextId = () => ++seq

/**
 * Watches the store and turns state changes into short-lived presentation events (cash pops, turn
 * banners, card reveals, headline toasts). Read-only: it never calls store actions.
 */
export function useCityFx(isLocal: (id: string) => boolean) {
  const players = useCityStore((s) => s.players)
  const phase = useCityStore((s) => s.phase)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const lastEvent = useCityStore((s) => s.lastEvent)

  const [cashDeltas, setCashDeltas] = useState<Record<string, CashDelta[]>>({})
  const [banner, setBanner] = useState<TurnBanner | null>(null)
  const [card, setCard] = useState<CardReveal | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)

  const prevCash = useRef<Record<string, number>>({})
  const prevTurn = useRef<string | null>(null)

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

  // card draws open the card; other headline events show as a toast (the Casino shows its own result)
  useEffect(() => {
    if (!lastEvent) return
    const p = players[currentPlayerIndex]
    if (lastEvent.type === 'card') {
      setCard({ id: nextId(), event: lastEvent, playerName: p?.name ?? '', byOther: !p || !isLocal(p.id) })
      return
    }
    if (lastEvent.type === 'casino') return
    const t = { id: nextId(), text: lastEvent.text }
    setToast(t)
    const timer = setTimeout(() => setToast((x) => (x?.id === t.id ? null : x)), 2600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent?.seq])

  useEffect(() => {
    if (players.length === 0 || phase === 'GAME_OVER') return
    const p = players[currentPlayerIndex]
    if (!p || prevTurn.current === p.id) return
    prevTurn.current = p.id
    const localCount = players.filter((x) => isLocal(x.id)).length
    const b = { id: nextId(), text: isLocal(p.id) && localCount === 1 ? 'Your turn!' : `${p.name}'s turn`, color: p.color }
    setBanner(b)
    const t = setTimeout(() => setBanner((x) => (x?.id === b.id ? null : x)), 1600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerIndex, players.length])

  // other players' cards close by themselves
  useEffect(() => {
    if (!card?.byOther) return
    const t = setTimeout(() => setCard((c) => (c?.id === card.id ? null : c)), 2800)
    return () => clearTimeout(t)
  }, [card])

  return { cashDeltas, banner, card, toast, dismissCard: () => setCard(null) }
}
