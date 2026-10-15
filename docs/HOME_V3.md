# RECLAIM HOME V3 — cinematic PC presentation

Status: review candidate. The PR intentionally does not merge this UI into main or change Vercel.

## Visual source and implementation boundary

The scene uses compressed original, generated background artwork (`src/home-art/shiretoko.avif`, `ishikari.avif`, `hidaka.avif`) and a pre-rendered original survivor sprite (`survivor.avif`). These are visual layers, **not** a rigged 3D player model. No external commercial game characters or meshes are reused. Runtime region names, buttons, map, player name, selected gun and story controls remain accessible native DOM elements, never baked into the images. Visual source materials and hashes are in `src/home-art/`.

On first HOME entry, cinematic mode shows Shiretoko. Changing to another AREA works only after its real campaign unlock. Ishikari and Hidaka have imagery; Sapporo uses a neutral gradient until approved artwork is available. Locked areas continue to display `???`; selecting an unreached route entry never changes or reveals hidden imagery. Switching HOME artwork never awards a clear or writes progress.

The PC primary view uses photo-real scenery and a moderately stylized original survivor. 4-person mode shows four offline **visual previews**, not online characters. Outfit color and current gun names update with existing local settings; the pre-rendered sprite does not have rigged equipment or fully accurate pose/weapon geometry. For a live inspectable model, the separate **立体装備プレビュー** toggle retains the old HOME V2 model in WebGL-supported browsers. It is intentionally disabled when WebGL is unavailable; the cinematic UI remains usable, but mission launch still requires WebGL.

## Technical constraints

- HOME cinematic is image + CSS: no extra renderer, no new network services, no continuous JavaScript animation loop.
- Embedded AVIF backgrounds and character are intentionally small. First-party HTML packaging stays standalone without external image fetches.
- Reduced-motion / low-quality / hidden tab stops cinematic mist animation.
- The existing title, intro, 18-region route, character/weapon settings, mission launch, world simulation and save keys are untouched except necessary HOME integration.
- All new assets are generated for the project; no external images, fonts, engine templates or non-original character files are bundled.

## Acceptance

- Typecheck, 93 JS unit tests, 27 Python tests, all Chromium UI/mission and WebKit regression tests must pass.
- Inspect cinematic HOME at 1600×900, 1366×768, 1366×600, 1024×576 and independently confirm behavior on a physical PC.
- Exercise all five panels and close/focus paths, initial hidden route, 4-person mode, editable display name/palettes/weapons, explicit 3D inspect toggle, HOME → mission → HOME, and WebGL loss fallback.
- CI on Linux software GPU is not equivalent to physical Windows GPU measurements. iPhone refinements remain out of scope for this PC-first pass.

Artwork source checksums and variants: `src/home-art/manifest.json`. In-bundle images are not downloaded at runtime. Workstation verification must include visual comparison and actual frame timing; CSS composition alone does not establish GPU performance.
