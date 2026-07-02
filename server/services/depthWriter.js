const { batchSetValues, batchFormat, bgColorRequest, fontRequest, borderRequest, getSheetId } = require('../sheets/writer');
const { bgHex, fgHex } = require('../utils/colorUtils');

const BORDER_COLOR = '#1a3a6a';
const BORDER_STYLE = 'SOLID_THICK';

// 把 pallets[] 寫回彩色格式 depth section
async function writeColoredDepthPallets(sheetName, prodCol, qtyCol, range, pallets) {
  const sheetId   = await getSheetId(sheetName);
  const valueData = [];
  const fmtReqs   = [];

  let nextRow      = range.startRow;
  let lastGroupId  = null;
  let groupStart   = -1;
  const groupRanges = [];

  for (const p of pallets) {
    if (nextRow > range.endRow) break;
    const bg = bgHex(p.bgColor);
    const fg = fgHex(p.fontColor);

    if (p.format === 'white') {
      if (groupStart >= 0) { groupRanges.push({ s: groupStart, e: nextRow - 1 }); groupStart = -1; }
      lastGroupId = null;
      valueData.push({ range: cellRange(sheetName, nextRow, prodCol), values: [[p.sku]] });
      valueData.push({ range: cellRange(sheetName, nextRow, qtyCol),  values: [[p.boxQty]] });
      fmtReqs.push(bgColorRequest(sheetId, nextRow, prodCol, 1, 2, '#ffffff'));
      fmtReqs.push(fontRequest(sheetId, nextRow, prodCol, 1, 2, false, '#000000'));
      nextRow++;
      continue;
    }

    const isNew = p.PalletGroupId !== lastGroupId;
    if (isNew) {
      if (groupStart >= 0) groupRanges.push({ s: groupStart, e: nextRow - 1 });
      groupStart  = nextRow;
      lastGroupId = p.PalletGroupId;
    }

    if (nextRow + 1 > range.endRow) break;
    const bold = isNew;
    valueData.push({ range: cellRange(sheetName, nextRow,   prodCol), values: [[p.sku]]      });
    valueData.push({ range: cellRange(sheetName, nextRow,   qtyCol),  values: [[p.boxQty]]   });
    valueData.push({ range: cellRange(sheetName, nextRow+1, prodCol), values: [[p.batch]]     });
    valueData.push({ range: cellRange(sheetName, nextRow+1, qtyCol),  values: [[p.pieceQty]] });
    fmtReqs.push(bgColorRequest(sheetId, nextRow,   prodCol, 2, 2, bg));
    fmtReqs.push(fontRequest(sheetId, nextRow,   prodCol, 1, 2, bold, fg));
    fmtReqs.push(fontRequest(sheetId, nextRow+1, prodCol, 1, 2, false, fg));
    nextRow += 2;
  }

  if (groupStart >= 0) groupRanges.push({ s: groupStart, e: nextRow - 1 });

  // 清空剩餘列
  for (let r = nextRow; r <= range.endRow; r++) {
    valueData.push({ range: cellRange(sheetName, r, prodCol), values: [['']] });
    valueData.push({ range: cellRange(sheetName, r, qtyCol),  values: [['']] });
    fmtReqs.push(bgColorRequest(sheetId, r, prodCol, 1, 2, '#ffffff'));
  }

  // 外框
  for (const { s, e } of groupRanges) {
    fmtReqs.push(borderRequest(sheetId, s, prodCol, e - s + 1, 2, BORDER_COLOR, BORDER_STYLE));
  }

  await batchSetValues(valueData);
  await batchFormat(fmtReqs);
}

// 把 pallets[] 寫回白色格式 depth section
async function writeWhiteDepthPallets(sheetName, prodCol, qtyCol, range, pallets) {
  const sheetId   = await getSheetId(sheetName);
  const valueData = [];
  const fmtReqs   = [];

  pallets.forEach((p, i) => {
    const r = range.startRow + i;
    if (r > range.endRow) return;
    valueData.push({ range: cellRange(sheetName, r, prodCol), values: [[p.sku]]    });
    valueData.push({ range: cellRange(sheetName, r, qtyCol),  values: [[p.boxQty]] });
    fmtReqs.push(bgColorRequest(sheetId, r, prodCol, 1, 2, '#ffffff'));
  });

  for (let r = range.startRow + pallets.length; r <= range.endRow; r++) {
    valueData.push({ range: cellRange(sheetName, r, prodCol), values: [['']] });
    valueData.push({ range: cellRange(sheetName, r, qtyCol),  values: [['']] });
  }

  await batchSetValues(valueData);
  await batchFormat(fmtReqs);
}

// A1 notation helper（0-based row/col → Sheets range string）
function cellRange(sheet, row, col) {
  const colLetter = colToLetter(col + 1);
  return `${sheet}!${colLetter}${row + 1}`;
}

function colToLetter(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

module.exports = { writeColoredDepthPallets, writeWhiteDepthPallets };
