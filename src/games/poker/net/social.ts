import { SocialLogin } from '@capgo/capacitor-social-login'
import type { ServerConfig } from '../state/profileStore'

/*
 * Google / Apple / Facebook sign-in. The plugin returns the provider's token; the club server verifies it
 * with the provider before creating or opening the account. Needs the client ids below at build time and
 * the matching ids/secrets on the server.
 */

export type Provider = 'google' | 'facebook' | 'apple'
const env = import.meta.env as Record<string, string | undefined>
const IDS: Record<Provider, string | undefined> = { google: env.VITE_GOOGLE_WEB_CLIENT_ID, apple: env.VITE_APPLE_CLIENT_ID, facebook: env.VITE_FACEBOOK_APP_ID }

export const socialReady = (p: Provider, cfg: ServerConfig | null) => !!IDS[p] && !!cfg?.social[p]

let initialized = false
export async function socialToken(provider: Provider): Promise<string> {
  if (!initialized) {
    await SocialLogin.initialize({
      ...(IDS.google ? { google: { webClientId: IDS.google } } : {}),
      ...(IDS.apple ? { apple: { clientId: IDS.apple } } : {}),
      ...(IDS.facebook ? { facebook: { appId: IDS.facebook } } : {}),
    } as never)
    initialized = true
  }
  const res = (await SocialLogin.login({ provider, options: provider === 'facebook' ? { permissions: ['email', 'public_profile', 'user_friends'] } : {} } as never)) as { result: { idToken?: string | null; accessToken?: { token: string } | null } }
  const token = provider === 'facebook' ? res.result.accessToken?.token : res.result.idToken
  if (!token) throw new Error('Sign-in was cancelled')
  return token
}
