# iPhone Safari / Preview確認

## 調査

報告された環境はiPhoneの「ファイル」アプリ内HTMLプレビュー。タイトルのHTML/CSSは描画できても、HOMEの画面切替は`src/main.ts`で登録するJavaScriptのクリックイベントを必要とする。描画されたタイトルだけではアプリの起動成功を判断できない。

アプリのモジュール読み込みを遮断するブラウザテストで、「タイトルは見えるがHOMEに進めない」状態を再現する。これはスクリプト未起動の再現であり、iPhone実機のQuick Look内部を調査した結果ではない。Quick LookのJavaScript制限またはモジュール未実行が報告症状の有力な原因。iOSの版や端末内部ログは取得していない。

操作確認にはHTTPS配信されたページをSafariで開く。配布HTMLを再ダウンロードして「ファイル」で開く手順は使わない。

## 変更

- 初期HTMLに読み込み案内とSafariでPreview URLを開く案内を置く。モジュールが完了するまでタイトル/HOME/表示設定/音ボタンを無効にし、完了時に有効にする。起動成功後は案内を消す。
- Viteの出力ターゲットにSafari 15.4を明示。`dialog`、`structuredClone`、動的viewport単位を含む構成の機能基準はiOS Safari 15.4以降。古いSafari全版の保証ではない。
- `visualViewport.resize`でも描画領域と4人の配置を再計算。既存の画面resize、safe-area余白、16pxの名前入力、タッチボタンとスクロール可能なパネルを維持する。
- 既存の東京タイトル形状、スタイルと1.75秒のボス演出は維持する。
- WebGL2不可なら軽量背景へ移行し、HOMEと設定操作は残す。軽量背景を4人の3D表示成功とは数えない。

Safari機能の根拠: [Apple Safari 15.4 Release Notes](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes)。ファイルプレビューの役割: [Apple Quick Look](https://developer.apple.com/documentation/quicklook)。

## ブラウザとCI

既存のChromium 30ケースに、iPhoneプロファイルのWebKit 9ケースを追加する。PlaywrightのWebKitはSafariと同系統のエンジンを用いた自動検証であり、実機iOS Safariそのものではない。

- タイトルをタップしてボス影が消えること、HOMEへの遷移、タイトルへ戻ること、再読込の初期画面。
- 表示設定、背景の動きの抑制、軽量描画。
- 縦375×667、390×664、390×844、430×932で4人全員のモデルと武器の投影境界が表示領域に収まること。高さを80px減らした状態と武器パネル表示中はV2の大きなシートと操作領域を検証し、閉じた後に再び4人全員を検証する。
- メニュー5項目、名前/色の適用と再読込、主副武器と持つ銃の切替、出撃前確認。
- WebGLと保存機能が使えない場合の操作継続、アプリモジュール未起動時の案内。

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package:preview
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

HTTPSのPreviewを直接検証する場合（ローカルサーバーは起動しない）:

```sh
RECLAIM_PREVIEW_URL=https://<verified-preview-host>.vercel.app npx playwright test --project=iphone-webkit
```

## デプロイの境界

対象は`Iam-2squared/RECLAIM`の`feature/home-lobby`。最終CIが成功したコミットをPreview環境にのみデプロイし、URLのHTMLとアセット、WebKitの操作を再確認する。

`vercel.json`はViteの配信設定を明示し、Gitからの自動デプロイを無効化する。検証時は手動のPreview作成を使う。mainへのmerge、productionターゲット、promote、独自ドメイン設定はこの工程に含めない。

実機ではSafariでURLを開き、タイトル→HOME→4人編成→メニュー→キャラ設定→適用→武器変更→パネルを閉じる、の順で確認できる。最終URLとCIの結果はDraft PRに記録する。接続権限不足でURLが未作成の場合は、その事実を明記し、生成済みURLとして扱わない。


## HOME V2の確認経路

現在は **HTTPS Preview URL未用意**。既存Vercel接続の403と、前工程で停止した2つのRECLAIMプロジェクトはSTATUSに記録済み。今回、新規接続・権限追加・有料枠・デプロイを行わない。先にPCの単体HTMLと実WebGLレビューZIPを確認できる。

PCは `RECLAIM_Home_V2_Preview.html` をChrome等で直接開く。iPhoneの「ファイル」内プレビューの結果と、通常SafariのHTTPSページの結果を同一視しない。モジュール未実行の案内/disabled HOMEとnoscriptを保持する。物理iPhoneのSafari・キーボード・FPSは未検証。

V2は縦390×844/375×667、横844×390で全5パネル、固定操作、スクロール末尾、フォーカス復元、背景入力遮断を追加検証する。入力時の高さ縮小は自動テストの代替条件であり、実機キーボードの測定ではない。`visualViewport`のresize/scrollで利用可能高さと上端を追従する。名前入力の16pxは維持し、意図しない入力時ズームを避ける。

[WebKit Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)で動的viewport単位が入り、[native inertはSafari 15.5](https://webkit.org/blog/12578/non-interactive-elements-with-the-inert-attribute/)から。V2はvh/svh fallbackと、tabindex/aria-hidden/pointer/focusの代替処理を持つ。出力のSafari 15.4基準と、その版の実機試験済みという主張は別である。
