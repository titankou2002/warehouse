const express = require('express');
const router  = express.Router();
const { getSheetGrid, getSheetNames } = require('../sheets/reader');
const { readDepthSection } = require('../services/depthSection');
const { findSlotProdCol, findDepthRowRange, findMaxDepth, cleanValue } = require('../utils/gridUtils');

// GET /api/inventory — 全部工作表名稱
router.get('/', async (req, res) => {
  try {
    const names = await getSheetNames();
    res.json({ sheets: names });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/inventory/:sheet?slot=A1 — 取得某工作表某庫位的全部排資料
router.get('/:sheet', async (req, res) => {
  try {
    const { sheet } = req.params;
    const slotId    = req.query.slot;
    if (!slotId) return res.status(400).json({ error: '缺少 slot 參數' });

    const grid    = await getSheetGrid(sheet);
    const prodCol = findSlotProdCol(grid, slotId);
    if (prodCol < 0) return res.status(404).json({ error: `找不到庫位: ${slotId}` });

    const qtyCol  = prodCol + 1;
    const maxDepth = findMaxDepth(grid, prodCol);
    const result   = [];

    for (let d = 1; d <= maxDepth; d++) {
      const range = findDepthRowRange(grid, d, prodCol);
      if (!range) continue;
      const { pallets, format } = readDepthSection(grid, prodCol, qtyCol, range);
      result.push({ depth: d, format, pallets });
    }

    res.json({ sheet, slot: slotId, depths: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/inventory/:sheet/slots — 取得工作表所有庫位 ID
router.get('/:sheet/slots', async (req, res) => {
  try {
    const grid   = await getSheetGrid(req.params.sheet);
    const header = grid[0] || [];
    const slots  = header
      .map(c => cleanValue(c?.value))
      .filter(v => v && !v.includes('排') && !v.includes('數'));
    res.json({ slots });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
