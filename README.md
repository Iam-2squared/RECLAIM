# RECLAIM — PC reference TITLE / HOME / 知床3Dワールド

2026-10-16 メニュー更新: マウス/細かいポインターを持つPCでは**承認済み東京TITLE・知床HOMEの元JPEGを、そのまま2D表示**し、16:9構図と操作領域を保持します。スマホ縦横と広幅のタッチ専用タブレットでは同じ原本の文字がない部分をCSSで切り出し、44px以上のDOM操作を重ねます。人物・武器の絵は固定、設定値は保存可能です。[PC契約](docs/PC_REFERENCE_SCREENS.md) / [スマホ仕様・制限](docs/MOBILE_REFERENCE_MENUS.md)を参照してください。本編FPSはPC専用で、スマホは出撃前確認までです。

**奪われた世界を、取り戻せ。**

Three.js + TypeScript + Vite。荒廃した東京を背景とした最初のタイトル画面です。
東京TITLE→HOME V2→明示出撃→知床の木造住宅で目覚め、ラジオと親友の連絡を確認し、森を歩いて弱いドローンを射撃できるPC向けローカルプロトタイプです。石狩山地・日高山脈・札幌は同じ共通基盤の環境プロトタイプ。オンラインは未実装。

## すぐに見る

**iPhoneの操作確認には、通常のSafariで開くHTTPS Previewが必要です。現在、利用可能なPreview URLは未用意です。**「ファイル」アプリ内のHTMLプレビューは操作確認に使えません。接続の制約は `docs/STATUS.md` とHOMEのDraft PRに記録しています。
PCでは配布用 `RECLAIM_World_Preview.html` を対応ブラウザで開いてください。従来名のHTMLも互換用に出力します。
実行時にCDN、生成AI API、解析サービス、ゲームサーバーへ接続しません。
WebGL2が使えない環境でもTITLE/HOMEの2D背景・設定・保存操作は利用できます。本編は開始できません。

## 開発

Node.js 22.16以上を使用。

```sh
npm ci
npm run dev
```

表示されたローカルURLをブラウザで開いてください。

```sh
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run package:preview
npx playwright test --config=scripts/mobile-playwright.config.mjs
```

## 操作

- **START（タイトル）**：HOMEへ。CONTINUEは有効なcheckpointがある場合だけ出撃前確認へ。再読込は必ずタイトルから始まり、戦闘へ直接入りません。
- **SETTINGS / EXTRAS**：表示品質・動き軽減・音、固定イラストと未対応範囲を確認。スマホでは設定内にも音ボタンがあります。
- **SOLO / 4人編成**：3人分のローカル見本カードを切替。オンライン未接続で、背景の人物は変わりません。
- **マップ**：18地点の順序を保持。初期公開は知床だけ。未到達地名/説明は???、実達成で道中の区間を順次公開。
- **キャラ設定**：表示名と3色の設定値を即時反映。適用・キャンセル・初期化。固定イラストの色は変わりません。
- **武器**：アサルト／スナイパー／小銃の主・副武器と持つ銃の値を切替。固定イラストの銃は変わりません。
- **今のボス状況／ランキング**：未接続の空状態。架空のHPや順位を表示しません。
- **START（HOME）**：出撃前確認を開くだけで保存・開始しません。PCでは明示的な出撃開始／安全な保存位置から再開。スマホ幅・低い横画面・広幅のタッチ専用端末ではPC操作が必要と案内して開始前に停止し、checkpointを変更しません。
- **小さい画面**：メニューから同じ5項目へ。Escapeで閉じ、元のボタンへフォーカスが戻ります。
- **右上**：音のオン/オフ、軽量描画、背景の動きの抑制。音は初期状態でオフ。

## 旧3Dメニュー実装の記録（現在のTITLE/HOMEには不使用）

単純な灰色の空、霧に沈む廃ビル、崩れた高架、空の車両、道路の瓦礫。
東京タワーを想起させる塔を含む架空の市街地で、実地図の再現ではありません。
背景・生存者モデル・武器・ボス影はコードで構成したオリジナル形状。大ボスの最終デザインは未確定です。
タイトルは東京ですが、キャンペーン開始地点は引き続き**知床**です。

## 技術上の境界

- 静的配信のみ。サーバー、DB、APIキー、決済、マッチングなし。
- TITLE/HOMEは2D画像＋DOMでThree描画なし（実renderer frame counterで検査）。MISSIONはRAF描画と固定60Hzの操作更新を分離。実機の60fps保証ではありません。
- InstancedMeshによる静的部材の集約。動的な雲・影・破壊物理・ポスト処理はなし。
- タブ非表示時は描画を停止。環境音も一時停止。
- 外観・装備はプレビュー専用キー。campaignは独立したversion1キーへ実際の導入/撃破/通過/位置を保存。端末ローカルで、認証や改ざん防止保証はありません。拒否された場合もセッション内で操作できます。
- 他のPractice / GlobeQ / ARK / Ark Terminalリポジトリは対象外。

## 今後

今回の知床は導入プレイ、残り3エリアは徒歩検証済みの環境プロトタイプ。正式な後続戦闘・ストーリーやAAA全域完成ではありません。
タイトルの美術承認、PRのmerge、本番公開は別の判断です。
4人協力、共有ボスHP、3段階の壁は後続開発です。このプロトタイプで実装済みとは扱いません。

詳細は [HOME仕様](docs/HOME_SPEC.md) と [状態記録](docs/STATUS.md) を参照してください。

iPhone向けの調査、互換性とPreview検証は [Safari確認](docs/IOS_PREVIEW.md) を参照してください。

## 知床のPC操作

WASD移動 / マウス視点 / Shiftダッシュ / Spaceジャンプ / Eラジオ / 左クリック射撃 / Escポーズ。探索開始ボタンを押した時だけマウスをロック。音は右上でONにした場合だけ自作効果を再生。北海道は徒歩のみ。

Low/Balancedは描画解像度・チャンク距離・森林密度へ反映。明示的な進行リセットは外観や武器を消しません。

## 共通ワールドとBlender

[ワールド基盤](docs/WORLD_ARCHITECTURE.md) / [知床仕様](docs/SHIRETOKO_LEVEL_SPEC.md) / [自作素材manifest](docs/ASSET_MANIFEST.json) / [Blender5.2.2用ツール手順](docs/BLENDER_WORKFLOW.md)。Fab/Windowsのv02は未提供なので使用していません。Blender本体での実行は未検証、自作プロシージャル形状でブラウザ実装を動かします。

```sh
npm run test:blender
node --experimental-strip-types tools/blender/export_world_contract.mjs --check
```

ローカル開発だけの個別確認：`npm run dev`を起動し、`http://127.0.0.1:5173/?dev-area=shiretoko`（ほか3つはworld定義のAREA ID）を開く。開発確認は進行を保存しません。production/配布HTMLではこのパラメーターを無視し、TITLEと通常の段階公開を維持します。

mainのmerge、本番デプロイ/公開URL変更は今回行いません。Draft PRとユーザーの物理PCプレイ承認で止めます。
