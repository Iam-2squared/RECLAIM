# RECLAIM Blender v03 フロー

対象は任意のローカル美術工程です。ゲームは自作プロシージャル地形・樹木だけで動き、Blender / Fab / A.N.T. Landscape / Sapling に依存しません。

この Work 環境には Blender 実行ファイル、ユーザーの `.blend`、Fab の `.glb` がありません。**Python 構文・安全ヘルパー・地形一致の試験は実行済み。Blender 5.2.2 の実行、実物 Fab の階層確認、Blender による GLB 変換、v03 の描画は未検証です。** この文書・ツールを「生成済み v03 の Blender 実画面」と扱いません。ゲームの WebGL 画像は別のエビデンスです。

別途、ゲームの自作 AREA scene を Node 上で書き出した `RECLAIM_Shiretoko_Procedural_v03.glb` を作成しました。これは Blender を使わない実出力で、静的な環境 snapshot です。検証範囲と使い方は末尾の「6」を参照してください。

## 1. 原本を保持して自作環境を生成する

1. RECLAIM のソースを PC に取得し、`tools/blender/` の各 Python と `shiretoko_contract.json` を同じフォルダに置く。
2. Blender 5.2.2 で現在の `RECLAIM_Shiretoko_v02.blend` を開く。未保存変更が必要なら、まず手動で別名のバックアップを作る。
3. 上部の「Scripting」→テキストエディタ「開く」から `build_shiretoko_environment.py` を開く。
4. ファイル冒頭の値を自分の PC の絶対パスに合わせる。下記は例なので、既存の実ファイルに合わせて変更する。

```python
TOOLS_DIRECTORY = r"C:\Users\Owner\Documents\RECLAIM\tools\blender"
OUTPUT_DIRECTORY = r"C:\Users\Owner\Documents\RECLAIM_Exports\v03_run01"
SCENE_NAME = "RECLAIM_Generated_Shiretoko_v03"
```

5. メニュー「テキスト」→「スクリプト実行」（Alt+P）。出力先は新規ファイルだけを許可する。ファイルが既にある場合は停止するので、`v03_run02` など別フォルダを指定して実行する。
6. Scene の選択欄で `RECLAIM_Generated_Shiretoko_v03` を選ぶ。原本 v02 の scene は保持され、旧円錐木・40m 樹木・フラット地面を削除／移動／非表示にしない。生成 scene には旧オブジェクトをリンクしない。
7. 出力フォルダの `RECLAIM_Shiretoko_v03.blend` を別途開き、屋根、樹木の寸法、窓・床・玄関、寝床、ラジオ、湖と林道を確認する。Ctrl+S で原本 v02 に生成 scene を保存する操作はこのフローに含めない。

| 新規出力 | 内容 |
|---|---|
| `RECLAIM_Shiretoko_v03.blend` | 原本 scene を保持したコピーと、新しい自作 scene。原本に Fab 素材があれば、その scene もコピー内に残る。配布前の権利確認が必要 |
| `RECLAIM_Shiretoko_v03_generated_only.glb` | 新しい scene の自作地形／家／樹木／POI だけ。原本の Fab 素材・カメラ・照明を含めない |
| `RECLAIM_Shiretoko_v03_manifest.json` | 元ソース、設定 hash、world 契約、実測 mesh/triangle/texture、出力の SHA-256 と bytes |

新規 scene は generator ID と設定 SHA-256 で識別する。同じ設定で再実行すると同じ scene を再利用し、オブジェクトを追加しない。設定が異なる／同名 scene が他用途／前回生成が途中で止まった場合は安全に停止する。確認して別の `SCENE_NAME` を指定する。全 orphan の purge や、名前を部分一致させた削除は行わない。

## 2. 地形・座標・素材の契約

地形は `src/world/areas.ts` の知床定義を snapshot 化し、`random.ts` の uint32 ハッシュと `terrain.ts` の高さ式・2m 三角形補間を Python へ移植したもの。地形は 48m ごとの別 mesh。初期の Blender 美術範囲は X=-144..144m、Z=-96..192m、288m 四方で、実測地形ではない。ゲーム側には元の全 AREA 境界があり、Blender 出力をゲーム collider として自動置換しない。

| 要素 | runtime 座標 / 条件 |
|---|---|
| 木造住宅 | X/Z=-5..5m、床上端 Y=0.02m、玄関 Z=+5m / 幅2.4m、屋根 ridge は前後軸で両軒より高い |
| プレイヤー起点 | X=0, Z=-1.5, ground=0、yaw=π |
| ラジオ POI | X=-3, Z=-3、地形 ground=0 |
| ドローン art marker | X=0, Z=25。Blender 内では静的形状。挙動・HP・射撃はゲーム側の別実装 |
| checkpoint / 区域出口 | (12,64) / (4,104)、いずれも PROVISIONAL |
| 任意の湖岸散策路 | (0,30)→(-8,34)→(-13,43)→(-13,60)→(-13,78)。幹線の高さを優先し、区域解放や達成条件を追加しない |
| 湖岸遊歩道 | boardwalk POI=(-13,60)、X=-13 / Z=44..80の地形に沿う板床。ゲームと同じ位置をauthoringし、独立した橋衝突を作らない |
| 湖 | 中心(-46,62)、半径29×35m、surface=0.3m、depth=2.6m |
| 樹木 | 自作の枝付き針葉樹4種＋広葉樹2種、共有 mesh、予定188本、高さ5.8..12.5m、家・経路・水面を避ける |
| 座標変換 | runtime Y-up `(x,y,z)` → Blender Z-up `(x,-z,y)` →標準 GLB Y-up `(x,z,-y)` で runtime に戻る |

自作図形には第三者の写真・葉テクスチャ・HDRI・音源は使わない。実物 Fab の polygon 数、素材適合、FPS を推測して記載しない。生成 manifest の `meshTriangleOccurrences` は全 mesh object の三角形合計、`uniqueMeshTriangles` は共有 datablock を一度だけ数えた値。texture pixel 数は GPU メモリ計測ではない。

ワールド定義を変更した開発者は Node 22.16+ で snapshot を更新し、試験を実行する。

```sh
node --experimental-strip-types tools/blender/export_world_contract.mjs --write
node --experimental-strip-types tools/blender/export_world_contract.mjs --check
python3 -m py_compile tools/blender/*.py
python3 tests/blender-tools.test.py
```

snapshot には元3ファイルの SHA-256 が入り、`--check` は現在の生成予定 bytes と既存 snapshot を読取専用で比較し、古い／無い場合は失敗する。変更は明示的な `--write` のみ。試験で現在の TS 地形51座標（任意の湖岸散策路周辺を含む）と Python 高さを比較する。Blender の scene 外観、exporter の挙動、実機 FPS まではこの試験で保証しない。

## 3. Fab 原本を検査する

`inspect_fab_pack.py` をテキストエディタで開き、`TOOLS_DIRECTORY` と新しい `OUTPUT_DIRECTORY` を指定する。

```python
SOURCE_GLB = r"C:\Users\Owner\Documents\assets\trees_and_bush_pack_lowpoly.glb"
OUTPUT_DIRECTORY = r"C:\Users\Owner\Documents\RECLAIM_Exports\fab_inspect_run01"
```

「テキスト」→「スクリプト実行」。指定 GLB だけを一時 scene に追加 import し、新規 import のオブジェクト／未使用 datablock だけを片付ける。既存 scene・元 GLB は変更しない。`SOURCE_GLB = ""` の場合はアクティブ scene を読取検査する。この mode は、Fab 整理用の入力 report としては使わない。

JSON には全 `nodeId`、親子、local/world matrix、bounds、dimensions、mesh 三角形、material、texture 寸法と取得可能な hash が入る。全木の root と、`Spruce foliage.274` のような葉パーツを区別する。根拠 URL、取得方式、ライセンス名、購入／取得画面などは `ASSET_METADATA` に利用者が追記し、その証拠ファイルがあれば hash を記録する。記入されてもツールがライセンスを適合判定したことにはならない。

## 4. 樹木全体を保持して整理する

1. `prepare_forest_assets.py` で、検査した同じ元 GLB と JSON を絶対パスで指定する。
2. report の `nodes` / `parentId` を確認し、幹・枝・すべての葉を含む一つの木の root ID を選ぶ。`roots` の一番上がパック全体の場合は、その下の**木全体を持つ親**を選ぶ。名前だけで自動グループ化しない。
3. `TREE_ROOT_IDS` と `CONFIRMED_WHOLE_TREE_ROOT_IDS` に同じ確認済み ID を設定する。未設定／存在しない ID／root の重複や入れ子は停止する。
4. 幹と葉に共通の親がない場合、このツールで推測して結合しない。ユーザーが別名保存した作業コピーで、該当一株だけを Empty の子に「変換を維持」で parent 化して GLB を別名 export し、そのコピーを再検査する。
5. `EXPORT_ASSETS = False` のまま最初に実行する。元の GLB と親子 transform を変更せず、scene `RECLAIM_Prepared_Forest_v03` に階層ごと複製し、**root 全体へ一回だけ**目標9mへのスケールと地面合わせを適用する。複数の木を18m間隔に見本配置し、manifest だけを新規保存する。

```python
SOURCE_GLB = r"C:\Users\Owner\Documents\assets\trees_and_bush_pack_lowpoly.glb"
INSPECTION_REPORT_PATH = r"C:\Users\Owner\Documents\RECLAIM_Exports\fab_inspect_run01\RECLAIM_Fab_Inspection.json"
TREE_ROOT_IDS = ("node-0001",)                 # 必ず自分の検査結果に置き換える
CONFIRMED_WHOLE_TREE_ROOT_IDS = ("node-0001",) # 幹と葉を確認した場合だけ同じ ID
TARGET_HEIGHT_METRES = 9.0
OUTPUT_DIRECTORY = r"C:\Users\Owner\Documents\RECLAIM_Exports\forest_prepare_run01"
```

アニメーション、constraint、modifier、MESH/EMPTY 以外を含む樹木は、参照切断を避けるため停止する。必要なら作業コピーで bake/apply し、元 GLB を保ったまま別名出力して再検査する。

樹木 `.blend` / `.glb` を書き出すときだけ、取得したライセンスが目的のゲーム資産への export を許すと利用者が確認し、`ASSET_METADATA` の全項目と実在する証拠ファイルを設定する。さらに次を設定する。

```python
EXPORT_ASSETS = True
ALLOW_THIRD_PARTY_EXPORT = True
LICENSE_CONFIRMATION = "I CONFIRM THIS LICENSE ALLOWS THIS GENERATED GAME ASSET EXPORT"
OUTPUT_DIRECTORY = r"C:\Users\Owner\Documents\RECLAIM_Exports\forest_export_run01"
```

これは既に取得済みの素材のローカル制作フロー。新規購入、外部サービスへの送信、公開 GitHub への生素材 commit は行わない。ゲームに置換する工程、LOD 自動生成、Fab 適合の判断は別工程で、現時点では未検証。license/status/source hash と実測 triangle/texture は manifest から追跡する。

## 5. 停止・再実行・不具合の報告

- 出力 conflict：既存の v01/v02/v03 を消さず、新しい出力フォルダを選ぶ。
- 同名 scene の設定 conflict／途中生成：原本 scene には変更を加えず、生成 scene を確認し、別 `SCENE_NAME` で再実行する。名前だけを見て旧 object を削除しない。
- source/report hash mismatch：使用 GLB を再検査する。異なるパックへの report 流用はしない。
- 書出し I/O 失敗：新規ファイルだけの transaction を中止する。原本を置換しない。新規ローカル出力フォルダで再試行する。
- Blender の Python error：エラー全文、Blender の実バージョン、実行 tool、変更した設定、manifest（生成された場合）を報告する。既存 source の hash と出力ファイル一覧も添える。ゲームでの歩行／衝突／FPS は別に再現する。

**Blender 工程の検証区分：** Python 3.12 / Node 22+ 上の安全・データ試験 PASS。Blender 5.2.2 の scene 作成、実 Fab パック、bpy の GLB exporter、ユーザー Windows の描画は未検証。提供しているのは安全な再実行用ソースで、未作成の Blender 版 `.blend` / `.glb` を存在すると報告しない。次項の Node 版 GLB は別工程の実出力です。

## 6. ゲームの自作 scene を直接 GLB にする

`tools/blender/export_original_world_glb.mjs` は、既存の `AreaLoader` とインストール済み Three の `GLTFExporter` を使う任意のオフライン工程。新規依存・Fab・Blender は不要です。runtime source を変更せず、一時的な知床 scene を作り、Balanced の中心 `(0,48)` の25チャンクだけを静的出力します。家・湖・序盤の幹線を含み、全知床の bake、操作、ストーリーや戦闘の内蔵ではありません。

```sh
node --experimental-strip-types tools/blender/export_original_world_glb.mjs --write
node --experimental-strip-types tools/blender/export_original_world_glb.mjs --verify
```

新規出力は `release/RECLAIM_Shiretoko_Procedural_v03.glb` と対応する `.manifest.json`。既存ファイルは拒否します。再生成したい場合は、原本を削除／上書きせず新しいフォルダを指定します。

```sh
node --experimental-strip-types tools/blender/export_original_world_glb.mjs --write --output-directory C:\RECLAIM_Exports\runtime_run02
node --experimental-strip-types tools/blender/export_original_world_glb.mjs --verify --output-directory C:\RECLAIM_Exports\runtime_run02
```

| 実出力の値 | Node 上で検査した値 |
|---|---:|
| GLB bytes | 1,299,000 |
| 描画 mesh / InstancedMesh | 185 / 147 |
| 樹木 | 703本 |
| 部材 instances | 11,331（樹木本数ではない） |
| 三角形 occurrences | 259,298 |
| 共有 geometry / material | 46 / 21 |
| texture / Fab素材 | 0 / 0 |

GLB の magic/version/宣言length/chunk/embedded buffer を確認し、実際のインストール済み Three `GLTFLoader` で再読込しました。全185 meshの vertex/index/vertex color と各 instance color の hash、全 instance 数・matrix・world bounds を source と照合して PASS。`--verify` は manifest の source hash と GLB bytes/hash を照合し、同じ再読込比較を読取専用で行います。

`EXT_mesh_gpu_instancing` は必須 extension。Node の実 parser が transform と色を保持したことは検証済みです。**Blender 5.2.2 によるこの GLB の import/render、ブラウザの見た目の再読込は未検証**。Lambert material は glTF の PBR へ対応され、ゲームの sky/fog/hemisphere light は manifest の環境設定に残します。表示はゲームとpixel単位で同一とは限りません。利用先が必須extensionをサポートするか確認してから使ってください。`.blend` の作成はこの工程に含みません。
