export interface SuspectDef {
  id: string
  name: string
  emoji: string
}

export interface ItemDef {
  id: string
  name: string
  emoji: string
}

export interface LocationDef {
  id: string
  name: string
  emoji: string
}

export const SUSPECTS: SuspectDef[] = [
  { id: 'chef', name: 'The Chef', emoji: '🧑‍🍳' },
  { id: 'butler', name: 'The Butler', emoji: '🎩' },
  { id: 'gardener', name: 'The Gardener', emoji: '🧑‍🌾' },
  { id: 'professor', name: 'The Professor', emoji: '🧑‍🏫' },
  { id: 'actress', name: 'The Actress', emoji: '🎭' },
  { id: 'sailor', name: 'The Sailor', emoji: '⚓' },
]

export const ITEMS: ItemDef[] = [
  { id: 'candlestick', name: 'Candlestick', emoji: '🕯️' },
  { id: 'rope', name: 'Rope', emoji: '🪢' },
  { id: 'wrench', name: 'Wrench', emoji: '🔧' },
  { id: 'poison', name: 'Vial of Poison', emoji: '🧪' },
  { id: 'key', name: 'Brass Key', emoji: '🗝️' },
  { id: 'letter', name: 'Sealed Letter', emoji: '✉️' },
  { id: 'necklace', name: 'Pearl Necklace', emoji: '📿' },
  { id: 'painting', name: 'Old Painting', emoji: '🖼️' },
]

export const LOCATIONS: LocationDef[] = [
  { id: 'library', name: 'Library', emoji: '📚' },
  { id: 'kitchen', name: 'Kitchen', emoji: '🍽️' },
  { id: 'garden', name: 'Garden', emoji: '🌳' },
  { id: 'study', name: 'Study', emoji: '🗄️' },
  { id: 'cellar', name: 'Cellar', emoji: '🛢️' },
  { id: 'attic', name: 'Attic', emoji: '🪜' },
  { id: 'dock', name: 'Dock', emoji: '🚢' },
  { id: 'greenhouse', name: 'Greenhouse', emoji: '🪴' },
]

export type ThemeId = 'murder' | 'theft' | 'missing' | 'sabotage'

export interface ThemeDef {
  id: ThemeId
  icon: string
  itemLabel: string
  whoQuestion: string
  itemQuestion: string
  whereQuestion: string
  intro: (venue: string) => string
  title: (venue: string) => string
  solvedLine: (suspect: string, item: string, location: string) => string
  notSuspectClue: (suspect: string) => string
  notItemClue: (item: string) => string
  notLocationClue: (location: string) => string
}

const THEMES: Record<ThemeId, ThemeDef> = {
  murder: {
    id: 'murder',
    icon: '🔪',
    itemLabel: 'Weapon',
    whoQuestion: 'Who did it?',
    itemQuestion: 'What weapon was used?',
    whereQuestion: 'Where did it happen?',
    intro: () => 'A body has been discovered! Someone in this house is the killer — pool your clues to catch them.',
    title: (venue) => `Murder at ${venue}`,
    solvedLine: (s, i, l) => `${s} did it — with the ${i}, in the ${l}!`,
    notSuspectClue: (s) => `${s} has a solid alibi for the time of the murder.`,
    notItemClue: (i) => `The ${i} was found clean — it wasn't the murder weapon.`,
    notLocationClue: (l) => `Investigators found no signs of struggle in the ${l}.`,
  },
  theft: {
    id: 'theft',
    icon: '💎',
    itemLabel: 'Stolen Item',
    whoQuestion: 'Who stole it?',
    itemQuestion: 'What was taken?',
    whereQuestion: 'Where was it hidden?',
    intro: () => 'Something valuable has vanished! Compare notes to figure out who took it, and where they stashed it.',
    title: (venue) => `The ${venue} Heist`,
    solvedLine: (s, i, l) => `${s} took the ${i} and hid it in the ${l}!`,
    notSuspectClue: (s) => `${s} was seen elsewhere when the theft happened.`,
    notItemClue: (i) => `The ${i} was found exactly where it should be — nothing missing there.`,
    notLocationClue: (l) => `A thorough search of the ${l} turned up nothing.`,
  },
  missing: {
    id: 'missing',
    icon: '🔎',
    itemLabel: 'Last Seen With',
    whoQuestion: 'Who knows what happened?',
    itemQuestion: 'What were they last seen with?',
    whereQuestion: 'Where did they go?',
    intro: () => 'Someone has gone missing without a trace! Share what you know to piece together where they went.',
    title: (venue) => `Vanished from ${venue}`,
    solvedLine: (s, i, l) => `${s} knows the truth — last seen with the ${i}, heading to the ${l}!`,
    notSuspectClue: (s) => `${s} genuinely has no idea what happened.`,
    notItemClue: (i) => `The ${i} was still in its usual place — not involved.`,
    notLocationClue: (l) => `There's no trace of anyone passing through the ${l}.`,
  },
  sabotage: {
    id: 'sabotage',
    icon: '⚠️',
    itemLabel: 'Method',
    whoQuestion: 'Who sabotaged it?',
    itemQuestion: 'How did they do it?',
    whereQuestion: 'Where did they strike?',
    intro: () => 'Something has been deliberately sabotaged! Trade clues to work out who did it, how, and where.',
    title: (venue) => `Sabotage at ${venue}`,
    solvedLine: (s, i, l) => `${s} sabotaged it using the ${i}, in the ${l}!`,
    notSuspectClue: (s) => `${s} was busy elsewhere and couldn't have done it.`,
    notItemClue: (i) => `The ${i} shows no signs of tampering.`,
    notLocationClue: (l) => `Nothing out of place was found in the ${l}.`,
  },
}

const THEME_ORDER: ThemeId[] = ['murder', 'theft', 'missing', 'sabotage']

export type ClueCategory = 'suspect' | 'item' | 'location'

export interface Clue {
  id: string
  slot: number // which of the 4 investigators holds this clue (0 = human)
  text: string
  category: ClueCategory
  ruledOutId: string // the suspect/item/location this clue eliminates
}

/** Something to tap in one of the crime-scene rooms; clue evidence reveals one of your own clues. */
export interface Evidence {
  id: string
  locationId: string
  /** Which of the room's evidence spots it sits on. */
  anchor: number
  emoji: string
  label: string
  finding: string
  clueId: string | null
}

export interface CaseStory {
  venue: string
  time: string
  /** What happened, told as a short case file. */
  paragraphs: string[]
  /** One line per suspect: who they are and why they might have done it. */
  suspectNotes: Record<string, string>
}

export interface MysteryCase {
  id: string
  caseNumber: number
  theme: ThemeId
  title: string
  intro: string
  suspects: SuspectDef[]
  items: ItemDef[]
  locations: LocationDef[]
  solution: { suspectId: string; itemId: string; locationId: string }
  clues: Clue[]
  evidence: Evidence[]
  story: CaseStory
  /** Clues handed over in the police report before the search starts. */
  openingClueIds: string[]
}

/** Your own clues: the first few come in the police report, the rest are hidden in the rooms. */
const YOUR_CLUES = 6
const OPENING_CLUES = 2
export const EVIDENCE_SPOTS_PER_ROOM = 4

const VENUES = ['Blackwood Manor', 'Ravenscroft Hall', 'Ashbury House', 'Harrow Point Lodge', 'Thornfield Estate', 'Wren Hollow', 'Greystone Abbey']
const TIMES = ['11:40 pm', '12:15 am', '1:05 am', '10:50 pm', '2:30 am']
const HOSTS = ['Lord Edmund Ashford', 'Lady Margaret Vale', 'Colonel Arthur Pike', 'Madame Celeste Duval', 'Sir Henry Blackwood']

const SUSPECT_NOTES: Record<string, string> = {
  chef: 'Cooked the evening dinner. Staff heard a loud argument with the host about unpaid wages.',
  butler: 'Has served the family for 30 years and holds every key in the house. Was recently told he would be replaced.',
  gardener: 'Knows every path around the house. Came in soaked from the storm, but won\'t say where he had been.',
  professor: 'An old friend of the host who owes him a large sum of money. Left the dinner table early.',
  actress: 'A famous guest who arrived uninvited. Her jewellery case was empty when she arrived.',
  sailor: 'The host\'s nephew, back from sea after ten years. He is first in line to inherit the estate.',
}

function storyFor(themeId: ThemeId, caseNumber: number, rng: () => number, locations: LocationDef[], suspects: SuspectDef[]): CaseStory {
  const venue = VENUES[caseNumber % VENUES.length]
  const time = TIMES[Math.floor(rng() * TIMES.length)]
  const host = HOSTS[caseNumber % HOSTS.length]
  const rooms = locations.map((l) => l.name)
  const roomList = `${rooms.slice(0, -1).join(', ')} and ${rooms[rooms.length - 1]}`
  const names = suspects.map((s, i) => (i === 0 ? s.name : s.name.replace(/^The /, 'the ')))
  const who = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const opening: Record<ThemeId, string[]> = {
    murder: [
      `A storm cut the power to ${venue} just before ${time}. When the lights came back on, the housekeeper found ${host} lying still on the floor. The doctor says it was no accident.`,
      `The front gates were locked all night, so the killer never left the grounds. ${who} were all in the house.`,
    ],
    theft: [
      `At ${time} a scream echoed through ${venue}. ${host}'s family treasure was gone from its glass case, and the case had not been forced.`,
      `Nobody has left since the alarm was raised. ${who} were all in the house, and one of them hid the treasure somewhere inside.`,
    ],
    missing: [
      `${host}'s young niece Clara was last seen at dinner in ${venue}. At ${time} her room was empty and her bed had not been slept in.`,
      `Her coat is still on its hook and her car is still in the drive. ${who} were the last people to see her.`,
    ],
    sabotage: [
      `At ${time} a bang shook ${venue} and every light went out. Someone had deliberately wrecked the generator that keeps the house running through the storm.`,
      `The storm has closed the only road, so the saboteur is still here. ${who} were all awake when it happened.`,
    ],
  }
  return {
    venue,
    time,
    paragraphs: [
      ...opening[themeId],
      `Four rooms were open that night: the ${roomList}. The police have searched them once, but the real clues are still waiting to be found. It's your turn.`,
    ],
    suspectNotes: Object.fromEntries(suspects.map((s) => [s.id, SUSPECT_NOTES[s.id] ?? 'Was in the house that night.'])),
  }
}

const ALIBI_EVIDENCE: { emoji: string; label: string; finding: (suspect: string) => string }[] = [
  { emoji: '🎟️', label: 'Ticket stub', finding: (s) => `A theatre ticket stub stamped 9:40 pm, with ${s}'s name written on the back.` },
  { emoji: '📸', label: 'Photograph', finding: (s) => `A fresh photo from the party across town. ${s} is right there in the middle of the crowd.` },
  { emoji: '📓', label: 'Guest book', finding: (s) => `The hotel guest book shows ${s} signing in at 9 pm and not leaving until morning.` },
  { emoji: '🧾', label: 'Receipt', finding: (s) => `A dinner receipt for one, paid by ${s} at a restaurant on the other side of the city.` },
  { emoji: '📞', label: 'Phone log', finding: (s) => `The phone log shows ${s} on a long call from the village phone box all evening.` },
]

const ITEM_FINDINGS = [
  (i: string) => `You look over the ${i} carefully. Not a scratch, not a smudge.`,
  (i: string) => `The ${i} is right where it always is, still covered in a thin layer of dust.`,
  (i: string) => `You check the ${i} under the lamp. Nothing about it looks disturbed.`,
]

const LOCATION_EVIDENCE: { emoji: string; label: string; finding: (loc: string) => string }[] = [
  { emoji: '👣', label: 'Undisturbed dust', finding: (l) => `Dust lies evenly across the ${l} floor. Nobody has walked through here in days.` },
  { emoji: '🔒', label: 'Locked door', finding: (l) => `The ${l} was locked from the inside all night, and the key never left its hook.` },
  { emoji: '🧹', label: 'Swept floor', finding: (l) => `The ${l} was cleaned this morning and not a single fresh mark has appeared since.` },
]

const DECOYS: { emoji: string; label: string; finding: string }[] = [
  { emoji: '☂️', label: 'Old umbrella', finding: 'An old umbrella, bone dry. Nothing useful here.' },
  { emoji: '📰', label: 'Newspaper', finding: "Yesterday's newspaper, open to the crossword. Nothing useful here." },
  { emoji: '🍎', label: 'Half-eaten apple', finding: 'A half-eaten apple, already turning brown. Nothing useful here.' },
  { emoji: '🧸', label: 'Teddy bear', finding: 'A worn teddy bear missing one eye. Nothing useful here.' },
  { emoji: '🪶', label: 'Feather', finding: 'A single grey feather, probably from the pigeons outside. Nothing useful here.' },
  { emoji: '🎲', label: 'Lost dice', finding: 'A pair of dice from a board game. Nothing useful here.' },
  { emoji: '🧦', label: 'Odd sock', finding: 'One striped sock with no partner. Nothing useful here.' },
]

function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildCase(caseNumber: number): MysteryCase {
  const rng = mulberry32(caseNumber * 104729 + 17)
  const theme = THEMES[THEME_ORDER[caseNumber % THEME_ORDER.length]]

  const suspects = seededShuffle(SUSPECTS, rng).slice(0, 4)
  const items = seededShuffle(ITEMS, rng).slice(0, 4)
  const locations = seededShuffle(LOCATIONS, rng).slice(0, 4)

  const suspect = suspects[Math.floor(rng() * suspects.length)]
  const item = items[Math.floor(rng() * items.length)]
  const location = locations[Math.floor(rng() * locations.length)]

  const rawClues: { text: string; category: ClueCategory; ruledOutId: string }[] = []
  for (const s of suspects) if (s.id !== suspect.id) rawClues.push({ text: theme.notSuspectClue(s.name), category: 'suspect', ruledOutId: s.id })
  for (const i of items) if (i.id !== item.id) rawClues.push({ text: theme.notItemClue(i.name), category: 'item', ruledOutId: i.id })
  for (const l of locations) if (l.id !== location.id) rawClues.push({ text: theme.notLocationClue(l.name), category: 'location', ruledOutId: l.id })

  const shuffledClues = seededShuffle(rawClues, rng)
  const clues: Clue[] = shuffledClues.map((c, i) => ({
    id: `${caseNumber}-clue-${i}`,
    slot: i < YOUR_CLUES ? 0 : 1 + ((i - YOUR_CLUES) % 3),
    text: c.text,
    category: c.category,
    ruledOutId: c.ruledOutId,
  }))

  // Hide your clues around the rooms: a room's own "nothing here" clue sits in that room, the rest
  // go wherever there's a free spot, and every room gets one decoy so searching takes some thought.
  const freeSpots: Record<string, number[]> = Object.fromEntries(locations.map((l) => [l.id, seededShuffle([0, 1, 2, 3], rng)]))
  const openingClueIds = clues.filter((c) => c.slot === 0).slice(0, OPENING_CLUES).map((c) => c.id)
  const takeSpot = (preferred?: string): [string, number] => {
    const order = preferred ? [preferred, ...seededShuffle(locations.map((l) => l.id), rng)] : seededShuffle(locations.map((l) => l.id), rng)
    for (const id of order) {
      if (freeSpots[id].length > (preferred === id ? 0 : 1)) return [id, freeSpots[id].shift()!]
    }
    for (const id of order) if (freeSpots[id].length) return [id, freeSpots[id].shift()!]
    return [order[0], 0]
  }
  const evidence: Evidence[] = []
  clues.forEach((clue, i) => {
    if (clue.slot !== 0 || openingClueIds.includes(clue.id)) return
    let emoji: string
    let label: string
    let finding: string
    let where: string | undefined
    if (clue.category === 'suspect') {
      const e = ALIBI_EVIDENCE[Math.floor(rng() * ALIBI_EVIDENCE.length)]
      const name = suspects.find((x) => x.id === clue.ruledOutId)!.name
      ;({ emoji, label } = e)
      finding = e.finding(name)
    } else if (clue.category === 'item') {
      const it = items.find((x) => x.id === clue.ruledOutId)!
      emoji = it.emoji
      label = it.name
      finding = ITEM_FINDINGS[Math.floor(rng() * ITEM_FINDINGS.length)](it.name)
    } else {
      const e = LOCATION_EVIDENCE[Math.floor(rng() * LOCATION_EVIDENCE.length)]
      const loc = locations.find((x) => x.id === clue.ruledOutId)!
      ;({ emoji, label } = e)
      finding = e.finding(loc.name)
      where = loc.id
    }
    const [locationId, anchor] = takeSpot(where)
    evidence.push({ id: `${caseNumber}-ev-${i}`, locationId, anchor, emoji, label, finding, clueId: clue.id })
  })
  const decoys = seededShuffle(DECOYS, rng)
  locations.forEach((l, i) => {
    const spot = freeSpots[l.id].shift()
    if (spot === undefined) return
    const d = decoys[i % decoys.length]
    evidence.push({ id: `${caseNumber}-decoy-${i}`, locationId: l.id, anchor: spot, emoji: d.emoji, label: d.label, finding: d.finding, clueId: null })
  })

  const venue = VENUES[caseNumber % VENUES.length]
  return {
    id: `case-${caseNumber}`,
    caseNumber,
    theme: theme.id,
    title: theme.title(venue),
    intro: theme.intro(venue),
    suspects,
    items,
    locations,
    solution: { suspectId: suspect.id, itemId: item.id, locationId: location.id },
    clues,
    evidence,
    story: storyFor(theme.id, caseNumber, rng, locations, suspects),
    openingClueIds,
  }
}

export const TOTAL_CASES = 20

export function buildAllCases(): MysteryCase[] {
  return Array.from({ length: TOTAL_CASES }, (_, i) => buildCase(i))
}

export const MYSTERY_CASES = buildAllCases()

export function getCase(id: string): MysteryCase | undefined {
  return MYSTERY_CASES.find((c) => c.id === id)
}

export function getTheme(id: ThemeId): ThemeDef {
  return THEMES[id]
}
