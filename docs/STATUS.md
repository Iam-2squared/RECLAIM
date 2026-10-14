# RECLAIM status — HOME preview, 2026-10-14

| Category | State |
| --- | --- |
| Tokyo title | Existing PR #1 art and timed reveal preserved. |
| HOME | Implemented: original shelter/survivor art, SOLO/four-person layout, five local panels, cosmetic/equipment previews and Shiretoko briefing. |
| Local preview only | Appearance/name, two gun slots, held gun, sheathed katana, rear-three mannequins, planned route/rarity explanations. No server authority. |
| Not implemented | Movement, shooting, combat, real co-op, authentication, shared boss HP, ranking collection, ownership, upgrades, payments. |
| Main/release boundary | No main merge/push or force-push. Prior unauthorized Production-labelled deployment incident is recorded below; HOME V2 does not deploy. |
| Not measured | Physical PC/iPhone/iOS Safari behavior, device FPS and gameplay performance. Automated WebKit coverage is separate. |

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

The Draft PR's artifact contains actual WebGL images, static-file performance timings, standalone HTML and test evidence. `RECLAIM_Home_Preview.html` includes title + HOME and can work in a desktop browser from a file without a server or runtime external assets. iPhone Files/Quick Look is not an interactive test environment; iPhone verification uses an HTTPS Preview in Safari. The legacy title filename is retained as an identical alias. Both include the Three.js MIT notice. No third-party art/audio/font files, credentials or API keys are bundled.

The visual review gate is the survivor's presence and readability of the four-person formation, particularly at 390px portrait width. Art approval is still the owner's decision. Next implementation would be Shiretoko movement/shooting as a separate task; online co-op/shared raid work remains later.

## iPhone Safari follow-up

See `IOS_PREVIEW.md` for investigation and the new nine-case iPhone/WebKit suite. Local WebKit 27.2 passed all nine cases with actual WebGL, touch controls, four portrait sizes, changing viewport height, every menu, persistence and unavailable-storage/WebGL behavior. Test-only Linux libraries were extracted into the browser cache because system package installation is restricted. Only Playwright's system dependency precheck was bypassed locally; no browser assertion or test was skipped. CI installs normal system dependencies and does not bypass that precheck.

The original 30 Chromium cases remain in CI alongside WebKit. The final source head and CI result are recorded in PR #2. Safari 15.4 is the explicit output/functionality baseline, not a claim that every older iOS version was run.

Vercel Preview creation is authorized for RECLAIM only. Team-scoped discovery initially returned HTTP 403 for `iam-2squareds-projects`; the CLI had no existing authentication. Default-account project creation succeeded and verified the same owner. However, the first Git-source deployment, with target omitted according to the connector documentation, was returned as Production. A second fresh RECLAIM project with explicit API `target: staging` also returned Production. Both finished before cancellation could succeed. Pause requests succeeded for both projects; no further deployment is attempted through this path. Project deletion-link and protected-access operations return 403, so complete removal and an actual usable Preview require the Vercel dashboard or a corrected connection.

| Incident resource | ID | Current handling |
| --- | --- | --- |
| reclaim-home-preview | prj_NXT4Fiik0VYPMuq9XvUhEMzgGZIU | Pause API succeeded; erroneous Production record dpl_E6DTniUfqg8sYePbqe6vmPwUktWw remains. |
| reclaim-safari-preview | prj_c5CQvrRjQRcesZC6GMoMv89evR69 | Pause API succeeded; erroneous Production record dpl_8jG4QeeMG8Hj1XTNQ9DwFUX17mVk remains. |

No functioning Preview URL is reported. No main merge/push or other repository mutation occurred. These Production-labelled records are an incident, not an authorized production release. Authenticated HTTP verification of the paused deployments is blocked by the connection's 403; successful pause responses are not presented as successful iPhone access.

Final executable source `87a55fa4f1f2928f435db89c6f0e37d6c83c3ef1` passed [CI 38524912642](https://github.com/Iam-2squared/RECLAIM/actions/runs/38524912642): 15 state tests and all 39 browser cases (Chromium 30 + iPhone/WebKit 9), with no skipped browser assertions. An earlier run had one Chromium expiry failure, then the software-rendering setting was scoped to WebKit and the same assertions passed in the complete final run. The subsequent status update is documentation only.

## HOME V2: panel usability and visual review

Work resumed from latest HOME head `9948e006345b19402f71b7c561d05917b09f3416`, without resetting to the handoff's older `abdd76b`. Read-only checks again found main README-only, PR #1 at `a9c007d` and PR #2 open/draft/unmerged targeting the title branch. Starting CI 38527219786 and title CI 38512189613 were successful. The two prior stopped Vercel projects/records above remained; V2 makes no deployment or connection/permission change and has **no usable HTTPS Preview URL**.

The five owner-provided Windows images show the small content area and equipment/nav overlap. They do not prove CSS viewport, DPI/zoom or downloaded HTML/source correspondence. Independent reproduction at 1366×600 and 1280×600 measures 340×247px panels and 132px bodies; at 1024×576, 340×223px and 108px bodies. The cause is fixed absolute top/bottom/width plus a sidebar/footer competing for the same corner, not a demonstrated Windows scaling problem.

HOME V2 replaces that arrangement with HOME-only grid regions, a 560–900px desktop panel, fixed header/action footer and one shrinkable scroll body. Equipment/save/battle-online explanations move into a card in the preview/footer column. Navigation retains a separately reachable title return and scrollable items if needed. At 1366×600 the panel is approximately 666×488px and the action-bearing body 336px; at 1280×600, 622×488px; at 1024×576, 560×464px/body312px. The full map initially fits beside route details and both gun-slot card-name rows fit the low-PC initial view. Tall-window panels cap at 85vh.

PC open panels prioritize the own character in a reserved right column. Compact open panels are full sheets with fixed actions, inert background and focus restoration. Closing retains the chosen formation and shows all four models/labels. Camera fitting uses the real UI stage plus header/footer obstacle rectangles and the clear central band between footer cards. It centers the model/weapon union, separates labels, and responds to ResizeObserver/viewport/panel/formation/name/weapon events. HOME fog follows the fitted camera so smaller viewports do not hide models in opaque fog. Original geometry is reused; no art asset or 3D object was added. Title-specific CSS, Tokyo geometry and reveal timers are unchanged.

Regression changes are explicit: the old compact-panel-open four-person assertion becomes sheet/content/fixed-action assertions, followed by the same stronger closed-four assertions. The new header naturally tabs from heading → close → name input, so that keyboard expectation is updated and both stops tested. DOM/render samples are read together through resizing instead of mixing boxes from different frames. No test is skipped or removed and no generic timeout is extended. V2 checks add six PC conditions, nonmodal keyboard/scroll/START protection, rotation/long weapon/name/stable fitting, title-revisit camera invalidation, three Safari sheet conditions, a simulated missing-native-inert fallback and safe-area substitutes in two orientations. The suite totals 15 state/input and 53 browser cases (39 Chromium + 14 WebKit).

During development WebKit exposed an initial-label registration race, hidden-sample label lookup and short-view label collisions; these were fixed, not dismissed as device quirks. A pre-final Chromium pass also found the changed header Tab order; the replacement expectation checks both the close control and name input. The new safe-area rotation case exposed Linux WebKit's stale IntersectionObserver root after a resized mobile viewport (root 390×664, actual/visual viewport 390×844). Actual bounds, hit targets and a successful cancel tap replace that new case's misleading observer assertion; no functional check is weakened. Final local/CI counts, source head, hashes and reviewed images are recorded in the final PR/review manifest after the complete checks.

**Visual approval is pending.** Automated Chromium/WebKit and software WebGL do not measure physical iPhone/Windows hardware, real 125% browser zoom, the real iOS keyboard, FPS, heat or battery use. The user can review the V2 HTML on PC and the review ZIP now; Safari on a physical iPhone still needs a separately verified HTTPS URL. No main merge, force-push, PR #1 rewrite or new production publication occurs in this V2 task. The earlier Vercel incident remains recorded above and is not described as fully removed.

The first V2 CI run [38541657478](https://github.com/Iam-2squared/RECLAIM/actions/runs/38541657478) passed 51/53 browser cases. The 1440×900 panel camera predicate and original title expiry predicate timed out at their existing 5-second assertion limit; both failure screenshots subsequently showed the correct own-camera/hidden-boss rendering. This supports software-GPU scheduling delay, not a proven physical-device timing result. The browser fixture now launches a fresh process per case to avoid accumulating GPU work across unrelated cases. Every original assertion and timeout remains; within-case reload, screen revisit, frame-stopping and resource-reuse checks remain. Final-head complete CI results are recorded in PR #2 and the review manifest; this failed run is retained.
