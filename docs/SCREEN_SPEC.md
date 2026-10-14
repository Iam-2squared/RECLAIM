# First screen specification — 2026-10-14

## User-confirmed basis

RECLAIM. AIに支配され荒廃した日本。実際の旅の開始地点は知床。
最初のタイトル画面だけはインパクトのある荒廃した東京。空は複雑にせず濁った灰色。
RECLAIMの下にHOMEボタン。タイトルを押すと東京の大ボスの影が少しだけ見える。
ゲームは毎回ホームを起点にして出撃する。ホームは自分のキャラクターが中心・先頭で、4人までの編成が並ぶ。
左メニューはマップ、キャラ設定、武器、今のボス状況、ランキング。

## Implemented interpretation (adjustable, not new canon)

- タイトル→HOME→出撃という構成。HOME追加後のSTARTは知床の出撃前確認。最終出撃は理由つき無効化（戦闘未実装）。
- 影の演出1.75秒、連打防止5.5秒。ホバーや起動時に勝手に見せない。
- 平坦な曇天と距離霧。雷・晴天・複雑な雲アニメーションは追加しない。
- 少量の視差と風音。音は明示操作のみ、背景の動きを止められる。
- 世界観に合う紙・金属のニュートラルなUI。Fortniteの資産・ロゴ・画面を転載しない。
- 4人編成はUI確認用で、ネット接続や他プレイヤーが存在するかのような表示はしない。
- ワールドボスに架空の実稼働HP、人数、ランキングを付けない。

## Acceptance gate

タイトル/HOME/戻る/影の自動終了/連打制限/キーボード操作/縮小幅/環境設定/
WebGL失敗時/ストレージ失敗時/外部通信ゼロ/実WebGL画像を確認。
ソフトウェアレンダラーの結果をユーザーのPC/iPhone実機性能の代替にはしない。

## HOME implementation follow-up — 2026-10-14

`docs/HOME_SPEC.md` documents the implemented local panels, device-only appearance/equipment preview, shelter art, responsive camera and Shiretoko briefing. This supersedes the old HOME placeholder-panel behavior only; Tokyo title art and reveal timing are retained. Four-person formation is still explicitly offline preview. No gameplay, shared boss, ranking backend or production deployment is implied.
