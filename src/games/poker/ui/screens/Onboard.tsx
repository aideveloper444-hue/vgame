import { useState } from 'react'
import { Check } from 'lucide-react'
import { Avatar, CardBack, Logo, PlayingCard, fmt, toast } from '../kit'
import { CoinIcon } from '../icons'
import { PORTRAIT_KEYS } from '../../data/players'
import { useNav } from '../../state/nav'
import { STARTER_POINTS as STARTER, useProfile, useRpc } from '../../state/profileStore'
import { openPractice } from '../../state/tableStore'


const RANKINGS: [string, string[]][] = [
  ['Royal Flush', ['As', 'Ks', 'Qs', 'Js', 'Ts']],
  ['Straight Flush', ['9h', '8h', '7h', '6h', '5h']],
  ['Four of a Kind', ['Qc', 'Qd', 'Qh', 'Qs', '4d']],
  ['Full House', ['Kh', 'Kd', 'Kc', '7s', '7h']],
  ['Flush', ['Ad', 'Jd', '8d', '5d', '2d']],
  ['Straight', ['Tc', '9d', '8h', '7s', '6c']],
  ['Three of a Kind', ['7c', '7d', '7h', 'Ks', '2d']],
  ['Two Pair', ['Jh', 'Jc', '4d', '4s', 'Ac']],
  ['One Pair', ['Th', 'Td', 'As', '8c', '4h']],
  ['High Card', ['Ah', 'Qd', '9s', '6c', '3h']],
]

/** First-run journey: eligibility → avatar → tutorial → free starter points → first hand. */
export default function Onboard() {
  const p = useProfile()
  const patchMe = useRpc((s) => s.patchMe)
  const reset = useNav((s) => s.reset)
  const go = useNav((s) => s.go)
  const [step, setStep] = useState(p?.ageConfirmedAt ? 1 : 0)
  const [adult, setAdult] = useState(false)
  const [slide, setSlide] = useState(0)
  if (!p) return null

  const finish = async (playNow: boolean) => {
    const err = await patchMe({ tutorialDone: true })
    if (err) return toast(err, 'bad')
    reset('home')
    if (playNow) {
      openPractice()
      go('table')
    }
  }

  return (
    <div className="rpc-screen px-6 pb-10">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(80% 40% at 50% 10%, rgba(255,190,70,.16), transparent 70%)' }} />
      <div className="relative mx-auto flex min-h-full max-w-[380px] flex-col items-center pt-8">
        <div className="mb-5 flex gap-2" aria-label={`Step ${step + 1} of 4`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 w-10 rounded-full" style={{ background: i <= step ? 'var(--gold-fill)' : 'rgba(255,255,255,.15)' }} />
          ))}
        </div>

        {step === 0 && (
          <div className="rpc-enter flex w-full flex-col items-center text-center">
            <Logo size={0.75} tagline={false} />
            <h2 className="rpc-display mt-6 text-[1.5em] text-white">Before you sit down</h2>
            <p className="rpc-muted mt-2 text-[0.98em] leading-relaxed">Royal Poker Club is a social game for adults. Points are free, can’t be bought, sent to others or cashed out, and have no money value.</p>
            <label className="dark-frame mt-6 flex w-full items-start gap-3 rounded-2xl p-4 text-left text-[0.98em]">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#e9b33a]" />I am 18 or older, allowed to play social games where I live, and I accept the Terms and Privacy Policy.
            </label>
            <button
              disabled={!adult}
              className="btn btn-gold mt-6 h-14 w-full text-[1.35em]"
              onClick={async () => {
                const err = await patchMe({ ageConfirmed: true })
                if (err) toast(err, 'bad')
                else setStep(1)
              }}
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="rpc-enter flex w-full flex-col items-center text-center">
            <h2 className="rpc-display gold-text text-[1.7em]">Choose your avatar</h2>
            <Avatar avatar={p.avatar} size={120} className="mt-5" />
            <label className="rpc-field mt-5 w-full">
              <span className="rpc-muted text-[0.9em]">Name</span>
              <input
                defaultValue={p.name}
                maxLength={14}
                aria-label="Display name"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v === p.name) return
                  if (/^[\p{L}\p{N}_.]{3,14}$/u.test(v)) void patchMe({ handle: v }).then((err) => err && toast(err, 'bad'))
                  else toast('Names are 3–14 letters or numbers', 'bad')
                }}
              />
            </label>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {PORTRAIT_KEYS.map((k) => (
                <button key={k} aria-label={`Avatar ${k}`} aria-pressed={p.avatar === k} onClick={() => void patchMe({ avatar: k })} className="relative rounded-full">
                  <Avatar avatar={k} size={64} frame={p.avatar === k ? 'frame-laurel' : 'frame-gold'} glow={p.avatar === k} />
                  {p.avatar === k && (
                    <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-[#1fb83a] text-white">
                      <Check size={15} strokeWidth={3} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button className="btn btn-gold mt-7 h-14 w-full text-[1.35em]" onClick={() => setStep(2)}>
              Looks good
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="rpc-enter flex w-full flex-col items-center text-center">
            <h2 className="rpc-display gold-text text-[1.7em]">How to play</h2>
            {slide === 0 && (
              <div className="mt-4 w-full">
                <p className="rpc-muted mb-3 text-[0.95em]">Make the best five-card hand from your two cards and the five on the table. Strongest first:</p>
                <div className="flex flex-col gap-1.5">
                  {RANKINGS.map(([name, cards], i) => (
                    <div key={name} className="dark-frame flex items-center justify-between rounded-xl px-3 py-1.5">
                      <span className="rpc-display text-[0.95em] text-white">
                        <span className="mr-2 text-[#ffd96a]">{i + 1}</span>
                        {name}
                      </span>
                      <span className="flex gap-0.5">
                        {cards.map((c) => (
                          <PlayingCard key={c} card={c} width={22} />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {slide === 1 && (
              <div className="mt-5 flex w-full flex-col gap-3 text-left">
                <div className="flex justify-center gap-2">
                  <CardBack width={54} />
                  <PlayingCard card="Ah" width={54} />
                  <PlayingCard card="Kh" width={54} />
                </div>
                {[
                  ['Fold', 'Give up the hand.', 'btn-red'],
                  ['Check', 'Pass when there is nothing to pay.', 'btn-blue'],
                  ['Call', 'Match the current bet.', 'btn-blue'],
                  ['Bet / Raise', 'Put in more; others must match it.', 'btn-gold'],
                  ['All-in', 'Everything you have. Side pots keep it fair.', 'btn-gold'],
                ].map(([a, d, cls]) => (
                  <div key={a} className="flex items-center gap-3">
                    <span className={`btn ${cls} h-9 w-28 shrink-0 text-[1em]`}>{a}</span>
                    <span className="text-[0.95em] text-[#e9dcc0]">{d}</span>
                  </div>
                ))}
                <p className="rpc-muted text-[0.9em]">Each turn has a 15-second clock. If it runs out you check when you can, otherwise you fold.</p>
              </div>
            )}
            {slide === 2 && (
              <div className="mt-5 flex flex-col items-center gap-3">
                <CoinIcon size={84} />
                <p className="text-[1.02em] leading-relaxed text-[#e9dcc0]">Everyone plays with free points. Win them at the tables and in tournaments, and collect more every day from Rewards. Points can never be bought or cashed out.</p>
              </div>
            )}
            <div className="mt-6 flex w-full gap-3">
              {slide > 0 && (
                <button className="btn btn-dark h-13 flex-1 py-3 text-[1.15em]" onClick={() => setSlide((s) => s - 1)}>
                  Back
                </button>
              )}
              <button className="btn btn-gold flex-1 py-3 text-[1.25em]" onClick={() => (slide < 2 ? setSlide((s) => s + 1) : setStep(3))}>
                {slide < 2 ? 'Next' : 'Got it'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rpc-enter flex w-full flex-col items-center text-center">
            <h2 className="rpc-display gold-text text-[1.8em]">Welcome, {p.name}!</h2>
            <div className="rpc-pop mt-6 grid h-40 w-40 place-items-center rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,200,80,.35), transparent 70%)' }}>
              <CoinIcon size={110} />
            </div>
            <p className="rpc-display mt-2 text-[2.4em] text-white">{fmt(STARTER)}</p>
            <p className="rpc-muted">free starter points are in your account</p>
            <button className="btn btn-green rpc-shine mt-7 h-14 w-full text-[1.35em]" onClick={() => void finish(true)}>
              Play my first hand
            </button>
            <button className="rpc-display mt-4 text-[1.05em] text-[#ffd96a]" onClick={() => void finish(false)}>
              Go to the lobby
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
