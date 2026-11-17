import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Gavel, Handshake, Minus, Plus, X } from 'lucide-react'
import {
  ALL_CARDS,
  ERECTION_ICON,
  ERECTION_NAMES,
  GROUP_INFO,
  TILE_ICON,
  VARIANTS,
  buildBlocker,
  buildCost,
  groupOf,
  isProperty,
  mortgageBlocker,
  mortgageValue,
  ownsFullGroup,
  redeemCost,
  sellBlocker,
  type CityConfig,
  type CityTile,
  type PropertyTile,
} from '../cityBoardData'
import { computeRent, isTradable, netWorthOf, ownedBy, taxDue, type AuctionState, type CasinoResult, type CityLogEntry, type CityPlayer, type TradeOffer } from '../cityStore'
import type { CardReveal, TurnBanner } from '../useCityFx'
import { money } from '../cityFormat'
import { Die } from './TycoonStage'

/* ------------------------------------------------------------------ building blocks */

export function Panel({ children, onClose, wide = false, title }: { children: ReactNode; onClose?: () => void; wide?: boolean; title?: ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-[#020514]/60 p-3 backdrop-blur-[3px]" onClick={onClose}>
      <div
        className={`tycoon-panel relative flex max-h-[94%] flex-col rounded-[24px] ${wide ? 'w-[min(96%,620px)]' : 'w-[min(94%,400px)]'}`}
        style={{ animation: 'tycoon-pop 0.3s cubic-bezier(.2,.8,.2,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-amber-200">{title}</p>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-2">{children}</div>
      </div>
    </div>
  )
}

function Btn({ children, onClick, disabled, tone = 'green', small = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'gold' | 'green' | 'ghost' | 'red'; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`tycoon-btn tycoon-btn-${tone} flex flex-1 items-center justify-center gap-1.5 ${small ? 'px-2.5 py-1.5 text-[11.5px]' : 'py-2.5 text-[14px]'}`}>
      {children}
    </button>
  )
}

/** A deed card as printed in the rule book: colour band, number, name, landmark, price and rents. */
export function DeedCard({ tile, config, tiles, compact = false }: { tile: PropertyTile; config: CityConfig; tiles?: CityTile[]; compact?: boolean }) {
  const dark = tile.group === 'YELLOW'
  const groupSize = tile.group ? (tiles ? groupOf(tiles, tile).length : 0) : 0
  const row = (label: string, value: number, on: boolean) => (
    <div key={label} className={`flex justify-between ${on ? 'font-bold text-[#0b1240]' : 'text-[#333a55]'}`}>
      <span>{label}</span>
      <span>{money(value)}</span>
    </div>
  )
  return (
    <div className={`overflow-hidden rounded-[14px] bg-white text-[#14183a] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.8)] ${compact ? 'w-[190px]' : 'w-full max-w-[250px]'}`} style={{ border: '2px solid #0b1240' }}>
      <div className="px-3 py-2" style={{ background: tile.color, color: dark ? '#14183a' : '#fff' }}>
        <p className="text-[18px] font-bold leading-tight">
          {tile.id} {tile.name.toUpperCase()}
        </p>
        <p className="text-[11px] opacity-90">{tile.landmark}</p>
      </div>
      <div className="px-3 pb-2 pt-1.5 text-[12.5px]">
        <p className="text-[22px] font-bold leading-tight">{money(tile.basePrice)}</p>
        {tile.kind === 'SITE' ? (
          <>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#555c7a]">Rent</p>
            {row('Site only', tile.rentTable[0], tile.ownerId !== null && tile.level === 0)}
            {ERECTION_NAMES.slice(1).map((n, i) => row(`With ${n}`, tile.rentTable[i + 1], tile.level === i + 1))}
            <p className="mt-1 text-[10.5px] leading-snug text-[#555c7a]">
              If you own all {groupSize || 'the'} sites of this colour, rent of site only is doubled.
            </p>
            <p className="text-[11.5px] font-bold">Cost of each erection {money(buildCost(tile, config))}</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[15px] font-bold">RENT {money(tile.rentTable[0])}</p>
            <p className="text-[12px] text-[#333a55]">
              If you also own {tiles && tile.partnerId !== null ? tiles[tile.partnerId].name : 'the partner'}, rent is {money(tile.rentTable[1])}
            </p>
          </>
        )}
        <p className="mt-1.5 rounded-md py-1 text-center text-[11px] font-bold uppercase tracking-wide" style={{ background: tile.color, color: dark ? '#14183a' : '#fff' }}>
          Mortgage value {money(mortgageValue(tile))}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ buying and auctions */

export function BuyPanel({ tile, tiles, cash, config, onBuy, onAuction }: { tile: PropertyTile; tiles: CityTile[]; cash: number; config: CityConfig; onBuy: () => void; onAuction: () => void }) {
  return (
    <Panel title="For sale">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <DeedCard tile={tile} tiles={tiles} config={config} compact />
        <div className="flex-1 text-[13px] text-slate-200">
          <p>
            Buy <b>{tile.name}</b> at the printed price, or the Bank auctions it. Bidding opens at {money(config.auctionOpening)} and anyone can bid, including you.
          </p>
          <p className="mt-2">
            Your cash: <b className="text-amber-200">{money(cash)}</b>
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Btn onClick={onBuy} disabled={cash < tile.basePrice}>
          Buy {money(tile.basePrice)}
        </Btn>
        <Btn onClick={onAuction} tone="ghost">
          <Gavel size={15} /> Auction
        </Btn>
      </div>
    </Panel>
  )
}

export function AuctionPanel({
  auction,
  tile,
  tiles,
  players,
  you,
  config,
  onBid,
  onPass,
}: {
  auction: AuctionState
  tile: PropertyTile
  tiles: CityTile[]
  players: CityPlayer[]
  you: CityPlayer | undefined
  config: CityConfig
  onBid: (raise: number) => void
  onPass: () => void
}) {
  const leader = players.find((p) => p.id === auction.currentBidderId)
  const turn = players.find((p) => p.id === auction.queue[0])
  const yourTurn = you && auction.queue[0] === you.id
  const next = (raise: number) => (auction.currentBid === 0 ? Math.max(config.auctionOpening, raise) : auction.currentBid + raise)
  return (
    <Panel title={<span className="flex items-center gap-1.5"><Gavel size={14} /> Bank auction</span>}>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <DeedCard tile={tile} tiles={tiles} config={config} compact />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-[12px] uppercase tracking-wider text-slate-400">Top bid</p>
          <p className="text-[38px] font-bold leading-none text-amber-300">{auction.currentBid > 0 ? money(auction.currentBid) : '—'}</p>
          <p className="mt-1 text-[13px] text-slate-300">{leader ? <>Leading: <b style={{ color: leader.color }}>{leader.name}</b></> : `Opens at ${money(config.auctionOpening)}`}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {auction.queue.map((id, i) => {
              const p = players.find((x) => x.id === id)
              return p ? (
                <span key={id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${i === 0 ? 'text-slate-950' : 'bg-white/10 text-slate-300'}`} style={i === 0 ? { background: p.color } : undefined}>
                  {p.name}
                </span>
              ) : null
            })}
          </div>
        </div>
      </div>
      {yourTurn && you ? (
        <>
          <div className="mt-3 flex gap-2">
            {[100, 500, 1000].map((r) => (
              <Btn key={r} tone="gold" onClick={() => onBid(r)} disabled={next(r) > you.cash}>
                {money(next(r))}
              </Btn>
            ))}
          </div>
          <div className="mt-2 flex">
            <Btn tone="ghost" onClick={onPass}>
              {leader?.id === you.id ? 'Stop bidding' : 'Pass'}
            </Btn>
          </div>
        </>
      ) : (
        <p className="mt-3 text-center text-[13px] text-slate-400">Waiting for {turn?.name}…</p>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ Casino */

export function CasinoPanel({ cash, tray, config, onBet, onWalk }: { cash: number; tray: number; config: CityConfig; onBet: () => void; onWalk: () => void }) {
  return (
    <Panel title="🎰 Casino">
      <div className="text-center">
        <p className="text-[12px] uppercase tracking-widest text-pink-200">Jackpot tray</p>
        <p className="text-[44px] font-bold leading-none text-amber-300 drop-shadow-[0_0_14px_rgba(255,200,60,0.6)]">{money(tray + config.casinoJackpotBonus)}</p>
        <p className="mt-1 text-[12px] text-slate-400">
          tray {money(tray)} + Bank bonus {money(config.casinoJackpotBonus)}
        </p>
      </div>
      <table className="mt-3 w-full text-[13px]">
        <tbody>
          <tr className="border-b border-white/10">
            <td className="py-1 font-bold text-amber-200">6</td>
            <td>JACKPOT! Take the tray, plus {money(config.casinoJackpotBonus)} from the Bank</td>
          </tr>
          <tr className="border-b border-white/10">
            <td className="py-1 font-bold text-sky-200">5</td>
            <td>Push: your bet back{config.casinoFivePays > 0 ? `, plus ${money(config.casinoFivePays)}` : ''}</td>
          </tr>
          <tr>
            <td className="py-1 font-bold text-rose-300">1–4</td>
            <td>You lose your bet into the jackpot tray</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <Btn tone="gold" onClick={onBet} disabled={cash < config.casinoBet}>
          Bet {money(config.casinoBet)}
        </Btn>
        <Btn tone="ghost" onClick={onWalk}>
          Walk away
        </Btn>
      </div>
    </Panel>
  )
}

/** Everyone sees the Casino die land, then the outcome. */
export function CasinoResultView({ result, player, onClose }: { result: CasinoResult; player: CityPlayer | undefined; onClose: () => void }) {
  const [rolling, setRolling] = useState(true)
  useEffect(() => {
    const t1 = setTimeout(() => setRolling(false), 1100)
    const t2 = setTimeout(onClose, 4200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.seq])
  const headline = result.outcome === 'JACKPOT' ? 'JACKPOT!' : result.outcome === 'PUSH' ? 'Push' : 'No luck'
  const color = result.outcome === 'JACKPOT' ? '#ffd23f' : result.outcome === 'PUSH' ? '#7dd3fc' : '#fb7185'
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/45" onClick={onClose}>
      <div className="tycoon-panel flex w-[min(90%,320px)] flex-col items-center rounded-[24px] px-5 py-5" style={{ animation: 'tycoon-pop 0.3s ease-out' }}>
        <p className="text-[12px] uppercase tracking-[0.2em] text-pink-200">🎰 {player?.name} bets at the Casino</p>
        <div className="my-3">
          <Die value={result.roll} size={76} rolling={rolling} />
        </div>
        {!rolling && (
          <>
            <p className="text-[34px] font-bold leading-none" style={{ color, textShadow: `0 0 18px ${color}` }}>
              {headline}
            </p>
            <p className="mt-1 text-center text-[14px] text-slate-200">
              {result.outcome === 'JACKPOT' ? `+${money(result.amount)}` : result.outcome === 'PUSH' ? (result.amount > 0 ? `Bet back +${money(result.amount)}` : 'Bet returned') : `-${money(result.amount)} into the tray`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ cards and headlines */

export function CardModal({ card, onClose }: { card: CardReveal; onClose: () => void }) {
  const def = card.event.cardId ? ALL_CARDS[card.event.cardId] : undefined
  const chance = card.event.deck === 'CHANCE'
  const accent = chance ? '#f39c12' : '#16a085'
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[2px]" onClick={onClose}>
      <div className="flex flex-col items-center gap-3" style={{ animation: 'tycoon-card-in 0.55s cubic-bezier(.2,.8,.2,1)' }} onClick={(e) => e.stopPropagation()}>
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-200">{card.playerName} drew a card</p>
        <div className="w-[270px] overflow-hidden rounded-[18px] bg-[#fff8e6] text-[#14183a]" style={{ border: `4px solid ${accent}`, boxShadow: `0 0 34px ${accent}aa, 0 20px 40px -12px rgba(0,0,0,0.85)` }}>
          <div className="flex items-center justify-between px-4 py-2 text-white" style={{ background: accent }}>
            <span className="text-[22px] font-bold tracking-wide">{chance ? 'CHANCE' : 'TREASURY'}</span>
            <span className="text-[28px]">{chance ? '❓' : '💰'}</span>
          </div>
          <p className="px-5 py-6 text-center text-[19px] font-semibold leading-snug">{card.event.text}</p>
          {def?.action.kind === 'freePass' && <p className="pb-4 text-center text-[12px] font-bold uppercase tracking-wider text-emerald-700">Kept in Items until needed</p>}
        </div>
        {!card.byOther && (
          <button type="button" onClick={onClose} className="tycoon-btn tycoon-btn-gold px-10 py-2.5 text-[14px]">
            OK
          </button>
        )}
      </div>
    </div>
  )
}

export function HeadlineToast({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[13%] z-30 flex justify-center px-4">
      <p className="tycoon-panel rounded-full px-5 py-2 text-center text-[13px] font-semibold text-white sm:text-[15px]" style={{ animation: 'tycoon-pop 0.3s ease-out' }}>
        {text}
      </p>
    </div>
  )
}

export function TurnBannerView({ banner }: { banner: TurnBanner }) {
  return (
    <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[26%] z-30 flex justify-center">
      <p className="text-[36px] font-bold uppercase italic text-white sm:text-[52px]" style={{ fontFamily: 'Bangers, Oswald, sans-serif', letterSpacing: '0.05em', animation: 'tycoon-banner 1.6s ease-out forwards', textShadow: `0 0 24px ${banner.color}, 0 0 60px ${banner.color}aa, 0 4px 0 rgba(0,0,0,0.45)` }}>
        {banner.text}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ squares */

export function TileInfoPanel({ tile, tiles, players, config, clubPot, casinoTray, onClose }: { tile: CityTile; tiles: CityTile[]; players: CityPlayer[]; config: CityConfig; clubPot: number; casinoTray: number; onClose: () => void }) {
  if (!isProperty(tile)) {
    const rules: Record<string, string> = {
      GO: `Collect ${money(config.goBonus)} from the Bank every time you pass or land on START.`,
      TREASURY: 'Draw the top Treasury card and follow it, then it goes to the bottom of the deck.',
      CHANCE: 'Draw the top Chance card and follow it, then it goes to the bottom of the deck.',
      TAX: `Pay ${money(config.taxPerSite)} for each site you own, maximum ${money(config.taxCap)}. It goes into the Grand Club pot.`,
      JAIL: `Just visiting. In Jail: roll a double six, pay ${money(config.jailFine)} into the Grand Club pot, use a Get Out of Jail Free card, or wait ${config.jailTurns} turns (then pay ${money(config.jailFine)} and move). You still collect rent, trade and build.`,
      CASINO: config.casinoEnabled
        ? `You may bet ${money(config.casinoBet)} and roll one die: 6 takes the jackpot tray (now ${money(casinoTray)}) plus ${money(config.casinoJackpotBonus)}, 5 is a push, 1–4 loses your bet into the tray. Passing by does nothing.`
        : 'No betting in Kids Mode.',
      CLUB: `Every tax, fine and penalty goes into the Grand Club pot (now ${money(clubPot)}). Land here to collect the whole pot. If it is empty, the Bank gives you ${money(config.clubEmptyGift)}.`,
    }
    return (
      <Panel onClose={onClose} title={`${TILE_ICON[tile.name] ?? ''} ${tile.name}`}>
        <p className="text-[14px] leading-relaxed text-slate-200">{rules[tile.type]}</p>
      </Panel>
    )
  }
  const owner = tile.ownerId ? players.find((p) => p.id === tile.ownerId) : undefined
  return (
    <Panel onClose={onClose} title="Deed">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <DeedCard tile={tile} tiles={tiles} config={config} compact />
        <div className="flex-1 text-[13px] text-slate-200">
          <p>{owner ? <>Owned by <b style={{ color: owner.color }}>{owner.name}</b></> : 'Unowned — the Bank sells it'}</p>
          {owner && (
            <>
              <p className="mt-1">{tile.kind === 'SITE' ? `Building: ${tile.level > 0 ? `${ERECTION_ICON[tile.level]} ${ERECTION_NAMES[tile.level]}` : 'none'}` : 'Company'}</p>
              <p className="mt-1">
                Rent due now: <b className="text-amber-200">{tile.mortgaged ? 'none (mortgaged)' : money(computeRent(tile, tiles))}</b>
              </p>
              {tile.kind === 'SITE' && ownsFullGroup(tiles, tile) && <p className="mt-1 text-emerald-300">Full {GROUP_INFO[tile.group!].name.toLowerCase()} set owned</p>}
            </>
          )}
          {tile.group && (
            <p className="mt-2 text-[12px] text-slate-400">
              {GROUP_INFO[tile.group].name} set: {groupOf(tiles, tile).map((t) => t.name).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ your deeds: build, sell, mortgage, trade */

function DeedRow({ tile, children }: { tile: PropertyTile; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/[0.05] p-2 ring-1 ring-white/10">
      <span className="h-10 w-2 shrink-0 rounded-full" style={{ background: tile.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-white">
          {tile.name} {tile.mortgaged && <span className="ml-1 rounded bg-amber-300 px-1 text-[10px] text-[#3d2200]">MORTGAGED</span>}
        </p>
        <p className="text-[11.5px] text-slate-400">
          {tile.kind === 'SITE' ? (tile.level > 0 ? `${ERECTION_ICON[tile.level]} ${ERECTION_NAMES[tile.level]}` : 'Site only') : 'Company'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">{children}</div>
    </div>
  )
}

export function MyCardsPanel({
  you,
  tiles,
  config,
  canManage,
  onBuild,
  onSell,
  onTrade,
  onClose,
}: {
  you: CityPlayer
  tiles: CityTile[]
  config: CityConfig
  canManage: boolean
  onBuild: (id: number) => void
  onSell: (id: number) => void
  onTrade: () => void
  onClose: () => void
}) {
  const owned = ownedBy(tiles, you.id).sort((a, b) => a.id - b.id)
  return (
    <Panel onClose={onClose} wide title={`${you.name}'s cards`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-300">
        <span>
          Cash <b className="text-amber-200">{money(you.cash)}</b>
        </span>
        <span>·</span>
        <span>
          Net worth <b className="text-white">{money(netWorthOf(you, tiles, config))}</b>
        </span>
        {you.freePasses.length > 0 && <span className="rounded-full bg-emerald-600/40 px-2">🎫 Free Pass ×{you.freePasses.length}</span>}
      </div>
      {!canManage && <p className="mb-2 rounded-xl bg-white/5 px-3 py-2 text-[12px] text-slate-400">You can build, sell and trade on your own turn.</p>}
      {owned.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">No deeds yet. Buy cities and companies as you go round the world.</p>}
      <div className="flex flex-col gap-1.5">
        {owned.map((t) => {
          const build = buildBlocker(tiles, t, config.evenBuild)
          const sell = sellBlocker(tiles, t, config.evenBuild)
          const cost = buildCost(t, config)
          return (
            <DeedRow key={t.id} tile={t}>
              <span className="mr-1 self-center text-[11.5px] text-slate-300">Rent {t.mortgaged ? '—' : money(computeRent(t, tiles))}</span>
              {t.kind === 'SITE' && (
                <>
                  <Btn small tone="green" onClick={() => onBuild(t.id)} disabled={!canManage || build !== null || you.cash < cost}>
                    {build === null ? `${ERECTION_NAMES[t.level + 1]} ${money(cost)}` : build}
                  </Btn>
                  {t.level > 0 && (
                    <Btn small tone="ghost" onClick={() => onSell(t.id)} disabled={!canManage || sell !== null}>
                      Sell +{money(Math.floor(cost / 2))}
                    </Btn>
                  )}
                </>
              )}
            </DeedRow>
          )
        })}
      </div>
      <div className="mt-3 flex">
        <Btn tone="gold" onClick={onTrade} disabled={!canManage}>
          <Handshake size={16} /> Trade with a player
        </Btn>
      </div>
    </Panel>
  )
}

export function BankPanel({
  you,
  tiles,
  config,
  canManage,
  clubPot,
  casinoTray,
  onMortgage,
  onRedeem,
  onSell,
  onClose,
}: {
  you: CityPlayer | undefined
  tiles: CityTile[]
  config: CityConfig
  canManage: boolean
  clubPot: number
  casinoTray: number
  onMortgage: (id: number) => void
  onRedeem: (id: number) => void
  onSell: (id: number) => void
  onClose: () => void
}) {
  const owned = you ? ownedBy(tiles, you.id).sort((a, b) => a.id - b.id) : []
  const stat = (label: string, value: string) => (
    <div className="rounded-2xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10">
      <p className="text-[10.5px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[18px] font-bold text-amber-200">{value}</p>
    </div>
  )
  return (
    <Panel onClose={onClose} wide title="🏦 Bank">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Grand Club pot', money(clubPot))}
        {stat('Casino jackpot', config.casinoEnabled ? money(casinoTray) : 'off')}
        {stat('Pass START', money(config.goBonus))}
        {stat('Tax due now', you ? money(taxDue(tiles, you.id, config)) : '—')}
      </div>
      <p className="mt-3 text-[12px] text-slate-400">
        Mortgage a deed for half its price (sell the colour set's buildings first). Lift it for the mortgage plus {Math.round(config.mortgageInterest * 100)}% interest. Buildings sell back for half their cost.
      </p>
      {!canManage && <p className="mt-2 rounded-xl bg-white/5 px-3 py-2 text-[12px] text-slate-400">Mortgages are handled on your own turn.</p>}
      <div className="mt-2 flex flex-col gap-1.5">
        {owned.length === 0 && <p className="py-4 text-center text-[13px] text-slate-400">No deeds to mortgage.</p>}
        {owned.map((t) => {
          const block = mortgageBlocker(tiles, t)
          const lift = redeemCost(t, config.mortgageInterest)
          return (
            <DeedRow key={t.id} tile={t}>
              {t.level > 0 && (
                <Btn small tone="ghost" onClick={() => onSell(t.id)} disabled={!canManage || sellBlocker(tiles, t, config.evenBuild) !== null}>
                  Sell {ERECTION_NAMES[t.level]} +{money(Math.floor(buildCost(t, config) / 2))}
                </Btn>
              )}
              {t.mortgaged ? (
                <Btn small tone="gold" onClick={() => onRedeem(t.id)} disabled={!canManage || !you || you.cash < lift}>
                  Lift {money(lift)}
                </Btn>
              ) : (
                <Btn small tone="red" onClick={() => onMortgage(t.id)} disabled={!canManage || block !== null}>
                  {block ?? `Mortgage +${money(mortgageValue(t))}`}
                </Btn>
              )}
            </DeedRow>
          )
        })}
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ information */

const RULES: [string, string[]][] = [
  ['Turn', ['Roll both dice and move clockwise.', 'Resolve the square you land on.', 'Double six: roll again. Three double sixes in a row send you to Jail.', 'Passing or landing on START collects the bonus from the Bank.']],
  ['Buying', ['Unowned city or company: buy it at the printed price, or the Bank auctions it. Bidding opens at $100 and anyone can bid, including you.', 'Owned by someone else: pay the rent on the deed. Mortgaged deeds collect no rent.']],
  ['Building', ['Build only when you own every site of a colour and none is mortgaged.', 'One building per site: Office, then Bungalow, then Godown; each upgrade replaces the last.', 'Build evenly across the set. Buildings sell back to the Bank for half the cost.', 'Owning a whole colour doubles the rent of a site with no building.']],
  ['Companies', ['Rent is the lower figure; with the partner company it is the higher figure.', 'Partners: Railway + Transport Co., Airport + Cruise Line, Postal Service + Radio Station. Companies cannot be built on.']],
  ['Money', ['Income / Sales Tax: $50 per site you own, maximum $500, into the Grand Club pot.', 'Mortgage for half the price; lift it for the mortgage plus 10%.', 'Trade undeveloped deeds at any agreed price. Taking a mortgaged deed costs 10% interest straight away.']],
  ['Casino, Club, Jail', ['Casino: bet and roll one die. 6 wins the jackpot tray plus $1000, 5 is a push, 1–4 feeds the tray.', 'Grand Club: collect the whole pot of taxes, fines and penalties, or $500 if it is empty.', 'Jail: roll a double six, pay $500, use a Get Out of Jail Free card, or wait three turns, then pay $500 and move.']],
  ['Winning', ['Can\'t pay? Buildings are sold and deeds mortgaged automatically. Still short: you hand everything to the player you owe (or the Bank) and leave the game.', 'The last player still in business wins.']],
]

export function InfoPanel({ log, players, tiles, config, round, onClose }: { log: CityLogEntry[]; players: CityPlayer[]; tiles: CityTile[]; config: CityConfig; round: number; onClose: () => void }) {
  const [tab, setTab] = useState<'log' | 'standings' | 'rules'>('log')
  const ranked = players.map((p) => ({ p, worth: netWorthOf(p, tiles, config) })).sort((a, b) => b.worth - a.worth)
  return (
    <Panel onClose={onClose} wide title={`Information · Round ${round} · ${VARIANTS[config.variant].name}`}>
      <div className="mb-3 flex gap-1.5">
        {(['log', 'standings', 'rules'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`tycoon-btn flex-1 py-1.5 text-[12px] ${tab === t ? 'tycoon-btn-gold' : 'tycoon-btn-ghost'}`}>
            {t === 'log' ? 'Game log' : t}
          </button>
        ))}
      </div>
      {tab === 'log' && (
        <div className="flex flex-col gap-1">
          {log.map((e) => (
            <p key={e.id} className="flex gap-2 rounded-lg bg-white/[0.04] px-2 py-1 text-[12.5px] text-slate-200">
              <span>{e.icon}</span>
              <span>{e.text}</span>
            </p>
          ))}
        </div>
      )}
      {tab === 'standings' && (
        <div className="flex flex-col gap-1.5">
          {ranked.map(({ p, worth }, i) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/10">
              <span className="text-[18px] font-bold text-amber-200">#{i + 1}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 font-bold">{p.name}{p.bankrupt && <span className="ml-2 text-[11px] text-rose-300">bankrupt</span>}</span>
              <span className="text-right text-[12px] text-slate-300">
                cash {money(p.cash)} · {ownedBy(tiles, p.id).length} deeds
                <br />
                <b className="text-[14px] text-white">{money(worth)}</b>
              </span>
            </div>
          ))}
        </div>
      )}
      {tab === 'rules' && (
        <div className="flex flex-col gap-3 text-[12.5px] text-slate-200">
          <p className="rounded-xl bg-white/5 px-3 py-2">{VARIANTS[config.variant].blurb}</p>
          {RULES.map(([h, lines]) => (
            <div key={h}>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-rose-300">{h}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function ItemsPanel({ you, canUseNow, onUse, onClose }: { you: CityPlayer | undefined; canUseNow: boolean; onUse: () => void; onClose: () => void }) {
  const passes = you?.freePasses ?? []
  return (
    <Panel onClose={onClose} title="💼 Items">
      {passes.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">No items yet. Get Out of Jail Free cards from Chance and Treasury are kept here until you need them.</p>}
      <div className="flex flex-col gap-2">
        {passes.map((id, i) => (
          <div key={`${id}-${i}`} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/15">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/25 text-[26px] ring-2 ring-emerald-400">🎫</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold">Get Out of Jail Free</p>
              <p className="text-[11.5px] text-slate-400">From the {ALL_CARDS[id]?.deck === 'CHANCE' ? 'Chance' : 'Treasury'} deck. Use it before rolling while in Jail.</p>
            </div>
            <Btn small tone="green" onClick={onUse} disabled={!canUseNow}>
              Use
            </Btn>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function SettingsPanel({ config, round, onLeave, onClose }: { config: CityConfig; round: number; onLeave: () => void; onClose: () => void }) {
  return (
    <Panel onClose={onClose} title="Game">
      <p className="text-[14px] font-bold">{VARIANTS[config.variant].name}</p>
      <p className="mt-1 text-[12.5px] text-slate-300">{VARIANTS[config.variant].blurb}</p>
      <p className="mt-2 text-[12px] text-slate-400">
        Round {round}. If {config.maxRounds} rounds pass with several players still in business, the richest wins.
      </p>
      <div className="mt-4 flex">
        <Btn tone="red" onClick={onLeave}>
          Leave game
        </Btn>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ trading */

function DeedPicker({ list, picked, onToggle, empty }: { list: PropertyTile[]; picked: number[]; onToggle: (id: number) => void; empty: string }) {
  return (
    <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
      {list.length === 0 && <p className="py-3 text-center text-[11px] text-slate-500">{empty}</p>}
      {list.map((t) => {
        const on = picked.includes(t.id)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle(t.id)}
            className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] font-semibold ring-1 ${on ? 'bg-white/15 text-white ring-white/60' : 'bg-white/[0.04] text-slate-300 ring-white/10'}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="text-[10.5px] text-slate-400">{t.mortgaged ? 'mortg.' : money(t.basePrice)}</span>
          </button>
        )
      })}
    </div>
  )
}

function CashStepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-1.5 flex items-center justify-between rounded-full bg-white/[0.06] px-1 py-1 ring-1 ring-white/10">
      <button type="button" aria-label="Less" onClick={() => onChange(Math.max(0, value - 500))} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
        <Minus size={14} />
      </button>
      <span className="text-[13px] font-bold text-amber-200">{money(value)}</span>
      <button type="button" aria-label="More" onClick={() => onChange(Math.min(max, value + 500))} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
        <Plus size={14} />
      </button>
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
  onSend: (toPlayerId: string, offerIds: number[], requestIds: number[], offerCash: number, requestCash: number) => void
  onClose: () => void
}) {
  const rivals = players.filter((p) => p.id !== you.id && !p.bankrupt)
  const [target, setTarget] = useState(rivals[0]?.id ?? '')
  const [offer, setOffer] = useState<number[]>([])
  const [request, setRequest] = useState<number[]>([])
  const [offerCash, setOfferCash] = useState(0)
  const [requestCash, setRequestCash] = useState(0)
  const tradable = (id: string) => ownedBy(tiles, id).filter(isTradable)
  const them = players.find((p) => p.id === target)
  const toggle = (list: number[], set: (v: number[]) => void) => (id: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const empty = offer.length === 0 && request.length === 0 && offerCash === 0 && requestCash === 0
  return (
    <Panel onClose={onClose} wide title={<span className="flex items-center gap-1.5"><Handshake size={14} /> Propose a trade</span>}>
      <div className="flex flex-wrap gap-2">
        {rivals.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setTarget(p.id)
              setRequest([])
              setRequestCash(0)
            }}
            className={`rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ${target === p.id ? 'text-slate-950' : 'bg-white/[0.06] text-white ring-white/15'}`}
            style={target === p.id ? { background: p.color, boxShadow: `0 0 14px ${p.color}` } : undefined}
          >
            {p.name}
          </button>
        ))}
      </div>
      {them && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-rose-300">You give</p>
            <DeedPicker list={tradable(you.id)} picked={offer} onToggle={toggle(offer, setOffer)} empty="No undeveloped deeds" />
            <CashStepper value={offerCash} max={you.cash} onChange={setOfferCash} />
          </div>
          <div>
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-300">You get</p>
            <DeedPicker list={tradable(them.id)} picked={request} onToggle={toggle(request, setRequest)} empty={`${them.name} has no undeveloped deeds`} />
            <CashStepper value={requestCash} max={them.cash} onChange={setRequestCash} />
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Only deeds without buildings can be traded. Whoever takes a mortgaged deed pays 10% interest at once.</p>
      <div className="mt-3 flex">
        <Btn
          tone="gold"
          disabled={!them || empty}
          onClick={() => {
            onSend(target, offer, request, offerCash, requestCash)
            onClose()
          }}
        >
          Send offer
        </Btn>
      </div>
    </Panel>
  )
}

export function TradeInboxPanel({ trade, from, tiles, onAccept, onReject }: { trade: TradeOffer; from: CityPlayer | undefined; tiles: CityTile[]; onAccept: () => void; onReject: () => void }) {
  const list = (ids: number[], cash: number) => {
    const names = ids.map((id) => tiles[id]?.name).filter(Boolean)
    if (cash > 0) names.push(money(cash))
    return names.join(', ') || 'nothing'
  }
  return (
    <Panel title={<span className="flex items-center gap-1.5"><Handshake size={14} /> Trade offer</span>}>
      <p className="text-center text-[15px] font-bold">
        <span style={{ color: from?.color }}>{from?.name}</span> wants to trade
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="rounded-2xl bg-white/[0.06] p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">You get</p>
          <p className="mt-1 text-[13px] font-semibold">{list(trade.offer.propertyIds, trade.offer.cash)}</p>
        </div>
        <ArrowRight size={18} className="text-slate-400" />
        <div className="rounded-2xl bg-white/[0.06] p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300">You give</p>
          <p className="mt-1 text-[13px] font-semibold">{list(trade.request.propertyIds, trade.request.cash)}</p>
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
