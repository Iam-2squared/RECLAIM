# RECLAIM Original Skin Preview

ユーザー提供の男女初期スキン2体を確認するための独立したプレビューです。髪・顔・体・服装の形状、UV、骨格、テクスチャは元モデルを使用します。

## 確認できること

- 男性 JONESY／女性 RAMIREZ の選択。
- ドラッグ・左右矢印キーで回転、ホイール／ピンチで拡大。
- 全身／顔の表示、自動回転、正面への復帰。
- 元の頭部の骨を動かす可動確認。
- 選んだ性別の端末内保存。

## 開き方

ビルド後の `dist/RECLAIM_Character_Studio.html` はモデル・画像・表示コードを含む単独HTMLです。WebGL 2対応のPC Chrome／Edgeで開きます。実行時のCDNや追加のモデル通信はありません。

この作業環境は管理ポリシーで `file://` の閲覧が禁止されているため、同じ単独HTMLをHTTPで読み込み、以後の通信を遮断して埋め込みモデルの表示を検証しています。ローカルファイルとして開く操作は、この環境では未検証です。

## データ

- `originals/male.glb`／`originals/female.glb`：提供された初期GLBをバイト単位で保持。
- `assets/male/male-original.blend`／`assets/female/female-original.blend`：初期モデルだけを含む編集用Blenderファイル。
- `assets/male/male-original-fbx.blend`：男性元ZIPのFBXと元画像を格納した編集用ファイル。
- `assets/*/*-game.glb`：形状・骨格・画像を維持し、表示用の金属度・粗さの係数だけを補正した初期モデル。

表示用GLBと `dist/` は再生成する出力です。元GLBと編集用Blenderファイルを保存し、追加髪型の試作、生成済み配布ZIP、依存パッケージ、検証ログは保存対象から除外します。

提供元の素材設定では肌・布の金属度が高く、男性では法線画像の成分が金属度に割り当てられていました。プレビューでは非金属として表示し、顔に出る硬い自己影を避け、床への影を残しています。元の顔・体・髪・服の形状や色画像には変更を加えていません。元GLBとBlenderの素材設定は保存しています。

元モデルには待機・歩行・射撃のアニメーションクリップがありません。首の可動は骨格の確認用です。HOME・プレイへの組み込みは今後の作業です。

GitHubへの保存先は `RECLAIM/tools/character-preview`、保存には独立したチェックポイント用ブランチを使います。このフォルダは初期スキン2体の確認・編集用です。モデル出典と依存ライセンスは `ATTRIBUTION.md` と `THIRD_PARTY_LICENSES.txt` に記録しています。

## 開発用

Node.js 20.11以降とPython 3を用意し、`tools/character-preview` に移動して実行します。

```sh
npm ci
python3 scripts/prepare-game-assets.py
npm run build
npm run serve
```

`http://127.0.0.1:4173` で表示します。入力モデルは `originals/` の2ファイルだけを使用します。Blenderデータを再生成する場合はBlender 4.3以降で `blender --background --python scripts/make-original-blend.py` を実行します。出力先フォルダはスクリプトが作成します。

ブラウザ検証は別途PlaywrightとChromiumを用意し、表示サーバーを起動した状態で `node scripts/verify-originals.mjs` を実行します。Chromiumのパスは `CHROMIUM_EXECUTABLE_PATH` で指定でき、既定値は `/usr/bin/chromium` です。検証結果は `review/originals/` に出力します。
