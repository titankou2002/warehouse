// ===== 操作記錄 =====
var LOG_SHEET_NAME_ = '操作記錄';

function appendLog_(operator, action, details) {
  try {
    var ss = getWarehouseSpreadsheet_();
    var logSheet = ss.getSheetByName(LOG_SHEET_NAME_);
    if (!logSheet) {
      logSheet = ss.insertSheet(LOG_SHEET_NAME_);
      logSheet.appendRow(['時間', '操作者', '操作類型', '品號', '批號', '來源', '目的地', '備註']);
      logSheet.setFrozenRows(1);
      logSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1a2f4a').setFontColor('#e5eefb');
      logSheet.setColumnWidth(1, 160);
      logSheet.setColumnWidth(4, 200);
      logSheet.setColumnWidth(6, 160);
      logSheet.setColumnWidth(7, 160);
    }
    var now = new Date();
    var timeStr = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    logSheet.appendRow([
      timeStr,
      operator || '未登入',
      action || '',
      details.sku  || '',
      details.batch || '',
      details.from  || '',
      details.to    || '',
      details.note  || ''
    ]);
  } catch (e) {
    Logger.log('appendLog_ 失敗: ' + e.toString());
    // log 失敗不影響主流程
  }
}
// ===== /操作記錄 =====

// ===== 移動歷史（還原 / 重做）=====
var HISTORY_KEY_ = 'wms_move_history';
var HISTORY_MAX_ = 10;

function loadHistory_() {
  try {
    var raw = PropertiesService.getUserProperties().getProperty(HISTORY_KEY_);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { undo: [], redo: [] };
}

function saveHistory_(h) {
  PropertiesService.getUserProperties().setProperty(HISTORY_KEY_, JSON.stringify(h));
}

function pushMoveToHistory_(rec) {
  var h = loadHistory_();
  h.undo.push(rec);
  if (h.undo.length > HISTORY_MAX_) h.undo.shift();
  h.redo = []; // 新動作清空 redo 堆疊
  saveHistory_(h);
}

function getMoveHistory() {
  var h = loadHistory_();
  return {
    canUndo: h.undo.length > 0,
    canRedo: h.redo.length > 0,
    undoCount: h.undo.length,
    redoCount: h.redo.length,
    undoLabel: h.undo.length > 0 ? ('還原：' + h.undo[h.undo.length-1].sku + ' ' + h.undo[h.undo.length-1].batch + '（還可還原 ' + h.undo.length + ' 步）') : '',
    redoLabel: h.redo.length > 0 ? ('重做：' + h.redo[h.redo.length-1].sku + ' ' + h.redo[h.redo.length-1].batch + '（還可重做 ' + h.redo.length + ' 步）') : ''
  };
}

function undoLastMove() {
  var h = loadHistory_();
  if (!h.undo.length) throw new Error('沒有可以還原的操作');
  var rec = h.undo.pop();
  var result;
  if (rec.isGroup && rec.groupSKUBatch && rec.groupSKUBatch.length > 1) {
    // 群組移動：用 groupSKUBatch 重建 groupKeys，從 to 搬回 from
    var revGroupKeys = rec.groupSKUBatch.map(function(sb) {
      return [rec.toSheet, rec.toSlot, rec.toDepth, '0', sb.sku, sb.batch].join('||');
    });
    result = movePalletGroup({ groupKeys: revGroupKeys, sourceSheet: rec.toSheet, destSheet: rec.fromSheet, destSlot: rec.fromSlot, destDepth: rec.fromDepth, destLevel: rec.fromLevel });
  } else {
    var reverseKey = [rec.toSheet, rec.toSlot, rec.toDepth, '0', rec.sku, rec.batch].join('||');
    result = movePallet({ palletKey: reverseKey, sourceSheet: rec.toSheet, destSheet: rec.fromSheet, destSlot: rec.fromSlot, destDepth: rec.fromDepth, destLevel: rec.fromLevel });
  }
  h.redo.push(rec);
  if (h.redo.length > HISTORY_MAX_) h.redo.shift();
  saveHistory_(h);
  result.history = getMoveHistory();
  // 告訴前端跳回棧板還原後的位置（from）
  result.navigateTo = { sheet: rec.fromSheet, slot: rec.fromSlot, depth: rec.fromDepth };
  return result;
}

function redoLastMove() {
  var h = loadHistory_();
  if (!h.redo.length) throw new Error('沒有可以重做的操作');
  var rec = h.redo.pop();
  var result;
  if (rec.isGroup && rec.groupSKUBatch && rec.groupSKUBatch.length > 1) {
    var fwdGroupKeys = rec.groupSKUBatch.map(function(sb) {
      return [rec.fromSheet, rec.fromSlot, rec.fromDepth, '0', sb.sku, sb.batch].join('||');
    });
    result = movePalletGroup({ groupKeys: fwdGroupKeys, sourceSheet: rec.fromSheet, destSheet: rec.toSheet, destSlot: rec.toSlot, destDepth: rec.toDepth, destLevel: rec.toLevel });
  } else {
    var forwardKey = [rec.fromSheet, rec.fromSlot, rec.fromDepth, '0', rec.sku, rec.batch].join('||');
    result = movePallet({ palletKey: forwardKey, sourceSheet: rec.fromSheet, destSheet: rec.toSheet, destSlot: rec.toSlot, destDepth: rec.toDepth, destLevel: rec.toLevel });
  }
  h.undo.push(rec);
  if (h.undo.length > HISTORY_MAX_) h.undo.shift();
  saveHistory_(h);
  result.history = getMoveHistory();
  // 告訴前端跳到重做後的位置（to）
  result.navigateTo = { sheet: rec.toSheet, slot: rec.toSlot, depth: rec.toDepth };
  return result;
}

function normalizeUpdatePayload_(payload) {
  if (!payload) throw new Error("缺少更新資料");
  var oldData = payload.oldData || {};
  var newData = payload.newData || {};
  var sheetName = String(oldData.Sheet || newData.Sheet || '').trim();
  if (!WAREHOUSE_SHEET_PATTERN.test(sheetName)) {
    throw new Error("不允許更新此工作表: " + sheetName);
  }

  function cleanText(v) {
    return String(v == null ? '' : v).trim();
  }
  function cleanNumber(v, label) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) throw new Error(label + ' 必須是 0 以上數字');
    return n;
  }

  return {
    oldData: {
      Sheet: sheetName,
      Stack: cleanText(oldData.Stack),
      Slot: cleanText(oldData.Slot),
      SKU: cleanText(oldData.SKU),
      Batch: cleanText(oldData.Batch)
    },
    newData: {
      Sheet: sheetName,
      Stack: cleanText(oldData.Stack),
      Slot: cleanText(oldData.Slot),
      SKU: cleanText(newData.SKU),
      Batch: cleanText(newData.Batch) || '無批號',
      BoxQty: cleanNumber(newData.BoxQty, '箱數'),
      PieceQty: cleanNumber(newData.PieceQty, '片數'),
      Status: cleanText(newData.Status)
    }
  };
}

function findPalletLocationInSheet_(sheet, sheetName, target) {
  var grid = getSheetDataWithMergedResolved(sheet);
  var numRows = grid.length;
  var numCols = grid[0].length;
  var matches = [];
  var colPairs = [];

  for (var col = 1; col < numCols; col++) {
    var cellVal = cleanValue(grid[0][col].value);
    if (cellVal !== null && cellVal !== '數量') {
      colPairs.push({ prodCol: col, qtyCol: col + 1, slotId: cellVal });
    }
  }

  for (var pairIdx = 0; pairIdx < colPairs.length; pairIdx++) {
    var prodCol = colPairs[pairIdx].prodCol;
    var qtyCol = colPairs[pairIdx].qtyCol;
    var slotId = String(colPairs[pairIdx].slotId || '').trim();
    var currentStack = null;
    var r = 1;

    while (r < numRows) {
      var cellProd = grid[r][prodCol];
      var valProd = cleanValue(cellProd.value);
      if (valProd && valProd.indexOf('排') !== -1) {
        currentStack = valProd;
        r += 1;
        continue;
      }
      if (currentStack === null) {
        r += 1;
        continue;
      }

      var bgColor = identifyBgColor(cellProd.bgColor);
      if (bgColor !== 'WHITE' && valProd !== null) {
        var palletRows = [];
        var tempR = r;
        while (tempR < numRows) {
          var tempCellProd = grid[tempR][prodCol];
          var tempBg = identifyBgColor(tempCellProd.bgColor);
          if (tempBg === bgColor && cleanValue(tempCellProd.value) !== null) {
            palletRows.push(tempR);
            tempR += 1;
          } else {
            break;
          }
        }

        var sku = cleanValue(grid[palletRows[0]][prodCol].value) || '';
        var batch = palletRows.length > 1 ? (cleanValue(grid[palletRows[1]][prodCol].value) || '無批號') : '無批號';
        if (
          String(sheetName).trim() === String(target.Sheet).trim() &&
          String(currentStack).trim() === String(target.Stack).trim() &&
          String(slotId).trim() === String(target.Slot).trim() &&
          String(sku).trim() === String(target.SKU).trim() &&
          String(batch).trim() === String(target.Batch).trim()
        ) {
          var boxRow = palletRows[0];
          var pieceRow = palletRows[0];
          matches.push({
            prodCol: prodCol,
            qtyCol: qtyCol,
            skuRow: palletRows[0],
            batchRow: -1,
            boxRow: boxRow,
            pieceRow: pieceRow,
            palletRows: palletRows,
            format: 'white',
            bgColor: bgColor
          });
        }
        r += palletRows.length;
      } else {
        r += 1;
      }
    }
  }

  if (matches.length === 0) throw new Error('找不到要更新的庫位，可能資料已被其他人修改，請重新整理後再試');
  if (matches.length > 1) throw new Error('找到多筆相同庫位資料，為避免寫錯位置，請先讓品號/批號唯一後再更新');
  return matches[0];
}

function applyStatusStyle_(sheet, loc, status) {
  var bg = null;
  var font = '#000000';
  if (status === '混板/散板') bg = '#fff200';
  else if (status === '專案庫存') bg = '#00b050';
  else if (status === '最後一板') {
    bg = '#fff200';
    font = '#0000ff';
  }
  if (!bg) return;

  for (var i = 0; i < loc.palletRows.length; i++) {
    var row = loc.palletRows[i] + 1;
    sheet.getRange(row, loc.prodCol + 1).setBackground(bg).setFontColor(font);
    sheet.getRange(row, loc.qtyCol + 1).setBackground(bg).setFontColor(font);
  }
}

function collectDepthSections_(grid, prodCol) {
  var sections = [];
  if (!grid || !grid.length || !grid[0]) return sections;
  var numRows = grid.length;

  for (var r = 1; r < numRows; r++) {
    var val = cleanValue(grid[r][prodCol].value);
    if (val && val.indexOf('排') !== -1) {
      var depth = parseStackDepth_(val);
      var end = numRows - 1;
      for (var r2 = r + 1; r2 < numRows; r2++) {
        var v2 = cleanValue(grid[r2][prodCol].value);
        if (v2 && v2.indexOf('排') !== -1) {
          end = r2 - 1;
          break;
        }
      }
      sections.push({ depth: depth, headerRow: r, startRow: r + 1, endRow: end });
    }
  }

  return sections;
}

function normalizeWarehouseSheetDisplay(sheetName) {
  if (!WAREHOUSE_SHEET_PATTERN.test(sheetName)) {
    throw new Error('不允許處理此工作表: ' + sheetName);
  }

  var ss = getWarehouseSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到工作表: ' + sheetName);

  var grid = getSheetDataWithMergedResolved(sheet);
  if (!grid.length || !grid[0]) throw new Error('工作表沒有可處理的資料: ' + sheetName);

  var numCols = grid[0].length;
  var touchedGroups = 0;

  for (var col = 1; col < numCols; col++) {
    var slotVal = cleanValue(grid[0][col].value);
    if (slotVal === null || slotVal === '數量') continue;

    var prodCol = col;
    var qtyCol = col + 1;
    var sections = collectDepthSections_(grid, prodCol);

    for (var si = 0; si < sections.length; si++) {
      var section = sections[si];
      var sectionInfo = readDepthSection_(grid, prodCol, qtyCol, section);
      var lastGroupId = null;

      for (var pi = 0; pi < sectionInfo.pallets.length; pi++) {
        var pallet = sectionInfo.pallets[pi];
        var rows = pallet.rows || [];
        if (!rows.length) continue;

        var isNewGroup = (String(pallet.PalletGroupId || '') !== String(lastGroupId || ''));
        if (isNewGroup) {
          lastGroupId = pallet.PalletGroupId || ('idx_' + pi);
          touchedGroups += 1;
        }

        var firstRow = rows[0] + 1;
        var rowCount = rows.length;
        var weight = isNewGroup ? 'bold' : 'normal';

        sheet.getRange(firstRow, prodCol + 1, 1, 2)
          .setFontWeight(weight);
        if (rowCount > 1) {
          sheet.getRange(firstRow + 1, prodCol + 1, rowCount - 1, 2)
            .setFontWeight('normal');
        }

        // 保留原本顏色，只統一加上清楚的外框，讓人和程式都能辨識邊界
        sheet.getRange(firstRow, prodCol + 1, rowCount, 2)
          .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
      }
    }
  }

  SpreadsheetApp.flush();
  return { ok: true, sheet: sheetName, touchedGroups: touchedGroups };
}

function normalizeActiveWarehouseSheetDisplay() {
  var ss = getWarehouseSpreadsheet_();
  var sheet = null;

  try {
    sheet = ss.getActiveSheet();
  } catch (e) {
    sheet = null;
  }

  if (!sheet) {
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (WAREHOUSE_SHEET_PATTERN.test(sheets[i].getName())) {
        sheet = sheets[i];
        break;
      }
    }
  }

  if (!sheet) throw new Error('找不到可處理的工作表');
  return normalizeWarehouseSheetDisplay(sheet.getName());
}

function updateWarehousePallet(payload) {
  var normalized = normalizeUpdatePayload_(payload);
  var ss = getWarehouseSpreadsheet_();
  var sheet = ss.getSheetByName(normalized.oldData.Sheet);
  if (!sheet) throw new Error('找不到工作表: ' + normalized.oldData.Sheet);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var loc = findPalletLocationInSheet_(sheet, normalized.oldData.Sheet, normalized.oldData);
    var newData = normalized.newData;

    if (loc.format === 'white') {
      sheet.getRange(loc.skuRow + 1, loc.prodCol + 1).setValue(newData.SKU);
      sheet.getRange(loc.boxRow + 1, loc.qtyCol + 1).setValue(newData.BoxQty);
      sheet.getRange(loc.skuRow + 1, loc.prodCol + 1, 1, 2)
        .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
      SpreadsheetApp.flush();

      var whiteLocStr = normalized.oldData.Sheet + ' ' + normalized.oldData.Slot + '列 ' + normalized.oldData.Stack;
      appendLog_(payload.operator, '更新數量', {
        sku:   newData.SKU,
        batch: newData.Batch,
        from:  whiteLocStr,
        to:    whiteLocStr,
        note:  '箱:' + newData.BoxQty + ' 片:' + newData.PieceQty + (newData.SKU !== normalized.oldData.SKU ? ' 原品號:' + normalized.oldData.SKU : '')
      });

      return {
        ok: true,
        sheet: normalized.oldData.Sheet,
        zoneView: getWarehouseZoneView(normalized.oldData.Sheet),
        updatedAt: new Date().toISOString()
      };
    }

    sheet.getRange(loc.skuRow + 1, loc.prodCol + 1).setValue(newData.SKU);
    sheet.getRange(loc.batchRow + 1, loc.prodCol + 1).setValue(newData.Batch);
    sheet.getRange(loc.boxRow + 1, loc.qtyCol + 1).setValue(newData.BoxQty);
    sheet.getRange(loc.pieceRow + 1, loc.qtyCol + 1).setValue(newData.PieceQty);
    applyStatusStyle_(sheet, loc, newData.Status);
    // 加粗外框（整板 rows × 2 欄）
    sheet.getRange(loc.skuRow + 1, loc.prodCol + 1, loc.palletRows.length, 2)
      .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
    SpreadsheetApp.flush();

    var locStr = normalized.oldData.Sheet + ' ' + normalized.oldData.Slot + '列 ' + normalized.oldData.Stack;
    appendLog_(payload.operator, '更新數量', {
      sku:   newData.SKU,
      batch: newData.Batch,
      from:  locStr,
      to:    locStr,
      note:  '箱:' + newData.BoxQty + ' 片:' + newData.PieceQty + (newData.SKU !== normalized.oldData.SKU ? ' 原品號:' + normalized.oldData.SKU : '')
    });

    return {
      ok: true,
      sheet: normalized.oldData.Sheet,
      zoneView: getWarehouseZoneView(normalized.oldData.Sheet),
      updatedAt: new Date().toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

// ===== 移動棧板 =====

function findSlotProdCol_(grid, slotId) {
  if (!grid || !grid[0]) return -1;
  for (var c = 1; c < grid[0].length; c++) {
    var v = cleanValue(grid[0][c].value);
    if (String(v || '').trim() === String(slotId || '').trim()) return c;
  }
  return -1;
}

// 找到某 slot 欄中，指定深度（排）的列範圍（0-based, inclusive）
function findDepthRowRange_(grid, depth, prodCol) {
  var numRows = grid.length;
  var startRow = -1;
  for (var r = 0; r < numRows; r++) {
    var cellVal = cleanValue(grid[r][prodCol].value);
    if (cellVal && cellVal.indexOf('排') !== -1) {
      var d = parseStackDepth_(cellVal);
      if (d === depth) {
        startRow = r + 1;
      } else if (startRow >= 0) {
        return { startRow: startRow, endRow: r - 1 };
      }
    }
  }
  if (startRow >= 0) return { startRow: startRow, endRow: numRows - 1 };
  return null;
}

// 偵測深度排的格式：'colored'（prodCol 有彩色背景）或 'white'（全白，靠產品欄本身）
// 必須看 prodCol 的實際背景色，不能靠左側舊標籤
function detectDepthFormat_(grid, prodCol, range) {
  for (var r = range.startRow; r <= range.endRow; r++) {
    var cell = grid[r][prodCol];
    var val = cleanValue(cell.value);
    var bg = identifyBgColor(cell.bgColor);
    if (val === null || (val && val.indexOf('排') !== -1)) continue;
    if (bg !== 'WHITE') return 'colored';
  }
  return 'white';
}

// 取得白色格式的所有棧板列（白色 = 1 行 = 1 板）
function getWhiteSlotPairs_(grid, range, prodCol) {
  var pairs = [];
  for (var r = range.startRow; r <= range.endRow; r++) {
    var prodCell = grid[r] && grid[r][prodCol] ? grid[r][prodCol] : null;
    var prodVal = cleanValue(prodCell && prodCell.value);
    if (!prodVal) continue;
    if (prodVal.indexOf('排') !== -1) continue;
    pairs.push({ skuRow: r, batchRow: -1 });
  }
  return pairs;
}

// 讀取某深度排的所有棧板（同時支援白色格式和彩色格式）
// 回傳 { pallets: [...], format: 'white'|'colored', pairs: [...] }
function readDepthSection_(grid, prodCol, qtyCol, range) {
  var format = detectDepthFormat_(grid, prodCol, range);
  var pallets = [];

  if (format === 'white') {
    var pairs = getWhiteSlotPairs_(grid, range, prodCol);
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var val = cleanValue(grid[pair.skuRow][prodCol].value);
      if (val === null) continue;
      var cell = grid[pair.skuRow][prodCol];
      var batch = '無批號';
      var boxQty = parseFloat(cleanValue(grid[pair.skuRow][qtyCol].value)) || 0;
      var pieceQty = 0;
      var rows = [pair.skuRow];
      pallets.push({ rows: rows, sku: val, batch: batch, boxQty: boxQty, pieceQty: pieceQty, bgColor: 'WHITE', fontColor: identifyFontColor(cell.fontColor), format: 'white', pairIdx: i });
    }
    return { pallets: pallets, format: 'white', pairs: pairs };
  }

  // 分隔行偵測工具
  function isSepRow_(cell) {
    if (!cell) return false;
    var bg = String(cell.bgColor || '').toUpperCase().replace('#','');
    return bg === '1A3A6A' && !cleanValue(cell.value);
  }

  // 彩色格式：以「SKU 行 bold」作為新物理棧板的邊界標記
  // 若 bold 資訊不存在（舊資料），fallback 到同色塊偵測
  // 每 2 列一對（SKU + 批號），同一物理棧板的多對共用同一 PalletGroupId
  var r = range.startRow;
  var hasBoldMarkers = false;
  // 先掃一遍，判斷這段有無 bold 標記（新格式）
  for (var bsr = range.startRow; bsr <= range.endRow; bsr++) {
    var bsc = grid[bsr] && grid[bsr][prodCol];
    if (bsc && bsc.fontWeight === 'bold' && identifyBgColor(bsc.bgColor) !== 'WHITE') {
      hasBoldMarkers = true; break;
    }
  }

  if (hasBoldMarkers) {
    // ── 新格式：bold 標記棧板起點 ──────────────────────────────────
    var currentGroupId2 = null;
    while (r <= range.endRow) {
      var cell3 = grid[r] && grid[r][prodCol];
      if (!cell3) { r++; continue; }
      // 分隔行：跳過，重設群組讓下一板重新開始
      if (isSepRow_(cell3)) { currentGroupId2 = null; r++; continue; }
      var val3 = cleanValue(cell3.value);
      var bg3  = identifyBgColor(cell3.bgColor);
      if (val3 && val3.indexOf('排') !== -1) { r++; continue; }
      // 混合格式：彩色排段中夾雜的白色列，當成獨立白色棧板（1 列 = 1 板），不消耗下一列
      if (bg3 === 'WHITE') {
        if (val3 !== null) {
          var wq3 = parseFloat(cleanValue(grid[r][qtyCol] ? grid[r][qtyCol].value : null)) || 0;
          pallets.push({ rows: [r], sku: val3, batch: '無批號', boxQty: wq3, pieceQty: 0,
            bgColor: 'WHITE', fontColor: identifyFontColor(cell3.fontColor), format: 'white', PalletGroupId: 'wht_' + r });
        }
        currentGroupId2 = null;
        r++; continue;
      }
      if (val3 === null) { r++; continue; }
      // bold SKU 行 = 新物理棧板起點
      if (cell3.fontWeight === 'bold') currentGroupId2 = 'blk_' + r;
      if (currentGroupId2 === null) currentGroupId2 = 'blk_' + r; // 舊資料 fallback
      var batchR3 = r + 1;
      if (batchR3 > range.endRow) { r++; continue; }
      var batchCell3 = grid[batchR3] && grid[batchR3][prodCol];
      var sku3   = val3;
      var batch3 = (batchCell3 ? cleanValue(batchCell3.value) : null) || '無批號';
      var bq3 = parseFloat(cleanValue(cell3.value !== null && grid[r][qtyCol] ? grid[r][qtyCol].value : null)) || 0;
      var pq3 = batchCell3 ? (parseFloat(cleanValue(grid[batchR3][qtyCol] ? grid[batchR3][qtyCol].value : null)) || 0) : 0;
      // 修正：直接讀 qtyCol
      bq3 = parseFloat(cleanValue(grid[r][qtyCol] ? grid[r][qtyCol].value : null)) || 0;
      pq3 = parseFloat(cleanValue(grid[batchR3][qtyCol] ? grid[batchR3][qtyCol].value : null)) || 0;
      pallets.push({ rows: [r, batchR3], sku: sku3, batch: batch3, boxQty: bq3, pieceQty: pq3,
        bgColor: bg3, fontColor: identifyFontColor(cell3.fontColor), format: 'colored', PalletGroupId: currentGroupId2 });
      r += 2;
    }
  } else {
    // ── 舊格式 fallback：同色塊 = 同物理棧板（支援分隔行）───────────
    while (r <= range.endRow) {
      var cell2 = grid[r] && grid[r][prodCol];
      if (!cell2) { r++; continue; }
      // 分隔行：跳過
      if (isSepRow_(cell2)) { r++; continue; }
      var val2 = cleanValue(cell2.value);
      var bgColor = identifyBgColor(cell2.bgColor);
      if (val2 && val2.indexOf('排') !== -1) { r++; continue; }
      // 混合格式：彩色排段中夾雜的白色列，當成獨立白色棧板（1 列 = 1 板）
      if (bgColor === 'WHITE') {
        if (val2 !== null) {
          var wq2 = parseFloat(cleanValue(grid[r][qtyCol] ? grid[r][qtyCol].value : null)) || 0;
          pallets.push({ rows: [r], sku: val2, batch: '無批號', boxQty: wq2, pieceQty: 0,
            bgColor: 'WHITE', fontColor: identifyFontColor(cell2.fontColor), format: 'white', PalletGroupId: 'wht_' + r });
        }
        r++; continue;
      }
      if (val2 === null) { r++; continue; }
      var blockRows = [];
      var tempR = r;
      while (tempR <= range.endRow) {
        var tc = grid[tempR] && grid[tempR][prodCol];
        if (tc && identifyBgColor(tc.bgColor) === bgColor && cleanValue(tc.value) !== null) {
          blockRows.push(tempR); tempR++;
        } else break;
      }
      var blockGroupId = 'blk_' + r + '_' + bgColor;
      var numPairs = Math.floor(blockRows.length / 2);
      for (var pi = 0; pi < numPairs; pi++) {
        var skuR2 = blockRows[pi * 2], batchR2 = blockRows[pi * 2 + 1];
        var sku2 = cleanValue(grid[skuR2][prodCol].value) || '';
        var batch2 = cleanValue(grid[batchR2][prodCol].value) || '無批號';
        var bq2 = parseFloat(cleanValue(grid[skuR2][qtyCol] ? grid[skuR2][qtyCol].value : null)) || 0;
        var pq2 = parseFloat(cleanValue(grid[batchR2][qtyCol] ? grid[batchR2][qtyCol].value : null)) || 0;
        pallets.push({ rows: [skuR2, batchR2], sku: sku2, batch: batch2, boxQty: bq2, pieceQty: pq2,
          bgColor: bgColor, fontColor: identifyFontColor(cell2.fontColor), format: 'colored', PalletGroupId: blockGroupId });
      }
      r = tempR;
    }
  }
  return { pallets: pallets, format: 'colored', pairs: null };
}

function bgHexMove_(bgColor) {
  if (bgColor === 'YELLOW') return '#fff200';
  if (bgColor === 'RED')    return '#ff4444';
  if (bgColor === 'GREEN')  return '#00b050';
  return '#ffffff';
}
function fgHexMove_(fontColor) {
  if (fontColor === 'BLUE') return '#0000ff';
  if (fontColor === 'RED')  return '#ff0000';
  return '#000000';
}

// 寫回白色格式（白色 = 1 行 = 1 板）
function writeWhiteDepthPallets_(sheet, prodCol, qtyCol, pairs, newPallets) {
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var p = i < newPallets.length ? newPallets[i] : null;
    var bg = p ? bgHexMove_(p.bgColor) : '#ffffff';
    var fg = p ? fgHexMove_(p.fontColor) : '#000000';
    var sr = pair.skuRow + 1;
    sheet.getRange(sr, prodCol + 1).setValue(p ? p.sku : '').setBackground(bg).setFontColor(fg);
    sheet.getRange(sr, qtyCol + 1).setValue(p ? p.boxQty : '').setBackground(bg).setFontColor(fg);
    if (p) {
      sheet.getRange(sr, prodCol + 1, 1, 2)
        .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
    } else {
      sheet.getRange(sr, prodCol + 1, 1, 2)
        .setBorder(false, false, false, false, false, false);
    }
  }
}

// 寫回彩色格式
// 物理棧板邊界由「粗框線 + SKU 行 bold」標記，不靠顏色判斷
// 同一物理棧板（PalletGroupId 相同）的多個品號共用同一框，第一個品號 SKU 行 bold
function writeColoredDepthPallets_(sheet, prodCol, qtyCol, range, newPallets) {
  var totalRows = range.endRow - range.startRow + 1;
  var clearR = sheet.getRange(range.startRow + 1, prodCol + 1, totalRows, 2);
  clearR.setValue('').setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
  clearR.setBorder(false, false, false, false, false, false);

  var nextRow = range.startRow;
  var lastGroupId = null;
  // 追蹤目前這個物理棧板的起始列（用來畫整板外框）
  var groupStartRow = -1;
  var groupPalletCount = 0;

  // 先收集每個棧板組的範圍，再批次畫框
  var groupRanges = []; // [{ startRow, endRow }]

  for (var i = 0; i < newPallets.length; i++) {
    var p = newPallets[i];
    if (!p) continue;
    if (nextRow + 1 > range.endRow) break;

    var bg = bgHexMove_(p.bgColor);
    var fg = fgHexMove_(p.fontColor);

    // 白色棧板：1 列 = 1 板，不參與粗框分組
    if (p.format === 'white') {
      if (groupStartRow >= 0) {
        groupRanges.push({ startRow: groupStartRow, endRow: nextRow - 1 });
        groupStartRow = -1;
      }
      lastGroupId = null;
      sheet.getRange(nextRow + 1, prodCol + 1).setValue(p.sku).setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
      sheet.getRange(nextRow + 1, qtyCol + 1).setValue(p.boxQty).setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
      nextRow += 1;
      continue;
    }

    var groupId = String(p.PalletGroupId || p.PalletKey || ('idx_' + i));
    var isNewGroup = (groupId !== lastGroupId);

    if (isNewGroup) {
      // 前一組結束，記錄範圍
      if (groupStartRow >= 0) {
        groupRanges.push({ startRow: groupStartRow, endRow: nextRow - 1 });
      }
      groupStartRow = nextRow;
      lastGroupId = groupId;
    }

    if (nextRow + 1 > range.endRow) break;

    // SKU 行：新棧板組第一個品號 bold（棧板開始標記），其餘 normal
    var skuWeight = isNewGroup ? 'bold' : 'normal';
    sheet.getRange(nextRow + 1, prodCol + 1).setValue(p.sku).setBackground(bg).setFontColor(fg).setFontWeight(skuWeight);
    sheet.getRange(nextRow + 1, qtyCol + 1).setValue(p.boxQty).setBackground(bg).setFontColor(fg).setFontWeight(skuWeight);
    sheet.getRange(nextRow + 2, prodCol + 1).setValue(p.batch).setBackground(bg).setFontColor(fg).setFontWeight('normal');
    sheet.getRange(nextRow + 2, qtyCol + 1).setValue(p.pieceQty).setBackground(bg).setFontColor(fg).setFontWeight('normal');
    nextRow += 2;
  }
  // 最後一組
  if (groupStartRow >= 0 && nextRow > groupStartRow) {
    groupRanges.push({ startRow: groupStartRow, endRow: nextRow - 1 });
  }

  // 批次畫每個物理棧板的整體外框
  for (var gi = 0; gi < groupRanges.length; gi++) {
    var gr = groupRanges[gi];
    var rowCount = gr.endRow - gr.startRow + 1;
    sheet.getRange(gr.startRow + 1, prodCol + 1, rowCount, 2)
      .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
  }
}

// 寫回後重新掃描整個深度段，依色塊邊界重畫外框
// 確保不同物理棧板之間的邊界在 Excel 上永遠清晰
function reborderDepthSection_(sheet, prodCol, qtyCol, range) {
  try {
    var numRows = range.endRow - range.startRow + 1;
    if (numRows < 1) return;
    // 先清除整段所有框線
    sheet.getRange(range.startRow + 1, prodCol + 1, numRows, 2)
      .setBorder(false, false, false, false, false, false);
    // 重新讀取這段資料（flush 已在呼叫端執行）
    var freshGrid = getSheetDataWithMergedResolved(sheet);
    var r = range.startRow;
    while (r <= range.endRow) {
      var cell = freshGrid[r] && freshGrid[r][prodCol];
      if (!cell) { r++; continue; }
      var val = cleanValue(cell.value);
      var bg  = identifyBgColor(cell.bgColor);
      // 排標題列跳過
      if (val && val.indexOf('排') !== -1) { r++; continue; }
      // 白色格：1 行 = 1 板，直接以單列加框，不依賴 A 欄
      if (bg === 'WHITE') {
        if (val !== null) {
          sheet.getRange(r + 1, prodCol + 1, 1, 2)
            .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
        }
        r++; continue;
      }
      // 彩色格：收集整個同色塊，依「SKU 行 bold = 新棧板組開始」切分，每組一個外框
      if (val !== null) {
        var blockStart = r;
        var tempR2 = r;
        while (tempR2 <= range.endRow) {
          var tc2 = freshGrid[tempR2] && freshGrid[tempR2][prodCol];
          if (tc2 && identifyBgColor(tc2.bgColor) === bg && cleanValue(tc2.value) !== null) {
            tempR2++;
          } else break;
        }
        var blockLen = tempR2 - blockStart;
        if (blockLen > 0) {
          // 依每對 SKU 列的 fontWeight 切分棧板組（bold = 新組開始）
          var groupStart2 = blockStart;
          for (var bi = 0; bi < Math.floor(blockLen / 2); bi++) {
            var skuRow = blockStart + bi * 2;
            var skuCell = freshGrid[skuRow] && freshGrid[skuRow][prodCol];
            var isBold = skuCell && skuCell.fontWeight === 'bold';
            if (bi > 0 && isBold) {
              var prevRows2 = skuRow - groupStart2;
              sheet.getRange(groupStart2 + 1, prodCol + 1, prevRows2, 2)
                .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
              groupStart2 = skuRow;
            }
          }
          var lastRows2 = tempR2 - groupStart2;
          sheet.getRange(groupStart2 + 1, prodCol + 1, lastRows2, 2)
            .setBorder(true, true, true, true, false, false, '#1a3a6a', SpreadsheetApp.BorderStyle.SOLID_THICK);
        }
        r = tempR2; continue;
      }
      r++;
    }
  } catch(e) {
    Logger.log('reborderDepthSection_ 失敗: ' + e.toString());
    // 重畫失敗不影響主流程
  }
}

// 統一寫回（根據 sectionInfo.format 選擇路徑）
function writeDepthPallets_(sheet, prodCol, qtyCol, range, newPallets, sectionInfo) {
  if (sectionInfo && sectionInfo.format === 'white') {
    writeWhiteDepthPallets_(sheet, prodCol, qtyCol, sectionInfo.pairs, newPallets);
  } else {
    writeColoredDepthPallets_(sheet, prodCol, qtyCol, range, newPallets);
  }
}

// ===== 移動整個物理棧板組（多 SKU 同色塊）=====
function movePalletGroup(params) {
  var groupKeys   = params.groupKeys || [];
  var sourceSheet = String(params.sourceSheet || '').trim();
  var destSheet   = String(params.destSheet   || '').trim();
  var destSlot    = String(params.destSlot    || '').trim();
  var destDepth   = Number(params.destDepth   || 0);
  var destLevel   = Number(params.destLevel   || 1);

  if (!groupKeys.length) throw new Error('missing groupKeys');
  // Single pallet → delegate to movePallet
  if (groupKeys.length === 1) {
    return movePallet({ palletKey: groupKeys[0], sourceSheet: sourceSheet, destSheet: destSheet, destSlot: destSlot, destDepth: destDepth, destLevel: destLevel });
  }

  if (!WAREHOUSE_SHEET_PATTERN.test(sourceSheet)) throw new Error('source sheet not allowed: ' + sourceSheet);
  if (!WAREHOUSE_SHEET_PATTERN.test(destSheet))   throw new Error('dest sheet not allowed: ' + destSheet);
  if (!destSlot)   throw new Error('missing destSlot');
  if (destDepth < 1) throw new Error('invalid destDepth');
  if (destLevel < 1) destLevel = 1;

  // Parse SKU+Batch targets from keys
  var targets = [];
  for (var ki = 0; ki < groupKeys.length; ki++) {
    var kp = groupKeys[ki].split('||');
    targets.push({ sku: String(kp[4] || '').trim(), batch: String(kp[5] || '').trim() });
  }
  // Use first key for slot/depth
  var fp = groupKeys[0].split('||');
  var keySlot  = String(fp[1] || '').trim();
  var keyDepth = Number(fp[2] || 0);
  if (!keySlot || keyDepth < 1) throw new Error('groupKey 格式錯誤');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = getWarehouseSpreadsheet_();
    var srcSheetObj = ss.getSheetByName(sourceSheet);
    if (!srcSheetObj) throw new Error('source sheet not found: ' + sourceSheet);
    var srcGrid    = getSheetDataWithMergedResolved(srcSheetObj);
    var srcProdCol = findSlotProdCol_(srcGrid, keySlot);
    if (srcProdCol < 0) throw new Error('source slot col not found: ' + keySlot);
    var srcQtyCol  = srcProdCol + 1;
    var srcRange   = findDepthRowRange_(srcGrid, keyDepth, srcProdCol);
    if (!srcRange) throw new Error('source depth section not found');
    var srcSection = readDepthSection_(srcGrid, srcProdCol, srcQtyCol, srcRange);

    // Separate group members from remaining
    // 用「SKU+批號」配對，但同名棧板最多只抓 groupKeys 裡指定的數量
    // （避免同一排裡有另一個同 SKU+批號的不同物理棧板被誤抓）
    var targetCounts = {};
    for (var tci = 0; tci < targets.length; tci++) {
      var tck = targets[tci].sku + '||' + targets[tci].batch;
      targetCounts[tck] = (targetCounts[tck] || 0) + 1;
    }
    var groupPallets    = [];
    var remainingPallets = [];
    for (var si = 0; si < srcSection.pallets.length; si++) {
      var sp = srcSection.pallets[si];
      var spk = String(sp.sku).trim() + '||' + String(sp.batch).trim();
      if (targetCounts[spk] > 0) {
        groupPallets.push(sp);
        targetCounts[spk]--;
      } else {
        remainingPallets.push(sp);
      }
    }
    if (!groupPallets.length) throw new Error('group pallets not found, please refresh');

    var sameSheet = (sourceSheet === destSheet);
    var destSheetObj = sameSheet ? srcSheetObj : ss.getSheetByName(destSheet);
    if (!destSheetObj) throw new Error('dest sheet not found: ' + destSheet);
    var destGrid    = sameSheet ? srcGrid : getSheetDataWithMergedResolved(destSheetObj);
    var destProdCol = findSlotProdCol_(destGrid, destSlot);
    if (destProdCol < 0) throw new Error('dest slot col not found: ' + destSlot);
    var destQtyCol  = destProdCol + 1;
    var destRange   = findDepthRowRange_(destGrid, destDepth, destProdCol);
    if (!destRange) {
      var newGridGrp = createDepthSection_(destSheetObj, destGrid, destProdCol, destDepth);
      destGrid = newGridGrp;
      if (sameSheet) {
        // 重新定位群組成員
        var newSrcGridGrp = newGridGrp;
        var newSrcRangeGrp = findDepthRowRange_(newSrcGridGrp, keyDepth, srcProdCol);
        if (!newSrcRangeGrp) throw new Error('source depth section lost after auto-create');
        var newSrcSectionGrp = readDepthSection_(newSrcGridGrp, srcProdCol, srcQtyCol, newSrcRangeGrp);
        // 重新分組（同名棧板最多只抓指定數量）
        var targetCounts2 = {};
        for (var tci2 = 0; tci2 < targets.length; tci2++) {
          var tck2 = targets[tci2].sku + '||' + targets[tci2].batch;
          targetCounts2[tck2] = (targetCounts2[tck2] || 0) + 1;
        }
        groupPallets = [];
        remainingPallets = [];
        for (var gsc = 0; gsc < newSrcSectionGrp.pallets.length; gsc++) {
          var gsp2 = newSrcSectionGrp.pallets[gsc];
          var gspk2 = String(gsp2.sku).trim() + '||' + String(gsp2.batch).trim();
          var inGrp2 = targetCounts2[gspk2] > 0;
          if (inGrp2) { groupPallets.push(gsp2); targetCounts2[gspk2]--; } else { remainingPallets.push(gsp2); }
        }
        // 更新 src 參考
        srcGrid = newGridGrp;
        srcRange = newSrcRangeGrp;
        srcSection = newSrcSectionGrp;
      }
      destRange = findDepthRowRange_(destGrid, destDepth, destProdCol);
      if (!destRange) throw new Error('無法建立目的地排段');
    }
    var destSection = readDepthSection_(destGrid, destProdCol, destQtyCol, destRange);

    // ── sameLoc：同排重新排序，避免讀兩次相同資料造成複製 ──────────────
    var sameLoc = (sameSheet && keySlot === destSlot && keyDepth === destDepth);
    if (sameLoc) {
      var slInsAt = Math.max(0, Math.min(destLevel - 1, remainingPallets.length));
      var slReordered = [];
      for (var slr = 0; slr < slInsAt; slr++) slReordered.push(remainingPallets[slr]);
      for (var slg = 0; slg < groupPallets.length; slg++) slReordered.push(groupPallets[slg]);
      for (var slr2 = slInsAt; slr2 < remainingPallets.length; slr2++) slReordered.push(remainingPallets[slr2]);
      writeDepthPallets_(srcSheetObj, srcProdCol, srcQtyCol, srcRange, slReordered, srcSection);
      SpreadsheetApp.flush();
      var slResult = { ok: true, zoneView: getWarehouseZoneView(sourceSheet) };
      slResult.history = getMoveHistory();
      return slResult;
    }

    // ── 若來源是彩色格式、目的地是空的新排段（白格式但 pairs=[]），強制用 colored 路徑 ──
    if (srcSection.format !== 'white' && destSection.format === 'white' && (!destSection.pairs || destSection.pairs.length === 0)) {
      destSection = { pallets: [], format: 'colored', pairs: null };
    }

    // 整組搬移的棧板本來就是同一物理棧板，統一套用同一個 PalletGroupId，
    // 避免來源端各品號的 PalletGroupId 不一致導致目的地被拆成多個外框
    if (groupPallets.length > 1) {
      var sharedGroupId = 'mv_' + new Date().getTime();
      for (var sgp = 0; sgp < groupPallets.length; sgp++) {
        groupPallets[sgp].PalletGroupId = sharedGroupId;
      }
    }

    // Build new dest list (insert group at destLevel)
    var insAt = Math.max(0, Math.min(destLevel - 1, destSection.pallets.length));
    var newDestList = [];
    for (var dn = 0; dn < insAt; dn++) newDestList.push(destSection.pallets[dn]);
    for (var gi = 0; gi < groupPallets.length; gi++) newDestList.push(groupPallets[gi]);
    for (var dn2 = insAt; dn2 < destSection.pallets.length; dn2++) newDestList.push(destSection.pallets[dn2]);

    // 先寫來源並刪除多餘列，再處理目的地。這樣同頁面時，目的地往上插不會回頭碰到來源。
    writeDepthPallets_(srcSheetObj, srcProdCol, srcQtyCol, srcRange, remainingPallets, srcSection);

    var srcDeleted = 0;
    if (srcSection.format === 'white') {
      var srcUsed = Math.max(1, remainingPallets.length);
      var srcTotal = srcRange.endRow - srcRange.startRow + 1;
      var srcToDelete = srcTotal - srcUsed;
      if (srcToDelete > 0) {
        srcSheetObj.deleteRows(srcRange.startRow + srcUsed + 1, srcToDelete);
        srcDeleted = srcToDelete;
      }
    } else {
      var srcUsed = Math.max(2, remainingPallets.length * 2);
      var srcTotal = srcRange.endRow - srcRange.startRow + 1;
      var srcToDelete = srcTotal - srcUsed;
      if (srcToDelete > 0) {
        srcSheetObj.deleteRows(srcRange.startRow + srcUsed + 1, srcToDelete);
        srcDeleted = srcToDelete;
      }
    }

    if (sameSheet && srcDeleted > 0 && destRange.startRow > srcRange.endRow) {
      destRange = { startRow: destRange.startRow - srcDeleted, endRow: destRange.endRow - srcDeleted };
    }

    // Auto-expand dest if needed
    if (destSection.format === 'white' && destSection.pairs && destSection.pairs.length > 0) {
      var maxWhite = destSection.pairs.length;
      if (newDestList.length > maxWhite) {
        var extraNeeded = newDestList.length - maxWhite;
        var lastPairW = destSection.pairs[destSection.pairs.length - 1];
        var insertAfterW = lastPairW.skuRow + 1;
        destSheetObj.insertRowsAfter(insertAfterW, extraNeeded);
        var newDestGridW = getSheetDataWithMergedResolved(destSheetObj);
        destRange   = findDepthRowRange_(newDestGridW, destDepth, destProdCol);
        destSection = readDepthSection_(newDestGridW, destProdCol, destQtyCol, destRange);

        // 同一張表時，目的地往上插列會讓來源區段整段位移，重新讀取 range
        // （來源資料已寫入完成，不需重新搜尋棧板）
        if (sameSheet && srcRange.startRow >= insertAfterW) {
          srcGrid = newDestGridW;
          srcRange = findDepthRowRange_(srcGrid, keyDepth, srcProdCol) || srcRange;
        }
      }
    } else {
      var destTotalRows = destRange.endRow - destRange.startRow + 1;
      var neededRows    = newDestList.length * 2;
      if (neededRows > destTotalRows) {
        var extraRows = neededRows - destTotalRows;
        var insertAfterColor = destRange.endRow + 1;
        destSheetObj.insertRowsAfter(insertAfterColor, extraRows);
        destRange = { startRow: destRange.startRow, endRow: destRange.endRow + extraRows };

        // 同頁面且插入點在來源上方時，來源 row index 會整段下移，重新讀取 range
        // （來源資料已寫入完成，不需重新搜尋棧板）
        if (sameSheet && insertAfterColor <= srcRange.startRow + 1) {
          srcGrid = getSheetDataWithMergedResolved(srcSheetObj);
          srcRange = findDepthRowRange_(srcGrid, keyDepth, srcProdCol) || srcRange;
        }
      }
    }
    writeDepthPallets_(destSheetObj, destProdCol, destQtyCol, destRange, newDestList, destSection);
    SpreadsheetApp.flush();
    if (sameSheet) {
      var refreshedSrcGrid = getSheetDataWithMergedResolved(srcSheetObj);
      srcRange = findDepthRowRange_(refreshedSrcGrid, keyDepth, srcProdCol) || srcRange;
    }
    reborderDepthSection_(srcSheetObj, srcProdCol, srcQtyCol, srcRange);
    if (!sameSheet) reborderDepthSection_(destSheetObj, destProdCol, destQtyCol, destRange);
    else reborderDepthSection_(srcSheetObj, destProdCol, destQtyCol, destRange);

    // 5. History（群組：儲存每個品號的 SKU+Batch 以支援 undo/redo）
    pushMoveToHistory_({
      isGroup:      true,
      groupSKUBatch: groupPallets.map(function(p){ return { sku: p.sku, batch: p.batch }; }),
      sku:           groupPallets.map(function(p){ return p.sku; }).join('+'),
      batch:         groupPallets[0].batch,
      fromSheet: sourceSheet, fromSlot: keySlot, fromDepth: keyDepth, fromLevel: 1,
      toSheet:   destSheet,   toSlot:  destSlot, toDepth:  destDepth, toLevel:  destLevel
    });

    // 6. 操作記錄（每個品號各記一筆）
    var fromStr = sourceSheet + ' ' + keySlot + '列 第' + keyDepth + '排';
    var toStr   = destSheet   + ' ' + destSlot + '列 第' + destDepth + '排';
    groupPallets.forEach(function(p) {
      appendLog_(params.operator, '群組移動', {
        sku:   p.sku,
        batch: p.batch,
        from:  fromStr,
        to:    toStr,
        note:  '同板共 ' + groupPallets.length + ' 品號'
      });
    });

    var result;
    if (sameSheet) {
      result = { ok: true, zoneView: getWarehouseZoneView(sourceSheet) };
    } else {
      result = { ok: true, sourceZoneView: getWarehouseZoneView(sourceSheet), destZoneView: getWarehouseZoneView(destSheet) };
    }
    result.history = getMoveHistory();
    return result;
  } finally {
    lock.releaseLock();
  }
}

// 在指定 slot 欄自動建立不存在的排段（插入排標題 + 2 列空資料列）
// 回傳插列後的新 grid（需呼叫端自行更新 srcGrid 參考）
function createDepthSection_(sheet, grid, prodCol, newDepth) {
  if (newDepth < 1) throw new Error('createDepthSection_: invalid depth ' + newDepth + '，請確認目標排次是否正確');
  var numRows = grid.length;
  // 掃描此欄現有的排，找出插入位置
  var sections = [];
  for (var r = 1; r < numRows; r++) {
    var val = cleanValue(grid[r][prodCol].value);
    if (val && val.indexOf('排') !== -1) {
      var d = parseStackDepth_(val);
      var end = numRows - 1;
      // 找這排的結束列（下一個排標題之前）
      for (var r2 = r + 1; r2 < numRows; r2++) {
        var v2 = cleanValue(grid[r2][prodCol].value);
        if (v2 && v2.indexOf('排') !== -1) { end = r2 - 1; break; }
      }
      sections.push({ depth: d, headerRow: r, endRow: end });
    }
  }

  // 決定插入點（0-based row，insertRowsAfter 用 1-based）
  var insertAfter0 = 0; // 預設：在最頂端
  for (var si = 0; si < sections.length; si++) {
    if (sections[si].depth < newDepth) {
      insertAfter0 = sections[si].endRow;   // 放在這排末列後
    } else if (sections[si].depth > newDepth) {
      insertAfter0 = sections[si].headerRow - 1; // 放在下一個排的前面
      break;
    }
  }

  // 插入 3 列（1 排標題 + 2 空資料列），寫排標題
  var insertAfter1b = insertAfter0 + 1;
  sheet.insertRowsAfter(insertAfter1b, 3);
  sheet.getRange(insertAfter1b + 1, prodCol + 1).setValue(depthLabel_(newDepth));

  return getSheetDataWithMergedResolved(sheet);
}

function movePallet(params) {
  var palletKey   = String(params.palletKey   || '').trim();
  var sourceSheet = String(params.sourceSheet || '').trim();
  var destSheet   = String(params.destSheet   || '').trim();
  var destSlot    = String(params.destSlot    || '').trim();
  var destDepth   = Number(params.destDepth   || 0);
  var destLevel   = Number(params.destLevel   || 1);

  if (!palletKey)   throw new Error('missing palletKey');
  if (!WAREHOUSE_SHEET_PATTERN.test(sourceSheet)) throw new Error('source sheet not allowed: ' + sourceSheet);
  if (!WAREHOUSE_SHEET_PATTERN.test(destSheet))   throw new Error('dest sheet not allowed: ' + destSheet);
  if (!destSlot)    throw new Error('missing destSlot');
  if (destDepth < 1) throw new Error('invalid destDepth');
  if (destLevel < 1) destLevel = 1;

  // 從 palletKey 拆出 Slot / Depth / SKU / Batch（忽略 Level，Level 動態變動不可靠）
  // PalletKey 格式：Sheet||Slot||Depth||Level||SKU||Batch
  var keyParts  = palletKey.split('||');
  var keySKU    = String(keyParts[4] || '').trim();
  var keyBatch  = String(keyParts[5] || '').trim();
  var keySlot   = String(keyParts[1] || '').trim();
  var keyDepth  = Number(keyParts[2] || 0);
  var keyLevel  = Number(keyParts[3] || 0);
  if (!keySlot || keyDepth < 1) throw new Error('palletKey 格式錯誤');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = getWarehouseSpreadsheet_();
    var srcSheetObj = ss.getSheetByName(sourceSheet);
    if (!srcSheetObj) throw new Error('source sheet not found: ' + sourceSheet);

    var srcGrid    = getSheetDataWithMergedResolved(srcSheetObj);
    var srcSlot    = keySlot;
    var srcDepth   = keyDepth;

    var srcProdCol = findSlotProdCol_(srcGrid, srcSlot);
    if (srcProdCol < 0) throw new Error('source slot col not found: ' + srcSlot);
    var srcQtyCol  = srcProdCol + 1;

    var srcRange = findDepthRowRange_(srcGrid, srcDepth, srcProdCol);
    if (!srcRange) throw new Error('source depth section not found');

    var srcSection = readDepthSection_(srcGrid, srcProdCol, srcQtyCol, srcRange);
    var srcDepthPallets = srcSection.pallets;

    // 用 SKU+Batch 找棧板；若同一排有多個 SKU+Batch 完全相同的棧板（不同顏色/數量），
    // 用 PalletKey 帶的 Level 挑出最接近的那一個，避免誤抓第一個同名棧板
    var srcLevelIdx = -1;
    var srcCandidates = [];
    for (var i = 0; i < srcDepthPallets.length; i++) {
      if (String(srcDepthPallets[i].sku).trim() === keySKU &&
          String(srcDepthPallets[i].batch).trim() === keyBatch) {
        srcCandidates.push(i);
      }
    }
    if (srcCandidates.length === 1) {
      srcLevelIdx = srcCandidates[0];
    } else if (srcCandidates.length > 1) {
      srcLevelIdx = srcCandidates.indexOf(keyLevel - 1) >= 0 ? (keyLevel - 1) : srcCandidates[0];
    }
    if (srcLevelIdx < 0) throw new Error('pallet not found (SKU=' + keySKU + ' Batch=' + keyBatch + '), please refresh');
    var movingData = srcDepthPallets[srcLevelIdx];
    if (!movingData) throw new Error('source pallet is empty');

    // 移除來源棧板，剩餘往下補
    var newSrcList = [];
    for (var k = 0; k < srcDepthPallets.length; k++) {
      if (k !== srcLevelIdx) newSrcList.push(srcDepthPallets[k]);
    }

    var sameSheet = (sourceSheet === destSheet);
    var sameLoc   = (sameSheet && srcSlot === destSlot && srcDepth === destDepth);
    // srcLevel（1-based）從實際找到的 index 推算，供後續邏輯使用
    var srcLevel  = srcLevelIdx + 1;

    if (sameLoc) {
      // 同排重新排序（不記入還原歷史，因為只是換層）
      var insAt = Math.max(0, Math.min(destLevel - 1, newSrcList.length));
      var reordered = [];
      for (var m = 0; m < insAt; m++) reordered.push(newSrcList[m]);
      reordered.push(movingData);
      for (var m2 = insAt; m2 < newSrcList.length; m2++) reordered.push(newSrcList[m2]);
      writeDepthPallets_(srcSheetObj, srcProdCol, srcQtyCol, srcRange, reordered, srcSection);
      SpreadsheetApp.flush();
      reborderDepthSection_(srcSheetObj, srcProdCol, srcQtyCol, srcRange);
      var samLocResult = { ok: true, zoneView: getWarehouseZoneView(sourceSheet) };
      samLocResult.history = getMoveHistory();
      return samLocResult;
    }

    // 不同格子或不同工作表
    var destSheetObj = sameSheet ? srcSheetObj : ss.getSheetByName(destSheet);
    if (!destSheetObj) throw new Error('dest sheet not found: ' + destSheet);
    var destGrid     = sameSheet ? srcGrid : getSheetDataWithMergedResolved(destSheetObj);
    var destProdCol  = findSlotProdCol_(destGrid, destSlot);
    if (destProdCol < 0) throw new Error('dest slot col not found: ' + destSlot);
    var destQtyCol   = destProdCol + 1;
    var destRange    = findDepthRowRange_(destGrid, destDepth, destProdCol);
    if (!destRange) {
      // 目的地排不存在 → 自動建立排段，插列後重新讀取所有參考
      var newGridAfterCreate = createDepthSection_(destSheetObj, destGrid, destProdCol, destDepth);
      if (sameSheet) {
        // 同 sheet：srcGrid 也因插列偏移，需重新讀取並重新定位來源棧板
        srcGrid = newGridAfterCreate;
        destGrid = newGridAfterCreate;
        srcRange = findDepthRowRange_(srcGrid, srcDepth, srcProdCol);
        if (!srcRange) throw new Error('source depth section lost after auto-create');
        srcSection = readDepthSection_(srcGrid, srcProdCol, srcQtyCol, srcRange);
        srcLevelIdx = -1;
        for (var sc2 = 0; sc2 < srcSection.pallets.length; sc2++) {
          if (String(srcSection.pallets[sc2].sku).trim() === keySKU && String(srcSection.pallets[sc2].batch).trim() === keyBatch) {
            srcLevelIdx = sc2; break;
          }
        }
        if (srcLevelIdx < 0) throw new Error('pallet not found (SKU=' + keySKU + ') after auto-create re-read, please refresh');
        movingData = srcSection.pallets[srcLevelIdx];
        newSrcList = [];
        for (var sc3 = 0; sc3 < srcSection.pallets.length; sc3++) {
          if (sc3 !== srcLevelIdx) newSrcList.push(srcSection.pallets[sc3]);
        }
      } else {
        destGrid = newGridAfterCreate;
      }
      destRange = findDepthRowRange_(destGrid, destDepth, destProdCol);
      if (!destRange) throw new Error('無法建立目的地排段，請確認此格子有排標題');
    }
    var destSection  = readDepthSection_(destGrid, destProdCol, destQtyCol, destRange);
    var destDepthPallets = destSection.pallets;

    var insAt2 = Math.max(0, Math.min(destLevel - 1, destDepthPallets.length));
    var newDestList = [];
    for (var n = 0; n < insAt2; n++) newDestList.push(destDepthPallets[n]);
    newDestList.push(movingData);
    for (var n2 = insAt2; n2 < destDepthPallets.length; n2++) newDestList.push(destDepthPallets[n2]);

    // 若來源是彩色格式、目的地是空的新排段（白格式但 pairs=[]），強制用 colored 路徑
    if (srcSection.format !== 'white' && destSection.format === 'white' && (!destSection.pairs || destSection.pairs.length === 0)) {
      destSection = { pallets: [], format: 'colored', pairs: null };
    }

    // 先把來源寫穩，再處理目的地插列。這樣同頁面時，目的地往上插也不會回頭影響來源。
    writeDepthPallets_(srcSheetObj, srcProdCol, srcQtyCol, srcRange, newSrcList, srcSection);

    var srcDeleted = 0;
    if (srcSection.format === 'white') {
      var srcUsedRows  = Math.max(1, newSrcList.length);
      var srcTotalRows = srcRange.endRow - srcRange.startRow + 1;
      var srcToDelete  = srcTotalRows - srcUsedRows;
      if (srcToDelete > 0) {
        srcSheetObj.deleteRows(srcRange.startRow + srcUsedRows + 1, srcToDelete);
        srcDeleted = srcToDelete;
      }
    } else {
      var srcUsedRows  = Math.max(2, newSrcList.length * 2);
      var srcTotalRows = srcRange.endRow - srcRange.startRow + 1;
      var srcToDelete  = srcTotalRows - srcUsedRows;
      if (srcToDelete > 0) {
        srcSheetObj.deleteRows(srcRange.startRow + srcUsedRows + 1, srcToDelete);
        srcDeleted = srcToDelete;
      }
    }

    if (sameSheet && srcDeleted > 0 && destRange.startRow > srcRange.endRow) {
      destRange = { startRow: destRange.startRow - srcDeleted, endRow: destRange.endRow - srcDeleted };
    }

    // 確認目的地有足夠空位，兩種格式都支援自動擴充
    if (destSection.format === 'white' && destSection.pairs && destSection.pairs.length > 0) {
      var maxWhite = destSection.pairs.length;
      if (newDestList.length > maxWhite) {
        // 白色格式自動擴充：在最後一個 pair 末列後插入所需列
        var extraNeeded = newDestList.length - maxWhite;
        var lastPairW = destSection.pairs[destSection.pairs.length - 1];
        var insertAfterW1b = lastPairW.skuRow + 1; // 0-based → 1-based
        destSheetObj.insertRowsAfter(insertAfterW1b, extraNeeded);
        // 插列後重新讀取，確保 row index 正確
        var newDestGridW = getSheetDataWithMergedResolved(destSheetObj);
        destRange   = findDepthRowRange_(newDestGridW, destDepth, destProdCol);
        destSection = readDepthSection_(newDestGridW, destProdCol, destQtyCol, destRange);
        // 若同一 sheet 且 src 在插入點下方，srcRange row index 會偏移，重新讀取 range（來源資料已寫入完成，不需重新搜尋棧板）
        if (sameSheet && srcRange.startRow >= insertAfterW1b) {
          srcGrid   = newDestGridW;
          srcRange  = findDepthRowRange_(srcGrid, srcDepth, srcProdCol) || srcRange;
        }
      }
    } else {
      var destTotalRows = destRange.endRow - destRange.startRow + 1;
      var neededRows    = newDestList.length * 2;
      if (neededRows > destTotalRows) {
        var extraRows = neededRows - destTotalRows;
        // 在該排最後一列之後自動插入所需的列（1-based row index）
        var insertAfterColor = destRange.endRow + 1;
        destSheetObj.insertRowsAfter(insertAfterColor, extraRows);
        destRange = { startRow: destRange.startRow, endRow: destRange.endRow + extraRows };

        // 同頁面且插入點在來源上方時，來源 row index 會整段下移，重新讀取 range（來源資料已寫入完成，不需重新搜尋棧板）
        if (sameSheet && insertAfterColor <= srcRange.startRow + 1) {
          srcGrid = getSheetDataWithMergedResolved(srcSheetObj);
          srcRange = findDepthRowRange_(srcGrid, srcDepth, srcProdCol) || srcRange;
        }
      }
    }
    // 4. 寫目的地（已在上方處理過 insert rows）
    writeDepthPallets_(destSheetObj, destProdCol, destQtyCol, destRange, newDestList, destSection);
    SpreadsheetApp.flush();
    if (sameSheet) {
      var refreshedSrcGrid2 = getSheetDataWithMergedResolved(srcSheetObj);
      srcRange = findDepthRowRange_(refreshedSrcGrid2, srcDepth, srcProdCol) || srcRange;
    }
    reborderDepthSection_(srcSheetObj, srcProdCol, srcQtyCol, srcRange);
    if (!sameSheet) reborderDepthSection_(destSheetObj, destProdCol, destQtyCol, destRange);
    else reborderDepthSection_(srcSheetObj, destProdCol, destQtyCol, destRange);

    // 5. 記錄到還原歷史
    pushMoveToHistory_({
      sku:       keySKU,
      batch:     keyBatch,
      fromSheet: sourceSheet,
      fromSlot:  srcSlot,
      fromDepth: srcDepth,
      fromLevel: srcLevel,
      toSheet:   destSheet,
      toSlot:    destSlot,
      toDepth:   destDepth,
      toLevel:   destLevel
    });

    // 6. 操作記錄
    appendLog_(params.operator, '移動', {
      sku:   keySKU,
      batch: keyBatch,
      from:  sourceSheet + ' ' + srcSlot + '列 第' + srcDepth + '排 第' + srcLevel + '層',
      to:    destSheet   + ' ' + destSlot + '列 第' + destDepth + '排 第' + destLevel + '層'
    });

    var moveResult;
    if (sameSheet) {
      moveResult = { ok: true, zoneView: getWarehouseZoneView(sourceSheet) };
    } else {
      moveResult = {
        ok: true,
        sourceZoneView: getWarehouseZoneView(sourceSheet),
        destZoneView:   getWarehouseZoneView(destSheet)
      };
    }
    moveResult.history = getMoveHistory();
    return moveResult;
  } finally {
    lock.releaseLock();
  }
}
