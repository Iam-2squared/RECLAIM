# RECLAIM — Autonomous checkpoint (2026-10-24 22:11:38 JST)
Scope: Iam-2squared/RECLAIM and existing Vercel reclaim-safari-preview only. Exact HEAD/CI must be re-read next run.

## Verified regression fix and current main
- Main after PR #86: `2c37329730af45c0b90fc771b63e818ca875257f`. PR #86 source exact HEAD `99881ddc793c8b77db808c25b4468cc4cf41f951`, preview run **40093675697 attempt 1: all 5/5 SUCCESS**, including the real Chromium-world 18/18 tests (job 120871372359).
- Post-merge main preview **40096250021 attempt 1: all 5/5 SUCCESS**, including Chromium-world. Exact main source terrain workflow did NOT trigger because PR #86 edits only test observer files, not the terrain workflow's monitored paths. Prior main `f08db6ce603d11170ddd679fa4a4f1bf342fb21c` terrain run **40091800587 attempt 1: 3/3 SUCCESS**. Never misreport prior terrain as 2c exact-HEAD terrain.
- Preserved actual prior failure: main preview run 40091800705 attempt 1 job 120865835086 had genuine Shiretoko native walking snapshot z=19.868m, elapsed=4.6333s, KeyW held, 17/18 browser cases successful. PR #86 anchors read-only elapsed observation at actual pre-keydown snapshot; native input/collision/radii/timeouts are unchanged.

## PR #87 tapered sasa, independent WebGL visual evidence
- Feature source HEAD `d03e69658a58a93cf5c97140f945f1651a87a4a8` from base `f08db6c`: terrain run **40093911244 attempt 1 3/3 SUCCESS**; preview run **40093911252 attempt 1 5/5 SUCCESS**; opt-in native WebGL run **40093911235 attempt 1 1/1 SUCCESS**. Seven actual 1100x680 WebGL screenshots from artifact 12559803875 inspected; real lake deck, cabin, wetland and highland render. Source artifact JSON: 5,254 low-flora instances, 64 instanced groups, 245 wooden panels; native walker grounded and no save/network writes. 95 sampled draw calls is a CI scene value, not physical Windows FPS.
- PR #87 changes only `src/shiretoko-phase1/flora-renderer.ts` and `tests/shiretoko-flora-renderer.test.mjs`; their blob SHAs on main `2c373297` match common ancestor `f08db6c` exactly. Six bent, tapered 3D sasa blades plus rooted stem reuse the original species GPU draw group; terrain footprint/seed/route and TITLE/HOME/save untouched.
- This PR branch is being integrated via a **normal non-forced two-parent merge commit** joining verified main `2c37329730af45c0b90fc771b63e818ca875257f` and source `d03e69658a58a93cf5c97140f945f1651a87a4a8`, including this canonical checkpoint/queue. The NEW exact integration HEAD must be freshly read; all matching 3 terrain + 5 preview + 1 native WebGL are PENDING until GitHub confirms, and the branch MUST NOT merge to main before then.

## Local visual review candidate / publication
- Evidence: `RECLAIM_PR87_ACTUAL_WEBGL_CONTACT.jpg` and actual artifact ZIP downloaded. Local preview candidate `RECLAIM_SHIRETOKO_PR87_SASA_LAKE_VISUAL_REVIEW_20261024.zip` has 6 navigable scenes, genuine 3D self-contained HTML and 7 real source WebGL images. ZIP member checksum check passed. It is NOT a production deployment nor confirmed Windows browser run.
- Existing Vercel project `reclaim-safari-preview` projectId `prj_c5CQvrRjQRcesZC6GMoMv89evR69`, teamId `team_ovY3gbfsldk7aCRexivv2MkF` returned **403 FORBIDDEN** on its normal GET. BLOCKED_AUTH, no deployment, alias or scope bypass. Await authorized team access before another deployment attempt.
- Tokyo TITLE, Shiretoko HOME, older 480m campaign/saves, mobile FPS guard and PR #4 remain untouched. Other repositories and unrelated tasks untouched.

## Next three concrete tasks
1. Read the exact NEW PR #87 integration HEAD and all 3 terrain/5 preview/1 WebGL run IDs and attempts; inspect actual evidence and failure logs as required.
2. Only if all new-head required checks pass and latest main base is unchanged/integrated, merge PR #87 with expected HEAD, then collect the exact post-merge main 8 required jobs; preserve failed/pending history.
3. Refresh a verified offline main release with six scene links plus source manifest; existing Vercel release remains BLOCKED_AUTH until normal team authorization. Continue independently scoped real scenery/gameplay only with CI discipline.

---
## Prior retained historical checkpoint
# RECLAIM — Autonomous Checkpoint (2026-10-24 20:42 JST)
Scope: Iam-2squared/RECLAIM and pre-existing reclaim-safari-preview Vercel only. Verify current exact HEAD and jobs each run; this is a hand-off record, not a live-green substitute.

## Integrated visual release
- Latest confirmed main parent for this integration: `7a54ba64bd7a23b6a83002e1b36ceaf0e96d0492`. PR #84 lake+low-density flora first-look source HEAD `5033d73637083f481f14374dbde4ed3c689a8135` merged expected-head squash to main `7a54ba64bd7a23b6a83002e1b36ceaf0e96d0492`.
- PR #84 source attempt 1: terrain run 40089493164 3/3 SUCCESS; preview run 40089493135 5/5 SUCCESS; actual opt-in nature WebGL run 40089493184 1/1 SUCCESS. Inspected actual 1100×680 lake-only vs lake+flora JPGs from artifact 12558457087, not generated images. Opt-in 5,254 low-density instances in 64 instanced draw groups, native actual deck walk/ground contact, original lake camera restored on Escape, no saves/network and resources released.
- Post-merge main terrain run 40090334672 3/3 SUCCESS attempt 1; main preview run 40090334691 had 4/5 SUCCESS and chromium-world IN_PROGRESS at the handoff read. Do not claim fully-green main or publish until all 5 jobs of that exact SHA complete.

## Independent lake bench improvement and exact integration
- PR #85 `feature/shiretoko-lake-bench-backrests-20261024-2025`, code/test source HEAD `d8560c5c1ab93f9d1c60f9623ebeb4bae50465ac`: two upright backrests physically join the existing two 5m-indexed lake deck seats. Reuse the SAME bench InstancedMesh/material/geometry/draw group (instances 2→4), preserve the existing 7 draw groups, 8 grounded legs, 17 deck seams, 3 sides of rails, west entry, walker collision, lake/cabin review and save contract.
- Original PR #85 source attempt 1: terrain run 40090215534 3/3 SUCCESS; nature real WebGL run 40090215456 1/1 SUCCESS; preview run 40090215398 5/5 SUCCESS. Original nature artifact 12558367457 includes real lake-view image with both backs; visually inspected. No local Windows GPU/FPS claim. Local headless Chromium offline attempt failed with EGL_NOT_INITIALIZED and timed out, so no local-browser green asserted.
- This status and machine queue are incorporated with a merge-commit on PR #85 based on main `7a54ba64bd7a23b6a83002e1b36ceaf0e96d0492`, retaining the source and main parents. New integrated PR head must be re-read from GitHub; all exact NEW-head terrain 3/3 + preview 5/5 + real nature WebGL 1/1 and latest main integration must be green before merging. Do not treat original `d8560c5c1ab93f9d1c60f9623ebeb4bae50465ac` green as evidence for new HEAD.
- Standalone PC visual release from exact main `7a54ba64bd7a23b6a83002e1b36ceaf0e96d0492` terrain CI artifact 12559001104 prepared locally: `RECLAIM_SHIRETOKO_MAIN_7a54_LAKE_FLORA_OFFLINE_20261024.zip` containing separate index.html, self-contained terrain/intro HTML and actual source WebGL lake-before/after JPGs. ZIP navigation/relative-target presence validated. Current merged main push CI must still finish before calling this release fully validated.

## Publication
- Existing Vercel project `reclaim-safari-preview` projectId `prj_c5CQvrRjQRcesZC6GMoMv89evR69`, teamId `team_ovY3gbfsldk7aCRexivv2MkF`: scoped GET project returned 403 FORBIDDEN / missing team grant on this run. BLOCKED_AUTH; no new deployment, alias, URL, team scope change, bypass or charges. Do not retry same 403 until user completes normal team authorization.
- Tokyo TITLE / Shiretoko HOME, older 480m save/campaign, mobile FPS guard, old PR #4, national progress gating, and world version untouched. Other repositories/automations untouched.

## Next three concrete tasks
1. Collect the pending main preview chromium-world on SHA `7a54ba64bd7a23b6a83002e1b36ceaf0e96d0492`; investigate real logs rather than treating pending as green.
2. Collect newly integrated PR #85's exact HEAD 3 terrain + 5 preview + 1 nature WebGL, inspect combined lake+flora/bench image, verify current main/base and merge if fully green; then collect post-merge main 8/8.
3. Refresh downloadable self-contained PC review from exact fully-green latest main; Vercel deploy only with existing project's valid team access and verified production response. Continue restrained real-content/polish tasks while CI runs; no historical red-retry cycles.
