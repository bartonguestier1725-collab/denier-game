# デニール神経衰弱 — STATUS

> **最終更新: 2026-06-20**

---

## 現在の状態

| Phase | 状態 | 詳細 |
|---|---|---|
| Phase 0: 企画確定 | ✅ 完了 | ルート・ビジュアル・ゲームデザイン・収益モデル決定 |
| Phase 1: 画像生成 | ⬜ 未着手 | Codex CLIでデニール別脚画像 + ナイトメア用布テクスチャ |
| Phase 2: Web版実装 | ✅ 完了 | 骨組み完成。全4難易度動作確認済み（デバッグ用数字表示） |
| Phase 3: 公開・バズ検証 | ⬜ 未着手 | GitHub Pages + itch.io |
| Phase 4: 物理カード | ⬜ 未着手 | バズ確認後。萬印堂試作→BOOTH販売 |

---

## 確定事項

| 項目 | 決定 |
|---|---|
| ルート | 硬派（クリーンブランド。コラボ可能性を残す） |
| ビジュアル | フォトリアル脚（Codex CLI、$0） |
| 世界観 | **バロック/ロココ調**（レトロ西洋・18世紀貴族文化） |
| 演出 | **壺おじ式ナレーション**（渋いイギリス英語 + 日本語字幕、ストッキング史） |
| 音声 | ElevenLabsで事前生成mp3（ランニングコスト$0） |
| 名義 | クリーン名義（R-18は別名義で別プロジェクト） |
| 販路 | Web無料 → itch.io |
| 物理カード | バズ後にBOOTH + The Game Crafter |
| ナイトメアモード | 塗りつぶしのみ（脚なし、布の色味だけ） |

---

## Phase 2 完了内容

### ファイル構成
```
index.html
css/ variables.css, layout.css, cards.css, screens.css
js/  constants.js, card-model.js, timer.js, game-state.js, renderer.js, main.js
```

### 動作確認済み機能
- 全4難易度 (Easy 3x4, Normal 4x5, Hard 4x7, Nightmare 4x5)
- カードフリップアニメーション (CSS 3D transform)
- マッチ/ミスマッチ判定 + 1秒待機ロック
- 手数カウント + performance.now()タイマー
- Nightmareモード: rgba opacity グラデーション
- モバイル375px対応、prefers-reduced-motion対応

### ビジュアル差し替えポイント
- `renderer.js` の `renderCardFace()` 1関数を変えるだけで画像対応
- CSS変数でテーマ変更可能

### 起動方法
```
cd /home/gen/projects/denier-game && npx serve .
```

### codex-reviewer 3ラウンド実施
11モデル並列レビュー × 3回。累計約100件の指摘からHIGH/MEDIUM 30件を採用修正済み。

---

## 次のアクション

1. **ビジュアル世界観の確立**（バロック/ロココ調アセット選定）
   - テーブル背景・カードフレーム・UI装飾の方向性を固める
2. Codex CLIでデニール別の脚画像を生成
3. ナイトメアモード用の布テクスチャ画像を生成
4. ロココ調UIへの差し替え
5. ナレーション原稿作成 → ElevenLabsで音声生成
6. GitHub Pages にデプロイ
7. itch.io に出品

---

## 出自

dlsite-ai-cg（アイデアハブ）の works/002/game-ideas.md から切り出し。
bg-asset-product の戦略セッション中に生まれたアイデア。
