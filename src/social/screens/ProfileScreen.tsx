import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Crown, Gift, Pencil, Settings, ShoppingBag, Trophy } from 'lucide-react'
import { usePlayerStore, xpForLevel } from '@/social/stores/usePlayerStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { GAME_LIST } from '@/games/registry'
import { useHub } from '@/net/hub'
import { MyFriendCode } from '@/social/components/FriendCode'
import { Avatar, BTN_PRIMARY, Card, SectionTitle, Sheet } from '@/social/components/ui'

export const AVATARS = ['🧑‍🚀', '🦊', '🐯', '🐼', '🦁', '🐸', '🐵', '🦄', '🐲', '👾', '🤖', '👻', '🧙', '🥷', '🧛', '🧜‍♀️', '🦸', '🦹', '🕵️', '👑', '😎', '🤠', '🥳', '😺']

export function ProfileEditor({ onDone, submitLabel = 'Save' }: { onDone: () => void; submitLabel?: string }) {
  const profile = usePlayerStore((s) => s.profile)
  const setName = usePlayerStore((s) => s.setName)
  const setAvatar = usePlayerStore((s) => s.setAvatar)
  const [name, setDraft] = useState(profile.name)
  const [emoji, setEmoji] = useState(profile.avatarEmoji)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        setName(name.trim().slice(0, 16))
        setAvatar(emoji)
        onDone()
      }}
    >
      <div className="flex justify-center">
        <Avatar emoji={emoji} size="xl" ring="#7c5cff" />
      </div>
      <label className="mt-4 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400" htmlFor="profile-name">
        Name
      </label>
      <input
        id="profile-name"
        value={name}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={16}
        autoComplete="nickname"
        className="mt-1.5 w-full rounded-2xl bg-white/[0.06] px-4 py-3 text-base font-bold text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-brand/60"
      />
      <p className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Avatar</p>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setEmoji(a)}
            aria-pressed={a === emoji}
            className={`flex aspect-square items-center justify-center rounded-2xl text-2xl transition-transform active:scale-90 ${a === emoji ? 'bg-brand/30 ring-2 ring-brand' : 'bg-white/[0.05]'}`}
          >
            {a}
          </button>
        ))}
      </div>
      <button type="submit" disabled={!name.trim()} className={`${BTN_PRIMARY} mt-5 w-full py-3.5 text-base`}>
        {submitLabel}
      </button>
    </form>
  )
}

export default function ProfileScreen() {
  const navigate = useNavigate()
  const profile = usePlayerStore((s) => s.profile)
  const stats = usePlayerStore((s) => s.stats)
  const achievements = usePlayerStore((s) => s.achievements)
  const friendCount = useFriendsStore((s) => s.friends.filter((f) => f.status === 'friend').length)
  const online = useHub((s) => s.status === 'online')
  const [editing, setEditing] = useState(false)

  const need = xpForLevel(profile.level)
  const pct = Math.min(100, Math.round((profile.xp / need) * 100))
  const played = Object.values(stats).reduce((s, g) => s + g.played, 0)
  const wins = Object.values(stats).reduce((s, g) => s + g.wins, 0)
  const unlocked = achievements.filter((a) => a.unlocked).length

  return (
    <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-4">
      <div className="app-aurora pointer-events-none absolute inset-x-0 -top-24 h-96" />

      <Card className="relative p-5 text-center" glow="rgba(124,92,255,0.8)">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand/30 to-transparent" />
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit profile" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
          <Pencil size={15} />
        </button>
        <div className="relative flex justify-center">
          <button type="button" onClick={() => setEditing(true)} aria-label="Change avatar">
            <Avatar emoji={profile.avatarEmoji} size="xl" ring="#7c5cff" online={online} />
          </button>
        </div>
        <h1 className="relative mt-3 flex items-center justify-center gap-2 text-2xl font-black text-white">
          {profile.name}
          {profile.premium && <Crown size={18} className="fill-amber-300 text-amber-300" />}
        </h1>
        <p className="relative text-sm font-semibold text-slate-400">
          {profile.title} · {friendCount} {friendCount === 1 ? 'friend' : 'friends'}
        </p>
        <div className="relative mx-auto mt-4 max-w-xs">
          <div className="flex items-center justify-between text-[11px] font-black">
            <span className="text-brand-2">LEVEL {profile.level}</span>
            <span className="text-slate-500">
              {profile.xp.toLocaleString()} / {need.toLocaleString()} XP
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-4 gap-2">
          {[
            ['🪙', profile.coins.toLocaleString(), 'Coins'],
            ['🎮', played, 'Played'],
            ['🏆', wins, 'Wins'],
            ['⭐', `${unlocked}/${achievements.length}`, 'Badges'],
          ].map(([icon, value, label]) => (
            <div key={label} className="rounded-2xl bg-white/[0.05] px-1 py-2.5">
              <p className="text-base">{icon}</p>
              <p className="truncate text-sm font-black text-white">{value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="relative mt-5">
        <MyFriendCode />
      </div>

      <section className="relative mt-6">
        <SectionTitle>Game stats</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {GAME_LIST.map((g) => (
            <button key={g.id} type="button" onClick={() => navigate(`/games/${g.id}`)} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] p-2 text-left ring-1 ring-white/[0.06]">
              <img src={`/posters/${g.id}.webp`} alt="" className="h-11 w-11 rounded-xl object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-extrabold text-white">{g.name}</span>
                <span className="block text-[11px] font-semibold text-slate-400">
                  {stats[g.id].played} played · <span className="text-amber-300">{stats[g.id].wins} wins</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="relative mt-6">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Trophy size={16} className="text-amber-300" /> Achievements
          </span>
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2.5">
          {achievements.map((a) => (
            <div key={a.id} className={`rounded-2xl p-3 text-center ring-1 ${a.unlocked ? 'bg-amber-400/10 ring-amber-300/30' : 'bg-white/[0.03] ring-white/[0.06]'}`}>
              <p className={`text-2xl ${a.unlocked ? '' : 'opacity-30 grayscale'}`}>{a.icon}</p>
              <p className="mt-1 truncate text-[11px] font-extrabold text-white">{a.name}</p>
              <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-tight text-slate-500">{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-6 space-y-2">
        {[
          { to: '/rewards', icon: Gift, label: 'Rewards & challenges', color: 'text-amber-300' },
          { to: '/premium', icon: ShoppingBag, label: 'Store & Alpha Pass', color: 'text-gem' },
          { to: '/settings', icon: Settings, label: 'Settings', color: 'text-slate-300' },
        ].map((l) => (
          <button key={l.to} type="button" onClick={() => navigate(l.to)} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-3.5 text-left ring-1 ring-white/[0.06]">
            <l.icon size={19} className={l.color} />
            <span className="flex-1 text-sm font-bold text-white">{l.label}</span>
            <ChevronRight size={17} className="text-slate-500" />
          </button>
        ))}
      </section>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <ProfileEditor onDone={() => setEditing(false)} />
      </Sheet>
    </div>
  )
}
