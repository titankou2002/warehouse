function identifyBgColor(hex) {
  if (!hex || typeof hex !== 'string') return "WHITE";
  hex = hex.trim().toUpperCase();
  if (hex === "WHITE" || hex === "#FFFFFF" || hex === "" || hex === "TRANSPARENT" || hex === "RGBA(0, 0, 0, 0)") return "WHITE";
  if (hex.charAt(0) === '#') hex = hex.substr(1);
  if (hex.length === 3) hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
  if (hex.length !== 6) return "WHITE";

  var r = parseInt(hex.substr(0, 2), 16);
  var g = parseInt(hex.substr(2, 2), 16);
  var b = parseInt(hex.substr(4, 2), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "WHITE";
  // YELLOW 先判（高 R + 高 G + 低 B），避免被 RED 吞掉
  if (r > 180 && g > 180 && b < 160) return "YELLOW";
  // RED：涵蓋標準紅 (#FF0000)、深紅 (#CC0000)、偏暗紅 (#990000)、
  //       略帶粉紅 (#FF6666, #E06666)，以及 Google Sheets 常見的淡紅 (#FF9999)
  //       條件：R 是主導色，R 明顯大於 G 和 B（比例 1.2 而非 1.3 以容許粉紅偏差）
  //             且 R 絕對值 > 120（排除接近灰色的低飽和色）
  //             且 G 不超過 R 的 60%（排除橙色：橙色 G 約佔 R 的 55-65%）
  if (r > 120 && r > g * 1.2 && r > b * 1.2 && g < r * 0.65) return "RED";
  if (g > 120 && g > r * 1.2 && g > b * 1.2) return "GREEN";
  if (r > 120 && b > 120 && g < 100) return "PURPLE";
  return "WHITE";
}

function identifyFontColor(hex) {
  if (!hex || typeof hex !== 'string') return "BLACK";
  hex = hex.trim().toUpperCase();
  if (hex === "BLACK" || hex === "#000000" || hex === "") return "BLACK";
  if (hex.charAt(0) === '#') hex = hex.substr(1);
  if (hex.length === 3) hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
  if (hex.length !== 6) return "BLACK";

  var r = parseInt(hex.substr(0, 2), 16);
  var g = parseInt(hex.substr(2, 2), 16);
  var b = parseInt(hex.substr(4, 2), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "BLACK";
  if (b > 150 && b > r * 1.3 && b > g * 1.3) return "BLUE";
  if (r > 150 && r > g * 1.3 && r > b * 1.3) return "RED";
  if (g > 120 && g > r * 1.2 && g > b * 1.2) return "GREEN";
  return "BLACK";
}

function cleanValue(val) {
  if (val === null || val === undefined) return null;
  var valStr = String(val).trim();
  if (valStr === "None" || valStr === "") return null;
  return valStr;
}

/**
 * 判斷值是否為「有效資料行」（可參與編號/批號配對）
 * 回傳 true：值含有半形英數字元（排除純中文備註、空值、排標題）
 */
function isDataValue_(val) {
  if (!val) return false;
  return /[\x21-\x7E]/.test(val);
}

/**
 * 判斷一個值是否為編號（SKU）
 * 1. 先查 SKU Set（目錄裡的已知編號）
 * 2. 再比對格式：2個大寫字母 + 4位以上數字（如 RP12004, LV12001）
 *    排除：純數字（漢樺編號已在 Set 裡）、短代碼如 TA4/GC4/AA6
 */
function isSkuValue_(val, skuSet) {
  if (!val) return false;
  var upper = String(val).trim().toUpperCase();
  if (skuSet[upper] === true) return true;
  // 格式 fallback：開頭 2個大寫字母 + 至少4位數字（後方可有 -S/-A 等後綴）
  if (/^[A-Z]{2}\d{4,}/.test(upper)) return true;
  return false;
}

function compareSlotLikeText_(a, b) {
  var na = Number(a);
  var nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), 'zh-Hant-u-nu-latn');
}

function parseStackDepth_(stackLabel) {
  var text = String(stackLabel || '').trim();
  var digitMatch = text.match(/第\s*(\d+)\s*排/);
  if (digitMatch) return Number(digitMatch[1]);

  var zhMatch = text.match(/第\s*([一二三四五六七八九十])\s*排/);
  if (!zhMatch) return 0;
  var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  return map[zhMatch[1]] || 0;
}

function depthLabel_(depth) {
  var map = ['', '第一排', '第二排', '第三排', '第四排', '第五排', '第六排', '第七排', '第八排', '第九排', '第十排'];
  return map[depth] || ('第' + depth + '排');
}

function makePalletKey_(row) {
  return [
    String(row.Sheet || '').trim(),
    String(row.Slot || '').trim(),
    String(row.Depth || parseStackDepth_(row.Stack) || '').trim(),
    String(row.Level || '').trim(),
    String(row.SKU || '').trim(),
    String(row.Batch || '').trim()
  ].join('||');
}

function withDerivedGeometry_(row) {
  var copy = {};
  for (var key in row) copy[key] = row[key];
  copy.Depth = Number(copy.Depth || parseStackDepth_(copy.Stack) || 0);
  copy.DepthLabel = copy.DepthLabel || depthLabel_(copy.Depth);
  if (!copy.Level) copy.Level = 0;
  copy.PalletKey = copy.PalletKey || makePalletKey_(copy);
  return copy;
}

function getSheetDataWithMergedResolved(sheet) {
  if (!sheet || typeof sheet.getDataRange !== 'function') {
    throw new Error("getSheetDataWithMergedResolved 需要 Google Sheet 物件");
  }

  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var backgrounds = dataRange.getBackgrounds();
  var fontColors = dataRange.getFontColors();
  var fontWeights = dataRange.getFontWeights();
  if (!values || !values.length || !values[0] || !values[0].length) return [];

  var numRows = values.length;
  var numCols = values[0].length;
  var grid = [];
  for (var r = 0; r < numRows; r++) {
    grid[r] = [];
    for (var c = 0; c < numCols; c++) {
      grid[r][c] = {
        value: values[r][c],
        bgColor: backgrounds[r][c],
        fontColor: fontColors[r][c],
        fontWeight: fontWeights[r][c]
      };
    }
  }

  var mergedRanges = typeof dataRange.getMergedRanges === 'function' ? dataRange.getMergedRanges() : [];
  for (var i = 0; i < mergedRanges.length; i++) {
    var range = mergedRanges[i];
    var startRow = range.getRow() - 1;
    var startCol = range.getColumn() - 1;
    var lastRow = range.getLastRow() - 1;
    var lastColumn = range.getLastColumn() - 1;
    // 防護：merged range 可能超出 dataRange（例如整欄 merge）
    if (startRow < 0 || startRow >= numRows || startCol < 0 || startCol >= numCols) continue;
    if (!grid[startRow] || !grid[startRow][startCol]) continue;
    var topLeftCell = grid[startRow][startCol];

    for (var row = startRow; row <= Math.min(lastRow, numRows - 1); row++) {
      for (var col = startCol; col <= Math.min(lastColumn, numCols - 1); col++) {
        if (!grid[row] || !grid[row][col]) continue;
        grid[row][col].value = topLeftCell.value;
        grid[row][col].bgColor = topLeftCell.bgColor;
        grid[row][col].fontColor = topLeftCell.fontColor;
        grid[row][col].fontWeight = topLeftCell.fontWeight;
      }
    }
  }

  return grid;
}

function _emitPallet_(pallets, o) {
  var skuVal = o.skuRow !== null ? (cleanValue(o.grid[o.skuRow][o.prodCol].value) || '') : '';
  var batchVal = o.batchRow !== null ? (cleanValue(o.grid[o.batchRow][o.prodCol].value) || '') : '無批號';
  if (!skuVal && !o.batchRow) return;
  if (!skuVal) skuVal = '';
  o.levelByDepth[o.depth] = (o.levelByDepth[o.depth] || 0) + 1;
  var pallet = {
    Sheet: o.sheetName, Slot: o.slotId, Stack: o.stack,
    Depth: o.depth, DepthLabel: depthLabel_(o.depth), Level: o.levelByDepth[o.depth],
    SKU: skuVal, Batch: batchVal,
    BoxQty: (function(){
      var b = o.skuRow !== null ? (parseFloat(cleanValue(o.grid[o.skuRow][o.qtyCol] ? o.grid[o.skuRow][o.qtyCol].value : null)) || 0) : 0;
      var p = o.batchRow !== null ? (parseFloat(cleanValue(o.grid[o.batchRow][o.qtyCol] ? o.grid[o.batchRow][o.qtyCol].value : null)) || 0) : 0;
      // 實務：編號列數量空白、批號列有數字 → 該數字是箱數不是片數
      if (b === 0 && p > 0) return p;
      return b;
    })(),
    PieceQty: (function(){
      var b = o.skuRow !== null ? (parseFloat(cleanValue(o.grid[o.skuRow][o.qtyCol] ? o.grid[o.skuRow][o.qtyCol].value : null)) || 0) : 0;
      var p = o.batchRow !== null ? (parseFloat(cleanValue(o.grid[o.batchRow][o.qtyCol] ? o.grid[o.batchRow][o.qtyCol].value : null)) || 0) : 0;
      if (b === 0 && p > 0) return 0;
      return p;
    })(),
    BoxQtyFontColor: (o.qtyCol < o.numCols && o.skuRow !== null) ? identifyFontColor(o.grid[o.skuRow][o.qtyCol].fontColor) : 'BLACK',
    PieceQtyFontColor: (o.qtyCol < o.numCols && o.batchRow !== null) ? identifyFontColor(o.grid[o.batchRow][o.qtyCol].fontColor) : 'BLACK',
    QtyOnBatchRow: (function(){
      var b = o.skuRow !== null ? (parseFloat(cleanValue(o.grid[o.skuRow][o.qtyCol] ? o.grid[o.skuRow][o.qtyCol].value : null)) || 0) : 0;
      var p = o.batchRow !== null ? (parseFloat(cleanValue(o.grid[o.batchRow][o.qtyCol] ? o.grid[o.batchRow][o.qtyCol].value : null)) || 0) : 0;
      return (b === 0 && p > 0);
    })(),
    BgColor: o.bgColor,
    FontColor: (o.skuRow !== null) ? identifyFontColor(o.grid[o.skuRow][o.prodCol].fontColor) : 'BLACK',
    Status: (o.bgColor === 'GREEN') ? '專案庫存' : '混板/散板',
    IsLastPallet: (o.bgColor !== 'GREEN') && (o.skuRow !== null) && (identifyFontColor(o.grid[o.skuRow][o.prodCol].fontColor) === 'BLUE'),
    PalletGroupId: o.groupId, Remarks: ''
  };
  pallet.PalletKey = makePalletKey_(pallet);
  pallets.push(pallet);
}

function parseWarehouseGrid(grid, sheetName) {
  if (!grid || !grid.length || !grid[0] || !grid[0].length) return [];

  var numRows = grid.length;
  var numCols = grid[0].length;
  var colPairs = [];
  for (var col = 1; col < numCols; col++) {
    var slotVal = cleanValue(grid[0][col].value);
    if (slotVal !== null && slotVal !== '數量') {
      colPairs.push({ prodCol: col, qtyCol: col + 1, slotId: slotVal });
    }
  }

  // 從產品目錄建 SKU Set — 在 Set 裡的就是編號行，不在的就是批號行
  var skuSet = buildSkuSet_();

  var pallets = [];
  for (var pairIdx = 0; pairIdx < colPairs.length; pairIdx++) {
    var prodCol = colPairs[pairIdx].prodCol;
    var qtyCol  = colPairs[pairIdx].qtyCol;
    var slotId  = String(colPairs[pairIdx].slotId || '').trim();
    var currentStack = null;
    var currentDepth = 0;
    var levelByDepth = {};
    var groupSeqByDepth = {};
    var pendingSkuRow = null;
    var r = 1;

    while (r < numRows) {
      var cellProd = grid[r][prodCol];
      var valProd  = cleanValue(cellProd.value);

      // 排標題列
      if (valProd && valProd.indexOf('排') !== -1) {
        currentStack = valProd;
        currentDepth = parseStackDepth_(valProd);
        if (!levelByDepth[currentDepth]) levelByDepth[currentDepth] = 0;
        pendingSkuRow = null;
        r++; continue;
      }
      if (valProd === null) { r++; continue; }
      if (currentStack === null) {
        var orphanBg = identifyBgColor(cellProd.bgColor);
        if (orphanBg !== 'WHITE') {
          currentStack = '（復原中）';
          currentDepth = 1;
          if (!levelByDepth[currentDepth]) levelByDepth[currentDepth] = 0;
          continue;
        }
        r++; continue;
      }

      // 分隔行偵測
      var rawBg = String(cellProd.bgColor || '').toUpperCase().replace('#','');
      if (rawBg === '1A3A6A' && valProd === null) { r++; continue; }

      var bgColor = identifyBgColor(cellProd.bgColor);

      // ── 彩色格式 ──────────────────────────────────────────────
      if (bgColor !== 'WHITE') {
        var tempR = r;
        var blockRows = [];
        while (tempR < numRows) {
          var tc = grid[tempR][prodCol];
          var tcBg  = identifyBgColor(tc.bgColor);
          var tcVal = cleanValue(tc.value);
          if (tcBg === bgColor && tcVal !== null && !(tcVal && tcVal.indexOf('排') !== -1)) {
            blockRows.push(tempR); tempR++;
          } else break;
        }

        if (!groupSeqByDepth[currentDepth]) groupSeqByDepth[currentDepth] = 0;
        groupSeqByDepth[currentDepth]++;
        var groupId = [sheetName, slotId, currentDepth, groupSeqByDepth[currentDepth]].join('||');

        for (var bi = 0; bi < blockRows.length; bi++) {
          var bRow = blockRows[bi];
          var val  = cleanValue(grid[bRow][prodCol].value) || '';
          var isSku = isSkuValue_(val, skuSet);

          if (isSku) {
            if (pendingSkuRow !== null) {
              _emitPallet_(pallets, {
                sheetName: sheetName, slotId: slotId, stack: currentStack,
                depth: currentDepth, levelByDepth: levelByDepth,
                skuRow: pendingSkuRow, batchRow: null,
                prodCol: prodCol, qtyCol: qtyCol, numCols: numCols,
                bgColor: bgColor, groupId: groupId, grid: grid
              });
            }
            pendingSkuRow = bRow;
          } else {
            if (pendingSkuRow !== null) {
              _emitPallet_(pallets, {
                sheetName: sheetName, slotId: slotId, stack: currentStack,
                depth: currentDepth, levelByDepth: levelByDepth,
                skuRow: pendingSkuRow, batchRow: bRow,
                prodCol: prodCol, qtyCol: qtyCol, numCols: numCols,
                bgColor: bgColor, groupId: groupId, grid: grid
              });
              pendingSkuRow = null;
            } else if (pallets.length > 0 && pallets[pallets.length - 1].PalletGroupId === groupId) {
              var lastP = pallets[pallets.length - 1];
              if (val) {
                lastP.Remarks = lastP.Remarks ? (lastP.Remarks + ' ' + val) : val;
              }
            }
          }
        }
        r = tempR;
        continue;
      }

      // ── 白色格式 ──────────────────────────────────────────────
      // 白底格式：若該列為 SKU，檢查下一列是否為批號列（非 SKU 且為有效資料列）
      var valW = cleanValue(grid[r][prodCol].value) || '';
      if (!isSkuValue_(valW, skuSet)) { r++; continue; }

      var hasBatchRow = false;
      var nextR = r + 1;
      if (nextR < numRows) {
        var nextCellProd = grid[nextR][prodCol];
        var nextValProd  = cleanValue(nextCellProd ? nextCellProd.value : null);
        var nextBg       = identifyBgColor(nextCellProd ? nextCellProd.bgColor : null);
        var rawNextBg    = String(nextCellProd ? (nextCellProd.bgColor || '') : '').toUpperCase().replace('#','');

        if (nextBg === 'WHITE' && rawNextBg !== '1A3A6A' && nextValProd !== null && nextValProd.indexOf('排') === -1 && isDataValue_(nextValProd) && !isSkuValue_(nextValProd, skuSet)) {
          hasBatchRow = true;
        }
      }

      var skuRowW   = r;
      var batchRowW = hasBatchRow ? nextR : null;
      var batchValW = hasBatchRow ? (cleanValue(grid[nextR][prodCol].value) || '無批號') : '無批號';
      var boxQtyW   = parseFloat(cleanValue(grid[skuRowW][qtyCol] ? grid[skuRowW][qtyCol].value : null)) || 0;
      var pieceQtyW = hasBatchRow ? (parseFloat(cleanValue(grid[nextR][qtyCol] ? grid[nextR][qtyCol].value : null)) || 0) : 0;
      var qtyOnBatch = false;
      if (boxQtyW === 0 && pieceQtyW > 0) { boxQtyW = pieceQtyW; pieceQtyW = 0; qtyOnBatch = true; }
      var boxFcW    = (qtyCol < numCols) ? identifyFontColor(grid[skuRowW][qtyCol].fontColor) : 'BLACK';
      var pieceFcW  = (qtyCol < numCols && hasBatchRow) ? identifyFontColor(grid[nextR][qtyCol].fontColor) : 'BLACK';
      if (qtyOnBatch && hasBatchRow) boxFcW = pieceFcW;

      levelByDepth[currentDepth] = (levelByDepth[currentDepth] || 0) + 1;
      var levelW   = levelByDepth[currentDepth];

      var palletW = {
        Sheet: sheetName, Slot: slotId, Stack: currentStack,
        Depth: currentDepth, DepthLabel: depthLabel_(currentDepth), Level: levelW,
        SKU: valW, Batch: batchValW, BoxQty: boxQtyW, PieceQty: pieceQtyW,
        QtyOnBatchRow: qtyOnBatch,
        BoxQtyFontColor: boxFcW, PieceQtyFontColor: pieceFcW,
        BgColor: 'WHITE', FontColor: identifyFontColor(grid[skuRowW][prodCol].fontColor), Status: '正常庫存', IsLastPallet: false,
        Remarks: ''
      };
      palletW.PalletKey = makePalletKey_(palletW);
      palletW.PalletGroupId = palletW.PalletKey;
      pallets.push(palletW);
      r = hasBatchRow ? nextR + 1 : r + 1;
    }
  }

  return pallets;
}
