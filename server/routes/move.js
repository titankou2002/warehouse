const express    = require('express');
const router     = express.Router();
const { movePallet, movePalletGroup } = require('../services/moveService');
const { pushUndo } = require('./undo');

// POST /api/move
// body: { sheet, slot, fromDepth, toDepth, sku }
router.post('/', async (req, res) => {
  try {
    const { sheet, slot, fromDepth, toDepth, sku } = req.body;
    if (!sheet || !slot || !fromDepth || !toDepth || !sku) {
      return res.status(400).json({ error: '缺少必要參數 (sheet, slot, fromDepth, toDepth, sku)' });
    }
    const result = await movePallet(sheet, slot, Number(fromDepth), Number(toDepth), sku);
    pushUndo({ type: 'single', sheet, slot, fromDepth: Number(fromDepth), toDepth: Number(toDepth), sku });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/move/group
// body: { sheet, slot, fromDepth, toDepth, sku, batch }
router.post('/group', async (req, res) => {
  try {
    const { sheet, slot, fromDepth, toDepth, sku, batch } = req.body;
    if (!sheet || !slot || !fromDepth || !toDepth || !sku) {
      return res.status(400).json({ error: '缺少必要參數 (sheet, slot, fromDepth, toDepth, sku)' });
    }
    const result = await movePalletGroup(sheet, slot, Number(fromDepth), Number(toDepth), sku, batch);
    pushUndo({ type: 'group', sheet, slot, fromDepth: Number(fromDepth), toDepth: Number(toDepth), sku, batch });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
