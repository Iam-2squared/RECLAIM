# RECLAIM — Autonomous integration checkpoint (2026/10/25 6:40:25 JST)
Scope ONLY: Iam-2squared/RECLAIM and existing reclaim-safari-preview Vercel.

## Confirmed current main and evidence
- GitHub main HEAD before this integration: `672501713183e769a7d00d4c9162b9da1345c638` (squash merge PR #103 from exact source `d26a07e0dfc45ec9f36e7822080a92722e66c19c`). A genuine TWO-seed-head low-poly meadow grass mesh joined the existing grass instance group; focused test and actual Chromium/SwiftShader WebGL evidence. Source attempt 1 terrain #40134008188 **3/3 SUCCESS**, preview #40134008231 **5/5 SUCCESS**, nature #40134008214 **1/1 SUCCESS**, artifact #12576062286; PR #103 merge confirmed GitHub response. Source verification is NOT a substitute for new main push CI.
- New PR #103 main push at checkpoint: terrain #40134767290 attempt 1 **3/3 SUCCESS**; preview #40134767363 attempt 1 **3/5 SUCCESS with chromium-world and chromium-ui IN_PROGRESS**. The main release is NOT fully green until all 5 pass, and no subsequent merge or Vercel publish may rely on pending jobs.

## Three independent substantive changes this run
- PR #104 original source `2873aa2131703bca4aa013a4c07be298e8396daa` adds moisture/slope/rock-gated fine peat patches directly to physically walkable marsh terrain fragment shader, reusing the original detail sampler and geometry; focused test tests/shiretoko-wetland-peat-material.test.mjs. Original source exact attempts 1: terrain #40134493037 **3/3 SUCCESS**, preview #40134493014 **5/5 SUCCESS**, native nature #40134493035 **1/1 SUCCESS**; nature artifact #12576546664. Real comparison shows subtle lake/wetland color changes and no new scene objects; no Windows FPS claim. This nonforced integration commit combines these two exact feature blobs with the NEW post-#103 main tree and this canonical checkpoint. **Combined feature HEAD is UNVERIFIED and all 3+5+1 CI gates are required fresh**; do not merge it early.
- Independent PR #105 original source `bb8bf183431f9904926220cc5fe780b280344d18` adds a second physical-3D wooden knee rail at +0.48 m under both existing handrails at +0.88m, reusing one rail InstancedMesh across 245 wooden panels (no extra draw groups). Original nature run #40134741029 attempt 1 **1/1 SUCCESS** and artifact #12576661963, terrain #40134741009 attempt 1 **3/3 SUCCESS**; preview #40134740998 attempt 1 **2/5 SUCCESS, remaining IN_PROGRESS**. Feature not merged. The original boardwalk 5m-derived indexed deck, walker collision, full-width entrances, and save contract are unchanged.
- A ZIP from exact PR #103 fully-green source artifact #12576321284, with self-contained terrain + intro HTML, seven opt-in walkable 3D/scene links, native actual WebGL screenshots and SHA256 manifest is available locally as `RECLAIM_SHIRETOKO_PR103_d26_SEED_GRASS_INTERACTIVE_20261025.zip`. Source CI all 9/9 passed; it is NOT a verified Windows GPU FPS or a Vercel deployment. Separate fully-green older main ZIP `RECLAIM_SHIRETOKO_MAIN_265be365_INTERACTIVE_OFFLINE_20261025.zip` is preserved.

## Protected boundary and publication
- Tokyo TITLE / Shiretoko HOME references, original 480m game saves, mobile FPS guard, 2400m terrain ground contact, other repos and tasks untouched. PR #4 intentionally remains unmerged.
- Normal GET existing Vercel `reclaim-safari-preview` projectId `prj_c5CQvrRjQRcesZC6GMoMv89evR69` / teamId `team_ovY3gbfsldk7aCRexivv2MkF` returned **403 FORBIDDEN (needs authentic team access)**. NO deployment or auth/scope bypass; do not retry until real authorization changes.

## Next three concrete actions
1. Collect exact PR #103 main preview #40134767363 **remaining 2 jobs** for `672501713183e769a7d00d4c9162b9da1345c638`; if any real failure, preserve logs and fix before treating main as release-ready.
2. Collect new integration SHA and attempt 1 terrain 3/3 + preview 5/5 + real nature 1/1 for PR #104 and render evidence; ONLY then verify latest main/base and safely merge expected HEAD.
3. Collect PR #105 old preview and safely integrate on latest main once independent; reverify exact new head. After fully-green main push, package SHA-pinned PC interactive ZIP and publish to existing Vercel only with valid native team access.

---
## Earlier checkpoint history (preserved verbatim)

# RECLAIM — development handoff (2026-10-25 04:22:21 JST)
Scope: `Iam-2squared/RECLAIM` and existing `reclaim-safari-preview` only. CI below is evidence for exact original heads; reread merged integration HEAD and attempts before any additional merge.

## Production branch at integration start
- Main: `0b2a89625cfaa17a00310101d54ebdece51c4cad`, squash merge of PR #97 from source `f575c2c458258ae0b736d76220ca70cfb6be104a`. Adds 16 genuinely supported, colored 3D cabin shelf books in ONE instance batch, plus native 60Hz walker regression. Source PR #97: preview 40123786840 attempt 1 **5/5 success**, terrain 40123786850 attempt 1 **3/3 success**, actual native WebGL 40123786919 attempt 1 **1/1 success**; real images artifact 12572122707. Under identical PR #96/97 CI scene settings, 98→99 draw calls, 140→141 geometries, 244210→244402 triangles, textures 2→2. The external camera screenshots prove actual world/entry, NOT a close-up of new interior book volumes.
- Post-merge main runs `40124516604` (preview) and `40124516510` (terrain) were **not fully completed** at integration preparation. Verify both exact main SHA, run attempt and all 5+3 jobs before treating that main as release-ready.
- PR #98 source `a4ef879d011995d01f305710d22d226dff182c47` contains only inland-lake depth-driven foam GLSL and one focused test, from earlier main `afdaa4356eab2402e48d4de344d37cdaea3a4a77`. Source terrain run 40124147455 **3/3**, preview 40124147393 **5/5**, and nature WebGL 40124147405 **1/1**, all attempt 1 success. Actual WebGL artifact 12572053380; comparison with PR #96 shows changes localised to the real lake water pixels; same 98 draw calls, 140 geometries, 2 textures in source CI. Original ocean foam math, water mesh vertices, 5m terrain and collision unchanged.
- This branch integrates PR #98's exact original feature blobs with the NEW main tree `0b2a89625cfaa17a00310101d54ebdece51c4cad` via an ordinary non-forced two-parent commit. Canonical checkpoint and JSON queue included. The **new integration head is unverified**; all 3 terrain + 5 preview + 1 native WebGL need fresh exact SHA/attempt validation before PR #98 may merge. Do not reuse source-green after tree changes.
- User-visible route after merged and main CI: local `shiretoko-terrain.html` → nature selection or opt-in `?cabin=1&flora=1&boardwalk=1` / `?lookout=1&flora=1`. TITLE/HOME, old 480m world and save, nationwide progression, and mobile FPS guard remain untouched. No claim of Windows GPU FPS.
- Existing Vercel project `prj_c5CQvrRjQRcesZC6GMoMv89evR69` / team `team_ovY3gbfsldk7aCRexivv2MkF` has prior normal GET **403 FORBIDDEN**; no new authorization observed, no deployment or bypass attempted here.

## Next three concrete actions
1. Collect the 5+3 completed post-merge main #97 CI jobs for `0b2a89625cfaa17a00310101d54ebdece51c4cad`, preserving any red/pending evidence.
2. Inspect PR #98's NEW integration HEAD and all 3+5+1 new workflow run/attempt jobs and actual lake image; only after all green, confirm newest main and merge PR #98 with expected HEAD.
3. Collect final main post-merge CI, package a self-contained PC preview with SHA-identified verified scene HTML and actual screenshots, then publish to the existing Vercel project only after normal authorized access (previously 403).

---
## Preserved prior checkpoint history (not current status)

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
