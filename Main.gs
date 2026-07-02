var WAREHOUSE_SPREADSHEET_ID = "1G8aCKowpUeb2uvLFPr1q1HB94vwVm6u3sC5BjHvAmfg";
var WAREHOUSE_SPREADSHEET_ID_OVERRIDE_KEY_ = "WAREHOUSE_SPREADSHEET_ID_OVERRIDE";
var WAREHOUSE_TEST_SPREADSHEET_ID_ = "1QR6xLZrdSUzhkCNwBhE5EUYpdv8GqkESfj3ELzNf59s";
var WAREHOUSE_DEFAULT_SPREADSHEET_ID_ = WAREHOUSE_TEST_SPREADSHEET_ID_;
var WAREHOUSE_SHEET_PATTERN = /^([A-C]-[A-H]區|花磚|測試區)$/;
// 分隔行背景色：代表「此行是棧板邊界」，程式讀到此色 = 新棧板開始
var PALLET_SEP_BG_ = '#1a3a6a';

function getWarehouseSpreadsheetId_() {
  var overrideId = "";
  try {
    overrideId = String(PropertiesService.getScriptProperties().getProperty(WAREHOUSE_SPREADSHEET_ID_OVERRIDE_KEY_) || "").trim();
  } catch (e) {}
  return overrideId || WAREHOUSE_DEFAULT_SPREADSHEET_ID_;
}

function setWarehouseSpreadsheetIdOverride_(spreadsheetId) {
  var id = String(spreadsheetId || "").trim();
  if (!id) throw new Error("缺少 spreadsheetId");
  PropertiesService.getScriptProperties().setProperty(WAREHOUSE_SPREADSHEET_ID_OVERRIDE_KEY_, id);
  return { ok: true, spreadsheetId: id };
}

function clearWarehouseSpreadsheetIdOverride_() {
  PropertiesService.getScriptProperties().deleteProperty(WAREHOUSE_SPREADSHEET_ID_OVERRIDE_KEY_);
  return { ok: true, spreadsheetId: WAREHOUSE_DEFAULT_SPREADSHEET_ID_ };
}

function useFakeWarehouseSpreadsheet() {
  return setWarehouseSpreadsheetIdOverride_(WAREHOUSE_TEST_SPREADSHEET_ID_);
}

// useMainWarehouseSpreadsheet() 已移除 — 正本 Sheet 已損壞，禁止切換回去

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function renderWarehouseApp_() {
  var template = HtmlService.createTemplateFromFile("warehouse_ui");
  try {
    template.scriptUrl = ScriptApp.getService().getUrl();
  } catch (ex) {
    template.scriptUrl = '';
  }

  return template.evaluate()
    .setTitle("鈦傳速智慧倉位")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
}

function renderWarehouseGridApp_() {
  var template = HtmlService.createTemplateFromFile("warehouse_grid_ui");
  try {
    template.scriptUrl = ScriptApp.getService().getUrl();
  } catch (ex) {
    template.scriptUrl = '';
  }

  return template.evaluate()
    .setTitle("鈦傳速智慧倉儲系統")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

function doGet(e) {
  if (e && e.parameter && e.parameter.debug === '1') {
    return HtmlService.createHtmlOutput(buildDebugPage_())
      .setTitle("倉儲系統診斷")
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
  }

  if (e && e.parameter && e.parameter.action === 'data') {
    try {
      var jsonData = e.parameter.sheet ? getInventoryBySheet(e.parameter.sheet) : JSON.stringify(getInventoryArray_());
      return ContentService.createTextOutput(jsonData)
        .setMimeType(ContentService.MimeType.JSON);
    } catch (ex) {
      Logger.log("資料端點錯誤: " + ex.toString());
      return ContentService.createTextOutput('{"error":"' + ex.message.replace(/"/g, '\\"') + '"}')
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (e && e.parameter && e.parameter.legacy === '1') {
    return renderWarehouseApp_();
  }

  return renderWarehouseGridApp_();
}

function buildDebugPage_() {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;background:#0b1020;color:#e5eefb;margin:0;padding:20px;line-height:1.5}',
    'h1{font-size:20px;margin:0 0 14px}.card{border:1px solid #24314d;background:#111a2e;border-radius:10px;padding:14px;margin:10px 0}',
    '.ok{color:#7ee787}.bad{color:#ff7b72}.muted{color:#95a3b8}pre{white-space:pre-wrap;word-break:break-word;background:#070b14;padding:12px;border-radius:8px;max-height:420px;overflow:auto}',
    '</style></head><body>',
    '<h1>倉儲系統診斷頁</h1>',
    '<div id="steps"></div><pre id="out"></pre>',
    '<script>',
    'const steps=document.getElementById("steps");const out=document.getElementById("out");',
    'function row(name,status,msg){const d=document.createElement("div");d.className="card";d.innerHTML=`<strong>${name}</strong><br><span class="${status==="OK"?"ok":"bad"}">${status}</span> <span class="muted">${msg||""}</span>`;steps.appendChild(d)}',
    'function dump(x){out.textContent=JSON.stringify(x,null,2)}',
    'row("1. HTML 啟動","OK",new Date().toISOString());',
    'row("2. document.readyState","OK",document.readyState);',
    'row("3. google.script.run 存在",typeof google!=="undefined"&&google.script&&google.script.run?"OK":"FAIL","");',
    'if(typeof google==="undefined"||!google.script||!google.script.run){dump({error:"google.script.run missing"});}else{',
    'google.script.run.withSuccessHandler(r=>{row("4. 後端 getDebugSummary","OK",`rows=${r.totalRows}, sheets=${r.sheetCount}, sample=${r.sampleRows}`);dump(r);',
    'google.script.run.withSuccessHandler(list=>row("5. getInventorySheetList","OK",`${list.length} sheets`)).withFailureHandler(e=>row("5. getInventorySheetList","FAIL",e.message||e)).getInventorySheetList();',
    'google.script.run.withSuccessHandler(s=>{try{const a=JSON.parse(s);row("6. getInventoryBySheet(B-G區)","OK",`${a.length} rows`)}catch(e){row("6. getInventoryBySheet(B-G區)","FAIL",e.message)}}).withFailureHandler(e=>row("6. getInventoryBySheet(B-G區)","FAIL",e.message||e)).getInventoryBySheet("B-G區");',
    'google.script.run.withSuccessHandler(view=>row("7. getWarehouseZoneView(B-G區)","OK",`slots=${view.slotCount}, maxDepth=${view.maxDepth}, maxLevel=${view.maxLevel}`)).withFailureHandler(e=>row("7. getWarehouseZoneView(B-G區)","FAIL",e.message||e)).getWarehouseZoneView("B-G區");',
    '}).withFailureHandler(e=>{row("4. 後端 getDebugSummary","FAIL",e.message||e);dump(e);}).getDebugSummary();}',
    '</script></body></html>'
  ].join('');
}

// ===== 測試分頁建立（從 GAS 編輯器執行此函數）=====
function createTestSheet() {
  var ss = getWarehouseSpreadsheet_();
  var existing = ss.getSheetByName('測試區');
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet('測試區');
  sheet.setTabColor('#1a3a6a');
  sheet.setHiddenGridlines(true);

  var SEP = PALLET_SEP_BG_;
  var RED = '#ff4444';
  var YEL = '#fff200';
  var WHT = '#ffffff';
  var BLK = '#000000';

  // === 欄位配置：col A = 列標籤, B+C = 格位1, D+E = 格位2 ===
  // 第一行：格位 header
  sheet.getRange(1,1).setValue('').setBackground('#0d1929').setFontColor('#8aabb8');
  sheet.getRange(1,2).setValue('測1').setBackground('#0d1929').setFontColor('#e5eefb').setFontWeight('bold');
  sheet.getRange(1,3).setValue('數量').setBackground('#0d1929').setFontColor('#8aabb8');
  sheet.getRange(1,4).setValue('測2').setBackground('#0d1929').setFontColor('#e5eefb').setFontWeight('bold');
  sheet.getRange(1,5).setValue('數量').setBackground('#0d1929').setFontColor('#8aabb8');

  // === 格位「測1」的資料（col B=prodCol, col C=qtyCol）===
  var rows = [
    // 第一排 header
    ['', '第一排', '', '第一排', ''],
    // 棧板A（紅，2個品號 = 同一物理棧板）分隔行在上面
    ['', '',     '', '',     ''],   // 分隔行：只上色，不放值
    ['', 'SKU-001', 10, 'SKU-AA', 5],  // 棧板A品1 / 格位2棧板A品1
    ['', 'BATCH-001', '', 'BATCH-AA', ''],
    ['', 'SKU-002', 3, 'SKU-AB', 2],   // 棧板A品2（同物理棧板）/ 格位2棧板A品2
    ['', 'BATCH-002', '', 'BATCH-AB', ''],
    // 棧板B（黃，1個品號）
    ['', '',     '', '',     ''],   // 分隔行：只上色，不放值
    ['', 'SKU-003', 8, 'SKU-BA', 12],
    ['', 'BATCH-003', '', 'BATCH-BA', ''],
    // 棧板C（紅，1個品號）
    ['', '',     '', '',     ''],   // 分隔行：只上色，不放值
    ['', 'SKU-004', 6, 'SKU-CA', 4],
    ['', 'BATCH-004', '', 'BATCH-CA', ''],
    // 第二排 header
    ['', '第二排', '', '第二排', ''],
    // 棧板D（綠，專案庫存）
    ['', '',     '', '',     ''],
    ['', 'SKU-005', 20, 'SKU-DA', 15],
    ['', 'BATCH-005', '', 'BATCH-DA', ''],
  ];

  for (var ri = 0; ri < rows.length; ri++) {
    var rowData = rows[ri];
    var sheetRow = ri + 2; // 從第2列開始（第1列是 header）
    for (var ci = 0; ci < rowData.length; ci++) {
      sheet.getRange(sheetRow, ci + 1).setValue(rowData[ci]);
    }
  }

  // 上色
  // 分隔行（row 3, 8, 11, 15, 16 in sheet = 棧板前的分隔）
  // 只上色，不寫值，讓讀取邏輯能把它當作真正的邊界
  var colorMap = [
    // [sheetRow, prodCol(B=2), color]
    [4, 2, RED], [5, 2, RED], [6, 2, RED], [7, 2, RED], // 棧板A 品1+品2（紅）
    [9, 2, YEL], [10, 2, YEL],  // 棧板B（黃）
    [12, 2, RED], [13, 2, RED], // 棧板C（紅）
    [17, 2, '#00b050'], [18, 2, '#00b050'], // 棧板D（綠）
    // 格位2
    [4, 4, RED], [5, 4, RED], [6, 4, RED], [7, 4, RED],
    [9, 4, YEL], [10, 4, YEL],
    [12, 4, RED], [13, 4, RED],
    [17, 4, '#00b050'], [18, 4, '#00b050'],
  ];
  colorMap.forEach(function(cm) {
    sheet.getRange(cm[0], cm[1]).setBackground(cm[2]);
    sheet.getRange(cm[0], cm[1]+1).setBackground(cm[2]);
  });

  // 分隔行塗色（row 3, 8, 11, 15 分別對應 sheetRow 3, 8, 11, 15）
  [3, 8, 11, 15, 16].forEach(function(r2) {
    sheet.getRange(r2, 2, 1, 2).setBackground(SEP).setFontColor('#a9bfd7');
    sheet.getRange(r2, 4, 1, 2).setBackground(SEP).setFontColor('#a9bfd7');
  });

  // 第一排、第二排 header 行上色
  [2, 14].forEach(function(r3) {
    sheet.getRange(r3, 1, 1, 5).setBackground('#0a1520').setFontColor('#4a8080').setFontWeight('bold');
  });

  // 欄寬
  if (sheet.getMaxColumns() > 5) {
    sheet.deleteColumns(6, sheet.getMaxColumns() - 5);
  }
  if (sheet.getMaxRows() > 18) {
    sheet.deleteRows(19, sheet.getMaxRows() - 18);
  }
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 60);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 60);

  applyReadableTestSheetSeparators_(sheet);
  SpreadsheetApp.flush();
  Logger.log('測試區建立完成！請到 WMS 前端選擇「測試區」查看效果。');
}
// ===== /測試分頁建立 =====

function collectSlotPairsFromGrid_(grid) {
  var pairs = [];
  if (!grid || !grid.length || !grid[0]) return pairs;
  for (var col = 1; col < grid[0].length; col++) {
    var slotVal = cleanValue(grid[0][col].value);
    if (slotVal !== null && slotVal !== '數量') {
      pairs.push({ prodCol: col, qtyCol: col + 1, slotId: String(slotVal).trim() });
    }
  }
  return pairs;
}

function collectPalletStartRowsForSlot_(grid, prodCol) {
  var starts = [];
  if (!grid || !grid.length || !grid[0]) return starts;

  var numRows = grid.length;
  var hasBoldColored = false;
  for (var r = 1; r < numRows; r++) {
    var cell = grid[r][prodCol];
    if (!cell) continue;
    var val = cleanValue(cell.value);
    var bg = identifyBgColor(cell.bgColor);
    if (bg !== 'WHITE' && val !== null && cell.fontWeight === 'bold') {
      hasBoldColored = true;
      break;
    }
  }

  var inFallbackColorBlock = false;
  var lastColor = null;
  for (var r2 = 1; r2 < numRows; r2++) {
    var cell2 = grid[r2][prodCol];
    if (!cell2) continue;
    var val2 = cleanValue(cell2.value);
    var bg2 = identifyBgColor(cell2.bgColor);

    if (val2 && val2.indexOf('排') !== -1) {
      inFallbackColorBlock = false;
      lastColor = null;
      continue;
    }

    if (val2 === null) {
      if (String(cell2.bgColor || '').toUpperCase().replace('#', '') === '1A3A6A') {
        inFallbackColorBlock = false;
        lastColor = null;
      }
      continue;
    }

    if (bg2 === 'WHITE') continue;

    if (hasBoldColored) {
      if (cell2.fontWeight === 'bold') starts.push(r2);
      continue;
    }

    if (!inFallbackColorBlock || bg2 !== lastColor) {
      starts.push(r2);
      inFallbackColorBlock = true;
      lastColor = bg2;
    }
  }

  return starts;
}

function applyReadableTestSheetSeparators_(sheet) {
  if (!sheet) return { ok: false, reason: 'missing sheet' };
  var sheetName = sheet.getName();
  if (!WAREHOUSE_SHEET_PATTERN.test(sheetName)) {
    return { ok: false, reason: 'sheet not allowed: ' + sheetName };
  }

  var grid = getSheetDataWithMergedResolved(sheet);
  if (!grid.length || !grid[0]) return { ok: false, reason: 'empty sheet' };

  sheet.getDataRange().setBorder(false, false, false, false, false, false);

  var slotPairs = collectSlotPairsFromGrid_(grid);
  var separatorCount = 0;
  for (var i = 0; i < slotPairs.length; i++) {
    var pair = slotPairs[i];
    var starts = collectPalletStartRowsForSlot_(grid, pair.prodCol);
    for (var s = 0; s < starts.length; s++) {
      var rowIdx = starts[s] + 1;
      sheet.getRange(rowIdx, pair.prodCol + 1, 1, 2)
        .setBorder(true, false, false, false, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
      separatorCount += 1;
    }
  }

  SpreadsheetApp.flush();
  return { ok: true, sheet: sheetName, separators: separatorCount };
}

function formatActiveTestSheetSeparators() {
  var ss = getWarehouseSpreadsheet_();
  var sheet = ss.getSheetByName('測試區');
  if (!sheet) throw new Error('找不到「測試區」工作表');
  return applyReadableTestSheetSeparators_(sheet);
}

// 對指定 sheet 的所有「排」區段重新畫框（套用最新分組外框邏輯）
// 在 Apps Script 編輯器選此函式直接執行即可，sheetName 預設「測試區」
function reborderWholeSheet(sheetName) {
  var ss = getWarehouseSpreadsheet_();
  var name = sheetName || '測試區';
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('找不到「' + name + '」工作表');

  var grid = getSheetDataWithMergedResolved(sheet);
  var lastCol = grid[0].length;
  var count = 0;

  for (var c = 1; c < lastCol; c++) {
    var headerVal = cleanValue(grid[0][c].value);
    if (headerVal === null || headerVal === '' || headerVal === '數量') continue;
    var prodCol = c;
    var qtyCol = c + 1;

    var r = 0;
    while (r < grid.length) {
      var v = cleanValue(grid[r][prodCol].value);
      if (v && v.indexOf('排') !== -1) {
        var startRow = r + 1;
        var endRow = grid.length - 1;
        for (var r2 = startRow; r2 < grid.length; r2++) {
          var v2 = cleanValue(grid[r2][prodCol].value);
          if (v2 && v2.indexOf('排') !== -1) { endRow = r2 - 1; break; }
        }
        if (endRow >= startRow) {
          reborderDepthSection_(sheet, prodCol, qtyCol, { startRow: startRow, endRow: endRow });
          count++;
        }
        r = endRow + 1;
      } else {
        r++;
      }
    }
  }
  SpreadsheetApp.flush();
  return { ok: true, sheet: name, sections: count };
}


function authTest() {
  Logger.log("開始偵錯測試...");
  try {
    var files = DriveApp.getFilesByName("parsed_inventory_enriched.json");
    if (files.hasNext()) {
      var file = files.next();
      Logger.log("成功找到檔案！");
      Logger.log("檔名: " + file.getName());
      Logger.log("大小: " + file.getSize() + " 位元組");
      Logger.log("最後修改時間: " + file.getLastUpdated());
    } else {
      Logger.log("找不到 parsed_inventory_enriched.json");
    }
  } catch (e) {
    Logger.log("偵錯時發生錯誤: " + e.toString());
  }
}
