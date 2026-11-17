/*
 * Wildbound game content: animals, abilities, biomes, obstacles, power-ups. Pure data (no images or 3D),
 * shared by the simulation, its tests and the UI.
 */

export type AnimalId = 'sonic' | 'leo' | 'raja' | 'shadow' | 'jax' | 'arctic' | 'bruno' | 'titan' | 'koda' | 'snow' | 'nova' | 'blaze' | 'zara' | 'ash' | 'stallion'

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

/** the price of unlocking any animal (Sonic the Rottweiler is free) */
export const ANIMAL_PRICE_INR = '₹99'

export interface AnimalDef {
  id: AnimalId
  name: string
  species: string
  free: boolean
  /** unused: animals are never sold for gems or coins. Only Sonic is free; every other animal is unlocked
   * with a one-time real purchase (ANIMAL_PRICE_INR, Google Play product wb_char_<id>) */
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
    id: 'leo', name: 'Leo', species: 'Lion', free: false, gemPrice: 0,
    blurb: 'King of the trail. One roar clears the way ahead.',
    ability: { kind: 'roar', name: 'Power Roar', short: 'Knock obstacles', desc: 'Knocks every obstacle within 40 m off the trail', durationMs: 1200, cooldownMs: CD },
    traits: [
      { name: 'Royal Mane', desc: 'Starts every run with a shield', icon: 'shield' },
      { name: 'Pride Bonus', desc: '+10% coins from every run', icon: 'coins' },
    ],
    stats: { speed: 3, stamina: 5, defense: 4 },
  },
  {
    id: 'raja', name: 'Raja', species: 'Tiger', free: false, gemPrice: 0,
    blurb: 'Raw power on four legs. Clears what others go around.',
    ability: { kind: 'leap', name: 'Super Leap', short: 'Jump higher', desc: 'Huge jumps that clear rocks, ruins and boulders', durationMs: 8000, cooldownMs: CD },
    traits: [
      { name: 'Striped Hunter', desc: 'Gems appear more often', icon: 'gems' },
      { name: 'Power Legs', desc: 'Longer jumps', icon: 'speed' },
    ],
    stats: { speed: 4, stamina: 3, defense: 4 },
  },
  {
    id: 'shadow', name: 'Shadow', species: 'Panther', free: false, gemPrice: 0,
    blurb: 'Silent and unseen. Slips straight through danger.',
    ability: { kind: 'stealth', name: 'Stealth Dash', short: 'Run invisible', desc: 'Turns invisible and passes through every obstacle', durationMs: 4000, cooldownMs: CD },
    traits: [
      { name: 'Night Eyes', desc: 'Obstacles show warning outlines', icon: 'ability' },
      { name: 'Quick Paws', desc: 'Faster lane changes', icon: 'speed' },
    ],
    stats: { speed: 5, stamina: 3, defense: 2 },
  },
  {
    id: 'jax', name: 'Jax', species: 'Jaguar', free: false, gemPrice: 0,
    blurb: 'Reflexes like lightning. Traps never see him coming.',
    ability: { kind: 'dodge', name: 'Rapid Dodge', short: 'Avoid traps', desc: 'Automatically dodges into the safe lane', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Spotted Luck', desc: '+10% gems from pickups', icon: 'gems' },
      { name: 'Agile', desc: 'Faster lane changes', icon: 'speed' },
    ],
    stats: { speed: 5, stamina: 3, defense: 3 },
  },
  {
    id: 'arctic', name: 'Arctic', species: 'Wolf', free: false, gemPrice: 0,
    blurb: 'Born in the snow. Leaves a trail of frost behind.',
    ability: { kind: 'frost', name: 'Frost Sprint', short: 'Freeze obstacles', desc: 'Freezes obstacles ahead so they shatter on contact', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Pack Leader', desc: '+10% XP from every run', icon: 'xp' },
      { name: 'Cold Blood', desc: 'Power-ups last longer', icon: 'ability' },
    ],
    stats: { speed: 4, stamina: 4, defense: 3 },
  },
  {
    id: 'bruno', name: 'Bruno', species: 'Gorilla', free: false, gemPrice: 0,
    blurb: 'Raw strength. Barriers are just suggestions.',
    ability: { kind: 'smash', name: 'Obstacle Smash', short: 'Break barriers', desc: 'Smashes through barriers, logs, roots and ruins', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Thick Hide', desc: 'Shields last longer', icon: 'shield' },
      { name: 'Jungle King', desc: '+10% coins from every run', icon: 'coins' },
    ],
    stats: { speed: 3, stamina: 4, defense: 5 },
  },
  {
    id: 'titan', name: 'Titan', species: 'Elephant', free: false, gemPrice: 0,
    blurb: 'Unstoppable once he gets going.',
    ability: { kind: 'charge', name: 'Heavy Charge', short: 'Push obstacles', desc: 'Charges forward pushing obstacles aside', durationMs: 5000, cooldownMs: 32000 },
    traits: [
      { name: 'Iron Skin', desc: 'Starts every run with a shield', icon: 'shield' },
      { name: 'Long Memory', desc: '+10% XP from every run', icon: 'xp' },
    ],
    stats: { speed: 2, stamina: 5, defense: 5 },
  },
  {
    id: 'koda', name: 'Koda', species: 'Red Panda', free: false, gemPrice: 0,
    blurb: 'Small, quick and impossible to catch.',
    ability: { kind: 'roll', name: 'Acrobat Roll', short: 'Roll faster', desc: 'Rolls straight through anything low or in the way', durationMs: 6000, cooldownMs: 28000 },
    traits: [
      { name: 'Light Feet', desc: 'Faster rolls and slides', icon: 'speed' },
      { name: 'Treasure Nose', desc: 'Gems appear more often', icon: 'gems' },
    ],
    stats: { speed: 4, stamina: 4, defense: 2 },
  },
  {
    id: 'snow', name: 'Snow', species: 'Snow Leopard', free: false, gemPrice: 0,
    blurb: 'At home on cliffs. Gaps are nothing.',
    ability: { kind: 'cliff', name: 'Cliff Leap', short: 'Longer jump', desc: 'Long leaps that carry over gaps and tall obstacles', durationMs: 8000, cooldownMs: CD },
    traits: [
      { name: 'Mountain Born', desc: 'Longer jumps', icon: 'speed' },
      { name: 'Ghost of Peaks', desc: '+10% gems from pickups', icon: 'gems' },
    ],
    stats: { speed: 4, stamina: 3, defense: 3 },
  },
  {
    id: 'nova', name: 'Nova', species: 'White Tiger', free: false, gemPrice: 0,
    blurb: 'A ghost of the snowy forests. Ice follows every stride.',
    ability: { kind: 'frost', name: 'Frost Sprint', short: 'Freeze obstacles', desc: 'Freezes obstacles ahead so they shatter on contact', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Rare Coat', desc: 'Gems appear more often', icon: 'gems' },
      { name: 'Power Legs', desc: 'Longer jumps', icon: 'speed' },
    ],
    stats: { speed: 4, stamina: 4, defense: 4 },
  },
  {
    id: 'blaze', name: 'Blaze', species: 'Cheetah', free: false, gemPrice: 0,
    blurb: 'The fastest thing on four legs. Blink and she is gone.',
    ability: { kind: 'boost', name: 'Speed Burst', short: 'Run faster', desc: 'Explodes into a flat-out sprint for a few seconds', durationMs: 5000, cooldownMs: CD },
    traits: [
      { name: 'Built for Speed', desc: 'Faster lane changes', icon: 'speed' },
      { name: 'Spotted Luck', desc: '+10% gems from pickups', icon: 'gems' },
    ],
    stats: { speed: 5, stamina: 2, defense: 2 },
  },
  {
    id: 'zara', name: 'Zara', species: 'Lioness', free: false, gemPrice: 0,
    blurb: 'The pride\'s true hunter. Patient, then unstoppable.',
    ability: { kind: 'leap', name: 'Pounce', short: 'Jump higher', desc: 'Huge pouncing jumps that clear rocks, ruins and boulders', durationMs: 8000, cooldownMs: CD },
    traits: [
      { name: 'Pride Hunter', desc: '+10% coins from every run', icon: 'coins' },
      { name: 'Ambush', desc: 'Starts every run with a shield', icon: 'shield' },
    ],
    stats: { speed: 4, stamina: 4, defense: 3 },
  },
  {
    id: 'ash', name: 'Ash', species: 'Grey Wolf', free: false, gemPrice: 0,
    blurb: 'Leader of the pack. Reads the trail before it happens.',
    ability: { kind: 'dodge', name: 'Rapid Dodge', short: 'Avoid traps', desc: 'Automatically dodges into the safe lane', durationMs: 6000, cooldownMs: CD },
    traits: [
      { name: 'Pack Leader', desc: '+10% XP from every run', icon: 'xp' },
      { name: 'Endurance', desc: 'Power-ups last longer', icon: 'ability' },
    ],
    stats: { speed: 4, stamina: 5, defense: 3 },
  },
  // (added last: race packets and saves refer to animals by their place in this list)
  {
    id: 'stallion', name: 'Midnight', species: 'Friesian Stallion', free: false, gemPrice: 0,
    blurb: 'A tall black stallion with a mane like a storm. Nothing outruns him.',
    ability: { kind: 'charge', name: 'Thunder Gallop', short: 'Gallop through', desc: 'A flat-out gallop that bursts through logs, roots and barriers', durationMs: 5000, cooldownMs: CD },
    traits: [
      { name: 'Long Stride', desc: 'Jumps higher and further', icon: 'speed' },
      { name: 'Sure-Footed', desc: 'Ice, snow and mud never slow his turns', icon: 'ability' },
    ],
    stats: { speed: 5, stamina: 4, defense: 3 },
  },
]

/**
 * Animals rested from the roster until they have realistic models (their source models are low-detail). They stay in
 * ANIMALS so old saves, race packets and the engine keep working; nothing offers them any more.
 */
export const RETIRED: ReadonlySet<AnimalId> = new Set<AnimalId>(['bruno', 'koda', 'arctic', 'ash'])
/** The animals the game offers: the roster, home line-up, store and race rivals. */
export const ROSTER = ANIMALS.filter((a) => !RETIRED.has(a.id))
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

export type ObstacleKind = 'log' | 'roots' | 'trap' | 'rock' | 'ruin' | 'branch' | 'barrier' | 'gap' | 'boulder' | 'trolley' | 'stream' | 'rubble' | 'stalactite' | 'plane' | 'quicksand' | 'darts' | 'swinglog' | 'minecart' | 'buffer' | 'beam' | 'bough' | 'raft' | 'jeep' | 'strike' | 'fire' | 'ember' | 'roller' | 'blade' | 'swarm' | 'web' | 'toxic' | 'elephant' | 'pounce' | 'door' | 'gas' | 'lava' | 'plate' | 'kelp' | 'snapper' | 'mud' | 'bamboo' | 'net' | 'whirl' | 'sluice'
export type PickupKind = 'coin' | 'gem' | 'token' | 'magnet' | 'shield' | 'speed' | 'superjump' | 'megajump' | 'boost' | 'chest' | 'crate' | 'fragment' | 'ring' | 'gate'
/** a hanging vine at the lip of a ravine: jump into it to swing across */
export type MarkerKind = 'vine' | 'zipline'
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
  // a bush plane on an airstrip: run into it to board and fly (it never crashes the runner)
  plane: ['lane'],
  // quicksand (jump it or keep to the firm lane), a temple dart volley (slide under) and a swinging log trap (duck)
  quicksand: ['jump'],
  darts: ['low'],
  swinglog: ['low'],
  // mine cart: running into a parked cart boards it (never a crash); on the tracks a buffer stop means switching
  // track, a low timber beam means ducking in the cart. A bough over a zipline ravine means switching cable.
  minecart: ['jump', 'lane'],
  buffer: ['lane'],
  beam: ['low'],
  bough: ['lane'],
  // white-water raft and safari jeep: parked at the start of their sections, boarded by running into them
  raft: ['jump', 'lane'],
  jeep: ['jump', 'lane'],
  // weather and disasters: a lightning strike leaves its lane burning (steer away), a burning lane in a wildfire
  // (steer away), a burning branch across the trail (duck)
  strike: ['lane'],
  fire: ['lane'],
  ember: ['low'],
  // rolling spiked rollers (jump), temple blades and insect swarms (slide under), spider webs (slide under), poison
  // dart frog puddles (jump or keep out)
  roller: ['jump'],
  blade: ['low'],
  swarm: ['low'],
  web: ['low'],
  toxic: ['jump'],
  // wildlife (the game's own realistic models): an elephant charging down a lane, a jaguar springing into one
  elephant: ['lane'],
  pounce: ['lane'],
  // temple symbol doors (a closed door: take the lane whose door bears the symbol), toxic gas clouds (keep out),
  // lava streams in a volcano escape (jump)
  door: ['lane'],
  gas: ['lane'],
  lava: ['jump'],
  // a temple pressure plate (jump it or keep off it: it fires the trap) and a curtain of river weed underwater (dive
  // under it)
  plate: ['jump', 'lane'],
  kelp: ['low'],
  // extra challenges: a carnivorous plant snapping over its lane (keep out), a mud wave sliding down at the runner
  // (jump), bamboo culms packed across a lane (keep out), a rope net strung low (slide), a whirlpool (jump), a shut
  // dam sluice gate (keep out)
  snapper: ['lane'],
  mud: ['jump'],
  bamboo: ['lane'],
  net: ['low'],
  whirl: ['jump'],
  sluice: ['lane'],
}
/** Obstacles that strength abilities can break. Gaps never break. */
export const BREAKABLE: Record<ObstacleKind, boolean> = { log: true, roots: true, trap: true, rock: true, ruin: true, branch: true, barrier: true, gap: false, boulder: true, trolley: false, stream: false, rubble: true, stalactite: true, plane: false, quicksand: false, darts: false, swinglog: true, minecart: false, buffer: false, beam: true, bough: true, raft: false, jeep: false, strike: false, fire: false, ember: true, roller: true, blade: false, swarm: false, web: true, toxic: false, elephant: false, pounce: false, door: false, gas: false, lava: false, plate: false, kelp: true, snapper: true, mud: false, bamboo: true, net: true, whirl: false, sluice: false }
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
export type SectionKind = 'rail' | 'river' | 'bridge' | 'rockslide' | 'cave' | 'vines' | 'flight' | 'treefall' | 'quicksand' | 'temple' | 'swinglog' | 'minecart' | 'zipline' | 'raft' | 'jeep' | 'lightning' | 'wildfire' | 'flood' | 'quake' | 'coinstorm' | 'camp' | 'supply' | 'spikeroll' | 'pitfall' | 'blades' | 'swarm' | 'webs' | 'toxic' | 'cointunnel' | 'glider' | 'stampede' | 'jaguar' | 'speedboat' | 'atv' | 'cablecar' | 'drone' | 'symbols' | 'sandstorm' | 'toxicgas' | 'volcano' | 'truck' | 'helicopter' | 'plates' | 'climb' | 'wallrun' | 'swim' | 'rival' | 'guide' | 'snappers' | 'spinbridge' | 'mudslide' | 'bamboo' | 'trunk' | 'windstorm' | 'platforms' | 'nets' | 'whirlpool' | 'dam' | 'ceiling' | 'checkpoints' | 'rings' | 'barrel'
export const SECTION_TEXT: Record<SectionKind, { big: string; small: string }> = {
  rail: { big: 'Railway ahead!', small: 'Jump onto the trolley and ride it' },
  river: { big: 'River crossing!', small: 'Hop the stepping stones' },
  bridge: { big: 'Broken bridge!', small: 'Watch for missing planks' },
  rockslide: { big: 'Rockslide!', small: 'Dodge the falling rocks' },
  cave: { big: 'Cave ahead', small: 'Slide under the rock spikes' },
  flight: { big: 'Airstrip ahead!', small: 'Run into the plane to take off' },
  vines: { big: 'Vine swing!', small: 'Jump into a vine to swing the ravine – or take the log' },
  treefall: { big: 'Timber!', small: 'Trees are coming down – jump the trunks or take the open lane' },
  quicksand: { big: 'Quicksand!', small: 'Keep to the firm ground or jump the sinking sand' },
  temple: { big: 'Temple traps!', small: 'Slide under the darts, steer round the pillars' },
  swinglog: { big: 'Log trap!', small: 'Duck under the swinging logs' },
  minecart: { big: 'Mine carts!', small: 'Hop in – change lane to switch tracks' },
  raft: { big: 'White water!', small: 'Board a raft – steer round the rocks, duck the branches' },
  jeep: { big: 'Safari jeep!', small: 'Jump in – steer round the rocks, jump the gullies' },
  spikeroll: { big: 'Spike rollers!', small: 'Jump the rolling spikes' },
  pitfall: { big: 'Hidden pits!', small: 'Watch for cracks – jump before the ground gives way' },
  blades: { big: 'Blade hallway!', small: 'Slide under the swinging blades' },
  swarm: { big: 'Swarm!', small: 'Slide under the swarms or take the clear lane' },
  webs: { big: 'Spider webs!', small: 'Slide under the thick webs' },
  toxic: { big: 'Poison frogs!', small: 'Keep out of the bright puddles' },
  cointunnel: { big: 'Coin tunnel', small: 'Follow the coins, miss the rocks' },
  glider: { big: 'Glider launch!', small: 'Run into the glider – steer through the sky coins' },
  stampede: { big: 'Stampede!', small: 'Elephants charging – find the gaps' },
  jaguar: { big: 'Jaguar!', small: 'Watch the verge – it springs into a lane' },
  zipline: { big: 'Zipline!', small: 'Grab the line – change lane to dodge the branches' },
  lightning: { big: 'Lightning!', small: 'A glowing ring marks the strike – steer clear' },
  wildfire: { big: 'Wildfire!', small: 'Avoid the flames, duck the burning branches' },
  flood: { big: 'Flash flood!', small: 'Jump the floodwater, steer round the debris' },
  quake: { big: 'Earthquake!', small: 'Cracks split open – jump them or take another lane' },
  coinstorm: { big: 'Coin storm!', small: 'Rich pickings – keep your eyes on the obstacles' },
  camp: { big: 'Abandoned camp', small: 'Supplies left behind – help yourself' },
  supply: { big: 'Supply drop!', small: 'A crate is coming down – catch it for a power-up' },
  speedboat: { big: 'Speedboat race!', small: 'Jump in – weave through the rocks, jump the logs' },
  atv: { big: 'Quad bike!', small: 'Jump on – steer round the rocks, jump the ditches' },
  cablecar: { big: 'Cable car!', small: 'Ride the cabin – change lane to dodge the branches' },
  drone: { big: 'Drone lift!', small: 'Grab the drone – steer through the sky coins' },
  symbols: { big: 'Symbol doors!', small: 'Remember the symbol – run through its door' },
  sandstorm: { big: 'Sandstorm!', small: 'Low visibility – jump the drifts, duck the debris' },
  toxicgas: { big: 'Toxic gas!', small: 'Keep out of the green clouds' },
  volcano: { big: 'Volcano escape!', small: 'Jump the lava, dodge the falling rocks' },
  truck: { big: 'Cargo truck!', small: 'Climb aboard – steer round the rocks, jump the washouts' },
  helicopter: { big: 'Helipad!', small: 'Run into the helicopter – steer through the sky coins' },
  plates: { big: 'Pressure plates!', small: 'Jump or avoid the glowing plates – watch for the rolling stone' },
  climb: { big: 'Cliff climb!', small: 'Grab the ledge – change lane to dodge the falling rocks' },
  wallrun: { big: 'Wall run!', small: 'Run the canyon walls – change lane to dodge the branches' },
  swim: { big: 'Dive!', small: 'Swim the channel – slide under the weed, steer round the rocks' },
  rival: { big: 'Rival explorer!', small: 'Race the rival – grab the coins to pull ahead' },
  guide: { big: 'A guide appears', small: 'Follow the glowing bird to its treasure' },
  snappers: { big: 'Snapping plants!', small: 'Giant plants bite at the trail – take the clear lane' },
  spinbridge: { big: 'Turning bridge!', small: 'Stone slabs swing open – take the slab or jump the gap' },
  mudslide: { big: 'Mudslide!', small: 'Jump the sliding mud, steer round the rocks' },
  bamboo: { big: 'Bamboo squeeze!', small: 'Weave through the gaps in the bamboo' },
  trunk: { big: 'Trunk balance!', small: 'Keep to the fallen trunk – duck the branches' },
  windstorm: { big: 'Windstorm!', small: 'Duck the flying branches, dodge the debris' },
  platforms: { big: 'Falling platforms!', small: 'Planks drop as you near – jump the holes' },
  nets: { big: 'Rope nets!', small: 'Slide under the low nets' },
  whirlpool: { big: 'Whirlpools!', small: 'Jump or steer round the swirling water' },
  dam: { big: 'Dam gates!', small: 'Find the open sluice – jump the rushing water' },
  ceiling: { big: 'Collapsing ceiling!', small: 'Blocks are falling – keep moving, change lane' },
  checkpoints: { big: 'Time trial!', small: 'Run through every checkpoint gate for the bonus' },
  rings: { big: 'Ring leap!', small: 'Jump through the hanging rings' },
  barrel: { big: 'Barrel ride!', small: 'Climb in – steer round the rocks, duck the branches' },
}

// ---------------------------------------------------------------- pacing director

/**
 * Difficulty tiers by time on the trail (seconds of running). A challenge only appears once the run has reached its
 * tier, so the first minute and a half only uses the simplest, most readable sections.
 */
export const TIERS = [
  { tier: 1, name: 'Explorer', from: 0 },
  { tier: 2, name: 'Adventurer', from: 90 },
  { tier: 3, name: 'Survivor', from: 180 },
  { tier: 4, name: 'Expert', from: 300 },
  { tier: 5, name: 'Legend', from: 480 },
] as const
export const tierAt = (seconds: number) => {
  let t = 1
  for (const x of TIERS) if (seconds >= x.from) t = x.tier
  return t
}
export const tierName = (tier: number) => TIERS[Math.max(0, Math.min(TIERS.length - 1, tier - 1))].name
/** the first tier at which each challenge may be picked */
export const SECTION_MIN_TIER: Record<SectionKind, number> = {
  river: 1, bridge: 1, vines: 1, rail: 1, flight: 1, quicksand: 1, swinglog: 1, zipline: 1,
  treefall: 2, rockslide: 2, cave: 2, minecart: 2, raft: 2, jeep: 2, spikeroll: 2, pitfall: 2, webs: 2, glider: 2, swarm: 1, toxic: 1, cointunnel: 1,
  temple: 3,
  // surprise events (rewards) any time after the first hook; weather and disasters as the run gets going
  coinstorm: 1, camp: 1, supply: 1, flood: 1,
  lightning: 2, wildfire: 2,
  quake: 3,
  blades: 3,
  stampede: 2,
  jaguar: 1,
  speedboat: 2, atv: 2, cablecar: 2, drone: 1,
  symbols: 2, sandstorm: 2, toxicgas: 2, volcano: 3,
  truck: 2, helicopter: 1, plates: 2, climb: 2, wallrun: 2, swim: 2, rival: 1, guide: 1,
  snappers: 1, spinbridge: 2, mudslide: 2, bamboo: 1, trunk: 2, windstorm: 2, platforms: 2, nets: 1, whirlpool: 2, dam: 2, ceiling: 3,
  checkpoints: 1, rings: 1, barrel: 2,
}
/** surprise events: reward stretches announced as surprises rather than challenges */
export const SURPRISE_SECTIONS: SectionKind[] = ['coinstorm', 'camp', 'supply', 'guide']
/** a challenge is not picked again until this many others have run (zone signature sections are exempt) */
export const SECTION_NO_REPEAT = 3
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
