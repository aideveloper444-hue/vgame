import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, useProgress, useTexture } from '@react-three/drei'
import { useState } from 'react'
import { Bloom, BrightnessContrast, DepthOfField, EffectComposer, HueSaturation, N8AO, Noise, SMAA, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { SharpenEffect } from './sharpen'
import { useSave, type Quality } from '../state/progress'
import type { Racer } from '../engine/race'
import * as THREE from 'three'
import { BIOMES, KIT_BASE, POWER_KINDS, ZONE_LEN, biomeAt, isObstacle, isPowerUp, type AnimalId, type BiomeId, type Flavor, type PowerUpKind, type Variant } from '../engine/content'
import { LANE_W, ROUTE_BONUS_TEXT, ROUTE_RISK_TEXT, laneX, routeForLane, type Fork, type Item } from '../engine/run'
import WildAnimal, { MODELS, type WildPoseState } from './WildAnimal'
import { GlbSet, PropSet, hash01, preloadProps, useProcKits, worldUv, type Placement, type PropId } from './props'
import { onSimEvent, run, showcase, tickRun } from './runController'
import { CORNER_LEN, CORNER_R, TrackPath } from './trackPath'
import { BRANCH_Y, Z_MAX, bendObject, bendPoint, branchGap, patchChunks, updateBend } from './bend'
import { BIOME_NAME } from '../engine/content'
import puMagnet from '../art/pu_magnet.webp'
import puShield from '../art/pu_shield.webp'
import puSpeed from '../art/pu_speed.webp'
import puJump from '../art/pu_jump.webp'
import puMega from '../art/pu_megajump.webp'
import puBoost from '../art/pu_boost.webp'
import eventMask from '../art/event_mask.webp'

/*
 * The Deep Forest Run. Everything sits in "focus space": the runner stays at z = 0 and the world slides
 * past (z = item.d - runner.d), so precision never degrades on long runs. Scenery is deterministic per 5 m
 * segment and changes with the world every 100 m: Dense Forest, Waterfall gorge, Hilly Trails, River
 * Crossing (plank bridge over water) and Ancient Ruins.
 */

preloadProps()
patchChunks()

/** the winding trail of the current run (null in the menus: straight and flat) */
/**
 * The run's trail. Around a junction every route has its own branch path; `slots` lists the route drawn in
 * each bend slot, the runner's own route always first (slot 0 = no lift), so after a choice the other
 * routes stay in the world and fall away behind instead of vanishing.
 */
let track: { path: TrackPath; sim: unknown; fork: Fork | null; branches: TrackPath[]; slots: number[] } | null = null
/** the junction being drawn (from when it comes into view until the runner is well past it) */
const junction = (): Fork | null => track?.fork ?? null
const liftOf = (route: number) => Math.max(0, track?.slots.indexOf(route) ?? 0) * BRANCH_Y
export const currentTrack = () => track?.path ?? null

const SEG = 5
const ROW = 1.25
const AHEAD = 125
const BEHIND = 14
const PATH_HALF = LANE_W * 1.5 // 3.15
const WATER_Y = -0.85
const TX = '/models/wildbound/tex'

/** the world at a distance, following the chosen route at a split */
const kitId = (d: number): BiomeId => (!view.showcase && run.sim ? run.sim.biomeIdAt(d) : biomeAt(d).biome.id)
/** the kit whose scenery, trail and light draw a place: newer kits borrow the closest original one */
const biomeId = (d: number): BiomeId => {
  const k = kitId(d)
  return KIT_BASE[k] ?? k
}
const FOG = Object.fromEntries(BIOMES.map((b) => [b.id, b.fog])) as Record<BiomeId, string>
const BIOME_INDEX = Object.fromEntries(BIOMES.map((b, i) => [b.id, i])) as Record<BiomeId, number>
/** the zone's dressing at a distance (routes at a junction carry none) */
const flavorAt = (d: number): Flavor => (!view.showcase && run.sim?.routeAt(d) ? '' : biomeAt(d).flavor)
const FLAVORS: Flavor[] = ['', 'giant', 'flower', 'roots', 'vines', 'ferns', 'rocks', 'glow', 'moss', 'jungle', 'rail', 'thaw']
const BANKS = new Set<string>(['bank', 'bankSnow', 'bankHill', 'bankSand', 'bankGold', 'bankBasalt'])
const CLEAR_ROCK = new Set<string>(['redrock', 'rockface', 'icerock'])
const BIG = /^(wall|tree|atree|btree|wtree|acacia|palm|birch|pine|bamboo|mountain|rockface|redrock|icerock|bank|pillar|block|dune)/

// ---------------------------------------------------------------- scenery per 5 m segment

function landBank(out: Placement[], z: number, side: number, from = PATH_HALF + 0.4, prop: PropId = 'bank') {
  out.push({ prop, x: side * (from + 22), y: -4.04, z, rotY: 0, scale: [44, 4, SEG + 0.02] })
}
const TREES = ['tree1', 'tree2', 'tree3'] as const
const BTREES = ['btree1', 'btree2', 'btree3'] as const

/** The new zone kits (2026-11-06): savannah, desert, canyon, swamp, volcanic, coast, blossom, ice, birch. */
function kitScenery(out: Placement[], k: number, b: BiomeId, side: number, h: (n: number) => number, at: (n: number) => number, zc: number) {
  switch (b) {
    case 'savannah': {
      // open golden grassland: tall grass, lone flat-topped acacias, rocks, distant hills; long sightlines
      landBank(out, zc, side, PATH_HALF + 0.4, 'bankGold')
      for (let n = 0; n < 6; n++) out.push({ prop: 'grassGold', x: side * (PATH_HALF + 0.5 + h(n) * h(n + 7) * 12), y: 0, z: at(n + 10), rotY: h(n + 20) * 6.28, scale: 0.7 + h(n + 30) * 0.7 })
      if (h(40) < 0.22) {
        const sc = 7 + h(41) * 4
        out.push({ prop: 'acacia', x: side * (9 + h(42) * 18), y: 0, z: at(43), rotY: h(44) * 6.28, scale: [sc * 1.5, sc * 0.55, sc * 1.5] })
      }
      if (h(50) < 0.18) out.push({ prop: 'sandrock', x: side * (5.5 + h(51) * 8), y: -0.2, z: at(52), rotY: h(53) * 6.28, scale: 0.9 + h(54) * 1.4 })
      if (h(55) < 0.25) out.push({ prop: 'bush', x: side * (6 + h(56) * 10), y: 0, z: at(57), rotY: h(58) * 6.28, scale: 0.5 + h(59) * 0.4 })
      if (k % 4 === (side === 1 ? 0 : 2)) out.push({ prop: 'mountain', x: side * (46 + h(60) * 20), y: -2, z: at(61), rotY: h(62) * 6.28, scale: 14 + h(63) * 10 })
      break
    }
    case 'desert': {
      // sand dunes, sandstone boulders, palms; every so often an oasis pool beside the trail
      const oasis = Math.floor(k / 6) % 3 === 1
      if (oasis) landBank(out, zc, side, 10, 'bankSand')
      else landBank(out, zc, side, PATH_HALF + 0.4, 'bankSand')
      if (h(1) < 0.5) out.push({ prop: 'dune', x: side * (12 + h(2) * 20), y: -0.4, z: at(3), rotY: h(4) * 6.28, scale: [8 + h(5) * 10, 2 + h(6) * 3, 6 + h(7) * 8] })
      if (h(10) < 0.25) out.push({ prop: 'sandrock', x: side * (5.5 + h(11) * 6), y: -0.2, z: at(12), rotY: h(13) * 6.28, scale: 0.8 + h(14) * 1.6 })
      if (oasis || h(20) < 0.12) for (let n = 0; n < 2; n++) if (h(n + 21) < 0.7) out.push({ prop: 'palm', x: side * (oasis ? 9 + h(n + 23) * 3 : 6 + h(n + 23) * 6), y: 0, z: at(n + 25), rotY: (side > 0 ? Math.PI : 0) + (h(n + 27) - 0.5) * 1.6, scale: 6 + h(n + 29) * 3 })
      if (oasis) for (let n = 0; n < 3; n++) out.push({ prop: 'reeds', x: side * (PATH_HALF + 1 + h(n + 40) * 5), y: WATER_Y, z: at(n + 41), rotY: h(n + 42) * 6.28, scale: 0.9 + h(n + 43) * 0.6 })
      if (k % 5 === (side === 1 ? 1 : 3)) out.push({ prop: 'redrock', x: side * (40 + h(50) * 16), y: -1, z: at(51), rotY: h(52) * 6.28, scale: 14 + h(53) * 10 })
      break
    }
    case 'canyon': {
      // a red sandstone gorge: cliff walls close to the trail, fallen boulders, a strip of sky above
      landBank(out, zc, side, PATH_HALF + 0.4, 'bankSand')
      out.push({ prop: 'redrock', x: side * (9 + h(1) * 1.5), y: -0.6, z: zc + (h(2) - 0.5) * 2, rotY: h(3) * 6.28, scale: 7 + h(4) * 3 })
      if (h(5) < 0.6) out.push({ prop: 'redrock', x: side * (16 + h(6) * 4), y: 0.5, z: at(7), rotY: h(8) * 6.28, scale: 12 + h(9) * 5 })
      if (h(10) < 0.3) out.push({ prop: 'sandrock', x: side * (PATH_HALF + 1.2 + h(11) * 2.5), y: -0.2, z: at(12), rotY: h(13) * 6.28, scale: 0.6 + h(14) * 0.9 })
      if (h(15) < 0.3) out.push({ prop: 'grassGold', x: side * (PATH_HALF + 0.6 + h(16) * 2), y: 0, z: at(17), rotY: h(18) * 6.28, scale: 0.5 + h(19) * 0.3 })
      break
    }
    case 'swamp': {
      // black water on both sides of a boardwalk: reeds, half-sunk logs, mangrove roots, dark trees
      landBank(out, zc, side, 13)
      for (let n = 0; n < 3; n++) out.push({ prop: 'reeds', x: side * (PATH_HALF + 0.8 + h(n) * 9), y: WATER_Y - 0.1, z: at(n + 10), rotY: h(n + 20) * 6.28, scale: 1 + h(n + 30) * 0.8 })
      if (h(40) < 0.3) out.push({ prop: 'trunk', x: side * (5 + h(41) * 6), y: WATER_Y - 0.25, z: at(42), rotY: h(43) * 6.28, scale: [3, 0.55, 0.6] })
      if (h(45) < 0.45) out.push({ prop: 'rootset', x: side * (6 + h(46) * 6), y: WATER_Y - 0.1, z: at(47), rotY: h(48) * 6.28, scale: 1.3 + h(49) * 1 })
      if (h(50) < 0.55) out.push({ prop: TREES[Math.floor(h(51) * 3)], x: side * (8 + h(52) * 6), y: WATER_Y + 0.2, z: at(53), rotY: h(54) * 6.28, scale: 9 + h(55) * 5 })
      if (h(56) < 0.6) out.push({ prop: TREES[Math.floor(h(57) * 3)], x: side * (15 + h(58) * 8), y: 0, z: at(59), rotY: h(60) * 6.28, scale: 11 + h(61) * 5 })
      for (let n = 0; n < 2; n++) if (h(n + 70) < 0.5) out.push({ prop: 'vine', x: side * (PATH_HALF + 0.6 + h(n + 71) * 3), y: 2.4 + h(n + 72) * 2, z: at(n + 73), rotY: 0, scale: [0.07, 4 + h(n + 74) * 3, 0.07] })
      break
    }
    case 'volcanic': {
      // black basalt, glowing lava channels, scorched trunks, a smoking cone on the skyline
      landBank(out, zc, side, PATH_HALF + 0.4, 'bankBasalt')
      if (Math.floor(k / 3) % 2 === (side === 1 ? 0 : 1)) out.push({ prop: 'lava', x: side * (6.5 + h(1) * 2), y: -0.02, z: zc, rotY: (h(2) - 0.5) * 0.3, scale: [1.2 + h(3) * 1.5, 0.04, SEG + 0.05] })
      for (let n = 0; n < 2; n++) if (h(n + 5) < 0.55) out.push({ prop: 'basalt', x: side * (PATH_HALF + 1.4 + h(n + 6) * 8), y: -0.2, z: at(n + 7), rotY: h(n + 8) * 6.28, scale: 0.6 + h(n + 9) * 1.6 })
      if (h(20) < 0.3) out.push({ prop: 'trunk', x: side * (5 + h(21) * 6), y: 0, z: at(22), rotY: h(23) * 6.28, rotZ: 1.2, scale: [3.4, 0.6, 0.7] })
      if (h(25) < 0.35) out.push({ prop: 'stump', x: side * (5 + h(26) * 7), y: 0, z: at(27), rotY: h(28) * 6.28, scale: 0.9 + h(29) * 0.6 })
      if (k % 6 === (side === 1 ? 0 : 3)) out.push({ prop: 'mountain', x: side * (40 + h(30) * 12), y: -1, z: at(31), rotY: h(32) * 6.28, scale: 26 + h(33) * 14 })
      break
    }
    case 'coast': {
      // sea on the left: a sandy beach running down to the water; palms and jungle on the right
      if (side > 0) {
        out.push({ prop: 'bankSand', x: side * (PATH_HALF + 0.4 + 2.5), y: -4.04, z: zc, rotY: 0, scale: [5, 4, SEG + 0.02] })
        out.push({ prop: 'bankSand', x: side * (PATH_HALF + 5.4 + 3), y: -4.5, z: zc, rotY: 0, scale: [6, 4, SEG + 0.02], rotZ: 0.06 })
        if (h(1) < 0.4) out.push({ prop: 'palm', x: side * (5 + h(2) * 3), y: 0, z: at(3), rotY: Math.PI + (h(4) - 0.5), scale: 6 + h(5) * 3 })
        if (h(6) < 0.3) out.push({ prop: 'pebble', x: side * (9 + h(7) * 10), y: WATER_Y - 0.25, z: at(8), rotY: h(9) * 6.28, scale: 0.6 + h(10) * 1 })
      } else {
        landBank(out, zc, side, PATH_HALF + 0.4, 'bankSand')
        for (let n = 0; n < 2; n++) if (h(n + 20) < 0.65) out.push({ prop: 'palm', x: side * (5 + h(n + 21) * 9), y: 0, z: at(n + 22), rotY: h(n + 23) * 1.6 - 0.8, scale: 6 + h(n + 24) * 4 })
        for (let n = 0; n < 2; n++) out.push({ prop: h(n + 30) < 0.5 ? 'fern' : 'grass', x: side * (PATH_HALF + 0.7 + h(n + 31) * 3), y: 0, z: at(n + 32), rotY: h(n + 33) * 6.28, scale: 0.6 + h(n + 34) * 0.5 })
        if (h(40) < 0.5) out.push({ prop: TREES[Math.floor(h(41) * 3)], x: side * (13 + h(42) * 10), y: 0, z: at(43), rotY: h(44) * 6.28, scale: 11 + h(45) * 6 })
      }
      break
    }
    case 'blossom': {
      // spring valley: pink blossom trees, fresh grass, petals on the wind
      landBank(out, zc, side, PATH_HALF + 0.4, 'bankHill')
      for (let n = 0; n < 3; n++) if (h(n + 1) < 0.85) out.push({ prop: BTREES[Math.floor(h(n + 2) * 3)], x: side * (5 + n * 5 + h(n + 3) * 3), y: 0, z: at(n + 4), rotY: h(n + 5) * 6.28, scale: 8 + h(n + 6) * 5 })
      for (let n = 0; n < 3; n++) out.push({ prop: h(n + 10) < 0.6 ? 'grass' : 'bush', x: side * (PATH_HALF + 0.6 + h(n + 11) * 4), y: 0, z: at(n + 12), rotY: h(n + 13) * 6.28, scale: 0.4 + h(n + 14) * 0.3 })
      if (h(20) < 0.15) out.push({ prop: 'mossrocks', x: side * (6 + h(21) * 4), y: -0.1, z: at(22), rotY: h(23) * 6.28, scale: 0.9 + h(24) * 0.6 })
      if (k % 4 === (side === 1 ? 1 : 3)) out.push({ prop: 'mountain', x: side * (38 + h(30) * 14), y: 0, z: at(31), rotY: h(32) * 6.28, scale: 20 + h(33) * 12 })
      break
    }
    case 'ice': {
      // frozen wilds: snow banks, ice spires and glassy boulders, a few frosted pines
      out.push({ prop: 'bankSnow', x: side * (PATH_HALF + 0.4 + 22), y: -4.04, z: zc, rotY: 0, scale: [44, 4, SEG + 0.02] })
      if (h(1) < 0.45) out.push({ prop: 'ice', x: side * (5 + h(2) * 8), y: -0.3, z: at(3), rotY: h(4) * 6.28, scale: [1 + h(5) * 1.4, 2.5 + h(6) * 4, 1 + h(7) * 1.4] })
      if (h(10) < 0.45) out.push({ prop: 'icerock', x: side * (9 + h(11) * 4), y: -0.5, z: at(12), rotY: h(13) * 6.28, scale: 6 + h(14) * 5 })
      if (h(20) < 0.4) out.push({ prop: 'pineSnow', x: side * (12 + h(21) * 12), y: 0, z: at(22), rotY: h(23) * 6.28, scale: 8 + h(24) * 6 })
      if (k % 5 === (side === 1 ? 0 : 2)) out.push({ prop: 'mountain', x: side * (40 + h(30) * 14), y: 0, z: at(31), rotY: h(32) * 6.28, scale: 24 + h(33) * 12 })
      break
    }
    case 'birch': {
      // a pale birch wood: slim white trunks in rows, yellow-green crowns, ferns
      landBank(out, zc, side)
      for (let n = 0; n < 4; n++) if (h(n) < 0.8) out.push({ prop: 'birch', x: side * (5 + n * 3.5 + h(n + 10) * 3), y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, rotZ: (h(n + 40) - 0.5) * 0.1, scale: 8 + h(n + 50) * 5 })
      if (h(60) < 0.4) out.push({ prop: h(61) < 0.5 ? 'wtree1' : 'wtree2', x: side * (16 + h(62) * 10), y: 0, z: at(63), rotY: h(64) * 6.28, scale: 11 + h(65) * 5 })
      for (let n = 0; n < 2; n++) out.push({ prop: 'fern', x: side * (PATH_HALF + 0.7 + h(n + 70) * 3), y: 0, z: at(n + 71), rotY: h(n + 72) * 6.28, scale: 0.6 + h(n + 73) * 0.4 })
      break
    }
  }
}

/** A zone's own dressing on top of its kit, so zones sharing a kit still read as different places. */
function flavorScenery(out: Placement[], k: number, b: BiomeId, f: Flavor) {
  if (!f) return
  const open = b === 'river' || b === 'swamp' || b === 'waterfall'
  for (const side of [-1, 1]) {
    const h = (n: number) => hash01(k, (side === 1 ? 5 : 6) * 1013 + n)
    const at = (n: number) => k * SEG + h(n) * SEG
    const y = open ? WATER_Y : 0
    switch (f) {
      case 'flower':
        for (let n = 0; n < 3; n++) out.push({ prop: h(n) < 0.6 ? 'anthurium' : 'calathea', x: side * (PATH_HALF + 0.7 + h(n + 1) * 2.5), y, z: at(n + 2), rotY: h(n + 3) * 6.28, scale: 0.7 + h(n + 4) * 0.5 })
        break
      case 'roots':
        if (h(10) < 0.6) out.push({ prop: 'rootset', x: side * (PATH_HALF + 1.2 + h(11) * 3), y, z: at(12), rotY: h(13) * 6.28, scale: 1.2 + h(14) * 0.9 })
        break
      case 'vines':
        for (let n = 0; n < 3; n++) if (h(n + 20) < 0.7) out.push({ prop: 'vine', x: side * (PATH_HALF + 0.2 + h(n + 21) * 2), y: 2 + h(n + 22) * 2.5, z: at(n + 23), rotY: 0, scale: [0.07, 5 + h(n + 24) * 3, 0.07] })
        break
      case 'ferns':
        for (let n = 0; n < 2; n++) out.push({ prop: 'fern', x: side * (PATH_HALF + 1 + h(n + 30) * 4), y, z: at(n + 31), rotY: h(n + 32) * 6.28, scale: 2.2 + h(n + 33) * 1.4 })
        break
      case 'rocks':
        if (h(40) < 0.5) out.push({ prop: b === 'ice' || b === 'snow' ? 'icerock' : b === 'savannah' || b === 'canyon' ? 'sandrock' : 'boulder', x: side * (PATH_HALF + 2 + h(41) * 6), y: y - 0.2, z: at(42), rotY: h(43) * 6.28, scale: 1.2 + h(44) * 1.8 })
        break
      case 'moss':
        if (h(50) < 0.5) out.push({ prop: 'mossrocks', x: side * (PATH_HALF + 1.5 + h(51) * 4), y: y - 0.1, z: at(52), rotY: h(53) * 6.28, scale: 1 + h(54) * 1 })
        if (h(55) < 0.5) out.push({ prop: 'fern', x: side * (PATH_HALF + 0.8 + h(56) * 2), y, z: at(57), rotY: h(58) * 6.28, scale: 0.9 + h(59) * 0.5 })
        break
      case 'jungle':
        for (let n = 0; n < 2; n++) out.push({ prop: h(n + 60) < 0.5 ? 'fern' : 'calathea', x: side * (PATH_HALF + 0.8 + h(n + 61) * 3), y, z: at(n + 62), rotY: h(n + 63) * 6.28, scale: 0.8 + h(n + 64) * 0.6 })
        if (h(70) < 0.4) out.push({ prop: TREES[Math.floor(h(71) * 3)], x: side * (9 + h(72) * 6), y: 0, z: at(73), rotY: h(74) * 6.28, scale: 10 + h(75) * 5 })
        break
      case 'thaw':
        if (h(80) < 0.5) out.push({ prop: 'ice', x: side * (PATH_HALF + 1.5 + h(81) * 6), y: WATER_Y - 0.3, z: at(82), rotY: h(83) * 6.28, scale: [1.5 + h(84) * 2, 0.4, 1.2 + h(85) * 2] })
        break
      case 'rail':
        // an old railway line beside the trail (right-hand side), half swallowed by the forest
        if (side < 0) {
          for (let n = 0; n < 4; n++) out.push({ prop: 'sleeper', x: -(PATH_HALF + 3.2), y: 0.02, z: k * SEG + n * 1.25 + 0.6, rotY: 0, scale: [2.6, 0.14, 0.28] })
          for (const dx of [-0.72, 0.72]) out.push({ prop: 'rail', x: -(PATH_HALF + 3.2) + dx, y: 0.16, z: k * SEG + SEG / 2, rotY: 0, scale: [0.09, 0.14, SEG + 0.01] })
        }
        break
    }
  }
  if (f === 'giant') for (const p of out) if (/^(tree|atree|btree|wtree|pine|palm|birch|acacia)/.test(p.prop)) p.scale = typeof p.scale === 'number' ? p.scale * 1.55 : [p.scale[0] * 1.4, p.scale[1] * 1.55, p.scale[2] * 1.4]
}

function segmentScenery(k: number, b: BiomeId, f: Flavor = ''): Placement[] {
  const out: Placement[] = []
  const z0 = k * SEG
  const zc = z0 + SEG / 2
  for (const side of [-1, 1]) {
    const h = (n: number) => hash01(k, (side === 1 ? 1 : 2) * 977 + n)
    const at = (n: number) => z0 + h(n) * SEG
    switch (b) {
      case 'forest': {
        landBank(out, zc, side)
        for (let n = 0; n < 3; n++) {
          const p = h(n)
          const prop = p < 0.35 ? 'fern' : p < 0.6 ? 'grass' : p < 0.8 ? 'calathea' : 'anthurium'
          out.push({ prop, x: side * (PATH_HALF + 0.7 + h(n + 10) * 1.6), y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, scale: prop === 'grass' ? 0.45 + h(n + 40) * 0.3 : 0.55 + h(n + 40) * 0.5 })
        }
        for (let n = 0; n < 2; n++) {
          const p = h(n + 50)
          const prop = p < 0.35 ? 'shrub' : p < 0.6 ? 'pachira' : p < 0.8 ? 'fern' : p < 0.9 ? 'rootset' : 'stump'
          out.push({ prop, x: side * (5.4 + h(n + 60) * 5), y: 0, z: at(n + 70), rotY: h(n + 80) * 6.28, scale: prop === 'fern' ? 1.1 + h(n + 90) * 0.6 : prop === 'shrub' ? 1.3 + h(n + 90) * 0.8 : prop === 'pachira' ? 1.6 + h(n + 90) : 0.8 + h(n + 90) * 0.5 })
        }
        if (h(100) < 0.6) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(101) * 3)], x: side * (6.5 + h(102) * 4), y: 0, z: at(103), rotY: h(104) * 6.28, scale: 9 + h(105) * 5 })
        if (h(110) < 0.55) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(111) * 3)], x: side * (13 + h(112) * 10), y: 0, z: at(113), rotY: h(114) * 6.28, scale: 12 + h(115) * 6 })
        if (h(120) < 0.15) out.push({ prop: 'mossrocks', x: side * (7 + h(121) * 4), y: -0.1, z: at(122), rotY: h(123) * 6.28, scale: 1 + h(124) * 0.8 })
        break
      }
      case 'hills': {
        landBank(out, zc, side)
        // stepped grassy terraces rising away from the trail
        out.push({ prop: 'bankHill', x: side * (10 + 15), y: 0.9 + h(1) * 1.2 - 4, z: zc, rotY: 0, scale: [30, 4, SEG + 0.02] })
        out.push({ prop: 'bankHill', x: side * (17 + 15), y: 2.6 + h(2) * 2.2 - 6, z: zc, rotY: 0, scale: [30, 6, SEG + 0.02] })
        for (let n = 0; n < 3; n++) out.push({ prop: h(n + 5) < 0.6 ? 'grass' : 'bush', x: side * (PATH_HALF + 0.7 + h(n + 10) * 4), y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, scale: 0.4 + h(n + 40) * 0.35 })
        if (h(50) < 0.35) out.push({ prop: h(51) < 0.5 ? 'mossrocks' : 'boulder', x: side * (5.5 + h(52) * 3.5), y: -0.1, z: at(53), rotY: h(54) * 6.28, scale: 1 + h(55) * 1.2 })
        if (h(60) < 0.25) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(61) * 3)], x: side * (11 + h(62) * 8), y: 1.5, z: at(63), rotY: h(64) * 6.28, scale: 8 + h(65) * 5 })
        if (k % 3 === (side === 1 ? 0 : 1)) out.push({ prop: 'mountain', x: side * (34 + h(70) * 14), y: 0, z: at(71), rotY: h(72) * 6.28, scale: 22 + h(73) * 14 })
        break
      }
      case 'waterfall': {
        // a gorge: rock walls rising out of the river on both sides, trees along the rim
        out.push({ prop: 'rockface', x: side * (9 + h(1) * 1.5), y: WATER_Y - 0.4, z: zc + (h(2) - 0.5) * 2, rotY: h(3) * 6.28, scale: 9 + h(4) * 3 })
        if (h(5) < 0.5) out.push({ prop: 'rockface', x: side * (14 + h(6) * 3), y: 3, z: at(7), rotY: h(8) * 6.28, scale: 10 + h(9) * 4 })
        if (h(10) < 0.5) out.push({ prop: 'pebble', x: side * (PATH_HALF + 1.2 + h(11) * 3), y: WATER_Y - 0.2, z: at(12), rotY: h(13) * 6.28, scale: 0.6 + h(14) * 0.6 })
        out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(20) * 3)], x: side * (12 + h(21) * 5), y: 9, z: at(22), rotY: h(23) * 6.28, scale: 8 + h(24) * 5 })
        if (h(30) < 0.6) out.push({ prop: 'fern', x: side * (10.5 + h(31) * 2), y: 8.6 + h(32), z: at(33), rotY: h(34) * 6.28, scale: 1.2 + h(35) * 0.6 })
        break
      }
      case 'river': {
        landBank(out, zc, side, 15)
        if (h(1) < 0.55) out.push({ prop: h(2) < 0.6 ? 'pebble' : 'mossrocks', x: side * (5 + h(3) * 8), y: WATER_Y - 0.25, z: at(4), rotY: h(5) * 6.28, scale: 0.5 + h(6) * 0.9 })
        for (let n = 0; n < 2; n++) out.push({ prop: h(n + 10) < 0.5 ? 'fern' : 'calathea', x: side * (15.4 + h(n + 11) * 3), y: 0, z: at(n + 12), rotY: h(n + 13) * 6.28, scale: 0.9 + h(n + 14) * 0.6 })
        if (h(20) < 0.65) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(21) * 3)], x: side * (17 + h(22) * 8), y: 0, z: at(23), rotY: h(24) * 6.28, scale: 10 + h(25) * 6 })
        break
      }
      case 'jungle': {
        // deep jungle: big trees right at the trail edge, hanging vines, dense undergrowth
        landBank(out, zc, side)
        for (let n = 0; n < 5; n++) {
          const p = h(n)
          const prop = p < 0.4 ? 'fern' : p < 0.6 ? 'calathea' : p < 0.8 ? 'shrub' : 'anthurium'
          out.push({ prop, x: side * (PATH_HALF + 0.6 + h(n + 10) * 2.4), y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, scale: prop === 'shrub' ? 1.1 + h(n + 40) * 0.6 : 0.8 + h(n + 40) * 0.7 })
        }
        for (let n = 0; n < 2; n++) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(n + 100) * 3)], x: side * (5.2 + h(n + 102) * 3.5), y: 0, z: at(n + 103), rotY: h(n + 104) * 6.28, scale: 11 + h(n + 105) * 6 })
        if (h(110) < 0.7) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(111) * 3)], x: side * (11 + h(112) * 8), y: 0, z: at(113), rotY: h(114) * 6.28, scale: 13 + h(115) * 6 })
        for (let n = 0; n < 3; n++) if (h(n + 120) < 0.6) out.push({ prop: 'vine', x: side * (PATH_HALF + 0.3 + h(n + 121) * 2.5), y: 2.2 + h(n + 122) * 2, z: at(n + 123), rotY: 0, scale: [0.07, 5 + h(n + 124) * 3, 0.07] })
        if (h(130) < 0.35) out.push({ prop: h(131) < 0.5 ? 'rootset' : 'stump', x: side * (PATH_HALF + 1.5 + h(132) * 2), y: 0, z: at(133), rotY: h(134) * 6.28, scale: 0.9 + h(135) * 0.5 })
        break
      }
      case 'bamboo': {
        // a bamboo grove: dense culms right up to a narrow trail, leaf litter, low ferns
        landBank(out, zc, side)
        for (let n = 0; n < 9; n++) {
          const x = side * (PATH_HALF + 0.7 + h(n) * h(n + 40) * 9)
          out.push({ prop: 'bamboo', x, y: 0, z: at(n + 10), rotY: h(n + 20) * 6.28, rotZ: (h(n + 30) - 0.5) * 0.12, scale: [0.9 + h(n + 50) * 0.5, 8 + h(n + 60) * 6, 0.9 + h(n + 50) * 0.5] })
        }
        for (let n = 0; n < 2; n++) out.push({ prop: 'fern', x: side * (PATH_HALF + 0.6 + h(n + 70) * 2), y: 0, z: at(n + 71), rotY: h(n + 72) * 6.28, scale: 0.6 + h(n + 73) * 0.4 })
        break
      }
      case 'pine':
      case 'snow': {
        // conifer forest: rows of tall pines, fallen logs, rocks (snow-laden in the Snow Forest)
        out.push({ prop: b === 'snow' ? 'bankSnow' : 'bank', x: side * (PATH_HALF + 0.4 + 22), y: -4.04, z: zc, rotY: 0, scale: [44, 4, SEG + 0.02] })
        const tree = b === 'snow' ? 'pineSnow' : 'pine'
        for (let n = 0; n < 4; n++) {
          if (h(n) > 0.85) continue
          const far = n < 2 ? 5 + h(n + 10) * 4 : 11 + h(n + 10) * 12
          out.push({ prop: tree, x: side * far, y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, scale: 9 + h(n + 40) * 7 })
        }
        if (h(50) < 0.2) out.push({ prop: 'trunk', x: side * (PATH_HALF + 1.8 + h(51) * 2), y: 0, z: at(52), rotY: Math.PI / 2 + (h(53) - 0.5), scale: [3.2, 0.6, 0.65] })
        if (h(60) < 0.3) out.push({ prop: h(61) < 0.5 ? 'mossrocks' : 'boulder', x: side * (PATH_HALF + 1.5 + h(62) * 4), y: -0.1, z: at(63), rotY: h(64) * 6.28, scale: 0.8 + h(65) * 0.9 })
        if (b === 'pine') for (let n = 0; n < 2; n++) out.push({ prop: 'grass', x: side * (PATH_HALF + 0.6 + h(n + 70) * 3), y: 0, z: at(n + 71), rotY: h(n + 72) * 6.28, scale: 0.4 + h(n + 73) * 0.3 })
        break
      }
      case 'autumn': {
        // broadleaf forest in autumn colours, leaf-covered banks, stumps and fallen logs
        landBank(out, zc, side)
        for (let n = 0; n < 2; n++) out.push({ prop: (['atree1', 'atree2', 'atree3'] as const)[Math.floor(h(n + 100) * 3)], x: side * (5.5 + n * 6 + h(n + 102) * 4), y: 0, z: at(n + 103), rotY: h(n + 104) * 6.28, scale: 10 + h(n + 105) * 6 })
        if (h(110) < 0.5) out.push({ prop: (['atree1', 'atree2', 'atree3'] as const)[Math.floor(h(111) * 3)], x: side * (16 + h(112) * 10), y: 0, z: at(113), rotY: h(114) * 6.28, scale: 13 + h(115) * 6 })
        for (let n = 0; n < 2; n++) out.push({ prop: h(n) < 0.5 ? 'bush' : 'grass', x: side * (PATH_HALF + 0.7 + h(n + 10) * 2.5), y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, scale: 0.45 + h(n + 40) * 0.3 })
        if (h(120) < 0.2) out.push({ prop: h(121) < 0.5 ? 'stump' : 'trunk', x: side * (PATH_HALF + 1.6 + h(122) * 2), y: 0, z: at(123), rotY: h(124) * 6.28, scale: h(121) < 0.5 ? 0.9 : [2.6, 0.55, 0.6] })
        break
      }
      case 'moonlit': {
        // an old, quieter forest: tall trunks, mossy boulders, stumps, low ferns
        landBank(out, zc, side)
        for (let n = 0; n < 3; n++) {
          const p = h(n)
          const prop = p < 0.5 ? 'fern' : p < 0.75 ? 'grass' : 'bush'
          out.push({ prop, x: side * (PATH_HALF + 0.7 + h(n + 10) * 2.5), y: 0, z: at(n + 20), rotY: h(n + 30) * 6.28, scale: prop === 'grass' ? 0.45 + h(n + 40) * 0.3 : 0.6 + h(n + 40) * 0.5 })
        }
        if (h(100) < 0.75) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(101) * 3)], x: side * (6 + h(102) * 5), y: 0, z: at(103), rotY: h(104) * 6.28, scale: 12 + h(105) * 6 })
        if (h(110) < 0.6) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(111) * 3)], x: side * (14 + h(112) * 10), y: 0, z: at(113), rotY: h(114) * 6.28, scale: 14 + h(115) * 6 })
        if (h(120) < 0.35) out.push({ prop: 'mossrocks', x: side * (5.5 + h(121) * 4), y: -0.1, z: at(122), rotY: h(123) * 6.28, scale: 1.1 + h(124) * 0.9 })
        if (h(130) < 0.2) out.push({ prop: 'stump', x: side * (PATH_HALF + 1.4 + h(131) * 2.5), y: 0, z: at(132), rotY: h(133) * 6.28, scale: 0.9 + h(134) * 0.4 })
        break
      }
      case 'savannah':
      case 'desert':
      case 'canyon':
      case 'swamp':
      case 'volcanic':
      case 'coast':
      case 'blossom':
      case 'ice':
      case 'birch':
        kitScenery(out, k, b, side, h, at, zc)
        break
      case 'ruins': {
        landBank(out, zc, side)
        if (h(1) < 0.55) {
          const tall = h(2) < 0.6
          const ph = tall ? 3.8 + h(3) * 2.5 : 1 + h(3) * 1.4
          out.push({ prop: 'pillar', x: side * (4.6 + h(4) * 2.5), y: 0, z: at(5), rotY: h(6) * 6.28, scale: [1, ph, 1], rotZ: tall ? 0 : (h(7) - 0.5) * 0.2 })
          if (tall) out.push({ prop: 'block', x: side * (4.6 + h(4) * 2.5), y: ph, z: at(5), rotY: h(6), scale: [1.35, 0.4, 1.35] })
        }
        if (h(10) < 0.45) out.push({ prop: 'block', x: side * (8 + h(11) * 6), y: -0.2, z: at(12), rotY: (h(13) - 0.5) * 0.4, scale: [0.9, 1 + h(14) * 2, 2.5 + h(15) * 2.5] })
        if (h(16) < 0.4) out.push({ prop: 'block', x: side * (5.2 + h(17) * 3), y: 0, z: at(18), rotY: h(19) * 6.28, scale: [0.7, 0.5, 0.9], rotZ: (h(20) - 0.5) * 0.5 })
        for (let n = 0; n < 2; n++) out.push({ prop: h(n + 30) < 0.5 ? 'fern' : 'anthurium', x: side * (PATH_HALF + 0.8 + h(n + 31) * 3), y: 0, z: at(n + 32), rotY: h(n + 33) * 6.28, scale: 0.6 + h(n + 34) * 0.6 })
        if (h(40) < 0.5) out.push({ prop: (['tree1', 'tree2', 'tree3'] as const)[Math.floor(h(41) * 3)], x: side * (10 + h(42) * 10), y: 0, z: at(43), rotY: h(44) * 6.28, scale: 10 + h(45) * 6 })
        break
      }
    }
  }
  // painted jungle depth layers behind the props, so the forest reads dense in every world
  for (const side of [-1, 1]) {
    const far = b === 'river' ? 6 : b === 'waterfall' ? 6 : b === 'hills' ? 14 : 0
    const base = b === 'waterfall' ? 8.5 : b === 'hills' ? 3 : 0
    // conifer, autumn and snow forests have their own tree rows instead of the painted jungle walls
    const OPEN: BiomeId[] = ['pine', 'snow', 'autumn', 'savannah', 'desert', 'canyon', 'volcanic', 'coast', 'blossom', 'ice', 'birch']
    const layers = OPEN.includes(b) || (b === 'swamp' && side > 0) ? [] : b === 'swamp' ? [[16, 11]] : b === 'hills' ? [[13, 7]] : b === 'jungle' || b === 'bamboo' ? [[8.5, 10], [12, 13], [17, 17]] : [[10.5, 9], [15, 12], [21, 16]]
    for (const [i, [lx, lh]] of layers.entries()) out.push({ prop: 'wall', x: side * (lx + far), y: base - 0.3, z: zc, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2, scale: [SEG + 0.05, lh, 1], rotX: i * 0.001 })
  }
  // an archway over the trail every 30 m of ruins
  if (b === 'ruins' && k % 6 === 0) {
    for (const side of [-1, 1]) out.push({ prop: 'pillar', x: side * 4.3, y: 0, z: zc, rotY: 0, scale: [1.1, 5.6, 1.1] })
    out.push({ prop: 'block', x: 0, y: 5.6, z: zc, rotY: 0, scale: [10.2, 1, 1.4] })
  }
  flavorScenery(out, k, b, f)
  return out
}

const sceneryCache = new Map<number, Placement[]>()
function scenery(k: number, b: BiomeId = biomeId(k * SEG + SEG / 2), f: Flavor = flavorAt(k * SEG + SEG / 2)) {
  const key = (k * 16 + FLAVORS.indexOf(f)) * 32 + BIOME_INDEX[b]
  let v = sceneryCache.get(key)
  if (!v) {
    v = segmentScenery(k, b, f)
    sceneryCache.set(key, v)
    if (sceneryCache.size > 300) sceneryCache.delete(sceneryCache.keys().next().value!)
  }
  return v
}

/** Waterfall sheets down the gorge walls (absolute z), facing the trail. */
function waterfallsAt(k: number): { x: number; z: number; w: number; side: number }[] {
  if (biomeId(k * SEG + SEG / 2) !== 'waterfall') return []
  const out = []
  for (const side of [-1, 1]) if ((k + (side === 1 ? 0 : 1)) % 2 === 0 && hash01(k, side + 40) < 0.8) out.push({ x: side * (7.6 + hash01(k, side + 41) * 0.8), z: k * SEG + hash01(k, side + 42) * SEG, w: 3 + hash01(k, side + 43) * 2.5, side })
  return out
}

/** Bridge planks in the waterfall gorge and across the whole river. */
type Surface = 'stone' | 'plank' | 'ruin' | 'mud' | 'snow' | 'leaf' | 'sand' | 'dirt' | 'basalt' | 'ice'
function surfaceAt(d: number, b: BiomeId = biomeId(d)): Surface {
  const sec = view.showcase ? null : run.sim?.sectionAt(d)
  if (sec?.kind === 'bridge') return 'plank'
  // a boardwalk over the swamp; along a river the trail is a raised earth bank
  if (b === 'swamp') return 'plank'
  if (b === 'river') return 'mud'
  if (b === 'desert' || b === 'coast') return 'sand'
  if (b === 'savannah' || b === 'canyon') return 'dirt'
  if (b === 'volcanic') return 'basalt'
  if (b === 'ice') return 'ice'
  if (b === 'blossom' || b === 'birch') return 'mud'
  if (b === 'ruins') return 'ruin'
  if (b === 'jungle' || b === 'moonlit' || b === 'bamboo' || b === 'pine') return 'mud'
  if (b === 'snow') return 'snow'
  if (b === 'autumn') return 'leaf'
  if (b === 'waterfall') {
    const k = Math.floor(d / SEG)
    // a worn earth trail through the gorge, with a short timber bridge now and then
    return k % 9 === 4 ? 'plank' : 'mud'
  }
  // trails are packed earth, never a paved road
  if (b === 'forest') return 'mud'
  return 'dirt'
}

// ---------------------------------------------------------------- items on the trail

const broken = new Map<number, number>()
const fallen = new Map<number, number>()

function itemPlacements(it: Item, z: number, now: number, out: Placement[]) {
  const x = laneX(it.lane)
  const r = hash01(it.id, 7)
  // knocked away: fly up and off the trail, shrinking
  let lift = 0
  let fade = 1
  let off = 0
  let tumble = 0
  if (it.broken) {
    let t0 = broken.get(it.id)
    if (t0 === undefined) {
      t0 = now
      broken.set(it.id, now)
      if (broken.size > 200) broken.delete(broken.keys().next().value!)
    }
    const p = Math.min(1, (now - t0) / 550)
    if (p >= 1) return
    lift = p * 2.2 - p * p * 1.2
    fade = 1 - p * 0.85
    off = (it.lane === 1 ? (r < 0.5 ? -1 : 1) : it.lane === 0 ? 1 : -1) * p * 3.5
    tumble = p * 4
  }
  const s = (v: [number, number, number]): [number, number, number] => [v[0] * fade, v[1] * fade, v[2] * fade]
  const X = x + off
  if (it.fall && !it.broken) {
    out.push({ prop: 'shadowDisc', x, y: 0.03, z, rotY: 0, scale: [1.1, 1, 1.1] })
    if (it.h === 0) return
    let t0 = fallen.get(it.id)
    if (t0 === undefined) {
      t0 = now
      fallen.set(it.id, now)
      if (fallen.size > 100) fallen.delete(fallen.keys().next().value!)
    }
    const p = Math.min(1, (now - t0) / 480)
    lift = 16 * (1 - p) * (1 - p)
    tumble = (1 - p) * 3
  }
  switch (it.kind) {
    case 'log':
      out.push({ prop: 'trunk', x: X, y: lift, z, rotY: (r - 0.5) * 0.2, rotZ: tumble, scale: s([2.3, 0.55, 0.6]) })
      break
    case 'roots':
      out.push({ prop: 'rootset', x: X, y: lift - 0.05, z, rotY: r < 0.5 ? 0 : Math.PI, rotZ: tumble, scale: s([2.1, 0.5, 1.0]) })
      break
    case 'trap':
      out.push({ prop: 'trapBase', x: X, y: lift, z, rotY: 0, rotZ: tumble, scale: s([1.9, 0.12, 0.95]) })
      out.push({ prop: 'trapSpikes', x: X, y: lift + 0.05, z, rotY: 0, rotZ: tumble, scale: s([1.7, 0.42, 0.75]) })
      break
    case 'rock':
      out.push({ prop: 'boulder', x: X, y: lift - 0.1, z, rotY: r * 6.28, rotZ: tumble, scale: s([1.9, 1.55, 1.7]) })
      break
    case 'ruin':
      out.push({ prop: 'block', x: X, y: lift, z, rotY: (r - 0.5) * 0.3, rotZ: tumble + (r - 0.5) * 0.1, scale: s([1.8, 2.1, 1.3]) })
      out.push({ prop: 'block', x: X + (r - 0.5) * 0.4, y: lift + 2.1 * fade, z, rotY: r * 3, rotZ: tumble + 0.12, scale: s([1.1, 0.6, 1.0]) })
      break
    case 'branch':
      out.push({ prop: 'trunk', x: X, y: 1.12 + lift, z, rotY: (r - 0.5) * 0.15, rotZ: tumble + (r - 0.5) * 0.08, scale: s([2.9, 0.42, 0.45]) })
      out.push({ prop: 'calathea', x: X + (r - 0.5) * 0.6, y: 1.5 + lift, z, rotY: r * 6.28, rotX: Math.PI, scale: s([2.3, 0.45, 1.1]) })
      if (!it.broken) for (const vx of [-1.15, 1.15]) out.push({ prop: 'vine', x: X + vx, y: 1.2, z, rotY: 0, scale: [0.06, 9, 0.06] })
      break
    case 'barrier':
      out.push({ prop: 'barrier', x: X, y: lift, z, rotY: 0, rotZ: tumble, scale: s([2.1, 2.3, 0.3]) })
      break
    case 'boulder':
      out.push({ prop: 'boulder', x: X, y: lift, z, rotY: 0, rotX: -it.d / 0.95, rotZ: tumble, scale: s([1.95, 1.9, 1.95]) })
      break
    case 'gap':
      for (const e of [-1, 1]) out.push({ prop: 'stub', x, y: -0.05, z: z + e * (it.len + 0.8), rotY: e > 0 ? Math.PI : 0, rotX: e * 0.08, scale: [2.0, 0.12, 0.6] })
      break
    case 'trolley':
      out.push({ prop: 'trolley', x, y: 0.16, z: z + 0.2, rotY: 0, scale: [1.5, 1.42, 2.15] })
      break
    case 'stream': {
      // running water in the cut, wet rocks along its banks
      out.push({ prop: 'waterQuad', x, y: -0.32, z, rotY: 0, scale: [LANE_W + 0.02, 0.05, it.len * 2] })
      for (const e of [-1, 1]) out.push({ prop: 'pebble', x: x + (r - 0.5) * 1.2, y: -0.25, z: z + e * (it.len + 0.15), rotY: r * 6 + e, scale: [0.9, 0.35, 0.6] })
      break
    }
    case 'rubble':
      out.push({ prop: 'mossrocks', x: X, y: lift - 0.15, z, rotY: r * 6.28, rotZ: tumble, scale: s([1.9, 0.6, 1.0]) })
      break
    case 'stalactite':
      out.push({ prop: 'stalactite', x: X, y: lift, z, rotY: 0, rotZ: tumble, scale: s([2.1, 2.45, 0.7]) })
      break
    case 'vine':
      // a thick hanging vine at the lip of the ravine (the runner carries it once grabbed), with leaves at its foot
      if (!it.passed) {
        out.push({ prop: 'vine', x, y: 1.1, z, rotY: 0, scale: [0.1, 8, 0.1] })
        out.push({ prop: 'vine', x: x + 0.18, y: 1.6, z: z + 0.1, rotY: 0, scale: [0.06, 7, 0.06] })
        out.push({ prop: 'calathea', x, y: 1.0, z, rotY: r * 6.28, scale: [0.6, 0.4, 0.6] })
      }
      break
  }
  if (it.frozen && !it.broken && it.kind !== 'gap') {
    const tall = it.kind === 'branch' ? 1.9 : it.kind === 'rock' || it.kind === 'boulder' || it.kind === 'ruin' || it.kind === 'barrier' ? 2.4 : 0.9
    out.push({ prop: 'ice', x, y: it.kind === 'branch' ? 0.9 : -0.05, z, rotY: r * 6.28, scale: [2.3, tall, Math.max(1.2, it.len * 2 + 0.5)] })
  }
}

// ---------------------------------------------------------------- frame source

/** what the world draws around: the runner's distance, and how far behind/ahead (menus look back down the trail) */
const view = { d: 0, behind: BEHIND, ahead: AHEAD, showcase: false }

/** wind grass on the land beside the trail: which clump colour a kit grows, if any */
const TUFT: Partial<Record<BiomeId, PropId>> = { forest: 'tuft', jungle: 'tuft', bamboo: 'tuft', blossom: 'tuft', birch: 'tuft', ruins: 'tuft', moonlit: 'tuftDark', pine: 'tuftDark', savannah: 'tuftGold', autumn: 'tuftAutumn' }
const TUFT_N: Record<Quality, number> = { low: 0, medium: 6, high: 14, ultra: 24 }
function grassAt(k: number, b: BiomeId, out: (p: Placement) => void) {
  const prop = TUFT[b]
  const n = TUFT_N[useSave.getState().settings.quality] ?? 0
  if (!prop || !n) return
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const h = (m: number) => hash01(k * 64 + i, (side === 1 ? 900 : 950) + m)
      // densest right at the verge, thinning out into the forest
      const x = side * (PATH_HALF + 0.35 + Math.pow(h(1), 1.6) * 8.5)
      out({ prop, x, y: -0.05, z: k * SEG + h(2) * SEG, rotY: h(3) * 6.28, scale: 0.55 + h(4) * 0.55 })
    }
  }
}

function makeSource() {
  let at = -1
  const buckets = new Map<PropId, Placement[]>()
  return (time: number) => {
    if (time === at) return buckets
    at = time
    for (const l of buckets.values()) l.length = 0
    const push = (p: Placement) => {
      let l = buckets.get(p.prop)
      if (!l) buckets.set(p.prop, (l = []))
      l.push(p)
    }
    const d = view.d
    // scenery
    const k0 = Math.floor((d - view.behind) / SEG)
    const k1 = Math.floor((d + view.ahead) / SEG)
    const fork = view.showcase ? null : junction()
    const emit = (p: Placement, lift = 0) => {
      // a sharp corner at the zone boundary: nothing on its inside may stand where the new road runs
      const cb = Math.round(p.z / ZONE_LEN) * ZONE_LEN
      const cdir = !view.showcase && Math.abs(p.z - cb) < 70 ? (track?.path.cornerDir(cb) ?? 0) : 0
      if (cdir && p.x * cdir > 0) {
        const u = p.z - (cb - CORNER_LEN / 2)
        const ax = Math.abs(p.x)
        if (u > -3 && u < 62) {
          // in the corner and just after it the inside verge is narrow: banks shrink, big props go
          if (BANKS.has(p.prop)) {
            const w = Math.max(0.6, CORNER_R - PATH_HALF - 0.9)
            p = { ...p, x: cdir * (PATH_HALF + 0.4 + w / 2), scale: [w, 4, SEG + 0.02] }
          } else if (ax > CORNER_R - 1.2) return
        }
      }
      // big rock models fill a cube their scale wide: keep the whole cube (any rotation) clear of the trail
      if (CLEAR_ROCK.has(p.prop)) {
        const half = (typeof p.scale === 'number' ? p.scale : Math.max(p.scale[0], p.scale[2])) * 0.62
        const minX = PATH_HALF + 1.3 + half
        if (Math.abs(p.x) < minX) p = { ...p, x: (p.x < 0 ? -1 : 1) * minX }
      }
      const z = p.z - d
      const big = BIG.test(p.prop)
      if (z > (big ? view.ahead : 70) || (!big && z < -70)) return
      push(lift ? { ...p, z, y: p.y + lift } : { ...p, z })
    }
    const inner = PATH_HALF + 0.6
    for (let k = k0; k <= k1; k++) {
      const zc = k * SEG + SEG / 2
      if (fork && zc >= fork.d && zc < fork.end) {
        // every route of the junction, each in its own world, on its own branch
        fork.routes.forEach((route, ri) => {
          const lift = liftOf(ri)
          const first = ri === 0
          const last = ri === fork.routes.length - 1
          for (const p of scenery(k, route.biome, '')) {
            // between two branches the scenery (and the wide ground banks) would cover the neighbouring road:
            // there each branch keeps only a narrow verge
            const between = (!first && p.x > inner) || (!last && p.x < -inner)
            if (between) {
              if (BANKS.has(p.prop)) emit({ ...p, x: Math.sign(p.x) * (PATH_HALF + 1.4), scale: [2, 4, SEG + 0.02] }, lift)
              continue
            }
            emit(p, lift)
          }
        })
      } else {
        const sec = view.showcase ? null : run.sim?.sectionAt(zc)
        const open = sec?.kind === 'bridge'
        for (const p of scenery(k)) if (!open || (!BANKS.has(p.prop) && Math.abs(p.x) > 11)) emit(p)
        if (!open) grassAt(k, biomeId(zc), emit)
      }
    }
    if (fork) {
      // rocky, wooded islands where neighbouring branches part
      for (let ri = 0; ri + 1 < fork.routes.length; ri++) {
        const lift = liftOf(ri)
        const sa = track?.slots.indexOf(ri) ?? 0
        const sb = track?.slots.indexOf(ri + 1) ?? 1
        for (let i = 0; i < 10; i++) {
          const sd = fork.d + 4 + i * 6
          const sep = branchGap(sd - d, sa, sb)
          if (sep < 3) continue
          const x = -sep / 2
          emit({ prop: i % 2 ? 'mossrocks' : 'boulder', x, y: -0.1, z: sd, rotY: i * 1.7, scale: 1.2 + Math.min(1.6, sep * 0.08) }, lift)
          if (sep > 9) emit({ prop: (['tree1', 'tree2', 'tree3'] as const)[i % 3], x, y: 0, z: sd + 2, rotY: i, scale: 9 + i }, lift)
          if (sep > 6) emit({ prop: 'fern', x: x + 1.2, y: 0, z: sd + 1, rotY: i * 2.3, scale: 1.2 }, lift)
        }
      }
    }
    // corner warning boards on the outside of the next sharp corner
    if (!view.showcase && track) {
      const cb = Math.ceil((d - 10) / ZONE_LEN) * ZONE_LEN
      const cdir = track.path.cornerDir(cb)
      if (cdir)
        for (const [i, u] of [-1.5, 1.8, 5.1].entries()) {
          const z = cb - CORNER_LEN / 2 + u - d
          if (z > -view.behind && z < view.ahead) push({ prop: 'chevron', x: -cdir * (PATH_HALF + 1.3 + i * 0.25), y: 0, z, rotY: cdir > 0 ? 0 : 0, scale: [cdir > 0 ? 2 : -2, 2.1, 0.12] })
        }
    }
    // trail: rows of tiles, holes where gaps are
    const sim = view.showcase ? null : run.sim
    const gaps = sim ? sim.items.filter((it) => (it.kind === 'gap' || it.kind === 'stream') && !it.gone) : []
    // challenge sections in view: railway track, bridge (no banks: open water below), cave vault
    if (sim) for (const sec of sim.sections) {
      if (sec.to < d - view.behind || sec.from > d + view.ahead) continue
      if (sec.kind === 'rail') {
        const lx = laneX(sec.lane)
        for (let rd = Math.max(sec.from, d - view.behind); rd < Math.min(sec.to, d + 70); rd += ROW) {
          const z = Math.floor(rd / ROW) * ROW + ROW / 2 - d
          push({ prop: 'sleeper', x: lx, y: 0.01, z, rotY: 0, scale: [2.0, 0.1, 0.24] })
          for (const e of [-0.72, 0.72]) push({ prop: 'rail', x: lx + e, y: 0.11, z, rotY: 0, scale: [0.08, 0.12, ROW + 0.01] })
        }
        // buffer stop at the end of the track
        const z = sec.to - 3 - d
        if (z > -view.behind && z < 70) {
          push({ prop: 'block', x: laneX(sec.lane), y: 0, z: z + 0.6, rotY: 0, scale: [1.9, 0.9, 0.5] })
          for (const e of [-0.7, 0.7]) push({ prop: 'post', x: laneX(sec.lane) + e, y: 0, z: z + 0.6, rotY: 0, scale: [0.18, 1.4, 0.18] })
        }
      }
      if (sec.kind === 'cave') {
        for (let k = Math.floor(sec.from / SEG); k * SEG < sec.to; k++) {
          const z = k * SEG + SEG / 2 - d
          if (z < -view.behind || z > view.ahead) continue
          push({ prop: 'caveRoof', x: 0, y: -0.8, z, rotY: 0, scale: [14, 7.4, SEG + 0.06] })
          if (k % 2 === 0) for (const side of [-1, 1]) push({ prop: 'crystal', x: side * (5 + hash01(k, side) * 0.6), y: 0, z: z + hash01(k, side + 3) * 3, rotY: hash01(k, side + 5) * 6, rotZ: side * 0.3, scale: 0.9 + hash01(k, side + 7) * 0.9 })
        }
      }
    }
    const r0 = Math.floor((d - view.behind) / ROW)
    const r1 = Math.floor((d + view.ahead) / ROW)
    for (let r = r0; r <= r1; r++) {
      const rd = r * ROW + ROW / 2
      if (fork && rd >= fork.d && rd < fork.end) {
        fork.routes.forEach((route, ri) => {
          const lift = liftOf(ri)
          trailRow(push, r, rd, rd - d, surfaceAt(rd, route.biome), lift === 0 ? gaps : [], lift)
        })
      } else trailRow(push, r, rd, rd - d, surfaceAt(rd), gaps, 0)
    }
    // obstacles
    if (sim) {
      const now = performance.now()
      for (const it of sim.items) {
        if (it.gone || !isObstacle(it.kind)) continue
        const z = it.d - d
        if (z < -BEHIND || z > AHEAD) continue
        itemPlacements(it, z, now, scratch)
      }
      for (const p of scratch) push(p)
      scratch.length = 0
    }
    return buckets
  }
}

const TILE: Record<Surface, PropId> = { stone: 'tileStone', plank: 'tilePlank', ruin: 'tileRuin', mud: 'tileMud', snow: 'tileSnow', leaf: 'tileLeaf', sand: 'tileSand', dirt: 'tileDirt', basalt: 'tileBasalt', ice: 'tileIce' }
/** One 1.25 m row of trail (tiles, kerbs or bridge rails), lifted onto the right branch when lift is set. */
function trailRow(push: (p: Placement) => void, r: number, rd: number, z: number, surf: ReturnType<typeof surfaceAt>, gaps: Item[], lift: number) {
  {
    {
      const prop = TILE[surf]
      const thick = surf === 'plank' ? 0.16 : 2.2
      const holes = gaps.filter((g) => Math.abs(g.d - rd) < g.len + 0.45)
      // the mud trail has no kerb: it runs a little wider, into the banks
      const soft = surf === 'mud' || surf === 'snow' || surf === 'leaf' || surf === 'sand' || surf === 'dirt' || surf === 'basalt' || surf === 'ice'
      if (!holes.length) push({ prop, x: 0, y: -thick + lift, z, rotY: 0, scale: [PATH_HALF * 2 + (soft ? 1.0 : 0), thick, ROW + 0.002] })
      else
        for (let lane = 0; lane < 3; lane++)
          if (!holes.some((g) => g.lane === lane)) push({ prop, x: laneX(lane), y: -thick + lift, z, rotY: 0, scale: [LANE_W + 0.002, thick, ROW + 0.002] })
      if (surf === 'plank') {
        // rope rails and pilings
        if (r % 2 === 0) {
          for (const side of [-1, 1]) {
            push({ prop: 'post', x: side * (PATH_HALF + 0.15), y: -2.6 + lift, z, rotY: 0, scale: [0.22, 3.75, 0.22] })
          }
          for (const px of [-LANE_W / 2, LANE_W / 2]) push({ prop: 'post', x: px, y: -2.6 + lift, z, rotY: 0, scale: [0.2, 2.45, 0.2] })
        }
        for (const side of [-1, 1]) for (const ry of [0.62, 1.05]) push({ prop: 'rope', x: side * (PATH_HALF + 0.15), y: ry + lift, z, rotY: 0, scale: [0.05, 0.05, ROW + 0.01] })
      } else if (!soft) {
        for (const side of [-1, 1]) push({ prop: 'curb', x: side * (PATH_HALF + 0.2), y: -0.9 + lift, z, rotY: 0, scale: [0.42, 1.02, ROW + 0.002] })
      }
    }
  }
}
const scratch: Placement[] = []

// ---------------------------------------------------------------- water, waterfalls, mist

function Water() {
  const nor = useTexture(`${TX}/riverbed_nor.jpg`)
  const bed = useTexture(`${TX}/riverbed_diff.jpg`)
  const { mat, bedMat, n } = useMemo(() => {
    const n = nor.clone()
    n.wrapS = n.wrapT = THREE.RepeatWrapping
    n.repeat.set(16, 64)
    n.needsUpdate = true
    const b = bed.clone()
    b.wrapS = b.wrapT = THREE.RepeatWrapping
    b.repeat.set(18, 76)
    b.colorSpace = THREE.SRGBColorSpace
    b.needsUpdate = true
    // deep, clear water: a dark body with a glossy clear coat, so the sky reflects strongly at grazing angles
    // (fresnel) and the riverbed shows through underfoot, instead of a flat painted sheet
    // (Ultra only: the clear coat is a second lighting pass; below Ultra a plain glossy surface is enough)
    const mat =
      useSave.getState().settings.quality === 'ultra'
        ? new THREE.MeshPhysicalMaterial({ color: '#1f4e4a', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.84, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.04, clearcoatNormalMap: n, clearcoatNormalScale: new THREE.Vector2(0.35, 0.35), specularIntensity: 1 })
        : new THREE.MeshStandardMaterial({ color: '#22524e', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.84, normalMap: n, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.5 })
    const bedMat = new THREE.MeshStandardMaterial({ map: b, color: '#7d8c74', roughness: 1 })
    return { mat, bedMat, n, b }
  }, [nor, bed])
  useFrame((st) => {
    // the water flows across the trail, from screen-right to left
    n.offset.set(st.clock.elapsedTime * 0.05, -view.d / (300 / 64))
    bedMat.map!.offset.y = -view.d / (300 / 76)
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 30]} material={mat} receiveShadow>
        <planeGeometry args={[140, 300, 28, 200]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y - 1.6, 30]} material={bedMat}>
        <planeGeometry args={[140, 300, 28, 200]} />
      </mesh>
    </group>
  )
}

const fallVert = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #ifdef WB_BEND
    wp.xyz = wbBend(wp.xyz);
    #endif
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`
const fallFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ns(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    float t = uTime;
    float s = ns(vec2(vUv.x * 14.0, vUv.y * 2.5 + t * 2.2)) * 0.6 + ns(vec2(vUv.x * 38.0, vUv.y * 6.0 + t * 3.4)) * 0.4;
    float streak = smoothstep(0.32, 0.86, s);
    vec3 col = mix(vec3(0.50, 0.72, 0.76), vec3(0.97, 1.0, 1.0), streak);
    float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    float lip = smoothstep(1.0, 0.95, vUv.y);
    float foam = smoothstep(0.16, 0.0, vUv.y);
    col = mix(col, vec3(1.0), foam * 0.85);
    float a = edge * lip * (0.5 + streak * 0.5 + foam * 0.3);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`

let mistTex: THREE.Texture | null = null
function softDot() {
  if (mistTex) return mistTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  mistTex = new THREE.CanvasTexture(c)
  return mistTex
}

const FALL_CAP = 24
function Waterfalls() {
  const fall = useRef<THREE.InstancedMesh>(null)
  const mist = useRef<THREE.InstancedMesh>(null)
  const { geo, mat, mistMat } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 } }, vertexShader: fallVert, fragmentShader: fallFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true })
    const mistMat = new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, opacity: 0.55, depthWrite: false, color: '#eef8ff' })
    return { geo, mat, mistMat }
  }, [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame((st) => {
    mat.uniforms.uTime.value = st.clock.elapsedTime
    const d = view.d
    let n = 0
    let nm = 0
    const k0 = Math.floor((d - view.behind) / SEG)
    const k1 = Math.floor((d + view.ahead) / SEG)
    for (let k = k0; k <= k1; k++)
      for (const f of waterfallsAt(k)) {
        if (n >= FALL_CAP) break
        const z = f.z - d
        q.setFromAxisAngle(v.set(0, 1, 0), f.side > 0 ? -Math.PI / 2 : Math.PI / 2)
        m.compose(v.set(f.x, WATER_Y, z), q, sc.set(f.w, 10.2, 1))
        fall.current?.setMatrixAt(n++, m)
        for (let j = 0; j < 3 && nm < FALL_CAP * 3; j++) {
          const pulse = (st.clock.elapsedTime * 0.6 + j / 3 + hash01(k, j)) % 1
          const size = 2.5 + pulse * 3
          q.identity()
          m.compose(v.set(f.x - f.side * (0.8 + pulse * 1.4), WATER_Y + 0.3 + pulse * 1.2, z + (j - 1) * f.w * 0.3), q, sc.set(size, size, 1))
          mist.current?.setMatrixAt(nm++, m)
        }
      }
    if (fall.current) {
      fall.current.count = n
      fall.current.instanceMatrix.needsUpdate = true
    }
    if (mist.current) {
      mist.current.count = nm
      mist.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      <instancedMesh ref={fall} args={[geo, mat, FALL_CAP]} frustumCulled={false} renderOrder={2} />
      <instancedMesh ref={mist} args={[new THREE.PlaneGeometry(1, 1), mistMat, FALL_CAP * 3]} frustumCulled={false} renderOrder={3} />
    </>
  )
}

// ---------------------------------------------------------------- coins, gems, tokens, power-up bubbles

const PICK_CAP = 120
const tM = new THREE.Matrix4()
const tQ = new THREE.Quaternion()
const tE = new THREE.Euler()
const tP = new THREE.Vector3()
const tS = new THREE.Vector3()

function coinGeometry() {
  // a minted coin: raised rim, recessed face
  const pts = [
    [0, 0.03],
    [0.22, 0.03],
    [0.24, 0.05],
    [0.29, 0.05],
    [0.31, 0.03],
    [0.31, -0.03],
    [0.29, -0.05],
    [0.24, -0.05],
    [0.22, -0.03],
    [0, -0.03],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(pts, 32)
  g.rotateX(Math.PI / 2)
  return g
}

function gemGeometry() {
  // brilliant cut: crown, girdle, pavilion
  const pts = [
    [0, 0.3],
    [0.17, 0.3],
    [0.3, 0.14],
    [0.3, 0.1],
    [0, -0.32],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(pts, 8).toNonIndexed()
  g.computeVertexNormals()
  return g
}

function Pickups() {
  const coins = useRef<THREE.InstancedMesh>(null)
  const gems = useRef<THREE.InstancedMesh>(null)
  const tokens = useRef<THREE.InstancedMesh>(null)
  const bubbles = useRef<THREE.InstancedMesh>(null)
  const icons = useRef<Record<PowerUpKind, THREE.InstancedMesh | null>>({ magnet: null, shield: null, speed: null, superjump: null, megajump: null, boost: null })
  const tex = useTexture({ magnet: puMagnet, shield: puShield, speed: puSpeed, superjump: puJump, megajump: puMega, boost: puBoost, mask: eventMask })
  const r = useMemo(() => {
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffc928', emissive: '#7a4a00', emissiveIntensity: 0.5, metalness: 1, roughness: 0.22 })
    const gemMat = new THREE.MeshPhysicalMaterial({ color: '#36c8ff', emissive: '#0b5bd6', emissiveIntensity: 0.55, metalness: 0.1, roughness: 0.05, clearcoat: 1, flatShading: true })
    for (const t of Object.values(tex)) t.colorSpace = THREE.SRGBColorSpace
    const tokenMat = new THREE.MeshStandardMaterial({ map: tex.mask, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, emissive: '#ff8a1c', emissiveMap: tex.mask, emissiveIntensity: 0.45, roughness: 0.5 })
    const bubbleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { c: { value: new THREE.Color('#bfefff') } },
      vertexShader: `#include <common>
varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);
#ifdef WB_BEND
wp.xyz = wbBend(wp.xyz);
#endif
vec4 mv = viewMatrix * wp; vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(mix(c, vec3(1.0), f), 0.12 + f * 0.75); }',
    })
    const iconMats = Object.fromEntries(POWER_KINDS.map((k) => [k, new THREE.MeshBasicMaterial({ map: tex[k], transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false })])) as Record<PowerUpKind, THREE.MeshBasicMaterial>
    const plane = new THREE.PlaneGeometry(0.8, 0.8)
    plane.rotateY(Math.PI)
    return { coinMat, gemMat, tokenMat, bubbleMat, iconMats, coin: coinGeometry(), gem: gemGeometry(), disc: new THREE.PlaneGeometry(0.75, 0.75).rotateY(Math.PI), sphere: new THREE.SphereGeometry(0.62, 28, 18), plane }
  }, [tex])

  useFrame((st) => {
    const sim = view.showcase ? null : run.sim
    const t = st.clock.elapsedTime
    const counts = { coin: 0, gem: 0, token: 0, bubble: 0, magnet: 0, shield: 0, speed: 0, superjump: 0, megajump: 0, boost: 0 }
    if (sim) {
      const d = view.d
      const s = sim.state
      const magnet = sim.powerOn('magnet') ? 6.5 : sim.animal.id === 'sonic' ? 2.4 : 0
      for (const it of sim.items) {
        if (it.gone || isObstacle(it.kind)) continue
        let z = it.d - d
        if (z < -2 || z > AHEAD) continue
        let x = laneX(it.lane)
        let y = it.h
        // pulled toward the runner by a magnet
        if (magnet && (it.kind === 'coin' || it.kind === 'gem') && z < magnet + 2 && z > -1) {
          const k = THREE.MathUtils.clamp(1 - (z - 0.5) / (magnet + 1.5), 0, 1) ** 2
          x += (s.x - x) * k
          y += (s.y + 0.6 - y) * k
          z *= 1 - k * 0.6
        }
        const bob = Math.sin(t * 3 + it.id) * 0.06
        if (it.kind === 'coin' && counts.coin < PICK_CAP) {
          tM.compose(tP.set(x, y + bob, z), tQ.setFromEuler(tE.set(0, t * 3.2 + it.id * 0.3, 0)), tS.setScalar(1))
          coins.current?.setMatrixAt(counts.coin++, tM)
        } else if (it.kind === 'gem' && counts.gem < 40) {
          tM.compose(tP.set(x, y + bob + 0.1, z), tQ.setFromEuler(tE.set(0, t * 2, 0)), tS.setScalar(1.15))
          gems.current?.setMatrixAt(counts.gem++, tM)
        } else if (it.kind === 'token' && counts.token < 40) {
          tM.compose(tP.set(x, y + bob + 0.1, z), tQ.setFromEuler(tE.set(0, Math.sin(t * 2 + it.id) * 0.6, 0)), tS.setScalar(1.2))
          tokens.current?.setMatrixAt(counts.token++, tM)
        } else if (isPowerUp(it.kind)) {
          const k = it.kind
          const py = 1.05 + Math.sin(t * 2.4 + it.id) * 0.12
          tM.compose(tP.set(x, py, z), tQ.identity(), tS.setScalar(1 + Math.sin(t * 4) * 0.03))
          if (counts.bubble < 20) bubbles.current?.setMatrixAt(counts.bubble++, tM)
          tM.compose(tP.set(x, py, z - 0.05), tQ.identity(), tS.setScalar(1))
          if (counts[k] < 10) icons.current[k]?.setMatrixAt(counts[k]++, tM)
        }
      }
    }
    const fin = (im: THREE.InstancedMesh | null, n: number) => {
      if (!im) return
      im.count = n
      im.instanceMatrix.needsUpdate = true
    }
    fin(coins.current, counts.coin)
    fin(gems.current, counts.gem)
    fin(tokens.current, counts.token)
    fin(bubbles.current, counts.bubble)
    for (const k of POWER_KINDS) fin(icons.current[k], counts[k])
  })

  return (
    <>
      <instancedMesh ref={coins} args={[r.coin, r.coinMat, PICK_CAP]} castShadow frustumCulled={false} />
      <instancedMesh ref={gems} args={[r.gem, r.gemMat, 40]} frustumCulled={false} />
      <instancedMesh ref={tokens} args={[r.disc, r.tokenMat, 40]} frustumCulled={false} />
      {POWER_KINDS.map((k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            icons.current[k] = el
          }}
          args={[r.plane, r.iconMats[k], 10]}
          frustumCulled={false}
          renderOrder={4}
        />
      ))}
      <instancedMesh ref={bubbles} args={[r.sphere, r.bubbleMat, 20]} frustumCulled={false} renderOrder={5} />
    </>
  )
}

// ---------------------------------------------------------------- particles (pickups, breaks, saves)

const FX_CAP = 260
interface Spark {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
  color: THREE.Color
  grav: number
}

function Effects() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const sparks = useRef<Spark[]>([])
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexColors: false }), [])
  useEffect(() => {
    const emit = (n: number, at: [number, number, number], color: string, speed: number, size: number, grav = 6, life = 0.6) => {
      const c = new THREE.Color(color)
      // small, few, and thrown forward (away from the chase camera): big glowing blobs right in front of the
      // lens hid the trail after every pickup or save
      n = Math.ceil(n * 0.55)
      size *= 0.5
      for (let i = 0; i < n; i++) {
        if (sparks.current.length >= FX_CAP) sparks.current.shift()
        const a = Math.random() * Math.PI * 2
        const u = Math.random() * 2 - 1
        const q = Math.sqrt(1 - u * u)
        const sp = speed * (0.5 + Math.random() * 0.5)
        sparks.current.push({ x: at[0], y: at[1], z: at[2], vx: Math.cos(a) * q * sp, vy: Math.abs(u) * sp + speed * 0.3, vz: Math.abs(Math.sin(a)) * q * sp + 0.6, life: 0, max: life * (0.7 + Math.random() * 0.6), size, color: c, grav })
      }
    }
    return onSimEvent((e) => {
      const s = run.sim?.state
      if (!s) return
      const me: [number, number, number] = [s.x, s.y + 0.7, 0.4]
      switch (e.type) {
        case 'coin':
          emit(5, me, '#ffd23a', 2.2, 0.28, 3, 0.35)
          break
        case 'gem':
          emit(12, me, '#56d8ff', 3, 0.35, 3, 0.5)
          break
        case 'token':
          emit(10, me, '#ff9a2e', 3, 0.35, 3, 0.5)
          break
        case 'pickup':
        case 'power':
          emit(22, [s.x, s.y + 0.8, 0], e.kind === 'shield' ? '#7fd3ff' : e.kind === 'magnet' ? '#ff5d8f' : e.kind === 'speed' ? '#ffb02e' : '#7dff8a', 4, 0.45, 1, 0.7)
          break
        case 'break':
          emit(16, [laneX(e.lane), 0.6, e.d - view.d], '#c8b48a', 5, 0.5, 9, 0.7)
          break
        case 'saved':
          emit(26, [s.x, s.y + 0.7, 0.3], e.by === 'loyal' ? '#ffd86b' : '#a6e4ff', 5, 0.5, 2, 0.8)
          break
        case 'ability':
          emit(30, [s.x, 0.4, 0.5], e.kind === 'frost' ? '#bfe9ff' : e.kind === 'roar' ? '#ffcf6b' : e.kind === 'stealth' ? '#9a7dff' : '#fff2c4', 6, 0.55, 1, 0.8)
          break
        case 'crash':
          emit(24, [s.x, 0.5, 0.6], '#d9c39a', 4.5, 0.6, 8, 0.9)
          break
        case 'rockfall':
          setTimeout(() => emit(26, [laneX(e.lane), 0.4, e.d - view.d], '#b8a888', 5, 0.7, 7, 0.9), 470)
          break
        case 'ride':
          emit(18, [s.x, s.y, 0.2], e.on ? '#ffd86b' : '#d9c39a', 3, 0.4, 5, 0.6)
          break
      }
    })
  }, [])
  useFrame((_, dt) => {
    const im = ref.current
    if (!im) return
    const list = sparks.current
    let n = 0
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.life += dt
      if (p.life >= p.max) {
        list.splice(i, 1)
        continue
      }
      p.vy -= p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const k = 1 - p.life / p.max
      tM.compose(tP.set(p.x, p.y, p.z), camera.quaternion, tS.setScalar(p.size * (0.4 + k * 0.6)))
      im.setMatrixAt(n, tM)
      im.setColorAt(n, tmpC.copy(p.color).multiplyScalar(k))
      n++
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[new THREE.PlaneGeometry(1, 1), mat, FX_CAP]} frustumCulled={false} renderOrder={6} />
}
const tmpC = new THREE.Color()

/** Rain streaks in the rain variant; speed lines while boosting. */
function Streaks({ variant }: { variant: () => Variant }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const drops = useMemo(() => Array.from({ length: 220 }, (_, i) => ({ x: (hash01(i, 1) - 0.5) * 26, y: hash01(i, 2) * 12, z: hash01(i, 3) * 40 - 4 })), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfefff', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }), [])
  useFrame((_, dt) => {
    const im = ref.current
    const sim = run.sim
    if (!im) return
    const rain = variant() === 'rain' || variant() === 'storm'
    const fast = !!sim && run.phase === 'running' && (sim.powerOn('speed') || sim.powerOn('boost') || sim.abilityOn('boost') || sim.abilityOn('charge') || !!sim.state.ride)
    let n = 0
    if (rain) {
      for (const p of drops) {
        p.y -= 16 * dt
        if (p.y < 0) p.y += 12
        tM.compose(tP.set(p.x, p.y, p.z), tQ.identity(), tS.set(0.02, 0.7, 0.02))
        im.setMatrixAt(n++, tM)
      }
    }
    if (fast) {
      for (let i = 0; i < 60; i++) {
        const p = drops[i]
        p.z -= 70 * dt
        if (p.z < -4) p.z += 40
        const a = hash01(i, 9) * Math.PI * 2
        tM.compose(tP.set(Math.cos(a) * (2.6 + hash01(i, 5) * 2), 1.4 + Math.sin(a) * (1.8 + hash01(i, 6)), p.z), tQ.identity(), tS.set(0.025, 0.025, 2.4))
        im.setMatrixAt(n++, tM)
      }
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[new THREE.BoxGeometry(1, 1, 1), mat, 300]} frustumCulled={false} userData={{ noBend: true }} />
}

// ---------------------------------------------------------------- runner

function poseNow(): WildPoseState {
  const sim = run.sim
  if (!sim) return { pose: 'idle', speed: 0, t: 0 }
  const s = sim.state
  if (run.phase === 'countdown') return { pose: 'idle', speed: 0, t: 0 }
  // a clean finish (end of the training run) is a celebration, not a crash
  if (!s.alive) return s.crashKind === null ? { pose: 'victory', speed: 0, t: 0 } : { pose: 'dead', speed: 0, t: 1 }
  const blink = s.t < s.invulnUntil ? (Math.floor(s.t / 120) % 2 ? 0.55 : 0.15) : 0
  if (s.ride && s.pose === 'run') return { pose: 'idle', speed: 0, t: 0, ghost: blink }
  return {
    pose: s.pose === 'jump' ? 'jump' : s.pose === 'slide' ? 'slide' : s.pose === 'roll' ? 'roll' : 'run',
    speed: run.phase === 'paused' ? 0 : s.speed,
    t: s.poseT,
    ghost: sim.abilityOn('stealth') ? 1 : blink,
    frost: sim.abilityOn('frost'),
  }
}

function Runner({ animalId }: { animalId: AnimalId }) {
  const g = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const shield = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const rope = useRef<THREE.Mesh>(null)
  const shieldMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { c: { value: new THREE.Color('#62c8ff') }, a: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 c; uniform float a; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(mix(c, vec3(1.0), f * 0.5), (0.06 + f * 0.7) * a); }',
      }),
    [],
  )
  useFrame((st, dt) => {
    const sim = run.sim
    if (!g.current || !lean.current) return
    const s = sim?.state
    const x = s?.x ?? 0
    g.current.position.set(x, s?.y ?? 0, 0)
    const tx = s ? laneX(s.lane) : 0
    lean.current.rotation.y += ((tx - x) * 0.12 - lean.current.rotation.y) * Math.min(1, dt * 12)
    lean.current.rotation.z += ((x - tx) * -0.05 - lean.current.rotation.z) * Math.min(1, dt * 12)
    const sh = !!sim && sim.powerOn('shield')
    if (shield.current) {
      shield.current.visible = sh
      const left = sim ? sim.powerLeft('shield') : 0
      shieldMat.uniforms.a.value = left < 2000 ? (Math.floor(st.clock.elapsedTime * 8) % 2 ? 1 : 0.35) : 1
      shield.current.rotation.y = st.clock.elapsedTime
    }
    if (rope.current) {
      const sw = s?.swing
      rope.current.visible = !!sw
      if (sw && s) {
        // from the paws' grip up to the anchor high over the middle of the ravine
        const az = (sw.from + sw.to) / 2 - s.d
        const ay = 8.5 - s.y
        const len = Math.hypot(az, ay - 1.1)
        rope.current.position.set(0, (1.1 + ay) / 2, az / 2)
        rope.current.scale.set(1, len, 1)
        rope.current.rotation.set(Math.atan2(az, ay - 1.1), 0, 0)
      }
    }
    if (ring.current) {
      const on = !!sim && sim.powerOn('magnet')
      ring.current.visible = on
      ring.current.rotation.z = st.clock.elapsedTime * 3
    }
  })
  return (
    <group ref={g}>
      <group ref={lean}>
        <Suspense fallback={null}>
          <WildAnimal animalId={animalId} poseOf={poseNow} onStep={emitDust} fur />
        </Suspense>
      </group>
      <mesh ref={shield} position={[0, 0.75, 0]} scale={[1.2, 1.05, 1.5]} material={shieldMat} visible={false}>
        <sphereGeometry args={[1, 32, 20]} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false}>
        <torusGeometry args={[1.1, 0.04, 8, 48]} />
        <meshBasicMaterial color="#ff5d8f" transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh ref={rope} visible={false}>
        <cylinderGeometry args={[0.05, 0.06, 1, 6]} />
        <meshStandardMaterial color="#3f5a1e" roughness={1} />
      </mesh>
      <BlobShadow />
    </group>
  )
}

// ---------------------------------------------------------------- race rivals and the finish line

const rivalPose = (r: Racer, race: NonNullable<typeof run.race>) => (): WildPoseState => {
  if (run.phase === 'countdown') return { pose: 'idle', speed: 0, t: 0 }
  if (r.finishMs !== null) return { pose: 'victory', speed: 0, t: 0 }
  if (race.t < r.stumbleUntil || r.pose === 'dead') return { pose: 'dead', speed: 0, t: 1 }
  const p = r.pose
  return { pose: p === 'jump' ? 'jump' : p === 'slide' ? 'slide' : p === 'roll' ? 'roll' : 'run', speed: r.speed, t: r.poseT }
}

function nameTag(name: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0.6)'
  g.beginPath()
  g.roundRect(4, 6, 248, 52, 24)
  g.fill()
  g.lineWidth = 5
  g.strokeStyle = color
  g.stroke()
  g.fillStyle = '#fff'
  g.font = 'bold 34px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(name.slice(0, 12), 128, 33)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Rival({ r }: { r: Racer }) {
  const g = useRef<THREE.Group>(null)
  const race = run.race!
  const poseOf = useMemo(() => rivalPose(r, race), [r, race])
  const tag = useMemo(() => new THREE.SpriteMaterial({ map: nameTag(r.name, r.color), depthTest: false, transparent: true }), [r.name, r.color])
  useFrame(() => {
    if (!g.current) return
    const z = r.d - (run.sim ? run.sim.runD() : 0)
    // only rivals near you are drawn (and never right on top of the camera)
    g.current.visible = !r.left && z > -12 && z < 70 && Math.abs(z) > 0.6
    g.current.position.set(r.x, r.y, z)
  })
  return (
    <group ref={g}>
      <Suspense fallback={null}>
        <WildAnimal animalId={r.animalId} poseOf={poseOf} onStep={emitDust} />
      </Suspense>
      <sprite material={tag} position={[0, 2.3, 0]} scale={[1.6, 0.4, 1]} userData={{ noBend: true }} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.55, 0.72, 32]} />
        <meshBasicMaterial color={r.color} transparent opacity={0.75} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Rivals() {
  // the race starts after the scene mounts (and changes on a rematch): follow it
  const [race, setRace] = useState(run.race)
  useFrame(() => {
    if (run.race !== race) setRace(run.race)
  })
  if (!race) return null
  return (
    <>
      {race.racers
        .filter((r) => r.id !== race.localId)
        .map((r) => (
          <Rival key={r.id} r={r} />
        ))}
      <FinishLine length={race.length} />
    </>
  )
}

/** A chequered banner on two posts across the trail at the race distance. */
function FinishLine({ length }: { length: number }) {
  const g = useRef<THREE.Group>(null)
  const banner = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const x = c.getContext('2d')!
    for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#fff'
      x.fillRect(i * 16, j * 16, 16, 16)
    }
    x.fillStyle = 'rgba(255,216,74,0.92)'
    x.fillRect(150, 18, 212, 60)
    x.fillStyle = '#2a1a00'
    x.font = 'bold 46px system-ui, sans-serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText('FINISH', 256, 50)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useFrame(() => {
    if (!g.current) return
    const z = length - (run.sim ? run.sim.runD() : 0)
    g.current.visible = z > -10 && z < 160
    g.current.position.set(0, 0, z)
  })
  return (
    <group ref={g}>
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * (PATH_HALF + 0.5), 2, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 4, 8]} />
          <meshStandardMaterial color="#e8e0c8" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 3.7, 0]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2 * PATH_HALF + 1, 0.95]} />
        <meshBasicMaterial map={banner} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <planeGeometry args={[2 * PATH_HALF, 0.6]} />
        <meshBasicMaterial map={banner} toneMapped={false} />
      </mesh>
    </group>
  )
}

function BlobShadow({ yOf = () => run.sim?.state.y ?? 0, size = 1 }: { yOf?: () => number; size?: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: '#000', transparent: true, opacity: 0.45, depthWrite: false }), [])
  const m = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const y = yOf()
    if (m.current) {
      m.current.position.y = 0.03 - y
      m.current.scale.setScalar(size / (1 + y * 0.6))
    }
  })
  return (
    <mesh ref={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0.1]} material={mat}>
      <planeGeometry args={[1.5, 2.6]} />
    </mesh>
  )
}

// ---------------------------------------------------------------- weather, camera, light

/**
 * Time of day and weather of a zone, applied on top of the kit's mood: how strong and what colour the sun is, how
 * much the sky shifts, the fog tint and distance, and extra trail light at night so hazards stay readable.
 */
interface VariantMod { sunK: number; sun: string; sunMix: number; hemiK: number; sky: string; skyMix: number; tint: string; fogK: number; trail: number; flies: number; exposure: number }
const VARIANT_LIGHT: Record<Variant, VariantMod> = {
  day: { sunK: 1, sun: '#fff1d6', sunMix: 0, hemiK: 1, sky: '#4b9be0', skyMix: 0, tint: '#ffffff', fogK: 1, trail: 0, flies: 0, exposure: 0 },
  golden: { sunK: 1.05, sun: '#ffb060', sunMix: 0.5, hemiK: 0.95, sky: '#c08a60', skyMix: 0.35, tint: '#ffe0b0', fogK: 1, trail: 0, flies: 0, exposure: 0.02 },
  mist: { sunK: 0.8, sun: '#e9f1f5', sunMix: 0.4, hemiK: 1.2, sky: '#a9c3cf', skyMix: 0.5, tint: '#e3ecef', fogK: 0.8, trail: 1, flies: 0, exposure: 0.02 },
  rain: { sunK: 0.75, sun: '#c9d6e0', sunMix: 0.5, hemiK: 1.0, sky: '#5f7383', skyMix: 0.6, tint: '#c4d0d8', fogK: 0.88, trail: 2, flies: 0, exposure: 0 },
  dusk: { sunK: 0.95, sun: '#ff9a5c', sunMix: 0.55, hemiK: 0.95, sky: '#4a3a6f', skyMix: 0.55, tint: '#e0a283', fogK: 0.9, trail: 2, flies: 0.2, exposure: 0.02 },
  dawn: { sunK: 0.9, sun: '#ffb8a0', sunMix: 0.5, hemiK: 0.95, sky: '#e8a090', skyMix: 0.45, tint: '#f4d0c0', fogK: 0.8, trail: 1, flies: 0, exposure: 0.02 },
  night: { sunK: 0.8, sun: '#9ab4ff', sunMix: 0.8, hemiK: 0.95, sky: '#16203a', skyMix: 0.8, tint: '#6a7aa0', fogK: 1, trail: 8, flies: 0.5, exposure: 0.1 },
  storm: { sunK: 0.62, sun: '#b8c4d4', sunMix: 0.6, hemiK: 0.95, sky: '#3a4450', skyMix: 0.7, tint: '#9aa6b0', fogK: 0.85, trail: 4, flies: 0, exposure: 0.02 },
  snowfall: { sunK: 0.8, sun: '#e8f0ff', sunMix: 0.5, hemiK: 1.1, sky: '#c0ccd8', skyMix: 0.6, tint: '#e8eef4', fogK: 0.78, trail: 2, flies: 0, exposure: 0 },
}
/** 0..1 inside a cave (eased) */
const caveK = { v: 0 }
/** a lightning flash in a storm: 0..1, decays fast */
const storm = { flash: 0, next: 4 }

/** The look of each world: dark and cinematic, but the trail always lit enough to read. */
interface Mood { sun: string; sunI: number; sky: string; ground: string; hemi: number; fogNear: number; fogFar: number; exposure: number; skyTop: string; env: number; trail: number; flies: number; leaves: number; leaf?: string; fall?: number }
const MOOD = {
  forest: { sun: '#e4f0c8', sunI: 2.1, sky: '#7f9c86', ground: '#22301a', hemi: 0.75, fogNear: 10, fogFar: 72, exposure: 1.0, skyTop: '#28403a', env: 0.35, trail: 9, flies: 0.4, leaves: 1 },
  waterfall: { sun: '#d6e6ee', sunI: 1.7, sky: '#8fa7b0', ground: '#27332e', hemi: 0.95, fogNear: 6, fogFar: 62, exposure: 1.02, skyTop: '#3f5560', env: 0.45, trail: 7, flies: 0, leaves: 0.3 },
  hills: { sun: '#e6ecf4', sunI: 2.3, sky: '#9aa8b8', ground: '#2c3128', hemi: 0.95, fogNear: 16, fogFar: 100, exposure: 1.0, skyTop: '#4b5a6c', env: 0.45, trail: 5, flies: 0, leaves: 0 },
  river: { sun: '#d2e4dc', sunI: 1.9, sky: '#7f9e9c', ground: '#1f2d27', hemi: 0.8, fogNear: 12, fogFar: 82, exposure: 1.0, skyTop: '#2f4848', env: 0.5, trail: 7, flies: 0.3, leaves: 0.3 },
  ruins: { sun: '#f0c88a', sunI: 2.0, sky: '#9a8f70', ground: '#2e2618', hemi: 0.7, fogNear: 12, fogFar: 82, exposure: 1.0, skyTop: '#3e3a2c', env: 0.35, trail: 8, flies: 0.2, leaves: 0.5 },
  jungle: { sun: '#cfe6a8', sunI: 1.7, sky: '#5f7f5c', ground: '#16220f', hemi: 0.6, fogNear: 8, fogFar: 60, exposure: 1.02, skyTop: '#1d3326', env: 0.3, trail: 11, flies: 0.8, leaves: 1 },
  moonlit: { sun: '#a8c0ff', sunI: 1.6, sky: '#5e6f9c', ground: '#121a26', hemi: 0.6, fogNear: 10, fogFar: 70, exposure: 1.05, skyTop: '#1a2440', env: 0.3, trail: 12, flies: 1, leaves: 0.2 },
  bamboo: { sun: '#e6f0c0', sunI: 2.0, sky: '#8aa878', ground: '#26331a', hemi: 0.8, fogNear: 9, fogFar: 66, exposure: 1.02, skyTop: '#33503a', env: 0.35, trail: 8, flies: 0.3, leaves: 0.7, leaf: '#9db04a' },
  pine: { sun: '#dfe8ec', sunI: 1.9, sky: '#8a9ea4', ground: '#1f2a24', hemi: 0.85, fogNear: 8, fogFar: 70, exposure: 1.0, skyTop: '#3c4e52', env: 0.35, trail: 8, flies: 0, leaves: 0.25, leaf: '#4a5a2a' },
  autumn: { sun: '#ffc888', sunI: 2.4, sky: '#b09070', ground: '#3a2614', hemi: 0.85, fogNear: 14, fogFar: 85, exposure: 1.02, skyTop: '#5a4a3a', env: 0.4, trail: 6, flies: 0, leaves: 1, leaf: '#e0702a' },
  snow: { sun: '#e8f0ff', sunI: 2.2, sky: '#b8c8dc', ground: '#8a96a6', hemi: 1.0, fogNear: 10, fogFar: 72, exposure: 0.98, skyTop: '#6a7a90', env: 0.5, trail: 4, flies: 0, leaves: 1, leaf: '#ffffff', fall: 0.45 },
  savannah: { sun: '#fff0c8', sunI: 2.9, sky: '#c8b888', ground: '#6a5a30', hemi: 1.1, fogNear: 30, fogFar: 140, exposure: 1.0, skyTop: '#5a90c8', env: 0.5, trail: 3, flies: 0, leaves: 0 },
  desert: { sun: '#fff4dc', sunI: 3.0, sky: '#e0c8a0', ground: '#8a6a40', hemi: 1.2, fogNear: 30, fogFar: 150, exposure: 0.97, skyTop: '#4a8ad0', env: 0.55, trail: 2, flies: 0, leaves: 0 },
  canyon: { sun: '#ffd8b0', sunI: 2.6, sky: '#c89878', ground: '#5a3020', hemi: 0.95, fogNear: 20, fogFar: 120, exposure: 1.0, skyTop: '#5a7aa8', env: 0.45, trail: 4, flies: 0, leaves: 0 },
  swamp: { sun: '#c8d8a8', sunI: 1.6, sky: '#6a7a5a', ground: '#1a2214', hemi: 0.7, fogNear: 8, fogFar: 62, exposure: 1.02, skyTop: '#2a3a2a', env: 0.35, trail: 10, flies: 0.6, leaves: 0.3, leaf: '#5a6a2a' },
  volcanic: { sun: '#ffb080', sunI: 1.9, sky: '#6a3a2a', ground: '#1a0e0a', hemi: 0.6, fogNear: 12, fogFar: 82, exposure: 1.05, skyTop: '#2a1a1a', env: 0.3, trail: 9, flies: 0, leaves: 0.7, leaf: '#ff6a20', fall: -0.35 },
  coast: { sun: '#fff4e0', sunI: 3.0, sky: '#a8d0e0', ground: '#c8b080', hemi: 1.2, fogNear: 30, fogFar: 150, exposure: 1.0, skyTop: '#3a8ad8', env: 0.6, trail: 3, flies: 0, leaves: 0 },
  blossom: { sun: '#fff0e8', sunI: 2.6, sky: '#e0c0d0', ground: '#4a5a3a', hemi: 1.1, fogNear: 18, fogFar: 100, exposure: 1.02, skyTop: '#7aa0d8', env: 0.5, trail: 4, flies: 0.1, leaves: 1, leaf: '#ffb0d0', fall: 0.5 },
  ice: { sun: '#e8f4ff', sunI: 2.4, sky: '#c0d8f0', ground: '#8aa0b8', hemi: 1.1, fogNear: 14, fogFar: 90, exposure: 0.96, skyTop: '#5a7aa0', env: 0.7, trail: 4, flies: 0, leaves: 0.5, leaf: '#ffffff', fall: 0.4 },
  birch: { sun: '#f0f0d8', sunI: 2.4, sky: '#a0b098', ground: '#3a4a30', hemi: 1.0, fogNear: 14, fogFar: 90, exposure: 1.0, skyTop: '#6a8aa8', env: 0.45, trail: 5, flies: 0, leaves: 0.6, leaf: '#d8c860' },
} as Record<BiomeId, Mood>
for (const b of BIOMES) if (!(MOOD as Partial<Record<BiomeId, Mood>>)[b.id]) (MOOD as Partial<Record<BiomeId, Mood>>)[b.id] = (MOOD as Record<string, Mood>)[KIT_BASE[b.id] ?? 'forest']
const moodNow = { flies: 0, leaves: 0, fall: 1, leaf: new THREE.Color('#7a6a2a') }

const skyTop = new THREE.Color()
const skyMid = new THREE.Color()

/** Bright jungle sky: deep blue overhead fading to a misty, sunlit horizon that matches the fog. */
let clouds: THREE.Texture | null = null
function cloudTex() {
  if (!clouds) {
    clouds = new THREE.TextureLoader().load(`${TX}/clouds.webp`)
    clouds.colorSpace = THREE.SRGBColorSpace
    clouds.wrapS = THREE.RepeatWrapping
    clouds.anisotropy = 4
  }
  return clouds
}

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color('#5aa6e0') },
          mid: { value: new THREE.Color('#dcebd8') },
          bottom: { value: new THREE.Color('#6f8f5a') },
          sun: { value: new THREE.Vector3(-0.35, 0.55, 0.75).normalize() },
          // real photographed clouds (Poly Haven sky, upper hemisphere), lit in the zone's sky colours
          clouds: { value: cloudTex() },
          drift: { value: 0 },
          grey: { value: 0 },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sun; uniform sampler2D clouds; uniform float drift; uniform float grey; varying vec3 vP;
          void main() {
            float h = vP.y;
            vec3 c = h > 0.0 ? mix(mid, top, pow(smoothstep(0.0, 0.7, h), 0.8)) : mix(mid, bottom, smoothstep(0.0, 0.25, -h));
            float g = max(0.0, dot(normalize(vP), sun));
            c += vec3(1.0, 0.92, 0.75) * (pow(g, 24.0) * 0.6 + pow(g, 4.0) * 0.12);
            if (h > 0.0) {
              vec3 d = normalize(vP);
              vec2 cuv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5 + drift, asin(clamp(d.y, 0.0, 1.0)) / 1.5707963);
              vec3 p = texture2D(clouds, cuv).rgb;
              float mx = max(p.r, max(p.g, p.b));
              float sat = (mx - min(p.r, min(p.g, p.b))) / max(mx, 1e-3);
              float luma = dot(p, vec3(0.299, 0.587, 0.114));
              // white, unsaturated pixels are cloud; the blue of the photo's own sky is dropped for the zone's
              float cl = smoothstep(0.42, 0.12, sat) * smoothstep(0.35, 0.7, luma) * smoothstep(0.0, 0.1, h);
              vec3 lit = mix(mid, vec3(1.0, 0.98, 0.95), 0.55 - grey * 0.35) * (0.62 + 0.5 * luma) * mix(1.0, 0.7, grey);
              c = mix(c, lit * (0.5 + 0.5 * dot(top + mid, vec3(0.33))), cl * 0.92);
            }
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useFrame((_, dt) => {
    const M = MOOD[biomeId(view.d)]
    const vName = view.showcase ? 'day' : biomeAt(view.d).variant
    const V = VARIANT_LIGHT[vName]
    mat.uniforms.drift.value = (mat.uniforms.drift.value + dt * 0.0015) % 1
    mat.uniforms.grey.value += ((vName === 'storm' || vName === 'rain' ? 1 : vName === 'mist' || vName === 'snowfall' ? 0.6 : 0) - mat.uniforms.grey.value) * Math.min(1, dt)
    skyMid.copy(fogA).lerp(skyTop.set('#ffffff'), 0.08 + storm.flash * 0.6)
    mat.uniforms.top.value.lerp(skyTop.set(M.skyTop).lerp(fogB.set(V.sky), V.skyMix), 0.03)
    mat.uniforms.mid.value.lerp(skyMid, 0.05)
    mat.uniforms.bottom.value.lerp(skyTop.set(M.ground), 0.05)
  })
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => ref.current?.position.copy(camera.position))
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false} userData={{ noBend: true }}>
      <sphereGeometry args={[200, 32, 16]} />
    </mesh>
  )
}

const fogA = new THREE.Color()
const fogB = new THREE.Color()

function Atmosphere({ quality }: { quality: Quality }) {
  const { scene, gl } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const trail = useRef<THREE.PointLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useLayoutEffect(() => {
    scene.fog = new THREE.Fog('#a9c2a2', 40, 135)
    return () => {
      scene.fog = null
    }
  }, [scene])
  useFrame((_, dt) => {
    const d = view.d
    const now = biomeAt(d)
    const bid = biomeId(d)
    const M = MOOD[bid]
    const variant: Variant = view.showcase ? 'day' : now.variant
    const V = VARIANT_LIGHT[variant]
    const glow = !view.showcase && flavorAt(d) === 'glow'
    const cave = !view.showcase && run.sim?.sectionAt(d + 6)?.kind === 'cave'
    caveK.v += ((cave ? 1 : 0) - caveK.v) * Math.min(1, dt * 2)
    const ck = caveK.v
    const k = Math.min(1, dt * 1.2)
    // storms: a lightning flash every few seconds
    if (variant === 'storm') {
      storm.next -= dt
      if (storm.next < 0) {
        storm.flash = 1
        storm.next = 3 + Math.random() * 6
      }
    }
    storm.flash = Math.max(0, storm.flash - dt * 3.5)
    // fog, light and sky glide into each new zone (and route) over about a second
    fogA.set(FOG[bid]).multiply(fogB.set(V.tint))
    const fog = scene.fog as THREE.Fog
    fog.color.lerp(fogA, k)
    // fog never closes in on the trail ahead: hazards stay readable at least ~80 m out in every zone and weather
    fog.near += (Math.max(14, M.fogNear * V.fogK) * (1 - ck * 0.6) - fog.near) * k
    fog.far += (Math.max(85, M.fogFar * V.fogK) * (1 - ck * 0.55) - fog.far) * k
    if (ck > 0.01) fog.color.lerp(fogB.set('#2a2420'), ck * 0.4)
    gl.toneMappingExposure += (M.exposure + V.exposure - gl.toneMappingExposure) * k
    scene.environmentIntensity += (M.env * (0.5 + 0.5 * V.sunK) - scene.environmentIntensity) * k
    if (sun.current) {
      sun.current.color.lerp(fogB.set(M.sun).lerp(fogA.set(V.sun), V.sunMix), k)
      fogA.set(FOG[bid]).multiply(fogB.set(V.tint))
      sun.current.intensity += (M.sunI * V.sunK * (1 - ck * 0.6) - sun.current.intensity) * k + storm.flash * 0.4 * (1 - ck)
      sun.current.position.set(-10, 20, 14)
      target.position.set(0, 0, 10)
      target.updateMatrixWorld()
    }
    if (hemi.current) {
      hemi.current.intensity += (M.hemi * V.hemiK * (1 - ck * 0.6) - hemi.current.intensity) * k + storm.flash * 0.25 * (1 - ck)
      hemi.current.color.lerp(fogB.set(M.sky), k)
      hemi.current.groundColor.lerp(fogB.set(M.ground), k)
    }
    if (trail.current) trail.current.intensity += (M.trail + V.trail + ck * 10 - trail.current.intensity) * k
    const snowing = variant === 'snowfall'
    moodNow.flies += ((glow ? 1 : Math.min(1, M.flies + V.flies)) - moodNow.flies) * k
    moodNow.leaves += ((snowing ? 1 : M.leaves) - moodNow.leaves) * k
    moodNow.fall += ((snowing ? 0.6 : (M.fall ?? 1)) - moodNow.fall) * k
    moodNow.leaf.lerp(fogB.set(snowing ? '#ffffff' : (M.leaf ?? '#7a6a2a')), k)
  })
  return (
    <>
      <primitive object={target} />
      <hemisphereLight ref={hemi} args={['#eef8ff', '#5d6b3c', 1.7]} />
      {/* a soft lantern-like fill over the trail ahead, so the path and obstacles stay readable in the dark */}
      <pointLight ref={trail} position={[0, 4.5, 7]} color="#ffe9c4" intensity={8} distance={26} decay={1.3} />
      {quality !== 'low' && <RimLight />}
      <directionalLight
        ref={sun}
        target={target}
        color="#fff1d6"
        intensity={3.3}
        castShadow={quality !== 'low'}
        shadow-mapSize={quality === 'ultra' ? [2048, 2048] : quality === 'high' ? [1536, 1536] : [1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={26}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
    </>
  )
}

/** Back light on the animal (fur edges catch the sun), following the zone's sun colour. */
function RimLight() {
  const l = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const li = l.current
    if (!li) return
    const M = MOOD[biomeId(view.d)]
    const V = VARIANT_LIGHT[view.showcase ? 'day' : biomeAt(view.d).variant]
    li.color.set(M.sun).lerp(fogB.set(V.sun), V.sunMix)
    li.intensity += (M.sunI * V.sunK * 0.55 * (1 - caveK.v * 0.7) - li.intensity) * 0.05
    li.position.set(1.5, 3.5, view.showcase ? -6 : 9)
    target.position.set(0, 0.7, 0)
    target.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={target} />
      <directionalLight ref={l} target={target} intensity={1} />
    </>
  )
}

const tLook = new THREE.Vector3()
function ChaseCamera({ height }: { height: number }) {
  const { camera, size } = useThree()
  const look = useRef(new THREE.Vector3(0, 1, 8))
  const portrait = size.width / size.height < 0.9
  const orbit = useRef(0)
  const reveal = useRef(0)
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.near = 0.1
    cam.far = 220
    cam.position.set(0, 3, -6)
  }, [camera])
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera
    const sim = run.sim
    const s = sim?.state
    const fast = !!sim && (sim.powerOn('speed') || sim.powerOn('boost') || sim.abilityOn('boost'))
    const fov = (portrait ? 68 : 54) + (fast ? 8 : 0)
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4)
      cam.updateProjectionMatrix()
    }
    const k = Math.min(1, dt * 5)
    const x = s?.x ?? 0
    const dead = !!s && !s.alive
    orbit.current += ((dead ? 1 : 0) - orbit.current) * Math.min(1, dt * 1.5)
    const o = orbit.current
    // approaching a junction the camera rises and looks further ahead so every route is in view
    const jf = junction()
    const jz = jf ? jf.d - view.d : 1e9
    const target = jz > 0 ? THREE.MathUtils.clamp((95 - jz) / 45, 0, 1) : THREE.MathUtils.clamp(1 + jz / 18, 0, 1)
    reveal.current += (target - reveal.current) * Math.min(1, dt * 2.5)
    const rv = reveal.current * (1 - o)
    const back = -(2.0 + 0.7 * height) * (portrait ? 1.25 : 1) * (1 - o * 0.25) - rv * 0.9
    const up = 1.2 + 0.75 * height + (portrait ? 0.45 : 0) + (s?.y ?? 0) * 0.35 + rv * 1.1
    const tx = x * 0.55 + o * 2.6
    camera.position.x += (tx - camera.position.x) * k
    camera.position.y += (up - camera.position.y) * k
    camera.position.z += (back - camera.position.z) * k
    // aim at the trail ~9 m ahead, so the view swings round with curves and tilts with slopes
    bendPoint(x * 0.8 * (1 - rv * 0.6) - o * 0.4, 0.2 * height + (s?.y ?? 0) * 0.5 + o * 0.3, (5 - o * 4.5) * (1 + 0.8 * (1 - o)) * (1 + rv * 1.3), tLook)
    look.current.lerp(tLook, Math.min(1, dt * 6))
    camera.lookAt(look.current)
    // dev-only test camera (animation checks): window.__wbCam = { pos: [x, y, z], look: [x, y, z] }
    const dbg = import.meta.env.DEV ? (window as unknown as { __wbCam?: { pos: number[]; look: number[] } }).__wbCam : undefined
    if (dbg) {
      camera.position.set(dbg.pos[0] + x, dbg.pos[1], dbg.pos[2])
      camera.lookAt(dbg.look[0] + x, dbg.look[1], dbg.look[2])
      return
    }
    if (run.shake > 0.001) {
      const a = run.shake * 0.18
      camera.position.x += (Math.random() - 0.5) * a
      camera.position.y += (Math.random() - 0.5) * a
      run.shake *= Math.exp(-dt * 7)
    }
  })
  return null
}

function Driver({ mode }: { mode: SceneMode }) {
  useLayoutEffect(() => {
    view.showcase = mode !== 'run'
    view.behind = mode === 'run' ? BEHIND : 70
    view.ahead = mode === 'run' ? AHEAD : 24
    if (mode !== 'run') view.d = 12
  }, [mode])
  useFrame((_, dt) => {
    if (mode === 'run') {
      tickRun(Math.min(dt, 0.1) * 1000)
      view.d = run.sim?.state.d ?? 0
      const sim = run.sim
      if (sim && track?.sim !== sim) track = { path: new TrackPath(sim.opts.seed | 0, true, () => sim.forks), sim, fork: null, branches: [], slots: [] }
      if (track && sim) {
        // a junction coming into view: one branch per route, all drawn until the runner is well past it
        const next = sim.forks.find((f) => f.picked < 0 && f.d - view.d < Z_MAX + 5)
        if (next && track.fork !== next) {
          track.fork = next
          track.branches = next.routes.map((r) => track!.path.branch(next.d, r.dir, r.lane))
          track.slots = next.routes.map((_, i) => i)
        }
        const f = track.fork
        if (f && f.picked >= 0 && track.slots[0] !== f.picked) {
          // the runner's route moves to slot 0; the others keep their branches and fall behind
          track.path = track.branches[f.picked]
          track.slots = [f.picked, ...f.routes.map((_, i) => i).filter((i) => i !== f.picked)]
        }
        if (f && f.picked >= 0 && view.d > f.d + 95) {
          track.fork = null
          track.branches = []
          track.slots = []
        }
        updateBend(track.fork ? track.slots.map((i) => track!.branches[i]) : [track.path], view.d)
      } else updateBend(null, 0)
      if (import.meta.env.DEV) (window as unknown as { __wbTrack?: unknown }).__wbTrack = track?.path
    } else {
      updateBend(null, 0)
      // the menu animals gallop along the first world (the dense forest), looping before the waterfall;
      // the ground slows to a stop when Sonic celebrates, so the paws never slide
      const ds = showcase.target - showcase.speed
      showcase.speed += Math.sign(ds) * Math.min(Math.abs(ds), Math.min(dt, 0.1) * 9)
      view.d += Math.min(dt, 0.1) * showcase.speed
      if (view.d > 92) view.d = 12 + (view.d - 92)
    }
    worldUv.uD.value = view.d % 1000
    worldUv.uT.value = performance.now() / 1000
  })
  return null
}

// ---------------------------------------------------------------- menus: lineup and character preview

export type SceneMode = 'run' | 'lineup' | 'preview'
const showPose = (): WildPoseState =>
  showcase.victory ? { pose: 'victory', speed: 0, t: 0 } : showcase.speed < 0.15 ? { pose: 'idle', speed: 0, t: 0 } : { pose: 'run', speed: showcase.speed, t: 0 }

/** Current ground scroll speed (m/s) in focus space. */
function groundSpeed() {
  if (view.showcase) return showcase.speed
  return run.phase === 'running' && run.sim ? run.sim.state.speed : 0
}

// ---------------------------------------------------------------- dust kicked up by the paws

const DUST_CAP = 160
interface Puff {
  p: THREE.Vector3
  v: THREE.Vector3
  life: number
  max: number
  size: number
}
const puffs: Puff[] = []
export function emitDust(at: THREE.Vector3, speed: number) {
  const n = speed > 12 ? 4 : 3
  for (let i = 0; i < n; i++) {
    if (puffs.length >= DUST_CAP) puffs.shift()
    puffs.push({
      p: new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.12, 0.04, at.z + (Math.random() - 0.5) * 0.12),
      v: new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.35 + Math.random() * 0.5, -0.4 - Math.random() * 0.6),
      life: 0,
      max: 0.45 + Math.random() * 0.35,
      size: 0.16 + Math.min(1, speed / 20) * 0.14 + Math.random() * 0.06,
    })
  }
}

function Dust() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: '#b9a582', transparent: true, depthWrite: false, opacity: 0.55 }), [])
  useFrame((_, dtRaw) => {
    const im = ref.current
    if (!im) return
    const dt = Math.min(dtRaw, 0.05)
    const scroll = groundSpeed()
    let n = 0
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i]
      q.life += dt
      if (q.life >= q.max) {
        puffs.splice(i, 1)
        continue
      }
      q.v.multiplyScalar(1 - dt * 2.5)
      q.p.addScaledVector(q.v, dt)
      q.p.z -= scroll * dt
      const k = q.life / q.max
      tM.compose(q.p, camera.quaternion, tS.setScalar(q.size * (0.6 + k * 1.6)))
      im.setMatrixAt(n, tM)
      im.setColorAt(n, tmpC.setRGB(1 - k * 0.6, 1 - k * 0.6, 1 - k * 0.6))
      n++
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[new THREE.PlaneGeometry(1, 1), mat, DUST_CAP]} frustumCulled={false} renderOrder={5} />
}

/** Sonic in front, the others in a V behind him, all galloping toward the camera. */
const LINEUP: { id: AnimalId; x: number; z: number }[] = [
  { id: 'sonic', x: 0, z: 0 },
  { id: 'leo', x: 1.9, z: -2.2 },
  { id: 'raja', x: -1.9, z: -2.2 },
  { id: 'shadow', x: 3.7, z: -3.9 },
  { id: 'jax', x: -3.7, z: -3.9 },
  { id: 'arctic', x: 5.4, z: -5.4 },
  { id: 'snow', x: -5.4, z: -5.4 },
  { id: 'koda', x: 1.0, z: -4.6 },
  { id: 'bruno', x: -1.2, z: -6.6 },
  { id: 'titan', x: 1.9, z: -8.6 },
]

function ShowAnimal({ id, x, z, fur = false }: { id: AnimalId; x: number; z: number; fur?: boolean }) {
  const g = useRef<THREE.Group>(null)
  const phase = useMemo(() => hash01(id.length * 13 + x * 7, 3) * 6.28, [id, x])
  useFrame((st) => {
    // small drifts so the pack looks alive rather than locked in formation
    if (g.current) g.current.position.set(x + Math.sin(st.clock.elapsedTime * 0.7 + phase) * 0.18, 0, z + Math.sin(st.clock.elapsedTime * 0.5 + phase) * 0.35)
  })
  return (
    <group ref={g} position={[x, 0, z]}>
      <Suspense fallback={null}>
        <WildAnimal animalId={id} poseOf={showPose} onStep={emitDust} fur={fur} />
      </Suspense>
      <BlobShadow yOf={() => 0} />
    </group>
  )
}

function ShowCamera({ mode, height }: { mode: 'lineup' | 'preview'; height: number }) {
  const { camera, size } = useThree()
  const look = useRef(new THREE.Vector3(0, 0.8, 0))
  const portrait = size.width / size.height < 0.9
  useEffect(() => () => (camera as THREE.PerspectiveCamera).clearViewOffset(), [camera])
  useFrame((st, dt) => {
    const cam = camera as THREE.PerspectiveCamera
    const fov = portrait ? 52 : 40
    // preview: slide the picture so the animal sits in the open space left of the info panel (landscape)
    // or above it (portrait) while the camera itself stays aimed at the animal
    const shiftX = mode === 'preview' && !portrait ? 0.19 : 0
    const shiftY = mode === 'preview' && portrait ? -0.12 : 0
    if (cam.fov !== fov || (cam.view?.offsetX ?? 0) !== shiftX * size.width || (cam.view?.offsetY ?? 0) !== shiftY * size.height) {
      cam.fov = fov
      cam.near = 0.1
      cam.far = 220
      if (shiftX || shiftY) cam.setViewOffset(size.width, size.height, shiftX * size.width, shiftY * size.height, size.width, size.height)
      else cam.clearViewOffset()
      cam.updateProjectionMatrix()
    }
    const t = st.clock.elapsedTime
    const k = Math.min(1, dt * 2.5)
    if (mode === 'lineup') {
      camera.position.lerp(tP.set(Math.sin(t * 0.12) * 0.8, portrait ? 2.2 : 1.55, portrait ? 8.4 : 5.2), k)
      look.current.lerp(tS.set(0, portrait ? 0.35 : 1.05, -3), k)
    } else {
      // three-quarter front view, close enough to read the SONIC tag, slowly swinging between the two sides
      const a = 0.42 * Math.sin(t * 0.22)
      const r = (portrait ? 3.4 : 2.55) * height
      camera.position.lerp(tP.set(Math.sin(a) * r, (portrait ? 0.95 : 0.85) * height, Math.cos(a) * r), k)
      look.current.lerp(tS.set(0, 0.64 * height, 0.15 * height), k)
    }
    camera.lookAt(look.current)
  })
  return null
}

// ---------------------------------------------------------------- world assembly

/** A wooden route board for each route of a junction: arrow, world, reward and danger, over its lane. */
function routeBoard(f: Fork, i: number): THREE.CanvasTexture {
  const r = f.routes[i]
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 300
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 300)
  grd.addColorStop(0, '#6b4524')
  grd.addColorStop(1, '#3d2611')
  g.fillStyle = grd
  g.beginPath()
  g.roundRect(8, 8, 496, 284, 26)
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#d9a75a'
  g.stroke()
  const arrow = r.dir > 0 ? '◀' : r.dir < 0 ? '▶' : '▲'
  g.fillStyle = '#ffe08a'
  g.textAlign = 'center'
  g.font = 'bold 74px system-ui, sans-serif'
  g.fillText(arrow, 256, 86)
  g.fillStyle = '#ffffff'
  g.font = 'bold 50px system-ui, sans-serif'
  g.fillText(BIOME_NAME[r.biome], 256, 150, 470)
  g.fillStyle = '#ffd34a'
  g.font = 'bold 40px system-ui, sans-serif'
  g.fillText(ROUTE_BONUS_TEXT[r.bonus], 256, 206, 470)
  const col = r.risk === 'risky' ? '#ff6a4a' : r.risk === 'safe' ? '#7ee07a' : '#9fd3ff'
  g.fillStyle = col
  g.font = 'bold 36px system-ui, sans-serif'
  g.fillText(`${r.risk === 'risky' ? '⚠ ' : ''}${ROUTE_RISK_TEXT[r.risk]}`, 256, 258)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function RouteSigns() {
  const group = useRef<THREE.Group>(null)
  const st = useRef<{ fork: Fork | null; boards: THREE.Mesh[] }>({ fork: null, boards: [] })
  const post = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 1 }), [])
  // a hidden board with the same material setup, so its shader is compiled in the warm-up (not mid-run)
  const dummy = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, toneMapped: false, fog: false }))
    m.visible = false
    m.position.set(0, -50, 0)
    return m
  }, [])
  useFrame(() => {
    const g = group.current
    if (!g) return
    const f = run.sim?.forks.find((x) => x.picked < 0 && x.d - view.d < 130 && x.d - view.d > -3) ?? null
    if (f !== st.current.fork) {
      for (const b of st.current.boards) {
        g.remove(b)
        ;(b.material as THREE.MeshBasicMaterial).map?.dispose()
      }
      st.current.boards = []
      st.current.fork = f
      if (f)
        f.routes.forEach((_, i) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.17).rotateY(Math.PI), new THREE.MeshBasicMaterial({ map: routeBoard(f, i), transparent: true, toneMapped: false, fog: false }))
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6).translate(0, -1.2, 0.05), post)
          m.add(pole)
          g.add(m)
          st.current.boards.push(m)
        })
    }
    if (!f) return
    // the boards stand at the mouth of each route; the picked one glows brighter
    const here = run.sim ? routeForLane(f, run.sim.state.x) : -1
    st.current.boards.forEach((m, i) => {
      const r = f.routes[i]
      const x = laneX(r.lane) + (f.routes.length === 2 ? Math.sign(laneX(r.lane)) * 0.9 : 0)
      m.position.set(x, 2.55, f.d - 2 - view.d)
      const on = i === here
      m.scale.setScalar(on ? 1.12 : 0.92)
      ;(m.material as THREE.MeshBasicMaterial).color.setScalar(on ? 1 : 0.62)
    })
  })
  return (
    <>
      <group ref={group} />
      <primitive object={dummy} />
    </>
  )
}

/** Fireflies drifting over the trail and leaves fluttering down; how many depends on the world's mood. */
const FLY_N = 80
const LEAF_N = 120
function ForestLife() {
  const flies = useRef<THREE.InstancedMesh>(null)
  const leaves = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()
  const r = useMemo(() => {
    const flyMat = new THREE.MeshBasicMaterial({ map: softDot(), color: '#d8ff7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const leafGeo = new THREE.PlaneGeometry(0.12, 0.08)
    const leafMat = new THREE.MeshStandardMaterial({ color: '#7a6a2a', side: THREE.DoubleSide, roughness: 1 })
    const fly = Array.from({ length: FLY_N }, (_, i) => ({ x: (hash01(i, 1) < 0.5 ? -1 : 1) * (PATH_HALF + 1 + hash01(i, 5) * 7), y: 0.5 + hash01(i, 2) * 3.2, d: hash01(i, 3) * 60, ph: hash01(i, 4) * 6.28 }))
    const leaf = Array.from({ length: LEAF_N }, (_, i) => ({ x: (hash01(i, 11) - 0.5) * 14, y: hash01(i, 12) * 7, d: hash01(i, 13) * 50, ph: hash01(i, 14) * 6.28, spin: 2 + hash01(i, 15) * 3 }))
    return { flyMat, leafGeo, leafMat, fly, leaf, q: new THREE.Quaternion(), e: new THREE.Euler() }
  }, [])
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = st.clock.elapsedTime
    const d = view.d
    const nF = Math.round(FLY_N * moodNow.flies * 0.6)
    const nL = Math.round(LEAF_N * moodNow.leaves * 0.55)
    if (flies.current) {
      for (let i = 0; i < nF; i++) {
        const p = r.fly[i]
        if (p.d - d < -6) p.d += 66
        if (p.d - d > 60) p.d -= 66
        const glow = 0.5 + 0.5 * Math.sin(t * 3 + p.ph * 5)
        const sz = 0.04 + glow * 0.08
        tM.compose(tP.set(p.x + Math.sin(t * 0.7 + p.ph) * 0.6, p.y + Math.sin(t * 1.1 + p.ph) * 0.3, p.d - d), camera.quaternion, tS.set(sz, sz, sz))
        flies.current.setMatrixAt(i, tM)
      }
      flies.current.count = nF
      flies.current.instanceMatrix.needsUpdate = true
    }
    if (leaves.current) {
      for (let i = 0; i < nL; i++) {
        const p = r.leaf[i]
        p.y -= dt * (0.6 + 0.3 * Math.sin(t + p.ph)) * moodNow.fall
        if (p.y < 0.02 || p.y > 9 || p.d - d < -6) {
          p.y = moodNow.fall < 0 ? 0.1 + hash01(i, Math.floor(t)) * 0.5 : 5 + hash01(i, Math.floor(t)) * 3
          p.d = d + 4 + hash01(i, Math.floor(t) + 7) * 45
        }
        r.e.set(t * p.spin + p.ph, t * 1.3 + p.ph, Math.sin(t * 2 + p.ph))
        tM.compose(tP.set(p.x + Math.sin(t * 1.4 + p.ph) * 0.8, p.y, p.d - d), r.q.setFromEuler(r.e), tS.set(1, 1, 1))
        leaves.current.setMatrixAt(i, tM)
      }
      leaves.current.count = nL
      r.leafMat.color.copy(moodNow.leaf)
      leaves.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      <instancedMesh ref={flies} args={[new THREE.PlaneGeometry(1, 1), r.flyMat, FLY_N]} frustumCulled={false} renderOrder={4} />
      <instancedMesh ref={leaves} args={[r.leafGeo, r.leafMat, LEAF_N]} frustumCulled={false} />
    </>
  )
}

/** how strongly sunbeams fall through the canopy in each kit (0 = open country, no canopy) */
const BEAM_KIT: Partial<Record<BiomeId, number>> = { forest: 1, jungle: 1, bamboo: 0.8, ruins: 0.7, waterfall: 0.6, river: 0.5, autumn: 0.8, birch: 0.7, pine: 0.7, swamp: 0.5, moonlit: 0.35 }
const BEAM_VAR: Partial<Record<Variant, number>> = { day: 0.8, golden: 1.25, dawn: 1.2, mist: 1.4, dusk: 0.9, rain: 0.25, storm: 0, night: 0.3, snowfall: 0.2 }
const BEAM_N = 14
let beamTex: THREE.Texture | null = null
function beamTexture() {
  if (beamTex) return beamTex
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')!
  // soft across, brightest high up and fading to nothing near the ground
  const img = g.createImageData(64, 256)
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x / 63) * 2 - 1
      const v = y / 255
      const a = Math.pow(1 - u * u, 2) * Math.pow(1 - v, 0.6) * Math.min(1, v * 6) * 0.9
      const i = (y * 64 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  g.putImageData(img, 0, 0)
  beamTex = new THREE.CanvasTexture(c)
  return beamTex
}

/**
 * Sunbeams through the canopy: tall, faint, additive shafts of light slanting down beside the trail in wooded
 * zones (strongest in mist and at golden hour), drifting slowly. Kept off the running lanes so they never hide a hazard.
 */
function SunBeams() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const r = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#fff2d0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false })
    const beams = Array.from({ length: BEAM_N }, (_, i) => ({ x: (hash01(i, 1) < 0.5 ? -1 : 1) * (PATH_HALF + 0.9 + hash01(i, 2) * 3.2), d: hash01(i, 3) * 70, w: 1.2 + hash01(i, 4) * 1.8, ph: hash01(i, 5) * 6.28 }))
    return { mat, beams, k: -1 }
  }, [])
  useFrame((st, dt) => {
    const im = ref.current
    if (!im) return
    const d = view.d
    const target = (BEAM_KIT[biomeId(d)] ?? 0) * (BEAM_VAR[biomeAt(d).variant] ?? 0.6)
    r.k = r.k < 0 ? target : r.k + (target - r.k) * Math.min(1, dt * 0.8)
    r.mat.opacity = 0.34 * r.k
    const t = st.clock.elapsedTime
    for (let i = 0; i < BEAM_N; i++) {
      const b = r.beams[i]
      // keep every beam within the 78 m window around the runner (also right after a start deep into the world)
      b.d = d - 8 + ((((b.d - d + 8) % 78) + 78) % 78)
      const flick = 0.75 + 0.25 * Math.sin(t * 0.4 + b.ph)
      // slant with the sun: lean towards the trail, tops away from the camera
      tE.set(0.32, 0, -Math.sign(b.x) * 0.18)
      tQ.setFromEuler(tE)
      tM.compose(tP.set(b.x, 5.2, b.d - d), tQ, tS.set(b.w * flick, 11, 1))
      im.setMatrixAt(i, tM)
    }
    im.count = r.k > 0.02 ? BEAM_N : 0
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[new THREE.PlaneGeometry(1, 1), r.mat, BEAM_N]} frustumCulled={false} renderOrder={5} />
}

/** Puts every mesh in the scene on the winding trail (models stream in, so check a few times a second). */
/**
 * Warm-up before the run: the first time anything is drawn the GPU compiles its shader and uploads its textures,
 * which froze the run for a moment whenever a new obstacle, coin or zone appeared. During the countdown every
 * mesh is made drawable (hidden ones shown, empty instanced sets given one instance), shaders are compiled in
 * parallel where the browser allows, one frame is rendered (shadow depth shaders, texture uploads), then
 * everything is put back and the countdown is allowed to run.
 */
function Prewarm() {
  const { gl, scene, camera } = useThree()
  const state = useRef<'wait' | 'busy' | 'done'>('wait')
  const frames = useRef(0)
  useLayoutEffect(() => {
    run.warm = false
    // never hold the start for long, even on a very slow device
    const cap = setTimeout(() => (run.warm = true), 2000)
    return () => {
      clearTimeout(cap)
      run.warm = true
    }
  }, [])
  useFrame(() => {
    if (state.current !== 'wait') return
    // let the world and the runner mount and load first
    if (++frames.current < 3 || !run.sim || useProgress.getState().active) return
    state.current = 'busy'
    bendObject(scene)
    const shown: THREE.Object3D[] = []
    const counts: [THREE.InstancedMesh, number][] = []
    scene.traverse((o) => {
      if (!o.visible) {
        shown.push(o)
        o.visible = true
      }
      const im = o as THREE.InstancedMesh
      if (im.isInstancedMesh && im.count === 0) {
        counts.push([im, 0])
        im.count = 1
      }
      const mats = (o as THREE.Mesh).material
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v && (v as THREE.Texture).isTexture) gl.initTexture(v as THREE.Texture)
      }
    })
    const finish = () => {
      try {
        gl.render(scene, camera)
      } catch {
        /* a failed warm-up only means the old behaviour */
      }
      for (const o of shown) o.visible = false
      for (const [im, n] of counts) im.count = n
      state.current = 'done'
      run.warm = true
    }
    const r = gl as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }
    if (r.compileAsync) r.compileAsync(scene, camera).then(finish, finish)
    else finish()
  })
  return null
}

function BendAll() {
  const { scene } = useThree()
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current -= dt
    if (t.current > 0) return
    t.current = 0.25
    bendObject(scene)
    if (import.meta.env.DEV) (window as unknown as { __wbScene?: unknown }).__wbScene = scene
  })
  return null
}

function World() {
  const source = useMemo(makeSource, [])
  const kits = useProcKits()
  const glb = (prop: Parameters<typeof GlbSet>[0]['prop'], capacity: number, shadows = false) => <GlbSet prop={prop} capacity={capacity} source={source} shadows={shadows} />
  return (
    <>
      <PropSet kit={kits.wall} prop="wall" capacity={320} source={source} receive={false} />
      <PropSet kit={kits.tileStone} prop="tileStone" capacity={130} source={source} />
      <PropSet kit={kits.tilePlank} prop="tilePlank" capacity={160} source={source} shadows />
      <PropSet kit={kits.tileRuin} prop="tileRuin" capacity={130} source={source} />
      <PropSet kit={kits.tileMud} prop="tileMud" capacity={130} source={source} />
      <PropSet kit={kits.tileSnow} prop="tileSnow" capacity={130} source={source} />
      <PropSet kit={kits.tileLeaf} prop="tileLeaf" capacity={130} source={source} />
      <PropSet kit={kits.bankSnow} prop="bankSnow" capacity={70} source={source} />
      <PropSet kit={kits.bamboo} prop="bamboo" capacity={520} source={source} shadows />
      <PropSet kit={kits.pine} prop="pine" capacity={200} source={source} shadows />
      <PropSet kit={kits.pineSnow} prop="pineSnow" capacity={200} source={source} shadows />
      <PropSet kit={kits.curb} prop="curb" capacity={260} source={source} />
      <PropSet kit={kits.bank} prop="bank" capacity={70} source={source} />
      <PropSet kit={kits.bankHill} prop="bankHill" capacity={70} source={source} />
      <PropSet kit={kits.tuft} prop="tuft" capacity={900} source={source} />
      <PropSet kit={kits.tuftDark} prop="tuftDark" capacity={900} source={source} />
      <PropSet kit={kits.tuftGold} prop="tuftGold" capacity={900} source={source} />
      <PropSet kit={kits.tuftAutumn} prop="tuftAutumn" capacity={900} source={source} />
      <PropSet kit={kits.post} prop="post" capacity={260} source={source} shadows />
      <PropSet kit={kits.rope} prop="rope" capacity={460} source={source} />
      <PropSet kit={kits.pillar} prop="pillar" capacity={60} source={source} shadows />
      <PropSet kit={kits.block} prop="block" capacity={90} source={source} shadows />
      <PropSet kit={kits.trapBase} prop="trapBase" capacity={20} source={source} shadows />
      <PropSet kit={kits.trapSpikes} prop="trapSpikes" capacity={20} source={source} shadows />
      <PropSet kit={kits.barrier} prop="barrier" capacity={20} source={source} shadows />
      <PropSet kit={kits.stub} prop="stub" capacity={30} source={source} />
      <PropSet kit={kits.vine} prop="vine" capacity={40} source={source} />
      <PropSet kit={kits.ice} prop="ice" capacity={90} source={source} receive={false} />
      {glb('trunk', 40, true)}
      {glb('boulder', 50, true)}
      {glb('rootset', 30, true)}
      {glb('calathea', 70)}
      {glb('tree1', 40, true)}
      {glb('tree2', 40, true)}
      {glb('tree3', 40, true)}
      {glb('fern', 90)}
      {glb('grass', 90)}
      {glb('anthurium', 50)}
      {glb('shrub', 40)}
      {glb('pachira', 30)}
      {glb('stump', 16)}
      {glb('mossrocks', 30)}
      {glb('pebble', 40)}
      {glb('rockface', 70)}
      {glb('mountain', 12)}
      {glb('bush', 60)}
      {glb('atree1', 40, true)}
      {glb('atree2', 40, true)}
      {glb('atree3', 40, true)}
      <PropSet kit={kits.tileSand} prop="tileSand" capacity={130} source={source} />
      <PropSet kit={kits.tileDirt} prop="tileDirt" capacity={130} source={source} />
      <PropSet kit={kits.tileBasalt} prop="tileBasalt" capacity={130} source={source} />
      <PropSet kit={kits.tileIce} prop="tileIce" capacity={130} source={source} />
      <PropSet kit={kits.bankSand} prop="bankSand" capacity={110} source={source} />
      <PropSet kit={kits.bankGold} prop="bankGold" capacity={70} source={source} />
      <PropSet kit={kits.bankBasalt} prop="bankBasalt" capacity={70} source={source} />
      <PropSet kit={kits.lava} prop="lava" capacity={40} source={source} receive={false} />
      <PropSet kit={kits.dune} prop="dune" capacity={40} source={source} />
      <PropSet kit={kits.palm} prop="palm" capacity={60} source={source} shadows />
      <PropSet kit={kits.reeds} prop="reeds" capacity={120} source={source} />
      <PropSet kit={kits.sleeper} prop="sleeper" capacity={200} source={source} />
      <PropSet kit={kits.rail} prop="rail" capacity={200} source={source} />
      <PropSet kit={kits.birch} prop="birch" capacity={150} source={source} shadows />
      <PropSet kit={kits.trolley} prop="trolley" capacity={6} source={source} shadows />
      <PropSet kit={kits.chevron} prop="chevron" capacity={8} source={source} shadows />
      <PropSet kit={kits.shadowDisc} prop="shadowDisc" capacity={12} source={source} receive={false} />
      <PropSet kit={kits.waterQuad} prop="waterQuad" capacity={30} source={source} receive={false} />
      <PropSet kit={kits.caveRoof} prop="caveRoof" capacity={30} source={source} />
      <PropSet kit={kits.stalactite} prop="stalactite" capacity={20} source={source} shadows />
      <PropSet kit={kits.crystal} prop="crystal" capacity={30} source={source} receive={false} />
      {glb('btree1', 40, true)}
      {glb('btree2', 40, true)}
      {glb('btree3', 40, true)}
      {glb('wtree1', 30, true)}
      {glb('wtree2', 30, true)}
      {glb('acacia', 30, true)}
      {glb('grassGold', 260)}
      {glb('redrock', 70)}
      {glb('sandrock', 50, true)}
      {glb('basalt', 60, true)}
      {glb('icerock', 50)}
      <Water />
      <Waterfalls />
      <Pickups />
    </>
  )
}

export default function WorldScene({ animalId, mode = 'run', quality = 'high' }: { animalId: AnimalId; mode?: SceneMode; quality?: Quality }) {
  const hi = quality === 'high' || quality === 'ultra'
  const sharpen = useMemo(() => new SharpenEffect(0.55), [])
  const variant = useMemo(() => () => (mode === 'run' ? biomeAt(view.d).variant : ('day' as Variant)), [mode])
  return (
    <Canvas
      shadows={quality !== 'low' ? { type: hi ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap } : false}
      dpr={quality === 'ultra' ? [1, 3] : quality === 'high' ? [1, 2] : quality === 'medium' ? [0.9, 1.5] : [0.75, 1]}
      gl={{ antialias: hi && quality !== 'ultra', powerPreference: 'high-performance' }}
      camera={{ position: [0, 3, -6], fov: 60 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.2
      }}
    >
      <Driver mode={mode} />
      {mode === 'run' && <Prewarm />}
      <BendAll />
      {mode === 'run' ? <ChaseCamera height={MODELS[animalId].height} /> : <ShowCamera mode={mode} height={MODELS[animalId].height} />}
      <Atmosphere quality={quality} />
      <SkyDome />
      <Suspense fallback={null}>
        <Environment files={`${TX}/sky_2k.jpg`} environmentIntensity={0.8} />
      </Suspense>
      <Suspense fallback={null}>
        <World />
        {mode === 'run' && <Runner animalId={animalId} />}
        {mode === 'run' && <Effects />}
        {mode === 'run' && <ForestLife />}
        {mode === 'run' && <SunBeams />}
        {mode === 'run' && <RouteSigns />}
        {mode === 'run' && <Rivals />}
        <Dust />
        {mode === 'run' && <Streaks variant={variant} />}
      </Suspense>
      {mode !== 'run' && (
        // studio lighting for the line-up and the preview: a warm key from the front, a cool rim from behind that
        // traces the fur outline, and a soft fill so the dark coats keep their detail
        <>
          <directionalLight position={[5, 7, 9]} intensity={1.6} color="#fff0dc" />
          <directionalLight position={[-4, 5, -8]} intensity={2.4} color="#cfe0ff" />
          <directionalLight position={[-7, 2, 4]} intensity={0.5} color="#ffe2c0" />
        </>
      )}
      {mode === 'lineup' && LINEUP.map((a) => <ShowAnimal key={a.id} {...a} />)}
      {mode === 'preview' && <ShowAnimal key={animalId} id={animalId} x={0} z={0} fur />}
      {quality === 'ultra' && (
        // ultra: glow on coins, gems, fireflies, lava and crystals, soft edge darkening and clean edges
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {/* contact shadows where things meet: roots on the ground, paws on the trail, trunks in the undergrowth */}
          <N8AO halfRes aoRadius={1.4} distanceFalloff={0.8} intensity={1.5} color="#0b0a06" />
          <Bloom mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.2} intensity={0.75} radius={0.7} />
          {/* camera depth: the far forest and skyline fall softly out of focus; the trail and everything on it
              (the first ~65 m) stays sharp */}
          <DepthOfField worldFocusDistance={30} worldFocusRange={70} bokehScale={2.2} resolutionScale={0.5} />
          <HueSaturation saturation={0.08} />
          <BrightnessContrast brightness={0.01} contrast={0.07} />
          <Vignette offset={0.4} darkness={0.3} />
          <SMAA />
          {/* contrast-adaptive sharpening after anti-aliasing: crisp fur, bark and gravel, no halos */}
          <primitive object={sharpen} />
          {/* a very fine film grain, so flat colour areas read like a real camera image */}
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.16} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
