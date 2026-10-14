# RECLAIM HOME — local lobby, 2026-10-14

## Scope and source

HOME is a functional **device-local visual preview** following the Tokyo title. It does not implement combat, accounts, inventory ownership, campaign progression, online party formation, ranking collection or shared boss state.

The implementation follows `RECLAIM_HOME_Work_Handoff_20261014(1).txt`. Only `Iam-2squared/RECLAIM` is in scope. The starting title source was PR #1, `feature/tokyo-title-screen` at `a9c007d73a2d831193cff2fd4769bad578a0d5f9`; main was still README-only. The HOME branch therefore depends on PR #1 and targets its feature branch, not main. Neither PR is automatically merged or deployed.

## Implemented interactions

| Surface | Behavior | Boundary |
| --- | --- | --- |
| Title / HOME | Always boot at title. HOME and title can be visited repeatedly. | Saved appearance cannot resume into a mission. |
| Formation | Default SOLO, optional four-person formation. Own survivor is forward; rear three are explicitly labelled 見本. | `4人編成プレビュー・オンライン未接続`. No fake friends, ping, invite success or matching. Formation is not persisted. |
| Map | Original schematic SVG and 18 inspectable route stops. Region details update on node or select input. | Shiretoko remains the current/briefing destination. Future regions are 未到達 / 未実装. |
| Character | Display name, three clothing/armor palettes, immediate model preview, apply/cancel/reset. | Reset changes the draft only. Cancel, Escape, another menu or title discards the draft. Apply persists locally. |
| Weapons | Two distinct gun slots; choose assault, sniper or rifle; select the held slot. Katana stays sheathed at the left hip. | Duplicate selection swaps slots. Only visual selections are persisted. No damage, ownership, upgrade or purchase. |
| Boss | Unconnected state, common HP `—`, three unconfigured walls, planned Tokyo/Nagoya/Kyoto/Osaka locations. | No invented live HP, percentages, player counts or raid completion. |
| Ranking | Unconnected/collection-pending empty state. | No fictitious names, positions or scores. Equipment rarity and competitive rank are explicitly distinct. |
| START | Shiretoko briefing with current name, guns, katana and local formation. Return to HOME retains choices. | Final combat button is disabled with a visible reason. No loading, matching or battle simulation. |

The route is Shiretoko → Sapporo → Hakodate → Aomori → Yamagata → Miyagi → Niigata → Gunma → Saitama → Tokyo (first arrival: retreat) → Kanagawa → Yamanashi/Fuji → Shizuoka → Aichi/Toyota/Nagoya → Shiga/Lake Biwa → Kyoto → Osaka → Tokyo (helicopter re-entry). The map is an original route diagram, not a geographic survey or online map.

## Local settings contract

- The existing `reclaim.display.v1` quality/motion key is unchanged.
- `reclaim.home-preview.v1` stores `{version:1, appearance:{name,palette}, primary, secondary, held}`. This is not authoritative player/save-game data.
- Unknown versions, malformed JSON, wrong field types, unknown guns and duplicate pairs fall back to whitelisted defaults. Extra progress/party fields are ignored.
- The name uses at most 16 Unicode codepoints, trims surrounding whitespace, removes control characters and defaults to `SURVIVOR` when blank. Input is not rewritten while Japanese IME composition is happening. The count/help explains truncation. Names enter the DOM only through `textContent`/input `value`.
- Palette IDs are `olive`, `slate`, `clay`. Character changes are transactional; weapon choices save immediately.
- Read/write failures are caught. A failed write leaves the current screen usable and reports that the choice remains in this session only.
- Reload returns to title and SOLO even when cosmetic/equipment preferences are restored.

The provisional interpretation of 小銃 as a light carbine is retained only as design context; the displayed wooden-stock rifle model does not finalize a real firearm class, balance, damage, cost or acquisition rule. The six planned equipment rarities remain コモン → アンコモン → レア → エピック → レジェンダリー → ディビィアン. Displaying this list does not grant rare equipment.

## Art and rendering

Original procedural low-poly survivors have tapered torsos, cloth hoods/masks, face/goggle details, articulated arms and knees, boots, armor, pouches, canvas packs, held weapons and a sheathed sword. Their quiet breathing is disabled by reduced motion. The northern semi-open shelter uses damaged concrete, a fragment of roof, crates, cloth, a field workbench and distant static conifers under gray outside light. No Fortnite assets or third-party art/audio/font files are distributed.

`lobby-scene.ts` merges static pieces by material once. Three gun meshes are built once per survivor and visibility switches without rebuilding resources. The lobby is created lazily; only the active title or HOME scene is drawn. The existing renderer, 30fps cap, pixel-ratio bounds, visibility pause, context-loss fallback and final disposal are retained. No dynamic shadows, postprocessing, cloud animation or particle systems were added.

The camera fits actual survivor and weapon bounds inside `#lobby-stage`. Stage bounds change with viewport, menu panel and portrait formation. Labels project from the same 3D positions. Desktop has the five-item left nav plus an adjacent consistent panel. Compact screens use a labelled menu drawer, keep all five items and restore focus to the menu button when the hidden nav opener cannot receive it. HOME V2 uses a large modal sheet on compact/short screens; content operations take priority there. Closing restores all four models. Desktop panels remain nonmodal and show the own survivor in the reserved right column. Safe areas, dynamic viewport height with `vh`/`svh` fallbacks, and VisualViewport resize/scroll tracking keep the sheet and fixed actions reachable.

## Input and title protection

Native buttons/selects/text inputs support keyboard and touch. Panels accept Escape, have named dialog semantics, focus their heading on open and restore focus on close. Desktop panels are nonmodal and leave the own character preview visible, without trapping focus. Compact sheets mark their background inert/aria-hidden and contain Tab/Shift+Tab. The saved tab indices, aria state and inert state are restored on close; a tabindex/pointer/focus fallback covers engines without native inert. START is disabled while any panel is open. Display settings retain their native modal dialog. HOME never requests pointer lock.

Tokyo geometry, lights, title wordmark, title-specific CSS and audio source are unchanged. Shared rendering only clears HOME's camera view offset before rendering title. The independent 1.75-second reveal deadline timer, 5.5-second cooldown, stopped-RAF regression, HOME cancellation and hidden-tab cleanup remain intact. Audio still starts off. The WebGL failure fallback preserves all controls but does not render survivors; fallback imagery is not evidence of the real 3D lobby.

## Verification

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run package:preview`, `npm run test:e2e` are the check sequence. The old five-placeholder browser expectation was replaced because the five local panels are now implemented; its focus/escape coverage is retained. Other original title, timer, stopped-RAF, network, WebGL, file-opening and storage tests remain.

New checks cover appearance commit/cancel/reset and literal text, Japanese composition behavior, gun duplicate swaps/restoration, the two Tokyo visits, honest empty states, storage corruption/write denial, touch drawer focus, frozen idle, repeated-screen GPU resource counts, every menu's network boundary, four exact viewport sizes and actual WebGL screenshot captures. Viewports: 1920×1080, 1366×768, 390×844, 844×390.

Actual image inspection and measured results are recorded in `STATUS.md` and the PR. Software-rendered browser results do not establish real-PC/iPhone FPS. Physical iPhone/Windows Chrome, true browser zoom at 125%, the iOS keyboard and device FPS remain unmeasured. WebKit automation is separate from physical Safari approval.

## Distribution

`npm run package:preview` outputs `release/RECLAIM_Home_V2_Preview.html`, plus the identical previous HOME/title aliases. A hidden `reclaim-source-commit` meta tag identifies the source head, with the PR head passed explicitly by CI (rather than its virtual merge SHA). Both inline the built Three.js application and CSS, retain the MIT notice and work over `file://` without an HTTP server/CDN. The existing packaging method is preserved. No production hosting is created.


## HOME V2 layout repair (2026-10-14)

The owner's five Windows screenshots establish a small content window and equipment/save explanations painted over lower navigation. Their complete image dimensions do not establish CSS viewport, display scale or browser zoom. The source correspondence of that downloaded V1 HTML is also unknown.

An independent reproduction uses latest starting HOME head `9948e006345b19402f71b7c561d05917b09f3416`. At 1366×600 and 1280×600 CSS px, the old fixed `left:265px; top:211px; bottom:142px; width:340px` produces a 340×247px panel and a 132px scroll body. At 1024×576 it produces 340×223px and 108px. The absolutely positioned sidebar and lower-left equipment block intersect; this is an application layout defect without assuming an OS scale cause.

V2 changes only HOME-specific styles/markup and its framing/controller:

- A grid reserves separate navigation, panel, preview and equipment/launch areas. Navigation has a shrinkable scrolling item list and a separately reachable title-return control. It no longer shares a corner with equipment explanations.
- Desktop panel width clamps to 560–900px and uses the available height, capped at 85vh on tall windows. Low-height HOME headings/subcopy are compressed before content. At 1366×600 the panel is approximately 666×488px, with map body 357px and appearance/weapons bodies 336px. At 1280×600 it is 622×488px; at 1024×576, 560×464px and 312px for the action-bearing panels.
- Header and operation footer cannot shrink. A single `flex:1; min-height:0; overflow:auto` body contains the scrolling content. Apply/cancel/reset, weapon completion and briefing return stay in the footer; the footer does not overlay the last body item.
- The map initially shows its whole original route diagram and Shiretoko. On desktop, route information uses a neighboring column. All six complete gun cards fit the initial low-PC view, including 1024×576; short landscape sheets show the slots side by side. The 18 route stops, two Tokyo visits, local selection meanings and all unimplemented boundaries remain unchanged.
- The fitted camera centers the union of actual model/weapon bounds inside the stage, checks the real header/equipment/launch rectangles, and can use the empty central band between footer cards when panels are closed. Labels reserve a row, clamp inside that stage, and separate on short layouts. Portrait rear samples use 0.82 scale and more depth; no model/texture/scene object was added. HOME fog distance follows the fitted camera so short layouts do not lose the local preview in opaque fog. Tokyo fog is unchanged.
- Desktop open panels temporarily show the own survivor, preserving the selected four-person mode. Compact open sheets prioritize content. Closing/rotation restores all four bodies, weapons and labels. The rear models continue to be explicit local samples, never connected party members.
- Stage/label ResizeObserver, viewport changes, panel/formation and name/weapon changes trigger fitting. There is no steady-frame DOM size read. The diagnostic layout-fit counter is checked for stability between changes.
- Returning through the title invalidates the shared camera's HOME fit. A dedicated SOLO/four/SOLO revisit regression checks an actual new HOME projection instead of accepting stale diagnostic bounds.

V2 regression replaces the old mobile-panel-open four-model condition with a large-sheet/content/fixed-action condition and rechecks the full four-model view after close. Closed-four tests are strengthened with label/viewport/obstacle intersection checks. Desktop nonmodal keyboard behavior and mobile modal background/focus restoration are verified separately. Coherent DOM/render samples are polled through toolbar/rotation layout updates; no assertion is removed or skipped to hide a visual failure.

Final source head, CI run and artifact hashes belong in PR #2 and the review manifest to avoid a self-referential commit hash in this document. Technical checks do not confer the owner's visual approval.

The complete suite now contains 15 state/input cases and 55 browser cases (41 Chromium, 14 iPhone-profile WebKit), with no intentional skips. Safe-area CSS substitutes exercise both orientations; they do not emulate physical Safari chrome or a notch. Linux mobile WebKit can retain an IntersectionObserver root at the original viewport after resizing: that new rotation test instead checks current bounding boxes, elementFromPoint hit targets and an actual cancel tap. Other viewport assertions remain. Physical iPhone, real keyboard and true browser zoom still require independent review.

The render loop's 30fps throttle, animation and reveal opacity now use the same current `performance.now()` clock. Previously the throttle returned before all rendering work when compositor RAF timestamps stayed stale, even though wall-clock timers and input events continued. A fixed-RAF-timestamp browser regression failed with zero draw calls before the repair and checks title reveal/expiry plus closed-four/open-panel/closed-four camera updates afterwards. The independent reveal timer, 1.75-second duration, 5.5-second cooldown and stopped-RAF regression remain. Read-only frame-clock diagnostics and failure attachments distinguish actual pending layout from stale render state without changing the user-facing title.

UI layout is coalesced in an event task rather than waiting for a compositor RAF. A cancellable 100ms watchdog submits a pending UI change when RAF delivery is delayed; it never renders an idle animation stream. The same monotonic 30fps cap applies, late callbacks are invalidated, and visibility/disposal cancels both schedules. A delayed-callback regression failed with four stale models before repair, then verifies actual WebGL draws for panel/formation/title changes and normal RAF resumption. No extra scene object or normal-frame GPU pass is introduced.
