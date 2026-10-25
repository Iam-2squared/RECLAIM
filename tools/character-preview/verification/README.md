# 初期スキンのみの最終確認

対象はユーザー提供の男性・女性の初期スキン2体。追加髪型・髪色編集は対象外。

- 男性：元の5メッシュ、123骨、8画像。女性：元の3メッシュ、183骨、9画像。
- 元GLBのバイナリ、メッシュ、ノード、スキン、アクセサー、画像を保持。表示用GLBは素材の金属度・粗さの係数を補正。
- 編集用Blenderファイルを元GLBから再生成。追加髪メッシュは0。元の男性FBXも別途保持。
- Chromiumで8項目合格、ブラウザエラー0件。回転・ズーム・カメラ復帰・首の可動・元髪の追従と正確な復帰・保存・読み込み競合・GPU資源の安定・モバイル操作・単独HTMLの埋め込み読み込みを確認。
- 同じ単独HTMLをHTTPで読み込み、追加通信0件。管理ポリシーによりfile://は閲覧できず、その直接起動は未検証。
- 単独HTML：34,847,018 bytes、SHA256 ccb68c7ede432d70640528b3d403b11fc42fbb41889fb5a4a40ad1c73315035d。
- 元GLBにアニメーションクリップは0。本編の歩行・射撃・HOMEへの組み込みは今後の作業。

詳細は browser-report.json、blender-report.json を参照。素材補正の詳細は `python3 scripts/prepare-game-assets.py` で `assets/*/game-material-adjustments.json` に再生成します。

保存ブランチは `codex/checkpoint-original-skins-20261025`、本編への組み込みは含みません。
