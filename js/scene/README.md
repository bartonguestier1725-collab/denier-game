# js/scene/ — 3D ビュー

Three.js による WebGL フルシーン。`game-state.js` のイベントを購読してカードテーブルを描く。
**ここを触る前にこのファイルの「不変条件」を必ず読むこと。** 座標系やテクスチャの向きには暗黙の約束があり、破ると見た目が静かに壊れる（クラッシュしないので気づきにくい）。

親ドキュメント: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## モジュールと依存順

読む順・初期化順（上が下に依存される土台）:

```
anim.js        tween/easing/damp。依存なし。全アニメの土台
materials.js   canvas テクスチャベイカー + マテリアル。constants.js に依存
cards.js       カードエンティティ。materials + anim に依存
table.js       写真平面。単独
lights.js      照明 + 燭台 + 炎。単独
camera-rig.js  カメラ制御。anim に依存
input.js       ポインタ/キー。単独（three のみ）
particles.js   金粉 + バースト。単独
engine.js      renderer/ポスト/ティア/ループ。anim + three addons に依存
view3d.js      ★オーケストレータ。上記全部 + game-state を束ねる
```

`main.js` は `view3d.js` だけを動的 import。`view3d.js` が残りを静的 import する。

---

## 不変条件（破ると壊れる約束）

### 1. カードの座標系と姿勢
- **ワールド単位 = cm**（`CARD_W=5.8, CARD_H=8.9` = ブリッジサイズ）。Y が上、テーブルは Y=0 平面。
- カードメッシュは `flipper`（THREE.Group）の子。**静止姿勢は `mesh.rotation.x = +90°`**（表面が下＝伏せ）。
- **フリップは `flipper.rotation.x` を 0 → -π** に回す（手前の辺が持ち上がる）。`faceUp` はこの状態。
- カードごとの微傾き `jitter`（±1.5°）は `flipper.rotation.z`。手配り感。

### 2. テクスチャの向き（materials.js ↔ cards.js の暗黙契約）
- **フロント canvas は正立で描く** → 表面は静止姿勢で下向き、フリップ（-π）後にカメラへ正立して見える。
- **裏面 canvas は垂直反転で描く**（`ctx.translate(0,H); ctx.scale(1,-1)`）→ 伏せ状態（rotX(90) + テクスチャ flipY）で正しく読める。
  - 「180° 回転」ではない。**垂直反転**。ここを間違えると裏面の文様が上下逆になる。
- マスク系（`bakeBackMask` 等）は `bakeBackTexture` と**同一の変換**をかけること。ズレると metalness/emissive が本体とずれる。

### 3. ジオメトリのマテリアルグループ（cards.js `buildCardGeometry`）
- 全カードで**共有 1 ジオメトリ**。`ExtrudeGeometry` は両キャップを material 0、側壁を material 1 にする。
- これを法線 z 符号で **front(0)/edge(1)/back(2)** に再分割し、**キャップ UV を shape の bbox で正規化**している（Extrude は UV を shape 座標のまま残すため）。
- メッシュのマテリアル配列は `[front, edge, back]` の順（`getFrontMaterial`, `getEdgeMaterial`, `getBackMaterial`）。

### 4. アニメーションのタイミング（engine.js のループ）
- **tween は実時間で tick する**（`tickTweens(Math.min(rawDt, 1))`）。シーン更新用 dt は 0.1 にクランプするが、**tween を同じ 0.1 でクランプしてはいけない**。
  - 理由: 低 fps（3fps 等）で dt をクランプすると tween が 1/3 速度になり、ディールが完了せず `inputLocked` が永久に解除されない。過去に踏んだ。
- ディール完了で `inputLocked` を解く。**フェイルセーフ**として `view3d.js` が時間ベースのタイマーでも解除する（tween 停止に備える保険）。二重解除は無害。

### 5. 照明と ACES
- **蝋燭の蝋は unlit（MeshBasicMaterial）**。自分の PointLight の数 cm 隣にある lit マテリアルは ACES + Bloom で白い四角に飛ぶ。lights.js の `waxMat` を lit に戻さないこと。
- **影付きライトを追加しない**。接地はブロブ影（cards.js の各エンティティの `blob`）が担う。全ティア一貫の見た目を保つアートディレクション判断。

### 6. レイキャスト
- **アニメ中のカードメッシュを直接レイキャストしない**。各スロットに不可視のプロキシ平面（cards.js `proxies`）を置き、そこへ当てる。`input.js` は `getTargets()` = プロキシ配列のみ見る。
- プロキシは `userData.cardId` / `userData.slotIndex` を持つ。

### 7. 共有フリッカー（一体感の要）
- lights.js の `getFlicker()` が返す 1 つの値を view3d.js のフレームループが分配: 照明強度・炎スケール・光プール opacity・table.setFlicker（写真明度）・`--flicker` CSS 変数（HUD の暖色）。
- 新しい燭光連動を足すならこの 1 値に繋ぐ。独立に揺らすと位相がずれて安っぽくなる。

### 8. 公平性（ゲーム性を壊さない制約）
- カード表面のデニール判定要素（生地の濃さ・数字）は**角度非依存にベイク**。スペキュラ/クリアコートは装飾層（金縁・箔）だけに乗せる。
- 生地の織り目は**全デニール共通シード**（materials.js `seededRandom(1337)`）。模様の違いがマッチの手がかりになってはいけない。差は「濃さ」だけ。
- 透け感カーブ: `denierAlpha(d) = 1 - exp(-d/45)`（0d=透明〜110d=ほぼ不透明）。

---

## 品質ティア

`engine.detectTier()` が返す `{ name, maxDPR, texScale, anisotropy, post }` を各モジュールが受ける。

| | desktop | mobile |
|---|---|---|
| DPR 上限 | 2 | 1.5 |
| テクスチャ倍率 | 1.0 | 0.5 |
| 裏面マテリアル | MeshPhysical（clearcoat） | MeshStandard |
| ポスト処理 | HDR コンポーザー全部 | バイパス |

FPS watchdog（engine.js）が 42fps を割ると **DPR → Bloom off → post off** の順で自動降格。

---

## 演出カタログ（どのイベントで何が起きるか）

view3d.js のイベントハンドラが起点:

| きっかけ | 演出 | 実装 |
|---|---|---|
| SCREEN_CHANGE(playing) | テクスチャベイク→配置→スタッガードディール（弧+着地スカッシュ） | view3d.startBoard, cards.dealAll |
| CARD_FLIP | オーバーシュートのスプリングフリップ + 持ち上がり | cards.flipUp |
| CARD_MATCH | 金バースト + 衝撃波リング + カメラシェイク → ペアが獲得パイルへ弧滑空 | cards.flyMatchedToPile, particles.burst, cards.shockwave, rig.shake |
| CARD_MISMATCH | 赤アラートリング + 横シェイク | cards.flashMismatch, cards.shake |
| CARD_UNFLIP | 裏返し | cards.flipDown |
| GAME_COMPLETE | カメラプルバック + 金吹雪 6 連 + パイル跳ねカスケード | rig.pullback, particles.burst, cards.celebratePile |
| ホバー（fine pointer） | 浮上 + グリントスイープ | cards.setHover |
| 一覧表を初めて開く | テーブルに 3D モノクルが落下 | view3d 'denier:chart-shown' リスナー |
| キーボード矢印/Enter | 金フォーカスリング移動 / フリップ | input.onKey, cards.focusSlot |

`prefers-reduced-motion` 時は全モジュールが即時配置・演出停止に分岐する（各メソッドの `reduced` 引数）。

---

## デバッグ

`?debug` で `window.__denier3d = { engine, gameState, cards, rig, lights, inputLocked }` が露出。
`?debug` は FPS/DPR/post 状態も左上に表示。E2E は Playwright + SwiftShader（`--use-angle=swiftshader --enable-unsafe-swiftshader`）。
