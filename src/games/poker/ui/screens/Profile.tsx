import { useState } from 'react'
import { ChevronRight, Pencil } from 'lucide-react'
import laurel from '../art/laurel.webp'
import medalStar from '../art/medal_star.webp'
import medalBlue from '../art/medal_blue.webp'
import medalPro from '../art/medal_pro.webp'
import crown from '../art/profile_crown.webp'
import chipsL from '../art/profile_chips_l.webp'
import chipsR from '../art/profile_chips_r.webp'
import { Avatar, LevelBadge, Progress, ScreenHeader, Sheet, fmt, fmtShort, toast } from '../kit'
import { GearIcon } from '../icons'
import BottomNav from '../BottomNav'
import { PORTRAIT_KEYS } from '../../data/players'
import { useNav } from '../../state/nav'
import { ACHIEVEMENTS, levelInfo, useProfile, useRpc } from '../../state/profileStore'

export const MEDAL_ART = { star: medalStar, blue: medalBlue, pro: medalPro }

/** Screen 7: my profile. */
export default function Profile() {
  const p = useProfile()
  const go = useNav((s) => s.go)
  const patchMe = useRpc((s) => s.patchMe)
  const [edit, setEdit] = useState(false)
  if (!p) return null
  const lv = levelInfo(p.xp)
  const winRate = p.stats.hands ? Math.round((p.stats.wins / p.stats.hands) * 100) : 0
  const shownAch = ACHIEVEMENTS.slice(0, 3)

  return (
    <div className="rpc-screen rpc-with-nav">
      <img src={chipsL} alt="" className="pointer-events-none absolute left-0 top-[200px] w-[22%] opacity-90" style={{ maskImage: 'linear-gradient(90deg,#000 60%,transparent)' }} />
      <img src={chipsR} alt="" className="pointer-events-none absolute right-0 top-[200px] w-[22%] opacity-90" style={{ maskImage: 'linear-gradient(270deg,#000 60%,transparent)' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96" style={{ background: 'radial-gradient(70% 60% at 50% 25%, rgba(255,190,70,.16), transparent 70%)' }} />

      <ScreenHeader
        title="My Profile"
        right={
          <button aria-label="Settings" onClick={() => go('settings')} className="grid h-10 w-10 place-items-center">
            <GearIcon size={30} />
          </button>
        }
      />

      {/* laurel portrait: the art's own portrait is covered by the player's avatar */}
      <div className="relative mx-auto mt-1 w-[78%] max-w-[330px]">
        <img src={laurel} alt="" className="block w-full" draggable={false} style={{ maskImage: 'linear-gradient(90deg, transparent 2%, #000 16%, #000 84%, transparent 98%)' }} />
        <div className="absolute left-1/2 top-[3%] -translate-x-1/2" style={{ width: '58%' }}>
          <Avatar avatar={p.avatar} size={0} className="!h-auto !w-full aspect-square" />
        </div>
        <button aria-label="Edit profile" onClick={() => setEdit(true)} className="icon-btn absolute bottom-[12%] right-[17%] h-11 w-11">
          <Pencil size={20} color="#ffd96a" />
        </button>
      </div>

      <div className="relative -mt-1 flex flex-col items-center">
        <h2 className="rpc-display text-[1.75em] text-white">{p.name}</h2>
        <LevelBadge level={lv.level} className="text-[1.45em]" />
        <div className="mt-2 flex w-[72%] items-center gap-2 rounded-full bg-black/70 py-1.5 pl-2 pr-3" style={{ boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.45)' }}>
          <Progress value={lv.xp} max={lv.need} className="flex-1" />
          <span className="rpc-display whitespace-nowrap text-[1.05em] text-white">
            {fmt(lv.xp)} / {fmt(lv.need)}
          </span>
        </div>
      </div>

      <div className="dark-frame mx-4 mt-4 grid grid-cols-3 rounded-2xl py-2.5 text-center">
        <Stat label="Total Hands" value={fmt(p.stats.hands)} />
        <Stat label="Win Rate" value={`${winRate}%`} border />
        <Stat label="Total Winnings" value={fmtShort(p.stats.totalWon)} sub="points" border />
      </div>

      <div className="mt-4 flex items-center justify-between px-4">
        <h3 className="rpc-display text-[1.45em] text-white">Achievements</h3>
        <button className="rpc-display flex items-center text-[1.1em] text-white" onClick={() => go('achievements')}>
          See All <ChevronRight size={20} />
        </button>
      </div>
      <div className="mx-4 mt-2 grid grid-cols-3">
        {shownAch.map((a, i) => (
          <button key={a.id} onClick={() => go('achievements')} className={`flex flex-col items-center gap-1 ${i ? 'border-l border-[#e9b33a]/25' : ''}`}>
            <img src={MEDAL_ART[a.art]} alt="" className="h-[64px] w-auto" style={{ filter: p.achievements[a.id] ? 'none' : 'grayscale(.85) brightness(.6)', maskImage: 'radial-gradient(closest-side,#000 82%,transparent)' }} />
            <span className="rpc-display text-[1em] text-white">{a.name}</span>
          </button>
        ))}
      </div>

      <div className="dark-frame mx-4 mt-4 overflow-hidden rounded-2xl">
        <MenuItem icon={<ListIcon />} label="My History" onClick={() => go('history')} />
        <MenuItem icon={<WalletIcon />} label="Points History" onClick={() => go('points')} />
        <MenuItem icon={<GearIcon size={30} />} label="Settings" onClick={() => go('settings')} />
        <MenuItem icon={<FriendsIcon />} label="Friends" onClick={() => go('friends')} last />
      </div>
      <img src={crown} alt="" className="pointer-events-none ml-auto mt-1 w-[55%] opacity-90" style={{ maskImage: 'linear-gradient(0deg,transparent,#000 30%)' }} />

      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit profile">
        <label className="rpc-field mb-4">
          <span className="rpc-muted text-[0.9em]">Name</span>
          <input
            defaultValue={p.name}
            maxLength={14}
            aria-label="Display name"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v === p.name) return
              if (/^[\p{L}\p{N}_.]{3,14}$/u.test(v)) void patchMe({ handle: v }).then((err) => toast(err ?? 'Name saved', err ? 'bad' : 'good'))
              else toast('Names are 3–14 letters or numbers', 'bad')
            }}
          />
        </label>
        <div className="grid grid-cols-4 gap-3">
          {PORTRAIT_KEYS.map((k) => (
            <button key={k} aria-label={`Avatar ${k}`} aria-pressed={p.avatar === k} onClick={() => void patchMe({ avatar: k })}>
              <Avatar avatar={k} size={64} glow={p.avatar === k} />
            </button>
          ))}
        </div>
      </Sheet>
      <BottomNav />
    </div>
  )
}

function Stat({ label, value, sub, border }: { label: string; value: string; sub?: string; border?: boolean }) {
  return (
    <div className={border ? 'border-l border-[#e9b33a]/30' : ''}>
      <p className="rpc-display text-[1.05em] text-white">{label}</p>
      <p className="rpc-display text-[1.6em] leading-tight text-white">{value}</p>
      {sub && <p className="rpc-muted -mt-0.5 text-[0.72em]">{sub}</p>}
    </div>
  )
}

function MenuItem({ icon, label, onClick, last }: { icon: React.ReactNode; label: string; onClick: () => void; last?: boolean }) {
  return (
    <button onClick={onClick} className={`flex h-[58px] w-full items-center gap-4 px-4 text-left active:bg-white/5 ${last ? '' : 'border-b border-[#e9b33a]/20'}`}>
      <span className="grid w-9 place-items-center">{icon}</span>
      <span className="rpc-display flex-1 text-[1.3em] text-white">{label}</span>
      <ChevronRight size={24} className="text-white" />
    </button>
  )
}

const ListIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
    <path fill="url(#rpcSkin)" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path fill="#3a2410" d="M6 7h2v2H6V7Zm4 0h8v2h-8V7Zm-4 4h2v2H6v-2Zm4 0h8v2h-8v-2Zm-4 4h2v2H6v-2Zm4 0h8v2h-8v-2Z" />
  </svg>
)
const WalletIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
    <path fill="url(#rpcSkin)" d="M4 5h14a2 2 0 0 1 2 2v1h-6a4 4 0 0 0 0 8h6v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    <path fill="url(#rpcGold)" d="M14 10h8v4h-8a2 2 0 0 1 0-4Z" />
  </svg>
)
const FriendsIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
    <circle cx="9" cy="7.5" r="3.6" fill="url(#rpcSkin)" />
    <circle cx="17" cy="8.5" r="2.8" fill="url(#rpcSkin)" />
    <path fill="url(#rpcGold)" d="M2.5 19c0-3.4 2.9-5.8 6.5-5.8s6.5 2.4 6.5 5.8V20h-13v-1Zm14.3 1v-1c0-1.9-.7-3.5-1.9-4.6.6-.2 1.3-.3 2.1-.3 2.8 0 4.5 1.8 4.5 4.4V20h-4.7Z" />
  </svg>
)
