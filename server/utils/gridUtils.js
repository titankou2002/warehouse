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

const ZH_NUM = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function parseDepth(v) {
  if (!v || !v.includes('排')) return 0;
  const d = v.match(/第\s*(\d+)\s*排/);
  if (d) return Number(d[1]);
  const z = v.match(/第\s*([一二三四五六七八九十])\s*排/);
  return z ? (ZH_NUM[z[1]] || 0) : 0;
}

// 找指定排（depth）的列範圍 { startRow, endRow }（0-based）
function findDepthRowRange(grid, depth, prodCol) {
  let startRow = -1;
  for (let r = 1; r < grid.length; r++) {
    const v = cleanValue(grid[r]?.[prodCol]?.value);
    if (parseDepth(v) === depth) { startRow = r + 1; break; }
  }
  if (startRow < 0) return null;

  let endRow = grid.length - 1;
  for (let r = startRow; r < grid.length; r++) {
    const v = cleanValue(grid[r]?.[prodCol]?.value);
    if (v && v.includes('排') && parseDepth(v) !== depth) { endRow = r - 1; break; }
  }
  return startRow <= endRow ? { startRow, endRow } : null;
}

// 找目前 Sheet 最大 depth 數
function findMaxDepth(grid, prodCol) {
  let max = 0;
  for (let r = 1; r < grid.length; r++) {
    const n = parseDepth(cleanValue(grid[r]?.[prodCol]?.value));
    if (n > max) max = n;
  }
  return max;
}

module.exports = { cleanValue, findSlotProdCol, findDepthRowRange, findMaxDepth };
