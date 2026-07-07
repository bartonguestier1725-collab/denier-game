# tools/

リポジトリの保守用スクリプト。プロダクトには含まれない（`index.html` から参照されない）。

## check-references.mjs

参照整合チェッカー。`index.html` を起点に静的依存グラフを辿る。

```bash
node tools/check-references.mjs
```

検出するもの:
- **BROKEN** — import / `<script>` / `<link>` / CSS `url()` / JS の asset 文字列 / `getElementById` の参照先が存在しない
- **DEAD** — `js|css|assets|vendor` 配下で `index.html` から到達不能なファイル
- **DOM-GAP** — JS の `getElementById`/`requireEl` が使う id が `index.html` に無い

依存なし・読み取り専用・破壊的操作なし。終了コード 0=クリーン / 1=BROKEN か DOM-GAP あり（DEAD は警告扱いで終了コードに影響しない）。

**構造を変えたら必ず実行してグリーンを確認すること。** 意図的に残すデッドファイル（classic フォールバック等）はスクリプト内の `DEAD_ALLOWLIST` に登録する。
