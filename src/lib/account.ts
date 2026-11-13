import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, setTokens, hasSession, ApiError } from '@/games/poker/net/api'
import { socialToken, type Provider } from '@/games/poker/net/social'
import { myNetId } from '@/net/identity'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

/*
 * One VIBO account for all four games, opened with Google or Facebook. It shares the game server's session with
 * Royal Poker Club (signing in here signs you in there too), records this device's friend code on the account,
 * and, for Facebook, finds your Facebook friends who also play and sends them friend requests in the hub.
 *
 * The buttons only work once the provider ids are set: VITE_GOOGLE_WEB_CLIENT_ID / VITE_FACEBOOK_APP_ID in the
 * app's .env and GOOGLE_CLIENT_IDS / FACEBOOK_APP_ID + FACEBOOK_APP_SECRET in server/.env.
 */

export type SignInProvider = Extract<Provider, 'google' | 'facebook'>

const env = import.meta.env as Record<string, string | undefined>
/** the app side of each provider is configured (the server side is checked with /v1/config) */
export const providerBuilt: Record<SignInProvider, boolean> = { google: !!env.VITE_GOOGLE_WEB_CLIENT_ID, facebook: !!env.VITE_FACEBOOK_APP_ID }

interface MeLite {
  id: string
  name: string
  kind: string
  email: string | null
}

interface AccountState {
  account: { id: string; name: string; email: string | null; provider: SignInProvider } | null
  /** what the server has switched on (null until fetched / when offline) */
  serverSocial: Record<SignInProvider, boolean> | null
  busy: SignInProvider | null
  /** friends found through Facebook on the last sync */
  facebookFound: { name: string; netId: string }[]
  lastSyncAt: number | null
  loadConfig: () => Promise<void>
  signIn: (provider: SignInProvider, ageConfirmed: boolean) => Promise<string | null>
  syncFacebookFriends: () => Promise<string | null>
  signOut: () => Promise<void>
}

const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong')

/** the Facebook token of this session (kept in memory only), for finding friends without a second sign-in */
let fbToken: string | null = null

async function addFacebookFriends(token: string, set: (p: Partial<AccountState>) => void): Promise<number> {
  const found = await api<{ name: string; netId: string }[]>('/social/facebook-friends', { body: { token } })
  const me = myNetId()
  const friends = useFriendsStore.getState()
  let added = 0
  for (const f of found) {
    if (f.netId === me || friends.friends.some((x) => x.id === f.netId)) continue
    if (friends.addByCode(f.netId).ok) added++
  }
  set({ facebookFound: found, lastSyncAt: Date.now() })
  return added
}

export const useAccount = create<AccountState>()(
  persist(
    (set, get) => ({
      account: null,
      serverSocial: null,
      busy: null,
      facebookFound: [],
      lastSyncAt: null,

      loadConfig: async () => {
        try {
          const cfg = await api<{ social: Record<SignInProvider, boolean> }>('/config', { auth: false })
          set({ serverSocial: { google: !!cfg.social.google, facebook: !!cfg.social.facebook } })
        } catch {
          set({ serverSocial: null })
        }
        // a session that expired or was revoked elsewhere
        if (get().account && !hasSession()) set({ account: null })
      },

      signIn: async (provider, ageConfirmed) => {
        if (!providerBuilt[provider] || !get().serverSocial?.[provider]) return `${provider === 'google' ? 'Google' : 'Facebook'} sign-in isn't set up yet`
        set({ busy: provider })
        try {
          const token = await socialToken(provider)
          const r = await api<{ accessToken: string; refreshToken: string; me: MeLite }>('/auth/social', {
            body: { provider, token, ageConfirmed, device: navigator.userAgent.slice(0, 80) },
            auth: false,
          })
          setTokens({ accessToken: r.accessToken, refreshToken: r.refreshToken })
          set({ account: { id: r.me.id, name: r.me.name, email: r.me.email, provider } })
          // the account knows this device's friend code, so Facebook friends can find you
          await api('/social/net-id', { body: { netId: myNetId() } }).catch(() => undefined)
          // a player who never chose a name takes the one from their account
          const player = usePlayerStore.getState()
          if (/^Player\b/i.test(player.profile.name)) player.setName(r.me.name.slice(0, 16))
          if (provider === 'facebook') {
            fbToken = token
            await addFacebookFriends(token, set).catch(() => 0)
          }
          return null
        } catch (e) {
          return errorText(e)
        } finally {
          set({ busy: null })
        }
      },

      syncFacebookFriends: async () => {
        if (get().account?.provider !== 'facebook') return 'Sign in with Facebook first'
        set({ busy: 'facebook' })
        try {
          fbToken ??= await socialToken('facebook')
          const added = await addFacebookFriends(fbToken, set)
          return added ? null : get().facebookFound.length ? 'All your Facebook friends on VIBO are already added' : 'None of your Facebook friends play VIBO yet. Invite them with your friend code!'
        } catch (e) {
          fbToken = null
          return errorText(e)
        } finally {
          set({ busy: null })
        }
      },

      signOut: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
        setTokens(null)
        fbToken = null
        set({ account: null, facebookFound: [], lastSyncAt: null })
      },
    }),
    { name: 'vibo-account', partialize: (s) => ({ account: s.account, facebookFound: s.facebookFound, lastSyncAt: s.lastSyncAt }) },
  ),
)
