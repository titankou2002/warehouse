const express = require('express');
const router  = express.Router();
const { getSheetNames, getSheetGrid } = require('../sheets/reader');
const { cleanValue } = require('../utils/gridUtils');

// GET /api/zones — 所有可用區域（工作表）及其庫位
router.get('/', async (req, res) => {
  try {
    const names = await getSheetNames();
    res.json({ zones: names });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/zones/:sheet — 某區域的庫位清單
router.get('/:sheet', async (req, res) => {
  try {
    const grid   = await getSheetGrid(req.params.sheet);
    const header = grid[0] || [];
    const slots  = [];
    header.forEach((c, i) => {
      const v = cleanValue(c?.value);
      if (v && !v.includes('排') && !v.includes('數') && !v.includes('量')) {
        slots.push({ id: v, col: i });
      }
    });
    res.json({ sheet: req.params.sheet, slots });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
