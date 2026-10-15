# RECLAIM — 北海道ワールド基盤 v1

2026-10-14 JST。これは地域の実測モデルではなく、作品用に自作した徒歩向け環境プロトタイプです。18訪問地点の順序を変更せず、知床と札幌の間に石狩山地・日高山脈を道中サブエリアとして置きます。東京TITLEとHOMEの美術・プレビュー保存は別責務のままです。

## 責務と所有権

| Module | Responsibility | Does not own |
| --- | --- | --- |
| `src/world/areas.ts`, `types.ts` | バージョン付きの純粋な4AREA定義、座標、seed、ルート、POI、出口 | Three.js、DOM、保存、正式なストーリー解放 |
| `TerrainSystem` | 同じ2m格子の高さ・三角形・地形色、歩ける経路、水域 | 入力、カメラ、敵、地域達成 |
| `createVegetation` | chunk seedで決まる樹木・草・岩のインスタンス、幹/岩collider | ネット接続、10,000本の一括生成 |
| `createLandmarks` | 家の床/壁/窓/開いた扉/寝床/ラジオ、遊歩道、トンネル、雪渓、道路/廃車/都市入口 | 外部素材、車の運転、オンライン状態 |
| `AreaLoader` | アクティブAREAのscene・近傍chunkの生成/LOD更新/破棄・計測 | renderer、入力listener、timer、RAF、保存 |
| `CharacterController` / mission | WASD、視点、重力、接地、簡易衝突、FPSカメラ、敵・射撃 | HOME外観の所有権、地形の独立した高さコピー |
| `SimulationClock` | 1/60秒の固定更新、最大0.25秒/15stepの遅延追従、pause/死亡で残時間破棄 | RAF/render、地形、入力、進行付与 |
| campaign | 実際の位置/接地/順序/敵停止を根拠にした段階公開、別保存キー | マップを開くだけの解放、未制作地域のクリア |

AreaLoaderは既存WorldViewのWebGLRendererを共有して描画します。地域ごとにrenderer/contextを増やしません。世界モジュールにはfetch、CDN、API、DB、フォント、写真、TTS、外部物理エンジンを追加していません。

## AREA定義と増やし方

`AreaDefinition.version = 1`。必須項目は`id`, `displayName`, `seed`, `status`, `bounds`, `terrainProfile`, `biome`, `climate`, `spawn`, `route`, `exitTriggers`, `landmarks`, `objectiveIds`, `allowedEnemyTypes`, `assetRefs`, `lodSettings`, `qualityOverrides`です。任意の`explorationRoutes`は景観用の寄り道で、`id/width/blendWidth/waypoints`を持ち、進行のobjective/exitを増やしません。`areas.ts`はNodeのstrip-typesでも読める純粋データで、campaign/Blenderの座標参照元になります。

| AREA ID | Seed | Bounds / local metres | Role | Real passage destination |
| --- | ---: | --- | --- | --- |
| `shiretoko` | 431071 | X −240…240、Z −192…288 | 操作可能な導入区域 | 石狩山地 |
| `ishikari-mountains` | 508213 | 同上 | 森林/沢/壊れた山岳道路の環境プロトタイプ | 日高山脈 |
| `hidaka-mountains` | 701113 | 同上 | 高低差/岩場/雪渓の環境プロトタイプ | 札幌入口 |
| `sapporo` | 951823 | 同上 | 道路/運転不可の廃車/都市入口の環境プロトタイプ | `null`、制作範囲で停止 |

新しい地域を加える手順:

1. 型のAreaIdとAREA_IDSへ一意のIDを追加し、areas.tsへ独立した定義を登録します。
2. 徒歩で連続的に到達できるroute高さ、範囲内の安全spawn、互いに一意のPOI/checkpoint/exitを指定します。正式に決まっていない達成値は`provisional: true`のまま扱います。
3. `validateAreaDefinition`とworld/navigationテストを通します。次の地域をcampaignがいつ公開するかは別の進行契約で定義します。
4. 新規assetRefsの生成元・権利・容量・三角形数をASSET_MANIFESTへ追記します。第三者の生素材を無根拠にコミットしません。
5. 開発用地域選択と同じloaderで画像/歩行/破棄を検証します。公開UIには未到達のdisplayNameを直接列挙しません。

## 地形と衝突の一致

地形はinteger seedのsmooth lattice noiseを3帯域重ね、地域別の基準高度/振幅/起伏を適用します。さらに経路に向けて連続的に高さをブレンドし、知床の家周りを0mの小さな平坦地として保護します。河川/湖は同じ高さ生成に埋め込み、プレイヤーが水面の下へ歩くことを防ぎます。生成にMath.randomを使いません。

2m格子をY-upへ配置し、各セルを`[a,c,b]` / `[b,c,d]`という同じ対角線で分割します。heightAtはbilinearではなく、この三角形上の補間です。同じ座標の地形描画とプレイヤー接地は同じ面を参照します。隣接chunkの境界頂点も同一のグローバル格子から得ます。

現在のプレイヤーchunkと隣接3×3は両品質とも2m解像度です。遠景のみ8mへ間引き、プレイヤーが近づく前に2mへ戻します。遠景の簡略面は歩行域の代用品ではありません。camera/character/POIの高さはterrain.heightAtを参照し、別の物理heightmapを持ちません。

樹木の幹・岩はcylinder、家の壁・家具・トンネルの側部・建物/廃車はAABBです。単純な局所コライダーとして扱い、実物の枝/葉すべてを高価な物理メッシュにはしません。木/岩の配置は家・経路・水域・重要POIの周囲を除外します。家は10×10m、開口幅約2.8m、壁高3.2m、Z方向の棟へ向かって正しく上昇する切妻屋根を持ちます。床/寝床/ラジオ台/窓/玄関が別の形として見えます。

知床は主経路の(0,30)から湖岸の(-13,60)へ向かう任意の徒歩寄り道を持ちます。湖岸の道は4.2mの見晴らし地点を通り、そこから水面と岸の遊歩道を見られます。主経路/出口/seedは変更していません。景観ルートを先に地形へ反映し、主経路を最後に優先反映するため、主経路上の2m三角形高さは追加前と厳密に一致します。実ControllerによるLow/Balancedの往復と目の位置から湖面への遮蔽raycastを通しています。寄り道に進行解放の効果はありません。

経路の最大傾斜は走査値で知床約0.121、石狩約0.235、日高約0.586、札幌約0.018。人工経路の安全性の検査値で、実地の登山勾配ではありません。World単体の歩行判定とCharacterControllerの閾値は用途を分け、実際のControllerで全4経路を歩行検証しています。

## チャンク、LOD、品質

| Setting | Low | Balanced |
| --- | ---: | ---: |
| Chunk size | 48m | 48m |
| Interest area | 3×3、最大9chunks | 5×5、最大25chunks |
| Precise terrain near player | 3×3 / 2m格子 | 3×3 / 2m格子 |
| Remaining terrain | なし | 8m格子の遠景16chunks |
| Vegetation candidate prefix | 58% | 100% |
| Nearby grass prefix | 28% | 100% |
| Distant grass | 近景のみ | 近景の約10% |

初期描画対象はLowで約144m四方、Balancedで約240m四方の近傍です。現在の区域定義は480×480mで、移動すると必要なchunkが順次生成され、古いchunkは解放されます。1〜2kmへ増やす際はboundsの変更だけで歩ける格子が拡張できますが、地理的実測・全域制作・性能保証を意味しません。長距離用の高さCPUキャッシュは24,000格子点までに制限します。

トランク/細い枝/複数の水平の針葉群/広葉群/草/岩はInstancedMeshを用います。純粋な円錐木の繰り返しではなく、樹高・樹種・枝の向き・葉色を変えます。近景は枝と4段の葉群、遠景は少ない葉群で簡略化します。透明な葉画像は使いません。動的影・透明葉の大量overdraw・重いpost-processing・外部物理エンジンは未導入です。

遠景は11枚の低解像度の稜線格子（各187頂点/320三角形）で、連続的に丸みと複数の峰を持たせています。札幌ではビルを圧倒しない低い山並みです。雲は7組×5の不揃いな静的volumeを低い不透明度で重ね、扁平な円盤形状を避けています。ササは1tuftあたり6枚の非対称の葉で、樹木の葉群にも高さ/長さのわずかな不規則性を加えています。いずれも画像や外部素材を使わない制作段階の自作形状です。

各AREAのscene/propsとchunkは入域時/関心更新時に遅延生成します。ネットワークによるasset streamingはありません。将来のGLB差替えはassetRefsを基点に別のloaderを追加できますが、現在は全て自作コード生成です。非アクティブAREAのモデルを同時生成しません。

## 資源寿命と座標精度

`update(x,z)`は同一chunk内では再生成しません。chunkの関心/LODが変化した際だけ生成・破棄します。除外chunkは固有のterrain geometryをdisposeし、InstancedMeshのGPU属性もdisposeします。共有素材・基礎geometryはAREA内で再利用し、AREA終了時に一度ずつ破棄します。

`setQuality()`は現在位置を保持してchunkを再構築し、近傍のheightAtは変わりません。`dispose()`は冪等で、その後のupdate/quality変更は無効です。scene、collider、height cacheを空にし、入力/音/RAF/timerはmission側の寿命とともに解除します。Pointer Lockはブラウザのユーザー操作でのみ取得し、HOME/hidden/pauseで解除する契約です。

Pauseと実Space keyupはControllerの入力ラッチも解除します。非表示中にkeyupが届かなかった場合も、復帰時の新しい押下を妨げません。位置・重力・空中の速度を初期化せず、再開時は新しい固定時間だけを進めます。

各独立AREAは局所原点を持ち、約±300m以内の座標で生成します。世界の緯度経度や旅行の累積距離を直接GPUのfloat座標へ入れません。2km級では局所原点を維持し、その先のシームレス連結は区域originまたはfloating originを別工程で導入します。今は必要のない大規模浮動原点処理を実装済みと主張しません。

## 計測と検証

`AreaLoader.stats()`はactive/near/far chunks、累計load/unload、樹木/草/岩数、instances、scene全体のgeometries/materials/triangles、GPU属性容量の概算、collider数、CPU cache数、chunk生成時間を返します。全sceneの構造数なので、renderer.infoの可視draw call/実描画triangle数とは異なります。GPUドライバー内部/フレームバッファの容量は含みません。実ブラウザでは別途renderer.info、起動時間、フレーム間隔を記録します。物理Windowsの60fpsは保証しません。

検証ファイル:

- `tests/world.test.mjs`: 19件。定義/seed/同一面/境界/全経路/水域/LOD/安全配置/10往復/キャッシュ上限/解放、景観ルートの主経路高さ保護、遠景の稜線/volume契約を検証。
- `tests/world-navigation.test.mjs`: 15件。実CharacterControllerの入力で全4AREAの全routeを**Low/Balanced両方**で100m以上歩行し、現実のcolliderとstreamingを使用。任意の湖岸往復と湖面の遮蔽確認、60HzのW入力で報告のあった知床z=26.92地点を通過する検査、扉通過、壁/窓/家具、jumpのroof raycast、室内からの切妻壁raycast、歩行途中の品質変更、invalid restore（場外/水域/急斜面）も検証。位置のteleport/restoreで道中を省略しません。

初回の壁接近テストは寝床の実コライダーに先に当たり、テストの壁接近用通路をz=0へ直して再実行しました。寝床の衝突を消したり判定を緩めたりしていません。最初の室内画像で切妻壁の裏面カリングによる空の三角形が見えたため、切妻壁だけを両面の不透明材質にして内側raycastを追加しました。4地域の実WebGL画像では遠景の三角錐と扁平な雲が目立ったため上記の稜線/volumeへ置き換えました。最初の湖岸1.0mの検査は湖面への視線が岸の丘に遮られて両品質FAILとなり、寄り道の湖岸点だけを4.2mへ修正して同じ厳密な遮蔽検査を通しています。Lowは固定seedの候補配置を減らすだけで樹木/岩の座標を再抽選しないことも検証しています。最終のこの34件はPASS、skipなし。全体のTITLE/HOME/mission/campaign/実WebGL/CI結果はSTATUSとPRの最終証拠を参照してください。

## 保存・ネタバレの契約

外観/装備は既存`reclaim.home-preview.v1`を維持し、campaignは別のバージョン付きキーを使います。AreaDefinitionは候補地域を知っていますが、通常UIの名称/説明はcampaignの公開可否を経由します。初期は知床のみ公開し、マップを開く操作には解放効果を持たせません。

知床は起床→ラジオ→親友の連絡→退出→実ドローン撃破→経路checkpoint→出口の証拠を使います。石狩/日高は環境プロトタイプの実徒歩checkpoint/出口にだけ進行を紐付け、正式な戦闘/ストーリーのクリアを偽装しません。札幌入口で制作範囲を示して停止し、函館など未制作のクリアを自動付与しません。

この保存はローカル端末専用で、認証/共有/改ざん防止はありません。破損/旧形式/拒否時は安全な初期状態へ戻し、リセットは確認を経てcampaignだけを消します。ソースに内部の地域名が含まれるため、ソース検査まで含めた完全なネタバレ防止は主張しません。契約は通常UIの段階公開です。
