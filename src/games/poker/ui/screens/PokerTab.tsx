import { useState } from 'react'
import { ChevronRight, Lock, Users } from 'lucide-react'
import modeTourney from '../art/mode_tourney.webp'
import modePrivate from '../art/mode_private.webp'
import { PointsPill, ScreenHeader, Tabs, fmt, fmtShort, toast } from '../kit'
import { CrownIcon, SpadeIcon } from '../icons'
import BottomNav from '../BottomNav'
import { TABLE_TIERS, type TableTier } from '../../data/tables'
import { useNav, useRoute } from '../../state/nav'
import { levelInfo, useProfile } from '../../state/profileStore'
import { openPractice } from '../../state/tableStore'
import { sitCash } from '../../state/play'

type Filter = 'all' | 'classic' | 'vip' | 'practice'

/** The table browser: every table, its blinds, buy-in and what it takes to sit. */
export default function PokerTab() {
  const route = useRoute()
  const p = useProfile()
  const go = useNav((s) => s.go)
  const tab = useNav((s) => s.tab)
  const [filter, setFilter] = useState<Filter>((route.params?.filter as Filter) ?? 'all')
  if (!p) return null
  const level = levelInfo(p.xp).level

  const sit = (t: TableTier) => {
    if (t.mode === 'practice') {
      openPractice()
      return go('table')
    }
    if (p.balance < t.bigBlind * 20) return toast(`You need ${fmt(t.bigBlind * 20)} points for this table`, 'bad')
    sitCash(t.id)
  }

  return (
    <div className="rpc-screen rpc-with-nav">
      <ScreenHeader title="Poker" icon={<SpadeIcon size={26} />} right={<PointsPill amount={p.balance} onAdd={() => tab('rewards')} compact />} onBack={() => tab('home')} />
      <div className="px-4">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All' },
            { id: 'classic', label: 'Classic' },
            { id: 'vip', label: 'VIP' },
            { id: 'practice', label: 'Practice' },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 px-4">
        {filter === 'all' && (
          <div className="grid grid-cols-2 gap-3">
            <QuickCard art={modeTourney} title="Tournaments" sub="Free entry" onClick={() => go('tournament')} />
            <QuickCard art={modePrivate} title="Private Room" sub="Play with friends" onClick={() => go('room')} />
          </div>
        )}
        {TABLE_TIERS.filter((t) => filter === 'all' || t.mode === filter).map((t) => {
          const lockedLevel = level < t.minLevel
          const short = t.mode !== 'practice' && p.balance < t.bigBlind * 20
          const vip = t.mode === 'vip'
          return (
            <div key={t.id} className="relative flex items-center gap-3 overflow-hidden rounded-2xl p-3" style={{ background: vip ? 'linear-gradient(120deg,#3a0810,#120406)' : t.mode === 'practice' ? 'linear-gradient(120deg,#0a1a2e,#05080f)' : 'linear-gradient(120deg,#0c2a14,#050c07)', boxShadow: `0 0 0 1.5px ${vip ? '#e8424f' : '#e9b33a'}, 0 0 14px rgba(233,179,58,.18)` }}>
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full" style={{ background: 'radial-gradient(circle at 50% 35%, #2e2213, #0a0705)', boxShadow: '0 0 0 2px #d9a335' }}>
                {vip ? <CrownIcon size={30} /> : <SpadeIcon size={28} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="rpc-display truncate text-[1.25em] text-white">{t.name}</p>
                <p className="rpc-display text-[1em] text-[#ffd96a]">
                  Blinds {fmtShort(t.smallBlind)}/{fmtShort(t.bigBlind)} · {t.mode === 'practice' ? 'practice chips' : `buy-in ${fmtShort(t.buyIn)}`}
                </p>
                <p className="flex items-center gap-1 text-[0.85em] text-white/60">
                  <Users size={13} /> {t.opponents + 1}-max · {t.mode === 'practice' ? 'points not used' : `min ${fmt(t.bigBlind * 20)} pts`}
                </p>
              </div>
              {lockedLevel ? (
                <span className="flex flex-col items-center text-[0.85em] text-white/70">
                  <Lock size={20} /> Lv.{t.minLevel}
                </span>
              ) : (
                <button disabled={short} className={`btn ${vip ? 'btn-red' : 'btn-green'} h-11 px-4 text-[1.15em]`} onClick={() => sit(t)}>
                  {short ? 'Need pts' : 'Join'}
                </button>
              )}
            </div>
          )
        })}
        <p className="rpc-muted text-center text-[0.82em]">Classic and VIP tables use your free points. Practice tables and private rooms use table chips only.</p>
      </div>
      <BottomNav />
    </div>
  )
}

function QuickCard({ art, title, sub, onClick }: { art: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="dark-frame flex items-center gap-2 rounded-2xl p-2.5 text-left">
      <img src={art} alt="" className="h-12 w-12 rounded-full object-cover" style={{ maskImage: 'radial-gradient(closest-side,#000 80%,transparent)' }} />
      <span className="min-w-0 flex-1">
        <span className="rpc-display block truncate text-[1.1em] text-white">{title}</span>
        <span className="block truncate text-[0.82em] text-white/60">{sub}</span>
      </span>
      <ChevronRight size={18} className="text-white/60" />
    </button>
  )
}
