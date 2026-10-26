# 東京スタート画面（2026-10-25）

AIの反逆で破壊された東京を、新しい背景画像と軽量な2Dレイヤーで表示します。旧TITLE画像・旧TITLEの配置は使用しません。このスタート画面の承認後、HOMEは[実モデルの4人ロビー](HOME_LOBBY.md)へ更新しました。待機画面や本編の追加とは別の変更です。

## 構図

- 最下層：廃墟、崩れた高架、放置車両、東京タワー、遠方の巨大なAI集合体を描いた背景画像。
- 遠景の霞：上空のAI集合体を雲色のベールで薄め、遠くに潜む気配として見せます。
- 敵影：小さなドローン2体と地上の人型敵1体。透明背景の画像をそれぞれ独立して動かします。
- 中景・路面・前景の霧：敵影の手前をゆっくり移動し、敵の透明度変化と合わせて出没を表現します。
- 最前面：左側のRECLAIMロゴ、START、CONTINUE、SETTINGS。右上に音と動きの切替。味方・プレイヤーの姿は表示しません。

背景は画面を覆うように切り抜き、縦画面では右寄りの東京の景観を残します。人型敵は接地位置を固定し、上下に浮かせません。

## ファイル

表示制御は`src/title-atmosphere.ts`、演出は`src/title-atmosphere.css`、操作部分の見た目は`src/title-screen.css`です。`src/reference-menus.ts`が画面状態・設定と接続します。

画像は`src/ui-title/tokyo-ai-ruins.webp`、`enemy-drone.webp`、`enemy-sentinel.webp`から読み込みます。画像はローカルの配布物に含まれ、表示時の生成AI呼び出しや外部画像取得はありません。敵画像のアルファを保持します。

内蔵の画像生成ツールで新規作成した素材です。[背景](../src/ui-title/tokyo-ai-ruins.webp)・[ドローン](../src/ui-title/enemy-drone.webp)・[人型の敵影](../src/ui-title/enemy-sentinel.webp)を保存しています。[使用した全生成プロンプト](../src/ui-title/generation.json)。配信用3点は合計235,926バイトです。

## 動きと負荷

霧と敵はCSSの`transform`と`opacity`のみを動かします。背景のためのWebGL、動画、独自の`requestAnimationFrame`ループやタイマー、常時のぼかしフィルターは使用しません。

初回TITLEでは3D renderer/contextと旧3Dタイトルの構築を遅延し、診断上のrenderer状態は`deferred`です。既存HOMEの出撃可否判定を保つため、初めてHOMEへ進むときに一度だけ3D基盤を準備します。2Dメニュー中は本編用のRAF/watchdogも停止し、明示出撃で本編の描画を開始します。TITLEへ戻っても再構築しません。

TITLE以外への遷移時とタブ非表示時はCSSアニメーションを停止します。「背景の動きを抑える」設定、またはOSの`prefers-reduced-motion: reduce`では静止表示します。後者はユーザー設定より優先されます。破棄時に画面要素と可視性・メディアクエリのイベントを除去します。

演出全体を`aria-hidden`にし、ポインター入力も受けません。操作は画像に焼き込まずDOMのボタンで行い、上下キー、Enter、Tabを使用できます。保存がない場合のCONTINUEは無効です。

## 旧文書との関係

`PC_REFERENCE_SCREENS.md`や`MOBILE_REFERENCE_MENUS.md`に残る「TITLE/HOME共通の元JPEG・固定16:9座標」の説明は旧TITLEについての履歴です。今回のTITLEではこの文書と実装を優先し、HOMEの仕様は引き続き従来の文書を参照します。
