# Architecture

技術的リファレンス。新しいAIセッションがコードベースを即座に理解するためのドキュメント。

---

## ファイル構成

```
denier-game/
  index.html              — 単一ページHTML。4画面構成（title/select/game/result）
  CLAUDE.md               — プロジェクト仕様・戦略的決定
  STATUS.md               — Phase進捗・次のアクション
  ARCHITECTURE.md         — このファイル（技術リファレンス）
  FREE_ASSET_SOURCES.md   — 無料アセット配布サイト一覧
  narrator-script.md      — イケオジナレーション原稿（808行、170本、採用選定中）
  css/
    variables.css          — CSS Custom Properties（色・フォント・サイズ定数）
    layout.css             — body背景・テーブル・3Dパース・HUD・チャート・レスポンシブ
    cards.css              — カード外観・フリップ・マッチ/ミスマッチアニメーション
    screens.css            — タイトル/選択/結果画面・ボタン・金箔テキスト
  js/
    main.js                — エントリーポイント。イベントリスナー接続
    game-state.js          — ステートマシン + イベントエミッター（ゲームロジックの心臓）
    renderer.js            — DOM更新。game-stateイベントを購読してUI反映
    atmosphere.js          — Three.jsパーティクルシーン（ゲームロジック非依存）
    card-model.js          — デッキ生成（Fisher-Yates shuffle）、マッチ判定
    timer.js               — performance.now()ベースのタイマー
    constants.js            — DIFFICULTIES定義、タイミング定数、Nightmareオパシティマップ
    card-tilt.js           — [無効] マウス追従カード傾き（3Dパースとの干渉でフリッカー発生）
  assets/
    textures/
      bg-easy.png          — Easy背景（topdown-felt-ornate）
      bg-normal.png        — Normal背景（topdown-wide-room）
      bg-hard.png          — Hard/Nightmare背景（topdown-dark-intimate）
      bg-baroque-closeup.png — デフォルト背景（タイトル/選択画面）
      bg-baroque-dark.png  — モバイルデフォルト背景
      subtle-felt.png      — [未使用] 旧CSSフェルト用
      felt-green-texture.png — [未使用]
    decorations/
      openclipart-damask-pattern.svg — カード裏面パターン（使用中）
      openclipart-*.svg    — その他5ファイルは未使用（削除候補）
  .workspace/              — 生成画像ステージング・プロンプト・リサーチ（gitignored）
    assets/                — Codex CLI生成画像の一時保管
    prompts/               — 画像生成用プロンプトJSON
    research/              — codex-reviewerリサーチ結果
      bgm-se-research.md       — BGM/SE候補調査
      consult-3d-immersion.md  — 3D没入感のコンサルト結果
      consult-visual-techniques.md — 視覚演出テクニック
      unimplemented-techniques.md  — 未実装の演出候補
```

---

## ナレーション原稿（narrator-script.md）

170本のEN/JP対訳セリフ。14カテゴリ。通し番号 #001–#170。

| Cat | トリガー | 長さ | テンション |
|---|---|---|---|
| 1-4 | ゲームプレイ中（ミス/成功/放置/連続ミス） | 短〜中 | 罵倒+うんちく |
| 5 | ゲーム完了 | 中 | 渋い評価 |
| 6 | X共有テキスト | 1文 | ミーム的 |
| 7,10 | 放置独白 | 長（4-10文） | 哲学/confessional |
| 8 | ランダム（ゲーム中） | 中 | 変態紳士 |
| 9 | ミスマッチ | 短〜中 | 他業界プロ比較 |
| 11 | 低頻度ランダム | 1-2文 | アフォリズム |
| 12 | 行動パターン検知 | 中 | メタ読み |
| 13 | タイトル画面放置(8-12秒) | 短 | 変態紳士ワンライナー |
| **14** | メニュー/ゲーム中 | **1-2文** | **狂人のロジック（正解のトーン）** |

**正解のトーン** = Cat.14 "Madman's Logic": 「何言ってんだこいつw」が2秒で来る。全カテゴリの書き直し時の基準線。

TTS実装時: ENテキストのみElevenLabsに渡す。JPは字幕overlay表示。

---

## CSS レイヤリング（z-index マップ）

```
[最背面]
  body background-image     — AI生成バロック部屋写真（z-index: なし）
  body::before              — ダークオーバーレイ + 上下エッジ影（z-index: -1）
[ゲームコンテンツ]
  .table-panel              — 透明レイアウトコンテナ（z-index: 1）
  #hud                      — 手数/タイマー表示（z-index: 10）
  .reference-chart          — デニール一覧チャート（z-index: 10）
  .btn-toggle-chart         — ベルボタン（z-index: 10）
  .table-monocle            — モノクルprop（z-index: 10）
[エフェクト]
  #atmosphere-canvas        — Three.jsパーティクル（z-index: 90）
  .screen::after            — CSSビネット（z-index: 100）
  body::after               — フィルムグレイン（z-index: 9999）
[最前面]
```

---

## JS モジュール構成

```
main.js
  ├── import { gameState } from './game-state.js'
  ├── import { initRenderer } from './renderer.js'
  └── import { initAtmosphere } from './atmosphere.js'

game-state.js  ← ゲームロジックの心臓
  ├── import { MISMATCH_DELAY, RESULT_TRANSITION_DELAY } from './constants.js'
  ├── import { createDeck, checkMatch } from './card-model.js'
  └── import { createTimer } from './timer.js'

renderer.js  ← DOM操作の全権
  ├── import { gameState } from './game-state.js'
  └── import { DIFFICULTIES, NIGHTMARE_OPACITY } from './constants.js'

atmosphere.js  ← 完全独立（ゲームロジック非依存）
  └── THREE (グローバル、CDN読み込み)
```

### 各モジュールの責務

| モジュール | 責務 | 状態管理 |
|---|---|---|
| `main.js` | イベントリスナー接続、初期化呼び出し | なし |
| `game-state.js` | ステートマシン、フリップ/マッチ/ミスマッチ判定、タイマー制御 | phase, subState, deck, moves等 |
| `renderer.js` | グリッド構築、画面切替、カードDOM操作、チャート構築、X共有 | cardMap, chartWasShown, lastResult |
| `atmosphere.js` | Three.jsシーン、パーティクル更新、ライトフリッカー、カメラ呼吸 | Three.jsオブジェクト群 |
| `card-model.js` | createDeck(), checkMatch() — 純粋関数 | なし |
| `timer.js` | performance.now()タイマー、フォーマット出力 | startTime, running, pausedElapsed |
| `constants.js` | DIFFICULTIES, タイミング定数, NIGHTMARE_OPACITY | 定数のみ（freeze済み） |

---

## イベントシステム

`game-state.js` がイベントを発行し、`renderer.js` が購読する。

| イベント | ペイロード | 発火タイミング |
|---|---|---|
| `CARD_FLIP` | `{ cardId, denier }` | カードがめくられた時 |
| `CARD_MATCH` | `{ cardIds: [id1, id2], denier }` | ペア成立時 |
| `CARD_MISMATCH` | `{ cardIds: [id1, id2] }` | ペア不成立時 |
| `CARD_UNFLIP` | `{ cardIds: [id1, id2] }` | ミスマッチカードが裏返る時（クリック後） |
| `SCREEN_CHANGE` | `{ phase }` | 画面遷移時 |
| `TIMER_TICK` | `{ formatted }` | 100msごと |
| `MOVE_INCREMENT` | `{ moves }` | 手数+1時 |
| `GAME_COMPLETE` | `{ moves, time, timeMs, difficulty }` | 全ペア成立時 |

---

## ゲームフロー

```
1. title ──[START]──▶ 2. select ──[difficulty btn]──▶ 3. playing ──[全マッチ]──▶ 4. result
     ▲                                                                              │
     └──────────────────[タイトルへ]──────────────────────────────────────────────────┘
                                                    └──[もう一回]──▶ 3. playing
```

### Playing画面のsubState遷移

```
idle ──[1枚目クリック]──▶ oneFlipped ──[2枚目クリック]──▶ resolving
                                                           │
                                               ┌───────────┴───────────┐
                                               ▼                       ▼
                                          [マッチ成立]            [ミスマッチ]
                                               │                       │
                                               ▼                       ▼
                                      ┌── matchedCount ──┐     waitingDismiss
                                      │   == totalPairs   │         │
                                      ▼                   ▼         │[どこかクリック]
                                 completing              idle       │
                                      │                       ◀─────┘
                                      ▼
                                   result
```

---

## 主要な設計判断

| 判断 | 理由 |
|---|---|
| カードはHTMLボタン（WebGLではない） | アクセシビリティ（キーボード操作、スクリーンリーダー） |
| 3DテーブルはCSS perspective + rotateX | Three.jsに依存しない。CSSだけで俯瞰効果 |
| 背景はAI生成写真 | CSSフェルトパネルより圧倒的にリッチ。コスト$0 |
| CSSフェルトパネル廃止 | 写真がそのままテーブル表面として機能する |
| ミスマッチはクリックで閉じる（自動タイムアウトではない） | プレイヤーが記憶時間を自分で調整できる |
| 一覧チャートは"was shown"をbool追跡 | リザルト/X共有で使用有無を記録するため |
| モノクルpropはダイエジェティック | 世界観を壊さずにチャート使用を視覚フィードバック |
| card-tilt.js無効化 | 3Dパースペクティブ(1100px)とカード個別perspective(600px)が競合、カーソル移動でフリッカー発生 |
| フィルムグレインはSVG feTurbulence | 画像不要、CSS1行で表現 |

---

## アセットパイプライン

```
[画像生成]
  bg-asset-product/scripts/codex_imagegen.sh <prompt.json> <output_dir>
  ↓
  .workspace/assets/ （ステージング）
  ↓
  assets/textures/ （本番、リネームしてコピー）

[音声生成（未実装）]
  narrator-script.md のテキスト
  ↓
  ElevenLabs "The Aristocratic Patriarch" voice
  ↓
  assets/audio/narration/ （予定）

[BGM/SE（未実装）]
  Incompetech / 効果音ラボからDL
  ↓
  assets/audio/bgm/ , assets/audio/se/ （予定）
```

---

## 外部依存

| 依存 | バージョン | 読み込み方式 | 用途 |
|---|---|---|---|
| Three.js | r128 | CDN (cdnjs.cloudflare.com) | パーティクル/雰囲気レイヤー |
| Google Fonts | - | CDN (fonts.googleapis.com) | 5書体 |

- npmパッケージなし
- バンドラーなし
- フレームワークなし
- ローカル確認: `npx serve .`

---

## 難易度設定（constants.js）

| 難易度 | デニール値 | cols x rows | カード枚数 |
|---|---|---|---|
| Easy | 0, 15, 30, 60, 80, 110 | 3x4 | 12 |
| Normal | 0, 10, 15, 20, 30, 40, 50, 60, 80, 110 | 4x5 | 20 |
| Hard | 0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 110 | 4x7 | 28 |
| Nightmare | Normalと同じ（色だけ） | 4x5 | 20 |

Nightmareのオパシティ: 0デニール=0.05（ほぼ透明）〜110デニール=0.92（ほぼ黒）の線形マッピング。
