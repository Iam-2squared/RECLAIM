# RECLAIM Autonomous Development Checkpoint
Updated: 2026-10-24 08:18 JST. Scope: **Iam-2squared/RECLAIM** only. Always re-read exact latest PR/branch/main HEAD, CI run/attempt, and Vercel authority before changing anything.

## Verified GitHub state at this checkpoint
- Initial main: `a754a839f48dee12c32368a3ef44d35515b0acba`, main terrain 3/3 and preview 5/5 GREEN.
- PR #53: verified attack wind-up fix (source `97ac91061c885c5088a39d0dc68a280183d97b2c`), preview run `40036800233` 5/5 GREEN, squash merged to main `15b9fdf3a59de7c518a388dcc706845eff04d74b`. Post-merge preview run `40038025194` **pending** at this snapshot; do not call main green until confirmed.
- PR #52: first source `6ab27a34579cefd05159956fc332f93040bfa25d` verified with terrain `40036726054` 3/3 and preview `40036726108` 5/5. Imported existing 3D instanced flora and real indexed marsh boardwalk, opt-in only `/shiretoko-terrain.html?flora=low&boardwalk=1` or `flora=balanced&boardwalk=1`. Terrain and preview also GREEN on later HEAD `2b9d6fe71d3aa3f1a65d89622b282297211bbb61` (runs `40037987149`, `40037987139`).
- **Actual opt-in SwiftShader WebGL** evidence `40037987225`, attempt 1, previous HEAD `2b9d6fe`, artifact `12537842696`: 2 genuine 1100×680 RGB framebuffer JPG; 5009 low flora instances/56 groups; 245 indexed timber panels/490 triangles; shared ground+deck physics jump and landing at exactly y=98.520160098; no external network or game save access. Strict scene disposal failed because **1 renderer-tracked texture remained** (geometries=0, disposed=true). This commit changes only the opt-in deck's two PBR material constructions to lightweight Lambert surfaces to remove the internal fallback texture, **without** changing the material's geometry, deck collision, save guards, screenshots requirements, timeouts or strict 0-texture assertion. New exact-HEAD CI and opt-in live visual proof **REQUIRED**, do not merge yet.
- PR #54: nationwide opt-in region tile refill, HEAD `6cc5dff48930e5c04c7ed9ff82498503f27b55e5`, preview run `40036933204` 5/5 GREEN. Latest-main integration/merge/post-merge CI pending.
- Cliff cabin: local original Three.js structure + shared rigid-floor/wall/stair physical contract and 6 synthetic-terrain tests passing, **not merged, not actual Shiretoko-mesh/WebGL validated**. Do not claim the cabin visible.
- Vercel: original `reclaim-safari-preview`, team `team_ovY3gbfsldk7aCRexivv2MkF`, project `prj_c5CQvrRjQRcesZC6GMoMv89evR69`. Official scoped project/deployment read **403**; `BLOCKED_AUTH`, public deployment/URL/SHA not verifiable. No alternate scope or bypass.

## Next three tasks
1. Recover PR #52 new HEAD: require terrain 3/3, preview 5/5, nature real-WebGL opt-in SUCCESS with **textures=0 after dispose** and screenshots/physics tests. If failure, inspect actual job log, fix product cause, do not relax thresholds/retry blindly.
2. Recover merged main `15b9fdf` preview CI; verify PR #54 exact head vs latest main, merge only after conflict-free evidence and required checks, recover resulting main CI.
3. Merge Shiretoko nature review into current main only after all gates; update downloadable playable HTML; adapt separate cabin candidate to real 5m terrain/collidable walker with images before further merge.

## Non-negotiable boundaries
Do not redesign approved PC/mobile Tokyo TITLE or Shiretoko HOME, modify game saves/world versions, unlock 18 story locations, remove mobile FPS guard, import old HOME PR #4, touch other repos, force-push, bypass GitHub/Vercel permission, pay for new services, or misreport CI/GPU evidence. Existing 480m campaign and new 2400m terrain must stay independent until designed world-version checkpoint migration. No green from older SHA.
