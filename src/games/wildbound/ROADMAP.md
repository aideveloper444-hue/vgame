# Wildbound: status and roadmap

Last updated 2026-11-05. This file is the single source of truth for what works, what is partial and what is missing,
measured against the "Project Wildbound" AAA spec. Nothing is marked done unless it was run and checked.

## Stage 1: audit of the existing project

**Engine and architecture.** Wildbound is a React + three.js (react-three-fiber) game inside the VIBO app, shipped
to Android with Capacitor. It is not Unity or Unreal. Code lives in `src/games/wildbound/`:

| Area | Files | Notes |
|---|---|---|
| Run rules (deterministic, seeded) | `engine/run.ts`, `engine/content.ts` | lanes, jump/slide/roll, collisions, fair generation, abilities, power-ups |
| Rules tests | `engine/engine.test.ts` (`npm run test:wildbound`) | 20 tests, all passing |
| 3D world | `scene/WorldScene.tsx`, `scene/props.tsx` | instanced scenery per 5 m segment, worlds every 100 m |
| Animals | `scene/WildAnimal.tsx`, `public/models/wildbound/*.glb` | rigged GLBs; Sonic has a full gait controller |
| Save, missions, store | `state/progress.ts`, `state/shop.ts` | on-device save; Google Play Billing via `@capgo/native-purchases` |
| Screens | `ui/*` | home, characters, preview, store, missions, worlds, run HUD |

Asset pipeline for animals: Blender scripts in `unreal_assets/wildbound/` (Sonic: `unreal_assets/wildbound/sonic/`).

**Decision:** keep this engine. Rebuilding in Unreal 5 is the only route to near-photoreal fur and lighting, but it
means a new app, a separate download of several GB, and redoing every system that already works. Revisit after
the gameplay stages are complete.

## Acceptance tests (spec section 17)

| # | Test | Status |
|---|---|---|
| 1 | Every animal moves correctly | Partial. Sonic: authored gallop, IK, no foot sliding. Others: one run clip each, elephant tuned 2026-11-05 |
| 2 | No character stationary | Done. Clip-freeze bug fixed 2026-11-05 (affected every animal) |
| 3 | No shared run animation | Partial. Each model has its own clip, but some are retargets of the same source |
| 4 | Ground contact | Sonic done; others approximate |
| 5 | Jump, slide, roll | Done, tested in game |
| 6 | Obstacle collisions | Done (engine tests) |
| 7 | Smooth section transitions | Done for fog and light; winding track in preview |
| 8 | Generation beyond 1,000 m | Done (engine tests run to 5,000 m) |
| 9 | Always playable | Done (engine tests: every row has a way through) |
| 10 | Abilities work | Done for the 10 current animals (engine tests) |
| 11 | No identical repeats | Partial. Worlds rotate with weather variants; track layout varies (preview) |
| 12 | Buttons work | Done for current screens |
| 13 | Progress saves | Done (on device only) |
| 14 | Purchases validated securely | **Missing.** Store purchases are real Play Billing, but granted on the device with no server receipt check |
| 15 | Mobile performance | Not measured on a phone |
| 16 | PC controls | Done 2026-11-05, tested in game |
| 17 | Restart after failure | Done (Restart button) |
| 18 | Pause and resume | Done, tested in game (Escape, button, app backgrounded) |

## Controls (spec section 8): done 2026-11-05

| Input | Action |
|---|---|
| Swipe left / right, A / D, arrows | change lane |
| Swipe up, W, Up, Space | jump (a jump pressed up to 220 ms before landing is buffered) |
| Swipe down, S, Down | slide |
| Double swipe down, double-tap S / Down | roll (also R and the Roll button) |
| Press and hold (420 ms), Shift (also E, Q) | animal's special power |
| Escape, P | pause / resume |
| 1-4 | use a stored power-up |

## 40,000 m world plan (Visual Development Blueprint, 2026-11-06): stage 1, merged into live

- **100 zones of 400 m** (`engine/content.ts` ZONES): zone 1 is 0-400 m, zone 100 ends at 40,000 m; after that the
  zones repeat. Each zone = environment kit + time of day / weather + dressing. The rules tests check the count, the
  boundaries, unique names, and that no two neighbouring zones share kit, light and dressing.
- **20 environment kits**: the 11 forests plus savannah, desert oasis, red-rock canyon, swamp/mangrove, volcanic,
  tropical coast, blossom valley, frozen wilds, birch woodland (new props: palms, reeds, dunes, lava, sand, basalt,
  ice and dirt trails, birch trees, blossom/acacia/birch tree tints, railway sleepers and rails).
- **9 lighting variants**: day, golden hour, mist, rain, dusk, dawn, night, storm (with lightning) and snowfall.
  At night the trail light is stronger so hazards stay readable.
- **Dressing per zone**: giant trees, flowers, roots, vines, giant ferns, rocks, moss, glow (fireflies), extra
  jungle, an old railway line, and thaw ice.
- **HUD**: a zone banner at every boundary ("Zone 023 · 8,800 m"). **World map**: all 100 zones in chapters of 10,
  with discovered/locked state.
- **Generator fix**: a rolling boulder could land 2 m behind a full row of low branches (no time to slide and
  then change lane). Boulders now only roll when they have room; otherwise they are still rocks.

**Honest gaps**: zones that share a kit share the same scenery props (they differ in light, weather and dressing),
so some pairs (for example two waterfall zones) are closer than the blueprint asks. Card art for the 9 new kits is
cropped from in-game shots, not painted like the original 11.

## Stage 3 (2026-11-06, live): Play with Friends, vines, grip, close calls, graphics tiers

- **Play with Friends** (`ui/RaceScreen.tsx`, `state/race.ts`, `engine/race.ts`, `ui/RaceHud.tsx`): Race Friends
  (room code / invite link / party call), Play Online (quick match, bots fill after 20 s), vs Computer and Easy
  Rivals, 2-6 runners, 1 / 2 / 4 km. Everyone runs the same seeded trail (gems and power-ups now draw from their
  own random stream so every animal gets identical obstacles). A crash is a 1.8 s stumble, not the end. Rivals are
  drawn on the trail with name tags; finish arch; live standings and finish bar; podium, race coins/XP, records
  and two achievements. Store power-ups and upgrades are off in races (fairness). Online pause = "leave race".
  Uses the app's shared PeerJS room (same as Ludo/City), so no server; some mobile networks need TURN.
- **Vine swing section**: ravine across two lanes with a vine at the lip (jump into it: arc of coins), a log
  bridge lane as the safe way. Heavy in "Hanging Vine" zones.
- **Surface grip**: ice (slow turns), snow, mud (slower) with banners.
- **Close calls**: last-second lane changes score +50 with a beat of slow motion (solo, not with reduced motion).
- **Settings**: graphics Low / Medium / High / Ultra (Ultra = bloom, vignette, SMAA, 2K shadows), text size,
  assisted controls (jumps/slides timed for you, solo runs).
- **Fix**: the 20 newer zone kits had no lighting/card entries (type errors, undefined mood); they now borrow the
  closest original kit (`KIT_BASE` in content.ts) until they get their own.
- Rules tests: 37, all passing. Not done: colour-safe hazard markers, wet fur/splashes, real online test between
  two phones, APK rebuild.

## Sharp corners at zone changes (2026-11-06, live)

Every zone boundary (every 400 m) is a hard 90-degree corner, left or right (random per run), radius 6 m, instead
of a sweeping bend (`trackPath.ts` cornerCurvature / cornerDir). Scenery on the inside of the corner is trimmed so
it never covers the new road; yellow chevron boards on the outside point the way. The corner sits in the clear
strip at the boundary, so it never has obstacles.

## Stage 2 (2026-11-06, merged into live): challenge sections, new powers, zone sound, real junction roads

- **Challenge sections** (`engine/run.ts` planSections/buildSection, drawn in `WorldScene.tsx`), placed in zones
  that suit them, inside a zone, never at a junction, with a banner 70 m ahead and normal reaction spacing:
  - **Railway**: a track in one lane with a rusty trolley. Jump onto it to ride (faster, coins above the deck),
    hop off by changing lane, or it drops you at the buffer stop. Running into it without jumping is a crash.
    Always in zone 72, sometimes in other land zones.
  - **River crossing**: water cuts in two lanes and a stepping stone in the third, three times, then a full-width
    channel to jump.
  - **Broken bridge**: plank bridge over open water with missing planks, a full break to jump and a barrier.
  - **Rockslide**: rocks crash down ahead (a shadow first, camera shake, dust); some rows add jumpable rubble; one
    lane always stays open.
  - **Cave**: a rock vault over the trail, glowing crystals, darker light and close fog, hanging rock spikes to
    slide under, fallen rocks to steer round.
- **Mega Jump** (12 s: huge leaps that clear rocks and boulders) and **Super Boost** (4 s: 1.9x speed, smashes
  through everything, 1.2 s grace after). In the store, on the trail (rarer) and on keys 5 and 6. Old saves get
  one of each.
- **Ambient sound per zone** (`ui/ambience.ts`): wind, water (waves on the coast), rain, insects, low rumble,
  and calls (birds, owls, frogs, gulls, eagle, thunder in storms, drips in caves), mixed from the zone's kit, time
  of day and weather.
- **Junctions are real left/right roads**: each road starts on its own side of the trail (`trackPath.ts`
  offsetAt) and curves away; the runner is moved onto the middle of the road it picked, so choosing left means
  running down the left road, not staying in the left lane.
- Rules tests: 29, all passing (trolley ride and crash, water/rubble/spikes, Mega Jump, Super Boost, junction
  centring, 3 km autopilot runs through every section type, zone 72 railway).

**Still to do from the blueprint**: wet fur and splashes on the animal, cliff ledges and swinging vines,
surface grip (snow/ice/mud), accessibility options (text size, simplified controls).

## Forest worlds and junctions: done 2026-11-05 (live, VIBO 1.4)

- **11 forest worlds**, a new one every 100 m, then rotating: Tropical Rainforest, Waterfall Forest, Mountain Forest,
  Wooden River Crossing, Ancient Ruins Forest, Dark Dense Jungle, Moonlit Forest, Bamboo Forest, Pine Forest,
  Autumn Forest, Snow Forest. Each has its own scenery, trail surface, lighting, fog, falling leaves or snow,
  hills and obstacle mix.
- **Winding spline track** (`scene/trackPath.ts`, `scene/bend.ts`): curves, sharp turns, S-bends, slopes, banking.
- **Junctions** (`engine/run.ts` forks, `ui/RouteChooser.tsx`, `RouteSigns` in `WorldScene.tsx`): two-way splits, and
  three-way after the first junction (about 30%). Every junction has a safe route and a dangerous one that pays
  better (coins, hidden treasure, gems); three-way adds a normal route with a power-up or a high-speed run. The
  lane at the split picks the route. Before the split: route cards under the top bar, wooden route boards over
  each lane, and the camera rises to show the branches. The routes not taken stay in the world and fall behind.
  Route content is generated only after the choice. Tested in game; engine test covers 6 seeds x 3 lanes.

**Not yet:** cave/tunnel, cliff-edge, spiral and multi-level route geometry; per-world sounds; surface physics
(snow and mud do not yet change grip).

## What is blocked, and on what

| Item | Blocked on |
|---|---|
| Photoreal animal models (all 12) | A model source: AI 3D credits (Higgsfield account has 0), a purchased animal pack, or a Sketchfab token |
| Cheetah, Brown Bear, Red Fox, Rhinoceros | Same: no models exist yet. Current roster has Jaguar, Red Panda and Snow Leopard instead |
| Per-species animation sets (15 clips each) | Models with usable rigs; then authored like Sonic's (`sonic/anim.py`) |
| Server-side purchase validation | A deployed backend with Google Play Developer API credentials |
| iOS build | A Mac with Xcode and an Apple developer account |
| Online leaderboards | The same backend |

## Roadmap (next stages, in order)

1. Merge the track and forest preview once approved; add the two world cards.
2. Surfaces affect movement: mud slows and adds skid on lane changes, wet rock adds slip, planks change footsteps.
3. Obstacle library: falling trees with warning shake, swinging branches, mud pits, flooded paths, wildlife crossings
   (deer, boar, birds) with warnings, all through the fair-row generator.
4. Audio: per-world ambience, surface footsteps, impacts, ability sounds.
5. Camera: impact shake already exists; add slow-motion on near misses and fork choices.
6. Quality profiles: low / medium / high / ultra (today: low and high).
7. Animals: the four missing species and per-species gaits, once a model source is chosen.
8. Backend: purchase validation, restore, online leaderboards.

## 2026-11-06 later: smoother runs, new start every run

- Mid-run pauses were the GPU compiling shaders and uploading textures the first time each obstacle, coin or zone appeared. The countdown now holds on 3 until everything is warmed up (WorldScene Prewarm, at most 6 s). The close-call slow motion is removed.
- Every solo run starts in a random zone of the 100 (RunOptions.startZone); distance, speed and difficulty count from 0. Races start everyone in the same zone (from the seed). The training run stays in zone 1. Tests: 38.

## 2026-11-06 graphics + clarity pass (live)
- Trails are natural earth everywhere (no cobble road): waterfall/mist = mud with an occasional plank bridge, river = earth bank, hills/others = dirt; snow/ice/basalt use the ground texture and have no kerb.
- Trail verge shader (`worldUvMaterial(..., verge)` in props.tsx): large-scale colour variation + broken edge blending into moss/grass/leaf litter/snow.
- Big rock models (`CLEAR_ROCK` in WorldScene emit) are pushed out so their unit cube × scale never overlaps the trail (fixed the canyon slab over the camera, black rocks in the gorge).
- Fog never closer than near 14 / far 85; brighter night/storm/rain/mist/snowfall; softer lightning; lighter vignette/AO; colour grade (HueSaturation + BrightnessContrast); High quality now has bloom + grade too.
- Water: MeshPhysical with clear coat (fresnel reflections), deeper colour.
- Less clutter: fireflies kept off the trail and smaller, fewer falling leaves, fainter rain, spark bursts smaller/fewer and thrown away from the camera, no "Close call" banner, grip banners once per run, no banner over the countdown.
- ROLL/JUMP/SLIDE buttons removed (swipes/keys only); the tutorial runs only from More.
- Dev hook: `window.__wbZone = n` starts the next solo run in zone n (DEV only).

## 2026-11-06 HD pass (live)
- 2K photo-scanned trail textures (Poly Haven CC0, WebP, ~12 MB) in public/models/wildbound/tex/hd/ (CREDITS.txt): mud (jungle/forest/river/waterfall), dirt (savannah/canyon/hills/others, also tinted dark for basalt), sand, snow, leaf (autumn), plank (bridges/boardwalks). Old 1K textures still used for banks, stone, ruins, ice.
- Anisotropic filtering 16 on world-UV textures; shadow maps 4096 (Ultra) / 2048 (High).
- Verge shader adds worn lane tracks (slightly lighter packed earth along the three lane centres).

## 2026-11-06 Ultra 4K pass (live)
- Ultra only: 4K colour scans for trails (tex/hd/*_diff_4k.webp, ~18 MB) + 2K normals, 4K sky environment, depth of field on the far distance (sharp to ~65 m), fine film grain. High has NO post-processing (it caused 6 fps stalls).
- Ultra on Intel Iris Xe at 2x: ~3–31 fps: it is for powerful devices; High is the recommended default.

## 2026-11-06 grass + ground pass (live)
- Wind grass: procedural tufts (34 curved blades, both windings, upward normals) placed per 5 m segment via grassAt() in makeSource (outside the scenery cache), colours by kit (TUFT map); density by quality (TUFT_N: low 0, medium 6, high 14, ultra 24 per side). Vertex-shader sway uses worldUv.uT.
- Banks: Poly Haven meadow (leafy_grass) for bank/bankHill and withered_grass for the savannah, with large-scale variation (`vary` flag on worldUvMaterial).
- Next for realism: decimated photo-scanned trees (Poly Haven fir/pine 500–950 MB raw, need Blender decimation to ~15k tris), real palms, animal fur/models.

## 2026-11-07 Ultra crash fix + fur
- Ultra was not rendering at all (WebGL context lost, shaders VALIDATE_STATUS false) on Intel Iris Xe: the six 4K trail textures (~90 MB VRAM each). Ultra now uses the 2K scans; 4K files removed. Ultra sky env back to 2K, Ultra shadows 2048.
- Layered fur shells (WildAnimal addFurShells, 12 shells, FUR_LEN per animal) on the runner and the preview animal, Ultra only.
- Studio lights (key/rim/fill) in lineup and preview modes.
- Test scripts must create the save with version 1 (scratchpad setq.txt); a fresh profile has no save until the first change, so earlier "Ultra" checks silently ran on High.

## 2026-11-07 picture quality pass (live)
- Render resolution: Ultra dpr up to 3 (native 4K on 4K screens), High up to 2, Medium up to 1.5.
- Ultra: contrast-adaptive sharpening pass (scene/sharpen.ts, CONVOLUTION effect after SMAA), film grain 0.16.
- High now uses the 2K trail colour scans (normals 1K below Ultra). High at 3x-DPR test window on Iris Xe: ~45 fps after warm-up.

## 2026-11-07 forest realism pass (live)
- Sky: real photographed clouds (tex/clouds.webp, upper half of Poly Haven kloofendal_48d_partly_cloudy_puresky) composited in SkyDome, lit by the zone sky colours, greyer in rain/storm/mist, slow drift.
- Conifers: pine/pineSnow rebuilt as a tapering bark-textured trunk + 14 tiers of drooping alpha-cut needle sprays (canvas-drawn), crown normals; snowy variant has snow on the sprays.
- SunBeams: 14 additive light shafts beside the trail in wooded kits (BEAM_KIT x BEAM_VAR), wrapped into the 78 m window around the runner.
