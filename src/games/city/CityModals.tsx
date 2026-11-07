import { useState, type ReactNode } from 'react'
import { ArrowRight, Gavel, Hammer, Handshake, Sparkles, X } from 'lucide-react'
import type { AuctionState, CityEventModifier, CityPlayer, TradeOffer } from './cityStore'
import { CATEGORY_TINT, type CityTile, type PropertyTile } from './cityBoardData'
import { tileArtUrl } from './cityTileArt'
import { money } from './cityFormat'

function Panel({ children, onClose, width = 'w-[min(92vw,380px)]' }: { children: ReactNode; onClose?: () => void; width?: string }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-[#030614]/55 p-4 backdrop-blur-[3px]">
      <div className={`hud-glass-strong relative ${width} rounded-[26px] p-4`} style={{ animation: 'city-pop 0.35s cubic-bezier(.2,.8,.2,1)' }}>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-200 hover:bg-white/20">
            <X size={16} />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

function Btn({ children, onClick, disabled, tone = 'primary' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'primary' | 'ghost' | 'gold' }) {
  const bg =
    tone === 'primary'
      ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
      : tone === 'gold'
        ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
        : 'bg-white/10 ring-1 ring-white/15 hover:bg-white/15'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-[14px] font-black uppercase tracking-wide text-white transition-transform hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${bg}`}
    >
      {children}
    </button>
  )
}

function PropertyArt({ tile, className = 'w-[118px]' }: { tile: CityTile; className?: string }) {
  return <img src={tileArtUrl(tile)} alt={tile.name} className={`${className} shrink-0 rounded-xl shadow-[0_10px_24px_-8px_rgba(0,0,0,0.8)]`} draggable={false} />
}

export function BuyPanel({ tile, cash, onBuy, onSkip }: { tile: PropertyTile; cash: number; onBuy: () => void; onSkip: () => void }) {
  const accent = CATEGORY_TINT[tile.category]
  return (
    <Panel>
      <p className="mb-3 text-center text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: accent }}>
        For sale
      </p>
      <div className="flex gap-4">
        <PropertyArt tile={tile} />
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-black leading-tight text-white">{tile.name}</p>
          <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950" style={{ background: accent }}>
            {tile.category.toLowerCase()}
          </span>
          <dl className="mt-3 space-y-1 text-[12.5px]">
            <div className="flex justify-between text-slate-300">
              <dt>Price</dt>
              <dd className="font-black text-amber-300">{money(tile.basePrice)}</dd>
            </div>
            <div className="flex justify-between text-slate-300">
              <dt>Rent</dt>
              <dd className="font-bold text-white">{money(tile.rentTable[0])}</dd>
            </div>
            <div className="flex justify-between text-slate-300">
              <dt>Max rent</dt>
              <dd className="font-bold text-white">{money(tile.rentTable[tile.maxLevel])}</dd>
            </div>
            <div className="flex justify-between text-slate-300">
              <dt>Your cash</dt>
              <dd className="font-bold text-white">{money(cash)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Btn onClick={onBuy} disabled={cash < tile.basePrice}>
          Buy {money(tile.basePrice)}
        </Btn>
        <Btn onClick={onSkip} tone="ghost">
          <Gavel size={15} /> Auction
        </Btn>
      </div>
    </Panel>
  )
}

export function AuctionPanel({
  auction,
  tile,
  players,
  you,
  bidIncrement,
  onBid,
  onPass,
}: {
  auction: AuctionState
  tile: PropertyTile
  players: CityPlayer[]
  you: CityPlayer | undefined
  bidIncrement: number
  onBid: () => void
  onPass: () => void
}) {
  const leader = players.find((p) => p.id === auction.currentBidderId)
  const turn = players.find((p) => p.id === auction.queue[0])
  const yourTurn = you && auction.queue[0] === you.id
  return (
    <Panel>
      <p className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">
        <Gavel size={14} /> Live auction
      </p>
      <div className="flex items-center gap-4">
        <PropertyArt tile={tile} className="w-[96px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-black leading-tight text-white">{tile.name}</p>
          <p className="mt-2 text-[34px] font-black leading-none text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]">{money(auction.currentBid)}</p>
          <p className="mt-1 text-[12px] font-semibold text-slate-300">
            {leader ? (
              <>
                Leading: <span style={{ color: leader.color }}>{leader.name}</span>
              </>
            ) : (
              'No bids yet'
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {auction.queue.map((id, i) => {
          const p = players.find((x) => x.id === id)
          return p ? (
            <span key={id} className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${i === 0 ? 'text-slate-950' : 'bg-white/10 text-slate-300'}`} style={i === 0 ? { background: p.color } : undefined}>
              {p.name}
            </span>
          ) : null
        })}
      </div>
      {yourTurn ? (
        <div className="mt-4 flex gap-2">
          <Btn onClick={onBid} tone="gold">
            Bid +{money(bidIncrement)}
          </Btn>
          <Btn onClick={onPass} tone="ghost">
            Pass
          </Btn>
        </div>
      ) : (
        <p className="mt-4 text-center text-[12px] font-semibold text-slate-400">Waiting for {turn?.name}…</p>
      )}
    </Panel>
  )
}

function tileNames(ids: number[], tiles: CityTile[]) {
  return ids.map((id) => tiles.find((t) => t.id === id)?.name).filter(Boolean).join(', ') || 'nothing'
}

export function TradeInboxPanel({ trade, from, tiles, onAccept, onReject }: { trade: TradeOffer; from: CityPlayer | undefined; tiles: CityTile[]; onAccept: () => void; onReject: () => void }) {
  return (
    <Panel>
      <p className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
        <Handshake size={14} /> Trade offer
      </p>
      <p className="text-center text-[15px] font-bold text-white">
        <span style={{ color: from?.color }}>{from?.name}</span> wants to trade
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="rounded-2xl bg-white/[0.06] p-2.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">You get</p>
          <p className="mt-1 text-[13px] font-bold text-white">{tileNames(trade.offer.propertyIds, tiles)}</p>
        </div>
        <ArrowRight size={18} className="text-slate-400" />
        <div className="rounded-2xl bg-white/[0.06] p-2.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">You give</p>
          <p className="mt-1 text-[13px] font-bold text-white">{tileNames(trade.request.propertyIds, tiles)}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Btn onClick={onAccept}>Accept</Btn>
        <Btn onClick={onReject} tone="ghost">
          Reject
        </Btn>
      </div>
    </Panel>
  )
}

function Pick({ list, value, onPick, empty }: { list: PropertyTile[]; value: number | null; onPick: (id: number | null) => void; empty: string }) {
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
      {list.length === 0 && <p className="py-3 text-center text-[11px] text-slate-500">{empty}</p>}
      {list.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(value === t.id ? null : t.id)}
          className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] font-bold ring-1 transition-colors ${value === t.id ? 'bg-white/15 text-white ring-white/60' : 'bg-white/[0.04] text-slate-300 ring-white/10 hover:bg-white/10'}`}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_TINT[t.category] }} />
          <span className="truncate">{t.name}</span>
        </button>
      ))}
    </div>
  )
}

export function TradeComposer({
  you,
  players,
  tiles,
  onSend,
  onClose,
}: {
  you: CityPlayer
  players: CityPlayer[]
  tiles: CityTile[]
  onSend: (toPlayerId: string, offerIds: number[], requestIds: number[]) => void
  onClose: () => void
}) {
  const [target, setTarget] = useState('')
  const [offer, setOffer] = useState<number | null>(null)
  const [request, setRequest] = useState<number | null>(null)
  const owned = (id: string) => tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === id)
  const targetPlayer = players.find((p) => p.id === target)


  return (
    <Panel onClose={onClose} width="w-[min(94vw,440px)]">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
        <Handshake size={14} /> Propose trade
      </p>
      <div className="flex flex-wrap gap-2">
        {players
          .filter((p) => p.id !== you.id && !p.bankrupt)
          .map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setTarget(p.id)
                setRequest(null)
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black ring-1 transition-all ${target === p.id ? 'text-slate-950' : 'bg-white/[0.06] text-white ring-white/15 hover:bg-white/10'}`}
              style={target === p.id ? { background: p.color, boxShadow: `0 0 14px ${p.color}` } : undefined}
            >
              <span>{p.avatarEmoji}</span> {p.name}
            </button>
          ))}
      </div>
      {targetPlayer && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-rose-300">You give</p>
            <Pick list={owned(you.id)} value={offer} onPick={setOffer} empty="You own no properties" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">You get</p>
            <Pick list={owned(targetPlayer.id)} value={request} onPick={setRequest} empty={`${targetPlayer.name} owns nothing`} />
          </div>
        </div>
      )}
      <div className="mt-4 flex">
        <Btn
          onClick={() => {
            onSend(target, offer !== null ? [offer] : [], request !== null ? [request] : [])
            onClose()
          }}
          disabled={!target || (offer === null && request === null)}
        >
          Send offer
        </Btn>
      </div>
    </Panel>
  )
}

export function BuildPanel({ owned, cash, onUpgrade, onClose }: { owned: PropertyTile[]; cash: number; onUpgrade: (id: number) => void; onClose: () => void }) {
  return (
    <Panel onClose={onClose} width="w-[min(94vw,440px)]">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
        <Hammer size={14} /> Build & upgrade
      </p>
      {owned.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">Buy a property first to start building.</p>}
      <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1">
        {owned.map((t) => {
          const maxed = t.level >= t.maxLevel
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2 ring-1 ring-white/10">
              <PropertyArt tile={t} className="w-[52px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-black text-white">{t.name}</p>
                <p className="text-[11px] font-semibold text-slate-400">
                  Rent {money(t.rentTable[t.level])}
                  {!maxed && (
                    <>
                      {' '}
                      → <span className="text-emerald-300">{money(t.rentTable[t.level + 1])}</span>
                    </>
                  )}
                </p>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: t.maxLevel }, (_, i) => (
                    <span key={i} className={`h-1.5 w-5 rounded-full ${i < t.level ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-white/15'}`} />
                  ))}
                </div>
              </div>
              <button
                onClick={() => onUpgrade(t.id)}
                disabled={maxed || cash < t.upgradeCost}
                className="shrink-0 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-3 py-2 text-[12px] font-black text-white shadow-[0_0_14px_rgba(16,185,129,0.45)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
              >
                {maxed ? 'MAX' : money(t.upgradeCost)}
              </button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function EventsPanel({ events, onClose }: { events: CityEventModifier[]; onClose: () => void }) {
  return (
    <Panel onClose={onClose}>
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-300">
        <Sparkles size={14} /> Active city events
      </p>
      {events.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">No events right now. Land on City Event to shake up rents!</p>}
      <div className="flex flex-col gap-2">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-500/20 to-violet-600/10 p-3 ring-1 ring-fuchsia-400/30">
            <span className="text-[24px]">✨</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-white">{e.description}</p>
              <p className="text-[11px] font-semibold text-fuchsia-200">
                {e.remainingRounds} round{e.remainingRounds === 1 ? '' : 's'} left
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export interface InventoryItem {
  id: string
  name: string
  icon: string
  desc: string
  count: number
  color: string
}

export function ItemsPanel({
  onUseItem,
  onClose,
}: {
  onUseItem?: (item: InventoryItem) => void
  onClose: () => void
}) {
  const items: InventoryItem[] = [
    { id: 'flight', name: 'Flight Ticket', icon: '✈️', desc: 'Take a free flight to any city!', count: 1, color: '#38bdf8' },
    { id: 'attack', name: 'Power Strike', icon: '⚔️', desc: 'Deal -80 damage to a rival player!', count: 2, color: '#ef4444' },
    { id: 'shield', name: 'Energy Shield', icon: '🛡️', desc: 'Blocks the next attack or rent fee!', count: 1, color: '#a855f7' },
    { id: 'dice', name: 'Lucky Doubles', icon: '🎲', desc: 'Guarantees rolling doubles on next turn!', count: 1, color: '#22c55e' },
  ]

  return (
    <Panel onClose={onClose} width="w-[min(92vw,400px)]">
      <p className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-amber-300">
        <span>💼</span> Inventory Items (5)
      </p>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/15 transition-all hover:bg-white/[0.1]"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px]"
              style={{ background: `${it.color}33`, border: `1.5px solid ${it.color}` }}
            >
              {it.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-black text-white">{it.name}</p>
                <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] font-bold text-amber-300">x{it.count}</span>
              </div>
              <p className="text-[11px] font-semibold text-slate-300">{it.desc}</p>
            </div>
            <button
              onClick={() => {
                if (onUseItem) onUseItem(it)
                onClose()
              }}
              className="shrink-0 rounded-xl bg-gradient-to-b from-sky-400 to-sky-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(56,189,248,0.5)] transition-transform hover:scale-105 active:scale-95"
            >
              Use
            </button>
          </div>
        ))}
      </div>
    </Panel>
  )
}
