import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, LogOut, Menu, MessageCircle, ScrollText, SendHorizontal, Volume2, WifiOff } from 'lucide-react'
import dealerArt from '../art/table_dealer.webp'
import { Avatar, CardBack, Chip, ChipStack, PlayingCard, Sheet, Toggle, fmt, fmtShort, toast } from '../kit'
import { CrownIcon, TrophyIcon } from '../icons'
import { legalActions, type PublicSeat, type PublicTable, type TableState } from '../../engine/table'
import { useNav } from '../../state/nav'
import { currentProfile, shown, useProfile, useRpc } from '../../state/profileStore'
import { describeHand, heroAct, leaveTable, rebuy, sendChat, sendEmote, usePokerTable } from '../../state/tableStore'
import { send, useLive } from '../../net/live'
import { rooms } from '../../net/rooms'
import { ReportSheet } from './Report'
import { api } from '../../net/api'
import { cosmetic } from '../../data/catalog'
import { pokerSfx } from '../sound'

/* Seat slots in % of the stage (x, y of the avatar centre), clockwise from the hero at the bottom. */
type Slot = [number, number]
const S: Record<string, Slot> = { hero: [47, 73], BL: [14, 63], ML: [11, 44], TL: [15, 24.5], TR: [85, 24.5], R: [88, 46] }
const LAYOUTS: Record<number, Slot[]> = {
  2: [S.hero, S.TR],
  3: [S.hero, S.TL, S.TR],
  4: [S.hero, S.BL, S.TL, S.TR],
  5: [S.hero, S.BL, S.TL, S.TR, S.R],
  6: [S.hero, S.BL, S.ML, S.TL, S.TR, S.R],
}
const CENTER: Slot = [50, 50]
const EMOTES = ['😀', '👍', '😂', '😮', '😎', '🔥', '🙏', '🎉']
const QUICK_CHAT = ['Nice hand!', 'Good luck!', 'Well played 👏', 'Hurry up ⏳', 'GG', 'Wow!']

const lerp = (a: Slot, b: Slot, t: number): Slot => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const pos = ([x, y]: Slot): CSSProperties => ({ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' })

function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const ACTION_LABEL: Record<string, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in', sb: 'SB', bb: 'BB', timeout: 'Time out' }

/** Screen 4: the live table. */
export default function TableScreen() {
  const t = usePokerTable()
  const p = useProfile()
  const back = useNav((s) => s.back)
  const go = useNav((s) => s.go)
  const now = useNow()
  const [menu, setMenu] = useState(false)
  const [chat, setChat] = useState(false)
  const [emotes, setEmotes] = useState(false)
  const [history, setHistory] = useState(false)
  const [netInfo, setNetInfo] = useState(false)
  const [sizing, setSizing] = useState<number | null>(null)
  const fourColor = !!p?.settings.fourColorDeck
  const felt = cosmetic(shown(p, 'felt'))?.colors ?? ['#1f9d3c', '#0b5d22']

  const v = t.view
  const n = v?.seats.length ?? 5
  const me = t.myIndex
  const layout = LAYOUTS[Math.min(6, Math.max(2, n))]
  const slotOf = (i: number): Slot => layout[(i - Math.max(0, me) + n) % n]
  const live = !!v && ['preflop', 'flop', 'turn', 'river'].includes(v.phase)
  const myTurn = live && v!.active === me && me >= 0
  const legal = myTurn ? legalActions(v as unknown as TableState, me) : null
  const remaining = v && v.deadline ? Math.max(0, v.deadline - (now + t.clockOffset)) : 0

  // a short buzz when the turn comes round
  useEffect(() => {
    if (myTurn) pokerSfx.turn()
    else setSizing(null)
  }, [myTurn, v?.version])

  const net = useLive()
  const [picked, setPicked] = useState<{ seat: number; name: string; id: string; bot: boolean } | null>(null)
  const [report, setReport] = useState<{ id: string; name: string } | null>(null)
  const exit = () => {
    if (t.mode === 'friends') rooms.leave()
    leaveTable()
    back()
  }

  const doAct = (type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number) => {
    const err = heroAct({ type, amount })
    if (err) toast(err, 'bad')
    setSizing(null)
  }

  if (!v) {
    return (
      <div className="rpc-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="rpc-spinner" />
          <p className="rpc-muted">{t.role === 'server' ? 'Taking your seat…' : 'Setting up the table…'}</p>
          <button className="btn btn-dark h-11 px-5" onClick={exit}>
            Leave
          </button>
        </div>
      </div>
    )
  }

  const result = v.phase === 'complete' ? v.result : null
  const heroSeat = me >= 0 ? v.seats[me] : null
  const heroHand = heroSeat?.inHand && t.myHoleHand === v.handNo ? describeHand(t.myHole, v.board) : null
  const winnerCards = new Set(result && !result.uncontested ? result.winners.flatMap((w) => result.reveals[w]?.best ?? []) : [])
  const potShown = result ? result.pots.filter((x) => !x.returned).reduce((a, b) => a + b.amount, 0) : v.pot - v.seats.reduce((a, x) => a + (x?.bet ?? 0), 0)
  const tr = t.tourney

  return (
    <div className="rpc-screen overflow-hidden" style={{ containerType: 'size', paddingTop: 0 }}>
      {/* ---------- backdrop: night lounge, dealer ---------- */}
      <div className="absolute inset-x-0 top-0 h-[42%]" style={{ background: 'radial-gradient(60% 80% at 50% 0%, #2a1c4a 0%, #120a1e 55%, #060404 100%)' }} />
      <div className="absolute inset-x-0 top-0 h-[42%] opacity-60" style={{ background: 'radial-gradient(3px 3px at 12% 18%, #ffd27a, transparent), radial-gradient(2px 2px at 22% 30%, #ffb347, transparent), radial-gradient(3px 3px at 80% 14%, #9ad0ff, transparent), radial-gradient(2px 2px at 88% 32%, #ffd27a, transparent), radial-gradient(2px 2px at 70% 26%, #ff9ad5, transparent), radial-gradient(3px 3px at 32% 10%, #fff, transparent)' }} />
      <img src={dealerArt} alt="Dealer" className="absolute left-1/2 top-0 h-[31%] w-auto -translate-x-1/2" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent), linear-gradient(#000 80%, transparent)', maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }} draggable={false} />

      {/* ---------- felt ---------- */}
      <div className="absolute rounded-[50%]" style={{ left: '-14%', right: '-14%', top: '27.5%', height: '57%', background: 'linear-gradient(180deg,#3a2410,#120a04)', boxShadow: '0 -6px 30px rgba(255,190,60,.25), inset 0 0 0 3px #2a1806' }} />
      <div className="absolute rounded-[50%]" style={{ left: '-10%', right: '-10%', top: '29.5%', height: '52.5%', padding: '1.6cqw', background: 'linear-gradient(180deg,#fff0a8,#e3a92e 30%,#7a4b08 60%,#f6cf62)', boxShadow: '0 0 24px rgba(255,200,80,.55)' }}>
        <div className="h-full w-full rounded-[50%]" style={{ background: `radial-gradient(60% 55% at 50% 40%, ${felt[0]} 0%, color-mix(in srgb, ${felt[0]} 60%, ${felt[1]}) 55%, ${felt[1]} 100%)`, boxShadow: 'inset 0 0 40px rgba(0,0,0,.55), inset 0 0 0 2px rgba(0,0,0,.35)' }} />
      </div>
      <div className="absolute left-1/2 top-[31.5%] -translate-x-1/2">
        <span className="rpc-display gold-frame rounded-xl px-6 py-1 text-[1.25em] text-white">Dealer</span>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[37%] flex -translate-x-1/2 flex-col items-center opacity-90">
        <CrownIcon size={34} />
        <span className="rpc-logo-type text-center text-[1.15em] text-[#f6dd8a]" style={{ textShadow: '0 1px 0 rgba(0,0,0,.4)', lineHeight: 1.05 }}>
          ROYAL
          <br />
          POKER CLUB
        </span>
      </div>

      {/* ---------- community cards ---------- */}
      <div className="absolute left-1/2 top-[50%] flex -translate-x-1/2 -translate-y-1/2 gap-[1.6cqw]">
        {[0, 1, 2, 3, 4].map((k) => {
          const c = v.board[k]
          return c ? (
            <PlayingCard key={`${v.handNo}-${c}`} card={c} width="15.2cqw" fourColor={fourColor} className={`rpc-flip ${winnerCards.size && !winnerCards.has(c) ? 'dim' : ''} ${winnerCards.has(c) ? 'win' : ''}`} style={{ animationDelay: `${(k >= 3 ? 0 : k) * 0.12}s` }} />
          ) : (
            <div key={k} className="rounded-[9%/6.5%]" style={{ width: '15.2cqw', aspectRatio: '5/7', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.12)', background: 'rgba(0,0,0,.12)' }} />
          )
        })}
      </div>

      {/* ---------- pot ---------- */}
      {potShown > 0 && (
        <div className="absolute left-1/2 top-[59%] -translate-x-1/2 -translate-y-1/2" aria-live="polite">
          <div className={`flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1.5 pr-4 ${result ? 'rpc-to-winner' : ''}`} style={{ boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.45)', ...(result && result.winners[0] != null ? (() => { const w = slotOf(result.winners[0]); return { '--wx': `${(w[0] - 50) * 3.6}px`, '--wy': `${(w[1] - 60) * 7}px` } as CSSProperties })() : {}) }}>
            <span className="flex -space-x-1.5">
              <Chip value={50} size={20} />
              <Chip value={500} size={20} />
              <Chip value={5000} size={20} />
            </span>
            <span className="rpc-display text-[1.25em] text-[#ffe48a]">Pot: {fmt(potShown)}</span>
          </div>
        </div>
      )}

      {/* ---------- seats ---------- */}
      {v.seats.map((seat, i) =>
        i === me ? null : <SeatView key={i} onPick={() => seat && setPicked({ seat: i, name: seat.name, id: seat.id, bot: seat.kind === 'bot' })} seat={seat} index={i} slot={slotOf(i)} v={v} remaining={remaining} fourColor={fourColor} emote={t.emotes.find((e) => e.seat === i && now - e.at < 2600)?.emoji} />,
      )}

      {/* ---------- hero ---------- */}
      {heroSeat && (
        <>
          <div style={pos(S.hero)} className="flex flex-col items-center">
            {v.dealer === me && <DealerButton style={{ position: 'absolute', left: -14, top: 4 }} />}
            <Avatar avatar={heroSeat.avatar} size={84} glow={myTurn} className={heroSeat.folded ? 'opacity-60' : ''} />
            {t.emotes.find((e) => e.seat === me && now - e.at < 2600) && <span className="rpc-pop absolute -top-9 text-4xl">{t.emotes.find((e) => e.seat === me)!.emoji}</span>}
            <div className="gold-frame -mt-2 min-w-[118px] rounded-xl px-3 py-1 text-center">
              <p className="rpc-display text-[1.2em] leading-tight text-white">{heroSeat.name}</p>
              <p className="rpc-display text-[1.25em] leading-tight text-[#ffe48a]">{fmt(heroSeat.stack)}</p>
            </div>
            {result && result.net[me] > 0 && <span className="rpc-winner rpc-display gold-text absolute -top-12 whitespace-nowrap text-[1.6em]">+{fmt(result.net[me])}</span>}
          </div>
          {heroSeat.bet > 0 && <BetChips amount={heroSeat.bet} slot={lerp(S.hero, CENTER, 0.42)} />}
          {heroSeat.last && live && <ActionTag text={ACTION_LABEL[heroSeat.last.type]} style={pos([S.hero[0] - 22, S.hero[1] + 3])} />}
          {heroSeat.inHand && t.myHoleHand === v.handNo && t.myHole.length === 2 && (
            <div className="absolute flex flex-col items-center" style={{ left: '76%', top: '69.5%', transform: 'translate(-50%,-50%)' }}>
              <div className="flex">
                {t.myHole.map((c, k) => (
                  <PlayingCard
                    key={`${v.handNo}-${c}`}
                    card={c}
                    width="17cqw"
                    fourColor={fourColor}
                    className={`rpc-deal ${heroSeat.folded ? 'dim' : ''} ${winnerCards.has(c) ? 'win' : ''}`}
                    style={{ marginLeft: k ? '-6cqw' : 0, rotate: k ? '9deg' : '-4deg', translate: k ? '0 3px' : '0', animationDelay: `${k * 0.14}s`, '--from-x': '-20cqw', '--from-y': '-45cqh' } as CSSProperties}
                  />
                ))}
              </div>
              {heroHand && <span className="rpc-display mt-1 rounded-full bg-black/60 px-2.5 py-0.5 text-[0.9em] text-[#ffe48a]">{heroHand}</span>}
            </div>
          )}
        </>
      )}

      {/* ---------- top bar ---------- */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <button aria-label="Table menu" onClick={() => setMenu(true)} className="icon-btn h-12 w-12">
          <Menu size={28} color="#fff" strokeWidth={2.6} />
        </button>
        <div className="mt-1 flex max-w-[48%] flex-col items-center gap-1">
          <span className="rpc-display truncate rounded-full bg-black/60 px-3 py-0.5 text-[0.85em] text-[#ffe9b0]" style={{ boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.4)' }}>
            {tr ? `${tr.def.name}` : t.tableName} · {fmtShort(v.config.smallBlind)}/{fmtShort(v.config.bigBlind)}
          </span>
          {tr && !tr.finished && (
            <span className="rpc-display rounded-full bg-black/60 px-2.5 py-0.5 text-[0.78em] text-white/90">
              Level {tr.level + 1} · {fmt(tr.remaining)} left
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button aria-label="Connection" onClick={() => setNetInfo(true)} className="icon-btn h-12 w-12">
            {t.connection === 'ok' ? <SignalBars /> : <WifiOff size={24} color="#f87171" />}
          </button>
          <button aria-label="Chat" onClick={() => setChat(true)} className="icon-btn h-12 w-12">
            <MessageCircle size={26} color="#fff" fill="#fff" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ---------- left tools & timer ---------- */}
      <div className="absolute left-3 flex flex-col gap-2.5" style={{ top: '76%' }}>
        <button aria-label="Emotes" onClick={() => setEmotes(true)} className="icon-btn h-12 w-12">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10.5" fill="url(#rpcGold)" stroke="#8a5a0a" />
            <ellipse cx="8.6" cy="9.4" rx="1.3" ry="1.8" fill="#3a2205" />
            <ellipse cx="15.4" cy="9.4" rx="1.3" ry="1.8" fill="#3a2205" />
            <path d="M6.8 13.4c1.2 2.6 3 3.8 5.2 3.8s4-1.2 5.2-3.8" fill="none" stroke="#3a2205" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button aria-label="Table chat" onClick={() => setChat(true)} className="icon-btn h-12 w-12">
          <MessageCircle size={24} color="#fff" fill="#fff" strokeWidth={1.5} />
        </button>
      </div>
      <button aria-label="Hand history" onClick={() => setHistory(true)} className="absolute right-2 flex items-center gap-0.5" style={{ top: '83.5%' }}>
        <TimerRing ms={live ? remaining : 0} total={v.config.turnMs} mine={myTurn} />
        <ChevronRight size={22} className="text-white/80" />
      </button>

      {/* ---------- actions ---------- */}
      {sizing != null && legal && <BetSizer legal={legal} pot={v.pot} bb={v.config.bigBlind} value={sizing} onChange={setSizing} onConfirm={() => doAct(sizing >= legal.maxTo ? 'allin' : legal.isBet ? 'bet' : 'raise', sizing)} onCancel={() => setSizing(null)} />}
      <ActionBar legal={legal} myTurn={myTurn} pending={t.pending} sizing={sizing} pot={v.pot} bb={v.config.bigBlind} onAct={doAct} onSize={setSizing} />

      {/* ---------- overlays ---------- */}
      {result && result.winners.length > 0 && <WinnerBanner v={v} me={me} />}
      {t.busted && (
        <Overlay title="Out of points at this table">
          <p className="rpc-muted mb-4 text-center">Take a fresh stack (it’s free) or head back to the lobby.</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn btn-dark h-12" onClick={exit}>
              Leave
            </button>
            <button
              className="btn btn-gold h-12 text-[1.15em]"
              onClick={() => {
                const err = rebuy()
                if (err) {
                  toast(err, 'bad')
                  exit()
                  go('rewards')
                }
              }}
            >
              New stack
            </button>
          </div>
        </Overlay>
      )}
      {tr?.finished && (
        <Overlay title={tr.place === 1 ? 'Champion!' : `You finished #${fmt(tr.place ?? 0)}`}>
          <div className="mb-3 flex justify-center">
            <TrophyIcon size={70} />
          </div>
          <p className="text-center text-[1.05em] text-white">
            {tr.def.name} · {fmt(tr.field)} players
          </p>
          <p className="rpc-display gold-text my-2 text-center text-[1.8em]">{tr.prize > 0 ? `+${fmt(tr.prize)} points` : 'No prize this time'}</p>
          <button className="btn btn-gold mt-2 h-12 w-full text-[1.15em]" onClick={exit}>
            Back to Lobby
          </button>
        </Overlay>
      )}
      {(t.connection !== 'ok' || (t.role === 'server' && net.status === 'reconnecting')) && (
        <Overlay title={t.connection === 'lost' ? 'Connection lost' : 'Reconnecting…'}>
          {t.connection !== 'lost' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rpc-spinner" />
              <p className="rpc-muted text-center">Getting you back to your seat. The hand carries on; your timer checks or folds for you.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button className="btn btn-dark h-12" onClick={exit}>
                Leave
              </button>
              <button className="btn btn-gold h-12" onClick={() => (usePokerTable.setState({ connection: 'reconnecting' }), send({ type: 'JOIN_TABLE', tableId: t.tableId }), setTimeout(() => usePokerTable.getState().connection === 'reconnecting' && usePokerTable.setState({ connection: 'lost' }), 6000))}>
                Retry
              </button>
            </div>
          )}
        </Overlay>
      )}

      {/* ---------- sheets ---------- */}
      <Sheet open={menu} onClose={() => setMenu(false)} title="Table">
        <div className="flex flex-col gap-2">
          <MenuRow icon={<ScrollText size={20} />} label="Hand history" onClick={() => (setMenu(false), setHistory(true))} />
          <MenuRow icon={<Volume2 size={20} />} label="Sound" right={<Toggle label="Sound" checked={p?.settings.sound ?? true} onChange={(on) => useRpc.getState().setSetting('sound', on)} />} />
          <MenuRow icon={<span className="font-bold">♦</span>} label="Four-colour deck" right={<Toggle label="Four-colour deck" checked={fourColor} onChange={(on) => useRpc.getState().setSetting('fourColorDeck', on)} />} />
          <MenuRow icon={<CrownIcon size={20} />} label="How to play" onClick={() => (setMenu(false), go('help'))} />
          <MenuRow icon={<LogOut size={20} />} label={live && heroSeat?.inHand && !heroSeat.folded ? 'Leave table (folds your hand)' : 'Leave table'} onClick={exit} danger />
        </div>
      </Sheet>

      <Sheet open={chat} onClose={() => setChat(false)} title="Table chat">
        <ChatPanel />
      </Sheet>

      <Sheet open={emotes} onClose={() => setEmotes(false)} title="Emotes">
        <div className="grid grid-cols-4 gap-3">
          {EMOTES.map((e) => (
            <button key={e} className="dark-frame grid h-16 place-items-center rounded-2xl text-4xl active:scale-90" onClick={() => (sendEmote(e), setEmotes(false))} aria-label={`Send ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={history} onClose={() => setHistory(false)} title="Hand history">
        <HandHistory />
      </Sheet>

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name}>
        {picked && (picked.bot ? (
          <p className="text-[#e9dcc0]">{picked.name} is one of the club’s computer regulars.</p>
        ) : t.role !== 'server' ? null : (
          <div className="grid gap-2">
            <button className="btn btn-dark h-12" onClick={() => (setReport({ id: picked.id, name: picked.name }), setPicked(null))}>
              Report
            </button>
            <button
              className="btn btn-dark h-12"
              onClick={() => {
                void api('/blocks', { body: { userId: picked.id } }).then(() => toast(`${picked.name} blocked: you won’t see their chat`, 'info'), (e: Error) => toast(e.message, 'bad'))
                setPicked(null)
              }}
            >
              Block
            </button>
            <button
              className="btn btn-dark h-12"
              onClick={() => {
                void api('/friends/requests', { body: { code: picked.name } }).then(() => toast(`Friend request sent to ${picked.name}`, 'good'), (e: Error) => toast(e.message, 'bad'))
                setPicked(null)
              }}
            >
              Add friend
            </button>
          </div>
        ))}
      </Sheet>
      <ReportSheet target={report} onClose={() => setReport(null)} />

      <Sheet open={netInfo} onClose={() => setNetInfo(false)} title="Connection">
        <p className="text-[#e9dcc0]">
          {t.role === 'solo' && 'This table runs on your device: no connection needed.'}
          {t.role === 'server' && `Connected to the club server (${net.status}${net.latency != null ? `, ${net.latency} ms` : ''}). The server deals and checks every action.`}
        </p>
        <p className="rpc-muted mt-2 text-[0.9em]">Table version {v.version} · hand #{v.handNo}</p>
      </Sheet>
    </div>
  )
}

/* ---------------------------------------------------------------- seats */

function SeatView({ seat, index, slot, v, remaining, fourColor, emote, onPick }: { onPick: () => void; seat: PublicSeat | null; index: number; slot: Slot; v: PublicTable; remaining: number; fourColor: boolean; emote?: string }) {
  if (!seat) {
    return (
      <div style={pos(slot)} className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-[#e9b33a]/40 text-[0.7em] text-white/40">
        Empty
      </div>
    )
  }
  const active = v.active === index && ['preflop', 'flop', 'turn', 'river'].includes(v.phase)
  const reveal = v.result?.reveals[index]
  const won = v.result?.winners.includes(index)
  const right = slot[0] > 50
  const net = v.result?.net[index] ?? 0
  return (
    <>
      <div style={pos(slot)} className={`flex flex-col items-center ${seat.folded || seat.sittingOut ? 'opacity-55' : ''}`}>
        <button className="relative" onClick={onPick} aria-label={`${seat.name}: player options`}>
          <Avatar avatar={seat.avatar} size={62} glow={active || won} />
          {active && <TimerArc ms={remaining} total={v.config.turnMs} size={70} />}
          {v.dealer === index && <DealerButton style={{ position: 'absolute', [right ? 'left' : 'right']: -12, bottom: 2 }} />}
          {emote && <span className="rpc-pop absolute -top-8 left-1/2 -translate-x-1/2 text-3xl">{emote}</span>}
        </button>
        <div className="dark-frame -mt-1.5 min-w-[84px] rounded-lg px-2 py-0.5 text-center" style={{ background: 'rgba(8,6,4,.85)' }}>
          <p className="rpc-display truncate text-[1.02em] leading-tight text-white">{seat.name}</p>
          <p className="rpc-display text-[1.05em] leading-tight text-[#ffe48a]">{seat.allIn && !v.result ? 'ALL-IN' : fmt(seat.stack)}</p>
        </div>
        {won && net > 0 && <span className="rpc-winner rpc-display gold-text absolute -top-7 whitespace-nowrap text-[1.25em]">+{fmt(net)}</span>}
      </div>
      {/* cards: backs while in the hand, faces at showdown */}
      {seat.inHand && !seat.folded && (
        <div className="absolute flex" style={{ left: `${slot[0] + (right ? -11 : 11)}%`, top: `${slot[1] + (reveal ? 1 : -3.5)}%`, transform: 'translate(-50%,-50%)' }}>
          {reveal
            ? reveal.cards.map((c, k) => <PlayingCard key={c} card={c} width="9.5cqw" fourColor={fourColor} className={`rpc-flip ${won && reveal.best.includes(c) ? 'win' : ''}`} style={{ marginLeft: k ? '-3cqw' : 0, rotate: k ? '7deg' : '-5deg' }} />)
            : seat.cards > 0 && [0, 1].map((k) => <CardBack key={`${v.handNo}-${k}`} width="5.6cqw" className="rpc-deal" style={{ marginLeft: k ? '-3cqw' : 0, rotate: k ? '8deg' : '-6deg', animationDelay: `${k * 0.12}s`, '--from-x': `${(50 - slot[0]) * 3}px`, '--from-y': `${(10 - slot[1]) * 6}px` } as CSSProperties} />)}
        </div>
      )}
      {reveal && <span className="rpc-display absolute rounded-full bg-black/70 px-2 text-[0.78em] text-[#ffe48a]" style={{ left: `${slot[0] + (right ? -12 : 12)}%`, top: `${slot[1] + 6}%`, transform: 'translate(-50%,-50%)' }}>{reveal.hand}</span>}
      {seat.bet > 0 && <BetChips amount={seat.bet} slot={lerp([slot[0], slot[1] + 7], CENTER, 0.45)} />}
      {seat.last && !v.result && <ActionTag text={ACTION_LABEL[seat.last.type]} style={pos([slot[0], slot[1] - 8.6])} />}
    </>
  )
}

function DealerButton({ style }: { style?: CSSProperties }) {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] font-black text-black" style={{ boxShadow: '0 0 0 2px #e9b33a, 0 2px 4px rgba(0,0,0,.6)', ...style }} aria-label="Dealer button">
      D
    </span>
  )
}

function BetChips({ amount, slot }: { amount: number; slot: Slot }) {
  return (
    <div key={amount} style={pos(slot)} className="rpc-chip-in flex items-center gap-1 rounded-full bg-black/55 py-0.5 pl-0.5 pr-2">
      <ChipStack amount={amount} size={18} />
      <span className="rpc-display text-[0.92em] text-white">{fmtShort(amount)}</span>
    </div>
  )
}

function ActionTag({ text, style }: { text: string; style: CSSProperties }) {
  const color = text === 'Fold' || text === 'Time out' ? '#f87171' : text === 'All-in' ? '#ffd34d' : text === 'Check' ? '#93c5fd' : '#86efac'
  return (
    <span key={text} style={style} className="rpc-pop rpc-display z-10 rounded-full bg-black/80 px-2.5 py-0.5 text-[0.85em]">
      <span style={{ color }}>{text}</span>
    </span>
  )
}

function SignalBars() {
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden>
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={2 + k * 6} y={16 - k * 5} width="4.5" height={5 + k * 5} rx="1" fill="#2ee6c9" />
      ))}
    </svg>
  )
}

function TimerArc({ ms, total, size }: { ms: number; total: number; size: number }) {
  const f = Math.max(0, Math.min(1, ms / total))
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  const color = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#ef4444'
  return (
    <svg width={size} height={size} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - f)} strokeLinecap="round" />
    </svg>
  )
}

function TimerRing({ ms, total, mine }: { ms: number; total: number; mine: boolean }) {
  const secs = Math.ceil(ms / 1000)
  return (
    <span className="relative grid h-[52px] w-[52px] place-items-center rounded-full bg-black/80" style={{ boxShadow: '0 0 0 2px rgba(233,179,58,.6)' }} aria-label={ms ? `${secs} seconds left` : 'Hand history'}>
      {ms > 0 && <TimerArc ms={ms} total={total} size={52} />}
      <span className={`rpc-display text-[1.25em] ${mine && secs <= 5 ? 'text-red-400' : 'text-white'}`}>{ms > 0 ? `${secs}s` : '—'}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- actions */

type Legal = NonNullable<ReturnType<typeof legalActions>>

function suggested(legal: Legal, pot: number, bb: number) {
  const target = legal.isBet ? Math.round((pot * 0.5) / bb) * bb : legal.minTo
  return Math.min(legal.maxTo, Math.max(legal.minTo, target))
}

function ActionBar({ legal, myTurn, pending, sizing, pot, bb, onAct, onSize }: { legal: Legal | null; myTurn: boolean; pending: boolean; sizing: number | null; pot: number; bb: number; onAct: (t: 'fold' | 'check' | 'call' | 'allin') => void; onSize: (v: number) => void }) {
  const off = !myTurn || pending || !legal
  const allInCall = !!legal && !legal.canCheck && legal.callAmount === legal.stack
  const mid = !legal || legal.canCheck ? ['Check'] : [allInCall ? 'All-in' : 'Call', fmtShort(legal.callAmount)]
  const raiseOpen = !!legal && legal.canRaise
  const bet = legal && raiseOpen ? suggested(legal, pot, bb) : 0
  return (
    <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 gap-2.5 px-3 pb-[calc(10px+env(safe-area-inset-bottom))]" style={{ height: 'auto' }}>
      <button disabled={off} className="btn btn-red h-[64px] text-[1.6em]" onClick={() => onAct('fold')}>
        Fold
      </button>
      <button disabled={off} className="btn btn-blue h-[64px] px-1 text-[1.5em] leading-none" onClick={() => onAct(legal!.canCheck ? 'check' : 'call')}>
        <span className="flex flex-col items-center">
          {mid.map((m) => (
            <span key={m} className={mid.length > 1 ? 'text-[0.85em]' : ''}>
              {m}
            </span>
          ))}
        </span>
      </button>
      <button disabled={off || !raiseOpen || sizing != null} className="btn btn-gold h-[64px] px-1 leading-none" onClick={() => onSize(bet)}>
        <span className="flex flex-col items-center">
          <span className="text-[1.3em]">{legal?.isBet === false ? 'Raise' : 'Bet'}</span>
          <span className="text-[1.3em]">{raiseOpen ? fmt(bet) : ''}</span>
        </span>
      </button>
    </div>
  )
}

function BetSizer({ legal, pot, bb, value, onChange, onConfirm, onCancel }: { legal: Legal; pot: number; bb: number; value: number; onChange: (v: number) => void; onConfirm: () => void; onCancel: () => void }) {
  const step = Math.max(1, Math.floor(bb / 2))
  const clamp = (x: number) => Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(x / step) * step))
  const presets: [string, number][] = [
    ['Min', legal.minTo],
    ['½ Pot', clamp(legal.isBet ? pot * 0.5 : legal.minTo + pot * 0.5)],
    ['Pot', clamp(legal.isBet ? pot : legal.minTo + pot)],
    ['All-in', legal.maxTo],
  ]
  return (
    <div className="gold-frame rpc-sheet absolute inset-x-3 z-20 rounded-2xl p-3" style={{ bottom: 'calc(86px + env(safe-area-inset-bottom))' }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="rpc-muted text-[0.9em]">{legal.isBet ? 'Bet' : 'Raise to'}</span>
        <span className="rpc-display gold-text text-[1.6em]">{fmt(value)}</span>
        <button onClick={onCancel} className="rpc-display text-[0.95em] text-white/80">
          Cancel
        </button>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {presets.map(([label, amt]) => (
          <button key={label} onClick={() => onChange(amt)} className={`btn ${value === amt ? 'btn-gold' : 'btn-dark'} h-9 text-[0.95em]`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button aria-label="Less" className="btn btn-dark h-10 w-10 text-xl" onClick={() => onChange(clamp(value - bb))}>
          −
        </button>
        <input type="range" min={legal.minTo} max={legal.maxTo} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="flex-1 accent-[#e9b33a]" aria-label="Bet amount" />
        <button aria-label="More" className="btn btn-dark h-10 w-10 text-xl" onClick={() => onChange(clamp(value + bb))}>
          +
        </button>
      </div>
      <button className="btn btn-gold mt-3 h-12 w-full text-[1.3em]" onClick={onConfirm}>
        {value >= legal.maxTo ? `All-in ${fmt(value)}` : `${legal.isBet ? 'Bet' : 'Raise to'} ${fmt(value)}`}
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- overlays & panels */

function WinnerBanner({ v, me }: { v: PublicTable; me: number }) {
  const r = v.result!
  const heroWon = r.winners.includes(me)
  const names = r.winners.map((w) => v.seats[w]?.name).join(' & ')
  const hand = !r.uncontested ? r.reveals[r.winners[0]]?.hand : null
  return (
    <div className="pointer-events-none absolute left-1/2 top-[41%] z-10 -translate-x-1/2 -translate-y-1/2">
      <div className="rpc-winner gold-frame flex flex-col items-center rounded-2xl px-5 py-2 text-center" style={{ boxShadow: '0 0 40px rgba(255,200,80,.6)' }}>
        <span className="rpc-display gold-text whitespace-nowrap text-[1.5em]">{heroWon ? (r.winners.length > 1 ? 'Split pot!' : 'You win!') : `${names} ${r.winners.length > 1 ? 'split' : 'wins'}`}</span>
        {hand && <span className="rpc-display text-[1em] text-white">{hand}</span>}
      </div>
    </div>
  )
}

function Overlay({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 px-6" role="dialog" aria-modal aria-label={title}>
      <div className="gold-frame rpc-pop w-full max-w-[340px] rounded-3xl p-5">
        <h3 className="rpc-display gold-text mb-3 text-center text-[1.6em]">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function MenuRow({ icon, label, onClick, right, danger }: { icon: ReactNode; label: string; onClick?: () => void; right?: ReactNode; danger?: boolean }) {
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick?.()} className="dark-frame flex min-h-[52px] items-center gap-3 rounded-xl px-3">
      <span className={danger ? 'text-red-400' : 'text-[#ffd96a]'}>{icon}</span>
      <span className={`rpc-display flex-1 text-[1.05em] ${danger ? 'text-red-300' : 'text-white'}`}>{label}</span>
      {right}
    </div>
  )
}

function ChatPanel() {
  const chat = usePokerTable((s) => s.chat)
  const [text, setText] = useState('')
  const lines = useMemo(() => chat.slice(-40), [chat])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {lines.length === 0 && <p className="rpc-muted py-4 text-center">No messages yet.</p>}
        {lines.map((l) => (
          <p key={l.id} className={`text-[0.95em] ${l.system ? 'italic text-[#e9cf8a]' : 'text-white'}`}>
            <span className="rpc-display mr-1.5 text-[#ffd96a]">{l.name}:</span>
            {l.text}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_CHAT.map((q) => (
          <button key={q} className="btn btn-dark h-8 px-3 text-[0.88em]" onClick={() => sendChat(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="rpc-field"
        onSubmit={(e) => {
          e.preventDefault()
          sendChat(text)
          setText('')
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something nice…" maxLength={120} aria-label="Chat message" />
        <button type="submit" aria-label="Send" className="text-[#ffd96a]">
          <SendHorizontal size={22} />
        </button>
      </form>
    </div>
  )
}

function HandHistory() {
  const p = currentProfile()
  const chat = usePokerTable((s) => s.chat)
  const recent = (p?.history ?? []).slice(0, 8)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="rpc-display mb-1.5 text-[#ffd96a]">This table</p>
        <div className="flex max-h-[24vh] flex-col gap-1 overflow-y-auto">
          {chat.filter((c) => c.system).slice(-12).reverse().map((c) => (
            <p key={c.id} className="text-[0.9em] text-[#e9dcc0]">
              {c.text}
            </p>
          ))}
        </div>
      </div>
      <div>
        <p className="rpc-display mb-1.5 text-[#ffd96a]">Your last hands</p>
        {recent.length === 0 && <p className="rpc-muted text-[0.9em]">No hands yet.</p>}
        {recent.map((h) => (
          <div key={h.id} className="dark-frame mb-1.5 flex items-center gap-2 rounded-xl px-2.5 py-1.5">
            <span className="flex gap-0.5">
              {h.hole.map((c) => (
                <PlayingCard key={c} card={c} width={22} />
              ))}
            </span>
            <span className="flex-1 truncate text-[0.88em] text-white/85">{h.hand ?? (h.won ? 'Won uncontested' : 'Folded')}</span>
            <span className={`rpc-display ${h.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {h.net >= 0 ? '+' : ''}
              {fmtShort(h.net)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

