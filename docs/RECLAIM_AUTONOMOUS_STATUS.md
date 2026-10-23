# RECLAIM — CI-first autonomous status (canonical checkpoint)

Saved: **2026-10-24 00:13 JST** (2026-10-23 15:13 UTC). Repository: **Iam-2squared/RECLAIM only**. This checkpoint lives on branch `ops/reclaim-ci-status` and **is not a production merge**. Its branch is isolated from in-progress code CI to avoid cancelling exact-head jobs.

## Current release gate

**Priority:** finish all required CI for current main and adoptable open PRs before creating any new gameplay/terrain/vegetation/Japan features.

- **main**: `cba1af9c686aef5020a20bb6a6a8e3e3f46def17`; `RECLAIM preview checks` run [39963077794](https://github.com/Iam-2squared/RECLAIM/actions/runs/39963077794), attempt 1, all **five** browser suites SUCCESS. This does **not** imply all candidate PRs are green.
- **#18 Japan tile auto-refill**, exact HEAD `38ab293811c7e2235c0b4bf201ac68cd1f18c7d7`: run [39971560462](https://github.com/Iam-2squared/RECLAIM/actions/runs/39971560462), attempt 1, **5/5 SUCCESS**. Chromium-world actual checkout was GitHub merge SHA `9f43f99`, joining this head into current main `cba1af9`. Still Draft/feature-frozen, unmerged.
- **#23 combat drone attack telegraph**, exact HEAD `81655f0f38297c7d0c9b9f8ab21937f6da95f033`: run [39972169500](https://github.com/Iam-2squared/RECLAIM/actions/runs/39972169500), attempt 1, **5/5 SUCCESS**. Chromium-world actual checkout `77e58a0` joined head into current main `cba1af9`. Still Draft/feature-frozen, unmerged.
- **#6 Shiretoko terrain**, HEAD `142504aba09615152f3107c2ea2c1c9c87f19f76`: [39968421332](https://github.com/Iam-2squared/RECLAIM/actions/runs/39968421332) failed; v4 frozen-frame test and cancelled companion jobs mean NOT MERGEABLE AS VERIFIED.
- **#27 pinned browser/runtime CI repair**, HEAD `f9fba996b5fb17efc6afee58a4388c1d85f2cde4` stacked on #6: terrain [39974044767](https://github.com/Iam-2squared/RECLAIM/actions/runs/39974044767) FAILED; v4 passed, core's `WebGL readback fence timed out` on software SwiftShader. Core scene teardown thereafter succeeded (75ms). Gallery [39974044688](https://github.com/Iam-2squared/RECLAIM/actions/runs/39974044688) passed; preview [39974044714](https://github.com/Iam-2squared/RECLAIM/actions/runs/39974044714) had Chromium-world failure (other four green), separately outstanding.
- **#31 combined narrow CI repair** stacked on #27, exact HEAD `28744d2145c22e3ee6c8d714aebfba0330af3af2`. Terrain run [39975143546](https://github.com/Iam-2squared/RECLAIM/actions/runs/39975143546) (attempt 1): core job `120487664042` **FAILED** despite all substantive terrain, true browser input/frame, 4,136.463m/42,791-tick walking, zero ground error, clean scene resources passing; failing teardown step is `[review-close] webgl-context` (context extension call blocks >10s). V4 job was running at checkpoint. Preview [39975143610](https://github.com/Iam-2squared/RECLAIM/actions/runs/39975143610): four mobile/UI suites passed, Chromium-world still running at checkpoint. No edits to these actively tested heads by this run. Diagnostic comment [6368135211](https://github.com/Iam-2squared/RECLAIM/pull/31#issuecomment-6368135211) details failure and minimal page-before-context teardown hypothesis, **not asserted fixed**.
- **#13** first-frame drone floor bugfix HEAD `be40caefc294d63b66d79d791d06aa0fef533449`: [39930450096](https://github.com/Iam-2squared/RECLAIM/actions/runs/39930450096) had five green checks, **but tested against old main `37e6637`**, not current main; revalidate before merge.
- **#10, #15, #16, #17, #20, #24** remain open and incompletely tested. Historic red/cancelled workflows and/or stale main integrations must not be represented as current PASS. #4 HOME V3 excluded by user instruction.

## CI failure classification, source evidence

1. **Software-WebGL frozen-frame readback**: #27 job `120484147679` at SHA `f9fba996` fails `WebGL readback fence timed out`, although all browser teardown steps finish in ~75ms.
2. **Compositor candidate old cleanup**: #30 old SHA `1ff41e559` job `120481916721` passes real compositor capture, real 4.1 km, disposal; then `close-browser` hangs due context/browser close. That historical failure remains RED; superseded by integrated #31.
3. **Integrated #31 remaining cleanup**: job `120487664042` passes capture (11,873ms), route (4,136.463333m), scene dispose (7ms); `renderingContext.evaluate(...WEBGL_lose_context...)` hangs **before** explicit context/browser close. Distinguish GPU-context-loss request from Playwright context close. Investigate `page.close({runBeforeUnload:false})` prior to close as a testable hypothesis; do not remove/skip cleanup or relax existing 10s total wall budget.
4. **Historic Chromium pointer-lock / walking failures**: #15 job `120344098796`, #16 `120347959597`, #20 `120383167356` (old source) failed real walking / pointer-lock tests; current main fixed native-input regression via PR #25 but exact new candidate integration remains unverified.
5. **Workflow concurrency**: default title group `title-${{ github.ref }}`, terrain group `shiretoko-review-${{ github.ref }}` (ref-local). Historical cancellation largely linked to updating HEADs while CI was active. Never count cancelled jobs as PASS or blanket-rerun stale failed jobs.

## Actual actions of this checkpoint run

- Read fresh main, **all open PRs**, check runs, named workflow jobs and real logs; differentiated exact HEAD and synthetic main merge identity. No local full build or new local WebGL test claimed.
- Closed four verified superseded duplicate experiments **without merging** and left red history intact: #11 (duplicated #13 first-frame drone guard), #14 (duplicated #13), #12 (catalog-only duplicate of source-validated #15), #26 (failed native PBO attempt superseded by #31). Evidence comments: `6367989816`, `6367992479`, `6367994658`, `6367996955`. Other worker separately closed #30; not claimed as our action.
- Added exact failure/evidence comment `6368135211` to #31. No changes to #6/#27/#31 source during active workflows.
- Created this *ops-only* status branch and document, **not merged into main**, to avoid generating/cancelling new workflows.
- GitHub main merges this run: **0**. Gameplay source changes this run: **0**. New production deployments: **0**.

## Publish / authority boundary

Existing Vercel project only: `reclaim-safari-preview`, project `prj_c5CQvrRjQRcesZC6GMoMv89evR69`, team `team_ovY3gbfsldk7aCRexivv2MkF`. Legitimate project lookup remains **403 forbidden** for team scope `iam-2squareds-projects`. Do not bypass, re-scope, create replacement or change Git deployment settings. Public URL and currently deployed SHA **not independently verified**; no new playable URL.

All TITLE/HOME art and controls, PC/mobile regressions, storage/campaign saves, mobile FPS guard, 480m vs 2400m positions, and exclusion of PR #4 are preserved. No physical Windows/iPhone/Android verified.

## Next three exact tasks

1. Diagnose/repair #31 **WebGL context-loss teardown** from job `120487664042` on a safe separate fix HEAD; preserve exact browser input, rendered framebuffer, 10s cleanup budget, full 4.1km route, and resource assertions. Avoid conflicting writes to concurrent worker branch.
2. Collect latest **#31 v4 and five preview jobs**, then validate full terrain aggregator source/artifact checksum join at the exact final HEAD. Only after all succeed merge repair onto #27, rerun the parent exact new HEAD then integrate safely toward #6.
3. Revalidate remaining adoptable PRs (#13/#15/#16/#17/#20/#24/#10) against updated main and fix actual failures; do not confuse historical cancelled/red or a draft merge with production readiness. Continue CI-only until all required gates are green, then resume previously approved game development.

No assertion weakening, removed tests, skip, force-push, unauthorized scope access, unrelated repository or other automation touches.
