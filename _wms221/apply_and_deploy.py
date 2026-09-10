#!/usr/bin/env python3
"""Apply @221 WMS fixes in-place then clasp push/deploy. Run on BIGT-MACMINI inside 倉庫全集."""
import re, sys, subprocess, pathlib, json

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
print('ROOT', ROOT)

def read(p):
    return pathlib.Path(p).read_text(encoding='utf-8')
def write(p, t):
    pathlib.Path(p).write_text(t, encoding='utf-8')
    print('wrote', p, 'len', len(t))

# Locate JS / CSS / Read files
cands_js = list(ROOT.glob('**/warehouse_grid_ui_js.html')) + list(ROOT.glob('**/*grid*js*.html'))
cands_css = list(ROOT.glob('**/warehouse_grid_ui_css.html')) + list(ROOT.glob('**/*grid*css*.html'))
cands_read = list(ROOT.glob('**/WarehouseRead.gs'))
cands_parse = list(ROOT.glob('**/WarehouseParse.gs'))
cands_wb = list(ROOT.glob('**/WarehouseWriteback.gs'))
print('js', cands_js)
print('css', cands_css)
print('read', cands_read)

PATCH_DIR = pathlib.Path(__file__).resolve().parent
client = read(PATCH_DIR / 'client.js')
user = read(PATCH_DIR / 'user.html')

# Extract style from user.html
m = re.search(r'<style>(.*?)</style>', user, re.S)
style = m.group(1) if m else ''

if cands_js:
    js_path = cands_js[0]
    raw = read(js_path)
    # If file wraps <script>, preserve wrapper
    if '<script' in raw[:200].lower():
        # replace innermost script content
        def repl(mo):
            return mo.group(1) + '\n' + client + '\n' + mo.group(3)
        new = re.sub(r'(<script[^>]*>)(.*?)(</script>)', repl, raw, count=1, flags=re.S|re.I)
        if new == raw:
            # no script tag — maybe raw JS include
            new = client
    else:
        new = client
    write(js_path, new)
else:
    print('WARNING: warehouse_grid_ui_js.html not found — writing warehouse_grid_ui_js.html')
    write(ROOT / 'warehouse_grid_ui_js.html', '<script>\n' + client + '\n</script>\n')

if cands_css and style:
    css_path = cands_css[0]
    raw = read(css_path)
    # Update search-hit-frame CSS block if present; else append
    pat = r'\.zone-chip\.search-hit-frame,\s*\.cell-btn\.search-hit-frame\s*\{.*?\}\s*@keyframes searchFramePulse\s*\{.*?\}'
    new_block = '''.zone-chip.search-hit-frame,
  .cell-btn.search-hit-frame {
    border: 4px solid #facc15 !important;
    box-shadow: 0 0 0 4px rgba(250,204,21,.35), 0 0 22px rgba(250,204,21,.55) !important;
    animation: searchFramePulse 1.1s ease-in-out infinite;
    outline: none !important;
  }
  @keyframes searchFramePulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(250,204,21,.28), 0 0 12px rgba(250,204,21,.35); border-color: #facc15; }
    50% { box-shadow: 0 0 0 6px rgba(250,204,21,.55), 0 0 28px rgba(250,204,21,.7); border-color: #fde047; }
  }'''
    if re.search(pat, raw, re.S):
        raw2 = re.sub(pat, new_block, raw, count=1, flags=re.S)
    else:
        # try insert before </style> or append
        if '</style>' in raw:
            raw2 = raw.replace('</style>', new_block + '\n</style>', 1)
        else:
            raw2 = raw + '\n' + new_block + '\n'
    write(css_path, raw2)

# Lighten getSearchIndex in WarehouseRead.gs
if cands_read:
    rp = cands_read[0]
    src = read(rp)
    # Find function getSearchIndex ... and rewrite return mapping if it pushes full row objects
    # Strategy: after building each row object destined for search, keep only light fields via a filter at stringify time.
    if 'function getSearchIndex' in src:
        # Inject light mapper before return JSON.stringify if not already @221
        if '@221 light search' not in src:
            # Wrap existing return JSON.stringify(X) inside getSearchIndex
            def lighten_fn(text):
                # crude: replace function body return JSON.stringify(foo) with mapped version
                mfn = re.search(r'function\s+getSearchIndex\s*\([^)]*\)\s*\{', text)
                if not mfn:
                    return text
                start = mfn.end()
                # find matching close brace
                i = start; depth=1
                while i < len(text) and depth:
                    if text[i]=='{': depth+=1
                    elif text[i]=='}': depth-=1
                    i+=1
                body = text[start:i-1]
                # If body already light, skip
                new_body = '''
  // @221 light search index
  var __raw;
  (function(){
''' + body.replace('return JSON.stringify', '__raw = ') + '''
  })();
  if (typeof __raw === 'string') {
    try { __raw = JSON.parse(__raw); } catch(e) { return __raw; }
  }
  if (!Array.isArray(__raw)) {
    // body may have returned via early path assigned differently — fall through
    return (typeof __raw === 'undefined') ? JSON.stringify([]) : JSON.stringify(__raw);
  }
  var __light = __raw.map(function(r){
    if (!r) return null;
    return {
      Sheet: r.Sheet,
      Slot: r.Slot,
      Depth: r.Depth,
      Level: r.Level,
      SKU: r.SKU || '',
      Batch: r.Batch || '',
      HanhwaCode: r.HanhwaCode || '',
      Brand: r.Brand || '',
      Company: r.Company || '',
      Branches: r.Branches || [],
      PalletKey: r.PalletKey || '',
      BgColor: r.BgColor || '',
      Status: r.Status || ''
    };
  }).filter(Boolean);
  return JSON.stringify(__light);
'''
                return text[:start] + new_body + text[i-1:]
            src2 = lighten_fn(src)
            write(rp, src2)
        else:
            print('WarehouseRead already @221')
    else:
        print('WARNING: getSearchIndex not found in', rp)

# Annotate qtyOnBatch notes from Parse/Writeback for report
notes=[]
for p in cands_parse + cands_wb:
    t=read(p)
    for key in ['qtyOnBatch', 'BoxQty', 'PieceQty', 'updateWarehousePallet', '箱', '片']:
        if key in t:
            notes.append(f'{p.name} has {key}')
print('notes', notes)

# node --check extracted
tmp = ROOT / '_check_client.js'
tmp.write_text(client, encoding='utf-8')
r = subprocess.run(['node','--check',str(tmp)], capture_output=True, text=True)
print('node --check', r.returncode, r.stderr)
tmp.unlink(missing_ok=True)
if r.returncode != 0:
    sys.exit(1)

# clasp
cmds = [
    ['clasp','push','-f'],
    ['clasp','deploy','-i','AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu','-d','fix zoom dup + search index + hit frame + qty @221'],
]
for cmd in cmds:
    print('RUN', cmd)
    p = subprocess.run(cmd, cwd=str(ROOT))
    if p.returncode != 0:
        sys.exit(p.returncode)
print('DONE @221')
print('TEST_URL=https://script.google.com/macros/s/AKfycbxydQCzEV2HcpN2BriFKh8rNm8xmwdPuud-9sAvyEkd4qDvFtrkkzxHaibrGpf71Cpu/exec?v=221&nocache=1')
