// grid = 2D array of { value, bgColor, fontWeight, fontColor }

function cleanValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// 找 slotId 對應的 prodCol（0-based）
function findSlotProdCol(grid, slotId) {
  const header = grid[0] || [];
  for (let c = 0; c < header.length; c++) {
    const v = cleanValue(header[c].value);
    if (v === String(slotId).trim()) return c;
  }
  return -1;
}

// 找指定排（depth）的列範圍 { startRow, endRow }（0-based）
function findDepthRowRange(grid, depth, prodCol) {
  const label = `第${depth}排`;
  let startRow = -1;
  for (let r = 1; r < grid.length; r++) {
    const v = cleanValue(grid[r]?.[prodCol]?.value);
    if (v === label) {
      startRow = r + 1;
      break;
    }
  }
  if (startRow < 0) return null;

  let endRow = grid.length - 1;
  for (let r = startRow; r < grid.length; r++) {
    const v = cleanValue(grid[r]?.[prodCol]?.value);
    if (v && v.includes('排') && v !== label) { endRow = r - 1; break; }
  }
  return startRow <= endRow ? { startRow, endRow } : null;
}

// 找目前 Sheet 最大 depth 數
function findMaxDepth(grid, prodCol) {
  let max = 0;
  for (let r = 1; r < grid.length; r++) {
    const v = cleanValue(grid[r]?.[prodCol]?.value);
    if (v && v.includes('排')) {
      const n = parseInt(v.replace('第','').replace('排',''));
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

module.exports = { cleanValue, findSlotProdCol, findDepthRowRange, findMaxDepth };
