# Mobile TITLE / HOME — 2026-10-16 Draft

## 実装範囲と保護

PC条件は従来の `width >=960px && height >=441px`。`reference-layout.ts`、`reference-menus.css`、原本JPEG/manifestは変更しない。スマホ用CSSは補集合 `(max-width:959px),(max-height:440px)` に限定し、bodyの `mobile-reference-2d` 状態を重ねる。PR #4および地形PR #6は取り込まない。

タイトルは東京原本の文字・UIがない上方（概ねy70–320）をクロップし、DOMロゴ・START/CONTINUE/SETTINGS/EXTRASを配置。HOMEは知床原本のx560–944を切り出して人物を保持する。画像のバイトは変えずCSS clip/maskで端を馴染ませる。新しい画像、フォント、CDN、通信、ライセンス契約は追加しない。原本の由来・権利上の留保は既存 `src/ui-reference/manifest.json` のまま。

縦画面・低い横画面は意図した縦スクロールを許す。STARTを極小化しない。セーフエリア/100dvh、visualViewportの高さ・offsetを使用。パネルは固定ヘッダー・スクロール本文・操作フッター。名前入力とselectは16px以上、主要ボタン44px以上。モーダルfocus/inertフォールバック、Escape/矢印/Enter操作を保持する。閉じた際はスマホで元の操作を可視位置へ戻す。

## データと操作

- タイトルSTART→HOME。CONTINUEは既存の有効checkpointがある場合だけ選択でき、HOMEの出撃前確認へ。checkpointの座標/版/状態を変えない。
- 5メニュー、18訪問地点と???制限、キャラの適用/取消/初期化、主副武器の重複入替、手持ちと端末保存は同じHome/CampaignStore処理を使う。閲覧だけで進行は変化しない。
- 背景は固定イラスト。表示名・武器名をDOMで反映し、色値や銃選択によって背景絵まで変わったとは表現しない。4人は3件のローカル見本カードで、マッチングではない。
- ボスHPは—、ランキング・mailは未接続。架空データなし。音は毎回初期OFFで、ユーザー操作時だけ既存Atmosphereを使う。非同期の音開始失敗も捕捉する。
- Storage読み取り拒否/破損は既存の安全な初期値へ。書込失敗は外観/装備の既存ステータスと表示設定のstatusで可視化。画像失敗でもボタンを失わない。WebGL不可でも2Dメニューは動作する。

## 本編の安全停止

タッチ用FPS操作は未実装。本編のSTART/resumeが呼ばれても `main.startMission` 冒頭で狭幅条件を検査し、**Mission constructorより前**で停止する。HOMEと出撃前確認を保持し、PCキーボード/マウスが必要と表示。Mission生成、キャンペーン開始、checkpoint保存/破棄は実行しない。広いPCの既存関数経路は同じ。開発限定dev-areaの既存契約は変えない。

1024×768等がPC条件を満たす場合はPC表示を維持するが、`any-pointer:coarse`で`any-pointer:fine`がないタッチ専用端末は同じ開始前ガードで停止し、案内を表示する。通常PCマウス経路は維持する。狭幅表示は準備レビュー用として開始を停止する。独立した2.4km地形やイントロを本体へ接続していない。旧480m探索保存座標を変換しない。

## 描画・検証・配布

全メニューでThreeのrenderと旧狭幅boss precompileを停止。実renderer frame counterを使い、LAST drawCalls値をゼロへ書き換えない。10回のTITLE/HOME往復でframe/geometry/texture数が増えないことを検査する。メニューのDOMイベントや既存CPUレイアウト処理自体がゼロになる保証ではない。

```
npm ci
npm run typecheck
npm test
npm run build
npm run package:preview
npx playwright install --with-deps chromium webkit
npm run test:e2e
npx playwright test --config=scripts/mobile-playwright.config.mjs
node scripts/mobile-review.mjs
node scripts/compare-pc-reference.mjs BASE_MAIN.html release/RECLAIM_Mobile_Menu_Preview.html
```

専用suiteは14 viewport（320×568、360×800、375×667、390×844、430×932、667×375、844×390、932×430、768×1024、1024×768、959×441、960×441、960×440、959×440）、実tapと保存状態/失敗/画像/回転/セーフエリア代入/仮キーボード高/focusを検査。Chromium/WebKitは別分類。PCは既存のネイティブ1536×864原本比較（各RGB差<=1、超過pixel0）を保ち、5寸法でmainビルドとの実ページ比較も行う。

パッケージは同じソースから `RECLAIM_Mobile_Menu_Preview.html` と既存PC互換名を生成。commit/clean状態はHTML内meta、SHA256/サイズと結果はレビュー配布物で示す。PC Chrome/Edgeで直接開き、DevToolsのviewportで操作可能。iPhoneの「ファイル」内HTMLプレビューでのJS動作は案内しない。実在するHTTPS Previewが用意されていない時はURLを作らない。

物理Windows GPU、実iPhone Safari/Android Chrome、実アドレスバー/ソフトキーボード/ノッチは別の未検証項目。Linux WebKitを実iPhone保証としない。Viteの既存JSバンドルはThree/worldを含み約1.8MB（gzip約1MB）の警告が残る。新規外部通信なし。今後のモバイル本編とchunk分割は別承認。

停止位置：別Draft PR、ユーザーの見た目・実機操作承認待ち。mainマージ/公開/Vercel変更なし。
