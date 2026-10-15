# PC TITLE / HOME — supplied-image presentation

## Scope and source

2026-10-15 owner direction: match the two supplied pictures, desktop only. No new world, mission, combat, campaign, mobile redesign, hosting or production deployment.

Base: main `908dbcdf2e1330b900ca4bcd748df4d4dc8685bd`. Existing separate HOME V3 Draft PR #4 is not changed. This change uses its own feature branch.

The original 1536×864 JPEG files are copied byte-for-byte into `src/ui-reference/`. The complete composition, including lettering, survivor, scenery and cards, is rendered as a 2D backplate. It is NOT newly generated/rebuilt Three.js scenery. Source sizes/hashes/provenance are in `src/ui-reference/manifest.json`. Owner requested this usage; no acquisition/licence evidence was supplied, and these are not described as original procedural assets or Fab models.

## Display and interaction contract

- Desktop: width ≥960px and height ≥441px. Entire 16:9 artwork fits inside the viewport without cropping/stretching. Non-16:9 windows get dark letterboxing. Existing narrow-layout fallback remains, but no mobile improvements are included.
- `reference-layout.ts` defines 20 measured hit regions in source-pixel coordinates; `reference-menus.ts` maps them to percentages on the exact same stage. Buttons are native focusable elements, not a screenshot pretending that input worked.
- TITLE START → HOME; HOME START → existing preflight. Only the existing explicit launch starts the unchanged mission. Reload always enters TITLE.
- TITLE arrows/Enter navigate START, available CONTINUE, SETTINGS and EXTRAS. CONTINUE is disabled without a real campaign checkpoint. A valid checkpoint opens preflight, not an automatic mission or fake award.
- HOME: five existing panels; original map hiding/reset confirmation, name/palette apply/cancel, equipment save, honest unconnected boss/ranking states. Gear opens settings; envelope shows an unconnected local notice. Escape closes a panel first, then returns HOME to TITLE. HOME wordmark is also the return target.
- SOLO/4-person mode is a local formation sample. Three labelled sample cards appear; there is no matchmaking and no claim of actual online teammates.
- Character/equipment illustration is FIXED to preserve the requested picture. Name, palette and equipment VALUES remain configurable/persisted. Open panels disclose the fixed illustration. Custom names and changed held-equipment labels are shown as separate DOM overlays; the baked character/gun art is not falsely described as changing.
- Sound starts OFF. Settings save display quality/motion preferences safely; missing/corrupt/denied storage remains nonfatal. No new external API/CDN/font/TTS or dependency.

## Rendering boundary

On desktop TITLE/HOME, the existing Three renderer is dormant: no `world.render()` and no initial title shader precompile. A renderer context/CPU scene is retained for the existing mission and narrow fallback; this is not a claim that WebGL is never allocated. When a mission starts, all reference presentation CSS is disabled. `src/world/`, `src/mission/`, `src/campaign/` and Blender tools are unchanged.

Use `snapshot().menus.mode` to distinguish `reference-2d`, `legacy-3d` and `mission-webgl`. `renderClock.rendererFrames` reads the real Three renderer frame counter. `render.drawCalls` is the LAST Three frame's count and can be nonzero after visiting legacy/mission even while the 2D menus are dormant; do not reset or mislabel that counter.

## Verification

- New native-size visual tests compare every RGB channel against the original JPEG on a browser canvas. The bound is **≤1/255 for every channel, zero pixels over that bound**. Canvas JPEG conversion and CSS compositing can round by one code value; this does not allow shifted layout or extra visible overlays.
- Native-size and 1920×1080, 1366×768, 1280×720, 1024×576 real screenshots. Existing six desktop panel-fit cases remain, including low-height windows. Every five-menu panel, real preflight, arrows/Enter, settings, mail/extras, persistence, unavailable WebGL, and ten TITLE/HOME returns are exercised.
- Previous wide-screen 3D-specific camera assertions now explicitly branch to the real 2D contract. Unchanged narrow-layout reveal/cooldown/timer tests still run; they are not skipped. The world-return test changes only its HOME detection to `menus.mode`; world traversal/combat assertions and their radii/deadlines are untouched.
- Initial local UI run retained failures: large-window character panels inherited `align-self:center` and shrank instead of keeping the reserved height; fixed with explicit 82% height/start alignment. A resize-through-legacy case incorrectly expected the LAST renderer draw-call value to reset to zero; now checks the actual renderer frame counter remains unchanged instead of overwriting statistics.
- First CI WebKit run was 13/14: the unchanged blocked-module guard expected the original Safari recovery copy. Preserve that original narrow-layout copy while showing PC Chrome instructions at desktop sizes; do not skip/relax the guard. Denied saves also expose the existing error text visibly over HOME instead of hiding it with the default reference artwork's footnote.

Final counts, source SHA, CI URL and exact comparison metrics belong in the PR and supplied review manifest. No skip, fake success, main merge or production publication.

## Run

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package:preview
npm run test:e2e
```

Open `release/RECLAIM_PC_Menu_Preview.html` in PC Chrome. Assets are inlined, so `file://` requires no server. Screenshots and pixel measurements are written to `test-results/reference-evidence/`.
