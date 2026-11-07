import { BIOMES, KIT_BASE, type AnimalId, type BiomeId, type PowerUpKind } from '../engine/content'

/** All 2D art for the menus and HUD, cropped from the Wildbound reference sheets. */
const files = import.meta.glob('../art/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const art = (name: string) => files[`../art/${name}.webp`] ?? ''

export const ART = {
  logo: art('logo'),
  tagline: art('tagline'),
  paw: art('paw'),
  pawRed: art('paw_red'),
  free: art('badge_free'),
  coin: art('ic_coin'),
  gem: art('ic_gem'),
  cart: art('ic_cart'),
  settings: art('ic_settings'),
  leaderboard: art('ic_leaderboard'),
  pause: art('hud_pause'),
  hudSpeed: art('hud_speed'),
  hudMagnet: art('hud_magnet'),
  hudShield: art('hud_shield'),
  roll: art('ctl_roll'),
  jump: art('ctl_jump'),
  slide: art('ctl_slide'),
  levelup: art('levelup'),
  gameover: art('gameover_sonic'),
  eventBanner: art('event_banner'),
  eventMask: art('event_mask'),
  statSpeed: art('stat_speed'),
  statStamina: art('stat_stamina'),
  statDefense: art('stat_defense'),
  abSpeed: art('ab_speed'),
  abMagnet: art('ab_magnet'),
  abLoyal: art('ab_loyal'),
  miTrophy: art('mi_trophy'),
  miRun: art('mi_run'),
  miBolt: art('mi_bolt'),
  miStar: art('mi_star'),
}

export const cardArt = (id: AnimalId) => art(`card_${id}`)
export const headArt = (id: AnimalId) => art(`head_${id}`)
/** ability badge: Sonic's is the lightning bolt, the others have their own */
export const abilityArt = (id: AnimalId) => (id === 'sonic' ? ART.abSpeed : art(`ab_${id}`))
export const traitArt = (icon: string) => (icon === 'magnet' ? ART.abMagnet : icon === 'loyal' ? ART.abLoyal : icon === 'shield' ? ART.hudShield : icon === 'speed' ? ART.hudSpeed : icon === 'gems' ? ART.gem : icon === 'coins' ? ART.coin : ART.miStar)
export const powerArt = (k: PowerUpKind) => art(`pu_${k === 'superjump' ? 'jump' : k}`)
export const hudPowerArt = (k: PowerUpKind) => (k === 'magnet' ? ART.hudMagnet : k === 'shield' ? ART.hudShield : k === 'speed' ? ART.hudSpeed : k === 'superjump' ? art('pu_jump') : art(`pu_${k}`))
const KIT_ART: Partial<Record<BiomeId, string>> = {
  forest: 'w_forest', waterfall: 'w_waterfall', hills: 'w_hills', river: 'w_river', ruins: 'w_ruins', jungle: 'w_jungle', moonlit: 'w_moonlit',
  bamboo: 'w_bamboo', pine: 'w_pine', autumn: 'w_autumn', snow: 'w_snow',
  savannah: 'w_savannah', desert: 'w_desert', canyon: 'w_canyon', swamp: 'w_swamp', volcanic: 'w_volcanic', coast: 'w_coast', blossom: 'w_blossom', ice: 'w_ice', birch: 'w_birch',
}
/** card art for an environment kit (zones share their kit's art; the zone's own light is applied as a CSS filter) */
export const kitArt = (kit: BiomeId) => art(KIT_ART[kit] ?? KIT_ART[KIT_BASE[kit] ?? 'forest'] ?? 'w_forest') || art('w_forest')
export const worldArt = (i: number) => kitArt(BIOMES[i]?.id ?? 'forest')
export const gemPackArt = (n: number) => art(`gems_${n}`)
export const missionArt = (icon: 'trophy' | 'run' | 'bolt' | 'star') => (icon === 'trophy' ? ART.miTrophy : icon === 'run' ? ART.miRun : icon === 'bolt' ? ART.miBolt : ART.miStar)
