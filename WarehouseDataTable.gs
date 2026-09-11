/**
 * [方案 A] 資料庫表格引擎 (Data Table Engine)
 * 當分頁存在 _TABLE (如 B-G區_TABLE) 時，優先採用表格模式進行讀寫與搬移
 */

var DATA_TABLE_HEADERS = [
  'PalletID', 'Sheet', 'Slot', 'Depth', 'Level',
  'SKU', 'Batch', 'BoxQty', 'PieceQty',
  'Status', 'BgColor', 'FontColor', 'PalletGroupId', 'Remarks', 'UpdatedAt'
];

function isDataTableMode_(sheetName) {
  var ss = getWarehouseSpreadsheet_();
  return ss.getSheetByName(sheetName + '_TABLE') !== null;
}

function getDataTableSheet_(sheetName) {
  var ss = getWarehouseSpreadsheet_();
  return ss.getSheetByName(sheetName + '_TABLE') || ss.getSheetByName(sheetName);
}

function readDataTablePallets_(sheetName) {
  var targetName = isDataTableMode_(sheetName) ? (sheetName + '_TABLE') : sheetName;
  var ss = getWarehouseSpreadsheet_();
  var sheet = ss.getSheetByName(targetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var pallets = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var pid = String(row[0] || '').trim();
    if (!pid) continue;

    var depth = Number(row[3] || 0);
    var level = Number(row[4] || 0);
    var sku = String(row[5] || '').trim();
    var batch = String(row[6] || '無批號').trim();

    var zoneChar = sheetName ? sheetName.charAt(0) : '';
    var specs = typeof lookupCatalogSpecs_ === 'function' ? lookupCatalogSpecs_(sku, zoneChar) : null;

    var pallet = {
      PalletID: pid,
      Sheet: String(row[1] || sheetName),
      Slot: String(row[2] || ''),
      Depth: depth,
      DepthLabel: depthLabel_(depth),
      Level: level,
      SKU: sku,
      Batch: batch || '無批號',
      BoxQty: Number(row[7] || 0),
      PieceQty: Number(row[8] || 0),
      Status: String(row[9] || '正常庫存'),
      BgColor: String(row[10] || 'WHITE'),
      FontColor: String(row[11] || 'BLACK'),
      IsLastPallet: String(row[9] || '') === '最後一板' || String(row[11] || '') === 'BLUE',
      PalletGroupId: String(row[12] || pid),
      Remarks: String(row[13] || ''),
      UpdatedAt: row[14] || '',
      Brand: specs ? (specs.Brand || '') : '',
      Series: specs ? (specs.Series || specs.ChineseSeries || '') : '',
      ChineseSeries: specs ? (specs.ChineseSeries || '') : '',
      OriginalName: specs ? (specs.OriginalName || '') : '',
      Size: specs ? (specs.Size || '') : '',
      PiecesPerBox: specs ? (specs.PiecesPerBox || null) : null,
      SinglePieceImage: specs ? (specs.SinglePieceImage || '') : ''
    };
    pallet.PalletKey = makePalletKey_(pallet);
    pallets.push(pallet);
  }
  return pallets;
}

function writeDataTablePallets_(sheetName, pallets) {
  var targetName = sheetName + '_TABLE';
  var ss = getWarehouseSpreadsheet_();
  var sheet = ss.getSheetByName(targetName);
  if (!sheet) {
    sheet = ss.insertSheet(targetName);
  } else {
    sheet.clear();
  }

  var rows = [DATA_TABLE_HEADERS];
  var nowStr = new Date().toISOString();

  // 按 Slot, Depth, Level 排序
  pallets.sort(function(a, b) {
    if (String(a.Slot) !== String(b.Slot)) return compareSlotLikeText_(String(a.Slot), String(b.Slot));
    if (Number(a.Depth) !== Number(b.Depth)) return Number(a.Depth) - Number(b.Depth);
    return Number(a.Level) - Number(b.Level);
  });

  // 重新整理為連續的 Level (1, 2, 3...)，修正空隙
  var currentGroupKey = '';
  var currentLevel = 0;
  for (var k = 0; k < pallets.length; k++) {
    var pGroupKey = String(pallets[k].Slot) + '||' + Number(pallets[k].Depth);
    if (pGroupKey !== currentGroupKey) {
      currentGroupKey = pGroupKey;
      currentLevel = 1;
    } else {
      currentLevel++;
    }
    pallets[k].Level = currentLevel;
    pallets[k].DepthLabel = depthLabel_(pallets[k].Depth);
    pallets[k].PalletKey = makePalletKey_(pallets[k]);
  }

  var rows = [DATA_TABLE_HEADERS];
  var nowStr = new Date().toISOString();

  for (var i = 0; i < pallets.length; i++) {
    var p = pallets[i];
    var pid = p.PalletID || ('P_' + p.Sheet + '_' + p.Slot + '_' + p.Depth + '_' + p.Level + '_' + (i + 1));
    rows.push([
      pid,
      p.Sheet || sheetName,
      p.Slot || '',
      p.Depth || 0,
      p.Level || 0,
      p.SKU || '',
      p.Batch || '無批號',
      p.BoxQty || 0,
      p.PieceQty || 0,
      p.Status || '正常庫存',
      p.BgColor || 'WHITE',
      p.FontColor || 'BLACK',
      p.PalletGroupId || pid,
      p.Remarks || '',
      nowStr
    ]);
  }

  sheet.clear();
  sheet.getRange(1, 1, rows.length, DATA_TABLE_HEADERS.length).setValues(rows);
  sheet.getRange(1, 1, 1, DATA_TABLE_HEADERS.length).setFontWeight('bold').setBackground('#1f2d42').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  if (typeof invalidateCache_ === 'function') {
    invalidateCache_();
  }
}

function findPalletIndex_(pallets, key, oldObj) {
  if (!pallets || !pallets.length) return -1;
  var keyStr = String(key || '').trim();

  // 1. 完全比對 PalletKey 或 PalletID
  if (keyStr) {
    for (var i = 0; i < pallets.length; i++) {
      if (pallets[i].PalletKey === keyStr || pallets[i].PalletID === keyStr) return i;
    }
  }

  var old = oldObj || {};
  var targetSKU = String(old.SKU || '').trim();
  var targetBatch = String(old.Batch || '').trim();
  var targetSlot = String(old.Slot || '').trim();
  var targetDepth = Number(old.Depth || 0);
  var targetLevel = Number(old.Level || 0);

  // 如果 key 是 PalletKey 格式 (A||B||C||D||E||F)
  if (keyStr.indexOf('||') !== -1) {
    var parts = keyStr.split('||');
    if (!targetSlot) targetSlot = String(parts[1] || '').trim();
    if (!targetDepth) targetDepth = Number(parts[2] || 0);
    if (!targetLevel) targetLevel = Number(parts[3] || 0);
    if (!targetSKU) targetSKU = String(parts[4] || '').trim();
    if (!targetBatch) targetBatch = String(parts[5] || '').trim();
  }

  // 2. 比對 Slot + Depth + Level + SKU + Batch
  for (var j = 0; j < pallets.length; j++) {
    var p = pallets[j];
    if (String(p.Slot).trim() === targetSlot && Number(p.Depth) === targetDepth &&
        String(p.SKU).trim() === targetSKU && String(p.Batch).trim() === targetBatch) {
      if (targetLevel > 0 && Number(p.Level) === targetLevel) return j;
    }
  }

  // 3. 比對 Slot + Depth + SKU + Batch
  for (var k = 0; k < pallets.length; k++) {
    var p2 = pallets[k];
    if (String(p2.Slot).trim() === targetSlot && Number(p2.Depth) === targetDepth &&
        String(p2.SKU).trim() === targetSKU && String(p2.Batch).trim() === targetBatch) {
      return k;
    }
  }

  // 4. 比對 Slot + SKU + Batch
  for (var m = 0; m < pallets.length; m++) {
    var p3 = pallets[m];
    if (String(p3.Slot).trim() === targetSlot && String(p3.SKU).trim() === targetSKU && String(p3.Batch).trim() === targetBatch) {
      return m;
    }
  }

  // 5. 比對 SKU + Batch
  if (targetSKU) {
    for (var n = 0; n < pallets.length; n++) {
      var p4 = pallets[n];
      if (String(p4.SKU).trim() === targetSKU && String(p4.Batch).trim() === targetBatch) {
        return n;
      }
    }
  }

  // 6. 極致 Fallback: 單純比對 SKU
  if (targetSKU) {
    for (var x = 0; x < pallets.length; x++) {
      if (String(pallets[x].SKU).trim() === targetSKU) {
        return x;
      }
    }
  }

  return -1;
}

function movePalletDataTable_(p) {
  var srcSheetName = p.sourceSheet || p.Sheet;
  var destSheetName = p.destSheet || srcSheetName;

  var srcPallets = readDataTablePallets_(srcSheetName);
  var destPallets = (srcSheetName === destSheetName) ? srcPallets : readDataTablePallets_(destSheetName);

  // 找到被移動的棧板
  var key = p.palletKey;
  var srcIdx = findPalletIndex_(srcPallets, key);

  if (srcIdx < 0) {
    throw new Error('找不到搬移目標棧板 key: ' + key);
  }

  var movingPallet = srcPallets[srcIdx];
  // 從來源移除
  srcPallets.splice(srcIdx, 1);

  // 計算目的地 Slot & Depth 目前最大 Level
  var destSlot = String(p.destSlot);
  var destDepth = Number(p.destDepth);
  var currentMaxLevel = 0;

  for (var j = 0; j < destPallets.length; j++) {
    if (destPallets[j].Slot === destSlot && Number(destPallets[j].Depth) === destDepth) {
      currentMaxLevel = Math.max(currentMaxLevel, Number(destPallets[j].Level || 0));
    }
  }

  // 修改被移動棧板屬性
  movingPallet.Sheet = destSheetName;
  movingPallet.Slot = destSlot;
  movingPallet.Depth = destDepth;
  movingPallet.Level = currentMaxLevel + 1;
  movingPallet.PalletKey = makePalletKey_(movingPallet);
  movingPallet.UpdatedAt = new Date().toISOString();

  // 加入目的地
  if (srcSheetName === destSheetName) {
    srcPallets.push(movingPallet);
    writeDataTablePallets_(srcSheetName, srcPallets);
  } else {
    writeDataTablePallets_(srcSheetName, srcPallets);
    destPallets.push(movingPallet);
    writeDataTablePallets_(destSheetName, destPallets);
  }

  appendLog_(p.operator, '移動棧板 (數據表)', {
    sku: movingPallet.SKU,
    batch: movingPallet.Batch,
    from: srcSheetName + ' ' + p.sourceSlot + ' D' + p.sourceDepth,
    to: destSheetName + ' ' + destSlot + ' D' + destDepth,
    note: movingPallet.Remarks
  });

  var res = {
    ok: true,
    zoneView: getWarehouseZoneView(srcSheetName),
    sourceZoneView: getWarehouseZoneView(srcSheetName),
    history: typeof getMoveHistory === 'function' ? getMoveHistory() : null
  };
  if (srcSheetName !== destSheetName) {
    res.destZoneView = getWarehouseZoneView(destSheetName);
  }
  return res;
}

function updatePalletDataTable_(payload) {
  var normalized = normalizeUpdatePayload_(payload);
  var sheetName = normalized.oldData.Sheet;
  var pallets = readDataTablePallets_(sheetName);
  var old = normalized.oldData;
  var newData = normalized.newData;

  var idx = findPalletIndex_(pallets, old.PalletKey || old.PalletID, old);
  if (idx < 0) {
    throw new Error('找不到欲更新之棧板: ' + old.SKU);
  }

  var p = pallets[idx];
  p.SKU = newData.SKU || p.SKU;
  p.Batch = newData.Batch || p.Batch;
  p.BoxQty = Number(newData.BoxQty || 0);
  p.PieceQty = Number(newData.PieceQty || 0);
  p.Status = newData.Status || p.Status;
  p.IsLastPallet = newData.Status === '最後一板';
  p.UpdatedAt = new Date().toISOString();
  p.PalletKey = makePalletKey_(p);

  writeDataTablePallets_(sheetName, pallets);

  var locStr = sheetName + ' ' + old.Slot + '列 D' + old.Depth + ' L' + old.Level;
  appendLog_(payload.operator, '更新棧板 (數據表)', {
    sku: newData.SKU,
    batch: newData.Batch,
    from: locStr,
    to: locStr,
    note: '箱:' + newData.BoxQty + ' 片:' + newData.PieceQty
  });

  return {
    ok: true,
    sheet: sheetName,
    zoneView: getWarehouseZoneView(sheetName),
    updatedAt: new Date().toISOString()
  };
}
