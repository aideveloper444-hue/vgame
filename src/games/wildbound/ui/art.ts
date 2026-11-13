import { BIOMES, KIT_BASE, type AnimalId, type BiomeId } from '../engine/content'

/** The remaining 2D art: animal portraits and cards, and the environment cards (icons are vectors, see icons.tsx). */
const files = import.meta.glob('../art/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const art = (name: string) => files[`../art/${name}.webp`] ?? ''

export const cardArt = (id: AnimalId) => art(`card_${id}`)
export const headArt = (id: AnimalId) => art(`head_${id}`)
const KIT_ART: Partial<Record<BiomeId, string>> = {
  forest: 'w_forest', waterfall: 'w_waterfall', hills: 'w_hills', river: 'w_river', ruins: 'w_ruins', jungle: 'w_jungle', moonlit: 'w_moonlit',
  bamboo: 'w_bamboo', pine: 'w_pine', autumn: 'w_autumn', snow: 'w_snow',
  savannah: 'w_savannah', desert: 'w_desert', canyon: 'w_canyon', swamp: 'w_swamp', volcanic: 'w_volcanic', coast: 'w_coast', blossom: 'w_blossom', ice: 'w_ice', birch: 'w_birch',
}
/** card art for an environment kit (zones share their kit's art; the zone's own light is applied as a CSS filter) */
export const kitArt = (kit: BiomeId) => art(KIT_ART[kit] ?? KIT_ART[KIT_BASE[kit] ?? 'forest'] ?? 'w_forest') || art('w_forest')
export const worldArt = (i: number) => kitArt(BIOMES[i]?.id ?? 'forest')
