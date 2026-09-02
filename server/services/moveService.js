const { Mutex } = require('async-mutex');
const { getSheetGrid } = require('../sheets/reader');
const { readDepthSection, detectFormat } = require('./depthSection');
const { writeColoredDepthPallets, writeWhiteDepthPallets } = require('./depthWriter');
const { findSlotProdCol, findDepthRowRange } = require('../utils/gridUtils');

const mutex = new Mutex();

// 移動單一棧板（白色格式用）
// sku 與 batch 均來自 palletKey，batch 為空字串時 fallback 到 SKU-only match
async function movePallet(sheetName, slotId, fromDepth, toDepth, sku, batch) {
  return mutex.runExclusive(async () => {
    const grid     = await getSheetGrid(sheetName);
    const prodCol  = findSlotProdCol(grid, slotId);
    if (prodCol < 0) throw new Error(`找不到庫位: ${slotId}`);
    const qtyCol   = prodCol + 1;

    const fromRange = findDepthRowRange(grid, fromDepth, prodCol);
    const toRange   = findDepthRowRange(grid, toDepth,   prodCol);
    if (!fromRange) throw new Error(`找不到第${fromDepth}排`);
    if (!toRange)   throw new Error(`找不到第${toDepth}排`);

    const { pallets: fromPallets } = readDepthSection(grid, prodCol, qtyCol, fromRange);
    const { pallets: toPallets   } = readDepthSection(grid, prodCol, qtyCol, toRange);

    // 優先以 SKU + Batch 精確匹配；若無 batch 則 fallback 到 SKU-only
    const cleanSku = String(sku).trim();
    const cleanBatch = batch ? String(batch).trim() : '';
    let idx = fromPallets.findIndex(p =>
      p.sku === cleanSku && (!cleanBatch || p.batch === cleanBatch)
    );
    // fallback: 只比 SKU（白色格式無 batch）
    if (idx < 0 && !cleanBatch) {
      idx = fromPallets.findIndex(p => p.sku === cleanSku);
    }
    if (idx < 0) throw new Error(`在第${fromDepth}排找不到 ${sku}${cleanBatch ? ' ' + cleanBatch : ''}`);

    const [moved] = fromPallets.splice(idx, 1);
    toPallets.push(moved);

    await _writePallets(sheetName, prodCol, qtyCol, fromRange, fromPallets);
    await _writePallets(sheetName, prodCol, qtyCol, toRange,   toPallets);
    return { ok: true };
  });
}

// 移動物理棧板群組（彩色格式，保留 PalletGroupId 一致性）
async function movePalletGroup(sheetName, slotId, fromDepth, toDepth, groupSku, groupBatch) {
  return mutex.runExclusive(async () => {
    const grid    = await getSheetGrid(sheetName);
    const prodCol = findSlotProdCol(grid, slotId);
    if (prodCol < 0) throw new Error(`找不到庫位: ${slotId}`);
    const qtyCol  = prodCol + 1;

    const fromRange = findDepthRowRange(grid, fromDepth, prodCol);
    const toRange   = findDepthRowRange(grid, toDepth,   prodCol);
    if (!fromRange) throw new Error(`找不到第${fromDepth}排`);
    if (!toRange)   throw new Error(`找不到第${toDepth}排`);

    const { pallets: fromPallets } = readDepthSection(grid, prodCol, qtyCol, fromRange);
    const { pallets: toPallets   } = readDepthSection(grid, prodCol, qtyCol, toRange);

    // 找出目標群組（同 PalletGroupId，或以 sku+batch 匹配首成員）
    const anchor = fromPallets.find(
      p => p.sku === String(groupSku).trim() &&
           (!groupBatch || p.batch === String(groupBatch).trim())
    );
    if (!anchor) throw new Error(`在第${fromDepth}排找不到 ${groupSku}`);

    const groupId    = anchor.PalletGroupId;
    const groupItems = fromPallets.filter(p => p.PalletGroupId === groupId);
    const remaining  = fromPallets.filter(p => p.PalletGroupId !== groupId);

    // 移動前強制統一 PalletGroupId（防止寫回後分裂）
    const sharedId = `mv_${Date.now()}`;
    for (const p of groupItems) p.PalletGroupId = sharedId;

    toPallets.push(...groupItems);

    await _writePallets(sheetName, prodCol, qtyCol, fromRange, remaining);
    await _writePallets(sheetName, prodCol, qtyCol, toRange,   toPallets);
    return { ok: true, moved: groupItems.length };
  });
}

async function _writePallets(sheetName, prodCol, qtyCol, range, pallets) {
  const grid    = await getSheetGrid(sheetName);
  const format  = detectFormat(grid, prodCol, range);
  if (format === 'colored') {
    await writeColoredDepthPallets(sheetName, prodCol, qtyCol, range, pallets);
  } else {
    await writeWhiteDepthPallets(sheetName, prodCol, qtyCol, range, pallets);
  }
}

module.exports = { movePallet, movePalletGroup };
