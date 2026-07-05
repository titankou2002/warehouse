require('dotenv').config();
const express = require('express');
const path    = require('path');

const inventoryRoutes = require('./routes/inventory');
const moveRoutes      = require('./routes/move');
const undoRoutes      = require('./routes/undo');
const zoneRoutes      = require('./routes/zones');
const dispatchRoutes  = require('./routes/dispatch');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.use('/api/inventory', inventoryRoutes);
app.use('/api/move',      moveRoutes);
app.use('/api/undo',      undoRoutes);
app.use('/api/zones',     zoneRoutes);
app.use('/api/dispatch',  dispatchRoutes);

app.get('/healthz', (req, res) => res.json({ ok: true, v: 'TITAN-v1' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => console.log(`倉儲系統啟動 port ${PORT}`));
