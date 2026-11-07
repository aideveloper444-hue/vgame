import { Check } from 'lucide-react'
import gift from '../art/gift.webp'
import { PointsPill, Progress, ScreenHeader, fmt, toast } from '../kit'
import { CoinIcon, GiftIcon } from '../icons'
import BottomNav from '../BottomNav'
import { useNav } from '../../state/nav'
import { DAILY_POINTS, MISSIONS, levelInfo, today, useProfile, useRpc } from '../../state/profileStore'

/** Free points: daily streak, missions and level-up bonuses. */
export default function Rewards() {
  const p = useProfile()
  const { claimDaily, claimMission, claimLevelBonus } = useRpc()
  const go = useNav((s) => s.go)
  const tab = useNav((s) => s.tab)
  if (!p) return null
  const claimedToday = p.daily.lastClaim > 0 && new Date(p.daily.lastClaim).toISOString().slice(0, 10) === today()
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const streakAlive = claimedToday || (p.daily.lastClaim > 0 && new Date(p.daily.lastClaim).toISOString().slice(0, 10) === yesterday)
  const nextDay = claimedToday ? p.daily.streak : streakAlive ? Math.min(7, p.daily.streak + 1) : 1
  const lv = levelInfo(p.xp)
  const progress = (id: string) => (p.missions.day === today() ? (p.missions.progress[id] ?? 0) : 0)
  const claimed = (id: string) => p.missions.day === today() && p.missions.claimed.includes(id)

  return (
    <div className="rpc-screen rpc-with-nav">
      <ScreenHeader title="Rewards" icon={<GiftIcon size={28} />} right={<PointsPill amount={p.balance} compact />} onBack={() => tab('home')} />

      {/* daily streak */}
      <div className="gold-frame relative mx-4 overflow-hidden rounded-2xl p-4">
        <img src={gift} alt="" className="absolute -right-2 -top-2 h-24 opacity-90" style={{ maskImage: 'radial-gradient(closest-side,#000 70%,transparent)' }} />
        <p className="rpc-display gold-text text-[1.6em]">Daily Bonus</p>
        <p className="rpc-muted text-[0.9em]">Come back every day: the bonus grows for 7 days. Weekends pay double.</p>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => {
            const day = i + 1
            const done = day < nextDay || (claimedToday && day === nextDay)
            const isNext = day === nextDay && !claimedToday
            return (
              <div key={day} className="flex flex-col items-center rounded-xl py-1.5" style={{ background: isNext ? 'var(--gold-fill)' : done ? 'rgba(34,197,94,.18)' : 'rgba(0,0,0,.5)', boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.4)' }}>
                <span className={`text-[0.72em] ${isNext ? 'text-[#2a1500]' : 'text-white/70'}`}>Day {day}</span>
                {done ? <Check size={18} className="text-green-400" /> : <CoinIcon size={18} />}
                <span className={`rpc-display text-[0.75em] ${isNext ? 'text-[#2a1500]' : 'text-white'}`}>{fmt((DAILY_POINTS + i * 500) / 1000)}K</span>
              </div>
            )
          })}
        </div>
        <button
          disabled={claimedToday}
          className="btn btn-gold rpc-shine mt-3 h-12 w-full text-[1.3em]"
          onClick={() => void claimDaily().then((amt) => toast(`+${fmt(amt)} free points!`, 'good'), (e: Error) => toast(e.message, 'info'))}
        >
          {claimedToday ? 'Claimed today · back tomorrow' : 'Claim'}
        </button>
      </div>

      {/* missions */}
      <h3 className="rpc-display mx-4 mt-5 text-[1.4em] text-white">Daily Missions</h3>
      <div className="mt-2 flex flex-col gap-2 px-4">
        {MISSIONS.map((m) => {
          const v = Math.min(m.goal, progress(m.id))
          const ready = v >= m.goal && !claimed(m.id)
          return (
            <div key={m.id} className="dark-frame flex items-center gap-3 rounded-2xl p-3">
              <div className="min-w-0 flex-1">
                <p className="rpc-display text-[1.1em] text-white">{m.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={v} max={m.goal} className="flex-1" />
                  <span className="text-[0.85em] text-white/70">
                    {v}/{m.goal}
                  </span>
                </div>
              </div>
              <button
                disabled={claimed(m.id)}
                className={`btn ${ready ? 'btn-green' : claimed(m.id) ? 'btn-dark' : 'btn-gold'} h-11 w-[96px] text-[1em]`}
                onClick={() => {
                  if (ready) void claimMission(m.id).then(() => toast(`+${fmt(m.reward)} points!`, 'good'), (e: Error) => toast(e.message, 'info'))
                  else if (m.id === 'tourney') go('tournament')
                  else if (m.id === 'friends') go('room')
                  else tab('poker')
                }}
              >
                {claimed(m.id) ? 'Done' : ready ? `+${fmt(m.reward / 1000)}K` : 'Go'}
              </button>
            </div>
          )
        })}
      </div>

      {/* level */}
      <div className="dark-frame mx-4 mt-4 flex items-center gap-3 rounded-2xl p-3">
        <div className="flex-1">
          <p className="rpc-display text-[1.1em] text-white">Level-up bonus</p>
          <p className="rpc-muted text-[0.85em]">5,000 points every level. You’re Lv.{lv.level}.</p>
        </div>
        <button
          disabled={lv.level <= p.levelBonusClaimed}
          className="btn btn-gold h-11 px-4"
          onClick={() => void claimLevelBonus().then((amt) => toast(`+${fmt(amt)} points!`, 'good'), (e: Error) => toast(e.message, 'info'))}
        >
          {lv.level > p.levelBonusClaimed ? 'Claim' : `Lv.${p.levelBonusClaimed + 1}`}
        </button>
      </div>
      <button className="rpc-display mx-auto mt-4 block text-[1em] text-[#ffd96a]" onClick={() => go('shop', { tab: 'chips' })}>
        More free points in the Shop →
      </button>
      <BottomNav />
    </div>
  )
}
