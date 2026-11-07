import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, FileText, HelpCircle, Search, Star, X } from 'lucide-react'
import { useMysteryStore } from './mysteryStore'
import { getCase, getTheme, type ClueCategory } from './mysteryCaseData'
import MysteryRoom3D, { preloadRoom, type OffscreenHint, type RoomEvidence } from './MysteryRoom3D'
import type { LocationDef } from './mysteryCaseData'
import MysteryLevelMap from './MysteryLevelMap'
import Confetti from '@/games/shared/Confetti'
import { completeGameSession } from '@/lib/gameSession'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

interface CaseRoom {
  location: LocationDef
  evidence: RoomEvidence[]
}

interface Investigator {
  id: string
  name: string
  emoji: string
}

const BOT_POOL = [
  { name: 'Nova', emoji: '🤖' },
  { name: 'Rex', emoji: '🐺' },
  { name: 'Kato', emoji: '🐯' },
]

function buildInvestigators(): Investigator[] {
  // party friends play on their own phones (with party chat and voice on top); this device seats only you
  const profile = usePlayerStore.getState().profile
  const base: Investigator[] = [{ id: 'you', name: profile.name, emoji: profile.avatarEmoji }]

  let botIndex = 0
  while (base.length < 4) {
    const pool = BOT_POOL[botIndex % BOT_POOL.length]
    base.push({ id: `bot-${botIndex}`, name: pool.name, emoji: pool.emoji })
    botIndex += 1
  }
  return base
}

function Chip({
  label,
  emoji,
  ruledOut,
  selected,
  onClick,
}: {
  label: string
  emoji: string
  ruledOut: boolean
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={ruledOut}
      className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all ${
        ruledOut
          ? 'cursor-not-allowed bg-white/5 text-slate-600 line-through'
          : selected
            ? 'bg-violet-500 text-white ring-2 ring-violet-300'
            : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <span className={ruledOut ? 'opacity-40' : ''}>{emoji}</span>
      {label}
    </button>
  )
}

export default function MysteryGame() {
  const phase = useMysteryStore((s) => s.phase)
  const currentCaseId = useMysteryStore((s) => s.currentCaseId)
  const revealedClueIds = useMysteryStore((s) => s.revealedClueIds)
  const wrongAccusations = useMysteryStore((s) => s.wrongAccusations)
  const wrongFlash = useMysteryStore((s) => s.wrongFlash)
  const lastResult = useMysteryStore((s) => s.lastResult)
  const beginInvestigation = useMysteryStore((s) => s.beginInvestigation)
  const askInvestigator = useMysteryStore((s) => s.askInvestigator)
  const foundEvidenceIds = useMysteryStore((s) => s.foundEvidenceIds)
  const inspectEvidence = useMysteryStore((s) => s.inspectEvidence)
  const makeAccusation = useMysteryStore((s) => s.makeAccusation)
  const backToMap = useMysteryStore((s) => s.backToMap)
  const nextCase = useMysteryStore((s) => s.nextCase)
  const startCase = useMysteryStore((s) => s.startCase)
  const mode = useMysteryStore((s) => s.mode)
  const duoNames = useMysteryStore((s) => s.duoNames)
  const detectives = useMysteryStore((s) => s.detectives)
  const turn = useMysteryStore((s) => s.turn)
  const handoff = useMysteryStore((s) => s.handoff)
  const evidenceOwner = useMysteryStore((s) => s.evidenceOwner)
  const endTurn = useMysteryStore((s) => s.endTurn)
  const takeTurn = useMysteryStore((s) => s.takeTurn)
  const markBriefed = useMysteryStore((s) => s.markBriefed)

  const [investigators] = useState(buildInvestigators)
  const [selected, setSelected] = useState<{ suspectId?: string; itemId?: string; locationId?: string }>({})
  const [wrongToast, setWrongToast] = useState(false)
  const [view, setView] = useState<'search' | 'board'>('search')
  const [focus, setFocus] = useState(0)
  const [inspecting, setInspecting] = useState<RoomEvidence | null>(null)
  const [storyPage, setStoryPage] = useState(0)
  const [roomLoading, setRoomLoading] = useState(true)
  const [offscreen, setOffscreen] = useState<OffscreenHint[]>([])
  /** Two-player: what a partner detective just told the current player (the turn ends when it's closed). */
  const [told, setTold] = useState<{ name: string; emoji: string; text: string } | null>(null)
  /** Two-player: the evidence card ends the turn when closed, unless it was already searched. */
  const [endsTurn, setEndsTurn] = useState(false)
  const rewardedRef = useRef<string | null>(null)

  const caseData = currentCaseId ? getCase(currentCaseId) : undefined

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    setSelected({})
    setView('search')
    setFocus(0)
    setInspecting(null)
    setStoryPage(0)
    setRoomLoading(true)
  }, [currentCaseId])

  // start fetching every room of the case while the player reads the story
  useEffect(() => {
    const c = currentCaseId ? getCase(currentCaseId) : undefined
    c?.locations.forEach((l) => preloadRoom(l.id))
  }, [currentCaseId])

  useEffect(() => {
    if (wrongFlash === 0) return
    setWrongToast(true)
    const t = setTimeout(() => setWrongToast(false), 2200)
    return () => clearTimeout(t)
  }, [wrongFlash])

  useEffect(() => {
    if (phase !== 'RESULT' || !lastResult) return
    const key = lastResult.caseId + lastResult.stars
    if (rewardedRef.current === key) return
    rewardedRef.current = key
    completeGameSession({ gameId: 'mystery', won: lastResult.winner !== null, coins: lastResult.coins, xp: lastResult.xp })
  }, [phase, lastResult])

  if (phase === 'MAP' || !caseData) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#03040c]">
        <MysteryLevelMap />
      </div>
    )
  }

  const theme = getTheme(caseData.theme)
  const rooms: CaseRoom[] = caseData.locations.map((location) => ({
    location,
    evidence: caseData.evidence
      .filter((e) => e.locationId === location.id)
      .map((e) => ({ ...e, found: foundEvidenceIds.includes(e.id) })),
  }))

  if (phase === 'INTRO') {
    const { story } = caseData
    const pages = ['What happened', 'The suspects', 'Police report']
    const last = storyPage === pages.length - 1
    const openingClues = caseData.clues.filter((c) => caseData.openingClueIds.includes(c.id))
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-[#03040c] text-white">
        <MysteryRoom3D className="absolute inset-0 h-full w-full" locationId={caseData.locations[0].id} auto />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/85" />
        <div className="absolute inset-0 flex flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <div className="flex items-center gap-3">
            <button onClick={backToMap} aria-label="Back to case map" className="hud-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-1 gap-1.5">
              {pages.map((label, i) => (
                <span key={label} className={`h-1 flex-1 rounded-full transition-colors ${i <= storyPage ? 'bg-amber-300' : 'bg-white/20'}`} />
              ))}
            </div>
          </div>

          <div className="mt-auto w-full self-center sm:max-w-md">
            <div key={storyPage} className="hud-glass-strong max-h-[62vh] overflow-y-auto rounded-3xl px-5 py-5" style={{ animation: 'city-card-in 0.35s ease-out' }}>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
                {theme.icon} {pages[storyPage]}
              </p>

              {storyPage === 0 && (
                <>
                  <h1 className="mt-1.5 text-2xl font-black leading-tight">{caseData.title}</h1>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {story.venue} · {story.time}
                  </p>
                  <div className="mt-3 flex flex-col gap-2.5 text-[14px] leading-relaxed text-slate-200">
                    {story.paragraphs.map((para) => (
                      <p key={para}>{para}</p>
                    ))}
                  </div>
                </>
              )}

              {storyPage === 1 && (
                <>
                  <h2 className="mt-1.5 text-xl font-black">Everyone in the house is a suspect</h2>
                  <div className="mt-3 flex flex-col gap-2">
                    {caseData.suspects.map((sus) => (
                      <div key={sus.id} className="flex gap-3 rounded-2xl bg-white/5 px-3 py-2.5">
                        <span className="text-2xl">{sus.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-black">{sus.name}</p>
                          <p className="text-xs leading-snug text-slate-300">{story.suspectNotes[sus.id]}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">{theme.itemLabel}</p>
                  <p className="mt-1 text-xs text-slate-300">{caseData.items.map((it) => `${it.emoji} ${it.name}`).join('   ')}</p>
                </>
              )}

              {storyPage === 2 && mode === 'duo' && (
                <>
                  <h2 className="mt-1.5 text-xl font-black">Two detectives, one phone</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
                    The police spoke to {duoNames[0]} and {duoNames[1]} separately. Each of you gets one secret clue at the start of your first turn, so don't look when it isn't your turn.
                  </p>
                  <div className="mt-3 rounded-2xl bg-white/5 px-3 py-3 text-[13px] leading-relaxed text-slate-300">
                    <p className="font-black text-white">On your turn, do one thing</p>
                    <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
                      <li>Search a room and tap one sparkle. What you find goes into your secret notes.</li>
                      <li>Ask a partner detective (Nova, Rex or Kato) for a clue.</li>
                      <li>Accuse. Right answer wins the case, a wrong one puts you out.</li>
                    </ul>
                    <p className="mt-2">Then pass the phone.</p>
                  </div>
                </>
              )}

              {storyPage === 2 && mode !== 'duo' && (
                <>
                  <h2 className="mt-1.5 text-xl font-black">Your first clues</h2>
                  <p className="mt-1 text-xs text-slate-400">The officers on duty already ruled a few things out.</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {openingClues.map((c) => (
                      <div key={c.id} className="flex gap-2.5 rounded-2xl bg-emerald-500/10 px-3 py-2.5 ring-1 ring-emerald-400/30">
                        <FileText size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                        <p className="text-[13px] font-semibold leading-snug text-emerald-50">{c.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/5 px-3 py-3 text-[13px] leading-relaxed text-slate-300">
                    <p className="font-black text-white">What to do next</p>
                    <p className="mt-1">
                      Search the {rooms.slice(0, -1).map((r) => r.location.name).join(', ')} and {rooms[rooms.length - 1].location.name} for {caseData.evidence.filter((e) => e.clueId).length} more clues. Drag to look around and tap anything that sparkles. Your partners hold the rest, so ask them on the Case Board, then name the culprit.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setStoryPage((p) => Math.max(0, p - 1))}
                disabled={storyPage === 0}
                aria-label="Previous page"
                className="hud-glass flex h-12 w-12 items-center justify-center rounded-2xl disabled:opacity-30"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => (last ? beginInvestigation() : setStoryPage((p) => p + 1))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-violet-500 text-sm font-black text-white hover:bg-violet-400"
              >
                {last ? 'Start investigating' : 'Next'} {!last && <ChevronRight size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'RESULT' && lastResult) {
    const s = caseData.suspects.find((x) => x.id === lastResult.correct.suspectId)!
    const i = caseData.items.find((x) => x.id === lastResult.correct.itemId)!
    const l = caseData.locations.find((x) => x.id === lastResult.correct.locationId)!
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#03040c]/95 backdrop-blur-sm">
        {lastResult.winner !== null && <Confetti />}
        <div className="hud-glass-strong relative mx-4 flex max-w-sm flex-col items-center rounded-3xl px-6 py-8 text-center" style={{ animation: 'city-card-in 0.4s ease-out' }}>
          <span className="text-5xl">{theme.icon}</span>
          <h2 className="mt-3 text-2xl font-black text-white">
            {lastResult.winner === undefined
              ? 'Case Closed!'
              : lastResult.winner === null
                ? 'Nobody cracked it'
                : `${detectives[lastResult.winner]?.emoji ?? '🏆'} ${detectives[lastResult.winner]?.name ?? 'Detective'} wins!`}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {lastResult.winner === null ? 'Both accusations were wrong. Here is what really happened: ' : ''}
            {theme.solvedLine(s.name, i.name, l.name)}
          </p>
          {lastResult.winner === undefined && (
            <div className="mt-3 flex gap-1.5">
              {[0, 1, 2].map((idx) => (
                <Star key={idx} size={32} className={idx < lastResult.stars ? 'text-amber-300' : 'text-slate-700'} fill="currentColor" />
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-2 text-sm font-bold">
            <span className="text-coin">+{lastResult.coins} Coins</span>
            <span className="text-brand-2">+{lastResult.xp} XP</span>
          </div>
          <div className="mt-6 flex w-full gap-2.5">
            <button onClick={backToMap} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-bold text-white hover:bg-white/20">
              Case Map
            </button>
            <button
              onClick={() => (lastResult.winner === null ? startCase(caseData.id) : nextCase())}
              className="flex-1 rounded-xl bg-violet-500 py-3 text-sm font-bold text-white hover:bg-violet-400"
            >
              {lastResult.winner === null ? 'Try again' : 'Next Case'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // INVESTIGATING
  const duo = mode === 'duo' && detectives.length === 2
  const me = duo ? detectives[turn] : null
  const other = duo ? detectives[1 - turn] : null
  const knownIds = me ? me.clueIds : revealedClueIds
  const revealed = caseData.clues.filter((c) => knownIds.includes(c.id))
  const ruledOut = (category: ClueCategory, id: string) => revealed.some((c) => c.category === category && c.ruledOutId === id)
  const canAccuse = Boolean(selected.suspectId && selected.itemId && selected.locationId)
  const clueEvidence = caseData.evidence.filter((e) => e.clueId)
  const foundClues = clueEvidence.filter((e) => foundEvidenceIds.includes(e.id)).length
  const myClueCount = me ? me.clueIds.length : revealed.length
  const roomOfClue = (clueId: string) => {
    const ev = caseData.evidence.find((e) => e.clueId === clueId)
    return ev ? caseData.locations.find((l) => l.id === ev.locationId)?.name : undefined
  }

  function inspect(ev: RoomEvidence) {
    setEndsTurn(duo && !ev.found)
    inspectEvidence(ev.id)
    setInspecting(ev)
  }

  function closeEvidence() {
    setInspecting(null)
    if (endsTurn) {
      setEndsTurn(false)
      endTurn()
    }
  }

  function ask(slot: number) {
    if (!duo) {
      askInvestigator(slot)
      return
    }
    const next = caseData!.clues.find((c) => c.slot === slot && !knownIds.includes(c.id))
    if (!next) return
    askInvestigator(slot)
    setTold({ name: investigators[slot].name, emoji: investigators[slot].emoji, text: next.text })
  }

  function accuse() {
    makeAccusation(selected as { suspectId: string; itemId: string; locationId: string })
    if (duo && useMysteryStore.getState().phase === 'INVESTIGATING') endTurn()
  }

  function startTurn() {
    setSelected({})
    setView('search')
    setInspecting(null)
    setTold(null)
    takeTurn()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#03040c] text-white">
      <MysteryRoom3D
        className="absolute inset-0 h-full w-full"
        locationId={rooms[focus].location.id}
        evidence={rooms[focus].evidence}
        onInspect={inspect}
        onReady={() => setRoomLoading(false)}
        onOffscreen={setOffscreen}
      />
      {duo && handoff && me && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#07060b] px-6 text-center">
          <span className="text-6xl">{me.emoji}</span>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">Pass the phone</p>
          <h2 className="mt-1 text-3xl font-black text-white">{me.name}'s turn</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-400">
            {other && !other.out ? `${other.name}, no peeking! Hand the phone over.` : 'You are the last detective still on the case.'}
          </p>
          <button onClick={startTurn} className="mt-8 w-full max-w-xs rounded-2xl bg-violet-500 py-3.5 text-sm font-black text-white hover:bg-violet-400">
            I'm {me.name}, start my turn
          </button>
        </div>
      )}
      {duo && !handoff && me && !me.briefed && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-5">
          <div className="hud-glass-strong w-full max-w-xs rounded-3xl px-5 py-6 text-center" style={{ animation: 'city-card-in 0.35s ease-out' }}>
            <FileText size={36} className="mx-auto text-emerald-300" />
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Secret police clue</p>
            <p className="mt-1 text-sm text-slate-300">Only {me.name} gets to see this.</p>
            {caseData.clues
              .filter((c) => me.clueIds.includes(c.id))
              .map((c) => (
                <p key={c.id} className="mt-3 rounded-2xl bg-emerald-500/15 px-3 py-2.5 text-[13px] font-semibold text-emerald-50 ring-1 ring-emerald-400/40">
                  {c.text}
                </p>
              ))}
            <button onClick={markBriefed} className="mt-4 w-full rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white hover:bg-violet-400">
              Got it
            </button>
          </div>
        </div>
      )}
      {told && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 px-5">
          <div className="hud-glass-strong w-full max-w-xs rounded-3xl px-5 py-6 text-center" style={{ animation: 'city-card-in 0.35s ease-out' }}>
            <span className="text-5xl">{told.emoji}</span>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">{told.name} tells you</p>
            <p className="mt-3 rounded-2xl bg-emerald-500/15 px-3 py-2.5 text-[13px] font-semibold text-emerald-50 ring-1 ring-emerald-400/40">{told.text}</p>
            <button
              onClick={() => {
                setTold(null)
                endTurn()
              }}
              className="mt-4 w-full rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white hover:bg-violet-400"
            >
              End my turn
            </button>
          </div>
        </div>
      )}
      {!roomLoading && view === 'search' && !inspecting &&
        (['left', 'right'] as const).map((side) => {
          const hints = offscreen.filter((h) => h.side === side)
          if (!hints.length) return null
          const y = hints.reduce((a, h) => a + h.y, 0) / hints.length
          return (
            <div
              key={side}
              className={`pointer-events-none absolute z-[6] flex items-center gap-1 rounded-full bg-amber-300/90 px-2 py-1 text-[11px] font-black text-amber-950 shadow-[0_0_16px_rgba(252,211,77,0.7)] ${side === 'left' ? 'left-2' : 'right-2'}`}
              style={{ top: `${y * 100}%`, animation: 'ludo-roll-pulse-kf 1.4s ease-in-out infinite' }}
            >
              {side === 'left' && <ChevronLeft size={14} strokeWidth={3} />}✨ {hints.length}
              {side === 'right' && <ChevronRight size={14} strokeWidth={3} />}
            </div>
          )
        })}
      {roomLoading && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-[#07060b]">
          <span className="text-4xl">{rooms[focus].location.emoji}</span>
          <p className="mt-2 text-sm font-black text-white">Entering the {rooms[focus].location.name}…</p>
          <div className="mt-3 h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="ludo-load-bar h-full w-1/3 rounded-full bg-violet-400" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-3 pt-3 sm:px-4">
        <button onClick={backToMap} className="hud-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
          <ArrowLeft size={18} />
        </button>
        <div className="hud-glass min-w-0 flex-1 rounded-2xl px-3 py-1.5">
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-violet-300">{theme.icon} {caseData.title}</p>
          {me ? (
            <p className="truncate text-xs font-bold text-amber-200">
              {me.emoji} {me.name}'s turn · {myClueCount} secret clue{myClueCount === 1 ? '' : 's'}
              {other?.out ? ` · ${other.name} is out` : ''}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              🔍 {foundClues}/{clueEvidence.length} clues found
              {wrongAccusations > 0 ? ` · ${wrongAccusations} wrong guess${wrongAccusations > 1 ? 'es' : ''}` : ''}
            </p>
          )}
        </div>
      </div>

      {wrongToast && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-rose-500/90 px-4 py-2 text-center text-sm font-bold text-white">
          {duo ? 'Wrong accusation! That detective is out of the case.' : 'Not quite — keep investigating!'}
        </div>
      )}

      {view === 'search' && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
          <div className="mx-auto flex max-w-lg flex-col gap-2">
            <p className="text-center text-xs font-bold text-amber-200 drop-shadow">
              {me ? `${me.name}: search one spot, ask a partner, or accuse` : `Searching the ${rooms[focus].location.name}. Drag to look around and tap the sparkles`}
            </p>
            <div className="hud-glass-strong flex flex-col gap-2 rounded-3xl p-2.5">
              <div className="grid grid-cols-4 gap-1.5">
                {rooms.map((room, i) => {
                  const total = room.evidence.length
                  const found = room.evidence.filter((e) => e.found).length
                  const active = focus === i
                  return (
                    <button
                      key={room.location.id}
                      onClick={() => {
                        if (active) return
                        setRoomLoading(true)
                        setOffscreen([])
                        setFocus(i)
                      }}
                      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-bold transition-colors ${
                        active ? 'bg-violet-500 text-white' : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      <span className="text-lg leading-none">{room.location.emoji}</span>
                      <span className="max-w-full truncate">{room.location.name}</span>
                      <span className={`rounded-full px-1.5 text-[9.5px] ${found === total ? 'bg-emerald-500/30 text-emerald-200' : 'bg-black/30 text-slate-300'}`}>
                        {found}/{total}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setView('board')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-violet-500 py-2.5 text-xs font-black text-white hover:bg-violet-400"
                >
                  <ClipboardList size={15} /> Case Board · Accuse
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'board' && (
      <div className="absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto rounded-t-3xl hud-glass-strong">
        <div className="mx-auto flex max-w-lg flex-col gap-3 px-3 py-3 sm:px-4">
          <button
            onClick={() => setView('search')}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/15"
          >
            <Search size={14} /> Back to the house
          </button>
          <div className="hud-glass rounded-2xl p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <Search size={13} /> Investigators
            </p>
            <div className="flex flex-wrap gap-2">
              {investigators.map((inv, slot) => {
                if (duo && slot === 0) return null
                const total = caseData.clues.filter((c) => c.slot === slot).length
                const revealedCount = caseData.clues.filter((c) => c.slot === slot && knownIds.includes(c.id)).length
                const isHuman = slot === 0
                return (
                  <button
                    key={inv.id}
                    disabled={isHuman || revealedCount >= total}
                    onClick={() => ask(slot)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                      isHuman ? 'bg-violet-500/30 text-violet-200' : revealedCount >= total ? 'bg-white/5 text-slate-500' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <span>{inv.emoji}</span>
                    {isHuman ? 'You' : duo ? `Ask ${inv.name}` : inv.name}
                    <span className="rounded-full bg-black/30 px-1.5 text-[10px]">{revealedCount}/{total}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="hud-glass min-h-[100px] flex-1 rounded-2xl p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <HelpCircle size={13} /> Case Notes
            </p>
            <div className="flex flex-col gap-1.5">
              {revealed.length === 0 && <p className="text-xs text-slate-500">No clues yet. Search the rooms, or ask your fellow investigators.</p>}
              {revealed.map((c) => {
                const owner = investigators[c.slot]
                return (
                  <p key={c.id} className="text-xs text-slate-200">
                    <span className="font-bold text-violet-300">
                      {c.slot !== 0
                        ? owner.name
                        : caseData.openingClueIds.includes(c.id)
                          ? duo
                            ? 'Secret police clue'
                            : 'Police report'
                          : `You found (${roomOfClue(c.id) ?? 'house'})`}
                      :
                    </span>{' '}
                    {c.text}
                  </p>
                )
              })}
            </div>
          </div>

          <div className="hud-glass rounded-2xl p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{theme.whoQuestion}</p>
            <div className="flex flex-wrap gap-1.5">
              {caseData.suspects.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  emoji={s.emoji}
                  ruledOut={ruledOut('suspect', s.id)}
                  selected={selected.suspectId === s.id}
                  onClick={() => setSelected((sel) => ({ ...sel, suspectId: s.id }))}
                />
              ))}
            </div>
            <p className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">{theme.itemQuestion}</p>
            <div className="flex flex-wrap gap-1.5">
              {caseData.items.map((i) => (
                <Chip
                  key={i.id}
                  label={i.name}
                  emoji={i.emoji}
                  ruledOut={ruledOut('item', i.id)}
                  selected={selected.itemId === i.id}
                  onClick={() => setSelected((sel) => ({ ...sel, itemId: i.id }))}
                />
              ))}
            </div>
            <p className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">{theme.whereQuestion}</p>
            <div className="flex flex-wrap gap-1.5">
              {caseData.locations.map((l) => (
                <Chip
                  key={l.id}
                  label={l.name}
                  emoji={l.emoji}
                  ruledOut={ruledOut('location', l.id)}
                  selected={selected.locationId === l.id}
                  onClick={() => setSelected((sel) => ({ ...sel, locationId: l.id }))}
                />
              ))}
            </div>
          </div>

          <button
            disabled={!canAccuse}
            onClick={accuse}
            className={`sticky bottom-3 rounded-xl py-3 text-sm font-black ${
              canAccuse ? 'bg-violet-500 text-white hover:bg-violet-400' : 'bg-[#1c1630] text-slate-500 ring-1 ring-white/10'
            }`}
          >
            {duo ? `Accuse as ${me?.name}` : 'Make Accusation'}
          </button>
        </div>
      </div>
      )}

      {inspecting && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-5" onClick={closeEvidence}>
          <div
            className="hud-glass-strong relative w-full max-w-xs rounded-3xl px-5 pb-5 pt-6 text-center"
            style={{ animation: 'city-card-in 0.35s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={closeEvidence} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-white/10 p-1.5 text-slate-300 hover:bg-white/20">
              <X size={14} />
            </button>
            {duo && inspecting.found && evidenceOwner[inspecting.id] !== undefined && evidenceOwner[inspecting.id] !== turn ? (
              <>
                <span className="text-6xl">🧤</span>
                <h3 className="mt-2 text-xl font-black text-white">Already searched</h3>
                <p className="mt-2 text-sm text-slate-300">
                  {detectives[evidenceOwner[inspecting.id]]?.name} got here first. Whatever was here is in their notes now. Try another sparkle.
                </p>
              </>
            ) : (
              <>
            <span className="text-6xl">{inspecting.emoji}</span>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
              {caseData.locations.find((l) => l.id === inspecting.locationId)?.name}
            </p>
            <h3 className="mt-0.5 text-xl font-black text-white">{inspecting.label}</h3>
            <p className="mt-2 text-sm text-slate-300">{inspecting.finding}</p>
            {inspecting.clueId ? (
              <div className="mt-4 rounded-2xl bg-emerald-500/15 px-3 py-2.5 text-left ring-1 ring-emerald-400/40">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">{duo ? 'Clue added to your secret notes' : 'Clue added to your notes'}</p>
                <p className="mt-0.5 text-xs font-semibold text-emerald-50">{caseData.clues.find((c) => c.id === inspecting.clueId)?.text}</p>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-400">No clue here. Keep looking.</p>
            )}
              </>
            )}
            <button onClick={closeEvidence} className="mt-4 w-full rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white hover:bg-violet-400">
              {endsTurn ? 'End my turn' : 'Keep searching'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
