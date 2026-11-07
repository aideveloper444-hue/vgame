/*
 * Wildbound game content: animals, abilities, biomes, obstacles, power-ups. Pure data (no images or 3D),
 * shared by the simulation, its tests and the UI.
 */

export type AnimalId = 'sonic' | 'leo' | 'raja' | 'shadow' | 'jax' | 'arctic' | 'bruno' | 'titan' | 'koda' | 'snow'

export type AbilityKind = 'boost' | 'roar' | 'leap' | 'stealth' | 'dodge' | 'frost' | 'smash' | 'charge' | 'roll' | 'cliff'

export interface Ability {
  kind: AbilityKind
  name: string
  /** card line, e.g. "Run faster" */
  short: string
  /** detail line on the character screen */
  desc: string
  durationMs: number
  cooldownMs: number
}

export interface Trait {
  name: string
  desc: string
  icon: 'ability' | 'magnet' | 'loyal' | 'shield' | 'coins' | 'gems' | 'xp' | 'speed'
}

export interface AnimalDef {
  id: AnimalId
  name: string
  species: string
  free: boolean
  /** gems to unlock in the character screen (never coins) */
  gemPrice: number
  blurb: string
  ability: Ability
  /** two passives shown with the ability on the character screen */
  traits: [Trait, Trait]
  /** 1-5 bars on the stats panel */
  stats: { speed: number; stamina: number; defense: number }
}

const CD = 30000

export const ANIMALS: AnimalDef[] = [
  {
    id: 'sonic', name: 'Sonic', species: 'Rottweiler', free: true, gemPrice: 0,
    blurb: 'A loyal and fearless runner, Sonic never gives up!',
    ability: { kind: 'boost', name: 'Speed Boost', short: 'Run faster', desc: 'Run faster, never give up!', durationMs: 5000, cooldownMs: CD },
    traits: [
      { name: 'Coin Magnet', desc: 'Attracts coins & gems', icon: 'magnet' },
      { name: 'Loyal Companion', desc: 'Extra life once per run', icon: 'loyal' },
    ],
    stats: { speed: 4, stamina: 4, defense: 3 },
  },
  {
    id: 'leo', name: 'Leo', species: 'Lion', free: false, gemPrice: 499,
    blurb: 'King of the trail. One roar clears the way ahead.',
    ability: { kind: 'roar', name: 'Power Roar', short: 'Knock obstacles', desc: 'Knocks every obstacle within 40 m off the trail', durationMs: 1200, cooldownMs: CD },
    traits: [
      { name: 'Royal Mane', desc: 'Starts every run with a shield', icon: 'shield' },
      { name: 'Pride Bonus', desc: '+10% coins from every run', icon: 'coins' },
    ],
    stats: { speed: 3, stamina: 5, defense: 4 },
  },
  {
    id: 'raja', name: 'Raja', species: 'Tiger', free: false, gemPrice: 499,
    blurb: 'Raw power on four legs. Clears what others go around.',
    ability: { kind: 'leap', name: 'Super Leap', short: 'Jump higher', desc: 'Huge jumps that clear rocks, ruins and boulders', durationMs: 8000, cooldownMs: CD },
    traits: [
      { name: 'Striped Hunter', desc: 'Gems appear more often', icon: 'gems' },
      { name: 'Power Legs', desc: 'Longer jumps', icon: 'speed' },
    ],
    stats: { speed: 4, stamina: 3, defense: 4 },
  },
  {
    id: 'shadow', name: 'Shadow', species: 'Panther', free: false, gemPrice: 499,
    blurb: 'Silent and unseen. Slips straight through danger.',
    ability: { kind: 'stealth', name: 'Stealth Dash', short: 'Run invisible', desc: 'Turns invisible and passes through every obstacle', durationMs: 4000, cooldownMs: CD },
    traits: [
      { name: 'Night Eyes', desc: 'Obstacles show warning outlines', icon: 'ability' },
      { name: 'Quick Paws', desc: 'Faster lane changes', icon: 'speed' },
    ],
    stats: { speed: 5, stamina: 3, defense: 2 },
  },
  {
    id: 'jax', name: 'Jax', species: 'Jaguar', free: false, gemPrice: 499,
    blurb: 'Reflexes like lightning. Traps never see him coming.',
    ability: { kind: 'dodge', name: 'Rapid Dodge', short: 'Avoid traps', desc: 'Automatically dodges into the safe lane', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Spotted Luck', desc: '+10% gems from pickups', icon: 'gems' },
      { name: 'Agile', desc: 'Faster lane changes', icon: 'speed' },
    ],
    stats: { speed: 5, stamina: 3, defense: 3 },
  },
  {
    id: 'arctic', name: 'Arctic', species: 'Wolf', free: false, gemPrice: 499,
    blurb: 'Born in the snow. Leaves a trail of frost behind.',
    ability: { kind: 'frost', name: 'Frost Sprint', short: 'Freeze obstacles', desc: 'Freezes obstacles ahead so they shatter on contact', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Pack Leader', desc: '+10% XP from every run', icon: 'xp' },
      { name: 'Cold Blood', desc: 'Power-ups last longer', icon: 'ability' },
    ],
    stats: { speed: 4, stamina: 4, defense: 3 },
  },
  {
    id: 'bruno', name: 'Bruno', species: 'Gorilla', free: false, gemPrice: 499,
    blurb: 'Raw strength. Barriers are just suggestions.',
    ability: { kind: 'smash', name: 'Obstacle Smash', short: 'Break barriers', desc: 'Smashes through barriers, logs, roots and ruins', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Thick Hide', desc: 'Shields last longer', icon: 'shield' },
      { name: 'Jungle King', desc: '+10% coins from every run', icon: 'coins' },
    ],
    stats: { speed: 3, stamina: 4, defense: 5 },
  },
  {
    id: 'titan', name: 'Titan', species: 'Elephant', free: false, gemPrice: 499,
    blurb: 'Unstoppable once he gets going.',
    ability: { kind: 'charge', name: 'Heavy Charge', short: 'Push obstacles', desc: 'Charges forward pushing obstacles aside', durationMs: 5000, cooldownMs: 32000 },
    traits: [
      { name: 'Iron Skin', desc: 'Starts every run with a shield', icon: 'shield' },
      { name: 'Long Memory', desc: '+10% XP from every run', icon: 'xp' },
    ],
    stats: { speed: 2, stamina: 5, defense: 5 },
  },
  {
    id: 'koda', name: 'Koda', species: 'Red Panda', free: false, gemPrice: 499,
    blurb: 'Small, quick and impossible to catch.',
    ability: { kind: 'roll', name: 'Acrobat Roll', short: 'Roll faster', desc: 'Rolls straight through anything low or in the way', durationMs: 6000, cooldownMs: 28000 },
    traits: [
      { name: 'Light Feet', desc: 'Faster rolls and slides', icon: 'speed' },
      { name: 'Treasure Nose', desc: 'Gems appear more often', icon: 'gems' },
    ],
    stats: { speed: 4, stamina: 4, defense: 2 },
  },
  {
    id: 'snow', name: 'Snow', species: 'Snow Leopard', free: false, gemPrice: 499,
    blurb: 'At home on cliffs. Gaps are nothing.',
    ability: { kind: 'cliff', name: 'Cliff Leap', short: 'Longer jump', desc: 'Long leaps that carry over gaps and tall obstacles', durationMs: 8000, cooldownMs: CD },
    traits: [
      { name: 'Mountain Born', desc: 'Longer jumps', icon: 'speed' },
      { name: 'Ghost of Peaks', desc: '+10% gems from pickups', icon: 'gems' },
    ],
    stats: { speed: 4, stamina: 3, defense: 3 },
  },
]

export const getAnimal = (id: string | null | undefined): AnimalDef => ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]

// ---------------------------------------------------------------- world

export type BiomeId =
  | 'forest' | 'waterfall' | 'hills' | 'river' | 'ruins' | 'jungle' | 'moonlit' | 'bamboo' | 'pine' | 'autumn' | 'snow'
  | 'savannah' | 'desert' | 'canyon' | 'swamp' | 'volcanic' | 'coast' | 'blossom' | 'ice' | 'birch'
  | 'flower' | 'mossy' | 'giantroot' | 'mist' | 'redwood' | 'fern' | 'baobab' | 'grassland' | 'mangrove' | 'jacaranda' | 'cedar' | 'lakeside' | 'temple' | 'railway' | 'cliffside' | 'glow' | 'beach' | 'thaw' | 'deadwood' | 'lagoon'
export interface BiomeDef {
  id: BiomeId
  name: string
  fog: string
}
/** Environment kits: each has its own scenery, trail surface, light, fog and obstacle mix. Zones are built from them. */
export const BIOMES: BiomeDef[] = [
  { id: 'forest', name: 'Tropical Rainforest', fog: '#1f2e1f' },
  { id: 'waterfall', name: 'Waterfall Forest', fog: '#41545a' },
  { id: 'hills', name: 'Mountain Forest', fog: '#4a5560' },
  { id: 'river', name: 'Wooden River Crossing', fog: '#2c4446' },
  { id: 'ruins', name: 'Ancient Ruins Forest', fog: '#3c3a2c' },
  { id: 'jungle', name: 'Dark Dense Jungle', fog: '#172818' },
  { id: 'moonlit', name: 'Moonlit Forest', fog: '#1a2436' },
  { id: 'bamboo', name: 'Bamboo Forest', fog: '#33452c' },
  { id: 'pine', name: 'Pine Forest', fog: '#3b4a48' },
  { id: 'autumn', name: 'Autumn Forest', fog: '#5a4630' },
  { id: 'snow', name: 'Snow Forest', fog: '#a8b6c4' },
  { id: 'savannah', name: 'Savannah', fog: '#b49a6a' },
  { id: 'desert', name: 'Desert Oasis', fog: '#c8a878' },
  { id: 'canyon', name: 'Red-Rock Canyon', fog: '#8a5a40' },
  { id: 'swamp', name: 'Swamp & Mangrove', fog: '#2e3a28' },
  { id: 'volcanic', name: 'Volcanic Wilds', fog: '#2a1e1c' },
  { id: 'coast', name: 'Tropical Coast', fog: '#8fb8c0' },
  { id: 'blossom', name: 'Blossom Valley', fog: '#c8a8b8' },
  { id: 'ice', name: 'Frozen Wilds', fog: '#9fb8cc' },
  { id: 'birch', name: 'Birch Woodland', fog: '#8a9a88' },
  { id: 'flower', name: 'Tropical Flower Forest', fog: '#2a3a22' },
  { id: 'mossy', name: 'Ancient Moss Forest', fog: '#22321f' },
  { id: 'giantroot', name: 'Giant Root Forest', fog: '#1c2a18' },
  { id: 'mist', name: 'Cloud Forest', fog: '#7c8c84' },
  { id: 'redwood', name: 'Redwood Forest', fog: '#3a3428' },
  { id: 'fern', name: 'Giant Fern Valley', fog: '#2a3c22' },
  { id: 'baobab', name: 'African Woodland', fog: '#b09a6a' },
  { id: 'grassland', name: 'Golden Grasslands', fog: '#c0a870' },
  { id: 'mangrove', name: 'Mangrove Wilderness', fog: '#26342a' },
  { id: 'jacaranda', name: 'Purple Blossom Valley', fog: '#a898b8' },
  { id: 'cedar', name: 'Dark Cedar Forest', fog: '#1e2a26' },
  { id: 'lakeside', name: 'Foggy Lakeside', fog: '#7f9496' },
  { id: 'temple', name: 'Ancient Temple Jungle', fog: '#3a3828' },
  { id: 'railway', name: 'Abandoned Railway Forest', fog: '#3a3a2c' },
  { id: 'cliffside', name: 'Coastal Cliffs', fog: '#8aa8b0' },
  { id: 'glow', name: 'Bioluminescent Jungle', fog: '#0e1830' },
  { id: 'beach', name: 'Hidden Beach', fog: '#a8c8cc' },
  { id: 'thaw', name: 'Melting Snow Forest', fog: '#8a9ca4' },
  { id: 'deadwood', name: 'Storm-Blasted Wilds', fog: '#4a4844' },
  { id: 'lagoon', name: 'Coral Lagoon', fog: '#8ac8c8' },
]
/** the newer zone kits borrow the closest original kit's look until they get their own */
export const KIT_BASE: Partial<Record<BiomeId, BiomeId>> = {
  flower: 'forest', mossy: 'forest', giantroot: 'jungle', mist: 'waterfall', redwood: 'pine', fern: 'jungle', baobab: 'savannah', grassland: 'savannah',
  mangrove: 'swamp', jacaranda: 'blossom', cedar: 'pine', lakeside: 'river', temple: 'ruins', railway: 'forest', cliffside: 'coast', glow: 'moonlit',
  beach: 'coast', thaw: 'snow', deadwood: 'hills', lagoon: 'coast',
}
export const BIOME_NAME = Object.fromEntries(BIOMES.map((b) => [b.id, b.name])) as Record<BiomeId, string>
export const getBiome = (id: BiomeId) => BIOMES.find((b) => b.id === id)!
/** Time of day and weather of a zone. */
export type Variant = 'day' | 'golden' | 'mist' | 'rain' | 'dusk' | 'dawn' | 'night' | 'storm' | 'snowfall'
export const VARIANTS: Variant[] = ['day', 'golden', 'mist', 'rain', 'dusk', 'dawn', 'night', 'storm', 'snowfall']
/** Per-zone dressing on top of the kit: bigger trees, flowers, roots, vines, ferns, rocks, glow, moss, jungle, rail line, thaw. */
export type Flavor = '' | 'giant' | 'flower' | 'roots' | 'vines' | 'ferns' | 'rocks' | 'glow' | 'moss' | 'jungle' | 'rail' | 'thaw'

// ---------------------------------------------------------------- the 100 zones (40,000 m world plan)

export const ZONE_LEN = 400
export const ZONE_COUNT = 100
export const WORLD_LEN = ZONE_LEN * ZONE_COUNT
export interface ZoneDef {
  /** 1..100 */
  n: number
  name: string
  kit: BiomeId
  variant: Variant
  flavor: Flavor
  from: number
  to: number
}
const ZONE_ROWS: [string, BiomeId, Variant, Flavor?][] = [
  ['Deep Amazon Rainforest', 'jungle', 'day'],
  ['Tropical Waterfall Forest', 'waterfall', 'day'],
  ['Giant Ancient Trees', 'giantroot', 'golden'],
  ['Dense Bamboo Jungle', 'bamboo', 'day'],
  ['Misty Rainforest', 'mist', 'mist'],
  ['Riverbank Wilderness', 'river', 'day'],
  ['Rocky Waterfall Trail', 'waterfall', 'golden', 'rocks'],
  ['Tropical Flower Forest', 'flower', 'day'],
  ['Monsoon Jungle', 'jungle', 'rain'],
  ['Hidden Jungle Valley', 'hills', 'golden'],
  ['Emerald River Forest', 'river', 'golden'],
  ['Giant Root Forest', 'giantroot', 'dusk', 'roots'],
  ['Jungle Canyon', 'canyon', 'day', 'jungle'],
  ['Twin Waterfalls', 'waterfall', 'mist'],
  ['Tropical Night Forest', 'glow', 'night'],
  ['Golden Sunrise Jungle', 'forest', 'dawn'],
  ['Swamp Wilderness', 'swamp', 'mist'],
  ['Floating Vegetation Forest', 'swamp', 'day', 'flower'],
  ['Hanging Vine Jungle', 'jungle', 'golden', 'vines'],
  ['Thunderstorm Rainforest', 'forest', 'storm'],
  ['Ancient Moss Forest', 'mossy', 'mist'],
  ['Crystal-Clear River Forest', 'lakeside', 'day'],
  ['Mountain Jungle', 'hills', 'day', 'jungle'],
  ['Waterfall Cave Entrance', 'waterfall', 'dusk'],
  ['Hidden Waterfall Kingdom', 'waterfall', 'golden', 'flower'],
  ['Autumn Woodland', 'autumn', 'day'],
  ['Orange-Leaf Forest', 'autumn', 'golden'],
  ['Red-Rock Wilderness', 'canyon', 'dusk'],
  ['Foggy Pine Forest', 'pine', 'mist'],
  ['Wild Mountain River', 'river', 'dawn', 'rocks'],
  ['Tall Grass Savannah', 'savannah', 'day'],
  ['African Woodland', 'baobab', 'golden'],
  ['Rocky Lion Territory', 'savannah', 'dusk', 'rocks'],
  ['Golden Grasslands', 'grassland', 'golden'],
  ['Desert Oasis', 'desert', 'day', 'flower'],
  ['Sandstone Canyon', 'canyon', 'golden'],
  ['Palm Forest', 'coast', 'day', 'giant'],
  ['Tropical Coastal Jungle', 'coast', 'golden', 'jungle'],
  ['Mangrove Wilderness', 'mangrove', 'day'],
  ['Flooded Rainforest', 'swamp', 'rain', 'jungle'],
  ['Himalayan Foothill Forest', 'cedar', 'dawn'],
  ['Cloud Forest', 'mist', 'mist', 'moss'],
  ['Alpine Pine Forest', 'pine', 'day'],
  ['Mountain Waterfall', 'waterfall', 'day', 'rocks'],
  ['Rocky Snowline', 'snow', 'day', 'rocks'],
  ['Snow-Covered Forest', 'snow', 'day'],
  ['Frozen River', 'ice', 'day'],
  ['Ice Cave Wilderness', 'ice', 'dusk', 'rocks'],
  ['Snowstorm Mountain Pass', 'snow', 'snowfall', 'rocks'],
  ['Frozen Waterfall Kingdom', 'ice', 'golden', 'giant'],
  ['Northern Boreal Forest', 'pine', 'dusk'],
  ['Silver Birch Woodland', 'birch', 'day'],
  ['Dark Cedar Forest', 'cedar', 'mist'],
  ['Foggy Lakeside Forest', 'lakeside', 'mist'],
  ['Rocky Lake Wilderness', 'lakeside', 'golden', 'rocks'],
  ['Redwood Forest', 'redwood', 'golden'],
  ['Giant Fern Valley', 'fern', 'mist'],
  ['Prehistoric Fern Forest', 'fern', 'dusk', 'giant'],
  ['Volcanic Jungle', 'volcanic', 'dusk', 'jungle'],
  ['Lava-Rock Wilderness', 'volcanic', 'night'],
  ['Blackwater Rainforest', 'mangrove', 'dusk'],
  ['Bioluminescent Night Jungle', 'glow', 'night'],
  ['Firefly Forest', 'moonlit', 'night', 'glow'],
  ['Moonlit Waterfall', 'waterfall', 'night'],
  ['Starry Mountain Wilderness', 'hills', 'night'],
  ['Tropical Island Forest', 'coast', 'day'],
  ['Coastal Cliff Jungle', 'cliffside', 'golden'],
  ['Hidden Beach Wilderness', 'beach', 'dawn'],
  ['Coral Lagoon Forest', 'lagoon', 'day'],
  ['Tropical Cyclone Forest', 'jungle', 'storm'],
  ['Ancient Temple Jungle', 'temple', 'day'],
  ['Abandoned Railway Forest', 'railway', 'golden', 'rail'],
  ['Overgrown Bridge Wilderness', 'river', 'mist', 'vines'],
  ['Ruined Stone Pathway', 'ruins', 'golden'],
  ['Lost Civilization Valley', 'temple', 'dusk', 'giant'],
  ['Giant Waterfall Cliffs', 'waterfall', 'day', 'giant'],
  ['High-Altitude Cloud Jungle', 'mist', 'dawn'],
  ['Deep Mountain Ravine', 'canyon', 'mist', 'rocks'],
  ['Hanging Forest Bridges', 'river', 'dusk', 'giant'],
  ['Emerald Mountain Kingdom', 'hills', 'golden'],
  ['Spring Blossom Forest', 'blossom', 'day'],
  ['Cherry Blossom Valley', 'jacaranda', 'golden'],
  ['Golden Autumn Forest', 'autumn', 'dawn'],
  ['Heavy Winter Woodland', 'snow', 'snowfall'],
  ['Frozen Pine Wilderness', 'ice', 'day', 'giant'],
  ['Melting Snow River', 'thaw', 'mist'],
  ['Rain-Soaked Mountain Forest', 'cedar', 'rain'],
  ['Rainbow Waterfall Valley', 'waterfall', 'golden', 'flower'],
  ['Sunlit Tropical Paradise', 'lagoon', 'golden'],
  ['Ancient Wildwood', 'mossy', 'dusk', 'giant'],
  ['Legendary Amazon Jungle', 'jungle', 'golden', 'giant'],
  ['Giant Waterfall Basin', 'waterfall', 'mist', 'giant'],
  ['Dark Predator Territory', 'deadwood', 'night'],
  ['Dangerous River Crossings', 'river', 'storm'],
  ['Extreme Jungle Survival', 'giantroot', 'rain', 'vines'],
  ['Ancient Giant-Tree Kingdom', 'redwood', 'dawn', 'giant'],
  ['Endless Waterfall Mountains', 'waterfall', 'dawn', 'rocks'],
  ['Storm-Covered Wilderness', 'deadwood', 'storm'],
  ['The Lost Amazon', 'temple', 'mist', 'jungle'],
  ['Ultimate Wild Kingdom', 'jungle', 'golden', 'glow'],
]
export const ZONES: ZoneDef[] = ZONE_ROWS.map(([name, kit, variant, flavor = ''], i) => ({ n: i + 1, name, kit, variant, flavor, from: i * ZONE_LEN, to: (i + 1) * ZONE_LEN }))
export const zoneLabel = (z: ZoneDef) => `Zone ${String(z.n).padStart(3, '0')}`

/**
 * A new environment zone every 400 m: zone 1 is 0-400 m and zone 100 ends at 40,000 m. Past 40 km the run goes
 * on through the zones again (index keeps counting, so every boundary is still a new place).
 */
export function zoneAt(d: number): { zone: ZoneDef; index: number; lap: number } {
  const index = Math.max(0, Math.floor(d / ZONE_LEN))
  return { zone: ZONES[index % ZONE_COUNT], index, lap: Math.floor(index / ZONE_COUNT) }
}
export function biomeAt(d: number): { biome: BiomeDef; index: number; variant: Variant; zone: ZoneDef; flavor: Flavor } {
  const { zone, index } = zoneAt(d)
  return { biome: getBiome(zone.kit), index, variant: zone.variant, zone, flavor: zone.flavor }
}

// ---------------------------------------------------------------- obstacles & pickups

export type ObstacleKind = 'log' | 'roots' | 'trap' | 'rock' | 'ruin' | 'branch' | 'barrier' | 'gap' | 'boulder' | 'trolley' | 'stream' | 'rubble' | 'stalactite'
export type PickupKind = 'coin' | 'gem' | 'token' | 'magnet' | 'shield' | 'speed' | 'superjump' | 'megajump' | 'boost'
/** a hanging vine at the lip of a ravine: jump into it to swing across */
export type MarkerKind = 'vine'
export type ItemKind = ObstacleKind | PickupKind | MarkerKind

export type Escape = 'jump' | 'low' | 'lane'
/** How each obstacle can be passed: jump over, go low (slide/roll), or only by changing lane. */
export const ESCAPES: Record<ObstacleKind, Escape[]> = {
  log: ['jump'],
  roots: ['jump', 'low'],
  trap: ['jump'],
  rock: ['lane'],
  ruin: ['lane'],
  branch: ['low'],
  barrier: ['low'],
  gap: ['jump'],
  boulder: ['lane'],
  // challenge sections: a rail trolley (jump on to ride it, or go round), river water (jump), rockslide rubble
  // (jump) and cave stalactites (slide)
  trolley: ['jump', 'lane'],
  stream: ['jump'],
  rubble: ['jump'],
  stalactite: ['low'],
}
/** Obstacles that strength abilities can break. Gaps never break. */
export const BREAKABLE: Record<ObstacleKind, boolean> = { log: true, roots: true, trap: true, rock: true, ruin: true, branch: true, barrier: true, gap: false, boulder: true, trolley: false, stream: false, rubble: true, stalactite: true }
export const isObstacle = (k: ItemKind): k is ObstacleKind => k in ESCAPES

export const OBSTACLES_BY_BIOME: Record<BiomeId, ObstacleKind[]> = {
  forest: ['log', 'roots', 'branch', 'rock'],
  waterfall: ['gap', 'log', 'rock', 'branch'],
  hills: ['rock', 'boulder', 'roots', 'trap'],
  river: ['gap', 'log', 'barrier', 'rock'],
  ruins: ['ruin', 'barrier', 'trap', 'branch'],
  jungle: ['roots', 'branch', 'log', 'trap'],
  moonlit: ['log', 'rock', 'branch', 'roots'],
  bamboo: ['branch', 'barrier', 'roots', 'log'],
  pine: ['log', 'rock', 'roots', 'branch'],
  autumn: ['log', 'roots', 'branch', 'rock'],
  snow: ['rock', 'log', 'gap', 'branch'],
  savannah: ['rock', 'log', 'boulder', 'trap'],
  desert: ['rock', 'boulder', 'ruin', 'gap'],
  canyon: ['boulder', 'rock', 'gap', 'branch'],
  swamp: ['log', 'gap', 'roots', 'branch'],
  volcanic: ['boulder', 'gap', 'rock', 'trap'],
  coast: ['log', 'rock', 'gap', 'branch'],
  blossom: ['log', 'branch', 'roots', 'barrier'],
  ice: ['rock', 'gap', 'boulder', 'log'],
  birch: ['log', 'branch', 'rock', 'roots'],
  flower: ['log', 'roots', 'branch', 'barrier'],
  mossy: ['log', 'roots', 'rock', 'branch'],
  giantroot: ['roots', 'log', 'branch', 'trap'],
  mist: ['log', 'branch', 'roots', 'rock'],
  redwood: ['log', 'rock', 'roots', 'branch'],
  fern: ['roots', 'branch', 'log', 'trap'],
  baobab: ['rock', 'log', 'trap', 'boulder'],
  grassland: ['rock', 'log', 'trap', 'roots'],
  mangrove: ['gap', 'log', 'branch', 'barrier'],
  jacaranda: ['log', 'branch', 'roots', 'barrier'],
  cedar: ['log', 'rock', 'roots', 'branch'],
  lakeside: ['log', 'rock', 'gap', 'branch'],
  temple: ['ruin', 'barrier', 'trap', 'branch'],
  railway: ['log', 'barrier', 'rock', 'roots'],
  cliffside: ['rock', 'boulder', 'gap', 'branch'],
  glow: ['roots', 'branch', 'log', 'trap'],
  beach: ['log', 'rock', 'gap', 'barrier'],
  thaw: ['log', 'rock', 'gap', 'branch'],
  deadwood: ['log', 'rock', 'boulder', 'branch'],
  lagoon: ['gap', 'log', 'barrier', 'branch'],
}

export type PowerUpKind = 'magnet' | 'shield' | 'speed' | 'superjump' | 'megajump' | 'boost'
export interface PowerUpDef {
  kind: PowerUpKind
  name: string
  desc: string
  gemPrice: number
  /** base duration; upgrades add 15% per level */
  durationMs: number
}
export const POWERUPS: PowerUpDef[] = [
  { kind: 'magnet', name: 'Magnet', desc: 'Collect coins automatically', gemPrice: 100, durationMs: 10000 },
  { kind: 'shield', name: 'Shield', desc: 'Protects you for 20 sec', gemPrice: 150, durationMs: 20000 },
  { kind: 'speed', name: '2x Speed', desc: 'Double your speed', gemPrice: 200, durationMs: 6000 },
  { kind: 'superjump', name: 'Super Jump', desc: 'Jump higher', gemPrice: 150, durationMs: 10000 },
  { kind: 'megajump', name: 'Mega Jump', desc: 'Huge leaps over whole obstacle rows', gemPrice: 200, durationMs: 12000 },
  { kind: 'boost', name: 'Super Boost', desc: 'Blast through everything for 4 sec', gemPrice: 250, durationMs: 4000 },
]
export const POWER_KINDS: PowerUpKind[] = POWERUPS.map((p) => p.kind)
export const isPowerUp = (k: string): k is PowerUpKind => (POWER_KINDS as string[]).includes(k)

/** Challenge sections the generator drops into zones that suit them. */
export type SectionKind = 'rail' | 'river' | 'bridge' | 'rockslide' | 'cave' | 'vines'
export const SECTION_TEXT: Record<SectionKind, { big: string; small: string }> = {
  rail: { big: 'Railway ahead!', small: 'Jump onto the trolley and ride it' },
  river: { big: 'River crossing!', small: 'Hop the stepping stones' },
  bridge: { big: 'Broken bridge!', small: 'Watch for missing planks' },
  rockslide: { big: 'Rockslide!', small: 'Dodge the falling rocks' },
  cave: { big: 'Cave ahead', small: 'Slide under the rock spikes' },
  vines: { big: 'Vine swing!', small: 'Jump into a vine to swing the ravine – or take the log' },
}
export const powerUp = (k: PowerUpKind) => POWERUPS.find((p) => p.kind === k)!

// ---------------------------------------------------------------- surface grip

/** How the trail surface handles: ice and snow slow lane changes, mud also drags at the paws. */
export type Grip = 'firm' | 'ice' | 'snow' | 'mud'
export const GRIP: Record<Grip, { lane: number; speed: number; label: string }> = {
  firm: { lane: 1, speed: 1, label: '' },
  ice: { lane: 0.66, speed: 1.02, label: 'Icy trail – slippery turns' },
  snow: { lane: 0.82, speed: 0.97, label: 'Deep snow – heavy paws' },
  mud: { lane: 0.82, speed: 0.93, label: 'Thick mud – slows you down' },
}
const GRIP_OF: Partial<Record<BiomeId, Grip>> = { ice: 'ice', snow: 'snow', thaw: 'snow', swamp: 'mud', mangrove: 'mud' }
export const gripOf = (b: BiomeId): Grip => GRIP_OF[b] ?? 'firm'
