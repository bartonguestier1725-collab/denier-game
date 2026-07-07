# Architecture

技術リファレンス。新しい AI/開発者セッションがコードベースを即座に理解するためのドキュメント。
**このファイルはコードの実態と一致していなければならない。** 構造を変えたら必ずここも更新し、`node tools/check-references.mjs` を通すこと。

> 最終更新: 2026-07-07（フル 3D 刷新後）

---

## 0. 30 秒で全体像

- **神経衰弱ゲーム**。ロジックとビューが完全分離している。
- **ロジック層** = `js/game-state.js`（ステートマシン + イベントバス）。DOM も WebGL も知らない。
- **ビュー層** = 2 実装あり、起動時に片方だけ選ばれる:
  - **3D 版**（既定）= `js/scene/` の 10 モジュール（Three.js WebGL フルシーン）
  - **classic 版**（`?classic=1` / WebGL2 非対応時）= `js/renderer.js`（DOM カード）
- **DOM UI** = `js/dom-ui.js`（タイトル/選択/結果画面・HUD・一覧表・共有・ARIA）。**両ビューで共通**。
- ビューはロジックが emit するイベントを購読するだけ。ロジックはビューを一切参照しない。
- ビルドなし・バンドラーなし・npm 依存なし。Three.js は `vendor/` に同梱。

**触る前にどのファイルか迷ったら**: §3 の責務表 → §4 のイベント契約 → 3D の描画詳細なら §6 と `js/scene/README.md`。

---

## 1. ディレクトリ構造

```
denier-game/
  index.html              単一 HTML。4 画面 + scene-canvas + importmap + ローディング + ARIA
  README.md               公開向けフロントページ（何を・どう動かす・技術概要）
  ARCHITECTURE.md         このファイル（技術リファレンス、実態と一致必須）
  STATUS.md               Phase 進捗・次のアクション・ナレーション選定状況
  FREE_ASSET_SOURCES.md   無料アセット配布サイト一覧（BGM/SE/装飾の調達先）
  narrator-script.md      壺おじ式ナレーション原稿（170 本、採用選定中。未実装）
  CLAUDE.md               プロジェクト仕様・戦略（gitignored。公開しない）

  css/
    variables.css   CSS Custom Properties（色・フォント・サイズ定数）。全 CSS の土台
    layout.css      body 背景・HUD・一覧表・レスポンシブ・ローディング・data-view/data-post ガード
    cards.css       classic 版のカード外観・フリップ・アニメーション（3D 版では未使用）
    screens.css     タイトル/選択/結果画面・ボタン・金箔テキスト（両ビュー共通）

  js/
    main.js         エントリ。WebGL2 判定 → data-view 設定 → dom-ui 起動 → 3D or classic を動的 import
    game-state.js   ★ロジックの心臓。ステートマシン + イベントエミッタ。ビュー非依存
    card-model.js   createDeck()（Fisher-Yates）, checkMatch()。純粋関数
    timer.js        performance.now() タイマー。TIMER_TICK を emit
    constants.js    DIFFICULTIES, タイミング定数, NIGHTMARE_OPACITY（全て freeze 済み）
    dom-ui.js       DOM UI 全部（画面切替/HUD/一覧表/共有/ARIA）。両ビュー共通
    renderer.js     classic 版の DOM カード描画（?classic=1 時のみ動的 import される）
    scene/          ★3D ビュー（Three.js）。§6 と js/scene/README.md 参照
      view3d.js     3D オーケストレータ。gameState イベント購読 → 各シーンモジュール駆動
      engine.js     renderer/カラーパイプライン/品質ティア/ポスト処理/watchdog/context-loss
      camera-rig.js フレーミングソルバー + パララックス + シェイク + グライド
      cards.js      カードメッシュ・グリッド配置・フリップ/ディール/獲得パイル演出
      materials.js  canvas テクスチャベイカー（デニール別フロント/箔裏面/影/各種）
      table.js      写真テーブル平面（レイアウト連動スケール、エッジフェード）
      lights.js     照明リグ + 燭台メッシュ + 炎 + フリッカー
      particles.js  金粉ドリフト + マッチ時バーストのプール
      input.js      ポインタ抽象化（tap 判定）+ プロキシ平面レイキャスト + キーボード
      anim.js       tween/easing エンジン（依存なし、~100 行）
    NOTE: main.js は './scene/view3d.js' を動的 import。view3d が他の scene/* を静的 import。

  vendor/three/     Three.js 0.170 ローカル同梱（CDN 非依存）
    three.module.min.js               コア
    addons/environments/RoomEnvironment.js   PMREM 環境マップ用シーン
    addons/postprocessing/*.js        EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, MaskPass, Pass
    addons/shaders/*.js               CopyShader, OutputShader, LuminosityHighPassShader

  assets/
    textures/
      bg-easy.png            Easy 卓写真（3D=テーブル平面 / classic=body 背景）
      bg-normal.png          Normal 卓写真
      bg-hard.png            Hard / Nightmare 卓写真
      bg-baroque-closeup.png classic 版デフォルト背景（タイトル/選択画面）
      bg-baroque-dark.png    classic 版モバイル背景
    decorations/
      openclipart-damask-pattern.svg  カード裏面ダマスク文様（materials.js が fetch）★唯一使用中

  tools/
    check-references.mjs   参照整合チェッカー（壊れ参照・デッドファイル・DOM-id 検出）

  .workspace/     生成画像ステージング・プロンプト・参考画像（gitignored。リポに含めない）
```

---

## 2. 起動フロー（main.js）

```
index.html 読み込み
  ├─ importmap: "three" → vendor/three/three.module.min.js, "three/addons/" → vendor/three/addons/
  ├─ css 4 枚 <link>
  └─ <script type="module" src="js/main.js">
        │
        ├─ WebGL2 使える? かつ ?classic 無し?
        │     YES → data-view="3d"  → initDomUi() → import('./scene/view3d.js') → initView3D()
        │              （initView3D が throw したら catch して classic にフォールバック）
        │     NO  → data-view="classic" → initDomUi() → import('./renderer.js') → initClassicRenderer()
        │
        └─ どちらも完了後 loading-overlay をフェードアウト
```

`document.body.dataset.view`（`3d` / `classic`）が CSS の分岐に使われる（`body[data-view="3d"]` で DOM 背景・#game-board を消す等）。

---

## 3. モジュール責務

| モジュール | 責務 | 状態 |
|---|---|---|
| `game-state.js` | ステートマシン、フリップ/マッチ/ミスマッチ判定、タイマー制御、イベント発行 | phase, subState, deck, moves 等 |
| `card-model.js` | createDeck()（シャッフル）, checkMatch() — 純粋関数 | なし |
| `timer.js` | performance.now() タイマー、MM:SS.s フォーマット | startTime, running |
| `constants.js` | DIFFICULTIES, タイミング定数, NIGHTMARE_OPACITY | 定数のみ（freeze） |
| `dom-ui.js` | 画面切替、HUD、一覧表トグル+モノクル通知、X 共有、ARIA ライブ通知 | chartWasShown, lastResult |
| `renderer.js` | **classic 版**の DOM グリッド・カードクラス操作・クリック処理 | cardMap |
| `scene/view3d.js` | **3D 版**のイベント→シーン変換オーケストレータ | inputLocked, deckIds, monocle 等 |
| `scene/*` | 各描画関心事（§6） | Three.js オブジェクト群 |

**依存の向き**: `main` → `dom-ui`/`renderer`/`scene/view3d` → `game-state` → `card-model`/`timer`/`constants`。
`game-state` から上流（ビュー）への依存は**ゼロ**。これが 3D/classic を差し替え可能にしている。

唯一のロジック→DOM 結合: `game-state.startGame()` が `document.body.dataset.difficulty` を設定する（CSS の難易度別スタイル用）。それ以外ロジックは DOM/WebGL を触らない。

---

## 4. イベントバス契約（ロジック ↔ ビュー の唯一の界面）

`game-state.js` が `emit(type, payload)`、ビューが `gameState.on(type, cb)` で購読。**この表がビューとロジックの契約。**

| イベント | ペイロード | 発火 | 3D | dom-ui | classic |
|---|---|---|:-:|:-:|:-:|
| `SCREEN_CHANGE` | `{ phase }` | 画面遷移 | ✓ | ✓ | ✓ |
| `CARD_FLIP` | `{ cardId, denier }` | カードめくり | ✓ | ✓(ARIA) | ✓ |
| `CARD_MATCH` | `{ cardIds:[a,b], denier }` | ペア成立 | ✓ | ✓(ARIA) | ✓ |
| `CARD_MISMATCH` | `{ cardIds:[a,b] }` | ペア不成立 | ✓ | – | – |
| `CARD_UNFLIP` | `{ cardIds:[a,b] }` | ミスマッチ裏返し（クリック後） | ✓ | ✓(ARIA) | ✓ |
| `MOVE_INCREMENT` | `{ moves }` | 手数+1 | – | ✓ | – |
| `TIMER_TICK` | `{ formatted }` | 100ms 毎 | – | ✓ | – |
| `GAME_COMPLETE` | `{ moves, time, timeMs, difficulty }` | 全ペア成立 | ✓ | ✓ | – |

- HUD 系（`TIMER_TICK`/`MOVE_INCREMENT`）は dom-ui だけが購読（3D はカードだけ担当、HUD は DOM）。
- `CARD_MISMATCH` は 3D だけが購読（赤リング+シェイク演出用。classic はシェイクを CARD_UNFLIP で処理）。
- 新イベントを足すときは必ずこの表を更新すること。

---

## 5. ゲームフローと subState

```
title ─[START]→ select ─[難易度]→ playing ─[全マッチ]→ result
  ▲                                                        │
  └───────────────[タイトルへ]──────────────────────────────┘
                              └─[もう一回]→ playing
```

playing 中の subState（game-state.js が管理）:

```
idle ─[1枚目]→ oneFlipped ─[2枚目]→ resolving
                                       ├ マッチ  → (最後のペア? → completing → result / 否 → idle)
                                       └ 不一致  → waitingDismiss ─[どこかクリック]→ idle
```

**ミスマッチはクリックで閉じる**（自動タイムアウトではない）。プレイヤーが記憶時間を自分で調整できる。
`waitingDismiss` 中のクリックは「解除」だけ行い、そのクリックでカードをめくってはいけない（過去に二重発火バグがあった。3D=input.js/view3d.js、classic=renderer.js の両方で解除を先に return して対処済み）。

---

## 6. 3D 描画パイプライン（js/scene/）

詳細な不変条件・座標系の約束は **`js/scene/README.md`** に集約。ここでは全体像のみ。

```
view3d.js（オーケストレータ）
  engine.js    WebGLRenderer + ACES/sRGB + PMREM 環境 + EffectComposer（デスクトップ）+ 品質ティア + FPS watchdog + context-loss
  camera-rig.js 二分探索フレーミングソルバー（縦横対応）+ パララックス + ブリージング + シェイク + グライド
  table.js     写真平面（レイアウト連動スケールで額縁・燭台が画角に入る）+ エッジフェード + フリッカー明度
  lights.js    ヘミ + キー + 燭光フリッカー PointLight×2（影なし）+ 燭台メッシュ + 炎スプライト + 光プール
  cards.js     共有押し出しジオメトリ + マテリアルグループ + グリッド配置 + フリップ/ディール/獲得パイル/ホバー
  materials.js canvas テクスチャベイカー（デニール別キャッシュ）+ PBR 箔マテリアル
  particles.js 金粉ドリフト（90）+ マッチバースト（144 プール）
  input.js     tap 判定ポインタ + プロキシ平面レイキャスト + キーボードナビ
  anim.js      tween/easing/damp（依存なし）
```

要点（詳細は scene/README）:
- **アートディレクション = シネマティック様式化**。写真テーブルは焼き込み照明の絵画的背景（≒unlit）。動的 PBR は金箔・金縁のみ。影は**ブロブコンタクトシャドウ**で統一（影付きライトなし）。
- **共有フリッカー**: 1 つの燭光揺らぎ値が 照明強度・炎・光プール・写真明度・HUD の `--flicker` CSS 変数 を同期駆動 → 写真世界とカード世界を一体化。
- **公平性**: カード表面のデニール判定要素（生地の濃さ・数字）は角度非依存にベイク。スペキュラは装飾層のみ。生地の織り目シードは全デニール共通（模様がマッチの手がかりにならない）。
- **品質ティア**: モバイル= DPR≤1.5 / テクスチャ半解像度 / MeshStandard / ポスト簡略。デスクトップ= フル PBR + HDR コンポーザー。FPS watchdog が DPR→Bloom→post の順で自動降格。
- **ポスト**: HDR HalfFloat + MSAA4x → UnrealBloom(閾値 1.0=炎と箔だけ) → OutputPass(ACES/sRGB) → 統合グレードパス(色収差/彩度/ビネット/グレイン、難易度別)。

---

## 7. レンダリング & CSS レイヤリング

**3D 版**: WebGL が全景を描く。DOM は UI オーバーレイのみ（`body[data-view="3d"]` が DOM 背景・グレイン・ビネット・#game-board を無効化。ポスト有効時は `body[data-post="1"]` が DOM グレイン/ビネットも無効化）。

**classic 版**: 従来の CSS レイヤリング。

```
[背面] body 背景写真 → body::before(暗幕/エッジ影 z-1)
[UI]   .table-panel(z1) → #hud/.reference-chart/.btn-toggle-chart/.table-monocle(z10)
[3D]   #scene-canvas(z0, 3D 版のみ描画)
[効果] .screen::after(ビネット z100) → body::after(グレイン z9999)
[前面] #loading-overlay(z200, 起動時のみ)
```

---

## 8. 難易度設定（constants.js）

| 難易度 | デニール値 | cols×rows | 枚数 |
|---|---|---|---|
| Easy | 0, 15, 30, 60, 80, 110 | 3×4 | 12 |
| Normal | 0, 10, 15, 20, 30, 40, 50, 60, 80, 110 | 4×5 | 20 |
| Hard | 0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 110 | 4×7 | 28 |
| Nightmare | Normal と同値（数字なし・生地の濃さのみ） | 4×5 | 20 |

`NIGHTMARE_OPACITY`: 0d=0.05（ほぼ透明）〜110d=0.92（ほぼ黒）の線形マップ。3D では生地の濃さ、classic では黒 rgba に使う。

---

## 9. 外部依存

| 依存 | バージョン | 読み込み | 用途 |
|---|---|---|---|
| Three.js | 0.170 | **ローカル同梱** `vendor/three/`（importmap） | 3D シーン全部 |
| Google Fonts | – | CDN | 5 書体（DOM + canvas ベイクの数字にも） |

- npm パッケージ・バンドラー・フレームワークなし。
- Three.js を CDN でなく同梱する理由: バージョン固定 + オフライン/CSP 耐性 + コールドロード短縮。
- **バージョン更新手順**: `vendor/three/` の各ファイルを `https://cdn.jsdelivr.net/npm/three@<ver>/` の対応パスから再取得（`build/three.module.min.js` と `examples/jsm/**` の該当 addons）。importmap のパスは据え置き。

---

## 10. 検証ツール

```bash
node tools/check-references.mjs
```

index.html を起点に静的依存グラフを辿り、以下を検出（読み取り専用・依存なし）:
- **BROKEN**: import/`<script>`/`<link>`/`url()`/asset 文字列/getElementById の参照先が存在しない
- **DEAD**: js|css|assets|vendor 配下で index.html から到達不能なファイル
- **DOM-GAP**: JS の getElementById/requireEl が参照する id が index.html に無い

構造を変えたら**必ず実行してグリーンを確認**。デッドファイルの意図的な残置（classic フォールバック等）は `DEAD_ALLOWLIST` に登録する。

E2E 動作検証は Playwright + SwiftShader（ヘッドレス WebGL）。`?debug` で `window.__denier3d`（engine/gameState/cards/rig/lights）が露出し、スロット座標を camera.project で画面 px に変換して本物のクリック経路まで検証できる。手法は memory の session_2026-07-07 参照。

---

## 11. デプロイ

`main` push → GitHub Pages 自動デプロイ（~30 秒、ビルドなし）。
公開 URL: https://bartonguestier1725-collab.github.io/denier-game/
リポジトリ: github.com/bartonguestier1725-collab/denier-game（Public。CLAUDE.md は gitignore で非公開）。

---

## 12. 主要な設計判断（現行）

| 判断 | 理由 |
|---|---|
| ロジックとビューをイベントバスで分離 | ビューを 3D↔classic 差し替え可能に。ロジックのテスト容易性 |
| 描画は WebGL フルシーン、UI は DOM | 日本語フォントの鮮明さ・a11y は DOM が優位。3D は没入感 |
| Three.js を vendor 同梱 | CDN 障害/CSP 非依存、バージョン固定 |
| カードは共有ジオメトリ + デニール別テクスチャキャッシュ | メッシュ/マテリアル爆発を防ぐ（カードごとに作らない） |
| 影付きライトなし、ブロブ影で統一 | 全品質ティアで一貫した見た目、モバイル負荷減 |
| 写真テーブルは ~unlit | 焼き込み照明との二重照明を回避（合成感を防ぐ） |
| 生地アルベドは角度非依存・シード共通 | 同デニールが置き場所で違って見えない（公平性） |
| classic DOM 版を保持（?classic=1） | WebGL2 非対応フォールバック + 低スペック救済 + 回帰比較 |
| ミスマッチはクリックで閉じる | プレイヤーが記憶時間を自分で調整 |
| tween は実時間 tick（scene/README 参照） | 低 fps でもアニメ/入力ロック解除が予定通り完了 |

---

## 13. 未実装（スコープ外・今後）

- **音声**: BGM（Kevin MacLeod）/ SE（効果音ラボ）/ ナレーション（ElevenLabs、narrator-script.md）
- **フォトリアル脚画像**: Codex CLI 生成。materials.js の生地ベイカーは標本窓の背景差し替えで対応可能な設計
- **一覧表の 3D 化**: 現状 DOM のまま
- **V2 機能**: カードマーキング、イケオジヒント、実績/称号
