import type { LucideIcon } from 'lucide-react'
import { Briefcase, Dices, Flag, Globe, Home, Lock, Shield, Swords } from 'lucide-react'

interface ActionProps {
  icon: LucideIcon
  label: string
  sub?: string
  color: string
  onClick?: () => void
  disabled?: boolean
  locked?: boolean
  primary?: boolean
  active?: boolean
  badge?: number | string
  compact?: boolean
  dense?: boolean
}

function ActionButton({ icon: Icon, label, sub, color, onClick, disabled, locked, primary, active, badge, compact, dense }: ActionProps) {
  const off = disabled && !locked
  const w = compact ? (primary ? 'w-[64px]' : 'w-[54px]') : dense ? (primary ? 'w-[96px]' : 'w-[80px]') : primary ? 'w-[108px]' : 'w-[88px]'
  const h = compact ? 'h-[58px]' : dense ? (primary ? 'h-[86px]' : 'h-[78px]') : primary ? 'h-[94px]' : 'h-[86px]'
  return (
    <button
      onClick={onClick}
      disabled={off}
      title={label}
      className={`group relative flex ${w} ${h} shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl transition-all duration-200 ${
        off ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-1 active:translate-y-0 active:scale-95'
      } ${primary && !off ? 'city-pulse' : ''}`}
      style={{
        ['--glow' as string]: `${color}aa`,
        background: `linear-gradient(170deg, ${color}${off ? '1a' : '38'}, rgba(10,14,34,0.94) 65%)`,
        border: `1.5px solid ${active ? '#ffffff' : color}`,
        boxShadow: `0 0 16px ${color}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
        backdropFilter: 'blur(12px)',
      }}
    >
      <span
        className={`flex items-center justify-center rounded-xl ${compact ? 'h-6 w-6' : primary ? 'h-10 w-10' : 'h-8 w-8'}`}
        style={{
          background: `linear-gradient(to bottom, ${color}, ${color}88)`,
          boxShadow: `0 0 12px ${color}99`,
        }}
      >
        <Icon size={compact ? 15 : primary ? 24 : 19} className="text-white drop-shadow" strokeWidth={2.4} />
      </span>
      <span className={`font-black uppercase tracking-wide text-white ${compact ? 'text-[9px]' : primary ? 'text-[14px]' : 'text-[12px]'}`}>{label}</span>
      {sub && !compact && <span className="max-w-full truncate px-1 text-[9.5px] font-semibold text-slate-300">{sub}</span>}
      {locked && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-700 text-slate-200 ring-2 ring-[#0b1230]">
          <Lock size={9} strokeWidth={3} />
        </span>
      )}
      {badge !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-[#0b1230]">
          {badge}
        </span>
      )}
    </button>
  )
}

export interface PrimaryAction {
  kind: 'roll' | 'end' | 'wait'
  sub: string
  onClick?: () => void
}

export function CityBottomBar({
  primary,
  canBuild,
  buildCount,
  onBuild,
  onAttack,
  onDefend,
  onItems,
  compact,
  dense = false,
}: {
  primary: PrimaryAction
  canBuild: boolean
  buildCount: number
  onBuild: () => void
  onAttack?: () => void
  onDefend?: () => void
  onItems?: () => void
  compact: boolean
  dense?: boolean
}) {
  const c = { compact, dense }
  return (
    <div className={`flex items-end justify-center ${compact ? 'gap-1' : dense ? 'gap-2' : 'gap-2.5'}`}>
      <ActionButton
        icon={primary.kind === 'end' ? Flag : Dices}
        label={primary.kind === 'end' ? 'End Turn' : 'Roll'}
        sub={primary.sub}
        color={primary.kind === 'end' ? '#f59e0b' : '#38bdf8'}
        onClick={primary.onClick}
        disabled={primary.kind === 'wait'}
        primary
        {...c}
      />
      <ActionButton
        icon={Home}
        label="Build"
        sub={buildCount ? `(${buildCount} Property)` : '(1 Property)'}
        color="#22c55e"
        onClick={onBuild}
        disabled={!canBuild}
        badge={buildCount || undefined}
        {...c}
      />
      <ActionButton
        icon={Swords}
        label="Attack"
        sub="(Use Power)"
        color="#ef4444"
        onClick={onAttack}
        {...c}
      />
      <ActionButton
        icon={Shield}
        label="Defend"
        sub="(Shield)"
        color="#a855f7"
        onClick={onDefend}
        {...c}
      />
      <ActionButton
        icon={Briefcase}
        label="Items"
        sub="(5)"
        color="#eab308"
        onClick={onItems}
        {...c}
      />
    </div>
  )
}

function RailButton({ icon: Icon, label, color, onClick, disabled, locked, active, badge, compact }: ActionProps) {
  const off = disabled || locked
  const size = compact ? 'h-11 w-11' : 'h-[58px] w-[58px]'
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        disabled={off}
        aria-label={label}
        title={label}
        className={`relative flex ${size} items-center justify-center rounded-full transition-all ${off ? 'cursor-not-allowed opacity-70' : 'hover:scale-110 active:scale-95'}`}
        style={{
          background: `radial-gradient(circle at 35% 28%, ${color}cc, ${color}55 50%, rgba(10,14,34,0.95) 85%)`,
          border: `1.5px solid ${active ? '#ffffff' : color}`,
          boxShadow: `0 0 ${active ? 24 : 14}px ${color}88, inset 0 1px 0 rgba(255,255,255,0.3)`,
          backdropFilter: 'blur(10px)',
        }}
      >
        <Icon size={compact ? 18 : 24} className="text-white drop-shadow" strokeWidth={2.3} />
        {locked && (
          <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-700 p-0.5 text-slate-200 ring-2 ring-[#0b1230]">
            <Lock size={9} strokeWidth={3} />
          </span>
        )}
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-[#0b1230]">
            {badge}
          </span>
        )}
      </button>
      {!compact && <span className="text-[10px] font-black uppercase tracking-wider text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{label}</span>}
    </div>
  )
}

export function CitySideActions({
  mapView,
  onMap,
  canBuild,
  buildCount,
  onBuild,
  onAttack,
  onItems,
  compact,
  horizontal = false,
}: {
  mapView: boolean
  onMap: () => void
  canBuild: boolean
  buildCount: number
  onBuild: () => void
  onAttack?: () => void
  onItems?: () => void
  compact: boolean
  horizontal?: boolean
}) {
  return (
    <div className={`flex items-center ${horizontal ? 'flex-row' : 'flex-col'} ${compact ? 'gap-2' : 'gap-3.5'}`}>
      <RailButton icon={Globe} label="Map" color="#38bdf8" onClick={onMap} active={mapView} compact={compact} />
      <RailButton icon={Home} label="Build" color="#22c55e" onClick={onBuild} disabled={!canBuild} badge={buildCount || undefined} compact={compact} />
      <RailButton icon={Swords} label="Attack" color="#ef4444" onClick={onAttack} compact={compact} />
      <RailButton icon={Briefcase} label="Items" color="#eab308" onClick={onItems} compact={compact} />
    </div>
  )
}
