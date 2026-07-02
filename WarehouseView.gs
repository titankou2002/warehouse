function makePalletMatchKey_(p) {
  return [
    String(p.Sheet || '').trim(),
    String(p.Stack || '').trim(),
    String(p.Slot || '').trim(),
    String(p.Level || '').trim(),
    String(p.SKU || '').trim(),
    String(p.Batch || '').trim()
  ].join('||');
}

function enrichLivePalletsFromCache_(pallets) {
  var cache = [];
  try {
    cache = getInventoryArray_();
  } catch (e) {
    cache = [];
  }

  var exact = {};
  for (var i = 0; i < cache.length; i++) {
    var key = makePalletMatchKey_(cache[i]);
    if (!exact[key]) exact[key] = cache[i];
  }

  for (var p = 0; p < pallets.length; p++) {
    var match = exact[makePalletMatchKey_(pallets[p])];
    var merged = {};
    if (match) {
      for (var mk in match) merged[mk] = match[mk];
    }
    for (var pk in pallets[p]) merged[pk] = pallets[p][pk];
    pallets[p] = withDerivedGeometry_(merged);
  }
  return pallets;
}

function buildZoneViewModel_(rows, sheetName, capacities) {
  capacities = capacities || {};
  var slotsMap = {};
  var maxDepth = 0;
  var maxLevel = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = withDerivedGeometry_(rows[i]);
    var slotId = String(row.Slot || '').trim();
    if (!slotId) continue;

    if (!slotsMap[slotId]) {
      slotsMap[slotId] = {
        slotId: slotId,
        palletCount: 0,
        maxDepth: 0,
        maxLevel: 0,
        depthsMap: {},
        pallets: []
      };
    }

    var slot = slotsMap[slotId];
    var depth = Number(row.Depth || 0);
    var level = Number(row.Level || 0);
    if (!slot.depthsMap[depth]) {
      var capKey = slotId + '||' + depth;
      slot.depthsMap[depth] = {
        depth: depth,
        label: row.DepthLabel || depthLabel_(depth),
        height: 0,
        pallets: [],
        maxPallets: capacities[capKey] || 0
      };
    }

    slot.depthsMap[depth].pallets.push(row);
    slot.depthsMap[depth].height = Math.max(slot.depthsMap[depth].height, level);
    slot.pallets.push(row);
    slot.palletCount += 1;
    slot.maxDepth = Math.max(slot.maxDepth, depth);
    slot.maxLevel = Math.max(slot.maxLevel, level);
    maxDepth = Math.max(maxDepth, depth);
    maxLevel = Math.max(maxLevel, level);
  }

  // 從 capacities 補入沒有棧板但真實存在的深度排（避免前端對不存在的排顯示放置區）
  for (var capKey in capacities) {
    var capParts = capKey.split('||');
    var capSlotId = String(capParts[0] || '').trim();
    var capDepth  = Number(capParts[1] || 0);
    if (!capSlotId || capDepth < 1) continue;
    if (!slotsMap[capSlotId]) {
      slotsMap[capSlotId] = { slotId: capSlotId, palletCount: 0, maxDepth: 0, maxLevel: 0, depthsMap: {}, pallets: [] };
    }
    if (!slotsMap[capSlotId].depthsMap[capDepth]) {
      slotsMap[capSlotId].depthsMap[capDepth] = {
        depth: capDepth,
        label: depthLabel_(capDepth),
        height: 0,
        pallets: [],
        maxPallets: capacities[capKey] || 0
      };
      slotsMap[capSlotId].maxDepth = Math.max(slotsMap[capSlotId].maxDepth, capDepth);
      maxDepth = Math.max(maxDepth, capDepth);
    }
  }

  var slots = Object.keys(slotsMap).sort(compareSlotLikeText_).map(function (slotId) {
    var slot = slotsMap[slotId];
    var depths = Object.keys(slot.depthsMap).map(function (key) {
      var depthObj = slot.depthsMap[key];
      depthObj.pallets.sort(function (a, b) { return a.Level - b.Level; });
      return depthObj;
    }).sort(function (a, b) { return a.depth - b.depth; });
    slot.depths = depths;
    delete slot.depthsMap;
    return slot;
  });

  return {
    sheet: sheetName,
    slotCount: slots.length,
    totalPallets: rows.length,
    maxDepth: maxDepth,
    maxLevel: maxLevel,
    slots: slots
  };
}
