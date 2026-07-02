const { getSheetsClient, SHEET_ID } = require('./client');

// 批次寫入儲存格值（valueData: [{ range, values }]）
async function batchSetValues(valueData) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: valueData,
    },
  });
}

// 批次套用格式（requests: Google Sheets API Request[]）
async function batchFormat(requests) {
  if (!requests.length) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
}

// 產生背景色 Request
function bgColorRequest(sheetId, startRow, startCol, numRows, numCols, hexColor) {
  const rgb = hexToRgb(hexColor);
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: startRow + numRows,
                startColumnIndex: startCol, endColumnIndex: startCol + numCols },
      cell: { userEnteredFormat: { backgroundColor: rgb } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  };
}

// 產生字體 Request（bold + color）
function fontRequest(sheetId, startRow, startCol, numRows, numCols, bold, hexColor) {
  const rgb = hexToRgb(hexColor || '#000000');
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: startRow + numRows,
                startColumnIndex: startCol, endColumnIndex: startCol + numCols },
      cell: { userEnteredFormat: { textFormat: { bold, foregroundColor: rgb } } },
      fields: 'userEnteredFormat.textFormat(bold,foregroundColor)',
    },
  };
}

// 產生外框 Request
function borderRequest(sheetId, startRow, startCol, numRows, numCols, hexColor, style) {
  const rgb   = hexToRgb(hexColor);
  const bdr   = { style, color: rgb };
  return {
    updateBorders: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: startRow + numRows,
                startColumnIndex: startCol, endColumnIndex: startCol + numCols },
      top: bdr, bottom: bdr, left: bdr, right: bdr,
    },
  };
}

function hexToRgb(hex = '#000000') {
  const n = hex.replace('#', '');
  return {
    red:   parseInt(n.slice(0, 2), 16) / 255,
    green: parseInt(n.slice(2, 4), 16) / 255,
    blue:  parseInt(n.slice(4, 6), 16) / 255,
  };
}

// 取得工作表的 sheetId（數字）
async function getSheetId(sheetName) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title))',
  });
  const sheet = (res.data.sheets || []).find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`找不到工作表: ${sheetName}`);
  return sheet.properties.sheetId;
}

module.exports = { batchSetValues, batchFormat, bgColorRequest, fontRequest, borderRequest, getSheetId };
