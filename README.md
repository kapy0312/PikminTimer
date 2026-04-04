```markdown
**[Target File]:** `README.md`
**[Location]:** 全檔覆蓋 (Entire File)

# 🌱 Pikmin Timer (皮克敏輔助計時器)

專為《Pikmin Bloom》玩家設計的純前端、零伺服器成本輔助計時與地標管理工具。透過在地算力與 Google 生態系整合，提供高響應、跨平台的倒數追蹤方案。

## 🏗 架構設計 (Architecture)

本專案採用 **Serverless 混合架構**，前端負責運算與狀態維持，後端依賴 Google 基礎設施處理持久化配方資料。

### 技術堆疊 (Tech Stack)

| 領域 | 技術/框架 | 說明 |
| :--- | :--- | :--- |
| **前端框架** | React 19 + TypeScript + Vite | 強型別開發，提供極速 HMR 與高度模組化的元件結構。 |
| **UI 系統** | Tailwind CSS | Utility-first 樣式，實作 Glassmorphism (玻璃擬物化) 與 RWD 響應式佈局。 |
| **地圖整合** | Leaflet.js + OpenStreetMap | 規避 Google Maps API 收費牆，開源圖資完美滿足座標點擊與標記需求。 |
| **狀態持久化**| LocalStorage API | 本機儲存倒數項目 (`items`) 與冷卻設定 (`settings`)，確保重整不遺失。 |
| **音訊引擎** | Web Audio API | 原生振盪器 (`OscillatorNode`) 合成提示音，無須外部音檔，節省頻寬。 |
| **雲端資料庫**| Google Apps Script (GAS) + Sheets | 充當 RESTful API 與 NoSQL Database，實作多使用者配方表 (Recipes) 的 CRUD。 |

---

## ✨ 核心功能 (Features)

* **雙重座標輸入**：支援點擊地圖自動載入經緯度，或手動精確輸入。
* **動態倒數計算**：依據「香菇」或「巨大的花」預設冷卻時間，自動推算總倒數目標。
* **視覺與音效警示**：
    * 🟢 一般倒數：綠色指示。
    * 🔵 進入冷卻：藍色指示，觸發 5 秒輕快提示音。
    * 🔴 時間到：紅色脈衝邊框，觸發 20 秒警報音，隨後自動銷毀資料。
* **多使用者配方系統**：透過 GAS 動態建立/切換使用者的專屬 Sheet，一鍵儲存與載入常用地標。
* **單手友善 RWD**：針對行動裝置優化，採用 `100dvh` 與自適應彈性盒模型 (Flexbox)，避免虛擬鍵盤與導航列遮擋。

---

## 🚀 本地開發與部署 (Development & Deployment)

### 環境要求

* Node.js 18+ (建議 LTS 版本)

### 安裝與運行

```bash
# 安裝依賴套件
npm install

# 啟動本地開發伺服器 (包含 HMR)
npm run dev
```

### 靜態打包

```bash
# 編譯 TypeScript 並打包最佳化靜態檔案
npm run build
```

執行完畢後，將 `dist` 資料夾內容部署至 GitHub Pages, Vercel 或 Netlify 即可無伺服器運行。

## 🗄️ 後端 API 部署指南 (Google Apps Script)

1. 建立新的 Google 試算表。
2. 開啟 **擴充功能** -> **Apps Script**。
3. 將以下程式碼覆蓋至編輯器中：(參閱專案歷史紀錄或根目錄下的 `gas_backend.js`)
4. 點擊右上角 **部署 (Deploy)** -> **新增部署作業 (New deployment)**。
5. 設定類型為 **網頁應用程式 (Web App)**。
6. 執行身分設為 **「我 (Me)」**，存取權限設為 **「所有人 (Anyone)」**。
7. 複製取得的 Web App URL。
8. 於前端專案 `src/App.tsx` 中替換 `GAS_URL` 常數：

```typescript
const GAS_URL = "YOUR_WEB_APP_URL_HERE";
```