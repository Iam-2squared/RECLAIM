# RECLAIM status — HOME preview, 2026-10-14

| Category | State |
| --- | --- |
| Tokyo title | Existing PR #1 art and timed reveal preserved. |
| HOME | Implemented: original shelter/survivor art, SOLO/four-person layout, five local panels, cosmetic/equipment previews and Shiretoko briefing. |
| Local preview only | Appearance/name, two gun slots, held gun, sheathed katana, rear-three mannequins, planned route/rarity explanations. No server authority. |
| Not implemented | Movement, shooting, combat, real co-op, authentication, shared boss HP, ranking collection, ownership, upgrades, payments. |
| Not authorized/performed | Merge, direct main push, force-push or production publishing. |
| Not measured | Physical PC/iPhone/Safari behavior, device FPS and gameplay performance. |

## Source/review boundaries

HOME work is `feature/home-lobby`, based on `feature/tokyo-title-screen` at `a9c007d73a2d831193cff2fd4769bad578a0d5f9`. PR #1 is a dependency and remains unmerged at implementation start. Main is `45b749e9e9eb2c880147c9eb872bc89bcb6b991b`. See the HOME Draft PR for the final source head and current CI run; the title PR's older success does not certify HOME.

## Verification record

- Locked `npm ci`, typecheck, build and standalone packaging succeed in the Work Linux environment. No new runtime or development dependency was added; `package-lock.json` is unchanged.
- State/validation tests: **15 passed**, including the original 10 title/settings tests.
- Browser suite: **30/30 passed locally**, each in a fresh browser process (the original 15 retained or behaviorally updated, plus 15 HOME checks). This full local run covered source `e617d9d`; a subsequent briefing-only visual adjustment moves the combat boundary above equipment and compacts its rows, with a viewport assertion added. The final head's complete CI result, run URL and reviewed artifacts are recorded in the HOME PR.
- Actual local WebGL was captured with Chromium 153.0.8010.0 / SwiftShader. A fresh browser process is required for each local test because this restricted environment's single-process browser exits when its first context closes. CI keeps the normal Playwright browser lifecycle. Local environment failures and the fixed nav accessibility-name issue are not hidden as retries or skipped assertions.
- A real four-survivor WebGL capture measured **53 draw calls / 13,174 triangles**, pixel ratio 1. Model construction happens once; the repeated-screen regression separately verifies stable geometry/texture counts after warming the three held weapons.
- Required viewport checks/captures: 1920×1080, 1366×768, 390×844, 844×390. These are browser viewport checks, **not iPhone/PC hardware certification**.
- Title regression screenshots use the prior standalone file and the changed build with the same reduced-motion setting: **0 different pixels**, both at 1600×1000 and 390×844. Title-specific geometry and CSS were not changed.

## Review/delivery

The Draft PR's artifact contains actual WebGL images, static-file performance timings, standalone HTML and test evidence. `RECLAIM_Home_Preview.html` includes title + HOME and works from a file without a server or runtime external assets. The legacy title filename is retained as an identical alias. Both include the Three.js MIT notice. No third-party art/audio/font files, credentials or API keys are bundled.

The visual review gate is the survivor's presence and readability of the four-person formation, particularly at 390px portrait width. Art approval is still the owner's decision. Next implementation would be Shiretoko movement/shooting as a separate task; online co-op/shared raid work remains later.
