# デニール神経衰弱

ストッキングのデニール値（糸の太さ＝透け感）で見分ける神経衰弱。見た目のほとんど同じカードを、透け感の記憶だけで対にする。

**プレイ**: https://bartonguestier1725-collab.github.io/denier-game/

## これは何か

神経衰弱（メモリーゲーム）。裏向きのカードを2枚めくり、同じデニール値のペアを探す。難易度が上がるほどデニール値が近接し（15と20の違いが分かるか？）、Nightmare では数字が消えて生地の濃さだけが手がかりになる。

バロックの燭台テーブルを俯瞰する 3D シーンで、カードは実際の 3D メッシュ。透け感の差というゲームの核を、リッチな見た目とシュールなギャップで包んでいる。

## 動かす

ビルド不要・依存インストール不要。静的ファイルをそのまま配信する。

```bash
npx serve .
# → http://localhost:3000/
```

| URL | モード |
|---|---|
| `/` | 3D 版（WebGL2。既定） |
| `/?classic=1` | 旧 DOM 版（軽量フォールバック） |
| `/?debug` | FPS 表示 + `window.__denier3d` デバッグハンドル |

WebGL2 が使えない環境では自動で classic 版にフォールバックする。

## 技術構成

- HTML5 + vanilla JavaScript（ES Modules、**バンドラーなし**、importmap）
- [Three.js 0.170](https://threejs.org/) — `vendor/three/` にローカル同梱（CDN 非依存）
- 描画は WebGL フルシーン（`js/scene/`）、UI は DOM オーバーレイ
- ゲームロジック層（`js/game-state.js`）はイベントバスで描画から完全独立
- npm パッケージ・フレームワークなし

詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照。

## 難易度

| 難易度 | ペア | 枚数 | デニール値 |
|---|---|---|---|
| Easy | 6 | 12 | 0, 15, 30, 60, 80, 110 |
| Normal | 10 | 20 | 0, 10, 15, 20, 30, 40, 50, 60, 80, 110 |
| Hard | 14 | 28 | 0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 110 |
| Nightmare | 10 | 20 | Normal と同値だが数字なし・生地の濃さのみ |

## 開発

```bash
node tools/check-references.mjs   # 参照整合チェック（壊れ参照・デッドファイル検出）
```

コード構造・イベント契約・3D シーンの不変条件は [ARCHITECTURE.md](ARCHITECTURE.md) と [js/scene/README.md](js/scene/README.md) に。プロジェクトの進捗と次のアクションは [STATUS.md](STATUS.md) に。

## デプロイ

`main` への push で GitHub Pages に自動デプロイ（約 30 秒）。ビルドステップなし。

## クレジット

- 3D 描画: Three.js (MIT)
- カード裏面ダマスク文様: OpenClipart (CC0)
- フォント: Google Fonts（Cinzel Decorative, Playfair Display, Libre Baskerville, Noto Serif JP, Great Vibes）
