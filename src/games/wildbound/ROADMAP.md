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

## 2026-11-09 premium look pass
- UI restyled from comic to premium (ui/wildbound.css): smoked-glass panels, hairline borders, one champagne-gold accent, ivory text, tracked Barlow Condensed capitals instead of Bangers, no outlines or candy-gloss buttons, calmer motion (no bounces). Neon greens/yellows/reds in components mapped to the new palette.
- Logo: Cinzel serif wordmark in brushed gold (ui/Logo.tsx); home menu icons are thin line icons.
- Grade (scene/grade.ts): vibrance cut from 0.42 to 0.14, film-like highlight desaturation, greens nudged towards olive; Ultra HueSaturation +0.08 to -0.03.
- Still cartoon-styled: the painted raster icons (coin, gem, cart, power-ups, ability badges, level-up art, store gem packs). These need new art.
- Checked by screenshot: home at 1280x720 and 520x1000. The run HUD, pause, game over, store and character screens were not screenshotted.

## 2026-11-09 living animals + wild moments
- Idle: animals without an Idle clip (jax, raja, shadow, snow, nova, blaze, zara) stand on the gallop's grounded frame instead of a 0.12x slow-motion gallop. New idle life for every animal (WildAnimal idleLife): gaze holds and damped head turns carried partly by the neck, ear flicks (no face rig), ribcage breathing, weight shifts. Offsets on bones no clip drives are undone each frame.
- Crash daze stars removed (adult tone); the fall, shiver and laboured breathing stay.
- Sonic's tan markings: an even muted mahogany instead of tinting the orange texture (legs glowed).
- New in-world moments (WorldScene, not on Low): bird flocks bursting from the canopy every 140-300 m by day and on roars, crashes and rock falls (also in the home line-up); butterflies on bright days in open/flowered kits; low ground mist in mist/dawn/rain/night and over swamps/rivers/waterfalls. Chase camera rolls slightly into lane changes. Near misses and abilities pulse the screen edges (RunScreen .wb-edge).
- Checked by screenshot: home line-up (standing idle, tan colour). The in-run moments were not screenshotted (needs a run).

## 2026-11-09 character screens, premium
- Character Selection and Details: Cinzel names over tracked species labels, glass chips (.wb-chip) for views/expressions/status, "Included" instead of the painted FREE badge, thin champagne stat bars without icons, the in-use animal as an outlined gold "Selected" state, paw icons and the wooden plank panel removed, roster/feature studio backdrop charcoal instead of flat green.
- Dev only: ?wbscreen=<screen> opens a screen from the URL (screenshots).
- Animal models: every one except the tiger needs replacing to look realistic. Blocked on sources: realistic rigged + animated animals are on Sketchfab (download needs an account token) and retargeting needs Blender (not installed).

## 2026-11-09 big cats on the tiger body
- Panther, jaguar, snow leopard and cheetah now use raja.glb (the realistic tiger body, skeleton and gallop) instead of their own weaker models, each with its own build (head scale, tail thickness, cadence) and a coat painted on the 3D surface: BIGCAT() washes out the tiger stripes and draws spots / broken rosettes with 3D cellular noise in rest space (no UV seams).
- The orange forehead patch on every tiger-based coat (top 10% of the texture was kept as-is for eyes/teeth) is recoloured; only teeth, gums and eyes keep the texture.
- Arctic wolf: the grey wolf's anatomy coat (now WOLF(palette)) in off-white.
- jax.glb, shadow.glb and snow.glb are no longer used by any animal.
- Still on weak models: Sonic (Rottweiler), Bruno (gorilla), Koda (red panda), and the wolves' body. Needs sourced models (Sketchfab token + Blender).

## 2026-11-09 airstrips, handcar, environment realism
- New challenge section 'flight' (open kits: savannah, desert, coast, hills, canyon, grassland, beach, lakeside, blossom, birch, ice, snow, baobab): a bush plane idles on the strip in the middle lane; running into it boards it (any pose, never a crash). The ride climbs to FLY_H, cruises and glides in (flightAlt), lane changes steer the plane (no dismount), jump/slide are ignored, no ground obstacle can touch the rider, sky coins weave across the lanes along the flight path, +250 on landing; the plane then climbs away. Engine test added (boards, clears a rock, steers, lands alive).
- scene/aircraft.ts: procedural high-wing bush plane (lathed fuselage with livery by vertex colour, glazed cabin, strut-braced wing the runner stands on, tail, sprung gear on tundra tyres, spinning two-blade prop with blur disc). Planes (engine items) and Overflights (distant planes crossing the sky in open country and on the home screen). Chase camera pulls back and rises in flight.
- Trolley rebuilt as a railway handcar (plank deck, iron beams, flanged spoked wheels on axles, pump A-frame and rocking cross handle at the front).
- Realism: grass tufts darker at the root, per-blade dry/fresh variation, natural meadow/straw colours; sunbeams half as bright with soft edges; waterfalls a dark see-through sheet with multi-scale falling ropes, ragged edges, lip highlight and base foam; ice rocks opaque glacial ice (no glowing cyan); stream water and cave crystals toned down.
- Run HUD: pause, power-ups and ability are line icons (ui/icons.tsx) in glass circles instead of painted badges.
- Checked by screenshot: plane model (home screen, temporary hook since removed), two runs (grass, beams, HUD). The flight and the handcar were not seen in a live run.

## 2026-11-09 roster rested to the realistic animals
- Sonic (Rottweiler), Bruno (gorilla), Koda (red panda), Arctic and Ash (wolves) are rested: content RETIRED / ROSTER. Their source models are low detail (textures 63-222 KB, the gorilla 4.8k and red panda 2.7k triangles) and no realistic free replacement is downloadable without an account. They stay in ANIMALS (saves, race packets, engine), but the roster, home line-up, Details strip, store and race rivals use ROSTER (9 animals).
- Raja (tiger) is the free starter; a save with a rested animal selected moves to Raja. Sonic's price set to 499 like the others.
- To bring them back: realistic rigged models (Sketchfab CC-BY with a token in ~/.sketchfab_token, or image-to-3D with credits), then remove the id from RETIRED.
- Shop products for the rested animals still exist in state/shop.ts (restore purchases). UNLOCK_ALL is true in this build, so no player has lost a paid animal; if a build with real purchases ships, re-check this.

## 2026-11-09 character models upgraded in Blender (tools/wildbound-blender)
- process.py (Blender 4.5: `~/vgame-tools/Blender.app/Contents/MacOS/Blender -b --python process.py -- in.glb out.glb <subdiv levels> <normal strength> [lod]`): Catmull-Clark subdivision applied in rest pose before the Armature modifier (skin weights interpolate), smooth shading, a tangent-space detail normal map generated from the colour texture (high-pass of luminance), optional removal of duplicate LOD meshes, WebP textures (EXT_texture_webp).
- raja.glb (tiger body for 7 animals): 4,650 -> ~28k triangles + detail normals, 1.9 MB. titan.glb: 1,958 -> ~47k triangles + skin-wrinkle normals, 2.9 MB; in game a dusty grey-brown skin (COATS titan) with a muted sheen.
- leo.glb: had five overlapping LOD bodies all drawn at once (removed); its eye material is a near-invisible cornea that the game had forced opaque (blue-white cap): now a clear glossy cornea (realMaterial, userData.cornea). The source lion had no mane: mane2.py builds one (Lion_ManeBase under-layer + Lion_ManeHair ~3200 skinned hair cards with a generated strand alpha texture); in game the MANE shader colours it (golden fringe, tawny crown, dark toward shoulders/chest). 5.4 MB.
- Note: Blender bakes node transforms into the lion's vertices (metres, y up, nose +z); the tiger and elephant kept their source coordinates (the BIGCAT coats depend on the tiger's).
- Checked by screenshot: home line-up, Details screen for tiger, lion, elephant. The selection screen (9 live models) is slow under software rendering in headless Chrome; not checked after the upgrade.
- Dev only: ?wbscreen=preview&wbpreview=<id> opens the Details screen on an animal.

## 2026-11-09 Sonic restored
- The user asked where Sonic is: Sonic is back in the roster (RETIRED is now bruno, koda, arctic, ash), the free starting animal again and front of the home line-up; Raja stays free too. Sonic must never be rested: he is the heart of the game (modelled on a real dog: collar, engraved tag).

## 2026-11-13 "Amazon Wild Run" design brief: pacing director + 4 new challenges

The brief (gameplay & challenge design doc v1.0, 10 Nov 2026) is applied to Wildbound rather than a second jungle runner
(the old `src/games/amazon` game was removed in f3cc4a3). Its challenge library is the content backlog.

- **Pacing director** (brief §4–5, `engine/run.ts` pickSection / nextChallengeAt, `PACING`; tiers in `content.ts`):
  - Onboarding: no challenge for the first 30–48 s of running (it was a fixed 290 m).
  - Challenges are spaced by run time, 22–38 s of plain running (junctions and rows fill the gap), using the speed-ramp
    clock `runTimeAt` / `runDAtTime`. Typical run: first challenge at ~45 s, then one every ~35–45 s.
  - **Tiers** Explorer (0 s) / Adventurer (90 s) / Survivor (180 s) / Expert (300 s) / Legend (480 s). Each challenge
    has a minimum tier (`SECTION_MIN_TIER`): trees, rockslides and caves from Adventurer, the temple from Survivor.
    A banner announces each new tier.
  - From Survivor, 30% of gaps are **linked** (8–12 s, never twice in a row), and after a linked pair at Expert+ comes
    an 8 s recovery stretch.
  - **No repeats**: a challenge is not picked again within the next 3 (`SECTION_NO_REPEAT`) unless it is the zone's
    signature (zone 72 railway, Hanging Vine zones) or the zone offers nothing else.
- **New challenges** (fair-row rules, banner 70 m ahead):
  - **Timber!** (falling tree ambush / tree collapse chain): 3 trees, alternating sides, each across 2 lanes (the last
    sometimes all 3: jump). Trees stand shivering at the trail edge and topple 38 m out (camera shake, dust, birds).
  - **Quicksand**: rounded wet-sand pools in two lanes, a firm lane that wanders, a full-width pool to jump. Shields hop
    it like water; strength powers can't break it.
  - **Temple traps** (dart wall corridor): dart volleys across all lanes (slide) between rows of fallen pillars
    (steer), stone pillars and lintels along the corridor, a gem "idol" at the end. Ruins/temple kits, cave-style echo.
  - **Log trap** (swinging log trap): logs on ropes at head height (slide); their swing is tied to distance, so a log
    is always at the bottom when the runner reaches it.
- Autopilot fix: it swapped endlessly between two lanes that both had jumpable hazards; it now prefers empty lanes.
- Dev only: `?wbscreen=run&wbsection=<kind>&wbsectionat=<m>&wbzone=<n>` (or `window.__wbSection`) plants a challenge.
- Tests: 43, all passing (new: quicksand/darts/log escapes, the 4 sections × 12 seeds for fairness, tree-fall timing,
  director onboarding/spacing/tiers/no-repeat). Checked by screenshot: temple, quicksand, swinging logs, fallen
  trees (fallen state forced for the shot). Not seen in a live run: the topple animation, the dart motion, the tier banner.

### Later the same day: mine carts and zipline chains

- **Mine carts** (`minecart`, Adventurer tier; canyon, hills, cliffside, volcanic, ruins, mossy, glow, deadwood): three
  tracks under timber mine frames, a cart parked on each. Running into a cart in any pose boards it (it never
  crashes you). Riding, a **lane change switches track** instead of hopping off. Ahead come buffer stops where a
  track ends (switch away; staying on it is a crash), broken rails (jump in the cart; without a jump you crash) and
  low timber beams (**duck in the cart**: a slide while riding clears a beam). Rule for every row: one clean track,
  never a full row that mixes jumping and ducking. The middle row is a full-width hazard (all broken rails or all
  beams). Rows sit 1.3× the reaction gap apart because the cart is 1.25× running speed. Coins and a gem ride along
  the clean track. The cart sways into track switches, lifts with the rider's jump and is dropped at the end with a
  hop. New prop: riveted iron tub with strap bands on the handcar's wheels (`minecart` in props.tsx).
- **Zipline chain** (`zipline`, Explorer tier; forest, jungle, redwood, giantroot, cliffside, cedar, pine, fern):
  two ravines across all lanes, each with a steel cable over every lane between timber gantries. The line is
  **grabbed automatically** at the start gantry in any pose (the brief's "automatic grab inside a forgiving zone"),
  so there is no way to miss it and no ground route is needed. On the line, **lane changes switch cable**. A little
  past halfway, boughs hang over one or two cables (two on the second line): switch to a clear cable. A 12 m+
  landing ledge between lines. The rider follows the sagging cable (`zipAlt`) and lets go onto the far lip like the
  vine swing. Coins and a gem are strung along a clear cable.
- **Fixed on the way**: the vine marker was never drawn (the render loop skipped non-obstacles), so the vine
  swing ravine had no vine. Markers are drawn now.
- **Trees in ravines (fixed)**: the island-tree GLBs are normalised on their bounding-box centre, but the trunk base
  sits up to 0.3·H off it (tree 2, 3) and tree 3's root collar spreads ±0.35·H. At scale 11-17, a tree placed 5-6 m
  out reached into the lanes. Solid trail tiles hid it; over the zipline and vine ravines (no tiles) a trunk and its
  stone collar stood in the gap. Now, in any segment with a hole in the trail and over whole zipline sections, big
  trees are pushed out to verge + 0.68·H (`TREEISH` in makeSource), and hanging vines within 9 m are dropped over
  ziplines, which also clears the canopy from the rider's view at ZIP_TOP 6.2. The zipline handle is a thin dark
  strap, not the green vine. Not changed: the GLB pivots themselves (that would move every forest tree in the game).
- Autopilot: ignores parked carts and ravine gaps while on a line (used by the tests and race rivals).
- Tests: 46, all passing (new: both sections × 12 seeds for fairness, an autopilot ride or crossing on every seed,
  cart rules (board, switch, buffer, rails, beam), zipline rules (auto-grab while sliding, cable switch, bough hit)).
- Checked by screenshot: mine cart start (three carts, rails, frames, coins), zipline gantry, cables, bough and
  coins over the ravine. Not seen in a live run (headless Chrome stays in the countdown): riding the cart, switching
  track, hanging on the line, and the zipline handle rope.

### Brief vs Wildbound: what exists, what is next

| Brief area | In Wildbound | Missing / next |
|---|---|---|
| A. Terrain & obstacles | logs, roots, traps, rolling boulders, broken bridge, rockslide, river stones, vine ravine, falling trees, quicksand, swinging logs, cave | collapsing bridge behind the runner, mudslide slope, hidden pitfall (crack telegraph), bee swarm |
| B. Animal encounters | none (the player is an animal) | wildlife crossings (boar charge, stampede): blocked on realistic animal models, as are the roster animals |
| C. Vehicles & rides | railway handcar, bush-plane flight, mine carts with track switching | raft/boat (needs a water-lane mode), jeep escape |
| D. Aerial & traversal | vine swing, zipline chain with cable switching | glider launch with landing zone, canopy rope bridge |
| E. Water | river crossing, stream channels | flood surge chase, whirlpool |
| F. Temple & puzzle | dart corridor, idol gem | swinging blades, stone wheel chase, symbol door choice (fits the junction system) |
| G. Weather & disaster | 9 lighting variants incl. storm, night, snow | lightning strike zones, flash flood, wildfire |
| H/I. Mini-games & bosses | junction risk routes | time-trial gate, a multi-stage finale combining 3 learned challenges |
| §4–5 Pacing & fairness | **done**: director, tiers, no-repeat, seeded, every row passable | per-player skill tier (it uses run time only) |
| §7 Progression | coins, gems, missions, achievements, store | weekly expedition, challenge stars |
| §10 Monetization | rewarded revive, cosmetics, Play Billing | server receipt check (see blocked list) |

## 2026-11-13 evening: player experience pass (brief §7 and §9)

- **Challenge card** (`ui/ChallengeHud.tsx`, names/tally in `ui/challenges.ts`): one smoked-glass card under the top
  bar follows every challenge: *ahead* (name, what to do, distance counting down, a slow gold pulse), *live* (a thin
  progress line), *cleared* (1–3 stars + bonus). Stars: getting through; no save used (shield / Sonic's extra life);
  80% of its coins. 100 score per star in solo runs (races stay even). It replaces the old centre banner for
  challenges, so nothing is said twice.
- **Warning sounds** for every challenge as it is announced (`sfx.warn`): timber creak and crack, quicksand gurgle,
  temple stone grind and mechanism click, rope creak and whoosh, rockslide rumble, water, rail bell, engine. Falling
  trees land with a crack and a thud (`sfx.timber`). Cleared: a rising figure, one note per star. Tier up: a low,
  grand chord.
- **Screen effects** (CSS over the scene): speed streaks from the edges near top speed and in boosts, a short hot
  flash on a crash, a gold light sweeping the screen when a challenge is cleared, and the tier title (Cinzel between
  two gold rules) instead of a toast. All respect reduced motion.
- **In the world**: crash debris matches what was hit (wet sand, river spray, wood chips, grit); the chase camera
  pulls back a little on every ride and traversal (handcar, mine cart, zipline, vine), gentler when hanging high;
  temple darts thicker, longer and five per lane so the volley reads.
- **Results screen** redesigned: what ended the run in words ("Struck by temple darts"), the score large in Cinzel
  gold, best or a "New best score" chip, a four-cell stat strip (metres, coins, gems, XP), challenges cleared, stars
  and the tier reached, then **Run again** as the main action and Revive / Home beneath. The painted cartoon Sonic is
  gone from it. Pause shows challenges, stars and tier too.
- **Progression**: challenge results are saved (totals: challenges, stars, perfect; best tier). New achievements:
  Challenger (25 cleared), Star Collector (150 stars), Flawless (10 three-star clears), Legend of the Wild (reach
  Legend).
- **Home**: the painted animal portrait and festival mask in the top-right tiles are now thin line icons in gold rings.
- **Fixes found while checking**: trail tiles ran out of instances in canyon mine-cart sections (the trail vanished and
  the water plane showed): every trail-tile set now holds 300. Ziplines were raised (ZIP_TOP 6.2, drop 2.0) so the
  rider is clearly high over the ravine; boughs follow the rider's height.
- Dev only: `?wbauto` drives the run with the test autopilot (screenshots of whole challenges). Real-time screenshot
  recipe: headless Chrome with remote debugging, `Page.captureScreenshot` after real waits (virtual time never gets
  past the countdown).
- Checked by live screenshot: challenge card ahead / live / cleared (temple, quicksand, airstrip), results screen,
  mine cart (forest and canyon), zipline, home. Not seen: the tier title, the crash flash, speed streaks at full
  strength, the gold sweep (all CSS, timed between frames).
- Still painted (cartoon) art: power-up and ability badges in the store, level-up art, gem packs, the festival token
  in the run HUD.

## 2026-11-13 night: painted art replaced by one vector icon system

- `ui/icons.tsx` is now the icon system: line icons in a hairline gold ring (`Ring`, `PowerBadge`, `AbilityBadge`,
  `TraitBadge`, `MissionBadge`, `TokenMark`), an engraved gold coin with a paw (`CoinMark`), a sapphire brilliant
  cut (`GemMark`), gem packs of 1–4 stones (`GemPackMark`) and a laurel level-up emblem (`LevelEmblem`).
- Replaced everywhere: coins and gems (wallet, rewards, prices: `Coin` / `Gem` in common.tsx), the store cart, store
  power-ups and gem packs, ability badges (selection strip, focus panel, details), traits, missions, the festival
  (panel, tokens, run HUD), the level-up modal (emblem + Cinzel number).
- Trail pickups: power-up bubbles and festival tokens use canvas textures drawn from the same line icons
  (`scene/iconTextures.ts`, lucide via renderToStaticMarkup) instead of the painted badges.
- 56 painted files removed from `src/games/wildbound/art` (ab_, pu_, gems_, mi_, ic_, hud_, ctl_, stat_, levelup,
  gameover_sonic, event_*, badge_free, paw*, plank, sign_*, logo, tagline). What remains: animal portraits and cards
  (head_, card_) and the environment cards (w_).
- Checked by screenshot: store (characters, power-ups, coins), missions, festival, character selection and details,
  the pickup textures. Not seen: the level-up modal (needs a level gained), pickups up close in a live run.
- Still weak: store cards for Nova, Blaze and Zara are crops of the in-game models (flat yellow), not proper art.

## 2026-11-13 night: vehicles — white-water raft and safari jeep (brief §C)

- Ride code generalised: `STEERED` rides (mine cart, raft, jeep) are boarded by running into a parked vehicle, a
  lane change steers, jump clears low hazards (broken rails, gullies, floating logs), slide ducks overhead ones (beams,
  branches), anything else must be steered round. Per-vehicle rider height (`RIDE_BASE`).
- **White-water raft** (`raft`, Adventurer tier; river, swamp, mangrove, waterfall, lagoon, lakeside, jungle): rafts at
  the bank, then the whole trail is river; rocks in the rapids, floating logs, low branches; the raft bobs and leans
  into the steer. **Safari jeep** (`jeep`, Adventurer; savannah, desert, grassland, baobab, beach, coast): boulders,
  gullies with a timber ramp, low acacia boughs; the jeep leans and pitches on jumps.
- Six rows each, one clean lane per row, two full-width jump/duck rows; coins and a gem on the clean lane.
- Procedural models (props.tsx): lashed log raft with rope bindings; open olive 4x4 with roll bar, windscreen frame,
  chunky tyres, spare wheel and headlamps. Warning sounds (rapids, engine), boarding banners, challenge names.
- Test: both vehicles x 12 seeds (fair rows, autopilot survives) plus boarding, steering, jump, duck and rock rules.
  47 tests. Checked live by screenshot: both rides. Not seen: a crash from a vehicle, the gully ramp close up.

## 2026-11-13 night: daily run and weekly expedition (brief §5 seeded daily challenge, §7 weekly expedition)

- **Daily run** ("Today's Trail" card on Missions): the date seeds the course and start zone (`dailySeed`), store
  upgrades off, so every runner gets the same trail. Best score per day saved (`dailyRun`); the first run of the day
  that reaches 300 m pays 30 gems. Retry keeps the daily course; the results screen says "Daily run ended".
- **Weekly expedition**: five themes in rotation by week (Thunder River, Lost Temple Valley, Jaguar Highlands, Emerald
  Canopy, Open Plains), each a set of challenge kinds. Clearing those challenges counts (the challenge card's tally now
  records kinds); milestones 3 / 8 / 15 pay 500 coins / 40 gems / 100 gems (`claimExpedition`). Countdown to the
  week's end. Old saves start empty (optional fields).
- Checked by screenshot: Missions with both cards; the daily run starts from RUN. Not seen: a claim, the daily reward.

## 2026-11-13 night: Final Jungle Gauntlet (brief §I)

- From Expert (300 s), then every 180 s, the director queues three distinct challenges from the run's own history
  (river, bridge, rockslide, cave, treefall, quicksand, temple, swinglog, vines; no vehicles) back to back with 8–10 s
  breathers, then a full recovery. Never started inside a signature zone (railway, Hanging Vine). `GAUNTLET` in run.ts.
- The card reads "Final gauntlet · n/3" with a double gold edge; leg 1 is announced with a banner and the tier chord.
  All three cleared in a row: "Gauntlet conquered" and +1000 (solo). Saved in totals; achievement Gauntlet Champion;
  shown on the results screen.
- Test: 6 seeds, legs 1-2-3 in order, distinct kinds, not before Expert, breathers 7.5–60 s. 48 tests.
- Dev only: `?wbgauntlet` plants a gauntlet 40 m in. Checked live: leg 1 and leg 3 cards. Not seen: the conquered card.

## 2026-11-13: surprise events (brief §3) and weather / disasters (brief §G)

- **Lightning** (storm and rain zones, tier 2): a cold glowing ring pulses on a lane, the bolt lands 30 m out (white
  screen flash, thunder) and the lane burns; one or two lanes per row, never three.
- **Wildfire** (dry country, tier 2): burning lanes to steer round (ember bed and flickering flames), burning
  branches across the trail to duck, flames in the verges either side.
- **Flash flood** (rivers, swamps, any rain, tier 1): floodwater across the trail to jump (narrower than a river
  channel), surge debris (logs, rocks) to avoid, flooded verges.
- **Earthquake** (ruins, temple, canyon, volcanic, cliffside, tier 3): dark fissures that split open into gaps 38 m out
  (camera shake), a falling stone; the last crack runs across the trail (jump).
- Surprise events, labelled "Surprise" on the challenge card: **coin storm** (every free lane full of coins, one
  obstacle a row), **abandoned camp** (no obstacles; tents, crates, a shield and a gem), **supply drop** (a crate falls
  into a lane with its shadow first; catching it switches on a random power-up), and the **golden chest** at the end of
  the hidden stash on a dangerous junction route (+500 coins, +5 gems).
- Surprises are not offered in zones with a signature section (zone 72's railway, the Hanging Vine zones).
- New sounds: warning cues for each, thunder, the chest cascade. New props: flame, glowRing, bolt.
- Tests: 52 after merging onto the vehicles and gauntlet work (fairness and autopilot over 12 seeds for the 5 hazard sections, strike/crack timing, wildfire escapes,
  camp, crate and chest). The 3 km variety test now asks for river, bridge, cave and at least 8 kinds.
- Checked by live screenshot: lightning (strike flash and bolt), wildfire, flood, earthquake (opened gaps), camp,
  supply drop. Not seen: the lightning ring up close, the closed earthquake cracks, the coin storm, the golden chest.
- Not done from §3/§G: night blackout, sandstorm, toxic gas, volcano escape, rival explorer, map fragments.

## 2026-11-13 late: brief library batch + merge of weather/surprise events

- Merged `worktree-agent-ad51904dcca4d27a6` (584e3d5): lightning, wildfire, flash flood, earthquake, coin storm,
  abandoned camp, supply drop, golden chest (see its own entry above).
- New sections (fair rows, banners, warning sounds, challenge names, tests): **spike rollers** (rolling spiked logs to
  jump), **hidden pits** (cracks that open 30 m ahead, `Item.hidden`, `collapse` event: shake, crack, dust), **blade
  hallway** (temple, slide), **swarm** (bees/bats, slide), **spider webs** (slide), **poison frogs** (toxic puddles,
  jump/avoid), **coin tunnel** (weaving coin line in a cave vault, rocks off the line), **hang-glider launch** (flight
  mechanics with a glider: `Item.glider`, `makeHangGlider`, rider hangs under the wing).
- **Collapsing bridge**: on broken-bridge sections the planks behind the runner drop into the gorge.
- **Steering speed** setting (Gentle / Normal / Quick, solo runs; `RunOptions.steer`).
- Autopilot now boards planes/gliders (race rivals fly too). Gauntlet pool includes the new hazard sections.
- 54 tests. Checked live: hidden pits, coin tunnel, glider take-off, blades, poison puddles, swarm (distant).

### Brief coverage audit (2026-11-13)

| Brief section | Status |
|---|---|
| §1 Vision, core loop | Done: event every ~35–45 s, warnings, rewards, return to run |
| §2A Terrain | Done: swinging logs, collapsing bridge, rolling boulder, quicksand, falling trees, spike rollers, rockfall/rockslide, root/obstacle rows, stepping stones, broken bridge, hidden pits. Not: carnivorous plants, rotating stone bridge, mudslide slope, bamboo squeeze, trunk balance, windstorm debris |
| §2B Animals | Swarms (bees/bats), webs, poison frogs done. Blocked on realistic models: jaguar, anaconda, croc, boar, gorilla, elephants, monkeys, eagle, hippo, dogs, leopard, buffalo |
| §2C Vehicles | Done: mine cart, handcar, plane, raft, jeep, zipline, glider, speedboat race, quad bike (ATV), cable car, drone, cargo truck, helicopter (2026-11-14). Not: horse (no realistic model), barrel |
| §2D Traversal | Done: ziplines, vine swing, glider launch, cliff climb, wall run (2026-11-14). Not: falling platforms, rope nets |
| §2E Water | Done: river stones, flood surge, raft rapids, underwater dive (2026-11-14). Not: whirlpool, dam gates |
| §2F Temple | Done: dart corridor, blade hallway, idol gem, golden chest, symbol doors (memory gate), pressure plates with a rolling stone wheel (2026-11-14). Not: collapsing ceiling |
| §2G Weather | Done: lightning, wildfire, flash flood, earthquake, sandstorm, toxic gas, volcano escape (2026-11-14), 9 lighting variants incl. night/storm/fog |
| §2H Mini-games | Done: coin tunnel, coin storm, risky-route rewards. Not: time trial, target toss, precision landing, memory gate |
| §2I Set-pieces | Done: Final Jungle Gauntlet. Animal bosses blocked on models |
| §3 Surprise events | Done: golden chest, coin storm, supply crate, abandoned camp, weather shifts, treasure map fragments, rival explorer, glowing guide bird, photo mode (2026-11-14) |
| §4 Pacing / §5 Fairness | Done (director, tiers, no-repeat, seeded, fair rows, telegraphs, tests) |
| §6 Controls | Done: swipes/keys, assisted controls, steering speed, left-handed, text size |
| §7 Rewards | Done: coins, gems, stars, missions, daily run, weekly expedition, achievements, upgrades, local records. Not: relics, cosmetics/skins, online leaderboards |
| §8 Regions | 100 zones / 20 kits cover all six regions' looks |
| §9 Feedback | Done: sound cue per hazard, shake, ride camera pullback, success card, screen effects. Slow motion deliberately off (it read as stutter) |
| §10 Monetization | Rewarded revive, Play Billing store; no interstitials. Server receipt check still missing |
| §11 Architecture | Data-driven sections, seeded engine, tests; no analytics (privacy) |
| §13 QA | Engine tests 54; live screenshot checks; not tested on low-end phones |

## 2026-11-13 late: wildlife with our own realistic models, a clear forest path, planes in the air

- **Stampede** (`stampede`, Survivor; savannah, grassland, baobab, desert, beach, coast, lakeside): the realistic
  elephant (titan.glb, scaled 1.45 to a bull) charges down one or two lanes per row (never three), closing the gap;
  the ground shakes as they pass. **Jaguar ambush** (`jaguar`, Adventurer; jungle and deep forest): the jaguar (tiger
  body, jaguar coat) crouches on the verge facing its lane, springs into it 26 m ahead (`Item.ambush`, `pounce` event:
  roar, jolt) and turns to face the runner. `Wildlife` in WorldScene pools full-quality `WildAnimal` instances.
  Both join the gauntlet pool. Tests: 55.
- **Clear forest path** (`clearVerge`, all kits): off-centre island trees stand at least 1 m + 0.42 x height from the
  edge (trunks can't reach the trail, canopies still arch over), broad undergrowth keeps 1.2 m off the edge and the
  nearest stays small, hanging vines keep back.
- **Planes in the air**: the first airstrip chance in a run is always taken; airstrips also in forest clearings, pine
  woods and riversides; the plane or glider picks the runner up from any lane (like a zipline); sky overflights in
  every kit (not night or storm), lower over woods, every 150–330 m.
- Magnet ring and power sparks recoloured from neon pink/green to the champagne palette.
- Autopilot jumps onto parked trolleys (it used to run into them).
- Checked live: stampede (elephants charging past), jaguars crouched on the verge, forest path, airstrip take-off from
  a side lane. Not seen: the jaguar's spring up close.

## 2026-11-13 night: launch pass — every run meets the plane and wildlife, level jumps, release build

- **Why players never met them** (headless sim, 12 runs x 150 s, random start zones): no run reached an animal
  (jaguar unlocked at 90 s, stampede at 180 s), half had no plane, and one run had a single challenge in 150 s. Each
  400 m zone held a junction, leaving ~178 m of trail per zone; most challenges are longer (a flight is ~208 m), so
  they were pushed back again and again.
- **Challenges come first now**: `planSections` plans 1,100 m ahead before `planForks` (900 m), and a junction waits
  until after any planned challenge. Gaps 16–28 s, first hook 22–32 s.
- **The opening act** (`RunSim.planned`, outside the railway/vine signature zones): a real first challenge (no
  surprise reward), then the bush plane, then wildlife (a jaguar under trees, elephants anywhere open). The plane
  returns every fifth challenge where an airstrip fits. Jaguar from tier 1, stampede from tier 2. Sim after: challenge
  every ~30–40 s, plane by ~70 s, wildlife by ~110 s in every run. New test; tests 56.
- **A gap after every ride**: the first row after a trolley, plane, glider, zipline, cart, raft or jeep is a full
  reaction gap past the drop-off (zone 72 had a log wall 3.8 m after the trolley's buffer).
- **Jumps stay level**: the runner rolled up to ~18° and yawed ~30° mid-air (a lean from lateral acceleration that
  rocked back as the lane change settled, plus a second, outward lean on the Runner group). Now: no roll in the air,
  a 4° lean with the velocity on the ground, a gentler turn toward the new lane.
- **Airstrip clearing**: over a flight or glider section, trees (and bamboo) stand back by their reach + 4 m, vines
  and ruin arches go, so the plane climbs over open ground instead of through the canopy.
- **Plane**: fuselage painted with a 1024x512 livery texture (oxblood cheat line, navy pinstripe, red cowl and spine,
  panel lines, rivets, PP-WLD registration, exhaust soot); wider red wingtips; red fin over a navy stripe. The camera
  clears the tail as soon as the runner boards.
- **Water** (streams, floods): rippled world-space surface over a faint sandy bed instead of a flat painted sheet.
- **Release build**: `node scripts/build-wildbound.mjs [outDir]` builds `dist-wildbound/` and copies the assets it
  loads (models/wildbound, models/amazon props and textures, icons): 77 MB. The old standalone build had no assets at
  all. wildbound.html gains theme colour, description and home-screen tags. Checked served from a static server:
  home, a run, no errors.

## 2026-11-14: Amazon Run — steady speed, the brief's remaining vehicles and activities

- **Name**: the game is now called **Amazon Run** (logo "AMAZON RUN · Into the Wild", page title, game list, badge,
  profile line). Code folders, save keys and the game id stay `wildbound`, so nobody loses progress.
- **Steady speed**: the run used to climb from 9 to 22 m/s, so it got too fast and ended early. Now a short warm-up
  (9 → 12 m/s over ~100 m), then 12 m/s for the whole run; only speed power-ups, abilities and vehicles go faster.
  Difficulty grows with challenges and density, not speed. The pacing director plans in seconds, so it adapts.
- **Vehicles (brief §2C)**: built on proven, tested ride rules, each with its own model, sound and banner. Speedboat
  race (raft rules, river kits; white hull, navy bottom, red stripe, windscreen, outboard), quad bike (jeep rules,
  open and rocky kits), cable car (zipline rules, gorges and mountainsides; a red glazed cabin rides with the runner,
  cabins wait at each station), drone lift (glider rules, open kits; a quadcopter with spinning rotors, navigation
  lights, harness line). `Item.skin`, `SKIN_OF`, `RIDE_SECTIONS`.
- **Activities**: symbol doors (brief §2F memory gate: the card names a symbol, each gate has three carved doors, only
  the matching one rises, late; four gates, shuffled each time), sandstorm (sand haze closes in; drifts to jump,
  flying branches to duck, rocks to steer round), toxic gas (green clouds over one or two lanes, green haze), volcano
  escape (lava streams to jump, falling burning rocks, embers; red smoke). New hazards `door`, `gas`, `lava`.
- **Treasure map fragments** (brief §3): one every 550–750 m on open trail; every fourth completes the map for
  +2,500, 300 coins and 10 gems. Banner and sound per fragment.
- The opening act keeps the real bush plane (a glider or drone ride no longer stands in for it), and a run that starts
  in a railway or vine zone gets its plane and wildlife as soon as it leaves.
- Tests 57 (new: all eight new challenges fair and survivable on 12 seeds; skins; symbol doors always have exactly one
  open door bearing the symbol). Checked live: all four vehicles, cable car ride (frozen mid-line), symbol doors,
  sandstorm, toxic gas, volcano. Not seen live: a map fragment pickup.

## 2026-11-14 later: the rest of the brief — truck, helicopter, plates, climb, wall run, dive, rival, guide, photo mode

- **Cargo truck** (jeep rules, dirt roads): an open-cab expedition truck (low cab, windscreen frame) with a timber
  flatbed the runner stands on; the camera pulls back further so the road stays in view.
- **Helicopter** (flight rules, jungle helipads): a red and white utility helicopter hovers over the runner, who hangs
  on its rescue line (body and tail stay above the view); main and tail rotors spin; helipads get the airstrip clearing.
- **Pressure plates** (temple): glowing red-sigil plates to jump or avoid (`plate`), a dart volley to slide under, and a
  stone wheel rolling down one lane at the end (a moving boulder with room to roll).
- **Cliff climb** (zipline rules, cliffs and gorges): cliff faces on the outer lanes step down along the line with a
  mossy ledge at the grip (the climber reaches, hand over hand); the middle line is a rope traverse.
- **Wall run** (zipline rules, canyons): on the outer lanes the runner tips onto a sheer canyon wall (roll ±1.15) and
  runs along it; the middle line is a row of stone pillar tops. Walls never stand between lanes.
- **Dive** (rivers, lakes, coasts): the trail floods into a walled channel; the surface ripples overhead (above the
  camera: the view is from underwater), a blue-green haze, curtains of weed to dive under (`kelp`), rocks to steer round.
- **Rival explorer** (surprise-free challenge, anywhere): a lion (or a tiger if you are the lion) races on the verge,
  nine metres ahead at the gun; take two thirds of the coins to beat it (+1,500, +3 gems). Its lead follows your coins.
- **Guide bird** (surprise): a glowing golden bird flies ahead along a weaving coin trail to a golden chest.
- **Photo mode**: pause → Photo mode. The HUD steps away; drag to orbit the runner, wheel/pinch or −/+ to zoom; the
  shutter saves a PNG (shared on phones that can, downloaded elsewhere).
- Fixes found on the way: long lines (ziplines, cable cars, ledges, walls) were dropped from drawing once their start
  was 14 m behind the runner, so cables vanished mid-ride; now they stay until their far end passes. The opening act's
  plane and wildlife checks also look at the pick history.
- Not done: the horse ride (no realistic horse model; a procedural one would break the art direction).
- Tests 58 (new: the eight new challenges are fair and survivable on 12 seeds; skins; the rival race is decided once at
  the finish and lost without coins; the guide trail ends at a chest). Checked live: all of them, including photo mode.

## 2026-11-16: extra challenges, a better first impression

- **14 extra challenges** (all fair-tested on 12 seeds, autopilot survives): snapping plants (`snapper`), turning
  stone bridge, mudslide (`mud` waves sliding at the runner), bamboo squeeze (`bamboo` clumps), trunk balance (a
  fallen trunk along the middle lane over the drop), windstorm (grey gale haze), falling platforms (planks that give
  way 30 m out), rope nets (`net`), whirlpools (`whirl`), dam gates (`sluice` walls, one open with rushing water),
  collapsing ceiling (falling blocks in a temple corridor), time trial (checkpoint `gate`s, all for a bonus), ring leap
  (`ring`s hung high, jump through all), barrel ride (raft rules). Precision landing: every airstrip marks a landing
  pad lane; touch down on it for +750. Tests 59.
- Fixes found on the way: the flat glow ring was stretched to 1 m tall wherever it was used (the golden chest, the
  lightning telegraph): now a thin ground ring. Temple pillars now line the collapsing ceiling, pressure plates and
  symbol doors. Bamboo obstacle culms were a few centimetres thick (the kit's width is its leaf spray).
- **First impression**: the loading screen is the blurred jungle drifting closer behind a veil, the title centred
  and sized to fit any phone (it wrapped and spilled off the left edge), a progress line with a percentage and
  rotating tips. On wide screens the home title is centred at the top (it sat at the top left). Pressing Play shows a
  "Get ready" card naming the start zone while the scene warms up, instead of a raw half-framed scene.
- **Start on the straight**: every zone opens with a sharp corner centred on its boundary, and runs started exactly
  there, so the countdown camera looked round the bend with the runner at the screen edge. Runs now start 14 m into
  their zone (`RUN_START_IN`; zone 0 has no corner and still starts at 0).
- Horse: still blocked on a realistic rigged model (no free download without an account; paid ones exist).
