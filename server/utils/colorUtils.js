// 顏色辨識工具 — 對齊 GAS WarehouseParse.gs 邏輯
// 使用 RGB ratio 演算法，而非 hex 精確比對

function parseHex(hex = '') {
  const h = (hex || '').replace('#', '').toLowerCase().trim();
  if (!h) return null;
  if (h.length === 3) {
    return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16) };
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

// 背景色辨識 — 完全對齊 GAS identifyBgColor()
function identifyBgColor(hex = '') {
  if (!hex || typeof hex !== 'string') return 'WHITE';
  let h = hex.trim().toUpperCase();
  if (h === 'WHITE' || h === '#FFFFFF' || h === '' || h === 'TRANSPARENT' ||
      h === 'RGBA(0, 0, 0, 0)') return 'WHITE';
  if (h.charAt(0) === '#') h = h.substr(1);
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  if (h.length !== 6) return 'WHITE';

  const rgb = parseHex(h);
  if (!rgb) return 'WHITE';
  const { r, g, b } = rgb;

  // YELLOW 先判（高 R + 高 G + 低 B），避免被 RED 吞掉
  if (r > 180 && g > 180 && b < 160) return 'YELLOW';
  // RED：涵蓋標準紅、深紅、偏暗紅、略帶粉紅（#FF6666, #E06666）及 Google Sheets 淡紅（#FF9999）
  // 條件：R > 120, R > G*1.2, R > B*1.2, G < R*0.65
  if (r > 120 && r > g * 1.2 && r > b * 1.2 && g < r * 0.65) return 'RED';
  if (g > 120 && g > r * 1.2 && g > b * 1.2) return 'GREEN';
  if (r > 120 && b > 120 && g < 100) return 'PURPLE';

  return 'WHITE';
}

// 字體色辨識 — 對齊 GAS identifyFontColor()
function identifyFontColor(hex = '') {
  if (!hex || typeof hex !== 'string') return 'BLACK';
  let h = hex.trim().toUpperCase();
  if (h === 'BLACK' || h === '#000000' || h === '') return 'BLACK';
  if (h.charAt(0) === '#') h = h.substr(1);
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  if (h.length !== 6) return 'BLACK';

  const rgb = parseHex(h);
  if (!rgb) return 'BLACK';
  const { r, g, b } = rgb;

  if (b > 150 && b > r * 1.3 && b > g * 1.3) return 'BLUE';
  if (r > 150 && r > g * 1.3 && r > b * 1.3) return 'RED';
  if (g > 120 && g > r * 1.2 && g > b * 1.2) return 'GREEN';
  return 'BLACK';
}

// 顏色 → 背景 hex（用於寫回）
const BG_HEX = {
  RED:    '#ff4444',
  YELLOW: '#ffff00',
  GREEN:  '#00b050',
  BLUE:   '#4472c4',
  ORANGE: '#ff9900',
  PURPLE: '#9900ff',
  GREY:   '#d9d9d9',
  WHITE:  '#ffffff',
  COLORED:'#d9d9d9',
};

// 字體色 → hex（用於寫回，對齊 GAS fgHexMove_）
const FG_HEX = {
  BLACK:  '#000000',
  BLUE:   '#0000ff',
  RED:    '#ff0000',
  GREEN:  '#00b050',
  COLORED:'#000000',
};

function bgHex(colorName) { return BG_HEX[colorName] || '#ffffff'; }
function fgHex(colorName) { return FG_HEX[colorName] || '#000000'; }

module.exports = { identifyBgColor, identifyFontColor, bgHex, fgHex, parseHex };
