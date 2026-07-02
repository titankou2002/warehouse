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

  var pallets = [];
  for (var pairIdx = 0; pairIdx < colPairs.length; pairIdx++) {
    var prodCol = colPairs[pairIdx].prodCol;
    var qtyCol  = colPairs[pairIdx].qtyCol;
    var slotId  = String(colPairs[pairIdx].slotId || '').trim();
    var currentStack = null;
    var currentDepth = 0;
    var levelByDepth = {};
    var groupSeqByDepth = {};
    var r = 1;

    while (r < numRows) {
      var cellProd = grid[r][prodCol];
      var valProd  = cleanValue(cellProd.value);

      // 排標題列
      if (valProd && valProd.indexOf('排') !== -1) {
        currentStack = valProd;
        currentDepth = parseStackDepth_(valProd);
        if (!levelByDepth[currentDepth]) levelByDepth[currentDepth] = 0;
        // 預掃整個排段，判斷是否為「bold 標記新格式」，避免逐列向前掃描在
        // 區段尾端找不到後續 bold 而誤判（導致同一物理棧板的第二品號被當成新棧板）
        var sectionHasBold = false;
        for (var pre = r + 1; pre < numRows; pre++) {
          var preCell = grid[pre][prodCol];
          var preVal = cleanValue(preCell.value);
          if (preVal && preVal.indexOf('排') !== -1) break;
          if (preCell && preCell.fontWeight === 'bold' && identifyBgColor(preCell.bgColor) !== 'WHITE') { sectionHasBold = true; break; }
        }
        groupSeqByDepth[currentDepth + '_hasBold'] = sectionHasBold;
        r++; continue;
      }
      if (valProd === null) { r++; continue; }
      // 尚未遇到排標題但已有彩色格子（通常是 destDepth=0 寫壞的孤立板）
      // 自動補 depth=1 讓它們可以被撈回，不要直接丟掉
      if (currentStack === null) {
        var orphanBg = identifyBgColor(cellProd.bgColor);
        if (orphanBg !== 'WHITE') {
          currentStack = '（復原中）';
          currentDepth = 1;
          if (!levelByDepth[currentDepth]) levelByDepth[currentDepth] = 0;
          continue; // 不 r++，重新進入迴圈，此時 currentStack 已不是 null
        }
        r++; continue;
      }

      // 分隔行偵測：背景 = PALLET_SEP_BG_ → 新棧板邊界，跳過並重設 group seq
      var rawBg = String(cellProd.bgColor || '').toUpperCase().replace('#','');
      var isSepRow = (rawBg === '1A3A6A' && valProd === null);
      if (isSepRow) {
        // 下一個彩色格子開始時視為新棧板（groupSeqByDepth 不在這裡加，讓後面的 groupSeqByDepth++ 處理）
        r++; continue;
      }

      var bgColor = identifyBgColor(cellProd.bgColor);

      // ── 彩色格式 ──────────────────────────────────────────────
      // 物理棧板邊界優先用「SKU 行 bold」偵測（新格式）
      // 若無 bold 標記（舊資料），fallback 到同色塊偵測
      if (bgColor !== 'WHITE') {
        var isBoldStart = (cellProd.fontWeight === 'bold');
        // 是否為「bold 標記新格式」：以整個排段預掃結果為準（見排標題列處理）
        var usesBoldFormat = !!groupSeqByDepth[currentDepth + '_hasBold'];

        var blockRows = [];
        if (usesBoldFormat) {
          // 新格式：從當前 SKU 行讀 2 列（SKU + 批號），一次一板
          blockRows = [r];
          if (r + 1 < numRows && cleanValue(grid[r + 1][prodCol].value) !== null) blockRows.push(r + 1);
        } else {
          // 舊格式 fallback：收集整個同色塊
          var tempR = r;
          while (tempR < numRows) {
            var tc = grid[tempR][prodCol];
            var tcBg  = identifyBgColor(tc.bgColor);
            var tcVal = cleanValue(tc.value);
            if (tcBg === bgColor && tcVal !== null && !(tcVal && tcVal.indexOf('排') !== -1)) {
              blockRows.push(tempR); tempR++;
            } else break;
          }
        }

        // 每 2 列 = 1 品號，整個 blockRows = 同一個物理棧板，共用同一個 PalletGroupId
        if (!groupSeqByDepth[currentDepth]) groupSeqByDepth[currentDepth] = 0;
        // 新格式：bold 行 = 新棧板；舊格式：每個色塊 = 新棧板
        if (!usesBoldFormat || isBoldStart) groupSeqByDepth[currentDepth]++;
        var groupId = [sheetName, slotId, currentDepth, groupSeqByDepth[currentDepth]].join('||');

        var numPairs = Math.floor(blockRows.length / 2);
        for (var pi = 0; pi < numPairs; pi++) {
          var skuR   = blockRows[pi * 2];
          var batchR = blockRows[pi * 2 + 1];
          levelByDepth[currentDepth] = (levelByDepth[currentDepth] || 0) + 1;
          var level = levelByDepth[currentDepth];
          var sku   = cleanValue(grid[skuR][prodCol].value) || '';
          var batch = cleanValue(grid[batchR][prodCol].value) || '無批號';
          var boxQty   = parseFloat(cleanValue(grid[skuR][qtyCol]   ? grid[skuR][qtyCol].value   : null)) || 0;
          var pieceQty = parseFloat(cleanValue(grid[batchR][qtyCol] ? grid[batchR][qtyCol].value : null)) || 0;
          var boxQtyFc   = (qtyCol < numCols) ? identifyFontColor(grid[skuR][qtyCol].fontColor)   : 'BLACK';
          var pieceQtyFc = (qtyCol < numCols) ? identifyFontColor(grid[batchR][qtyCol].fontColor) : 'BLACK';
          var fontColor  = identifyFontColor(cellProd.fontColor);
          var status = (bgColor === 'GREEN') ? '專案庫存' : '混板/散板';
          var isLastPallet = (bgColor !== 'GREEN') && (fontColor === 'BLUE');
          var pallet = {
            Sheet: sheetName, Slot: slotId, Stack: currentStack,
            Depth: currentDepth, DepthLabel: depthLabel_(currentDepth), Level: level,
            SKU: sku, Batch: batch, BoxQty: boxQty, PieceQty: pieceQty,
            BoxQtyFontColor: boxQtyFc, PieceQtyFontColor: pieceQtyFc,
            BgColor: bgColor, FontColor: fontColor, Status: status, IsLastPallet: isLastPallet,
            PalletGroupId: groupId,   // 同一物理棧板共用此 ID
            Remarks: ''
          };
          pallet.PalletKey = makePalletKey_(pallet);
          pallets.push(pallet);
        }
        // 新格式：每次固定移動 blockRows.length（1~2 列）；舊格式：移到 tempR
        r = usesBoldFormat ? (r + blockRows.length) : tempR;
        continue;
      }

      // ── 白色格式 ──────────────────────────────────────────────
      // 白色 = 1 行 = 1 板，不依賴 A 欄標籤
      var palletRowsW = [r];
      levelByDepth[currentDepth] = (levelByDepth[currentDepth] || 0) + 1;
      var levelW   = levelByDepth[currentDepth];
      var skuW     = cleanValue(grid[palletRowsW[0]][prodCol].value) || '';
      var batchW   = '無批號';
      var boxQtyW  = parseFloat(cleanValue(grid[palletRowsW[0]][qtyCol] ? grid[palletRowsW[0]][qtyCol].value : null)) || 0;
      var pieceQtyW = 0;
      var boxFcW   = (qtyCol < numCols) ? identifyFontColor(grid[palletRowsW[0]][qtyCol].fontColor) : 'BLACK';
      var pieceFcW = 'BLACK';
      var palletW = {
        Sheet: sheetName, Slot: slotId, Stack: currentStack,
        Depth: currentDepth, DepthLabel: depthLabel_(currentDepth), Level: levelW,
        SKU: skuW, Batch: batchW, BoxQty: boxQtyW, PieceQty: pieceQtyW,
        BoxQtyFontColor: boxFcW, PieceQtyFontColor: pieceFcW,
        BgColor: 'WHITE', FontColor: 'BLACK', Status: '正常庫存', IsLastPallet: false,
        Remarks: ''
      };
      palletW.PalletKey = makePalletKey_(palletW);
      palletW.PalletGroupId = palletW.PalletKey;
      pallets.push(palletW);
      r += 1;
    }
  }

  return pallets;
}
