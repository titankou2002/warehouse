const COLOR_MAP = {
  RED:    ['ff0000','ff4444','ff0001','fe0000','ff4500','ff6600','ea4335','cc0000','ff3300'],
  YELLOW: ['ffff00','fff200','ffff01','ffd700','ffcc00','f4b400'],
  GREEN:  ['00ff00','00b050','008000','00b0f0','0070c0','34a853'],
  BLUE:   ['0000ff','4472c4','1155cc','0000cc','4a86e8'],
  ORANGE: ['ff6600','ff9900','e69138','f6b26b'],
  PURPLE: ['7f00ff','9900ff','8e44ad','673ab7'],
  GREY:   ['808080','9e9e9e','b7b7b7','cccccc','d9d9d9','efefef','f3f3f3','c0c0c0'],
};
const WHITE_HEX = ['ffffff','000000',''];

function identifyBgColor(hex = '') {
  const h = (hex || '').replace('#', '').toLowerCase().trim();
  if (!h || WHITE_HEX.includes(h)) return 'WHITE';
  for (const [name, list] of Object.entries(COLOR_MAP)) {
    if (list.includes(h)) return name;
  }
  // 灰色判定：r≈g≈b 且偏亮
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  if (Math.max(r,g,b) - Math.min(r,g,b) < 20 && r > 160) return 'WHITE';
  return 'COLORED';
}

function identifyFontColor(hex = '') {
  const h = (hex || '').replace('#', '').toLowerCase().trim();
  if (!h || h === 'ffffff' || h === '000000') return 'BLACK';
  return 'COLORED';
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
const FG_HEX = { BLACK: '#000000', COLORED: '#000000' };

function bgHex(colorName) { return BG_HEX[colorName] || '#ffffff'; }
function fgHex(colorName) { return FG_HEX[colorName] || '#000000'; }

module.exports = { identifyBgColor, identifyFontColor, bgHex, fgHex };
