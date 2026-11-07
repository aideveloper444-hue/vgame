import { useState } from 'react'
import { ChevronRight, Check, Lock } from 'lucide-react'
import vipCrown from '../art/vip_crown.webp'
import gift from '../art/gift.webp'
import { Avatar, PointsPill, ScreenHeader, Sheet, Tabs, fmt, toast } from '../kit'
import BottomNav from '../BottomNav'
import { COSMETICS, FREE_GRANTS, VIP_PERKS, VIP_PRICE_INR, type Cosmetic, type CosmeticSlot } from '../../data/catalog'
import { useNav, useRoute } from '../../state/nav'
import { ADS_PER_DAY, MISSIONS, canEquip, levelInfo, shown, today, useProfile, useRpc, type RpcProfile } from '../../state/profileStore'
import { buy, restore, storeAvailable } from '../../net/purchases'
import { adsAvailable, watchRewardedAd } from '@/lib/ads'

type Tab = 'chips' | 'themes' | 'avatars' | 'vip'

/** Screen 6: the shop. Free points on "Chips"; cosmetics everywhere else. */
export default function Shop() {
  const route = useRoute()
  const p = useProfile()
  const go = useNav((s) => s.go)
  const tab = useNav((s) => s.tab)
  const [t, setT] = useState<Tab>((route.params?.tab as Tab) ?? 'chips')
  const [item, setItem] = useState<Cosmetic | null>(null)
  const [vip, setVip] = useState(false)
  if (!p) return null

  return (
    <div className="rpc-screen rpc-with-nav">
      <ScreenHeader title="Shop" right={<PointsPill amount={p.balance} onAdd={() => setT('chips')} />} />
      <div className="px-4">
        <Tabs<Tab>
          value={t}
          onChange={setT}
          options={[
            { id: 'chips', label: 'Chips' },
            { id: 'themes', label: 'Themes' },
            { id: 'avatars', label: 'Avatars' },
            { id: 'vip', label: 'VIP' },
          ]}
        />
      </div>

      <div className="mt-4 px-4">
        {t === 'chips' && <FreeChips p={p} onMissions={() => tab('rewards')} />}
        {t === 'themes' && <CosmeticGrid p={p} slots={['felt', 'cardBack', 'theme']} onPick={setItem} />}
        {t === 'avatars' && <CosmeticGrid p={p} slots={['frame']} onPick={setItem} />}
        {t === 'vip' && <VipCard p={p} onOpen={() => setVip(true)} />}
      </div>

      {/* VIP strip + offer, as in the reference */}
      {t !== 'vip' && (
        <div className="mt-4 px-4">
          <VipCard p={p} onOpen={() => setVip(true)} compact />
        </div>
      )}
      <button onClick={() => (setT('chips'), go('rewards'))} className="relative mx-4 mt-3 flex h-[78px] w-[calc(100%-2rem)] items-center overflow-hidden rounded-2xl text-left" style={{ background: 'linear-gradient(100deg,#1a2a8a 0%,#6a1a9a 45%,#c2185b 100%)', boxShadow: '0 0 0 1.5px #e9b33a, 0 0 16px rgba(233,179,58,.35)' }}>
        <span className="rpc-display z-10 pl-4 text-[1.35em] leading-tight text-[#ffe9a0]" style={{ textShadow: '0 2px 3px rgba(0,0,0,.6)' }}>
          Weekend Special
          <br />
          <span className="text-white">2x Daily Bonus</span>
        </span>
        <span className="absolute right-3 top-2 rounded-lg bg-gradient-to-b from-red-500 to-red-700 px-2.5 py-0.5 text-[0.85em] font-bold text-white">{[0, 6].includes(new Date().getDay()) ? 'Live now' : 'Sat & Sun'}</span>
        <img src={gift} alt="" className="absolute bottom-0 right-6 h-[70%]" style={{ maskImage: 'radial-gradient(closest-side,#000 75%,transparent)' }} />
      </button>

      <RestorePurchases />
      <CosmeticSheet item={item} p={p} onClose={() => setItem(null)} />
      <Sheet open={vip} onClose={() => setVip(false)} title="VIP Membership">
        <ul className="mb-4 flex flex-col gap-2">
          {VIP_PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-[#e9dcc0]">
              <Check size={18} className="text-[#ffd96a]" /> {perk}
            </li>
          ))}
        </ul>
        <p className="rpc-muted mb-3 text-[0.9em]">VIP is a cosmetic and access membership at ₹{VIP_PRICE_INR}/month through Google Play, cancel any time in Play. It never adds points or changes the cards.</p>
        {p.vip ? (
          <p className="rpc-display text-center text-[1.2em] text-green-400">VIP active until {new Date(p.vipUntil).toLocaleDateString()}</p>
        ) : (
          <BuyButton itemId="vip" label={`₹${VIP_PRICE_INR} / month`} onDone={() => setVip(false)} />
        )}
      </Sheet>
      <BottomNav />
    </div>
  )
}

function FreeChips({ p, onMissions }: { p: RpcProfile; onMissions: () => void }) {
  const { claimDaily, claimAd, claimLevelBonus } = useRpc()
  const [busy, setBusy] = useState(false)
  const claimedToday = p.daily.lastClaim > 0 && new Date(p.daily.lastClaim).toISOString().slice(0, 10) === today()
  const adsLeft = ADS_PER_DAY - (p.adGrants.day === today() ? p.adGrants.count : 0)
  const missionsReady = MISSIONS.filter((m) => (p.missions.day === today() ? (p.missions.progress[m.id] ?? 0) : 0) >= m.goal && !(p.missions.day === today() && p.missions.claimed.includes(m.id))).length
  const level = levelInfo(p.xp).level
  const levelReady = level > p.levelBonusClaimed

  const act = async (id: (typeof FREE_GRANTS)[number]['id']) => {
    setBusy(true)
    try {
      if (id === 'daily') toast(`+${fmt(await claimDaily())} free points!`, 'good')
      if (id === 'ad') {
        if (adsLeft <= 0) return toast('That’s all the bonuses for today', 'info')
        const watched = adsAvailable ? await watchRewardedAd() : true
        if (!watched) return toast('The video didn’t finish, so no points this time', 'bad')
        await claimAd()
        toast('+1,000 free points!', 'good')
      }
      if (id === 'missions') onMissions()
      if (id === 'level') toast(`+${fmt(await claimLevelBonus())} level-up bonus!`, 'good')
    } catch (e) {
      toast((e as Error).message, 'info')
    } finally {
      setBusy(false)
    }
  }

  const label = { daily: claimedToday ? 'Claimed' : 'FREE', ad: adsLeft > 0 ? `${adsAvailable ? 'Watch' : 'Claim'} (${adsLeft})` : 'Done', missions: missionsReady ? `${missionsReady} ready` : 'View', level: levelReady ? 'Claim' : `Lv.${p.levelBonusClaimed + 1}` }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {FREE_GRANTS.map((g) => (
          <div key={g.id} className="relative flex flex-col items-center rounded-2xl px-3 pb-3 pt-4" style={{ background: 'linear-gradient(180deg,#2a2016,#0d0a07)', boxShadow: '0 0 0 1px rgba(233,179,58,.45), inset 0 1px 0 rgba(255,240,200,.08)' }}>
            {g.popular && <span className="absolute -top-2 right-3 rounded-md bg-gradient-to-b from-[#ff3d4a] to-[#b30f1c] px-3 py-0.5 text-[0.82em] font-bold text-white shadow">Most Popular</span>}
            <img src={g.art} alt="" className="h-[86px] w-auto object-contain" style={{ maskImage: 'radial-gradient(closest-side,#000 78%,transparent)' }} />
            <p className="rpc-display mt-1 text-[1.6em] leading-tight text-white">{fmt(g.amount)}</p>
            <p className="rpc-muted -mt-0.5 text-[0.8em]">{g.id === 'ad' && !adsAvailable ? 'Bonus Drop' : g.title}</p>
            <button disabled={busy} className={`btn ${(g.id === 'daily' && claimedToday) || (g.id === 'ad' && adsLeft <= 0) ? 'btn-dark' : 'btn-gold'} mt-2 h-10 w-full text-[1.2em]`} onClick={() => void act(g.id)}>
              {label[g.id]}
            </button>
          </div>
        ))}
      </div>
      <p className="rpc-muted mt-3 text-center text-[0.82em]">Points are always free. They can’t be bought, sent to others or cashed out.</p>
    </>
  )
}

const SLOT_LABEL: Record<CosmeticSlot, string> = { felt: 'Table felt', cardBack: 'Card backs', theme: 'Lobby themes', frame: 'Avatar frames' }

function CosmeticGrid({ p, slots, onPick }: { p: RpcProfile; slots: CosmeticSlot[]; onPick: (c: Cosmetic) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {slots.map((slot) => (
        <div key={slot}>
          <p className="rpc-display mb-2 text-[1.15em] text-white">{SLOT_LABEL[slot]}</p>
          <div className="grid grid-cols-2 gap-3">
            {COSMETICS.filter((c) => c.slot === slot).map((c) => {
              const equipped = shown(p, slot) === c.id
              const open = canEquip(p, c.id)
              return (
                <button key={c.id} onClick={() => onPick(c)} className="relative flex flex-col items-center rounded-2xl p-3 text-center" style={{ background: 'linear-gradient(180deg,#2a2016,#0d0a07)', boxShadow: equipped ? '0 0 0 2px #ffd96a, 0 0 16px rgba(255,200,80,.45)' : '0 0 0 1px rgba(233,179,58,.45)' }}>
                  <CosmeticPreview c={c} p={p} />
                  <p className="rpc-display mt-2 text-[1.08em] text-white">{c.name}</p>
                  <span className={`btn mt-2 h-9 w-full text-[1em] ${equipped ? 'btn-green' : open ? 'btn-dark' : 'btn-gold'}`}>
                    {equipped ? 'Equipped' : open ? 'Equip' : c.unlockLevel ? (
                      <>
                        <Lock size={14} /> Lv.{c.unlockLevel}
                      </>
                    ) : c.vipOnly ? 'VIP' : `₹${c.priceInr}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function CosmeticPreview({ c, p }: { c: Cosmetic; p: RpcProfile }) {
  if (c.slot === 'frame') return <Avatar avatar={p.avatar} size={78} frame={c.id} />
  if (c.slot === 'cardBack')
    return (
      <div className="flex h-[80px] items-center">
        <CardBackPreview colors={c.colors} />
      </div>
    )
  if (c.slot === 'felt') return <div className="h-[80px] w-full rounded-[50%]" style={{ background: `radial-gradient(circle at 50% 40%, ${c.colors[0]}, ${c.colors[1]})`, boxShadow: '0 0 0 4px #d9a335, inset 0 0 20px rgba(0,0,0,.5)' }} />
  return <div className="h-[80px] w-full rounded-xl" style={{ background: `radial-gradient(90% 90% at 50% 0%, ${c.colors[1]}55, ${c.colors[0]} 70%)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)' }} />
}

function CardBackPreview({ colors }: { colors: [string, string] }) {
  const [a, b] = colors
  return <div className="pcard-back" style={{ width: 54, background: `repeating-linear-gradient(45deg, ${a} 0 4px, color-mix(in srgb, ${a} 70%, black) 4px 8px)`, boxShadow: `inset 0 0 0 3px #fff, inset 0 0 0 5px ${b}, 0 3px 8px rgba(0,0,0,.5)` }} />
}

function CosmeticSheet({ item, p, onClose }: { item: Cosmetic | null; p: RpcProfile; onClose: () => void }) {
  const { patchMe, setPreview } = useRpc()
  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const open = canEquip(p, item.id)
  const equipped = shown(p, item.slot) === item.id
  return (
    <Sheet open onClose={onClose} title={item.name}>
      <div className="flex flex-col items-center gap-3">
        <CosmeticPreview c={item} p={p} />
        <p className="text-center text-[#e9dcc0]">{item.description}</p>
        {open ? (
          <button
            disabled={equipped}
            className="btn btn-gold h-12 w-full text-[1.2em]"
            onClick={async () => {
              const err = await patchMe({ equip: { itemId: item.id } })
              if (err) return toast(err, 'bad')
              setPreview(item.slot, null)
              toast(`${item.name} equipped`, 'good')
              onClose()
            }}
          >
            {equipped ? 'Equipped' : 'Equip'}
          </button>
        ) : (
          <>
            <p className="rpc-muted text-center text-[0.9em]">
              {item.unlockLevel ? `Unlocks free at Lv.${item.unlockLevel}.` : item.vipOnly ? 'Included with VIP membership.' : `₹${item.priceInr}, a one-time purchase through Google Play.`} You can try it on first.
            </p>
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                className="btn btn-dark h-12"
                onClick={() => {
                  setPreview(item.slot, item.id)
                  toast(`Trying on ${item.name}`, 'info')
                  onClose()
                }}
              >
                Try it on
              </button>
              {item.priceInr ? (
                <BuyButton itemId={item.id} label={`₹${item.priceInr}`} onDone={onClose} />
              ) : (
                <button className="btn btn-gold h-12" onClick={() => toast(item.vipOnly ? 'Included with VIP: open the VIP tab' : `Keep playing: unlocks at Lv.${item.unlockLevel}`, 'info')}>
                  {item.unlockLevel ? `Lv.${item.unlockLevel}` : 'VIP'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

function BuyButton({ itemId, label, onDone }: { itemId: string; label: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const refreshMe = useRpc((s) => s.refreshMe)
  const purchases = useRpc((s) => s.config?.purchases)
  return (
    <button
      disabled={busy}
      className="btn btn-gold h-12 w-full"
      onClick={async () => {
        if (!storeAvailable()) return toast('Purchases are made in the Android app from Google Play', 'info')
        if (!purchases) return toast('The store isn’t open yet. Please try again later.', 'info')
        setBusy(true)
        try {
          await buy(itemId)
          await refreshMe()
          toast('Purchase complete!', 'good')
          onDone()
        } catch (e) {
          toast((e as Error).message || 'Purchase cancelled', 'info')
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <span className="rpc-spinner" /> : label}
    </button>
  )
}

export function RestorePurchases() {
  const refreshMe = useRpc((s) => s.refreshMe)
  if (!storeAvailable()) return null
  return (
    <button
      className="rpc-display mx-auto mt-3 block text-[0.95em] text-[#ffd96a]"
      onClick={async () => {
        try {
          const me = await restore()
          await refreshMe()
          toast(me ? 'Purchases restored' : 'Nothing to restore', 'good')
        } catch (e) {
          toast((e as Error).message, 'bad')
        }
      }}
    >
      Restore purchases
    </button>
  )
}

function VipCard({ p, onOpen, compact }: { p: RpcProfile; onOpen: () => void; compact?: boolean }) {
  return (
    <button onClick={onOpen} className="relative flex w-full items-center gap-2 overflow-hidden rounded-2xl p-3 text-left" style={{ background: 'linear-gradient(180deg,#1e170e,#0b0805)', boxShadow: '0 0 0 1.5px #e9b33a, 0 0 18px rgba(233,179,58,.25)' }}>
      <img src={vipCrown} alt="" className={compact ? 'h-[74px] w-auto' : 'h-[110px] w-auto'} style={{ maskImage: 'radial-gradient(closest-side,#000 75%,transparent)' }} />
      <span className="flex flex-1 flex-col">
        <span className="rpc-display text-[1.3em] text-white">VIP Membership</span>
        <span className="text-[0.98em] text-[#e9dcc0]">{p.vip ? 'Active' : 'Unlock Exclusive Benefits'}</span>
        <span className="btn btn-gold mt-2 h-10 w-32 self-end text-[1.2em]">Go VIP</span>
      </span>
      <ChevronRight className="absolute right-2 top-3 text-white/70" size={18} />
    </button>
  )
}
