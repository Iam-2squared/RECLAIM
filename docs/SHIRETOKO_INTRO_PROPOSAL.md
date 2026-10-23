# 知床全景イントロ — 独立試作と統合ゲート

2026-10-16 JST。**ゲーム本体への組み込みは未実施。明示承認待ち。** この文書と独立デモは、HOMEからの実接続の証拠ではない。

## 調査した実経路

基準main `6b6ff3946c2fab5c4a46694be7014a03e3fc5e3e` の実ソースを読んだ。

| 境界 | 実装事実 |
| --- | --- |
| HOME START | `src/home.ts` の出撃前確認を表示する。まだミッションを作らない |
| 確定 | `home.ts` の `#mission-launch` が `startMission(areaId)` を呼ぶ。保存再開は第2引数にcheckpointを渡す |
| 画面切替 | `src/main.ts` の `startMission` がHOMEを閉じ、`state.goMission()`、ミッションDOM表示を行う |
| 実探索 | 同関数が `new Mission(...)` を同期生成する |
| 保存 | `src/mission/runtime.ts` のconstructorはAreaLoader・Controller・敵・武器を作り、`beginSession`、位置記録、`save`、導入表示まで行う |
| 継続 | ReferenceMenusのCONTINUEは既存の出撃前確認とcheckpoint経由。本試作は参照も変更もしない |

`main.ts` はタイトル/HOMEのイベント・状態・保存も所有するため、本タスクでは保護対象とした。遷移を横取りするグローバルイベントやDOM監視は追加していない。既存 `MissionHooks` は戻る・通知・描画要求・効果音であり、constructorより前に挟む公開イントロフックはない。

## 接続可能性と必要な具体的変更

**TITLE/HOMEの変更0で挿入する構造は設計できるが、現在の同期constructorのまま、新規ファイルを置くだけでは接続できない。実接続可能と検証済みにはしない。**

優先案はミッション側のファサードである。承認後にのみ、次のファイルを対象として具体化する。

| ファイル | 必要な変更の最小範囲 |
| --- | --- |
| `src/mission/runtime.ts` | 既存の公開 `Mission` を薄いファサードとし、既存探索実装を遅延生成する。`update / resize / preferences / pause / snapshot / dispose` と `paused` の呼出し契約を維持する |
| 新規 `src/mission/runtime-core.ts` | 現行Missionの探索・戦闘・保存実装を移す。constructorを呼ぶまでセッション・checkpointを変更しない |
| 新規 `src/mission/shiretoko-intro.ts` | 地域知床・新規出撃・非debugだけでイントロを出す。resumeは直通。開始でcore生成、キャンセル・失敗は既存returnHomeフックへ戻す |
| 新規イントロ専用CSS/テスト | HOME共通CSSを使わず、キー・エラー・資源・継続・戦闘回帰を検査する |

`index.html / main.ts / home.ts / reference-menus.* / state / home-state / campaign / TITLE・HOME画像 / 既存build設定` は、この優先案でも無変更を目標とする。ただしファサード分離は未実施・未検証であり、差分量を架空の行数で断定しない。代替は `main.ts` のMission生成直前に遷移アダプターを挿入する方法だが、保護ファイルの変更を要するため現指示では採用不可。必要なら該当箇所の最小差分を別承認にする。

さらに既存知床は480mの局所AREA・家の中の原点付近で始まり、本地形は2400m・岬(-170,108,850)である。見せる土地から同一地面へ連続カメラ移動するには、Phase 5の座標・衝突・家・物語配置とcheckpoint互換設計が先に必要。単に新地形の高さを旧保存座標に当てない。承認前に家の中の導入を崖上の開始へ置換しない。

## 今回動く独立デモ

`node scripts/package-shiretoko-terrain.mjs` が `release/RECLAIM_Shiretoko_Intro_Demo.html` を生成する。PCのChrome/Edgeでファイルを開く。サーバー・インストール・Blender不要。

- 全景と主要ルート、投影した4地点。画面外/重なりそうなラベルは抑制する。ドラッグ・ホイールは使用可能。
- 「探索を開始」はクリックから直接、安全な崖上へ入りPointer Lockを要求する。
- 「短い移動を試す」は約3.2秒のカメラ移動。終了後に「ここから歩く」を押す。非同期終了時にPointer Lockを要求しない。
- reduced motionではアニメーションを省略。Escは中止して独立俯瞰へ戻る。blur/hidden時の移動はキャンセル。
- 音はOFF。音源・AudioContext・Storage・通信・ゲームの状態は一切使わない。
- 地形・水面・rendererは俯瞰と徒歩で同じものを再利用。静止中は要求時描画。disposeで全geometry/texture/canvasを解放。エラー時は独立画面内で再読み込み案内を表示する。

本番UIの決定ではなく、導入のテンポを比較する試作品である。レビューUIをそのまま本番に移植する方針ではない。

## 検証と次の承認

Nodeの状態遷移に加え、`scripts/verify-shiretoko-intro.mjs` は実WebGL・4寸法・実Pointer Lock・移動・Esc・カメラ移動・キャンセル・10往復の資源一定・reduced motion・ロック拒否・context loss・disposeを検証する。最終結果はレビューZIPとPRを参照。

Phase 1 v4でも、独立イントロはプレビューと同じv4地形・renderer・水面を再利用する。遠景20m海岸帯/80m内陸とその接合を含む同一データであり、別の似た地形は生成しない。本体HOME/ミッション開始への接続は追加していない。スマホDraft PR #7はレビューOKというユーザー判断を記録し、今回そのコードやHEADには触れない。

次の承認は独立地形v4の見た目。本体へのイントロ接続は引き続き別の承認が必要。mainマージ・公開・Vercel変更は本作業の対象外。
