# ワールド検証・改善の記録

最終PASS/FAILとsource HEADはSTATUS/PR/配布manifestを参照。以下は途中で発見した失敗と修正で、最終結果へ置き換えて消さない。

| 途中の問題 / 実際の失敗 | 原因と対応 |
| --- | --- |
| Playwright156/151のbrowser ZIP取得はzero-byte/invalid zipで失敗 | 実行コードの依存を変えず、試験環境だけに@sparticuz/chromium138.0.2のMIT配布binaryを用意。試験用日本語OS fontも追加。配布物へ含めない。 |
| 最初のPointer Lockで視点が急回転 | ブラウザのカーソル移送を読んでいた。最初のイベントと短いロック安定期間、異常な大移動を除外。物理Windowsマウスの確認は別。 |
| 室内から切妻壁の三角部分が空へ抜ける | 屋外向けtriangleの裏面が消えていた。家の切妻だけDoubleSide、不透明のまま。室内raycast回帰を追加。 |
| ブラウザの最終道標確認で未達(5秒predicate FAIL) | 試験が(4,100)まで、radius3で止まり実位置z97.26。実出口(4,104)radius5の外だった。正しい実出口へ歩く試験へ修正し、達成の判定は変えない。 |
| 新しい進行リセットfooterでHOME低画面の地図が1.8px以上見切れる | 全6PCパネル回帰で発見。map/captionと固定footerの実寸から地図の上限高さを計算し、パネル寸法・5メニューの判定を維持。 |
| 初回dev-area試験の途中で開始点へ戻る / 入力停止 | 実行中のdev serverへruntime編集を行いHMRで再起動した。途中suiteを停止し、コード固定で再実行。4AREAすべての実歩行がPASS。地形のz26.92停止はLow/Balancedの60Hz再現で起きず、地形判定を緩めない。 |
| PC4viewportの17ケース中14PASS/3FAIL | 2ケースはPointer Lock中の自動マウス移送の差異、1ケースは短いSpace tapが固定ステップ前にkeyupしジャンプが消失。失敗画像/contextはreview/failure-historyへ保持。短いSpaceを1ステップまでbufferする修正と、ブラウザ入力を確認する。 |
| 単独HTMLの初回shader構築中に300msだけ押したWのprobeが移動0 | ソフトウェアGPUの最初のrender送信が約575ms。入力試験を実シミュレーション開始の読取確認後に行う。実歩行の距離predicateを維持し、物理PCの起動時間/FPS保証をしない。 |
| 導入前に実ドローンを倒すと後から進行へ結びつかない | 導入4段階まで戦闘を開始しない。敵HP0を架空の成功へ変換しない。 |
| HP0で再挑戦直後の保存が古い死地点になる | 実起点へ復帰した位置をmovement sampleへ記録してからcheckpoint保存。 |
| HOMEへ戻った後、遅れてPointer Lockが成功する可能性 | Promise完了/失敗のdisposed guardと、MISSION外ではロック解除するapp guard。遅延要求のブラウザ回帰を追加。 |
| idle時quota拒否後も「保存済み」の表示が残る | HUD cache keyへsaveStatusを含める。quota拒否を実ブラウザで再現しセッション表示へ変化確認。 |
| ポーズ中Spaceでnative buttonが押せない | 移動keyのpreventDefaultを操作中だけへ限定。起床/探索buttonのSpaceをブラウザで確認。 |
| 最初のワールドCI38597322051は4ケースFAIL、25分で残りWebKitを中断 | typecheck/JS85/Python27/build/packageはPASS。CIのSwiftShaderではMISSIONのsimulation/wall比が約0.34。UI41/ワールド17/WebKit14を同じ判定の3独立jobへ分割し、各jobは1worker/25分を維持。失敗ログ・error-context・途中の実画像はreviewに保持する。 |
| CI石狩の歩行が期限切れになったが、最後の実位置は目標から1.528m | 元の合格半径2m以内へ最後の入力で到着していた。期限を先に調べて最新位置を読まないhelperの競合を修正。地形/コライダー/半径/50秒区間上限を緩和しない。 |
| CIの敵移動比較が同じz値だった | 長い視点回転と撮影の間に追従が実際に完了し、攻撃時の8m停止位置へ到着済みだった。家を出る前の位置から実移動を比較し、撮影前に確認。実索敵/追従/射撃3hit/HP0停止の判定を保持。 |
| CIのHP4再挑戦試験がz14.77でpauseとなった | 実攻撃が当たりHP0へ到達したための正しい停止を歩行エラーにしていた。死を期待するケースだけ実HP0の停止を受け、HP4→0→再挑戦100/安全起点を引き続き確認する。 |
| CIの1920×1080新規操作試験がジャンプ着地確認中に30秒のケース予算を消費 | 起動/大画像撮影/視点/徒歩/ジャンプ/ポーズ/帰還を含む新規4ケースだけ60秒。5秒のジャンプとUI判定は維持。4AREA通し歩行だけ、実測のsoftware GPU速度と追加歩行に合わせ600秒。既存テストの時間枠は変更しない。 |
| 射撃試験の260ms wall待機は低fpsで実cooldownの0.2秒に届かない可能性 | 次の実クリック前にread-only snapshotのsimulation elapsedで満了を確認。5秒の観測上限、最大6回の実クリック、3hit/HP0/実停止を保持し、ゲームの武器値/命中判定は変えない。 |
| CI38606977966はUI41/WebKit14/製品MISSION13がPASS、dev AREA3件がFAIL | 全AREA開発プレビューはboot中にBalancedを生成し、その後Lowへ切替していた（active9/load34/unload25）。製品側はLowを選んでから生成する。開発画像/徒歩試験もユーザーの表示設定をboot前にLowへ保存し、実際の初期active9/load9/unload0を追加確認する。動的Balanced→Low試験は別ケースで保持。歩行半径/50秒/入力観測5秒/120秒ケースは変更しない。失敗ログ・画像をreviewへ保持する。 |

skip、失敗テスト削除、正しい出口/HP/保存のpredicate緩和は行わない。長い4AREA歩行・10回往復にはその実フローに対応するcase-specific時間枠を使う。通常の5秒UI predicateを無条件に延長しない。既存WebKit14件は維持し、ローカルで実行できない場合は未実行と明記して最終CIと分ける。
