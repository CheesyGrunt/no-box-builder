/* ============================================================
   Deployed Monthly: No Box Builder
   Everything runs client side. No network calls, no uploads.
   ============================================================ */

/* ---------- what each file needs to give us ---------- */
const SPECS = {
  deployed: {
    label: 'Deployed Report',
    headerRow: 17,                       // SOP: data starts row 18
    fields: [
      { key:'name',  label:'Client name', col:'B', hints:['client','client name','account name','member','name'] },
      { key:'boxes', label:'Completed record count', col:'H', hints:[], pinned:true }
    ]
  },
  details: {
    label: 'Details',
    headerRow: 1,
    fields: [
      { key:'name',     label:'Client name', col:'L', hints:['client','client name','account name','member'] },
      { key:'clientId', label:'Client ID',   col:'K', hints:['client: contact id','contact id','client id'] },
      { key:'mailStop', label:'Mail Stop Date', col:'H', hints:['mail stop','stop date','mail stop date'] }
    ]
  },
  part2: {
    label: 'Deployed Monthly Part2',
    headerRow: 1,
    fields: [
      { key:'name',     label:'Client', col:'A', hints:['client name','client','account','member'] },
      { key:'status',   label:'Status', col:'F', hints:['status'] },
      { key:'reportBy', label:'Report by date', col:'G', hints:['report by date','report by','assigned report'] },
      { key:'addrFull', label:'Client Address (one column)', col:'', hints:['client address','mailing address','address'] },
      { key:'street',   label:'Street (if separate)', col:'J', hints:['street','address line 1','mailing street'] },
      { key:'street2',  label:'Address line 2', col:'', hints:['address line 2','line 2','suite','apt'] },
      { key:'city',     label:'City',  col:'K', hints:['city'] },
      { key:'state',    label:'State', col:'L', hints:['state','province'] },
      { key:'zip',      label:'Zip',   col:'M', hints:['zip','postal'] }
    ]
  },
  waitlist: {
    label: 'Currently Waitlisted Clients',
    headerRow: 1,
    fields: [
      { key:'name', label:'Client name', col:'K', hints:['client','client name','account name','member'] }
    ]
  }
};

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

// "CPR 1690, Box #12<br>APO, AE 09240"  ->  street / city / state / zip
function parseAddress(v){
  const out = { addr1:'', addr2:'', city:'', state:'', zip:'' };
  if (v == null) return out;
  const parts = String(v).replace(/<br\s*\/?>/gi, '\n').split(/\n|\r/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return out;
  const last = parts[parts.length - 1];
  const m = last.match(/^(.*?)[,\s]+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)\s*$/);
  if (m){
    out.city = m[1].replace(/,\s*$/,'').trim();
    out.state = m[2].toUpperCase();
    out.zip = m[3];
    parts.pop();
  }
  out.addr1 = (parts.shift() || '').replace(/,\s*$/,'').trim();
  out.addr2 = parts.join(', ').replace(/,\s*$/,'').trim();
  return out;
}

function save(){ try{ const m = {}; for (const k in state.files){ const f = state.files[k]; m[k] = { headerRow:f.headerRow, map:f.map }; } localStorage.setItem('nobox-map-v1', JSON.stringify(m)); }catch(e){} }
function loadSaved(key){ try{ const m = JSON.parse(localStorage.getItem('nobox-map-v1') || '{}'); return m[key] || null; }catch(e){ return null; } }

/* ---------- file intake ---------- */
function wireDrop(node){
  const key = node.dataset.key;
  node.addEventListener('click', e => { if (e.target.closest('.map')) return; pick(key); });
  node.addEventListener('dragover', e => { e.preventDefault(); node.classList.add('over'); });
  node.addEventListener('dragleave', () => node.classList.remove('over'));
  node.addEventListener('drop', e => {
    e.preventDefault(); node.classList.remove('over');
    const f = e.dataTransfer.files[0]; if (f) readFile(key, f);
  });
}
function pick(key){
  const inp = $('#filePicker');
  inp.value = '';
  inp.onchange = () => { if (inp.files[0]) readFile(key, inp.files[0]); };
  inp.click();
}
function readFile(key, file){
  const fr = new FileReader();
  fr.onload = e => {
    let wb;
    try { wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true }); }
    catch (err){ alert('Could not read that file. Export it again as .xlsx or .csv.\n\n' + err.message); return; }
    const spec = SPECS[key];
    const saved = loadSaved(key);
    state.files[key] = {
      fileName: file.name, wb,
      sheetName: wb.SheetNames[0],
      headerRow: (saved && saved.headerRow) || spec.headerRow,
      map: (saved && saved.map) || null,
      rows: null
    };
    parseSheet(key);
    if (!state.files[key].map) autoMap(key);
    drawMap(key);
    gate();
  };
  fr.readAsArrayBuffer(file);
}
function parseSheet(key){
  const f = state.files[key];
  const ws = f.wb.Sheets[f.sheetName];
  f.rows = XLSX.utils.sheet_to_json(ws, { header:1, blankrows:true, defval:null, raw:true });
}
function autoMap(key){
  const f = state.files[key], spec = SPECS[key];
  const heads = (f.rows[f.headerRow - 1] || []).map(h => String(h == null ? '' : h).toLowerCase().trim());
  const map = {};
  const clean = h => String(h || '').toLowerCase().replace(/[\u2191\u2193\u2192*:]/g,'').replace(/\s+/g,' ').trim();
  spec.fields.forEach(fld => {
    let hit = -1;
    if (!fld.pinned){
      const c = heads.map(clean);
      for (const test of [
        (h, hint) => h === hint,
        (h, hint) => h.startsWith(hint),
        (h, hint) => h.includes(hint)
      ]){
        for (const hint of fld.hints){
          hit = c.findIndex(h => h && test(h, hint));
          if (hit > -1) break;
        }
        if (hit > -1) break;
      }
    }
    if (hit < 0) hit = letterToIndex(fld.col);
    map[fld.key] = hit;
  });
  f.map = map;
}
function drawMap(key){
  const f = state.files[key], spec = SPECS[key];
  const node = document.querySelector('#drop-' + key);
  node.classList.add('filled');
  node.querySelector('.fname').textContent = f.fileName;
  const heads = f.rows[f.headerRow - 1] || [];
  const wide = Math.max(heads.length, ...f.rows.slice(0, 40).map(r => (r || []).length));
  const opts = [];
  for (let i = 0; i < wide; i++){
    const h = heads[i] == null ? '' : String(heads[i]).trim();
    opts.push(`<option value="${i}">${colLetter(i)}${h ? ' &nbsp;' + h.replace(/</g,'&lt;').slice(0,42) : ''}</option>`);
  }
  const box = node.querySelector('.map');
  box.className = 'map show';
  box.innerHTML =
    `<div class="map-row"><label>Sheet</label><select data-k="${key}" data-sheet>${f.wb.SheetNames.map(s => `<option ${s===f.sheetName?'selected':''}>${s}</option>`).join('')}</select></div>` +
    `<div class="map-row"><label>Header row</label><input type="number" min="1" value="${f.headerRow}" data-k="${key}" data-hr style="width:70px"><span class="hint" data-count></span></div>` +
    spec.fields.map(fld =>
      `<div class="map-row"><label>${fld.label}</label><select data-k="${key}" data-f="${fld.key}">
        <option value="-1">not in this file</option>${opts.join('')}</select></div>`
    ).join('');
  spec.fields.forEach(fld => {
    const s = box.querySelector(`[data-f="${fld.key}"]`);
    s.value = String(f.map[fld.key] != null ? f.map[fld.key] : -1);
    s.addEventListener('change', () => { f.map[fld.key] = +s.value; save(); preview(key); gate(); });
  });
  box.querySelector('[data-sheet]').addEventListener('change', e => { f.sheetName = e.target.value; parseSheet(key); autoMap(key); drawMap(key); gate(); });
  box.querySelector('[data-hr]').addEventListener('change', e => { f.headerRow = Math.max(1, +e.target.value || 1); autoMap(key); drawMap(key); gate(); });
  preview(key);
}
function preview(key){
  const f = state.files[key];
  const c = document.querySelector('#drop-' + key + ' [data-count]');
  if (!c) return;
  const named = memberRows(key);
  let txt = named.length + ' rows';
  if (key === 'deployed' && f.map.boxes > -1){
    const head = (f.rows[f.headerRow - 1] || [])[f.map.boxes];
    const no = named.filter(r => toNum(r[f.map.boxes]) === 0).length;
    txt += ' · ' + no + ' with no box (col ' + colLetter(f.map.boxes) + (head ? ' ' + String(head).trim() : '') + ')';
  }
  c.textContent = txt;
  c.style.color = named.length ? 'var(--ok)' : 'var(--red)';
}
function memberRows(key){
  const f = state.files[key];
  if (!f || !f.rows) return [];
  return f.rows.slice(f.headerRow).filter(r => {
    if (!r) return false;
    const n = r[f.map.name];
    if (n == null || String(n).trim() === '' || isTotalRow(n)) return false;
    if (key === 'deployed' && !hasNumber(r)) return false;   // drops report footers
    return true;
  });
}
function ok(key){
  const f = state.files[key];
  if (!f || !f.map) return false;
  return memberRows(key).length > 0;
}
function gate(){
  $('#btnBuild').disabled = !(ok('deployed') && ok('details'));
  $('#btnFinish').disabled = !(ok('part2') && ok('waitlist') && state.rows.length);
}

/* ---------- Stage 1: build the No Box list ---------- */
function build(){
  const d = state.files.deployed, dt = state.files.details;
  const mv = $('#monthPick').value.split('-');
  state.month = { y:+mv[0], m:+mv[1] - 1 };

  // Details lookups
  const idBy = {}, stopBy = {};
  memberRows('details').forEach(r => {
    const n = norm(r[dt.map.name]); if (!n) return;
    if (idBy[n] == null && dt.map.clientId > -1 && r[dt.map.clientId] != null) idBy[n] = String(r[dt.map.clientId]).trim();
    if (stopBy[n] == null && dt.map.mailStop > -1) { const s = toDate(r[dt.map.mailStop]); if (s) stopBy[n] = s; }
  });

  let total = 0, got = 0;
  const rows = [];
  memberRows('deployed').forEach(r => {
    const name = String(r[d.map.name]).trim();
    total++;
    if (toNum(r[d.map.boxes]) > 0){ got++; return; }
    const n = norm(name), sp = splitName(name);
    rows.push({
      name, key:n,
      clientId: idBy[n] || '',
      mailStop: stopBy[n] || null,
      first: sp.first, last: sp.last,
      serviceDelivery:'', reportBy:null,
      addr1:'', addr2:'', city:'', state:'', zip:'',
      status:'', flagPurple:false, flagRed:false, matched:true
    });
  });

  state.rows = rows;
  state.stage1 = { total, got, noBox: rows.length, missingId: rows.filter(r => !r.clientId).length };

  $('#stats1').innerHTML = statBlock([
    ['Members on report', total, ''],
    ['Got a box', got, 'o'],
    ['No box', rows.length, 'g'],
    ['Coverage', total ? Math.round(got / total * 100) + '%' : '0%', '']
  ]);

  makeBatches();
  $('#p2').classList.remove('locked');
  $('#p3').classList.remove('locked');
  $('#p1').classList.add('ready');
  $('#chip1').className = 'stage-chip done';
  $('#chip2').className = 'stage-chip on';
  $('#hint1').textContent = state.stage1.missingId
    ? state.stage1.missingId + ' of ' + rows.length + ' had no Client ID match in Details. Check the name and ID columns above.'
    : 'All ' + rows.length + ' no-box members matched a Client ID.';
  $('#hint1').style.color = state.stage1.missingId ? 'var(--red)' : 'var(--ok)';
  gate();
  $('#p2').scrollIntoView({ behavior:'smooth', block:'start' });
}
function statBlock(items){
  return items.map(([l, v, c]) => `<div class="stat ${c || ''}"><dt>${l}</dt><dd>${v}</dd></div>`).join('');
}
function makeBatches(){
  const size = Math.max(10, +$('#batchSize').value || 70);
  const ids = state.rows.map(r => r.clientId).filter(Boolean);
  state.batches = [];
  for (let i = 0; i < ids.length; i += size) state.batches.push(ids.slice(i, i + size));
  $('#batches').innerHTML = state.batches.map((b, i) =>
    `<div class="batch"><div class="batch-top"><div class="t">Batch ${i+1} of ${state.batches.length} &nbsp;·&nbsp; ${b.length} IDs</div>
      <button class="copy" data-b="${i}">Copy</button></div><pre>${b.join(', ')}</pre></div>`).join('');
  document.querySelectorAll('.copy[data-b]').forEach(btn => {
    btn.addEventListener('click', () => {
      copyText(state.batches[+btn.dataset.b].join(', '));
      btn.textContent = 'Copied'; btn.classList.add('done');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1500);
    });
  });
}
function copyText(t){
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(() => legacyCopy(t)); }
  else legacyCopy(t);
}
function legacyCopy(t){
  const ta = el('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch(e){}
  document.body.removeChild(ta);
}

/* ---------- Stage 3: fill, flag, finish ---------- */
function finish(){
  const p2 = state.files.part2, wl = state.files.waitlist;

  const byClient = {};
  memberRows('part2').forEach(r => {
    const n = norm(r[p2.map.name]); if (!n) return;
    (byClient[n] = byClient[n] || []).push(r);
  });

  const waitset = new Set();
  memberRows('waitlist').forEach(r => { const n = norm(r[wl.map.name]); if (n) waitset.add(n); });

  const g = (r, k) => (p2.map[k] > -1 ? r[p2.map[k]] : null);

  state.rows.forEach(row => {
    const hits = byClient[row.key] || [];
    row.matched = hits.length > 0;

    const assigned = hits.filter(r => String(g(r, 'status') || '').trim().toLowerCase() === 'assigned');
    row.serviceDelivery = assigned.length ? 'Yes' : '';

    let earliest = null;
    assigned.forEach(r => { const d = toDate(g(r, 'reportBy')); if (d && (!earliest || d < earliest)) earliest = d; });
    row.reportBy = earliest;

    const useFull = p2.map.addrFull > -1;
    const addr = hits.find(r => String((useFull ? g(r, 'addrFull') : g(r, 'street')) || '').trim() !== '');
    if (addr){
      if (useFull){
        const a = parseAddress(g(addr, 'addrFull'));
        row.addr1 = a.addr1; row.addr2 = a.addr2; row.city = a.city; row.state = a.state; row.zip = cleanZip(a.zip);
      } else {
        row.addr1 = String(g(addr, 'street') || '').trim();
        row.addr2 = String(g(addr, 'street2') || '').trim();
        row.city  = String(g(addr, 'city')  || '').trim();
        row.state = String(g(addr, 'state') || '').trim();
        row.zip   = cleanZip(g(addr, 'zip'));
      }
    }

    if (waitset.has(row.key)) row.status = STATUS.WAIT;
    else if (row.serviceDelivery === 'Yes' && inMonth(row.reportBy)) row.status = STATUS.ANGEL;
    else row.status = STATUS.SEND;

    row.flagPurple = !!row.city && !isMilCity(row.city);
    row.flagRed = inMonth(row.mailStop);
  });

  const c = s => state.rows.filter(r => r.status === s).length;
  const unsupported = state.rows.length, wait = c(STATUS.WAIT), angel = c(STATUS.ANGEL);
  $('#stats2').innerHTML = statBlock([
    ['True count of unsupported', unsupported, ''],
    ['Current waitlist count', wait, 'g'],
    ['Pending service delivery', angel, 'b'],
    ['Total boxes to send', unsupported - wait - angel, 'o']
  ]);

  const noAddr = state.rows.filter(r => r.status === STATUS.SEND && !r.addr1).length;
  const purple = state.rows.filter(r => r.flagPurple).length;
  const red = state.rows.filter(r => r.flagRed).length;
  const alerts = [];
  if (purple || red) alerts.push(`<div class="note warn"><div class="lbl">Stop and review</div><p>${red} row${red===1?'':'s'} flagged red for a Mail Stop Date in the reporting month, ${purple} flagged purple for a non-military mailing city. Clear these before anything ships.</p></div>`);
  if (noAddr) alerts.push(`<div class="note warn"><div class="lbl">Missing addresses</div><p>${noAddr} member${noAddr===1?'s':''} in the send-a-box list has no address from Part 2. Recheck that export before handing off to Logistics.</p></div>`);
  if (!purple && !red && !noAddr) alerts.push(`<div class="note"><div class="lbl">Clean run</div><p>No address or eligibility flags. Spot check a few rows, then hand off.</p></div>`);
  $('#alerts').innerHTML = alerts.join('');

  $('#p3').classList.add('ready');
  $('#p4').classList.remove('locked');
  $('#chip2').className = 'stage-chip done';
  $('#chip3').className = 'stage-chip done';
  $('#chip4').className = 'stage-chip on';
  const unmatched = state.rows.filter(r => !r.matched).length;
  $('#hint3').textContent = unmatched ? unmatched + ' member(s) had no matching row in Part 2. They will show with blank dates and addresses.' : '';
  $('#hint3').style.color = 'var(--red)';

  renderView();
  $('#p4').scrollIntoView({ behavior:'smooth', block:'start' });
}

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
  volunteer: [
    ['name','Client Name'],['clientId','Client ID'],['first','First Name'],['last','Last Name'],
    ['reportBy','Report by Date'],['serviceDelivery','Service Delivery'],['mailStop','Mail Stop Date']
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
    cols: COLS.logistics, rows: () => state.rows.filter(r => r.status === STATUS.SEND), filter:'review'
  },
  volunteer: {
    title:'Volunteer Services: reach out',
    desc:'These members have a service delivery this month and are waiting on an Angel to make contact. No box yet.',
    cols: COLS.volunteer, rows: () => state.rows.filter(r => r.status === STATUS.ANGEL)
  },
  waitlisted: {
    title:'Already waitlisted',
    desc:'On the Currently Waitlisted Clients report. No box, no outreach needed. Here for the record.',
    cols: COLS.volunteer, rows: () => state.rows.filter(r => r.status === STATUS.WAIT)
  },
  review: {
    title:'Needs review before anything ships',
    desc:'Red means the Mail Stop Date lands in the reporting month, so confirm eligibility. Purple means the mailing city is not APO, FPO, or DPO, so verify the address.',
    cols: COLS.logistics, rows: () => state.rows.filter(r => r.flagRed || r.flagPurple || (r.status === STATUS.SEND && !r.addr1))
  }
};
function cellVal(r, k){
  if (k === 'mailStop' || k === 'reportBy') return fmtDate(r[k]);
  if (k === 'review'){
    const t = [];
    if (r.flagRed) t.push('Confirm eligibility');
    if (r.flagPurple) t.push('Verify address');
    if (!r.addr1) t.push('No address');
    return t.join(' · ');
  }
  return r[k] == null ? '' : String(r[k]);
}
function activeRows(){
  const v = VIEWS[state.view];
  let rows = v.rows();
  if (v.filter === 'review' && state.hideUnreviewed) rows = rows.filter(r => !r.flagRed && !r.flagPurple && r.addr1);
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
function exportCsv(){
  const v = VIEWS[state.view], rows = activeRows();
  const esc = s => '"' + String(s == null ? '' : s).replace(/"/g,'""') + '"';
  const lines = [v.cols.map(c => esc(c[1])).join(',')];
  rows.forEach(r => lines.push(v.cols.map(c => esc(cellVal(r, c[0]))).join(',')));
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
  sheetFrom(ws, v.cols, activeRows(), { color: state.view === 'all' });
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

  sheetFrom(wb.addWorksheet('Logistics - Send Box'), COLS.logistics, state.rows.filter(r => r.status === STATUS.SEND), {});
  sheetFrom(wb.addWorksheet('Volunteer Svcs - Outreach'), COLS.volunteer, state.rows.filter(r => r.status === STATUS.ANGEL), {});
  sheetFrom(wb.addWorksheet('Waitlisted'), COLS.volunteer, state.rows.filter(r => r.status === STATUS.WAIT), {});

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `No Box - ${stamp()}.xlsx`);
}

/* ---------- wire up ---------- */
document.querySelectorAll('.drop').forEach(wireDrop);
$('#btnBuild').addEventListener('click', build);
$('#btnFinish').addEventListener('click', finish);
$('#btnRebatch').addEventListener('click', makeBatches);
$('#btnDlIds').addEventListener('click', () => {
  const lines = ['Client Name,Client ID'].concat(state.rows.map(r => `"${r.name}","${r.clientId}"`));
  download(new Blob([lines.join('\r\n')], { type:'text/csv' }), `no-box-client-ids-${stamp()}.csv`);
});
$('#btnCsv').addEventListener('click', exportCsv);
$('#btnXlsx').addEventListener('click', exportXlsx);
$('#btnWorkbook').addEventListener('click', exportWorkbook);
$('#btnDocs').addEventListener('click', () => window.open('sop.html', '_blank'));
$('#btnReset').addEventListener('click', () => { if (confirm('Clear the loaded files and start over?')) location.reload(); });
document.querySelectorAll('.view-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.view-tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); state.view = t.dataset.view; renderView();
}));
(function initMonth(){
  const d = new Date();
  $('#monthPick').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();
