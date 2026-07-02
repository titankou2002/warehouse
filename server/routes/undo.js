const express = require('express');
const router  = express.Router();

// 簡單記憶體 undo stack（重啟會清空，足夠基本使用）
// 每筆: { type, sheet, slot, fromDepth, toDepth, sku, batch }
const undoStack = [];
const redoStack = [];
const MAX_STACK = 20;

// 外部呼叫：記錄一筆操作供 undo
function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > MAX_STACK) undoStack.shift();
  redoStack.length = 0; // 新操作清空 redo
}

// POST /api/undo
router.post('/', async (req, res) => {
  if (!undoStack.length) return res.status(400).json({ error: '沒有可復原的操作' });
  const entry = undoStack.pop();
  redoStack.push(entry);

  try {
    const { movePallet, movePalletGroup } = require('../services/moveService');
    const reverse = { ...entry, fromDepth: entry.toDepth, toDepth: entry.fromDepth };
    if (entry.type === 'group') {
      await movePalletGroup(reverse.sheet, reverse.slot, reverse.fromDepth, reverse.toDepth, reverse.sku, reverse.batch);
    } else {
      await movePallet(reverse.sheet, reverse.slot, reverse.fromDepth, reverse.toDepth, reverse.sku);
    }
    res.json({ ok: true, undone: entry });
  } catch (e) {
    undoStack.push(entry); // 復原失敗，推回去
    redoStack.pop();
    res.status(500).json({ error: e.message });
  }
});

// POST /api/redo
router.post('/redo', async (req, res) => {
  if (!redoStack.length) return res.status(400).json({ error: '沒有可重做的操作' });
  const entry = redoStack.pop();

  try {
    const { movePallet, movePalletGroup } = require('../services/moveService');
    if (entry.type === 'group') {
      await movePalletGroup(entry.sheet, entry.slot, entry.fromDepth, entry.toDepth, entry.sku, entry.batch);
    } else {
      await movePallet(entry.sheet, entry.slot, entry.fromDepth, entry.toDepth, entry.sku);
    }
    undoStack.push(entry);
    res.json({ ok: true, redone: entry });
  } catch (e) {
    redoStack.push(entry);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.pushUndo = pushUndo;
