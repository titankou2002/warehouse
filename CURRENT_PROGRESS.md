# 🚚 鈦傳速智慧倉儲管理系統：開發進度與狀態交接報告 (2026-06-06)

本文件旨在為下一個接手的 AI 助理提供完整的專案現狀、架構說明、已完成工作以及當前待排查的問題，以便無縫銜接開發。

---

## ✅ 2026-06-22 更新：正式倉庫 / 假倉庫可切換

- 程式已加入 Spreadsheet ID 切換機制，預設仍讀正式倉庫。
- 假表 ID：`1QR6xLZrdSUzhkCNwBhE5EUYpdv8GqkESfj3ELzNf59s`
- 可直接在 Apps Script 執行：
  - `useFakeWarehouseSpreadsheet()` 切到假表
  - `useMainWarehouseSpreadsheet()` 切回正式倉庫
- 這份假表與正式倉庫同構，含 `A-C區`、`B-G區`、`測試區`，適合作為安全測試來源。

## 🔗 線上部署資訊
*   **Google Apps Script 線上 Web App 網址** (覆蓋原有部署，網址保持不變)：
    👉 **[鈦傳速智慧倉儲管理系統](https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec)**
*   **目前部署版本**：Version 41（`?grid=1` 測試頁）
*   **自動化編譯與部署指令**：
    在專案根目錄下執行 `python3 deploy.py`（此腳本會自動呼叫 `build_gas.py` 編譯 `index_gas.html`，隨後使用 `clasp` 進行推播與部署覆蓋）。
*   **Version 18 線上驗證**：
    *   入口頁：`curl -L --max-time 20 .../exec?v=18&nocache=1` 回傳 `HTTP 200`，約 `2.2s`，下載約 `115KB`。
    *   資料端點：`curl -L --max-time 20 .../exec?action=data&v=18&nocache=1` 回傳 `HTTP 200`，約 `3.0s`，共 `2455` 筆、`17` 個區域。
*   **Version 19 線上驗證**：
    *   入口頁：`curl -L --max-time 20 .../exec?v=19&nocache=1` 回傳 `HTTP 200`，約 `2.0s`，下載約 `116KB`。
    *   資料端點：`curl -L --max-time 20 .../exec?action=data&v=19&nocache=1` 回傳 `HTTP 200`，約 `3.3s`，共 `2455` 筆、`17` 個區域。
*   **Version 20 線上驗證**：
    *   正式入口：`curl -L --max-time 20 .../exec?v=20&nocache=1` 回傳 `HTTP 200`，約 `2.3s`，下載約 `120KB`。
    *   診斷頁：`curl -L --max-time 20 .../exec?debug=1&v=20&nocache=1` 回傳 `HTTP 200`，約 `1.7s`，下載約 `6KB`。
    *   單區資料：`curl -L --max-time 20 .../exec?action=data&sheet=B-G區&v=20&nocache=1` 回傳 `HTTP 200`，約 `3.4s`，共 `307` 筆且只含 `B-G區`。
*   **Version 22 線上驗證**：
    *   正式入口：`curl -L --max-time 20 .../exec?v=22&nocache=1` 回傳 `HTTP 200`，約 `2.7s`，下載約 `122KB`。
    *   診斷頁：`curl -L --max-time 20 .../exec?debug=1&v=22&nocache=1` 回傳 `HTTP 200`，約 `1.8s`。
    *   線上 HTML 已確認移除 top-level `edit-modal` / `cross-section-modal` DOM 綁定，保留分段啟動追蹤。

---

## 🛠️ 專案技術架構說明
本系統是由 Google Apps Script (GAS) 託管的單頁應用程式 (SPA)。
1.  **前端網頁 (`index.html`, `index.css`, `app.js`)**：
    *   以現代毛玻璃與微動畫設計的手機版 WMS 介面。
    *   在本地端使用 `python3 -m http.server 8000` 開啟本地測試時，會自動透過 `fetch("./parsed_inventory_enriched.json")` 載入模擬資料。
    *   部署至 GAS 時，會透過 `build_gas.py` 將 CSS 與 JS 合併嵌入至單一 `index_gas.html` 中。
2.  **後端服務 (`程式碼.js`)**：
    *   實作 Google Sheets 即時同步與解析管線：
        *   **主倉庫 (`1G8aCKowpUeb2uvLFPr1q1HB94vwVm6u3sC5BjHvAmfg`)**：解析 `A-C區`、`B-G區`、`花磚` 的儲位、排數與棧板結構，並判斷混板/散板狀態。
        *   **三家分公司價目與庫存表**：高雅瓷、安帝嘉、喜悅納。
        *   後端會自動比對實體批號與官方庫存，計算箱/板、板重，並富化資料，最後寫入/覆寫雲端硬碟的 `parsed_inventory_enriched.json` 快取檔。

---

## 📈 已完成與最佳化功能
1.  **即時同步按鈕 (`🔄`)**：
    *   點擊後前端顯示毛玻璃模糊遮罩與 Spinner 載入動畫。
    *   調用後端 `refreshDatabase()` 自動於 10~20 秒內完成四張試算表解析與富化，更新快取檔並即時重繪網格，無須重整網頁。
2.  **建置期資料快取 (`DataCache.js`)**：
    *   `build_gas.py` 會在本機編譯時讀取 `parsed_inventory_enriched.json`，產生 `DataCache.js` 分段字串快取。
    *   `index_gas.html` 不再內嵌 2MB 以上的大型 JSON，只保留前端與啟動設定，避免 Apps Script iframe 解析大型 inline script 時卡住。
    *   `doGet()` 不再於入口頁同步呼叫 `DriveApp/getEnrichedData()`，避免使用者開頁時被 Google Drive 讀檔延遲或權限流程卡住。
3.  **全域 try-catch 與動態補救載入**：
    *   將前端 `initApp` 包裹在 `try-catch` 中。若發生任何初始化錯誤，會直接在畫面顯示紅色錯誤排查視窗，而非無聲卡死在載入動畫中。
    *   若發現預載資料為空，會先嘗試 `?action=data` HTTP JSON 端點，再 fallback 到 `google.script.run.getEnrichedData()`。
    *   `getEnrichedData()` 目前優先回傳 `DataCache.js` 的內建快取；Drive 讀取只保留作為備援。
    *   `google.script.run` 已加上 15 秒逾時，避免 Google 多帳號登入造成無限轉圈。

---

## ✅ 2026-06-06 修正紀錄：入口頁「連不到 / 一直轉圈」
用戶回報：**網頁在授權完畢後，依然卡在「資料加載中，請稍候...」的轉轉中動畫。**

### 🔍 偵錯分析：
1.  **語法驗證**：已於本機執行 `node -c app.js` 與 `node -c 程式碼.js`，確認語法 100% 無誤，並非 syntax error 導致的執行中斷。
2.  **快取檔驗證**：快取檔 `parsed_inventory_enriched.json` 已存在且格式為 100% 合法的 JSON 陣列。
3.  **確認根因**：
    *   Version 16 仍在 `doGet()` 入口頁同步執行 `getEnrichedData()`，也就是開頁前先透過 `DriveApp.getFilesByName("parsed_inventory_enriched.json")` 讀取大型 JSON。
    *   使用 `curl` 讀取 `/exec?v=16&nocache=1` 超過 20 秒仍無任何回應，代表卡點在入口 HTML 回傳前，不是前端渲染後才卡住。
4.  **已修正**：
    *   `build_gas.py` 改為建置時讀取本機 `parsed_inventory_enriched.json`，將資料直接嵌入 `index_gas.html`。
    *   `程式碼.js:doGet()` 移除入口頁的 `getEnrichedData()` 預載呼叫。
    *   `app.js` 新增 `?action=data` 與 `google.script.run` fallback，並加入 15 秒逾時，避免無限 spinner。
    *   已執行 `python3 deploy.py`，部署至既有 Web App ID 的 `@17`。

## ✅ 2026-06-07 修正紀錄：Version 17 仍停在 spinner
用戶截圖回報：**頁面已能開啟，但統計仍為 0，畫面停在「資料加載中，請稍候...」。**

### 🔍 偵錯分析：
1.  Version 17 已解決入口 `doGet()` 卡住，但把完整庫存 JSON 直接嵌入 `index_gas.html`，導致入口 HTML 約 2MB。
2.  在 Apps Script iframe 中，大型 inline JSON 可能讓前端初始化前就失敗或長時間解析，畫面只剩靜態 spinner。

### ✅ 已修正：
1.  `build_gas.py` 改為產生 `DataCache.js`，共 40 個 JSON 字串 chunk。
2.  `.claspignore` 已允許 `DataCache.js` 上傳。
3.  `程式碼.js:getEnrichedData()` 優先回傳 `DataCache.js` 的內建資料，避免初始讀取 Drive。
4.  `index_gas.html` 已縮小到約 `96KB`，不再內嵌完整庫存資料。
5.  已執行 `python3 deploy.py`，部署至既有 Web App ID 的 `@18`。
6.  線上驗證資料端點可回傳 `2455` 筆資料、`17` 個區域。

## ✅ 2026-06-07 修正紀錄：Version 18 仍停在 spinner
用戶回報：**Version 18 仍卡在「資料加載中，請稍候...」，且統計仍為 0。**

### 🔍 偵錯分析：
1.  `@18` 的入口與資料端點都能正常回應，代表不是 `doGet()` 或資料端點卡住。
2.  畫面文字沒有變成「正在由雲端即時載入倉儲資料」，也沒有紅色錯誤框，代表 `initApp()` 很可能沒有被呼叫。
3.  Apps Script 會把使用者 HTML 注入 iframe，主程式執行時 `DOMContentLoaded` 事件可能已經觸發過；原本只寫 `window.addEventListener("DOMContentLoaded", initApp)`，如果註冊太晚就永遠不會初始化。

### ✅ 已修正：
1.  `app.js` 改成先檢查 `document.readyState`：
    *   若仍是 `loading`，才監聽 `DOMContentLoaded`。
    *   若 DOM 已可用，直接呼叫 `initApp()`。
2.  `initApp()` 一開始會把 loading 文字改成「正在啟動前端與讀取倉儲資料...」，方便確認新版 JS 是否真的有執行。
3.  已執行 `python3 deploy.py`，部署至既有 Web App ID 的 `@19`。
4.  線上 HTML 已確認包含 `document.readyState` 修正與啟動文字，且未內嵌大型 JSON。

## ✅ 2026-06-07 修正紀錄：Version 20 診斷頁與分區載入
用戶同意改用「先診斷，再分區載入」的方法，停止盲修 spinner。

### ✅ 已完成：
1.  新增 `?debug=1` 診斷頁：
    *   測 HTML 是否啟動。
    *   測 `document.readyState`。
    *   測 `google.script.run` 是否存在。
    *   測 `getDebugSummary()`、`getInventorySheetList()`、`getInventoryBySheet("B-G區")`。
2.  新增後端分區 API：
    *   `getInventorySheetList()` 回傳分區清單與筆數。
    *   `getInventoryBySheet(sheetName)` 只回傳指定分區資料。
    *   `doGet?action=data&sheet=...` 可直接取單區 JSON。
3.  正式前端改為 GAS 環境分區載入：
    *   開頁先取分區清單。
    *   預設只載入 `B-G區`。
    *   切換分區 chip 時，再取該區資料。
4.  已執行 `python3 deploy.py`，部署至既有 Web App ID 的 `@20`。
5.  線上驗證 `B-G區` 單區資料為 `307` 筆，正式 HTML 不含大型 JSON。

## ✅ 2026-06-07 修正紀錄：Version 22 正式頁 JS 初始化前中斷
用戶提供診斷頁結果：後端、DataCache、`google.script.run`、分區清單、`B-G區` 單區資料全部正常，但正式頁仍停在原始靜態文字「資料加載中，請稍候...」。

### 🔍 偵錯分析：
1.  正式頁未出現 `@21` 新增的任何啟動階段文字，代表 `initApp()` 很可能尚未被呼叫。
2.  `app.js` 底部仍有 top-level DOM 綁定：
    *   `document.getElementById("edit-modal").addEventListener(...)`
    *   `document.getElementById("cross-section-modal").addEventListener(...)`
3.  這些綁定發生在全域錯誤監聽之前；若 GAS iframe 裡元素當下不可取，主程式會在 `initApp()` 前中斷，畫面只會保留靜態 spinner。

### ✅ 已修正：
1.  移除 bottom-level top-level modal DOM 綁定。
2.  將 modal overlay 點擊關閉邏輯移入 `setupEventListeners()`。
3.  `setupEventListeners()` 對主要 DOM 元素改用 null guard，避免任一缺失元素中斷整個初始化。
4.  已執行 `python3 deploy.py`，部署至既有 Web App ID 的 `@22`。

### 📋 接手 AI 的下一步指引：
1.  **引導用戶使用不快取網址進行測試**：
    請點擊帶有隨機參數的 Version 22 強制重載網址：
    👉 `https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?v=22&nocache=1`
    並確保是在**無痕視窗**下開啟。
    若仍卡住，請開診斷頁：
    👉 `https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?debug=1&v=22&nocache=1`
2.  **確認是否有跳出「系統載入失敗」紅框**：
    *   若 Version 22 的全域 try-catch 生效，且程式確實有載入，當發生錯誤時，畫面不應該再顯示「轉轉中」，而是會顯示紅色警示區。
    *   如果**依然顯示轉轉中**，優先檢查是否仍載入舊快取頁面，或瀏覽器 Console 是否有 iframe/container 層級錯誤。
3.  **引導用戶檢查瀏覽器 Console**：
    若可以，請引導用戶在卡住的頁面按下 `F12` 或 `Cmd+Option+I` 開啟主控台 (Console)，查看是否有以下報錯：
    *   `ReferenceError: preloadedData is not defined`（代表載入的依然是舊版 V13）
    *   `Access to fetch at ... from origin ... blocked by CORS`
    *   任何其他的腳本執行報錯。
4.  **在 Apps Script 專案編輯器中測試權限**：
    可請用戶在 Apps Script 編輯器中選擇 `authTest` 函式並點擊執行，確認是否能順利讀取 `parsed_inventory_enriched.json` 且沒有報權限錯誤。

## ✅ 2026-06-07 修正紀錄：Version 23 改用 Lite 正式入口
用戶回報：**Version 22 仍停在原始靜態 spinner「資料加載中，請稍候...」**。同時診斷頁已確認後端與資料 API 正常，代表問題不在資料讀取，而在原正式頁前端初始化鏈路。

### 🔍 判斷：
1.  `?debug=1` 可正常呼叫：
    *   `getDebugSummary()`：`2455` rows / `17` sheets。
    *   `getInventorySheetList()`：`17` sheets。
    *   `getInventoryBySheet("B-G區")`：`307` rows。
2.  正式頁仍停在最原始 spinner，沒有出現後續啟動階段文字，代表原 `index_gas.html/app.js` 仍有初始化前中斷或瀏覽器/Apps Script iframe 快取污染風險。
3.  繼續在原單一大型前端盲修，成本高且驗證慢，因此改成切換入口策略。

### ✅ 已修正：
1.  `doGet()` 預設 `/exec` 改為回傳新的 `buildLiteAppPage_()`。
2.  Lite 正式頁為單一自包含 HTML，不載入舊 `index_gas.html` 與 `app.js`。
3.  Lite 正式頁只呼叫已驗證成功的後端方法：
    *   `getInventorySheetList()`
    *   `getInventoryBySheet(sheetName)`
4.  Lite 正式頁預設載入 `B-G區`，並可切換 17 個分區、搜尋、顯示板數/箱數/片數/區域與品項卡片。
5.  舊完整前端保留在 `?legacy=1`，診斷頁保留在 `?debug=1`，JSON API 保留在 `?action=data`。
6.  已執行 `python3 deploy.py`，部署至既有 Web App ID 的 `@23`。

### ✅ 線上驗證：
1.  正式 Lite 頁：`HTTP 200`，約 `15KB`，內容包含 `2026 Logistics Mobile Lite` 與 `HTML 已啟動`。
2.  診斷頁：`HTTP 200`，約 `6KB`。
3.  `B-G區` JSON API：`HTTP 200`，回傳 `307` 筆。
4.  legacy 舊版：`HTTP 200`，約 `121KB`。

### 🔗 測試網址：
1.  正式 Lite：`https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?v=23&nocache=1`
2.  診斷頁：`https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?debug=1&v=23&nocache=1`
3.  舊完整前端：`https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?legacy=1&v=23&nocache=1`

## ✅ 2026-06-08 修正紀錄：Version 30 倉位系統拆模組並切到剖面視圖
用戶明確要求放棄舊卡片式前端，改成更接近 Excel 倉位理解的 `slot / depth / level` 剖面操作模型，並把單一巨檔拆開。

### ✅ 本次已完成：
1.  Apps Script 專案拆成模組：
    *   `Main.gs`
    *   `WarehouseRead.gs`
    *   `WarehouseParse.gs`
    *   `WarehouseView.gs`
    *   `WarehouseWriteback.gs`
2.  預設 `/exec` 入口改為新頁：
    *   `warehouse_ui.html`
    *   `warehouse_ui_css.html`
    *   `warehouse_ui_js.html`
3.  新頁不再用卡片清單做主體，改成：
    *   區域切換
    *   同區格位總覽
    *   單一格位剖面圖
4.  後端解析正式補上幾何欄位：
    *   `Depth`：第幾排，`1 = 最裡面`
    *   `Level`：第幾層，`1 = 最底層`
5.  保留既有安全底盤：
    *   live sheet 讀取
    *   merged range 展開
    *   DataCache fallback
    *   同板資料更新寫回
6.  `.claspignore` 已更新，讓模組化檔案可以實際部署。
7.  已部署到既有 Web App `@30`。

### 📋 下一步：
1.  把「移除一板 / 指定來源補位 / 自動下沉」做成正式 action API。
2.  讓剖面圖可直接執行搬移，不只更新品號與數量。
3.  規則化處理 `5~7 排常態、8~9 排特例` 的補位限制與提示。

## ✅ 2026-06-08 修正紀錄：Version 34 ~ 41 俯視圖測試頁持續迭代
用戶要求主視圖改成更接近 Excel 的俯視圖，不再以剖面圖做首頁主體；同時強調手機優先、搜尋可直接定位、卡片內要看得到同格全部 item，而不是只顯示一個摘要 pallet。

### ✅ 這一段迭代的核心方向
1.  新增獨立測試入口：
    *   `/exec?grid=1`
    *   不覆蓋原本較穩定的正式頁
2.  主視圖固定為：
    *   上方：`slot / 格位 0, 1, 2, 3...`
    *   左側：`第一排, 第二排, 第三排...`
3.  每個交叉格不再只顯示一個代表 pallet，而是直接列出：
    *   `SKU / 編號`
    *   `Batch / 批號`
    *   同格有幾個 item 就列出幾個 item
4.  剖面圖退回成次視角，點卡片後才展開

### ✅ 已修正的關鍵資料問題
1.  `WarehouseParse.gs` 原本只把有底色的格子當作 pallet，導致白底正常板被漏掉。
2.  這會讓某些 slot（例如用戶指出的 `格 4`）看起來整欄都是空的，但實際 Excel 上並不是如此。
3.  目前已把白底正常板納入解析，俯視圖不再只顯示紅黃綠底 item。

### ✅ 搜尋與高亮邏輯
1.  搜尋框已改成兩個欄位：
    *   `搜尋編號 / SKU`
    *   `搜尋批號 / Batch`
2.  支援三種搜尋方式：
    *   只搜編號
    *   只搜批號
    *   編號 + 批號複合搜尋
3.  搜尋命中效果目前已改為綠色系：
    *   上方命中的區域 chip 會亮起
    *   目前區域內命中的格位卡片會亮起
    *   卡片內命中的那一行也會被框出
4.  搜尋結果卡片區會列出命中的 item 摘要，並嘗試支援點擊後自動切換區域、捲動到對應格位。

### ✅ 詳細資料下探
1.  點格位卡片後，應展開該格詳細資訊。
2.  點 item 後，詳細面板應能帶出 enriched inventory 的欄位，包括：
    *   `BoxQty`
    *   `PieceQty`
    *   `KgPerBox`
    *   `Brand`
    *   `Series`
    *   `ChineseSeries`
    *   `Size`
    *   `PiecesPerBox`
    *   `BoxesPerPallet`
    *   `KgPerPallet`
    *   `HanhwaCode`
    *   `OriginalName`
    *   `Status`
    *   `Branches`

### ⚠️ 目前尚未完全穩定的點
1.  用戶最後仍回報：
    *   `格位卡片不會連動`
2.  雖然 Version `@41` 已補 direct click fallback 與事件委派修正，但 live 頁面仍需再實測確認以下互動是否全部正常：
    *   區域切換
    *   搜尋結果卡片點擊
    *   格位卡片點擊
    *   item 點擊
    *   詳細面板連動
3.  因此 `?grid=1` 目前仍應視為測試頁，不應直接視為完全完成的正式頁。

### 🔗 建議交接與測試入口
1.  測試頁：
    *   `https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?grid=1&v=41&nocache=1`
2.  詳細交接文件：
    *   `CLAUDE_HANDOFF_WAREHOUSE_WMS_V2_2026-06-08.md`

## ✅ 2026-06-11 修正紀錄：寫回底盤與交班整理完成

### ✅ 今天已落地
1.  `WarehouseWriteback.gs` 補齊操作記錄：
    *   新增 `操作記錄` sheet 的自動建立與寫入。
    *   每次更新或群組移動，都會記錄時間、操作者、品號、批號、來源、目的地與備註。
2.  新增移動歷史與還原 / 重做：
    *   已加入 `getMoveHistory()`、`undoLastMove()`、`redoLastMove()`。
    *   群組移動也可以還原與重做，並在操作後回傳 `navigateTo` 供前端跳轉。
3.  寫回流程整理：
    *   `updateWarehousePallet()` 先正規化 payload，再用 lock 保護寫入。
    *   寫回 SKU / Batch / BoxQty / PieceQty 後，會套用狀態色與粗框。
    *   `movePalletGroup()` / `movePallet()` 已可處理白底與彩色兩種深度段格式。
4.  自動補位與排段建立：
    *   目的地不存在時會自動建立新的 depth section。
    *   目標空間不足時會自動插列擴充。
    *   同位置移動會直接在同一排內重排，不會額外複製資料。
5.  解析與前端連動：
    *   `getInventorySheetList()` 會掃 live 試算表，把 cache 沒有的測試分頁也補進來。
    *   `?grid=1` 測試頁現在可以直接看到測試區分頁。
6.  寫回格式選擇：
    *   白底格式依固定 pair 寫回，不再插空行。
    *   彩色格式維持 SKU 粗體作為棧板邊界，並重畫外框。
7.  目前的判斷：
    *   分隔線方案先放棄，回到 `Bold` 標記當作棧板邊界。
    *   試算表結構維持原樣，不額外插入干擾性空白列。

### 📋 接手時建議先看
1.  先在 `?grid=1` 驗證還原 / 重做 / 移動是否都正常。
2.  如果要再往正式入口推進，優先確認 `warehouse_grid_ui_js.html` 的互動與 `WarehouseWriteback.gs` 的寫回邏輯是否完全一致。
3.  若測試區互動都穩了，再決定要不要把 `?grid=1` 升格成正式頁。

## ✅ 2026-06-12 修正紀錄：搬移資料遺失/錯位 + 框線斷裂修復（@97~@101）

### ✅ 今天已落地
1.  **白色棧板消失 bug**（測試區回歸測試發現）：
    *   `getWhiteSlotPairs_` 原本寫死讀取欄位 index `1`，導致非第一個 slot 的白色棧板配對數量算錯，`writeWhiteDepthPallets_` 寫回時漏寫部分棧板。
    *   修正：傳入正確 `prodCol`，並修正 `readDepthSection_` 呼叫處。已部署 @97。
2.  **搬移後「pallet not found...after expansion re-read」+ 真實資料疑似遺失 bug**（B-G區 RR12012/GA4 真實資料）：
    *   `movePallet` / `movePalletGroup` 共 4 處，在來源資料已寫回（移除）後，又錯誤地對來源區段重新搜尋該棧板，找不到就拋錯中斷，導致目的地沒寫入、棧板憑空消失。
    *   修正：全部改為直接重新讀取 range（不重新搜尋）。`movePalletGroup` 彩色區塊還修正了未定義變數 `srcDepth`（應為 `keyDepth`）。已部署 @98。
    *   經診斷確認該筆 B-G區真實資料**未遺失**（使用者重試後在修正版下成功搬移）。
3.  **群組搬移框線斷裂 bug**：
    *   `reborderDepthSection_` 原本依「每 2 列固定切一個外框」，導致同一物理棧板若含多個品號（多對 SKU+批號），會被切成多個獨立粗框，視覺上看起來線沒接起來。
    *   修正：改為依「SKU 行是否為 bold（=新棧板組開始）」切分外框，同一物理棧板用一個完整外框。已部署 @99~@100。
    *   新增一次性函式 `reborderWholeSheet(sheetName)`（Main.gs），可在 Apps Script 編輯器手動執行，對既有資料套用新框線邏輯（預設「測試區」）。
4.  **群組搬移誤抓同名棧板 bug**（測試區回歸測試發現，重大）：
    *   `movePalletGroup` 原本用「SKU+批號」比對來源排裡哪些棧板屬於要搬的群組。若同一排內**另外有一個不同物理棧板恰好同 SKU+批號**（例如兩個 `PS36018/A6`，箱數不同），會被一起誤抓搬走。
    *   實測案例：搬 4 個一組的群組，結果第七排（6個）→剩 1 個，第八排（1個）→變 6 個，多出的 1 個是被誤抓的不相關棧板。**總數不變、無資料遺失，但位置錯了**。
    *   修正：改成依「目標數量」配對——同名棧板最多只抓 groupKeys 指定的數量，多出來的同名棧板留在原地。已部署 @101。
    *   測試區留下的錯位資料（PS36018/A6 在第八排、RA36046R/A48 在第七排）為測試資料，建議用修好的版本再做一次群組搬移移回即可，不影響真實倉庫。

### 🔧 暫時診斷碼
*   過程中曾在 `Main.gs` 加入 `?action=tempcheck` / `?action=tempcheck2` 暫時診斷端點（直連讀取 B-G區 / 測試區儲存格資料用於除錯），**確診後已全部移除**，目前線上版本（@101）乾淨無暫時碼。

### 📋 下次接手建議
1.  先用 `?grid=1` 對測試區做幾次「同 SKU+批號重複出現於同排」的群組搬移，驗證 bug 4 已修好。
2.  測試區第七/八排有殘留的錯位測試資料，可選擇性整理回原狀（非必要）。
3.  目前版本 @101，所有已知群組搬移相關 bug（白色棧板漏寫、來源誤判遺失、框線斷裂、誤抓同名棧板）皆已修復並部署。

## ⚠️ 2026-06-12 補充：AI 自動瀏覽器測試未完成

### 狀況：
1.  用戶要求 AI 直接用瀏覽器測試 `?grid=1&v=101` 的群組搬移修正（bug 4）。
2.  嘗試使用 Claude in Chrome 擴充功能，但連線持續失敗（"Claude in Chrome is not connected"），即使用戶確認擴充功能已啟用、重新整理分頁仍無效。
3.  嘗試改用 computer-use 控制螢幕，但：
    *   缺少 Screen Recording 權限。
    *   即使授權，Chrome 屬於 "read" tier，仍無法點擊/輸入，必須依賴 Claude in Chrome 擴充功能。
4.  最終本次自動化測試未執行，回退為請用戶手動測試。

### 📋 接手建議：
1.  若下次仍需 AI 自動瀏覽器測試，先確認 Claude in Chrome 擴充功能連線正常（可嘗試重啟瀏覽器或重新登入擴充功能）。
2.  若自動化持續不可用，沿用「@101 接手建議」中的手動測試步驟（測試區同 SKU+批號群組搬移、還原/重做、框線檢查）。

---

## ✅ 2026-06-15 修正紀錄：群組搬移拆分 bug 修復 + 部署流程坑（@113~@123）

### 🐛 本次修復的 bug

**問題**：一個物理棧板由 2 個品號組成（畫面顯示為一個外框「棧板組×2」），搬移到新位置後被拆成 2 個各自獨立外框的棧板。

**根因**：`movePalletGroup` 搬移時，選出的 `groupPallets`（多個品號）各自保留來源端讀到的 `PalletGroupId`。正常情況下同一物理棧板的所有品號應該共用同一個 `PalletGroupId`，但來源資料若有歷史遺留問題（例如先前 session 留下的殘留/不一致資料），各品號的 `PalletGroupId` 可能不一致 → 寫到目的地時 `writeColoredDepthPallets_` 依 `PalletGroupId` 分組畫外框，於是被拆成多框。

**修法**（`WarehouseWriteback.gs` `movePalletGroup`，約 line 911 前）：
搬移前，若 `groupPallets.length > 1`，強制把整組統一改成同一個 `PalletGroupId = 'mv_' + timestamp`，不管來源端原本是否一致：
```javascript
if (groupPallets.length > 1) {
  var sharedGroupId = 'mv_' + new Date().getTime();
  for (var sgp = 0; sgp < groupPallets.length; sgp++) {
    groupPallets[sgp].PalletGroupId = sharedGroupId;
  }
}
```
已部署 @113，最終清理後再部署到 @123。

### 🔧 部署流程踩到的坑：`clasp push`（非 force）會靜默不上傳

這次過程中發現 `deploy.py` 內部呼叫的 `npx clasp push`（**非 force**）有時會回報「Pushed 15 files」成功，但**實際內容沒有更新到遠端**（用 `clasp pull` 到暫存目錄比對才發現遠端 `Main.js` 缺少新加的程式碼）。

**症狀**：改完 `Main.gs` 加新的 `doGet` action 分支、deploy 顯示成功、curl 測試該 action 卻仍回傳舊版的完整 grid app（而不是預期的 ContentService 文字輸出），即使換新 action 名稱、加 try/catch、等待 1~2 分鐘都一樣。

**排查方式**：
```bash
cd /tmp && mkdir clasp_check && cd clasp_check
cp <project>/.clasp.json .
npx clasp pull
grep -n "你新加的代碼關鍵字" Main.js   # 若找不到，代表 push 沒生效
```

**解法**：改用 `npx clasp push --force`，確認 pull 回來的內容包含新代碼後，再用 `npx clasp deploy -i <deployment-id> -d "<說明>"` 覆蓋部署。
**之後若改完程式碼測試「沒效果」，先懷疑這個 push 沒生效的問題，不要一直在程式邏輯上鑽。**

### 🧪 本次驗證測試（用暫時診斷 action route，測完即移除）

在測試區做了 4 組多品號棧板搬移測試（2品號 / 3品號，搬到一般排 / 空排，再搬回原位），逐一檢查目的地 `PalletGroupId` 是否一致：

| case | depth | 品號數 | 結果 |
|---|---|---|---|
| 1 | depth1 | 3 (RF36014/RF36012×2) | ✅ 一致 |
| 2 | depth1 | 3 (PS36018/RP36250/GE36042) | ✅ 一致 |
| 3 | depth1 | 2 (RN36242/RN36014) | ✅ 一致 |
| 4 | depth6 | 2 (RP36020/RP36025) | ✅ 一致 |

四組搬移後 `PalletGroupId` 皆統一為同一值，搬回原位後也恢復正常分組。**修復確認有效。**

### ⚠️ 本次測試過程的意外副作用（已清理）

第一輪測試時，掃描到測試區 depth4 有一個「6品號」的異常 group（`PalletGroupId=undefined`，疑似是更早之前 session 留下的殘留資料），測試流程把它搬到 depth5 再搬回時失敗，**導致 18 格 qty=0/0 的垃圾白色殘留格被寫到 depth1（rows 21-28,37-38）/ depth2（rows 52-53,56-61）**，內容是一些奇怪的批號殘值（如 "E52/無批號"、"F48/無批號" 等）。

事後已用暫時清理函式把這 18 格清空（設回白底空白），確認 depth1/depth2 恢復乾淨。**depth4/depth5 本身原本就是空排（之前 session 留下的狀態），未遺失任何有值的棧板**。

### 📌 已知但未處理的舊資料問題

測試區 depth1 目前有 `RF60126-1/H48 qty=5/0`（gid=blk_30）與 `RF60126-1/H48 qty=20/0`（gid=blk_32）兩個各自獨立外框 —— 這是**本次修法之前就存在的舊資料**（最早造成本次調查的那組棧板）。本次修法只防止「之後搬移時」被拆開，不會回頭修正已經存在的舊分組。若要合併，需手動編輯試算表，或再搬移一次該組（搬一次就會套用新的統一 PalletGroupId 邏輯，自動合併成一框）。

### 🔧 暫時診斷碼

本次新增又移除的暫時 action route：`?action=ping`、`?action=tempgroupmove`、`?action=tempgroupmove2`、`?action=tempcleanup`，及對應的 `_tempTestGroupMove`、`_tempTestGroupMoveAll`、`_tempCleanupTestZone`、`_tempCheckTestZone3` 函式 —— 皆已於 @123 移除確認乾淨。

### 📋 下次接手建議

1. 部署後若 curl 測試新 action 沒反應，先用上面的 `clasp pull` 比對法確認程式碼真的有上去，務必用 `--force`。
2. 測試區 depth1 的 `RF60126-1/H48` 舊資料拆框問題可考慮找時間清理（搬一次即合併）。
3. 自動化測試會直接寫入測試區試算表，測完務必檢查有無殘留垃圾格（尤其當某個 case 的「一致性」檢查顯示 ❌ 或 EXCEPTION 時，代表該次搬移可能未正確完成，要追查資料流向）。

## ✅ 2026-06-15 補充修正：搬移後「殘留」物理棧板被誤拆成多框（@128~@130）

### 🐛 用戶實測發現的 bug
測試區 5列 第三排：把最下方的 `RF36037` 搬到第二排後，原本上方一個 2 品號的物理棧板（`RU36040/GA4` + `RU36039/GA6`，黃色，原本共用一個外框）在畫面上變成 2 個各自獨立外框的棧板。

### 🔍 根因（`WarehouseParse.gs`）
`getWarehouseZoneView` 解析每個 slot 時，用「SKU 行是否 bold」判斷新棧板邊界；當該行非 bold 時，會額外用「往後 20 列內是否有 bold」來判斷整段是否為「bold 新格式」（`usesBoldFormat`）。
問題：對同一物理棧板的**第二個品號**（非 bold，緊接在 bold 品號之後）做這個往後掃描時，如果它剛好在該排段的尾端（後面是空排），20 列內掃不到任何 bold，就誤判 `usesBoldFormat=false`，導致 `groupSeqByDepth` 多加 1，這個品號被分到**新的 PalletGroupId**，前端因此把它畫成獨立外框。

### ✅ 修法
在遇到「排標題列」時，先對整個排段預掃一次，判斷該排是否有任何 bold 彩色格，記錄到 `groupSeqByDepth[depth + '_hasBold']`；後續每一列直接用這個整段層級的結果，不再對單一列做「往後 20 列」局部掃描。已部署 @128，並用暫時診斷 action（`tempzone`/`tempundo`，已移除）驗證：
* 修正前：`RU36040(GA4)` groupId `...||2`、`RU36039(GA6)` groupId `...||3`（不一致 → 拆框）。
* 修正後：兩者皆為 `...||2`（一致 → 同一框）。

驗證後已用 `undoLastMove()` 把測試搬移還原，測試區 5列恢復原狀。最終清理乾淨後部署到 @130。

### 📋 下次接手建議
1. 此修正影響所有 slot 的 zoneView 解析，建議找時間對其他分區（B-G區、A-C區、花磚）跑一次快速檢查，確認沒有區段因此次修正而出現分組變化異常。
2. 暫時診斷 action（`tempcheck3`/`tempmove3`/`tempzone`/`tempundo`）皆已移除，目前 @130 乾淨無暫時碼。

## ✅ 2026-06-15 補充：還原/重做 UX 優化（@131）

依用戶需求新增：
1. **操作動畫**：點擊「還原」「重做」時，按鈕進入 `.busy` 狀態（顯示旋轉中的 `⟲` icon、按鈕 disabled），完成後恢復。
2. **剩餘步數提示**：`getMoveHistory()` 新增回傳 `undoCount`/`redoCount`，按鈕旁顯示步數徽章（`.step-count`），且 tooltip 文字加上「（還可還原/重做 N 步）」。

### 變更檔案
* `WarehouseWriteback.gs`：`getMoveHistory()` 加入 `undoCount`/`redoCount` 及更豐富的 label。
* `warehouse_grid_ui_css.html`：新增 `.step-count` 徽章樣式、`.busy`/`.btn-icon`/`@keyframes spin360` 動畫樣式。
* `warehouse_grid_ui_js.html`：新增共用 `_undoRedoBtnHtml_(kind, cls)` 產生按鈕 HTML（含 icon + 徽章 + busy 狀態），`renderUndoRedo()` 與 `renderDetailPanel()` 中的 banner 按鈕皆改用此共用函式；`doUndo()`/`doRedo()` 開始時設定 `_historyBusy` 並重新渲染，結束後清除。

已部署 @131。

## ✅ 2026-06-15 補充：同 SKU+批號重複時移動失敗（@138）

### 🐛 用戶實測發現的 bug
測試區 3列 第一排：第12層的 `RF60126-1/H48`（紅色 20箱）要移到第8層（與另一個黃色 `RF60126-1/H48` 5箱 合併排序），點「確認移動」後畫面沒有任何變化，移動失敗（無錯誤訊息）。

### 🔍 根因（`WarehouseWriteback.gs` `movePallet`）
`movePallet` 只用「SKU+批號」在排段內找來源棧板，找到第一個符合的就當作目標。但此排段內**第8層與第12層恰好是兩個 SKU+批號完全相同（RF60126-1/H48）但顏色/數量不同的獨立物理棧板**。使用者點的是第12層（紅色 20箱），但程式永遠抓到第8層（黃色 5箱）。
* 抓到第8層 → 目的地也是第8層 → 移除後再插回同一位置 → 結果與移動前完全相同 → 畫面「看起來」沒反應。

### ✅ 修法
在 `movePallet` 找來源棧板時，先收集所有 SKU+批號相符的候選 index；若有多個候選，用 PalletKey 內帶的 Level（使用者點擊當下的層數）去比對，挑出 `index === Level-1` 的那一個，避免誤抓第一個同名棧板。

### 驗證
用暫時診斷 action（已移除）：
* 修正前：點第12層→第8層，前後資料完全相同（誤抓第8層）。
* 修正後：點第12層→第8層，level8 變為紅色 20箱、level9 變為原本黃色 5箱（正確）。已用反向移動還原成原始狀態，測試區資料無殘留變化。

已部署 @138，暫時診斷 action 皆已移除。

---

## ⚠️ 重要架構補充：雙試算表設計（副本 vs 原始）

**背景**：原始正式試算表（Sheet）在之前某次操作中被改壞，因此製作了一個副本來繼續開發，目前系統預設連到副本。

**兩個試算表 ID（Main.gs 第1~4行）**：

| 變數 | Google Sheet ID | 用途 |
|---|---|---|
| `WAREHOUSE_SPREADSHEET_ID` | `1G8aCKowpUeb2uvLFPr1q1HB94vwVm6u3sC5BjHvAmfg` | 原始正式 Sheet（目前未使用，已被改壞） |
| `WAREHOUSE_TEST_SPREADSHEET_ID_` | `1QR6xLZrdSUzhkCNwBhE5EUYpdv8GqkESfj3ELzNf59s` | 副本 Sheet（現在實際在用的） |
| `WAREHOUSE_DEFAULT_SPREADSHEET_ID_` | ← 指向副本 | 程式預設連到副本 |

**切換邏輯**：
- `getWarehouseSpreadsheetId_()` 優先讀 `ScriptProperties` 的 override，沒有就回傳 DEFAULT（副本）
- `useFakeWarehouseSpreadsheet()` → 切到副本（目前預設狀態）
- `useMainWarehouseSpreadsheet()` → 切到原始 Sheet

**讀取邏輯差異（WarehouseRead.gs `getInventoryArray_`）**：
- 目前 ID = 原始 Sheet → 用 **本地快取 JSON**（`parsed_inventory_enriched.json`，不直接讀 live）
- 目前 ID = 副本 → 直接讀 **live 試算表**

**影響**：所有 session（包含 2026-06-11、06-12、06-15 的 B-G區診斷、測試區搬移測試）全部都在**副本 Sheet**上操作。接手時要確認目前 ScriptProperties 的 override 值是哪一個（或在 Apps Script 編輯器執行 `getWarehouseSpreadsheetId_()` 確認）。

---

## 🔒 2026-06-15 補充：封鎖正本切換入口（@153）

`useMainWarehouseSpreadsheet()` 函式已移除，改為注解說明正本已損壞禁止切換。

現在唯一可用的切換函式：
- `useFakeWarehouseSpreadsheet()` → 切到副本（正常狀態）
- `clearWarehouseSpreadsheetIdOverride_()` → 清除 override，也是回到副本

無法再從任何程式碼路徑切換到正本 Sheet。
