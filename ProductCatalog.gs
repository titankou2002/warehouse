// ===== 產品目錄查詢服務 =====
// 從四張 Google Sheets 讀取產品目錄，提供 lookupPalletQty(sku, zone) 查詢

var PRODUCT_CATALOGS_ = {
  '高雅瓷': {
    spreadsheetId: '1G5q-GixMWSdJJeF8ZiXWMOfrx4FMobER25jNc8m4Zds',
    gid: 1692526565,
    skuColumn: '編號',      // Column F (編號)
    palletQtyColumn: '箱/板' // Column L (箱/板)
  },
  '喜悅納': {
    spreadsheetId: '1uFKKWBfulg-GmCbJsSomimT5LW5r0N2w28rubrPveTA',
    gid: 1714485893,
    skuColumn: '編號',
    palletQtyColumn: '箱/板'
  },
  '安帝嘉': {
    spreadsheetId: '16QNID9hLs2K1iy_ePo7MxYxhW4kpDrDlfEIZ2p83ximo',
    gid: 980246579,
    skuColumn: '編號',
    palletQtyColumn: '箱/板'
  },
  '漢樺': {
    spreadsheetId: '1OnLLqn3zUp-AzoD6ds95lZ01XxwOut8bt8SCHYLl0hc',
    gid: 2120108225,
    skuColumn: '漢樺編號',   // Column A (漢樺編號)
    palletQtyColumn: '箱/板'
  }
};

// 區域 → 公司對應
var ZONE_COMPANY_MAP_ = {
  'A': ['喜悅納', '漢樺'],
  'B': ['高雅瓷', '安帝嘉'],
  'C': ['喜悅納', '漢樺']
};

// 快取：{ spreadsheetId: { sku: palletQty } }
var catalogCache_ = null;
var catalogLoadAttempted_ = false;

/**
 * 判斷編號是否為純數字
 */
function isPureDigits_(sku) {
  return /^\d+$/.test(sku);
}

/**
 * 從單張產品目錄讀取資料，建立 sku → palletQty 對應
 * @param {string} catalogName - 公司名稱
 * @returns {Object} { sku: palletQty }
 */
function formatDriveImageUrl_(url) {
  if (!url) return '';
  url = String(url).trim();
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return 'https://lh3.googleusercontent.com/d/' + match[1] + '=w600';
  }
  return url;
}

function loadCatalog_(catalogName) {
  var config = PRODUCT_CATALOGS_[catalogName];
  if (!config) return {};

  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var sheets = ss.getSheets();
    var sheet = null;

    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === config.gid) {
        sheet = sheets[i];
        break;
      }
    }
    if (!sheet) {
      Logger.log('ProductCatalog: 找不到 sheet ' + catalogName + ' gid=' + config.gid);
      return {};
    }

    var data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) return {};

    var headerRow = data[0];
    var skuIdx = -1;
    var palletQtyIdx = -1;
    var brandIdx = -1;
    var seriesIdx = -1;
    var cnSeriesIdx = -1;
    var nameIdx = -1;
    var sizeIdx = -1;
    var pcsIdx = -1;
    var imgIdx = -1;

    for (var si = 0; si < sheets.length; si++) {
      if (String(sheets[si].getName() || '').indexOf('編號價目') >= 0) {
        sheet = sheets[si];
        data = sheet.getDataRange().getValues();
        if (data && data.length >= 2) headerRow = data[0];
        break;
      }
    }
    if (!data || data.length < 2) return {};

    for (var h = 0; h < headerRow.length; h++) {
      var header = String(headerRow[h] || '').trim();
      if (header === config.skuColumn || header === '編號' || header === '產品編號' || header === '漢樺編號') { if (skuIdx < 0) skuIdx = h; }
      if (header === config.palletQtyColumn || header === '箱/板') palletQtyIdx = h;
      if (header === '廠牌' || header === '品牌') brandIdx = h;
      if (header === '系列' || header === '英文系列') { if (seriesIdx < 0) seriesIdx = h; }
      if (header === '中文系列' || header === '中文名稱' || header === '系列中文') cnSeriesIdx = h;
      if (header === '原廠品名' || header === '產品名稱' || header === '品名') nameIdx = h;
      if (header === '尺寸(cm)' || header === '尺寸') sizeIdx = h;
      if (header === '片/箱' || header === '片裝數') pcsIdx = h;
      if (header === '單片連結網址' || header === '單片圖' || header === '圖片網址' || header.indexOf('單片') >= 0) { if (imgIdx < 0) imgIdx = h; }
    }

    var result = {};
    for (var r = 1; r < data.length; r++) {
      var sku = String(data[r][skuIdx] || '').trim();
      if (!sku) continue;
      var palletQty = parseFloat(data[r][palletQtyIdx]) || 0;
      result[sku] = {
        palletQty: palletQty,
        Brand: brandIdx >= 0 ? String(data[r][brandIdx] || '').trim() : '',
        Series: seriesIdx >= 0 ? String(data[r][seriesIdx] || '').trim() : '',
        ChineseSeries: cnSeriesIdx >= 0 ? String(data[r][cnSeriesIdx] || '').trim() : '',
        OriginalName: nameIdx >= 0 ? String(data[r][nameIdx] || '').trim() : '',
        Size: sizeIdx >= 0 ? String(data[r][sizeIdx] || '').trim() : '',
        PiecesPerBox: pcsIdx >= 0 ? (parseFloat(data[r][pcsIdx]) || null) : null,
        SinglePieceImage: imgIdx >= 0 ? formatDriveImageUrl_(data[r][imgIdx]) : ''
      };
    }

    Logger.log('ProductCatalog: 載入 ' + catalogName + ' 共 ' + Object.keys(result).length + ' 筆');
    return result;
  } catch (e) {
    Logger.log('ProductCatalog: 載入 ' + catalogName + ' 失敗: ' + e.toString());
    return {};
  }
}

/**
 * 載入所有產品目錄（帶 CacheService 6小時快取）
 */
function loadAllCatalogs_() {
  if (catalogCache_) return catalogCache_;
  var scriptCache = CacheService.getScriptCache();
  try {
    var cachedJson = scriptCache.get('all_product_catalogs_v2');
    if (cachedJson) {
      catalogCache_ = JSON.parse(cachedJson);
      return catalogCache_;
    }
  } catch (eCacheGet) {
    Logger.log('loadAllCatalogs_ cache get warn: ' + eCacheGet.toString());
  }

  if (catalogLoadAttempted_) return catalogCache_ || {};
  catalogLoadAttempted_ = true;

  catalogCache_ = {};
  var names = Object.keys(PRODUCT_CATALOGS_);
  for (var i = 0; i < names.length; i++) {
    catalogCache_[names[i]] = loadCatalog_(names[i]);
  }

  try {
    var str = JSON.stringify(catalogCache_);
    if (str.length < 95000) {
      scriptCache.put('all_product_catalogs_v2', str, 21600); // 6h
    }
  } catch (eCachePut) {
    Logger.log('loadAllCatalogs_ cache put warn: ' + eCachePut.toString());
  }

  return catalogCache_;
}

/**
 * 清除快取（供手動刷新）
 */
function clearProductCatalogCache() {
  catalogCache_ = null;
  catalogLoadAttempted_ = false;
  return { ok: true };
}

/**
 * 查詢完整棧板的箱數（箱/板）
 * @param {string} sku - 品號
 * @param {string} zone - 區域 ('A', 'B', 'C')
 * @returns {number} 箱/板 數量，找不到回傳 0
 */
function lookupPalletQty(sku, zone) {
  if (!sku || !zone) return 0;

  var catalogs = loadAllCatalogs_();
  var companies = ZONE_COMPANY_MAP_[zone] || ['漢樺', '高雅瓷', '安帝嘉', '喜悅納'];
  var cleanSku = String(sku).trim();
  var getQty = function(item) {
    if (!item) return 0;
    return typeof item === 'object' ? (item.palletQty || 0) : (parseFloat(item) || 0);
  };

  for (var i = 0; i < companies.length; i++) {
    var company = companies[i];
    var companyData = catalogs[company];
    if (companyData && companyData[cleanSku]) {
      return getQty(companyData[cleanSku]);
    }
  }

  var hanData = catalogs['漢樺'];
  if (hanData && hanData[cleanSku]) {
    return getQty(hanData[cleanSku]);
  }

  return 0;
}

/**
 * 查詢 SKU 規格資訊 (Brand, Series, OriginalName, Size, PiecesPerBox)
 */
function lookupCatalogSpecs_(sku, zone) {
  if (!sku) return null;
  var catalogs = loadAllCatalogs_();
  var companies = ['高雅瓷', '安帝嘉', '喜悅納', '漢樺'];
  if (zone && ZONE_COMPANY_MAP_[zone]) {
    companies = ZONE_COMPANY_MAP_[zone].concat(companies);
  }

  var cleanSku = String(sku).trim().toUpperCase();
  var normSku = cleanSku.replace(/[^A-Z0-9]/g, '');

  for (var i = 0; i < companies.length; i++) {
    var cData = catalogs[companies[i]];
    if (!cData) continue;
    if (cData[cleanSku]) return cData[cleanSku];
    var keys = Object.keys(cData);
    for (var k = 0; k < keys.length; k++) {
      var keyStr = keys[k];
      var normKey = keyStr.replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (normKey && (normKey === normSku || normSku.indexOf(normKey) === 0 || normKey.indexOf(normSku) === 0)) {
        return cData[keyStr];
      }
    }
  }
  return null;
}

/**
 * 從單張產品目錄讀取所有 SKU 編號（不篩選箱/板，全部收錄）
 * @param {string} catalogName - 公司名稱
 * @returns {Object} { sku: true }
 */
function loadCatalogSkus_(catalogName) {
  var config = PRODUCT_CATALOGS_[catalogName];
  if (!config) return {};
  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var sheets = ss.getSheets();
    var sheet = null;
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === config.gid) { sheet = sheets[i]; break; }
    }
    if (!sheet) return {};
    var data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) return {};
    var headerRow = data[0];
    var skuIdx = -1;
    for (var h = 0; h < headerRow.length; h++) {
      if (String(headerRow[h] || '').trim() === config.skuColumn) { skuIdx = h; break; }
    }
    if (skuIdx < 0) return {};
    var result = {};
    for (var r = 1; r < data.length; r++) {
      var sku = String(data[r][skuIdx] || '').trim();
      if (sku) result[sku] = true;
    }
    return result;
  } catch (e) {
    Logger.log('ProductCatalog: loadCatalogSkus_ ' + catalogName + ' 失敗: ' + e.toString());
    return {};
  }
}

/**
 * 建立所有已知 SKU 的 Set（供 parseWarehouseGrid 判斷編號行）
 * 注意：不使用 loadAllCatalogs_()（那個只載入箱/板>0的），
 *       直接讀取所有 SKU，不管箱/板數量。
 * @returns {Object} { sku: true }
 */
function buildSkuSet_() {
  var set = {};
  var names = Object.keys(PRODUCT_CATALOGS_);
  for (var i = 0; i < names.length; i++) {
    var skus = loadCatalogSkus_(names[i]);
    var keys = Object.keys(skus);
    for (var j = 0; j < keys.length; j++) {
      set[keys[j]] = true;
    }
  }
  Logger.log('buildSkuSet_: 共 ' + Object.keys(set).length + ' 個 SKU');
  return set;
}

/**
 * 批量填充白底 pallet 的 BoxQty（從產品目錄查詢）
 * 只在 BoxQty === 0 時查詢，查詢一次目錄、批量套用
 * @param {Array} pallets - parseWarehouseGrid 回傳的 pallet 陣列（會直接修改）
 * @returns {number} 填充了多少筆
 */
function enrichCatalogQty(pallets) {
  if (!pallets || !pallets.length) return 0;
  // 只預載一次
  loadAllCatalogs_();
  var filled = 0;
  for (var i = 0; i < pallets.length; i++) {
    var p = pallets[i];
    if (p.BgColor !== 'WHITE' || p.BoxQty > 0 || !p.SKU) continue;
    var zone = p.Sheet ? p.Sheet.charAt(0) : '';
    var qty = lookupPalletQty(p.SKU, zone);
    if (qty > 0) {
      p.BoxQty = qty;
      filled++;
    }
  }
  return filled;
}
