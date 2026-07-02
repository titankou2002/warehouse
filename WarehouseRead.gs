function getWarehouseSpreadsheet_() {
  return SpreadsheetApp.openById(getWarehouseSpreadsheetId_());
}

function getEnrichedData() {
  if (typeof getEmbeddedInventoryData_ === 'function') {
    return getEmbeddedInventoryData_();
  }

  var files = DriveApp.getFilesByName("parsed_inventory_enriched.json");
  if (files.hasNext()) {
    return files.next().getBlob().getDataAsString("UTF-8");
  }
  throw new Error("找不到 parsed_inventory_enriched.json 檔案");
}

function getInventoryArray_() {
  var currentId = String(getWarehouseSpreadsheetId_() || '').trim();
  if (currentId && currentId === String(WAREHOUSE_SPREADSHEET_ID).trim()) {
    var json = getEnrichedData();
    var data = JSON.parse(json);
    if (!Array.isArray(data)) {
      throw new Error("內建庫存快取不是 JSON 陣列");
    }
    return data;
  }

  var ss = getWarehouseSpreadsheet_();
  var sheets = ss.getSheets();
  var liveData = [];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName();
    if (!WAREHOUSE_SHEET_PATTERN.test(sheetName)) continue;
    var grid = getSheetDataWithMergedResolved(sheet);
    var rows = parseWarehouseGrid(grid, sheetName);
    for (var r = 0; r < rows.length; r++) {
      liveData.push(rows[r]);
    }
  }
  return liveData;
}

function getInventorySheetList() {
  var data = getInventoryArray_();
  var counts = {};
  for (var i = 0; i < data.length; i++) {
    var sheetName = data[i].Sheet || "";
    if (!sheetName) continue;
    counts[sheetName] = (counts[sheetName] || 0) + 1;
  }

  // 也掃 live 試算表，把符合 pattern 但不在 cache 的分頁（例如測試區）補進來
  try {
    var ss = getWarehouseSpreadsheet_();
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      var name = sheets[s].getName();
      if (WAREHOUSE_SHEET_PATTERN.test(name) && !(name in counts)) {
        counts[name] = 0;
      }
    }
  } catch (e) { /* 不影響主流程 */ }

  var list = [];
  for (var name in counts) {
    list.push({ name: name, count: counts[name] });
  }
  list.sort(function (a, b) {
    return compareSlotLikeText_(a.name, b.name);
  });
  return list;
}

function getInventoryBySheet(sheetName) {
  if (!sheetName) {
    throw new Error("缺少 sheetName");
  }
  if (!WAREHOUSE_SHEET_PATTERN.test(sheetName)) {
    throw new Error("不允許讀取此工作表: " + sheetName);
  }

  try {
    var ss = getWarehouseSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error("找不到工作表: " + sheetName);
    }

    var grid = getSheetDataWithMergedResolved(sheet);
    var livePallets = parseWarehouseGrid(grid, sheetName);

    var currentId = String(getWarehouseSpreadsheetId_() || '').trim();
    if (currentId && currentId === String(WAREHOUSE_SPREADSHEET_ID).trim()) {
      return JSON.stringify(enrichLivePalletsFromCache_(livePallets));
    }

    return JSON.stringify(livePallets.map(withDerivedGeometry_));
  } catch (e) {
    Logger.log("getInventoryBySheet live read failed for " + sheetName + ": " + e.toString());
    var data = getInventoryArray_();
    var filtered = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].Sheet === sheetName) {
        filtered.push(withDerivedGeometry_(data[i]));
      }
    }
    return JSON.stringify(filtered);
  }
}

// 計算每個 (slotId, depth) 的最大棧板容量（每板固定 2 列）
function computeSlotDepthCapacities_(grid) {
  if (!grid || !grid.length || !grid[0]) return {};
  var numRows = grid.length;
  var numCols = grid[0].length;
  var result = {};

  for (var col = 1; col < numCols; col++) {
    var slotVal = cleanValue(grid[0][col].value);
    if (slotVal === null || slotVal === '數量') continue;
    var slotId = String(slotVal).trim();

    var depthStart = -1;
    var currentDepth = 0;

    for (var r = 1; r < numRows; r++) {
      var cellVal = cleanValue(grid[r][col].value);
      if (cellVal && cellVal.indexOf('排') !== -1) {
        if (depthStart >= 0 && r > depthStart) {
          result[slotId + '||' + currentDepth] = Math.floor((r - depthStart) / 2);
        }
        currentDepth = parseStackDepth_(cellVal);
        depthStart = r + 1;
      }
    }
    if (depthStart >= 0 && numRows > depthStart) {
      result[slotId + '||' + currentDepth] = Math.floor((numRows - depthStart) / 2);
    }
  }
  return result;
}

function getWarehouseZoneView(sheetName) {
  var rows = JSON.parse(getInventoryBySheet(sheetName));
  var capacities = {};
  try {
    var ss = getWarehouseSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      capacities = computeSlotDepthCapacities_(getSheetDataWithMergedResolved(sheet));
    }
  } catch (e) { /* capacity 可選，失敗不影響主流程 */ }
  return buildZoneViewModel_(rows, sheetName, capacities);
}

function getSearchIndex() {
  var data = getInventoryArray_();
  var counters = {};
  var rows = [];

  for (var i = 0; i < data.length; i++) {
    var row = withDerivedGeometry_(data[i]);
    var key = [String(row.Sheet || ''), String(row.Slot || ''), String(row.Depth || 0)].join('||');
    counters[key] = (counters[key] || 0) + 1;
    if (!row.Level || Number(row.Level) <= 0) {
      row.Level = counters[key];
      row.PalletKey = makePalletKey_(row);
    }
    rows.push(row);
  }

  return JSON.stringify(rows);
}

function getDebugSummary() {
  var started = new Date();
  var data = getInventoryArray_();
  var sheetList = getInventorySheetList();
  var sampleSheet = "B-G區";
  var sample = JSON.parse(getInventoryBySheet(sampleSheet));
  return {
    ok: true,
    serverTime: started.toISOString(),
    scriptUrl: ScriptApp.getService().getUrl(),
    hasEmbeddedCache: typeof getEmbeddedInventoryData_ === 'function',
    totalRows: data.length,
    sheetCount: sheetList.length,
    sheets: sheetList,
    sampleSheet: sampleSheet,
    sampleRows: sample.length,
    firstRow: sample[0] || data[0] || null
  };
}
