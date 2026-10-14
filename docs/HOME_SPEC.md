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

The camera fits actual survivor and weapon bounds inside `#lobby-stage`. Stage bounds change with viewport, menu panel and portrait formation. Labels project from the same 3D positions. Desktop has the five-item left nav plus an adjacent consistent panel. Compact screens use a labelled menu drawer, keep all five items and restore focus to the menu button when the hidden nav opener cannot receive it. Portrait panels occupy the bottom portion and reframe the characters above; short landscape screens use a side panel. Safe areas and dynamic viewport height keep normal HOME's START visible.

## Input and title protection

Native buttons/selects/text inputs support keyboard and touch. Panels accept Escape, have named dialog semantics, focus their heading on open and restore focus on close. The nonmodal panel leaves the character preview visible. Display settings retain their native modal dialog. HOME never requests pointer lock.

Tokyo geometry, lights, title wordmark, title-specific CSS and audio source are unchanged. Shared rendering only clears HOME's camera view offset before rendering title. The independent 1.75-second reveal deadline timer, 5.5-second cooldown, stopped-RAF regression, HOME cancellation and hidden-tab cleanup remain intact. Audio still starts off. The WebGL failure fallback preserves all controls but does not render survivors; fallback imagery is not evidence of the real 3D lobby.

## Verification

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run package:preview`, `npm run test:e2e` are the check sequence. The old five-placeholder browser expectation was replaced because the five local panels are now implemented; its focus/escape coverage is retained. Other original title, timer, stopped-RAF, network, WebGL, file-opening and storage tests remain.

New checks cover appearance commit/cancel/reset and literal text, Japanese composition behavior, gun duplicate swaps/restoration, the two Tokyo visits, honest empty states, storage corruption/write denial, touch drawer focus, frozen idle, repeated-screen GPU resource counts, every menu's network boundary, four exact viewport sizes and actual WebGL screenshot captures. Viewports: 1920×1080, 1366×768, 390×844, 844×390.

Actual image inspection and measured results are recorded in `STATUS.md` and the PR. Software-rendered browser results do not establish real-PC/iPhone FPS. Physical devices and Safari remain unmeasured.

## Distribution

`npm run package:preview` outputs `release/RECLAIM_Home_Preview.html` and the identical legacy `RECLAIM_Title_Preview.html` alias. Both inline the built Three.js application and CSS, retain the MIT notice and work over `file://` without an HTTP server/CDN. The existing packaging method is preserved. No production hosting is created.
