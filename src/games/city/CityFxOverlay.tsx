import { MapPin } from 'lucide-react'
import { tileArtUrl } from './cityTileArt'
import type { LandingToast, SoldFx, TurnBanner } from './useCityFx'

export function LandingToastView({ toast, top }: { toast: LandingToast; top: number }) {
  return (
    <div
      key={toast.id}
      className="hud-glass-strong pointer-events-none absolute left-1/2 z-30 flex items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-4"
      style={{ top, borderColor: toast.color, boxShadow: `0 0 24px ${toast.color}66`, animation: 'city-toast 3.2s ease-out forwards' }}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: toast.color }}>
        <MapPin size={15} className="text-white" />
      </span>
      <span className="text-[12px] font-black uppercase tracking-wide text-white sm:text-[13px]">
        <span style={{ color: toast.color }}>{toast.playerName}</span> landed on {toast.tileName}
      </span>
    </div>
  )
}

export function SoldView({ fx }: { fx: SoldFx }) {
  return (
    <div key={fx.id} className="pointer-events-none absolute left-1/2 top-[44%] z-30 flex flex-col items-center" style={{ animation: 'city-sold 2.2s ease-out forwards' }}>
      <div className="relative">
        <img src={tileArtUrl(fx.tile)} alt="" className="w-[120px] rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.9)] ring-4" style={{ ['--tw-ring-color' as string]: fx.color }} />
        <span
          className="absolute -right-8 top-6 rotate-[-14deg] rounded-lg px-3 py-1 text-[26px] font-black tracking-wider text-white shadow-xl ring-2 ring-white"
          style={{ background: 'linear-gradient(to bottom, #ef4444, #b91c1c)', textShadow: '0 2px 0 rgba(0,0,0,0.3)' }}
        >
          SOLD!
        </span>
      </div>
      <p className="mt-2 rounded-full bg-black/60 px-3 py-1 text-[12px] font-black uppercase tracking-wide text-white">
        <span style={{ color: fx.color }}>{fx.playerName}</span> bought {fx.tile.name}
      </p>
    </div>
  )
}

export function TurnBannerView({ banner }: { banner: TurnBanner }) {
  return (
    <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[30%] z-30 flex justify-center">
      <p
        className={`font-black uppercase italic text-white ${banner.mine ? 'text-[44px] sm:text-[64px]' : 'text-[26px] sm:text-[34px]'}`}
        style={{
          animation: 'city-banner 1.7s ease-out forwards',
          textShadow: `0 0 24px ${banner.color}, 0 0 60px ${banner.color}aa, 0 4px 0 rgba(0,0,0,0.4)`,
        }}
      >
        {banner.text}
      </p>
    </div>
  )
}
