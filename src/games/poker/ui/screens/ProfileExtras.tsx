import { useEffect, useState, type ReactNode } from 'react'
import { Accessibility, Bell, Eye, KeyRound, LogOut, Mail, Music, ShieldCheck, Trash2, Type, Vibrate, Volume2 } from 'lucide-react'
import { Empty, PlayingCard, ScreenHeader, Sheet, Toggle, fmt, fmtShort, toast } from '../kit'
import { CoinIcon } from '../icons'
import { MEDAL_ART } from './Profile'
import { useNav } from '../../state/nav'
import { ACHIEVEMENTS, useProfile, useRpc, type LedgerType, type RpcSettings } from '../../state/profileStore'
import { openAdPrivacyOptions, adsAvailable } from '@/lib/ads'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

/* ---------------------------------------------------------------- my history */

export function HistoryScreen() {
  const p = useProfile()
  const loadHistory = useRpc((s) => s.loadHistory)
  useEffect(() => void loadHistory(), [loadHistory])
  if (!p) return null
  return (
    <div className="rpc-screen pb-8">
      <ScreenHeader title="My History" />
      <div className="flex flex-col gap-2 px-4">
        {p.history.length === 0 && <Empty title="No hands yet" body="Every hand you play shows up here with your cards, the board and the result." />}
        {p.history.map((h) => (
          <div key={h.id} className="dark-frame rounded-2xl px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="rpc-display text-[1.02em] text-white">{h.table}</span>
              <span className={`rpc-display text-[1.1em] ${h.net > 0 ? 'text-green-400' : h.net < 0 ? 'text-red-400' : 'text-white/60'}`}>
                {h.net > 0 ? '+' : ''}
                {fmt(h.net)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="flex gap-1">
                {h.hole.map((c) => (
                  <PlayingCard key={c} card={c} width={30} />
                ))}
              </span>
              <span className="h-8 w-px bg-[#e9b33a]/30" />
              <span className="flex gap-0.5">
                {h.board.map((c) => (
                  <PlayingCard key={c} card={c} width={24} />
                ))}
                {h.board.length === 0 && <span className="rpc-muted text-[0.85em]">no flop</span>}
              </span>
            </div>
            <p className="rpc-muted mt-1 text-[0.85em]">
              {h.hand ?? (h.won ? 'Won without a showdown' : 'Folded')} · {new Date(h.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              {h.mode === 'friends' ? ' · private room (no points)' : h.mode === 'tournament' ? ' · tournament' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- points ledger */

const LEDGER_LABEL: Record<LedgerType, string> = {
  STARTER_GRANT: 'Starter grant',
  DAILY_GRANT: 'Daily grant',
  MISSION_REWARD: 'Reward',
  HAND_SETTLEMENT: 'Hand',
  ADMIN_CORRECTION: 'Correction',
  RESET: 'Reset',
}

export function PointsScreen() {
  const p = useProfile()
  const loadLedger = useRpc((s) => s.loadLedger)
  useEffect(() => void loadLedger(), [loadLedger])
  if (!p) return null
  return (
    <div className="rpc-screen pb-8">
      <ScreenHeader title="Points History" />
      <div className="gold-frame mx-4 flex items-center gap-3 rounded-2xl p-4">
        <CoinIcon size={46} />
        <div className="flex-1">
          <p className="rpc-muted text-[0.9em]">Balance</p>
          <p className="rpc-display gold-text text-[2em] leading-tight">{fmt(p.balance)}</p>
        </div>
      </div>
      <p className="rpc-muted mx-4 mt-2 text-[0.82em]">Free entertainment points. They can’t be bought, sent to anyone or cashed out, and have no money value.</p>
      <div className="mt-3 flex flex-col px-4">
        {p.ledger.length === 0 && <Empty title="No activity yet" />}
        {p.ledger.slice(0, 150).map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-[#e9b33a]/15 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.98em] text-white">{e.reason}</p>
              <p className="rpc-muted text-[0.78em]">
                {LEDGER_LABEL[e.type]} · {new Date(e.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
            <div className="text-right">
              <p className={`rpc-display text-[1.1em] ${e.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {e.amount >= 0 ? '+' : ''}
                {fmtShort(e.amount)}
              </p>
              <p className="rpc-muted text-[0.75em]">{fmt(e.balance)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- achievements */

export function AchievementsScreen() {
  const p = useProfile()
  if (!p) return null
  return (
    <div className="rpc-screen pb-8">
      <ScreenHeader title="Achievements" />
      <div className="grid grid-cols-2 gap-3 px-4">
        {ACHIEVEMENTS.map((a) => {
          const at = p.achievements[a.id]
          return (
            <div key={a.id} className="dark-frame flex flex-col items-center rounded-2xl p-3 text-center">
              <img src={MEDAL_ART[a.art]} alt="" className="h-16" style={{ filter: at ? 'none' : 'grayscale(.9) brightness(.55)', maskImage: 'radial-gradient(closest-side,#000 82%,transparent)' }} />
              <p className="rpc-display mt-1 text-[1.08em] text-white">{a.name}</p>
              <p className="rpc-muted text-[0.82em]">{a.description}</p>
              <p className={`mt-1 text-[0.78em] ${at ? 'text-green-400' : 'text-white/40'}`}>{at ? `Unlocked ${new Date(at).toLocaleDateString()}` : 'Locked'}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- settings */

export function SettingsScreen() {
  const p = useProfile()
  const { setSetting, logOut, deleteAccount, upgradeGuest, changePassword } = useRpc()
  const reset = useNav((s) => s.reset)
  const go = useNav((s) => s.go)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sheet, setSheet] = useState<'upgrade' | 'password' | null>(null)
  const [f1, setF1] = useState('')
  const [f2, setF2] = useState('')
  if (!p) return null
  const set = (k: keyof RpcSettings) => (on: boolean) => {
    setSetting(k, on)
    // the club's music switch drives VIBO's background music
    if (k === 'music') usePlayerStore.getState().updateSettings({ musicOn: on })
  }
  const s = p.settings
  return (
    <div className="rpc-screen pb-10">
      <ScreenHeader title="Settings" />
      <div className="flex flex-col gap-4 px-4">
        <Group title="Sound">
          <Row icon={<Volume2 size={20} />} label="Sound effects" right={<Toggle label="Sound effects" checked={s.sound} onChange={set('sound')} />} />
          <Row icon={<Music size={20} />} label="Music" right={<Toggle label="Music" checked={s.music} onChange={set('music')} />} />
          <Row icon={<Vibrate size={20} />} label="Vibration" right={<Toggle label="Vibration" checked={s.vibration} onChange={set('vibration')} />} />
        </Group>
        <Group title="Accessibility">
          <Row icon={<Eye size={20} />} label="Four-colour deck" hint="Diamonds blue, clubs green" right={<Toggle label="Four-colour deck" checked={s.fourColorDeck} onChange={set('fourColorDeck')} />} />
          <Row icon={<Type size={20} />} label="Larger text" right={<Toggle label="Larger text" checked={s.largeText} onChange={set('largeText')} />} />
          <Row icon={<Accessibility size={20} />} label="Reduce motion" right={<Toggle label="Reduce motion" checked={s.reducedMotion} onChange={set('reducedMotion')} />} />
        </Group>
        <Group title="Privacy">
          <Row icon={<Bell size={20} />} label="Show me online to friends" right={<Toggle label="Show online" checked={s.showOnline} onChange={set('showOnline')} />} />
          {adsAvailable && <Row icon={<ShieldCheck size={20} />} label="Ad privacy choices" onClick={() => void openAdPrivacyOptions()} />}
          <Row icon={<ShieldCheck size={20} />} label="Help, rules & safety" onClick={() => go('help')} />
        </Group>
        <Group title="Account">
          <Row label={p.kind === 'guest' ? 'Playing as guest' : (p.email ?? `Signed in with ${p.kind}`)} hint={`Invite code ${p.inviteCode}`} />
          {p.kind === 'guest' && <Row icon={<Mail size={20} />} label="Add email & password" hint="Keep your points if you change phones" onClick={() => setSheet('upgrade')} />}
          {p.kind === 'email' && <Row icon={<KeyRound size={20} />} label="Change password" hint="Signs out your other devices" onClick={() => setSheet('password')} />}
          <Row
            icon={<LogOut size={20} />}
            label="Log out"
            onClick={() => {
              void logOut()
              reset('auth')
            }}
          />
          <Row icon={<Trash2 size={20} className="text-red-400" />} label="Delete account" danger onClick={() => setConfirmDelete(true)} />
        </Group>
        <p className="rpc-muted text-center text-[0.8em]">Royal Poker Club · social poker with free points · 18+</p>
      </div>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete account?">
        <p className="mb-4 text-[#e9dcc0]">This removes your profile, points, history and cosmetics from this device. It can’t be undone.</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-dark h-12" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button
            className="btn btn-red h-12"
            onClick={async () => {
              const err = await deleteAccount()
              if (err) return toast(err, 'bad')
              toast('Account deleted', 'info')
              reset('splash')
            }}
          >
            Delete
          </button>
        </div>
      </Sheet>
      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === 'upgrade' ? 'Add email & password' : 'Change password'}>
        <div className="flex flex-col gap-3">
          <label className="rpc-field">
            <input value={f1} onChange={(e) => setF1(e.target.value)} placeholder={sheet === 'upgrade' ? 'Email address' : 'Current password'} type={sheet === 'upgrade' ? 'email' : 'password'} aria-label={sheet === 'upgrade' ? 'Email address' : 'Current password'} />
          </label>
          <label className="rpc-field">
            <input value={f2} onChange={(e) => setF2(e.target.value)} placeholder="New password (8+ characters)" type="password" aria-label="New password" />
          </label>
          <button
            className="btn btn-gold h-12 text-[1.15em]"
            onClick={async () => {
              if (f2.length < 8) return toast('Passwords need at least 8 characters', 'bad')
              const err = sheet === 'upgrade' ? await upgradeGuest(f1, f2) : await changePassword(f1, f2)
              if (err) return toast(err, 'bad')
              toast(sheet === 'upgrade' ? 'Email added. Your account is safe.' : 'Password changed', 'good')
              setSheet(null)
              setF1('')
              setF2('')
            }}
          >
            Save
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="rpc-display mb-1.5 text-[1.1em] text-[#ffd96a]">{title}</h3>
      <div className="dark-frame overflow-hidden rounded-2xl">{children}</div>
    </section>
  )
}

function Row({ icon, label, hint, right, onClick, danger }: { icon?: ReactNode; label: string; hint?: string; right?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className="flex min-h-[54px] w-full items-center gap-3 border-b border-[#e9b33a]/15 px-3 text-left last:border-b-0">
      {icon && <span className="text-[#ffd96a]">{icon}</span>}
      <span className="flex-1">
        <span className={`block text-[1.02em] ${danger ? 'text-red-300' : 'text-white'}`}>{label}</span>
        {hint && <span className="rpc-muted block text-[0.8em]">{hint}</span>}
      </span>
      {right}
    </Tag>
  )
}

/* ---------------------------------------------------------------- help */

export function HelpScreen() {
  return (
    <div className="rpc-screen pb-10">
      <ScreenHeader title="Help" />
      <div className="flex flex-col gap-3 px-4 text-[0.98em] leading-relaxed text-[#e9dcc0]">
        <Card title="The game">No-Limit Texas Hold’em for 2–6 players. Two private cards each, five shared cards, best five-card hand wins. Blinds rotate with the dealer button every hand.</Card>
        <Card title="Your turn">You have 15 seconds (20 in private rooms). When time runs out you check if you can, otherwise you fold. A short all-in raise doesn’t reopen betting for players who already acted.</Card>
        <Card title="Points">Points are free entertainment counters. You get starter points, daily bonuses and mission rewards, and you win or lose them at Classic and VIP tables. They can’t be bought, sent to other players, or exchanged for money or prizes. Practice tables and private rooms use table chips that don’t touch your points.</Card>
        <Card title="Fair play">Online tables run on the club server: it shuffles with a secure random generator, checks every action, and sends each player only their own cards until a showdown. Every hand is stored with its event log so support can replay it exactly. Practice tables run on your phone.</Card>
        <Card title="Safety">Tap a player at the table or in Friends to mute, block or report them. Reports cover harassment, hate, spam, impersonation, suspected collusion, cheating and inappropriate profiles.</Card>
        <Card title="Shop">Only cosmetics (felts, card backs, frames, themes) and VIP access are sold, through Google Play. Nothing in the shop changes the cards, odds or points.</Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dark-frame rounded-2xl p-4">
      <h3 className="rpc-display gold-text mb-1 text-[1.2em]">{title}</h3>
      <p>{children}</p>
    </section>
  )
}
