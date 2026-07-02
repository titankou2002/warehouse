const express = require('express');
const router  = express.Router();
const { buildZoneView, getInventorySheetList, getSearchIndex } = require('../services/zoneViewService');
const { movePallet, movePalletGroup }  = require('../services/moveService');
const { pushUndo } = require('./undo');

// 簡單記憶體 move history（最多 50 筆）
const moveHistory = [];
function addHistory(entry) {
  moveHistory.unshift(entry);
  if (moveHistory.length > 50) moveHistory.pop();
}

// 對應 GAS method 名稱
const HANDLERS = {
  async getInventorySheetList() {
    return await getInventorySheetList();
  },

  async getWarehouseZoneView(sheetName) {
    return await buildZoneView(sheetName);
  },

  async getSearchIndex() {
    return await getSearchIndex();
  },

  async getMoveHistory() {
    return { history: moveHistory };
  },

  async movePallet(params) {
    const { sourceSheet, destSheet, palletKey, destSlot, destDepth, operator } = params;
    // 從 palletKey 解析 sheet||slot||depth||level||sku||batch
    const parts = String(palletKey || '').split('||');
    const fromSlot  = parts[1] || '';
    const fromDepth = Number(parts[2]) || 1;
    const sku       = parts[4] || '';

    const sheet = sourceSheet;
    const result = await movePallet(sheet, fromSlot, fromDepth, Number(destDepth), sku);

    const entry = { type: 'movePallet', operator, sourceSheet, destSheet: destSheet || sourceSheet,
                    fromSlot, fromDepth, destSlot, destDepth: Number(destDepth), sku, ts: Date.now() };
    pushUndo({ type: 'single', sheet, slot: fromSlot, fromDepth, toDepth: Number(destDepth), sku });
    addHistory(entry);

    const [sourceZoneView, destZoneView] = await Promise.all([
      buildZoneView(sheet),
      destSheet && destSheet !== sheet ? buildZoneView(destSheet) : null,
    ]);
    return { ...result, history: moveHistory, sourceZoneView, destZoneView: destZoneView || sourceZoneView };
  },

  async movePalletGroup(params) {
    const { sourceSheet, destSheet, groupKeys, destSlot, destDepth, operator } = params;
    if (!groupKeys || !groupKeys.length) throw new Error('groupKeys 是空的');

    // 以第一個 key 解析來源
    const parts     = String(groupKeys[0]).split('||');
    const fromSlot  = parts[1] || '';
    const fromDepth = Number(parts[2]) || 1;
    const sku       = parts[4] || '';
    const batch     = parts[5] || '';

    const sheet  = sourceSheet;
    const result = await movePalletGroup(sheet, fromSlot, fromDepth, Number(destDepth), sku, batch);

    const entry = { type: 'movePalletGroup', operator, sourceSheet, destSheet: destSheet || sourceSheet,
                    fromSlot, fromDepth, destSlot, destDepth: Number(destDepth), sku, batch, count: result.moved, ts: Date.now() };
    pushUndo({ type: 'group', sheet, slot: fromSlot, fromDepth, toDepth: Number(destDepth), sku, batch });
    addHistory(entry);

    const [sourceZoneView, destZoneView] = await Promise.all([
      buildZoneView(sheet),
      destSheet && destSheet !== sheet ? buildZoneView(destSheet) : null,
    ]);
    return { ...result, history: moveHistory, sourceZoneView, destZoneView: destZoneView || sourceZoneView };
  },

  async undoLastMove() {
    // 觸發 undo service（via HTTP 內部呼叫 workaround：直接用 moveService）
    throw new Error('請使用 POST /api/undo');
  },

  async redoLastMove() {
    throw new Error('請使用 POST /api/undo/redo');
  },
};

// POST /api/dispatch  { method, args: [...] }
router.post('/', async (req, res) => {
  const { method, args = [] } = req.body;
  const handler = HANDLERS[method];
  if (!handler) return res.status(400).json({ error: `不支援的方法: ${method}` });

  try {
    const result = await handler(...args);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
