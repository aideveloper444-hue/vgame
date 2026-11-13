import { useEffect, useState } from 'react'
import { Check, Tag } from 'lucide-react'
import { POWERUPS, ROSTER, getAnimal } from '../engine/content'
import { COIN_PACKS, UPGRADE_MAX, upgradeCost, useSave } from '../state/progress'
import { PRODUCTS, charProductId, loadPrices, priceOf, purchase, restorePurchases, storeAvailable, usePrices } from '../state/shop'
import { cardArt, gemPackArt, headArt, powerArt } from './art'
import { Backdrop, Coin, Gem, Header, fmt, toast, useNav, type StoreTab } from './common'
import { haptic, sfx } from './sfx'

const TABS: { id: StoreTab; label: string }[] = [
  { id: 'characters', label: 'Characters' },
  { id: 'powerups', label: 'Power-Ups' },
  { id: 'coins', label: 'Coins' },
  { id: 'bundles', label: 'Bundles' },
]

async function buy(id: string, done: string) {
  try {
    await purchase(id)
    sfx.win()
    haptic(40)
    toast(done, 'good')
  } catch (e) {
    toast((e as Error).message, 'bad')
  }
}

export default function StoreScreen() {
  const tab = useNav((s) => s.storeTab)
  const [busy, setBusy] = useState(false)
  usePrices((s) => s.prices)
  useEffect(() => {
    void loadPrices()
  }, [])
  const setTab = (t: StoreTab) => {
    sfx.tap()
    useNav.setState({ storeTab: t })
  }
  const run = async (f: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await f()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wb-layer">
      <Backdrop dim={0.35} />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="STORE" close />
        <div className="wb-panel mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col">
          <div className="flex gap-1.5 px-2 pt-2">
            {TABS.map((t) => (
              <button key={t.id} className={`wb-tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="wb-scroll min-h-0 flex-1 p-2">
            {tab === 'characters' && <Characters run={run} />}
            {tab === 'powerups' && <PowerUps />}
            {tab === 'coins' && <Coins run={run} />}
            {tab === 'bundles' && <Bundles run={run} />}
          </div>
          {!storeAvailable() && <div className="px-3 pb-2 text-center text-[13px] text-white/60">Real-money purchases are made in the Android app through Google Play. Gem prices work everywhere.</div>}
        </div>
      </div>
    </div>
  )
}

function Characters({ run }: { run: (f: () => Promise<void>) => Promise<void> }) {
  const owned = useSave((s) => s.owned)
  const go = useNav((s) => s.go)
  const list = ROSTER.filter((a) => !a.free)
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 landscape:grid-cols-4">
        {list.map((a) => {
          const own = owned.includes(a.id)
          return (
            <div key={a.id} className="wb-card flex flex-col items-center p-1.5 pb-2">
              <div className="text-center leading-none">
                <div className="wb-title text-[22px] wb-stroke">{a.name}</div>
                <div className="text-[14px] italic wb-yellow">{a.species}</div>
              </div>
              <button className="mt-1 aspect-[4/3] w-full overflow-hidden rounded-lg" onClick={() => (sfx.tap(), go('preview', { previewId: a.id }))}>
                <img src={cardArt(a.id)} alt={a.name} className="h-full w-full object-cover object-[50%_30%]" />
              </button>
              {own ? (
                <span className="wb-btn wb-btn-green mt-2 h-9 w-[86%] text-[20px]">
                  <Check size={18} strokeWidth={4} /> Owned
                </span>
              ) : (
                <>
                  <div className="wb-title mt-1 text-[24px] wb-stroke">{priceOf(charProductId(a.id))}</div>
                  <button className="wb-btn wb-btn-gold h-9 w-[86%] text-[22px]" onClick={() => run(() => buy(charProductId(a.id), `${a.name} is yours!`))}>
                    Buy
                  </button>
                  <button
                    className="mt-1.5 flex items-center gap-1 text-[14px] text-white/85 underline-offset-2 hover:underline"
                    onClick={() => {
                      const r = useSave.getState().unlockWithGems(a.id)
                      if (r.ok) {
                        sfx.win()
                        toast(`${a.name} unlocked!`, 'good')
                      } else toast(r.reason, 'bad')
                    }}
                  >
                    or unlock for <Gem size={16} /> {a.gemPrice}
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
      <button className="mx-auto mt-3 flex items-center gap-2 text-[18px] font-bold wb-yellow wb-shadow" onClick={() => (sfx.tap(), useNav.setState({ storeTab: 'bundles' }))}>
        <Tag size={18} className="text-[#c9574a]" fill="#c9574a" /> Get 50% OFF on Character Packs!
      </button>
    </>
  )
}

function PowerUps() {
  const gems = useSave((s) => s.gems)
  const coins = useSave((s) => s.coins)
  const inventory = useSave((s) => s.inventory)
  const upgrades = useSave((s) => s.upgrades)
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 landscape:grid-cols-4">
      {POWERUPS.map((p) => {
        const lvl = upgrades[p.kind]
        const cost = upgradeCost(lvl)
        return (
          <div key={p.kind} className="wb-card flex flex-col items-center gap-1 p-2 text-center">
            <img src={powerArt(p.kind)} alt="" className="h-20 w-20 rounded-xl object-cover" />
            <div className="wb-title text-[24px] wb-yellow wb-stroke">{p.name}</div>
            <div className="min-h-[36px] text-[15px] leading-tight text-white/90">{p.desc}</div>
            <div className="text-[14px] text-white/75">
              You have <b className="text-white">{inventory[p.kind]}</b> · lasts {Math.round((p.durationMs * (1 + 0.15 * lvl)) / 1000)} s
            </div>
            <button
              className="wb-btn wb-btn-green h-10 w-[90%] text-[22px]"
              disabled={gems < p.gemPrice}
              onClick={() => {
                const r = useSave.getState().buyPowerUp(p.kind)
                if (r.ok) {
                  sfx.power()
                  toast(`+1 ${p.name}`, 'good')
                } else toast(r.reason, 'bad')
              }}
            >
              <Gem size={22} /> {p.gemPrice}
            </button>
            <div className="mt-1 flex w-full items-center gap-1">
              {Array.from({ length: UPGRADE_MAX }, (_, i) => (
                <i key={i} className="h-2 flex-1 rounded-full" style={{ background: i < lvl ? '#dcc08a' : 'rgba(255,255,255,0.15)' }} />
              ))}
            </div>
            <button
              className="wb-btn wb-btn-dark h-9 w-[90%] text-[16px]"
              disabled={lvl >= UPGRADE_MAX || coins < cost}
              onClick={() => {
                const r = useSave.getState().upgradePowerUp(p.kind)
                if (r.ok) {
                  sfx.win()
                  toast(`${p.name} upgraded to level ${lvl + 1}`, 'good')
                } else toast(r.reason, 'bad')
              }}
            >
              {lvl >= UPGRADE_MAX ? (
                'MAX LEVEL'
              ) : (
                <>
                  Upgrade <Coin size={18} /> {fmt(cost)}
                </>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Coins({ run }: { run: (f: () => Promise<void>) => Promise<void> }) {
  const gems = useSave((s) => s.gems)
  const gemPacks = PRODUCTS.filter((p) => p.consumable)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="wb-title mb-1.5 text-[22px] wb-yellow wb-stroke">Coins for gems</div>
        <div className="grid grid-cols-3 gap-2">
          {COIN_PACKS.map((p, i) => (
            <div key={i} className="wb-card flex flex-col items-center gap-1 p-2">
              <div className="flex -space-x-3">
                {Array.from({ length: i + 2 }, (_, k) => (
                  <Coin key={k} size={36} />
                ))}
              </div>
              <div className="wb-title text-[26px] wb-stroke">{fmt(p.coins)}</div>
              <button
                className="wb-btn wb-btn-green h-10 w-[90%] text-[22px]"
                disabled={gems < p.gems}
                onClick={() => {
                  const r = useSave.getState().buyCoins(i)
                  if (r.ok) {
                    sfx.coin()
                    toast(`+${fmt(p.coins)} coins`, 'good')
                  } else toast(r.reason, 'bad')
                }}
              >
                <Gem size={22} /> {p.gems}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="wb-title mb-1.5 text-[22px] wb-yellow wb-stroke">In-App Purchases</div>
        <div className="grid grid-cols-4 gap-2">
          {gemPacks.map((p) => (
            <div key={p.id} className="wb-card flex flex-col items-center gap-1 p-1.5 pb-2" style={{ boxShadow: 'inset 0 0 0 2px rgba(255,210,90,0.55), 0 4px 12px rgba(0,0,0,0.45)' }}>
              <img src={gemPackArt(p.grant.gems!)} alt="" className="h-[74px] w-full rounded-lg object-cover" />
              <div className="wb-title text-[28px] leading-none wb-stroke">{p.grant.gems}</div>
              <button className="wb-btn wb-btn-gold h-9 w-full text-[19px]" onClick={() => run(() => buy(p.id, `+${p.grant.gems} gems`))}>
                {priceOf(p.id)}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Bundles({ run }: { run: (f: () => Promise<void>) => Promise<void> }) {
  const owned = useSave((s) => s.owned)
  const packs = PRODUCTS.filter((p) => p.id.startsWith('wb_pack_'))
  return (
    <div className="flex flex-col gap-3">
      {packs.map((p) => {
        const animals = p.grant.animals!
        const all = animals.every((a) => owned.includes(a))
        const full = animals.length * 79.99
        return (
          <div key={p.id} className="wb-card flex items-center gap-3 p-3 portrait:flex-col">
            <div className="flex -space-x-4">
              {animals.map((a) => (
                <img key={a} src={headArt(a)} alt={getAnimal(a).name} className="h-[84px] w-[66px] rounded-lg object-cover ring-2 ring-[#dcc08a]" />
              ))}
            </div>
            <div className="min-w-0 flex-1 portrait:text-center">
              <div className="wb-title text-[28px] wb-yellow wb-stroke">{p.title}</div>
              <div className="text-[16px] text-white/90">{animals.map((a) => getAnimal(a).name).join(', ')}</div>
              <div className="text-[15px]">
                <s className="text-white/55">₹{full.toFixed(2)}</s> <span className="ml-1 rounded bg-[#c9574a] px-1.5 font-bold">50% OFF</span>
              </div>
            </div>
            {all ? (
              <span className="wb-btn wb-btn-green h-11 px-5 text-[20px]">
                <Check size={18} strokeWidth={4} /> Owned
              </span>
            ) : (
              <button className="wb-btn wb-btn-gold h-12 px-6 text-[24px]" onClick={() => run(() => buy(p.id, `${p.title} unlocked!`))}>
                {priceOf(p.id)}
              </button>
            )}
          </div>
        )
      })}
      <button
        className="wb-btn wb-btn-dark mx-auto h-10 px-5 text-[18px]"
        onClick={() =>
          run(async () => {
            try {
              const n = await restorePurchases()
              toast(n ? `Restored ${n} purchase${n > 1 ? 's' : ''}` : 'Nothing to restore', n ? 'good' : 'info')
            } catch (e) {
              toast((e as Error).message, 'bad')
            }
          })
        }
      >
        Restore purchases
      </button>
    </div>
  )
}
