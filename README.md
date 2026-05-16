# 🌱 Pikmin Timer (皮克敏輔助計時器)

專為《Pikmin Bloom》玩家設計的純前端、零伺服器成本輔助計時與地標管理工具。透過在地算力與 Google 生態系整合，提供高響應、跨平台的倒數追蹤方案。

---

## 🏗 架構設計 (Architecture)

本專案採用 **Serverless 混合架構**，前端負責運算與狀態維持，後端依賴 Google 基礎設施處理持久化配方資料。

### 技術堆疊 (Tech Stack)

| 領域 | 技術/框架 | 說明 |
| :--- | :--- | :--- |
| **前端框架** | React 19 + TypeScript + Vite | 強型別開發，提供極速 HMR 與高度模組化的元件結構。 |
| **UI 系統** | Tailwind CSS | Utility-first 樣式，實作 Glassmorphism (玻璃擬物化) 與 RWD 響應式佈局。 |
| **地圖整合** | Leaflet.js + OpenStreetMap | 規避 Google Maps API 收費牆，開源圖資完美滿足座標點擊與標記需求。 |
| **狀態持久化** | LocalStorage API | 本機儲存倒數項目 (`pikminItems`) 與冷卻設定 (`pikminSettings`)，確保重整不遺失。 |
| **計時引擎** | Web Worker | 獨立執行緒計時，完全不受瀏覽器後台節流 (Background Throttling) 影響，確保切換分頁或使用其他程式時音效仍準時觸發。 |
| **音訊引擎** | Web Audio API + HTMLAudioElement | 藍色警示使用原生振盪器 (`OscillatorNode`) 合成提示音；紅色時間到警報使用預載 MP3 (`TimeUp.mp3`) 實現更強烈的警示效果。 |
| **背景音樂** | HTMLAudioElement | 全域預載 BGM (`BGM.mp3`)，首次使用者互動後自動播放，音量可調。 |
| **雲端資料庫** | Google Apps Script (GAS) + Google Sheets | 充當 RESTful API 與資料庫，實作多使用者配方表 (Recipes) 的 CRUD，支援 Upsert（同名覆蓋）操作。 |

---

## ✨ 核心功能 (Features)

### 倒數計時
- **雙重座標輸入**：點擊地圖自動帶入經緯度，或手動輸入座標字串。
- **雙階段倒數計算**：輸入「剩餘時間（分/秒）」後，程式自動疊加對應的冷卻時間，計算出最終目標時間戳。
- **三階段視覺狀態**：
  - 🟢 **一般倒數中**：綠色卡片，正常倒數。
  - 🔵 **進入冷卻期**：藍色卡片，觸發 5 秒電子提示音。
  - 🔴 **時間到**：紅色脈衝卡片，觸發 20 秒 MP3 警報音，時間結束後自動刪除該項目。

### 地圖互動
- 點擊地圖空白處：自動帶入座標至表單。
- 點擊地圖標記 / 點擊清單卡片：地圖平滑飛行至該點位並高亮選取（紫色光暈）。
- 新增項目後：地圖自動飛行至新座標（縮放層級 16）。

### 多使用者配方系統
- 從下拉選單選擇使用者（對應 Google Sheets 中的獨立 Sheet）。
- 從配方列表一鍵載入常用地標（名稱、類型、座標自動填入表單）。
- 儲存配方時以名稱為 Key 執行 Upsert（同名自動覆蓋，不重複新增）。
- 可於設定頁面新增使用者（自動建立對應 Sheet 並初始化標題列）。

### 行動裝置支援
- 採用 `100dvh` 避免虛擬鍵盤與導航列遮擋。
- 可選開啟行動裝置自動下載 `.ics` 行事曆提醒（預設關閉，由 `ENABLE_MOBILE_CALENDAR_SYNC` 控制）。

---

## 📁 專案結構 (Project Structure)

```
src/
├── App.tsx              # 主應用程式元件
├── timerWorker.ts       # Web Worker：獨立執行緒計時器，每秒發送 TICK 訊號
└── assets/
    ├── TimeUp.mp3       # 紅色警報音效
    └── BGM.mp3          # 背景音樂
```

---

## ⚙️ 可設定參數 (Configuration)

在 `src/App.tsx` 頂部可調整以下常數：

| 常數 | 預設值 | 說明 |
| :--- | :--- | :--- |
| `GAS_URL` | `"https://..."` | Google Apps Script Web App 的部署網址 |
| `ENABLE_DELETE_USER` | `false` | 是否在設定頁面顯示刪除配方表按鈕 |
| `ENABLE_MOBILE_CALENDAR_SYNC` | `false` | 行動裝置新增倒數後是否自動下載 `.ics` 行事曆檔案 |

冷卻時間預設值可於應用程式右上角 ⚙️ 設定中調整：

| 類型 | 預設值 |
| :--- | :--- |
| 🍄 香菇冷卻 | 270 秒（4 分 30 秒） |
| 🌸 巨大的花冷卻 | 3330 秒（55 分 30 秒） |

---

## 🚀 本地開發與部署 (Development & Deployment)

### 環境要求

- Node.js 18+（建議 LTS 版本）

### 安裝與運行

```bash
# 安裝依賴套件
npm install

# 啟動本地開發伺服器 (含 HMR)
npm run dev
```

### 靜態打包

```bash
# 編譯 TypeScript 並打包最佳化靜態檔案
npm run build
```

執行完畢後，將 `dist` 資料夾內容部署至 GitHub Pages、Vercel 或 Netlify 即可無伺服器運行。Vite 打包會自動對輸出檔名加入 Hash，無需手動處理快取問題。

---

## 🗄️ 後端 API 部署指南 (Google Apps Script)

### 部署步驟

1. 建立新的 Google 試算表。
2. 開啟 **擴充功能** → **Apps Script**。
3. 將 `gas_backend.js` 的內容貼入編輯器並儲存。
4. 點擊右上角 **部署 (Deploy)** → **新增部署作業 (New deployment)**。
5. 設定類型為 **網頁應用程式 (Web App)**。
6. 執行身分設為 **「我 (Me)」**，存取權限設為 **「所有人 (Anyone)」**。
7. 複製取得的 Web App URL。
8. 於 `src/App.tsx` 中替換 `GAS_URL` 常數：

```typescript
const GAS_URL = "YOUR_WEB_APP_URL_HERE";
```

### API 端點說明

| 方法 | Action | 說明 |
| :--- | :--- | :--- |
| GET | `getSheets` | 取得所有 Sheet（使用者）名稱列表 |
| GET | `getRecipes` | 取得指定 Sheet 的所有配方 |
| POST | `createSheet` | 建立新的使用者 Sheet，並初始化標題列 |
| POST | `deleteSheet` | 刪除指定 Sheet（至少保留一張） |
| POST | `saveRecipe` | 儲存配方，同名自動覆蓋（Upsert） |