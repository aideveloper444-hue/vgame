import { SECTION_TEXT, type SectionKind } from '../engine/content'

/* Challenge names and the per-run tally shared by the challenge card (ChallengeHud) and the results screen. */

export const CHALLENGE_NAME: Partial<Record<SectionKind, string>> & Record<string, string> = {
  rail: 'Railway',
  river: 'River Crossing',
  bridge: 'Broken Bridge',
  rockslide: 'Rockslide',
  cave: 'Cave',
  vines: 'Vine Swing',
  flight: 'Airstrip',
  treefall: 'Timber',
  quicksand: 'Quicksand',
  temple: 'Temple Traps',
  swinglog: 'Log Trap',
  minecart: 'Mine Cart',
  zipline: 'Zipline',
  raft: 'White-Water Raft',
  spikeroll: 'Spike Rollers',
  pitfall: 'Hidden Pits',
  blades: 'Blade Hallway',
  swarm: 'Swarm',
  webs: 'Spider Webs',
  toxic: 'Poison Frogs',
  cointunnel: 'Coin Tunnel',
  glider: 'Glider',
  stampede: 'Stampede',
  jaguar: 'Jaguar Ambush',
  jeep: 'Safari Jeep',
  lightning: 'Lightning',
  wildfire: 'Wildfire',
  flood: 'Flash Flood',
  quake: 'Earthquake',
  coinstorm: 'Coin Storm',
  camp: 'Abandoned Camp',
  supply: 'Supply Drop',
  speedboat: 'Speedboat Race',
  atv: 'Quad Bike',
  cablecar: 'Cable Car',
  drone: 'Drone Lift',
  symbols: 'Symbol Doors',
  sandstorm: 'Sandstorm',
  toxicgas: 'Toxic Gas',
  volcano: 'Volcano Escape',
}
export const nameOf = (k: string) => CHALLENGE_NAME[k as SectionKind] ?? k.charAt(0).toUpperCase() + k.slice(1)
export const textOf = (k: string): { big: string; small: string } => (SECTION_TEXT as Record<string, { big: string; small: string }>)[k] ?? { big: nameOf(k), small: '' }

/** what the run's challenges came to (read by the results screen; reset at the start of every run) */
export const challengeTally = { seen: 0, cleared: 0, stars: 0, perfect: 0, bonus: 0, kinds: [] as string[], gauntlets: 0 }
export const resetChallengeTally = () => Object.assign(challengeTally, { seen: 0, cleared: 0, stars: 0, perfect: 0, bonus: 0, kinds: [], gauntlets: 0 })

