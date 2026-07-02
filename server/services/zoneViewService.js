const { getSheetGrid, getSheetNames } = require('../sheets/reader');
const { readDepthSection } = require('./depthSection');
const { findSlotProdCol, findDepthRowRange, findMaxDepth, cleanValue } = require('../utils/gridUtils');

const DEPTH_LABELS = ['','第一排','第二排','第三排','第四排','第五排','第六排','第七排','第八排','第九排','第十排'];
function depthLabel(n) { return DEPTH_LABELS[n] || `第${n}排`; }

function compareSlotLike(a, b) {
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), 'zh-Hant-u-nu-latn');
}

// 找某個 sheet 的所有 slotId（header 列掃描）
function findAllSlots(grid) {
  const header = grid[0] || [];
  const slots = [];
  for (let c = 0; c < header.length; c++) {
    const v = cleanValue(header[c]?.value);
    if (v && !v.includes('排') && !v.includes('數') && !v.includes('量')) {
      slots.push({ slotId: v, prodCol: c });
    }
  }
  return slots;
}

// 把 depthSection pallet 轉成 GAS row 格式
function toGasRow(p, sheetName, slotId, depth, level) {
  return {
    Sheet: sheetName,
    Slot: slotId,
    Stack: depthLabel(depth),
    Depth: depth,
    DepthLabel: depthLabel(depth),
    Level: level,
    SKU: p.sku,
    Batch: p.batch || '無批號',
    BoxQty: p.boxQty || 0,
    PieceQty: p.pieceQty || 0,
    BgColor: p.bgColor || 'WHITE',
    FontColor: p.fontColor || 'BLACK',
    PalletGroupId: p.PalletGroupId,
    PalletKey: [sheetName, slotId, depth, level, p.sku, p.batch || ''].join('||'),
    Status: p.bgColor === 'GREEN' ? '專案庫存' : '正常庫存',
  };
}

async function buildZoneView(sheetName) {
  const grid  = await getSheetGrid(sheetName);
  const slots = findAllSlots(grid);
  const slotsMap = {};

  for (const { slotId, prodCol } of slots) {
    const qtyCol   = prodCol + 1;
    const maxDepth = findMaxDepth(grid, prodCol);
    const depthsMap = {};

    for (let d = 1; d <= maxDepth; d++) {
      const range = findDepthRowRange(grid, d, prodCol);
      if (!range) continue;
      const { pallets } = readDepthSection(grid, prodCol, qtyCol, range);

      let level = 0;
      const gasRows = pallets.map(p => {
        level++;
        return toGasRow(p, sheetName, slotId, d, level);
      });

      depthsMap[d] = {
        depth: d,
        label: depthLabel(d),
        height: level,
        pallets: gasRows,
        maxPallets: Math.floor((range.endRow - range.startRow + 1) / 2),
      };
    }

    const depths = Object.keys(depthsMap)
      .map(k => depthsMap[k])
      .sort((a, b) => a.depth - b.depth);

    const allPallets = depths.flatMap(d => d.pallets);
    slotsMap[slotId] = {
      slotId,
      palletCount: allPallets.length,
      maxDepth,
      maxLevel: allPallets.length ? Math.max(...allPallets.map(p => p.Level)) : 0,
      depths,
      pallets: allPallets,
    };
  }

  const sortedSlots = Object.keys(slotsMap)
    .sort(compareSlotLike)
    .map(k => slotsMap[k]);

  const allRows = sortedSlots.flatMap(s => s.pallets);
  return {
    sheet: sheetName,
    slotCount: sortedSlots.length,
    maxDepth: allRows.length ? Math.max(...allRows.map(r => r.Depth)) : 0,
    maxLevel: allRows.length ? Math.max(...allRows.map(r => r.Level)) : 0,
    slots: sortedSlots,
  };
}

async function getInventorySheetList() {
  const names = await getSheetNames();
  return names.map(n => ({ name: n, count: 0 }));
}

async function getSearchIndex(sheetName) {
  const names = sheetName ? [sheetName] : await getSheetNames();
  const rows = [];
  for (const name of names) {
    const zv = await buildZoneView(name);
    for (const slot of zv.slots) {
      for (const depth of slot.depths) {
        rows.push(...depth.pallets);
      }
    }
  }
  return JSON.stringify(rows);
}

module.exports = { buildZoneView, getInventorySheetList, getSearchIndex };
