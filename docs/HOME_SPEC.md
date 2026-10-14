# RECLAIM HOME V2 / ワールド接続後の契約

HOMEは従来のローカル外観・装備・4人配置見本を保持する。東京TITLEの次の入口であり、初回ロードやリロードは必ずTITLE。今回の知床FPSはHOMEを作り直さず、出撃前確認の先へ接続した。

| メニュー | 現在の動作 | 保存 / 境界 |
| --- | --- | --- |
| マップ | 18地点を保持し、初期は知床だけ名称/説明を表示。他は???。知床→道中2区間→札幌を実到達で順次公開。 | campaign独立保存。マップ閲覧だけで解放しない。正式な先の敵/東京展開は隠す。 |
| キャラ設定 | 表示名/3色を即時プレビュー。適用/取消/初期化、IME・literal text保持。 | `reclaim.home-preview.v1`は従来どおりプレビュー専用。 |
| 武器 | 主/副2銃、重複時swap、手持ち銃、鞘付き日本刀見本。 | 所有権や強化を付与しない。実MISSIONの手持ち銃は仮の射撃性能へ対応。 |
| 今のボス状況 | 未接続、共通HP —、3つの条件未確定の壁。 | 未到達のボス配置名は???。攻略参加人数・討伐は架空表示しない。 |
| ランキング | 未接続/集計準備中の空状態。 | 競技ランクと装備レアリティを分離。 |
| START | 解放済み区域だけを出撃先へ提示。初期は知床。明示的な出撃/安全位置の再開/HOMEへ戻る。 | WebGL失敗時は開始不可と理由を表示。MISSIONはSOLO、4体のHOME見本は同行しない。 |

## HOME V2の保護

560–900pxの大きなデスクトップパネル、固定ヘッダー/操作フッター/本文スクロール、自キャラ用の右列、ナビと左下装備カードの非重複を保持。低いPCで5メニューへ到達可能。小さい画面のsheet・inert fallback・Tab containment・Escape/焦点復帰・VisualViewport追従も保持する。

パネルを開いている間のSTARTは無効。閉じると元のボタンへ焦点復帰。4人配置は閉じた時に全員を表示、後方3体は見本。HOMEはPointer Lockを要求しない。

東京のgeometry・タイトルCSS・灰色の空・押した時だけ1.75秒の影・5.5秒抑止・独立した終了タイマー・30fpsの単調時計・RAF遅延時のdirty-frame処理は保持。音は初期OFF。TITLE/HOMEとMISSIONは同じrendererを使い、同時に描画しない。MISSIONだけが60Hzの移動/敵シミュレーションと独自カメラを持つ。

## 保存契約

- `reclaim.display.v1`：Low/Balanced・背景の動き抑制。MISSIONの操作を動き抑制で停止しない。
- `reclaim.home-preview.v1`：従来の名前/色/武器プレビュー。16Unicode codepoints、control chars除外、未知gun/palette/versionのsafe defaults。取消は未適用変更を捨てる。
- `reclaim.campaign.v1`：version1の順序付き導入、実敵停止、通過証拠、歩行POI、進行位置。未知version/破損/不整合は安全に初期化。端末ローカルで、認証/改ざん防止を保証しない。
- マップの進行リセットは確認操作を経る。外観/武器キーを消さない。quota拒否はUIへセッションのみと表示して操作を維持する。

## 配布と検証

`npm run package:preview`で`release/RECLAIM_World_Preview.html`と従来HOME/titleの同一内容aliasを生成。source HEAD metaとworking-tree状態を埋める。Three.js MIT notice、実行時CDN/API/外部アセットなし。PC Chromeでfile://検証する。iPhone FilesのHTMLプレビューはPCの操作検証に代用しない。

既存回帰は残す。以前の「出撃無効」は今回の明示出撃/WebGL失敗時の無効へ更新。「全地名の閲覧」は18地点を保った???表示へ更新。タイトルタイマー、外観/装備、安全な保存、パネル寸法、keyboard/touch、WebGL失敗、外部通信、繰返し資源確認の判定を緩めない。

仕様詳細：[WORLD_ARCHITECTURE](WORLD_ARCHITECTURE.md)、[知床仕様](SHIRETOKO_LEVEL_SPEC.md)、[状態と証拠](STATUS.md)。
