/* ============================================================
   Shared core: helpers, view definitions, exports, crypto.
   Loaded by both the builder (build.html) and the viewer (index.html).
   ============================================================ */

const STATUS = {
  WAIT: 'Waitlisted',
  ANGEL: 'Needs Angel Contact',
  SEND: 'Unsupported, send Box'
};

const state = {
  files: {},          // key -> { fileName, sheets, sheetName, rows, headerRow, map:{field:colIndex} }
  month: null,        // {y, m}
  rows: [],           // the No Box records
  batches: [],
  view: 'all',
  hideUnreviewed: true
};

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const colLetter = i => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
const letterToIndex = L => { if (!L) return -1; let n = 0; for (const ch of L.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function norm(v){
  if (v == null) return '';
  let s = String(v).replace(/\s+/g, ' ').trim().toLowerCase();
  if (s.includes(',')) { const p = s.split(','); if (p.length === 2) s = (p[1] + ' ' + p[0]).replace(/\s+/g,' ').trim(); }
  return s.replace(/[.'`]/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/,'').trim();
}
function toNum(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[$,\s]/g,''));
  return isNaN(n) ? 0 : n;
}
function toDate(v){
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number'){
    if (v < 1 || v > 80000) return null;
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m){
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(y, +m[1] - 1, +m[2]);
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const fmtDate = d => d ? (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear() : '';
const inMonth = d => !!(d && state.month && d.getFullYear() === state.month.y && d.getMonth() === state.month.m);
function splitName(full){
  const s = String(full || '').trim();
  if (s.includes(',')){ const p = s.split(','); return { first:(p[1]||'').trim(), last:(p[0]||'').trim() }; }
  const p = s.split(/\s+/);
  if (p.length < 2) return { first:s, last:'' };
  return { first: p.slice(0, -1).join(' '), last: p[p.length - 1] };
}
function cleanZip(v){
  if (v == null || v === '') return '';
  let s = String(v).trim();
  if (/^\d{1,4}$/.test(s)) s = s.padStart(5, '0');
  return s;
}
const isMilCity = c => /^(apo|fpo|dpo)\b/i.test(String(c || '').trim());
const isTotalRow = n => /^(grand\s+)?(total|subtotal|sum)\b|copyright|confidential|do not distribute|salesforce\.com|all rights reserved/i.test(String(n || '').trim());
function hasNumber(row){ return (row || []).some(v => typeof v === 'number' || (v !== '' && v != null && !isNaN(parseFloat(v)) && /^[\s$,.\d%-]+$/.test(String(v)))); }

/* Address parsing. Real exports arrive in more than one shape:
     "CPR 1690, Box #12<br>APO, AE 09240"
     "379 Efss / v2x OPC 1201 Box 65, APO, AE 09309 US"
     "CSOJTF-C (J-8),, APO, AE 09315 United States"
   Normalize the line break to a comma, drop the trailing country, then read
   city / state / zip off the end. Whatever is left is the street. */
function parseAddress(v){
  const out = { addr1:'', addr2:'', city:'', state:'', zip:'' };
  if (v == null) return out;

  let s = String(v)
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/[\r\n]+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  s = s.replace(/[,\s]+(united states of america|united states|u\.?s\.?a\.?|usa|us)\s*$/i, '');
  s = s.replace(/(\s*,\s*){2,}/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');
  if (!s) return out;

  // street , city , ST 12345
  let m = s.match(/^(.*?),\s*([^,]{1,60}),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) m = s.match(/^(.*?),\s*([^,]{1,60})\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m){
    out.addr1 = m[1].replace(/[,\s]+$/,'').trim();
    out.city  = m[2].replace(/[,\s]+$/,'').trim();
    out.state = m[3].toUpperCase();
    out.zip   = m[4];
    return out;
  }

  // no street, just city / state / zip
  m = s.match(/^([^,]{1,60})[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m){
    out.city = m[1].trim(); out.state = m[2].toUpperCase(); out.zip = m[3];
    return out;
  }

  // could not read it: keep it whole so nothing is silently lost
  out.addr1 = s;
  return out;
}

function save(){ try{ const m = {}; for (const k in state.files){ const f = state.files[k]; m[k] = { headerRow:f.headerRow, map:f.map }; } localStorage.setItem('nobox-map-v1', JSON.stringify(m)); }catch(e){} }
function loadSaved(key){ try{ const m = JSON.parse(localStorage.getItem('nobox-map-v1') || '{}'); return m[key] || null; }catch(e){ return null; } }

/* ---------- Stage 4: views ---------- */
const COLS = {
  full: [
    ['name','Client Name'],['status','Status'],['clientId','Client ID'],['mailStop','Mail Stop Date'],
    ['serviceDelivery','Service Delivery'],['reportBy','Report by Date'],['first','Client First Name'],['last','Client Last Name'],
    ['addr1','Mailing Address Line 1'],['addr2','Mailing Address Line 2'],['city','Mailing City'],['state','Mailing State/Province'],['zip','Mailing Zip/Postal Code']
  ],
  logistics: [
    ['name','Client Name'],['first','First Name'],['last','Last Name'],
    ['addr1','Mailing Address Line 1'],['addr2','Mailing Address Line 2'],['city','Mailing City'],['state','State/Province'],['zip','Zip/Postal Code'],
    ['mailStop','Mail Stop Date'],['review','Review']
  ],
  /* Review queue: what is wrong, who it is, and the ID to jump to the record. */
  review: [
    ['name','Client Name'],['review','Review'],['clientId','Client ID'],
    ['status','Status'],['mailStop','Mail Stop Date'],['reportBy','Report by Date'],
    ['serviceDelivery','Service Delivery'],
    ['addr1','Mailing Address Line 1'],['addr2','Mailing Address Line 2'],
    ['city','Mailing City'],['state','State/Province'],['zip','Zip/Postal Code'],
    ['first','First Name'],['last','Last Name']
  ],
  /* What Logistics actually ships from. One cell per field, nothing else. */
  shipping: [
    ['first','First Name'],['last','Last Name'],
    ['addr1','Mailing Address Line 1'],['addr2','Mailing Address Line 2'],
    ['city','Mailing City'],['state','State/Province'],['zip','Zip/Postal Code']
  ],
  volunteer: [
    ['reportBy','Report by Date'],['name','Client Name'],['first','First Name'],['last','Last Name'],
    ['clientId','Client ID'],['serviceDelivery','Service Delivery'],['mailStop','Mail Stop Date']
  ]
};
const VIEWS = {
  all: {
    title:'Full No Box list',
    desc:'Every member with no box this month, with Status and flags applied. This is the tab that goes in the workbook.',
    cols: COLS.full, rows: () => state.rows
  },
  logistics: {
    title:'Logistics: send a box',
    desc:'Nothing is blocking these members. Status reads "Unsupported, send Box." Export this and hand it to Logistics for fulfillment.',
    cols: COLS.logistics, exportCols: COLS.shipping,
    rows: () => state.rows.filter(r => r.status === STATUS.SEND), filter:'review'
  },
  volunteer: {
    title:'Volunteer Services: reach out',
    desc:'These members have a service delivery this month and are waiting on an Angel to make contact. Soonest Report by Date first, so the top of the list is the most urgent. No box yet.',
    cols: COLS.volunteer, sort:'reportBy',
    rows: () => state.rows.filter(r => r.status === STATUS.ANGEL)
  },
  waitlisted: {
    title:'Already waitlisted',
    desc:'On the Currently Waitlisted Clients report. No box, no outreach needed. Here for the record.',
    cols: COLS.volunteer, rows: () => state.rows.filter(r => r.status === STATUS.WAIT)
  },
  review: {
    title:'Needs review before anything ships',
    desc:'What is wrong is in the Review column, and the Client ID is right there to look the record up. Red means the Mail Stop Date lands in the reporting month, so confirm eligibility. Purple means the mailing city is not APO, FPO, or DPO. Incomplete means the address would not parse into city, state, and zip.',
    cols: COLS.review,
    rows: () => state.rows.filter(r => r.flagRed || r.flagPurple || (r.status === STATUS.SEND && (!r.addr1 || !r.city || !r.zip)))
  }
};
function cellVal(r, k){
  if (k === 'mailStop' || k === 'reportBy') return fmtDate(r[k]);
  if (k === 'review'){
    const t = [];
    if (r.flagRed) t.push('Confirm eligibility');
    if (r.flagPurple) t.push('Verify address');
    if (!r.addr1) t.push('No address');
    else if (!r.city || !r.zip) t.push('Incomplete address');
    return t.join(' · ');
  }
  return r[k] == null ? '' : String(r[k]);
}
/* Rows with no date sort to the bottom rather than the top, so a missing
   date never looks like the most urgent thing on the list. */
function byDate(field){
  return (a, b) => {
    const x = a[field], y = b[field];
    if (!x && !y) return String(a.last || a.name).localeCompare(String(b.last || b.name));
    if (!x) return 1;
    if (!y) return -1;
    return x - y;
  };
}
function activeRows(){
  const v = VIEWS[state.view];
  let rows = v.rows();
  if (v.filter === 'review' && state.hideUnreviewed) rows = rows.filter(r => !r.flagRed && !r.flagPurple && r.addr1 && r.city && r.zip);
  if (v.sort) rows = rows.slice().sort(byDate(v.sort));
  return rows;
}
function renderView(){
  const v = VIEWS[state.view];
  $('#vTitle').textContent = v.title;
  $('#vDesc').textContent = v.desc;
  for (const k in VIEWS) { const n = document.getElementById('n-' + k); if (n) n.textContent = VIEWS[k].rows().length; }

  const fbox = $('#vFilters');
  if (v.filter === 'review'){
    const hidden = v.rows().length - activeRows().length;
    fbox.innerHTML = `<label><input type="checkbox" id="hideUn" ${state.hideUnreviewed ? 'checked' : ''}> Hold back rows that still need review</label>
      <span class="hint">${hidden} held back</span>`;
    $('#hideUn').addEventListener('change', e => { state.hideUnreviewed = e.target.checked; renderView(); });
  } else fbox.innerHTML = '';

  const rows = activeRows();
  const t = $('#vTable');
  t.querySelector('thead').innerHTML = '<tr>' + v.cols.map(c => `<th>${c[1]}</th>`).join('') + '</tr>';
  t.querySelector('tbody').innerHTML = rows.map(r => {
    let cls = '';
    if (r.flagRed) cls = 'red'; else if (r.status === STATUS.WAIT) cls = 'gold'; else if (r.status === STATUS.ANGEL) cls = 'blue';
    return '<tr class="' + cls + '">' + v.cols.map(c => {
      let val = cellVal(r, c[0]);
      if (c[0] === 'status'){
        const tag = r.status === STATUS.WAIT ? 'gold' : r.status === STATUS.ANGEL ? 'blue' : 'send';
        val = `<span class="tag ${tag}">${val}</span>`;
      }
      if (c[0] === 'review' && val){
        val = val.split(' · ').map(x => `<span class="tag ${x === 'Verify address' ? 'purple' : 'red'}">${x}</span>`).join(' ');
      }
      const pc = (r.flagPurple && ['addr1','addr2','city','state','zip'].includes(c[0])) ? ' class="flag-purple"' : '';
      return `<td${pc}>${val || ''}</td>`;
    }).join('') + '</tr>';
  }).join('') || `<tr><td colspan="${v.cols.length}" style="padding:20px;color:var(--ink-soft)">Nothing in this list.</td></tr>`;
  $('#vFoot').textContent = rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' shown.';
}

/* ---------- exports ---------- */
function stamp(){
  const d = state.month ? new Date(state.month.y, state.month.m, 1) : new Date();
  return d.toLocaleString('en-US', { month:'short' }) + '-' + d.getFullYear();
}
function download(blob, name){
  const url = URL.createObjectURL(blob);
  const a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
}
function colsFor(v){ return v.exportCols || v.cols; }
function exportCsv(){
  const v = VIEWS[state.view], rows = activeRows(), cols = colsFor(v);
  const esc = s => '"' + String(s == null ? '' : s).replace(/"/g,'""') + '"';
  const lines = [cols.map(c => esc(c[1])).join(',')];
  rows.forEach(r => lines.push(cols.map(c => esc(cellVal(r, c[0]))).join(',')));
  download(new Blob(['\ufeff' + lines.join('\r\n')], { type:'text/csv;charset=utf-8' }), `${state.view}-no-box-${stamp()}.csv`);
}
const ARGB = { gold:'FFFFC72C', blue:'FF4472C4', purple:'FF7030A0', red:'FFC00000', maroon:'FF6E1B2C', wash:'FFF2DEDE', white:'FFFFFFFF' };
function fill(c, argb){ c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb } }; }
function sheetFrom(ws, cols, rows, opts){
  opts = opts || {};
  const start = opts.startRow || 1;
  const hdr = ws.getRow(start);
  cols.forEach((c, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = c[1];
    fill(cell, ARGB.maroon);
    cell.font = { bold:true, color:{ argb:ARGB.white } };
    cell.alignment = { vertical:'middle' };
  });
  hdr.height = 20;
  rows.forEach((r, ri) => {
    const row = ws.getRow(start + 1 + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const k = c[0];
      if (k === 'zip'){ cell.value = r.zip || ''; cell.numFmt = '@'; }
      else if (k === 'mailStop' || k === 'reportBy'){ cell.value = r[k] || null; if (r[k]) cell.numFmt = 'mm/dd/yyyy'; }
      else cell.value = cellVal(r, k);
      if (opts.color){
        if (r.flagRed){ fill(cell, ARGB.red); cell.font = { bold:true, color:{ argb:ARGB.white } }; }
        else if (r.status === STATUS.WAIT){ fill(cell, ARGB.gold); cell.font = { bold:true, color:{ argb:ARGB.maroon } }; }
        else if (r.status === STATUS.ANGEL){ fill(cell, ARGB.blue); cell.font = { bold:true, color:{ argb:ARGB.white } }; }
        if (r.flagPurple && ['addr1','addr2','city','state','zip'].includes(k) && !r.flagRed){
          fill(cell, ARGB.purple); cell.font = { bold:true, color:{ argb:ARGB.white } };
        }
      }
    });
  });
  cols.forEach((c, i) => {
    const w = Math.max(c[1].length + 2, ...rows.slice(0, 400).map(r => String(cellVal(r, c[0])).length + 2));
    ws.getColumn(i + 1).width = Math.min(38, Math.max(11, w));
  });
  ws.autoFilter = { from:{ row:start, column:1 }, to:{ row:start, column:cols.length } };
  ws.views = [{ state:'frozen', ySplit:start }];
}
async function exportXlsx(){
  const v = VIEWS[state.view];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(v.title.slice(0, 28).replace(/[\\\/\?\*\[\]:]/g,''));
  sheetFrom(ws, colsFor(v), activeRows(), { color: state.view === 'all' });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${state.view}-no-box-${stamp()}.xlsx`);
}
async function exportWorkbook(){
  const wb = new ExcelJS.Workbook();
  wb.creator = 'No Box Builder';
  const ws = wb.addWorksheet('No Box');

  const banner = ws.getCell('A1');
  banner.value = 'Members Without a Box';
  banner.font = { bold:true, size:16, color:{ argb:ARGB.white } };
  fill(banner, ARGB.maroon);
  ws.mergeCells('A1:C3');
  banner.alignment = { vertical:'middle', horizontal:'left', indent:1 };

  const c = s => state.rows.filter(r => r.status === s).length;
  const summary = [
    ['True Count of Unsupported', state.rows.length],
    ['Current Waitlist Count', c(STATUS.WAIT)],
    ['Pending Service Delivery', c(STATUS.ANGEL)],
    ['Total Boxes to Send', state.rows.length - c(STATUS.WAIT) - c(STATUS.ANGEL)]
  ];
  summary.forEach(([label, val], i) => {
    const L = ws.getCell('E' + (i + 1)), V = ws.getCell('F' + (i + 1));
    L.value = label; fill(L, ARGB.wash); L.font = { bold:true, color:{ argb:ARGB.maroon } };
    V.value = val; V.numFmt = '#,##0'; V.alignment = { horizontal:'center' }; V.font = { bold:true };
    if (i === 1) fill(V, ARGB.gold);
  });
  ws.getColumn(5).width = 26; ws.getColumn(6).width = 12;

  sheetFrom(ws, COLS.full, state.rows, { startRow:5, color:true });

  sheetFrom(wb.addWorksheet('Logistics - Send Box'), COLS.shipping, state.rows.filter(r => r.status === STATUS.SEND), {});
  sheetFrom(wb.addWorksheet('Volunteer Svcs - Outreach'), COLS.volunteer,
    state.rows.filter(r => r.status === STATUS.ANGEL).sort(byDate('reportBy')), {});
  sheetFrom(wb.addWorksheet('Waitlisted'), COLS.volunteer, state.rows.filter(r => r.status === STATUS.WAIT), {});

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `No Box - ${stamp()}.xlsx`);
}

/* ---------- publishing crypto ----------
   Rows are encrypted in the browser with a key derived from the team
   password. What lands in the repo is ciphertext. Without the password
   the file is noise, so a leaked URL does not leak member data. */
const CRYPTO_ITER = 250000;
/* Open mode: no password set in config.js. The list is still encrypted on the
   wire, but with a key that is sitting right here in the code, so it protects
   nothing. It exists so the tool can be tested end to end before passwords are
   turned on. Both pages shout about it while it is active. */
const OPEN_KEY = 'nobox-open-mode-no-password-set';
function siteLocked(){ return !!(window.NOBOX_CONFIG || {}).passwordHash; }
function keyFor(pw){ return siteLocked() ? pw : OPEN_KEY; }
const b64 = {
  enc: buf => {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
    return btoa(s);
  },
  dec: s => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
};
function cryptoReady(){ return !!(window.crypto && window.crypto.subtle); }
async function deriveKey(pw, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iter, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
async function encryptPayload(pw, obj){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt, CRYPTO_ITER);
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({ v:1, iter:CRYPTO_ITER, salt:b64.enc(salt), iv:b64.enc(iv), ct:b64.enc(ct) }, null, 0);
}
async function decryptPayload(pw, fileText){
  const f = JSON.parse(fileText);
  const key = await deriveKey(pw, b64.dec(f.salt), f.iter || CRYPTO_ITER);
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64.dec(f.iv) }, key, b64.dec(f.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
function reviveRows(rows){
  rows.forEach(r => {
    r.mailStop = r.mailStop ? new Date(r.mailStop) : null;
    r.reportBy = r.reportBy ? new Date(r.reportBy) : null;
  });
  return rows;
}
