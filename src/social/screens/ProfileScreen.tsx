import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Crown, Gift, LogOut, Pencil, Settings, ShoppingBag, Sparkles, Trophy, UserPlus } from 'lucide-react'
import { usePlayerStore, xpForLevel } from '@/social/stores/usePlayerStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { GAME_LIST } from '@/games/registry'
import { useHub } from '@/net/hub'
import { MyFriendCode } from '@/social/components/FriendCode'
import { Avatar, BTN_PRIMARY, Card, SectionTitle, Sheet } from '@/social/components/ui'
import { computeBadges, rankFor, TIER_COLOR, TIER_NAME, type Badge } from '@/social/badges'
import { providerBuilt, useAccount, type SignInProvider } from '@/lib/account'

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

/** Round level meter around the avatar. */
function LevelRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  const r = 54
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#lvl)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <defs>
          <linearGradient id="lvl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

/** A badge medallion: tier-coloured ring, icon, name, and progress to the next tier. */
function Medal({ b, big = false, onClick }: { b: Badge; big?: boolean; onClick?: () => void }) {
  const col = TIER_COLOR[b.tier]
  const locked = b.tier === 0
  return (
    <button type="button" onClick={onClick} className={`group flex flex-col items-center rounded-2xl p-2.5 text-center transition-transform active:scale-95 ${big ? '' : 'bg-white/[0.03] ring-1 ring-white/[0.06]'}`}>
      <span
        className={`relative flex items-center justify-center rounded-full ${big ? 'h-20 w-20 text-4xl' : 'h-14 w-14 text-2xl'}`}
        style={{
          background: locked ? 'rgba(255,255,255,0.04)' : `radial-gradient(circle at 35% 30%, ${col}55, ${col}18 60%, transparent 75%)`,
          boxShadow: locked ? 'inset 0 0 0 2px rgba(255,255,255,0.08)' : `inset 0 0 0 3px ${col}, 0 0 ${big ? 26 : 14}px ${col}66`,
        }}
      >
        <span className={locked ? 'opacity-25 grayscale' : ''}>{b.icon}</span>
        {!locked && b.tier < 3 && (
          <span className="absolute -bottom-1 rounded-full px-1.5 text-[8px] font-black uppercase tracking-wider text-black" style={{ background: col }}>
            {TIER_NAME[b.tier]}
          </span>
        )}
        {b.tier === 3 && <Sparkles size={big ? 16 : 12} className="absolute -right-0.5 -top-0.5 text-amber-200" />}
      </span>
      <span className={`mt-2 truncate font-extrabold text-white ${big ? 'text-[13px]' : 'max-w-full text-[11px]'}`}>{b.name}</span>
      {!big && (
        <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full" style={{ width: `${Math.round(b.progress * 100)}%`, background: b.tier === 3 ? TIER_COLOR[3] : TIER_COLOR[Math.min(3, b.tier + 1)] }} />
        </span>
      )}
    </button>
  )
}

const PROVIDER_UI: Record<SignInProvider, { label: string; bg: string; fg: string; logo: React.ReactNode }> = {
  google: {
    label: 'Continue with Google',
    bg: '#ffffff',
    fg: '#1f2937',
    logo: (
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    ),
  },
  facebook: {
    label: 'Continue with Facebook',
    bg: '#1877F2',
    fg: '#ffffff',
    logo: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="#fff">
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
      </svg>
    ),
  },
}

/** Sign in once with Google or Facebook for all four games; Facebook also brings your friends who play. */
function ConnectCard() {
  const { account, serverSocial, busy, facebookFound, loadConfig, signIn, signOut, syncFacebookFriends } = useAccount()
  const [age, setAge] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    void loadConfig()
  }, [loadConfig])
  const ready = (p: SignInProvider) => providerBuilt[p] && !!serverSocial?.[p]

  if (account) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: PROVIDER_UI[account.provider].bg }}>
            {PROVIDER_UI[account.provider].logo}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">Signed in as {account.name}</p>
            <p className="truncate text-[11px] font-semibold text-slate-400">{account.email ?? (account.provider === 'google' ? 'Google' : 'Facebook')} · Ludo, City, Poker & Wildbound</p>
          </div>
          <button type="button" onClick={() => void signOut()} aria-label="Sign out" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-300">
            <LogOut size={15} />
          </button>
        </div>
        {account.provider === 'facebook' && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => setMsg((await syncFacebookFriends()) ?? 'Friend requests sent to your Facebook friends!')}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1877F2] py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <UserPlus size={16} /> {busy === 'facebook' ? 'Finding friends…' : `Find Facebook friends${facebookFound.length ? ` (${facebookFound.length} play)` : ''}`}
          </button>
        )}
        {msg && <p className="mt-2 text-center text-[12px] font-semibold text-slate-300">{msg}</p>}
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <p className="text-sm font-black text-white">Connect your account</p>
      <p className="mt-0.5 text-[12px] font-semibold text-slate-400">One sign-in for all four games. With Facebook, your friends who play show up automatically.</p>
      <div className="mt-3 space-y-2">
        {(['google', 'facebook'] as SignInProvider[]).map((p) => (
          <button
            key={p}
            type="button"
            disabled={!ready(p) || busy !== null}
            onClick={async () => setMsg(await signIn(p, age))}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-3 text-sm font-black shadow-lg transition-transform active:scale-[0.98] disabled:opacity-45"
            style={{ background: PROVIDER_UI[p].bg, color: PROVIDER_UI[p].fg }}
          >
            {PROVIDER_UI[p].logo}
            {busy === p ? 'Signing in…' : PROVIDER_UI[p].label}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-slate-300">
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="h-4 w-4 accent-violet-500" />
        I'm 18 or older (needed for a new account)
      </label>
      {!ready('google') && !ready('facebook') && <p className="mt-2 text-[11px] font-semibold text-amber-300/90">Sign-in isn't set up on this server yet. Your friend code below always works.</p>}
      {msg && <p className="mt-2 text-center text-[12px] font-semibold text-rose-300">{msg}</p>}
    </Card>
  )
}

export default function ProfileScreen() {
  const navigate = useNavigate()
  const profile = usePlayerStore((s) => s.profile)
  const stats = usePlayerStore((s) => s.stats)
  const achievements = usePlayerStore((s) => s.achievements)
  const friendCount = useFriendsStore((s) => s.friends.filter((f) => f.status === 'friend').length)
  const connected = useAccount((s) => !!s.account)
  const online = useHub((s) => s.status === 'online')
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<Badge | null>(null)

  const need = xpForLevel(profile.level)
  const pct = Math.min(100, Math.round((profile.xp / need) * 100))
  const played = Object.values(stats).reduce((s, g) => s + g.played, 0)
  const wins = Object.values(stats).reduce((s, g) => s + g.wins, 0)
  const winRate = played ? Math.round((wins / played) * 100) : 0
  const rank = rankFor(profile.level)
  const badges = useMemo(() => computeBadges({ stats, level: profile.level, friends: friendCount, connected, achievements }), [stats, profile.level, friendCount, connected, achievements])
  const earned = badges.filter((b) => b.tier > 0)
  const showcase = [...earned].sort((a, b) => b.tier - a.tier || b.value - a.value).slice(0, 3)

  return (
    <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-4">
      <div className="app-aurora pointer-events-none absolute inset-x-0 -top-24 h-96" />

      {/* hero */}
      <Card className="relative overflow-hidden p-5 text-center" glow="rgba(124,92,255,0.8)">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${rank.color}44, transparent 60%), linear-gradient(160deg, rgba(124,92,255,0.25), transparent 50%)` }} />
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit profile" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
          <Pencil size={15} />
        </button>
        <div className="relative flex justify-center">
          <button type="button" onClick={() => setEditing(true)} aria-label="Change avatar">
            <LevelRing pct={pct}>
              <Avatar emoji={profile.avatarEmoji} size="xl" ring="transparent" online={online} />
            </LevelRing>
          </button>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand to-brand-2 px-2.5 py-0.5 text-[11px] font-black text-white shadow-lg">LV {profile.level}</span>
        </div>
        <h1 className="relative mt-3 flex items-center justify-center gap-2 text-2xl font-black text-white">
          {profile.name}
          {profile.premium && <Crown size={18} className="fill-amber-300 text-amber-300" />}
        </h1>
        <div className="relative mt-1 flex items-center justify-center gap-2 text-sm font-semibold">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider" style={{ background: `${rank.color}22`, color: rank.color, boxShadow: `inset 0 0 0 1px ${rank.color}66` }}>
            {rank.name}
          </span>
          <span className="text-slate-400">
            {friendCount} {friendCount === 1 ? 'friend' : 'friends'}
          </span>
        </div>
        <p className="relative mt-2 text-[11px] font-bold text-slate-500">
          {profile.xp.toLocaleString()} / {need.toLocaleString()} XP to level {profile.level + 1}
        </p>
        <div className="relative mt-4 grid grid-cols-4 gap-2">
          {[
            ['🪙', profile.coins.toLocaleString(), 'Coins'],
            ['🎮', played, 'Played'],
            ['🏆', wins, 'Wins'],
            ['📈', `${winRate}%`, 'Win rate'],
          ].map(([icon, value, label]) => (
            <div key={label} className="rounded-2xl bg-white/[0.06] px-1 py-2.5 ring-1 ring-white/[0.06]">
              <p className="text-base">{icon}</p>
              <p className="truncate text-sm font-black text-white">{value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* showcase */}
      <section className="relative mt-5">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Sparkles size={16} className="text-amber-300" /> Showcase
          </span>
        </SectionTitle>
        <Card className="p-3">
          {showcase.length ? (
            <div className="grid grid-cols-3">{showcase.map((b) => <Medal key={b.id} b={b} big onClick={() => setPicked(b)} />)}</div>
          ) : (
            <p className="py-4 text-center text-sm font-semibold text-slate-400">Play and win games to earn your first badges!</p>
          )}
        </Card>
      </section>

      <section className="relative mt-5">
        <ConnectCard />
      </section>

      <div className="relative mt-5">
        <MyFriendCode />
      </div>

      {/* badges */}
      <section className="relative mt-6">
        <SectionTitle action={<span className="text-[12px] font-black text-slate-400">{earned.length}/{badges.length}</span>}>
          <span className="flex items-center gap-1.5">
            <Trophy size={16} className="text-amber-300" /> Badges
          </span>
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {badges.map((b) => (
            <Medal key={b.id} b={b} onClick={() => setPicked(b)} />
          ))}
        </div>
      </section>

      {/* per-game stats */}
      <section className="relative mt-6">
        <SectionTitle>Game stats</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {GAME_LIST.map((g) => {
            const st = stats[g.id] ?? { played: 0, wins: 0 }
            const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0
            return (
              <button key={g.id} type="button" onClick={() => navigate(`/games/${g.id}`)} className="relative overflow-hidden rounded-2xl text-left ring-1 ring-white/[0.08]">
                <img src={`/posters/${g.id}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                <span className="relative block p-3 pt-10">
                  <span className="block truncate text-[14px] font-black text-white">{g.name}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-slate-300">
                    {st.played} played · <span className="text-amber-300">{st.wins} wins</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/15">
                    <span className="block h-full rounded-full" style={{ width: `${rate}%`, background: g.accentHex }} />
                  </span>
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{rate}% win rate</span>
                </span>
              </button>
            )
          })}
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
      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name}>
        {picked && (
          <div className="flex flex-col items-center pb-2 text-center">
            <Medal b={picked} big />
            <p className="mt-2 text-sm font-black" style={{ color: TIER_COLOR[picked.tier] }}>
              {picked.tier === 0 ? 'Locked' : picked.tier === 3 ? 'Gold · maxed out' : `${TIER_NAME[picked.tier]} tier`}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-300">{picked.next === null ? 'You earned every tier of this badge!' : `Next: ${picked.goal}`}</p>
            {picked.next !== null && picked.next > 1 && (
              <p className="mt-1 text-[12px] font-bold text-slate-500">
                {picked.value} / {picked.next}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
