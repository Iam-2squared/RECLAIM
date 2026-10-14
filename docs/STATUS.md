# RECLAIM status — 北海道ワールド基盤 / 2026-10-14

最新版main `48a2fe4d43cd2f59c3087c4dcd77488ecd6a6111`から `feature/shiretoko-world-foundation` を作成。開始時にmain HEAD・open PRなし・Actions成功を再取得した。開始時main CI: [38558017694](https://github.com/Iam-2squared/RECLAIM/actions/runs/38558017694)。最終HEAD・Draft PR・そのHEADの最終CIはPRと配布review manifestに記録する。mainマージ、force-push、Vercel操作/Production公開/公開URL変更は行わない。

Tokyo TITLE → HOME V2 → STARTの確認 → 明示出撃 → 木造住宅で起床 → ラジオ → 東京の親友の連絡 → 徒歩探索 → 小型ドローンへの射撃/実停止 → 道標を実装した。HOMEの大きな5パネル、外観/名前/武器保存、4人見本、戻る、音初期OFFを維持する。4人はオンラインの参加者ではない。

## 各AREAの実装度

全域完成・実地測量モデルではない。**知床はプレイ可能な導入プロトタイプ、残り3つはプレイ可能な環境プロトタイプ**。同じ480×480mの局所AREA/48mチャンク規約を使用し、同時に複数AREAを生成しない。

| 項目 | 知床 | 石狩山地 | 日高山脈 | 札幌入口 |
| --- | --- | --- | --- | --- |
| Terrain | 実装済: seed付き起伏/湖/湿地/湖岸寄り道 | 実装済: 深い谷/沢/山道 | 実装済: 険しい尾根/谷/標高帯 | 実装済: 森から都市入口への地形 |
| Props | 自作プロトタイプ: 正しい切妻家/床/窓/寝床/ラジオ/樹木/遊歩道 | 自作プロトタイプ: 密林/岩/沢/壊れた山岳トンネル | 自作プロトタイプ: 岩場/植生減少/雪渓 | グレーボックス＋自作美術: 道路/廃車/設備/遠景ビル |
| Navigation | 実装済: FPS徒歩/主経路/湖岸寄り道/安全起点 | 実装済: 徒歩経路/2POI/出口 | 実装済: 徒歩経路/2POI/出口 | 実装済: 徒歩道路/任務候補POI/制作範囲終端 |
| Collisions | 実装済: 地形と同じ高さ/家/木/岩/水域/斜面 | 実装済: 地形/幹/岩/トンネル | 実装済: 地形/幹/岩/急斜面/場外復帰 | 実装済: 地形/幹/岩/建物/廃車 |
| Story | 実装済: 順序付き起床/報道/連絡/退出。正式名/声/局/日時は未確定 | 未実装: 正式ストーリー。実徒歩の通過のみ | 未実装: 正式ストーリー。実徒歩の通過のみ | 未実装: 正式任務。終端は「プレイ可能な範囲はここまで」 |
| Enemies | 実装済: 弱い偵察ドローン1種/索敵/移動/攻撃/命中/HP0停止/被弾/再挑戦 | 未実装 | 未実装 | 未実装 |
| Performance | 計測済: チャンク/インスタンス/Low/Balanced/破棄。実PC FPS未測定 | 同じ計測規約・実ロード/破棄 | 同じ計測規約・実ロード/破棄 | 同じ計測規約・実ロード/破棄 |
| Evidence | 実WebGLの4PC寸法/室内/報道/連絡/家外/林道/敵/湖岸 | 実WebGL/POIまで実歩行/環境画像 | 実WebGL/POIまで実歩行/環境画像 | 実WebGL/道路の実歩行/環境画像 |

PROVISIONALな通過条件は実際の位置・接地・歩行距離・経路POI・出口で判定する。知床には順序付き導入と実ドローン停止も必要。石狩→日高→札幌を1区間ずつ公開する。18主要訪問地点は元の順番を保持し、初期は知床だけ、未来の名称/説明/東京の展開は???。札幌を正式クリアにしたり函館を自動解放したりしない。開発専用 `?dev-area=` はproduction buildで無効。

## 検証と実測

- `npm ci`、typecheck、build、standalone package: PASS。依存/lockfile追加なし、外部runtime通信なし。
- JSテスト **91 PASS / 0 FAIL / 0 skip**（既存15、campaign26、mission16、world34）。Blender安全ツールPythonテスト **27 PASS**。4AREAの本物のControllerでLow/Balanced両方の徒歩経路と破棄を検証。固定時計の追加5件は5fps時の実歩行/ジャンプ、遅延時の壁衝突、時刻異常、pause/死亡直後の残り更新破棄を含む。Spaceを保持した着地→pause→release→復帰直後の新しいジャンプも実Controllerで回帰確認。
- Blender/ゲームの51座標の高さを1e-9以内で照合、world contract `--check`: PASS。
- ローカルChromium全58件: **58 PASS / 0 FAIL / 0 skip**（12.4分）。後続の出撃確認文言を選択中の区域に合わせる調整は単独HTMLでも確認。最初のCI [38597322051](https://github.com/Iam-2squared/RECLAIM/actions/runs/38597322051)は4件失敗、25分で残りWebKitを中断。実入力を観測する試験helperと到着/死亡/敵移動の観測タイミングを修正し、既存UI41・ワールド17・WebKit14の3jobへ分割。全**72件**と通常5秒の判定を保持し、最終HEADのURL/件数はPRと配布manifestに記録する。ローカルWebKitは今回未実行。
- helper修正後の対象12件は**12 PASS / 0 FAIL / 0 skip**（7.0分）：4AREAの実歩行、4PCのマウス/移動/ジャンプ/着地、4AREA通しの実戦/解放/保存再開、10回往復、hidden停止、実被弾/HP0/再挑戦。射撃試験は実シミュレーションのcooldown満了を読取確認してから次の実クリックを行う。ゲームの射撃判定/intervalは変更しない。
- 続くCI [38606977966](https://github.com/Iam-2squared/RECLAIM/actions/runs/38606977966)はUI41/WebKit14/製品MISSION13 PASS、dev AREA3件 FAIL（合計69/72）。開発プレビューのLow試験で不要なBalanced初期生成を避け、boot前のユーザー表示設定を復元してから初期9チャンクと実歩行を検証する。通常の表示設定の復元規約を使い、ゲームの挙動や到達/時間判定は変えない。最終CIの結果はPR/配布manifestを参照。
- Low直接起動にそろえた開発4AREAの実ブラウザ確認は**4 PASS / 0 FAIL**（1.9分）。初期9load/0unloadと、その後の実歩行によるunload>0を確認し、品質切替によるunloadを徒歩の証拠へ混ぜない。
- 次のCI [38611531084](https://github.com/Iam-2squared/RECLAIM/actions/runs/38611531084)は69/72 PASS。TITLE再訪1件、石狩徒歩1件、1920×1080の着地1件が期限切れ。TITLE再訪は同じsourceの単独再確認でPASSしたがCI成功とは扱わない。MISSIONは遅延RAF時の更新上限を0.1秒/6から0.25秒/15へ改め、1/60秒の衝突判定・地形・武器・HP・進行条件を維持する。実入力helperは途中観測中もWを保持し、実到達後に離して最終位置を再確認する。通常5秒/徒歩50秒/到達半径は維持し、最終HEADで全CIを再検証する。
- その時計/連続入力版のCI [38616990897](https://github.com/Iam-2squared/RECLAIM/actions/runs/38616990897)は66/72 PASS（UI41/WebKit14/ワールド11）。4つの短いジャンプ観測、近目標での自動操作の行き過ぎ、既に移動済みの敵baselineがFAIL。ローカル17件は16PASS/1FAIL、独立した1366×768の3回は実air→接地を記録して元判定もPASSしたため、初回失敗の原因は未確定として残す。最終helperは実Space入力の前から読取専用RAFで浮上と後続接地を記録し、Wを連続保持するのは遠距離だけ、近距離では実際に走行キーを離し徒歩で再照準する。敵の比較元は導入pause中へ移し、実移動のZ減少を維持する。判定半径/5秒/50秒は変えない。
- ローカル環境: Linux / Node24.19 / Chromium138.0.7204.0 / SwiftShader / テスト用日本語OSフォント。Playwright browser156/151取得の失敗と途中の修正は `VERIFICATION_NOTES.md` とreview failure-historyに保持。テストをskipしていない。
- 実PC viewport: 1920×1080、1366×768、1280×720、1024×576のMISSION。HOMEは6PC寸法と既存モバイル導線も確認。WebGL画像を目視し、家の切妻裏面、遠景の尖った山、扁平な雲、低画面の地図見切れを修正した。
- 既存東京TITLEと同一browser/フォント/reduced-motionの1920×1080、1366×768画像比較は**0差分pixel**。`src/scene.ts` / `src/lobby-scene.ts` / title CSS / title演出値は変更しない。

以下は時計/入力修正前の実WebGL撮影位置（source `72b9603`と同じアプリ）、Low品質、1366×768、pixelRatio0.75の読取専用snapshot。最終sourceの画像と同時測定値は配布reviewのPERFORMANCE.jsonへ記録する。初期scene構築時間はCPU測定、描画送信時間はGPUのframe time/FPSではない。機器保証ではなく再現用の観測値。

| AREA / 撮影位置 | 初期構築ms | 実draw calls / triangles | render CPU中央値 / p95 ms | active / 累計load / unload |
| --- | ---: | ---: | ---: | ---: |
| 知床・湖岸 | 60.2 | 58 / 59,424 | 0.8 / 1.5 | 9 / 18 / 9 |
| 石狩・トンネル前 | 60.8 | 51 / 79,398 | 0.9 / 3.4 | 9 / 15 / 6 |
| 日高・尾根 | 52.3 | 30 / 14,240 | 0.5 / 0.9 | 9 / 15 / 6 |
| 札幌・道路 | 47.2 | 60 / 42,822 | 0.8 / 1.6 | 9 / 12 / 3 |

毎秒60Hzの固定シミュレーションと描画は別。MISSIONにHOMEの30fps capを流用しない。時計遅延は1フレーム最大0.25秒/15固定ステップに制限し、hidden/blur/Esc/ロック喪失/死亡で停止して残りを破棄する。10回HOME往復のrenderer資源は**geometry24 / texture7のまま一定**。ブラウザ証拠へ保存した。60fps保証・物理PCのGPU時間/メモリを計測済みとはしない。

時計修正前source `72b9603`の追加実描画cadence計測は1366×768、各AREA/品質ごとに新しいChromium138/SwiftShader、shader/ロック準備後の起点で3秒以上を観測した。平均実描画FPSはLowで知床10.8/石狩10.6/日高19.1/札幌13.2、Balancedで6.8/6.7/13.4/7.6。RAF間隔の中央値/p95、simulated seconds、CPU送信時間を分けてJSON保存した。最終sourceの再計測は配布reviewのJSONへsourceとともに記録する。クラウドのsoftware GPU・静止起点の値であり、物理Windows性能や全視点の保証ではない。

## 納品・未検証・次工程

`RECLAIM_World_Preview.html` はTITLE/HOME/4AREA/進行保存/日本語操作表示を含む単独HTML。HTML内のsource SHAとreview manifestからGit HEADを確認できる。review ZIPには実画面・JSON計測・テストログ・使用説明・manifest・Blenderツールをまとめる。未検証の完成宣言や架空のオンライン状態を含めない。

Blender5.2.2用の標準bpyツール3本を用意した。元v01/v02を上書きせず、別v03出力、タグ/設定hashによる再実行、安全なhierarchy整理、第三者exportの権利gateを実装。元.blend/Fab GLBは未提供、実物を読んだりFabの権利/ポリゴン数を認定したりしていない。自作形状のみの `RECLAIM_Shiretoko_Procedural_v03.glb` はThree.jsで実出力し、GLTFLoaderの頂点/色/instance/bounds読み戻しを検証。**実Blenderでのスクリプト実行・GLB import・.blend生成は未検証**。Fabは根拠URL/取得ライセンス/実ファイル確認後に別工程で差し替える。

物理Windows PC、物理iPhone/Safari、Production Vercel、タッチMISSIONは未検証/今回の対象外。日本刀近接/リロード/弾薬/副武器切替、正式な3AREAストーリー・敵・札幌全市街、乗り物、オンライン4人協力/共有ボス/認証/DB/ランキングは未実装。ユーザーのPCでのプレイと美術承認が次の停止地点。許可済みのDraft PR保存まで進め、main/Vercel公開は行わない。

報告手順とキー一覧は `SHIRETOKO_LEVEL_SPEC.md`、拡張規約は `WORLD_ARCHITECTURE.md`、モデル使用は `BLENDER_WORKFLOW.md`、素材/容量/権利は `ASSET_MANIFEST.json` を参照。

---

## 以前のTITLE / HOME / iPhone対応の履歴（今回の検証結果とは別）

# HOME preview archive — 2026-10-14

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

Regression changes are explicit: the old compact-panel-open four-person assertion becomes sheet/content/fixed-action assertions, followed by the same stronger closed-four assertions. The new header naturally tabs from heading → close → name input, so that keyboard expectation is updated and both stops tested. DOM/render samples are read together through resizing instead of mixing boxes from different frames. No test is skipped or removed and no generic timeout is extended. V2 checks add six PC conditions, nonmodal keyboard/scroll/START protection, rotation/long weapon/name/stable fitting, title-revisit camera invalidation, three Safari sheet conditions, a simulated missing-native-inert fallback and safe-area substitutes in two orientations. The initial V2 suite totaled 15 state/input and 53 browser cases (39 Chromium + 14 WebKit); the completion update below adds a stale-clock regression.

During development WebKit exposed an initial-label registration race, hidden-sample label lookup and short-view label collisions; these were fixed, not dismissed as device quirks. A pre-final Chromium pass also found the changed header Tab order; the replacement expectation checks both the close control and name input. The new safe-area rotation case exposed Linux WebKit's stale IntersectionObserver root after a resized mobile viewport (root 390×664, actual/visual viewport 390×844). Actual bounds, hit targets and a successful cancel tap replace that new case's misleading observer assertion; no functional check is weakened. Final local/CI counts, source head, hashes and reviewed images are recorded in the final PR/review manifest after the complete checks.

**Visual approval is pending.** Automated Chromium/WebKit and software WebGL do not measure physical iPhone/Windows hardware, real 125% browser zoom, the real iOS keyboard, FPS, heat or battery use. The user can review the V2 HTML on PC and the review ZIP now; Safari on a physical iPhone still needs a separately verified HTTPS URL. No main merge, force-push, PR #1 rewrite or new production publication occurs in this V2 task. The earlier Vercel incident remains recorded above and is not described as fully removed.

The first V2 CI run [38541657478](https://github.com/Iam-2squared/RECLAIM/actions/runs/38541657478) passed 51/53 browser cases. The 1440×900 panel camera predicate and original title expiry predicate timed out at their existing 5-second assertion limit; both failure screenshots subsequently showed the correct own-camera/hidden-boss rendering. This supports software-GPU scheduling delay, not a proven physical-device timing result. The browser fixture now launches a fresh process per case to avoid accumulating GPU work across unrelated cases. Every original assertion and timeout remains; within-case reload, screen revisit, frame-stopping and resource-reuse checks remain. Final-head complete CI results are recorded in PR #2 and the review manifest; this failed run is retained.

### Completion work after the incomplete review delivery

The next CI [38544812608](https://github.com/Iam-2squared/RECLAIM/actions/runs/38544812608), head `3d8d0fe14988527d3e21ff33d7e46e73a131162b`, still failed four camera/formation cases (49/53 PASS). Process isolation alone did not resolve the problem. Local Chromium39/WebKit14 were all green; those local results were not reported as CI success, and the incomplete HTML/review package explicitly recorded the failure.

A controlled stale-RAF-clock reproduction then failed on the old loop with zero draw calls. The early `time-lastFrame` throttle could stop render/camera/reveal updates before the existing current-clock expiry code ran. The throttle and animation now share `performance.now()` with reveal opacity, while the 30fps cap and independent reveal timer remain. A new browser case keeps RAF timestamps at zero and checks actual drawing, reveal expiry and four → panel → four updates. The complete suite becomes state15 / browser54 (Chromium40 + WebKit14). Failure-time diagnostics record the frame clock and actual stage/render state if CI exposes another issue; no timeout/skip/assertion is relaxed. Final complete CI result and regenerated artifacts are recorded in PR #2 and the review manifest.

Vercel access was rechecked on resumption: the same explicit RECLAIM team-scope read returned403, and the CLI was unavailable. No new connection, permission, project, deployment, paid resource or production reactivation is used to work around that restriction. HTTPS Preview remains unavailable under the current authorized connection.

CI 38548280710 at 708b38d passed52/54 after the stale-clock repair, but initial1920×1080 four-model fitting and title-return projection still timed out. A second controlled reproduction paused compositor callbacks while allowing input/timers: the old layout/render path remained at four models when a panel required one. The repair coalesces layout in a cancellable event task and uses a100ms dirty-frame watchdog under the existing30fps monotonic cap. It submits pending UI changes only, without a continuous idle stream or new3D objects. Late callbacks are invalidated and both schedules stop on hidden/disposal. The reproduction now covers WebGL drawing, four→panel→four, title return and resumed callbacks. The suite is state15 / browser55 (Chromium41 + WebKit14), with unchanged assertion timeouts and no skipped tests. The final CI and artifact head remain recorded in PR #2/review manifest; all three earlier CI failures remain historical evidence.
