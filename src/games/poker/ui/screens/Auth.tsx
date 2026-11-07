import { useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react'
import leftStrip from '../art/login_left.webp'
import rightStrip from '../art/login_right.webp'
import chipsL from '../art/login_chips_l.webp'
import chipsR from '../art/login_chips_r.webp'
import { Logo, ScreenHeader, Sheet, Tabs, toast } from '../kit'
import { useNav, useRoute } from '../../state/nav'
import { currentProfile, useRpc } from '../../state/profileStore'
import { socialReady, socialToken, type Provider } from '../../net/social'
import { SUPPORT_EMAIL } from '@/social/components/ReportSheet'

type Tab = 'login' | 'signup'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Screen 2: login / sign up, social sign-in and guest play. */
export default function Auth() {
  const route = useRoute()
  const reset = useNav((s) => s.reset)
  const { logIn, signUp, playAsGuest, socialSignIn, config } = useRpc()
  const [tab, setTab] = useState<Tab>(route.params?.tab === 'signup' ? 'signup' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [social, setSocial] = useState<Provider | null>(null)
  const [guestAsk, setGuestAsk] = useState(false)
  const [guestAdult, setGuestAdult] = useState(false)
  const [forgot, setForgot] = useState(false)

  const enter = () => {
    const p = currentProfile()
    reset(p && p.ageConfirmedAt && p.tutorialDone ? 'home' : 'onboard')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!EMAIL.test(email.trim())) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (tab === 'signup') {
      if (!/^[\p{L}\p{N}_.]{3,14}$/u.test(name.trim())) return setError('Pick a display name of 3–14 letters or numbers.')
      if (!adult) return setError('You must be 18 or older to join.')
      if (!terms) return setError('Please accept the Terms and Privacy Policy.')
    }
    setBusy(true)
    const err = tab === 'login' ? await logIn(email, password) : await signUp(name, email, password, adult)
    setBusy(false)
    if (err) return setError(err)
    toast(tab === 'login' ? 'Welcome back!' : 'Account created', 'good')
    enter()
  }

  const startSocial = async (provider: Provider) => {
    if (!socialReady(provider, config)) return setSocial(provider)
    setBusy(true)
    setError(null)
    try {
      const err = await socialSignIn(provider, await socialToken(provider))
      if (err) setError(err)
      else enter()
    } catch (e) {
      setError((e as Error).message || 'Sign-in was cancelled')
    } finally {
      setBusy(false)
    }
  }

  const guest = async () => {
    setBusy(true)
    const err = await playAsGuest()
    setBusy(false)
    setGuestAsk(false)
    if (err) setError(err)
    else enter()
  }

  return (
    <div className="rpc-screen">
      {/* curtains, lamps and chip piles from the club entrance */}
      <img src={leftStrip} alt="" className="pointer-events-none absolute left-0 top-0 h-[64%] w-auto opacity-95" style={{ maskImage: 'linear-gradient(90deg,#000 55%,transparent)' }} />
      <img src={rightStrip} alt="" className="pointer-events-none absolute right-0 top-0 h-[64%] w-auto opacity-95" style={{ maskImage: 'linear-gradient(270deg,#000 55%,transparent)' }} />
      <img src={chipsL} alt="" className="pointer-events-none absolute bottom-0 left-0 w-[24%]" style={{ maskImage: 'linear-gradient(0deg,#000 60%,transparent)' }} />
      <img src={chipsR} alt="" className="pointer-events-none absolute bottom-0 right-0 w-[24%]" style={{ maskImage: 'linear-gradient(0deg,#000 60%,transparent)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 45% at 50% 20%, rgba(255,190,70,.18), transparent 70%)' }} />

      <div className="relative">
        <div className="absolute left-0 top-0 z-10 w-full">
          <ScreenHeader title="" onBack={() => reset('splash')} />
        </div>
        <div className="flex flex-col items-center px-7 pb-8 pt-2">
          <Logo size={1.15} />

          <Tabs<Tab>
            className="mt-6 w-full max-w-[340px]"
            value={tab}
            onChange={(t) => (setTab(t), setError(null))}
            options={[
              { id: 'login', label: 'Login' },
              { id: 'signup', label: 'Sign Up' },
            ]}
          />

          <form onSubmit={submit} className="mt-5 flex w-full max-w-[340px] flex-col gap-3" noValidate>
            {tab === 'signup' && (
              <label className="rpc-field">
                <UserRound size={22} className="text-[#f2c98a]" aria-hidden />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display Name" autoComplete="nickname" maxLength={14} aria-label="Display name" />
              </label>
            )}
            <label className="rpc-field">
              <Mail size={22} className="text-[#f2c98a]" aria-hidden />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" type="email" inputMode="email" autoComplete="email" aria-label="Email address" />
              <ChevronRight size={18} className="text-white/30" aria-hidden />
            </label>
            <label className="rpc-field">
              <Lock size={22} className="text-[#f2c98a]" aria-hidden />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type={showPw ? 'text' : 'password'} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} aria-label="Password" />
              <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)} className="text-[#f5ead0]">
                {showPw ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </label>

            {tab === 'login' ? (
              <button type="button" onClick={() => setForgot(true)} className="rpc-display self-end text-[0.98em] text-white">
                Forgot Password?
              </button>
            ) : (
              <div className="flex flex-col gap-2 px-1 text-[0.92em] text-[#e9dcc0]">
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#e9b33a]" />I am 18 or older and allowed to play social games where I live.
                </label>
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#e9b33a]" />I accept the Terms and Privacy Policy. Points are free and have no cash value.
                </label>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-red-950/60 px-3 py-2 text-center text-[0.92em] text-red-200">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn btn-gold mt-1 h-[58px] text-[1.6em]">
              {busy ? <span className="rpc-spinner" /> : tab === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 flex w-full max-w-[300px] items-center gap-4">
            <div className="gold-rule flex-1" />
            <span className="rpc-display text-[1.15em]">or</span>
            <div className="gold-rule flex-1" />
          </div>

          <div className="mt-4 flex gap-6">
            <SocialButton label="Google" onClick={() => void startSocial('google')} bg="#fff">
              <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
            </SocialButton>
            <SocialButton label="Facebook" onClick={() => void startSocial('facebook')} bg="linear-gradient(180deg,#3b8cff,#1258d6)">
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
                <path fill="#fff" d="M14 8V6.2c0-.8.2-1.2 1.4-1.2H17V2h-2.6C11.3 2 10 3.5 10 6v2H7.5v3H10v11h4V11h2.7l.4-3H14Z" />
              </svg>
            </SocialButton>
            <SocialButton label="Apple" onClick={() => void startSocial('apple')} bg="#0b0b0b">
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
                <path fill="#fff" d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4Z" />
              </svg>
            </SocialButton>
          </div>

          <button onClick={() => setGuestAsk(true)} className="rpc-display mt-5 flex items-center gap-2 text-[1.2em] text-[#ffd96a]">
            <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden>
              <path fill="url(#rpcGold)" d="M8 1h14c4.4 0 8 3.6 8 8v4.5c0 4.1-3.4 7.5-7.5 7.5-2.4 0-4.5-1.1-5.9-2.9l-.6-.8h-2l-.6.8C12 19.9 9.9 21 7.5 21 3.4 21 0 17.6 0 13.5V9c0-4.4 3.6-8 8-8Z" />
              <path fill="#2a1500" d="M7 6h2v3h3v2H9v3H7v-3H4V9h3V6Zm14.5 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm3 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
            </svg>
            Guest Play
          </button>
        </div>
      </div>

      <Sheet open={!!social} onClose={() => setSocial(null)} title={`Continue with ${social ? social[0].toUpperCase() + social.slice(1) : ''}`}>
        <p className="text-[0.98em] leading-relaxed text-[#e9dcc0]">This sign-in option hasn’t been switched on for this build of the club yet. Use an email account or play as a guest; you can add an email to a guest account later in Settings.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="btn btn-dark h-12" onClick={() => (setSocial(null), setTab('signup'))}>
            Use email
          </button>
          <button className="btn btn-gold h-12" onClick={() => (setSocial(null), setGuestAsk(true))}>
            Guest Play
          </button>
        </div>
      </Sheet>

      <Sheet open={guestAsk} onClose={() => setGuestAsk(false)} title="Play as a guest">
        <label className="flex items-start gap-2.5 text-[0.95em] text-[#e9dcc0]">
          <input type="checkbox" checked={guestAdult} onChange={(e) => setGuestAdult(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#e9b33a]" />I am 18 or older, allowed to play social games where I live, and I accept the Terms and Privacy Policy.
        </label>
        <p className="rpc-muted mt-2 text-[0.85em]">Guest progress is tied to this device until you add an email in Settings.</p>
        <button disabled={!guestAdult || busy} className="btn btn-gold mt-4 h-12 w-full text-[1.2em]" onClick={() => void guest()}>
          {busy ? <span className="rpc-spinner" /> : 'Start playing'}
        </button>
      </Sheet>

      <Sheet open={forgot} onClose={() => setForgot(false)} title="Forgot your password?">
        <div className="flex flex-col gap-3 text-[0.95em] leading-relaxed text-[#e9dcc0]">
          <p>Still signed in on another device? Open Settings → Change password there.</p>
          <p>If your account uses the same email as your Google or Apple account, sign in with that button and it will open the same account.</p>
          <p>Otherwise contact support{SUPPORT_EMAIL ? ` at ${SUPPORT_EMAIL}` : ''} from the email on your account and we’ll help you back in.</p>
          {SUPPORT_EMAIL && (
            <a className="btn btn-gold h-12" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Royal Poker Club password help')}`}>
              Email support
            </a>
          )}
        </div>
      </Sheet>
    </div>
  )
}

function SocialButton({ label, onClick, bg, children }: { label: string; onClick: () => void; bg: string; children: ReactNode }) {
  return (
    <button aria-label={`Sign in with ${label}`} onClick={onClick} className="grid h-[60px] w-[60px] place-items-center rounded-full active:scale-95" style={{ background: bg, boxShadow: '0 0 0 2px rgba(233,179,58,.8), 0 0 16px rgba(233,179,58,.35)' }}>
      {children}
    </button>
  )
}
