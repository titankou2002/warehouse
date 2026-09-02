const { cleanValue, findDepthRowRange } = require('../utils/gridUtils');
const { identifyBgColor, identifyFontColor } = require('../utils/colorUtils');

// 判斷一段是白色還是彩色格式
function detectFormat(grid, prodCol, range) {
  for (let r = range.startRow; r <= range.endRow; r++) {
    const cell = grid[r]?.[prodCol];
    if (!cell) continue;
    const val = cleanValue(cell.value);
    if (val && val.includes('排') && val.includes('第')) continue;
    if (identifyBgColor(cell.bgColor) !== 'WHITE') return 'colored';
  }
  return 'white';
}

// 讀取一個 depth section，回傳 pallets[]
// 每個 pallet: { rows, sku, batch, boxQty, pieceQty, bgColor, fontColor, format, PalletGroupId, BoxQtyFontColor, PieceQtyFontColor }
function readDepthSection(grid, prodCol, qtyCol, range) {
  const format = detectFormat(grid, prodCol, range);
  const pallets = [];

  if (format === 'white') {
    for (let r = range.startRow; r <= range.endRow; r++) {
      const cell = grid[r]?.[prodCol];
      const val  = cleanValue(cell?.value);
      if (!val) continue;
      if (val && val.includes('排') && val.includes('第')) continue;
      const boxQty = parseFloat(cleanValue(grid[r]?.[qtyCol]?.value)) || 0;
      const boxFc = identifyFontColor(grid[r]?.[qtyCol]?.fontColor);
      pallets.push({
        rows: [r], sku: val, batch: '無批號', boxQty, pieceQty: 0,
        bgColor: 'WHITE', fontColor: 'BLACK', format: 'white',
        PalletGroupId: `wht_${r}`,
        BoxQtyFontColor: boxFc, PieceQtyFontColor: 'BLACK',
      });
    }
    return { pallets, format };
  }

  // 彩色格式：bold SKU 行 = 新物理棧板開始（GAS 預掃整個排段判斷有無 bold）
  let sectionHasBold = false;
  for (let r = range.startRow; r <= range.endRow; r++) {
    const cell = grid[r]?.[prodCol];
    const val = cleanValue(cell?.value);
    if (val && val.includes('排') && val.includes('第')) break;
    if (cell && cell.fontWeight === 'bold' && identifyBgColor(cell?.bgColor) !== 'WHITE') {
      sectionHasBold = true;
      break;
    }
  }

  let r = range.startRow;
  let currentGroupId = null;

  while (r <= range.endRow) {
    const cell = grid[r]?.[prodCol];
    if (!cell) { r++; continue; }

    const val = cleanValue(cell.value);
    const bg  = identifyBgColor(cell.bgColor);

    if (val && val.includes('排') && val.includes('第')) { r++; continue; }

    // 白色單列（混在彩色段裡）：1 列 = 1 板，不消耗下一列
    if (bg === 'WHITE') {
      if (val !== null) {
        const boxQty = parseFloat(cleanValue(grid[r]?.[qtyCol]?.value)) || 0;
        const boxFc = identifyFontColor(grid[r]?.[qtyCol]?.fontColor);
        pallets.push({
          rows: [r], sku: val, batch: '無批號', boxQty, pieceQty: 0,
          bgColor: 'WHITE', fontColor: 'BLACK', format: 'white',
          PalletGroupId: `wht_${r}`,
          BoxQtyFontColor: boxFc, PieceQtyFontColor: 'BLACK',
        });
      }
      currentGroupId = null;
      r++; continue;
    }

    if (val === null) { r++; continue; }

    // 彩色 SKU 行：bold = 新物理棧板開始；若 sectionHasBold = false，fallback 到同色塊
    if (sectionHasBold && cell.fontWeight === 'bold') currentGroupId = `blk_${r}`;
    if (!currentGroupId) currentGroupId = `blk_${r}`;

    const batchRow  = r + 1;
    if (batchRow > range.endRow) { r++; continue; }
    const batchCell = grid[batchRow]?.[prodCol];
    const batch     = cleanValue(batchCell?.value) || '無批號';
    const boxQty    = parseFloat(cleanValue(grid[r]?.[qtyCol]?.value)) || 0;
    const pieceQty  = parseFloat(cleanValue(grid[batchRow]?.[qtyCol]?.value)) || 0;

    // Qty 欄字體色（GAS 用此判斷狀態）
    const boxFc   = identifyFontColor(grid[r]?.[qtyCol]?.fontColor);
    const pieceFc = identifyFontColor(grid[batchRow]?.[qtyCol]?.fontColor);

    pallets.push({
      rows: [r, batchRow], sku: val, batch, boxQty, pieceQty,
      bgColor: bg, fontColor: identifyFontColor(cell.fontColor),
      format: 'colored', PalletGroupId: currentGroupId,
      BoxQtyFontColor: boxFc, PieceQtyFontColor: pieceFc,
    });
    r += 2;
  }

  return { pallets, format };
}

module.exports = { readDepthSection, detectFormat };
