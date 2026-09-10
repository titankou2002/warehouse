var WAREHOUSE_CACHE_KEY_ = 'WAREHOUSE_INVENTORY_CACHE';
var WAREHOUSE_CACHE_TS_KEY_ = 'WAREHOUSE_INVENTORY_CACHE_TS';
var WAREHOUSE_CACHE_TTL_MS_ = 5 * 60 * 1000; // 5 分鐘

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

function readCache_() {
  try {
    var ts = PropertiesService.getScriptProperties().getProperty(WAREHOUSE_CACHE_TS_KEY_);
    if (ts && (Date.now() - Number(ts)) < WAREHOUSE_CACHE_TTL_MS_) {
      var json = PropertiesService.getScriptProperties().getProperty(WAREHOUSE_CACHE_KEY_);
      if (json) return JSON.parse(json);
    }
  } catch (e) {}
  return null;
}

function writeCache_(data) {
  try {
    PropertiesService.getScriptProperties().setProperty(WAREHOUSE_CACHE_TS_KEY_, String(Date.now()));
    PropertiesService.getScriptProperties().setProperty(WAREHOUSE_CACHE_KEY_, JSON.stringify(data));
  } catch (e) {}
}

function invalidateCache_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(WAREHOUSE_CACHE_KEY_);
    PropertiesService.getScriptProperties().deleteProperty(WAREHOUSE_CACHE_TS_KEY_);
  } catch (e) {}
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'wms_search_light_v2_' + String(getWarehouseSpreadsheetId_() || '').slice(-8);
    cache.remove(cacheKey);
  } catch (e2) {}
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

  var cached = readCache_();
  if (cached) return cached;

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
  writeCache_(liveData);
  return liveData;
}

function getInventorySheetList() {
  var ss = getWarehouseSpreadsheet_();
  var sheets = ss.getSheets();
  var list = [];
  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName();
    if (!WAREHOUSE_SHEET_PATTERN.test(name)) continue;
    // 快速估算 pallet 數：只讀第一欄 B 欄非空白資料列數
    var count = 0;
    try {
      var data = sheets[s].getDataRange().getValues();
      for (var r = 2; r < data.length; r++) {
        var v = data[r][1];
        if (v !== null && v !== undefined && v !== '') count++;
      }
    } catch (e) {}
    list.push({ name: name, count: Math.ceil(count / 2) });
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
    if (typeof isDataTableMode_ === 'function' && isDataTableMode_(sheetName)) {
      var tablePallets = readDataTablePallets_(sheetName);
      return JSON.stringify(tablePallets.map(withDerivedGeometry_));
    }

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

  if (typeof isDataTableMode_ === 'function' && isDataTableMode_(sheetName)) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.Slot || !r.Depth) continue;
      var ck = String(r.Slot).trim() + '||' + Number(r.Depth);
      capacities[ck] = Math.max(capacities[ck] || 0, Number(r.Level) || 1, 6);
    }
    return buildZoneViewModel_(rows, sheetName, capacities);
  }

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
  var cache = CacheService.getScriptCache();
  var cacheKey = 'wms_search_light_v3_' + String(getWarehouseSpreadsheetId_() || '').slice(-8);
  try {
    var hit = cache.get(cacheKey);
    if (hit) return hit;
  } catch (e) {
    Logger.log('getSearchIndex cache get warn: ' + e.toString());
  }

  var light = [];
  try {
    var ss = getWarehouseSpreadsheet_();
    var sheets = ss.getSheets();

    for (var s = 0; s < sheets.length; s++) {
      var sName = sheets[s].getName();
      if (!sName.endsWith('_TABLE')) continue;
      var baseSheet = sName.replace('_TABLE', '');
      if (!WAREHOUSE_SHEET_PATTERN.test(baseSheet)) continue;

      var pallets = readDataTablePallets_(baseSheet);
      for (var i = 0; i < pallets.length; i++) {
        var p = pallets[i];
        if (!p.SKU && !p.Batch) continue;
        light.push({
          Sheet: p.Sheet || baseSheet,
          Slot: String(p.Slot || ''),
          Depth: Number(p.Depth || 0),
          Level: Number(p.Level || 0),
          SKU: String(p.SKU || ''),
          Batch: String(p.Batch || ''),
          HanhwaCode: String(p.HanhwaCode || ''),
          Brand: String(p.Brand || ''),
          Company: String(p.Company || ''),
          PalletKey: String(p.PalletKey || ''),
          BgColor: String(p.BgColor || 'WHITE'),
          Status: String(p.Status || '正常庫存'),
          SinglePieceImage: String(p.SinglePieceImage || '')
        });
      }
    }
  } catch (eTable) {
    Logger.log('getSearchIndex _TABLE scan failed: ' + eTable.toString());
  }

  if (!light.length) {
    var data = getInventoryArray_();
    var counters = {};
    for (var j = 0; j < data.length; j++) {
      var row = withDerivedGeometry_(data[j]);
      var key = [String(row.Sheet || ''), String(row.Slot || ''), String(row.Depth || 0)].join('||');
      counters[key] = (counters[key] || 0) + 1;
      if (!row.Level || Number(row.Level) <= 0) {
        row.Level = counters[key];
        row.PalletKey = makePalletKey_(row);
      }
      light.push({
        Sheet: row.Sheet || '',
        Slot: row.Slot || '',
        Depth: row.Depth || 0,
        Level: row.Level || 0,
        SKU: row.SKU || '',
        Batch: row.Batch || '',
        HanhwaCode: row.HanhwaCode || '',
        Brand: row.Brand || '',
        Company: row.Company || '',
        PalletKey: row.PalletKey || '',
        BgColor: row.BgColor || '',
        Status: row.Status || '',
        SinglePieceImage: row.SinglePieceImage || row.ImageUrl || ''
      });
    }
  }

  var out = JSON.stringify(light);
  try {
    if (out.length < 90000) cache.put(cacheKey, out, 21600);
  } catch (e2) {}
  return out;
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
