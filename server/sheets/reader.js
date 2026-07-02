const { getSheetsClient, SHEET_ID } = require('./client');

// 取得指定工作表的所有格值、背景色、字體粗細（flat 2D array of cell objects）
async function getSheetGrid(sheetName) {
  const sheets = await getSheetsClient();

  const [valRes, fmtRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: sheetName,
      valueRenderOption: 'UNFORMATTED_VALUE',
    }),
    sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      ranges: [sheetName],
      fields: 'sheets(data(rowData(values(userEnteredFormat(backgroundColor,textFormat(bold,foregroundColor))))))',
    }),
  ]);

  const values  = valRes.data.values || [];
  const rowData = fmtRes.data.sheets?.[0]?.data?.[0]?.rowData || [];
  const maxCols = values.reduce((m, r) => Math.max(m, r.length), 0);

  return values.map((row, ri) => {
    const fmtRow = rowData[ri]?.values || [];
    return Array.from({ length: maxCols }, (_, ci) => {
      const val = row[ci] ?? null;
      const fmt = fmtRow[ci]?.userEnteredFormat || {};
      const bg  = fmt.backgroundColor || {};
      const tf  = fmt.textFormat || {};
      return {
        value:      val,
        bgColor:    rgbToHex(bg),
        fontWeight: tf.bold ? 'bold' : 'normal',
        fontColor:  rgbToHex(tf.foregroundColor || {}),
      };
    });
  });
}

// Google Sheets 回傳 { red, green, blue } 0~1 浮點數
function rgbToHex({ red = 0, green = 0, blue = 0 } = {}) {
  const r = Math.round(red   * 255).toString(16).padStart(2, '0');
  const g = Math.round(green * 255).toString(16).padStart(2, '0');
  const b = Math.round(blue  * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// 取得所有工作表名稱
async function getSheetNames() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(title))',
  });
  return (res.data.sheets || []).map(s => s.properties.title);
}

module.exports = { getSheetGrid, getSheetNames };
