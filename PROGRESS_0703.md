# 倉儲系統開發進度 2026-07-03

---

## 現在是什麼系統

原本是 Google Apps Script（GAS），已改寫成 **Node.js + Express**，部署在 cPanel。

前端 UI 一模一樣，只改了底層 `gas()` 函數換成 `fetch()` 打 REST API。

---

## 換電腦接手步驟

```bash
# 1. 拉程式碼
git clone https://github.com/titankou2002/warehouse.git
cd warehouse
git checkout rewrite/nodejs
npm install

# 2. 建 .env（根目錄，和 package.json 同層）
# 內容：
SHEET_ID=1QR6xLZrdSUzhkCNwBhE5EUYpdv8GqkESfj3ELzNf59s
PORT=3000

# 3. 放 service-account.json（根目錄）
cp ~/Downloads/bigt-ai-test-make-f03556cfec17.json ./service-account.json

# 4. 啟動
npm start
# 開瀏覽器 http://localhost:3000
```

> `.env` 和 `service-account.json` 不在 GitHub 上，每台電腦都要手動放。

---

## 專案檔案結構

```
warehouse/
├── server/
│   ├── app.js                  # Express 入口
│   ├── sheets/
│   │   ├── client.js           # Google Sheets API 連線
│   │   ├── reader.js           # 讀格子值+顏色+粗體
│   │   └── writer.js           # 寫回值和格式
│   ├── utils/
│   │   ├── colorUtils.js       # hex → 顏色名稱
│   │   └── gridUtils.js        # 找庫位欄、找排列範圍（支援第一排/第1排）
│   ├── services/
│   │   ├── depthSection.js     # 讀一個排段（白色/彩色兩種格式）
│   │   ├── depthWriter.js      # 寫回棧板+畫外框
│   │   ├── moveService.js      # 移動棧板，有 mutex 鎖
│   │   └── zoneViewService.js  # 產生前端用的 ZoneView 資料結構
│   └── routes/
│       ├── inventory.js        # GET /api/inventory
│       ├── move.js             # POST /api/move, /api/move/group
│       ├── undo.js             # POST /api/undo, /api/undo/redo
│       ├── zones.js            # GET /api/zones
│       └── dispatch.js         # POST /api/dispatch（橋接 GAS 舊方法名稱）
├── client/
│   └── index.html              # 前端（HTML+CSS+JS 合併，gas()→fetch()）
├── .env                        # 不在 GitHub，手動放
├── service-account.json        # 不在 GitHub，手動放
└── .github/workflows/deploy.yml # push main → 自動 FTP 到 cPanel
```

---

## 部署到 cPanel（自動）

```bash
# 開發在 rewrite/nodejs 分支
git add .
git commit -m "說明"
git push origin rewrite/nodejs

# 確認沒問題後合併到 main 觸發部署
git checkout main
git merge rewrite/nodejs
git push origin main
# → GitHub Actions 自動 FTP 上傳到 cPanel
```

部署進度：https://github.com/titankou2002/warehouse/actions

---

## GitHub Secrets（已設定好，不用動）

| Secret | 說明 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT` | service-account.json 的 JSON 內容 |
| `SHEET_ID` | 試算表 ID（目前假庫位表） |
| `FTP_HOST` | elitile.tw |
| `FTP_USER` | elitiletw |
| `FTP_PASSWORD` | 已設定 |
| `FTP_TARGET_DIR` | cPanel 目標目錄 |

管理：https://github.com/titankou2002/warehouse/settings/secrets/actions

---

## 試算表格式說明（重要）

### 棧板背景色

| 顏色 | 意義 |
|---|---|
| ⬜ 白底 | 完整板：單一料號，原廠未拆 |
| 🔴 紅底 + 單一料號 | 散板：已被拆箱過的剩餘量 |
| 🔴 紅底 + 多料號 | 混合板：多種料號放在同一個物理棧板 |
| 🟡 黃底 | 同紅底，語義完全相同，交替用來肉眼區分相鄰棧板 |
| 🟢 綠底 | 專案庫存 |

### 數量字色

| 字色 | 意義 |
|---|---|
| 黑字 | 正常庫存數量 |
| 藍字 | 此板為最後一板 |
| 紅字 | 已回報庫存數量 |
| 綠字 | 待重點數量 |
| 黃字 | 系統無庫存 |
| 紫字 / 黑字紫底 | 系統無庫存 |

### 物理棧板規則

- 每個棧板佔 **2 列**：第1列 = 料號+箱數 / 第2列 = 批號+片數
- **粗體 SKU** = 新物理棧板的開始
- 同一個物理棧板所有料號用同一個**外框**圍起來（PalletGroupId 相同）
- **物理棧板是最小移動單位，整框一起動，不可拆分**

---

## 開發計畫

### 第一階段（現在）：功能確認
- [ ] 前端畫面正常顯示
- [ ] 移動功能正確（整框一起動，不分裂不消失）
- [ ] 散板、混合板都測到
- [ ] 把今天修改 commit 推上 GitHub

### 第二階段：切換正式表
- 把服務帳號加進正式試算表共用
  - Email：`warehouse@bigt-ai-test-make.iam.gserviceaccount.com`
  - 權限：編輯者
- 把 `.env` 和 GitHub Secret 的 `SHEET_ID` 換成正式表 ID
- push main 觸發部署

### 第三階段：MySQL 遷移
- Google Sheets 只是暫時替代品，功能穩定後搬進 MySQL
- cPanel 主機已有 MySQL，不用額外費用
- 搬完後系統完全獨立，不依賴 Google

---

## 今天確認正常的事

- Google Sheets API 連線成功 ✅
- 讀取 A-A區：38 個庫位，9 排，棧板資料完整 ✅
- 修正 Bug：試算表用「第一排」（中文數字），程式原本找「第1排」找不到，現已兩種都支援 ✅
- `npm start` 啟動正常 ✅

## 還沒測試的

- 前端畫面顯示是否正常
- 移動功能實際寫回試算表
- `updateWarehousePallet`（編輯棧板）尚未實作
