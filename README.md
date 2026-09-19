# 喵喵卡丁車 Meow Kart

跑跑卡丁車風格的 3D 賽車遊戲，Three.js + Vite。角色模型由 Hyper3D (Rodin) 生成。

## 執行

```bash
npm install      # 同時會把 three 的 Draco 解碼器複製到 public/draco/
npm run dev      # http://localhost:5173
npm run build    # 輸出到 dist/
```

模型是用 Draco 壓縮的，載入時需要解碼器。它屬於 three 套件裡的第三方檔案，
不進版控，改由 `postinstall`（`tools/copy-draco.mjs`）在安裝後自動複製。
所以**一定要先 `npm install`**，直接開 `index.html` 是不會動的。

## 操作

| 動作 | 鍵盤 | 手把 |
|---|---|---|
| 加速 | `↑` / `W` | A / RT |
| 煞車・倒車 | `↓` / `S` | B / LT |
| 轉向 | `←` `→` / `A` `D` | 左類比 |
| 漂移 | `空白鍵` / `Shift` | LB / RB |
| 使用道具 | `E` / `Ctrl` | X / Y |
| 回頭看 | `B` | 右類比按下 |

手機會自動顯示觸控按鈕。

### 跑跑式漂移

按住漂移鍵轉彎開始蓄力，火花會依蓄力量變色：

| 段數 | 蓄力時間 | 火花 | 加速 |
|---|---|---|---|
| 1 | 0.85s | 藍 | 0.9s |
| 2 | 1.95s | 橘 | 1.55s |
| 3 | 3.20s | 紫 | 2.5s |

放開漂移鍵才會噴射。漂移中反打方向可以調整甩尾角度。

**彈射起步**：倒數「1」之後不要按油門，在 `GO!` 後 0.28 秒內按下加速即可獲得起步加速；提早按住就沒有。

## 道具

| 道具 | 效果 |
|---|---|
| 🚀 加速器 | 立即加速 1.8 秒 |
| 🍌 香蕉皮 | 丟在身後，碰到會打滑 |
| 🎯 追蹤飛彈 | 鎖定前一名 |
| 🛡️ 護盾 | 擋下一次攻擊，持續 7 秒 |
| 💧 水球 | 砸中第一名，壓扁減速 |

名次越後面抽到強力道具的機率越高。

## 角色模型

角色設定在 `src/game/characters.js`，模型放在 `public/models/`：

| 角色 | 檔名 |
|---|---|
| 喵白白 | `public/models/miaobaibai.glb` |
| 喵布布 | `public/models/miaobubu.glb` |
| 鋒兄 | `public/models/fengbro.glb` |
| 小塗 | `public/models/xiaotu.glb` |
| 牙妹 | `public/models/yamei.glb` |
| 魚妹 | `public/models/yumei.glb` |
| 咕咕嘎嘎 | `public/models/gugugaga.glb` |
| 鯨魚娘 | `public/models/jingyuniang.glb` |

**檔案不存在時會自動退回程序化佔位角色**（選角卡片右上角顯示「佔位」標籤），
所以模型還沒生好也能正常遊玩。只有幾何、沒有貼圖的模型會標「無貼圖」，
並暫時染上該角色的配色，避免八個角色都是同一坨灰。

模型會自動置中、腳底貼齊、縮放到 2.2 公尺高，不必手動對齊尺度。

### 匯入 Rodin 下載的壓縮檔

Hyper3D 下載下來是一個 zip，裡面有兩個版本：

| 檔案 | 用途 |
|---|---|
| `base_basic_pbr.glb` | **要這個** —— 完整 PBR，吃場景光照 |
| `base_basic_shaded.glb` | 光影烤進貼圖裡，車子轉向時陰影不會變，不要用 |

不用手動解壓。**把 zip 改名成角色 id 或中文名**（例如 `gugugaga.zip` 或 `咕咕嘎嘎.zip`），
丟進專案根目錄的 `incoming/`，然後：

```bash
npm run import
```

腳本會自動挑出 PBR 版本、改成正確檔名放進 `public/models/`，
並把 zip 移到專案外的 `../Hyper3DGame-assets/rodin-zips/`
（留在 `public/` 裡的話會被原封不動打包進 `dist/`）。

不帶任何檔案直接執行也可以，會列出八個角色目前的狀態。

### 壓縮

Rodin 的原始輸出每個約 8~14 MB，裡面是三張 2048² 的**無損 PNG**。八個角色近 90 MB，
網頁載入與 GPU 貼圖記憶體都撐不住。匯入後跑：

```bash
npm run optimize
```

貼圖縮到 1024² 轉 WebP、幾何用 Draco 壓縮、清掉重複資料。實測結果：

```
fengbro         10.66 MB →   0.38 MB   −96%
gugugaga        10.37 MB →   0.31 MB   −97%
jingyuniang     11.38 MB →   0.44 MB   −96%
miaobaibai      13.60 MB →   0.54 MB   −96%
miaobubu        14.30 MB →   0.54 MB   −96%
xiaotu          11.43 MB →   0.41 MB   −96%
yamei            8.06 MB →   0.32 MB   −96%
yumei            8.27 MB →   0.30 MB   −96%
───────────────────────────────────────────
合計             88.06 MB →   3.23 MB   −96%
```

面數完全沒動（Draco 是無損的幾何壓縮），畫質損失來自貼圖，在遊戲鏡頭距離下看不出來。

原始檔會先備份到專案外的 `../Hyper3DGame-assets/models-original/`，
**之後每次都從備份重新壓**，所以重複執行不會累積劣化。
覺得畫質不夠，改 `tools/optimize-models.mjs` 頂端的 `TEXTURE_SIZE` /
`QUALITY_COLOR` / `QUALITY_DATA` 再跑一次即可。

載入端不需要任何設定：Draco 解碼器由 `npm install` 的 postinstall 複製到
`public/draco/`（離線可用），WebP 貼圖（`EXT_texture_webp`）three.js 原生支援。

### 調整坐姿（遊戲中按 P）

Rodin 輸出的是**站姿**模型，我們把它往下沉、腿藏進車殼裡假裝在坐。
塞多深、面向哪邊沒辦法用算的決定，得看畫面。比賽中按 `P` 進入座位調整模式：

| 鍵 | 功能 |
|---|---|
| `W` `S` | 前後 |
| `A` `D` | 左右 |
| `R` `F` | 上下 |
| `Q` `E` | 旋轉 |
| `Z` `X` | 縮放 |
| 方向鍵 | 環繞鏡頭（檢查朝向） |
| 空白鍵 | 轉 180° |
| `0` | 回到預設值 |
| `C` | 把數值輸出到 Console |
| `P` | 離開 |

調好按 `C`，Console 會印出可直接貼回 `src/game/characters.js` 的程式碼 ——
可以覆蓋 `DEFAULT_SEAT`（套用到全部角色），或加在單一角色的 `seat:` 欄位。

## 座標慣例（改物理前務必先讀）

這是本專案最容易出錯的地方，踩過一次左右顛倒的坑。

車頭是世界 **+Z**（`forward = (sin yaw, 0, cos yaw)`），追尾鏡頭在車後、**同樣朝 +Z 看**。
在這個配置下攝影機的右軸是：

```
zAxis = normalize(eye - target) ≈ (0, 0, -1)
xAxis = cross(up, zAxis) = (0,1,0) × (0,0,-1) = (-1, 0, 0)
```

也就是 **螢幕右方 = 世界 −X**。而 yaw 增加會讓車頭從 +Z 轉向 +X，那是螢幕的**左**邊。

所以程式裡的規則是：

- `yawRate` 一律以「**向左為正**」計算，最後 `this.yaw -= yawRate * … * dt`
- `ctrl.steer` 的 **+1 = 向右**
- `_right` 這個向量實際指向世界 +X，也就是**車身左側**（名字是歷史遺留，註解有標）
- 任何把世界座標投影到畫面的地方（小地圖）都要記得 +X 在左、+Z 在上

改過轉向、漂移或 AI 之後跑：

```bash
npm run check
```

它用一段筆直賽道的樁件在 Node 裡直接跑物理，驗證按右鍵真的往螢幕右走、
向右漂移的側滑方向正確、AI 朝左側目標會給負的 steer。不需要瀏覽器。

## 資產品質檢查

Rodin 的生成偶爾會出錯，而且**用肉眼掃過去不一定看得出來**。這個專案踩過的兩個坑：

### 1. 對稱選項會毀掉模型

生成時的「對稱」會把左半邊鏡像到右半邊。參考圖裡人物的頭只要稍微偏一點，
鏡像平面就切不到頭中央 —— 結果是**兩顆頭**。實際發生過（小塗第一版）。

較輕微的症狀是姿勢被改掉：牙妹原圖是一手揮手、一手插腰，鏡像後變成兩手都揮，
原本只戴在右腕的手鍊也變成兩隻手都有。

**生成時一律關閉對稱。** 這批角色多數是不對稱姿勢（舉掌、揮手、鯨魚尾巴），
對稱的代價遠大於它帶來的好處。

驗證方式是量網格的鏡像吻合率 —— 對每個頂點檢查鏡射位置上有沒有對應頂點。
被鏡像處理過的模型會是 **100.0%**，自然生成的落在 3~21%。

本專案有三個角色（小塗、牙妹、魚妹）第一版誤開了對稱，已全部重生。目前狀態：

```
miaobaibai   3.2%     yamei         9.6%
miaobubu     3.1%     yumei        20.6%
fengbro     11.1%     gugugaga      5.1%
xiaotu       8.7%     jingyuniang   6.7%
```

重生前小塗／牙妹／魚妹三個都是 100.0%。舊檔保留在
`../Hyper3DGame-assets/models-original/` 底下，副檔名為 `.bak`。

### 2. 幾何啟發法不可靠，要用眼睛看

判斷模型朝向時試過「腳趾往前伸」這類幾何假設 —— **失敗了**。
喵布布的尾巴、喵白白的連帽、咕咕嘎嘎的企鵝體型全都破壞假設，八個裡有四個頭腳指向相反。

可靠的做法是匯進 Blender 從正視圖看。Blender 的 −Y 對應 glTF 的 +Z，
所以正視圖看到的就是模型的 +Z 面。實測八個都面向 +Z，和卡丁車前進方向一致，
因此 `DEFAULT_SEAT.rotY = 0`。

## 架構

```
src/
  main.js              開機流程、選角畫面、主迴圈
  core/
    scene.js           renderer / 燈光 / 天空 / 跟隨鏡頭
    loader.js          GLB 載入、尺度正規化、佔位角色
    input.js           鍵盤 / 觸控 / 手把
    audio.js           WebAudio 引擎聲與音效（無音檔）
  game/
    characters.js      角色名冊與數值
    track.js           樣條賽道、程序化貼圖、起跑格、佈點
    kart.js            卡丁車物理、漂移蓄力、車體外觀
    ai.js              AI 駕駛（走內線、過彎減速、漂移、用道具）
    items.js           道具箱、香蕉、飛彈、水球、加速板
    race.js            賽事流程、倒數、名次、碰撞、完賽
  ui/
    hud.js             圈數 / 名次 / 速度表 / 蓄力條 / 道具格
    minimap.js         小地圖
    seatTuner.js       遊戲中按 P 的坐姿調整工具
tools/
  import-models.mjs    Rodin zip → public/models（自解 ZIP，無外部相依）
  optimize-models.mjs  貼圖轉 WebP + Draco 幾何壓縮
  steering-check.mjs   轉向方向的無頭回歸測試
  copy-draco.mjs       postinstall：複製 Draco 解碼器
```

賽道是封閉的 Catmull-Rom 樣條。所有位置相關的判斷（貼地、撞牆、圈數、名次、
AI 路線、小地圖）都靠把車的位置投影回中心線來算，所以不需要真正的碰撞引擎。
