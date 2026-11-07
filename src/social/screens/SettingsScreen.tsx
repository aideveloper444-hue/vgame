import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { adsAvailable, openAdPrivacyOptions } from '@/lib/ads'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { BackButton } from '@/social/components/ui'

const APP_VERSION = '1.1'

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-surface-3'}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function SettingsScreen() {
  const settings = usePlayerStore((s) => s.settings)
  const updateSettings = usePlayerStore((s) => s.updateSettings)
  const profile = usePlayerStore((s) => s.profile)
  const setName = usePlayerStore((s) => s.setName)
  const blocked = useFriendsStore((s) => s.blocked)
  const unblock = useFriendsStore((s) => s.unblock)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:px-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <section className="mt-6 rounded-2xl border border-border-soft bg-surface-1 p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Display Name</label>
        <input
          value={profile.name}
          onChange={(e) => setName(e.target.value.slice(0, 16))}
          onBlur={(e) => !e.target.value.trim() && setName('Player')}
          maxLength={16}
          className="mt-2 w-full rounded-xl bg-surface-2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/50"
        />
      </section>

      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sound Effects</span>
          <Toggle on={settings.soundOn} onToggle={() => updateSettings({ soundOn: !settings.soundOn })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Music</span>
          <Toggle on={settings.musicOn} onToggle={() => updateSettings({ musicOn: !settings.musicOn })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Message &amp; invite sounds</span>
          <Toggle on={settings.notificationsOn} onToggle={() => updateSettings({ notificationsOn: !settings.notificationsOn })} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border-soft bg-surface-1 p-4">
        <h2 className="text-sm font-bold">Blocked players</h2>
        {blocked.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">You haven't blocked anyone.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{b.name}</span>
                <button type="button" onClick={() => unblock(b.id)} className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-white">
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface-1 p-4">
        <Link to="/privacy" className="flex items-center justify-between text-sm font-medium">
          Privacy policy <ChevronRight size={16} className="text-slate-500" />
        </Link>
        {adsAvailable && (
          <button type="button" onClick={() => void openAdPrivacyOptions()} className="flex items-center justify-between text-left text-sm font-medium">
            Ad privacy choices <ChevronRight size={16} className="text-slate-500" />
          </button>
        )}
        <p className="text-xs text-slate-500">Version {APP_VERSION}</p>
      </section>

      <section className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
        <h2 className="text-sm font-bold text-rose-200">Delete all my data</h2>
        <p className="mt-1 text-xs text-slate-400">Removes your profile, friends, chats and progress from this phone and gives you a new friend code. This can't be undone.</p>
        <button
          type="button"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true)
            try {
              localStorage.clear()
            } catch {
              /* ignore */
            }
            window.location.replace('/')
          }}
          className="mt-3 w-full rounded-xl bg-rose-500/90 py-2.5 text-sm font-bold text-white"
        >
          {confirmDelete ? 'Tap again to delete everything' : 'Delete all my data'}
        </button>
        {confirmDelete && (
          <button type="button" onClick={() => setConfirmDelete(false)} className="mt-2 w-full py-1.5 text-xs font-bold text-slate-400">
            Cancel
          </button>
        )}
      </section>
    </div>
  )
}
