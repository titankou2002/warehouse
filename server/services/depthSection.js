const { cleanValue, findDepthRowRange } = require('../utils/gridUtils');
const { identifyBgColor, identifyFontColor } = require('../utils/colorUtils');

// 判斷一段是白色還是彩色格式
function detectFormat(grid, prodCol, range) {
  for (let r = range.startRow; r <= range.endRow; r++) {
    const cell = grid[r]?.[prodCol];
    if (!cell) continue;
    if (identifyBgColor(cell.bgColor) !== 'WHITE') return 'colored';
  }
  return 'white';
}

// 讀取一個 depth section，回傳 pallets[]
// 每個 pallet: { rows, sku, batch, boxQty, pieceQty, bgColor, fontColor, format, PalletGroupId }
function readDepthSection(grid, prodCol, qtyCol, range) {
  const format = detectFormat(grid, prodCol, range);
  const pallets = [];

  if (format === 'white') {
    for (let r = range.startRow; r <= range.endRow; r++) {
      const cell = grid[r]?.[prodCol];
      const val  = cleanValue(cell?.value);
      if (!val) continue;
      const boxQty = parseFloat(cleanValue(grid[r]?.[qtyCol]?.value)) || 0;
      pallets.push({
        rows: [r], sku: val, batch: '無批號', boxQty, pieceQty: 0,
        bgColor: 'WHITE', fontColor: 'BLACK', format: 'white',
        PalletGroupId: `wht_${r}`,
      });
    }
    return { pallets, format };
  }

  // 彩色格式：bold SKU 行 = 新物理棧板開始
  let hasBold = false;
  for (let r = range.startRow; r <= range.endRow; r++) {
    const cell = grid[r]?.[prodCol];
    if (cell?.fontWeight === 'bold' && identifyBgColor(cell?.bgColor) !== 'WHITE') {
      hasBold = true; break;
    }
  }

  let r = range.startRow;
  let currentGroupId = null;

  while (r <= range.endRow) {
    const cell = grid[r]?.[prodCol];
    if (!cell) { r++; continue; }

    const val = cleanValue(cell.value);
    const bg  = identifyBgColor(cell.bgColor);

    if (val && val.includes('排')) { r++; continue; }

    // 白色單列（混在彩色段裡）
    if (bg === 'WHITE') {
      if (val !== null) {
        const boxQty = parseFloat(cleanValue(grid[r]?.[qtyCol]?.value)) || 0;
        pallets.push({
          rows: [r], sku: val, batch: '無批號', boxQty, pieceQty: 0,
          bgColor: 'WHITE', fontColor: 'BLACK', format: 'white',
          PalletGroupId: `wht_${r}`,
        });
      }
      currentGroupId = null;
      r++; continue;
    }

    if (val === null) { r++; continue; }

    // 彩色 SKU 行
    if (hasBold && cell.fontWeight === 'bold') currentGroupId = `blk_${r}`;
    if (!currentGroupId) currentGroupId = `blk_${r}`;

    const batchRow  = r + 1;
    if (batchRow > range.endRow) { r++; continue; }
    const batchCell = grid[batchRow]?.[prodCol];
    const batch     = cleanValue(batchCell?.value) || '無批號';
    const boxQty    = parseFloat(cleanValue(grid[r]?.[qtyCol]?.value)) || 0;
    const pieceQty  = parseFloat(cleanValue(grid[batchRow]?.[qtyCol]?.value)) || 0;

    pallets.push({
      rows: [r, batchRow], sku: val, batch, boxQty, pieceQty,
      bgColor: bg, fontColor: identifyFontColor(cell.fontColor),
      format: 'colored', PalletGroupId: currentGroupId,
    });
    r += 2;
  }

  return { pallets, format };
}

module.exports = { readDepthSection, detectFormat };
