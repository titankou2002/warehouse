/**
 * 轉型為 [方案 A] 標準一維數據表格式 (Data Table Mode)
 * 將原有的視覺拼貼分頁轉換為標準一維數據表
 */
function migrateVisualGridToDataTable() {
  var ss = getWarehouseSpreadsheet_();
  var skuSet = buildSkuSet_();
  
  var zoneSheetNames = [
    '花磚', 'A-A區', 'A-B區', 'A-C區', 'A-D區', 'A-E區', 'A-F區',
    'B-A區', 'B-B區', 'B-C區', 'B-D區', 'B-E區', 'B-F區', 'B-G區',
    'C-A區', 'C-B區', 'C-C區'
  ];

  var headers = [
    'PalletID', 'Sheet', 'Slot', 'Depth', 'Level',
    'SKU', 'Batch', 'BoxQty', 'PieceQty',
    'Status', 'BgColor', 'FontColor', 'PalletGroupId', 'Remarks', 'UpdatedAt'
  ];

  var summary = [];

  for (var s = 0; s < zoneSheetNames.length; s++) {
    var name = zoneSheetNames[s];
    var srcSheet = ss.getSheetByName(name);
    if (!srcSheet) continue;

    var targetName = name + '_TABLE';
    var targetSheet = ss.getSheetByName(targetName);
    if (!targetSheet) {
      targetSheet = ss.insertSheet(targetName);
    } else {
      targetSheet.clear();
    }

    var grid = getSheetDataWithMergedResolved(srcSheet);
    var pallets = parseWarehouseGrid(grid, name);

    var rows = [headers];
    var nowStr = new Date().toISOString();

    for (var i = 0; i < pallets.length; i++) {
      var p = pallets[i];
      var pid = 'P_' + p.Sheet + '_' + p.Slot + '_' + p.Depth + '_' + p.Level + '_' + (i + 1);
      rows.push([
        pid,
        p.Sheet || name,
        p.Slot || '',
        p.Depth || 0,
        p.Level || 0,
        p.SKU || '',
        p.Batch || '無批號',
        p.BoxQty || 0,
        p.PieceQty || 0,
        p.Status || '正常庫存',
        p.BgColor || 'WHITE',
        p.FontColor || 'BLACK',
        p.PalletGroupId || pid,
        p.Remarks || '',
        nowStr
      ]);
    }

    if (rows.length > 1) {
      targetSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
      targetSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2d42').setFontColor('#ffffff');
      targetSheet.setFrozenRows(1);
    }
    summary.push(name + ' -> ' + targetName + ' (' + pallets.length + ' 板)');
  }
  return summary.join('\n');
}
