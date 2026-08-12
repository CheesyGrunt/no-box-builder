/* ============================================================
   Builder. Loaded by build.html only.
   Needs core.js first.
   ============================================================ */

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
  $('#p5').classList.remove('locked');
  $('#chip2').className = 'stage-chip done';
  $('#chip3').className = 'stage-chip done';
  $('#chip4').className = 'stage-chip on';
  const unmatched = state.rows.filter(r => !r.matched).length;
  $('#hint3').textContent = unmatched ? unmatched + ' member(s) had no matching row in Part 2. They will show with blank dates and addresses.' : '';
  $('#hint3').style.color = 'var(--red)';

  renderView();
  $('#p4').scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ---------- publish for staff ---------- */
async function publish(){
  const out = $('#pubOut');
  if (!state.rows.length){ out.innerHTML = '<div class="note warn"><div class="lbl">Nothing to publish</div><p>Finish stage 3 first.</p></div>'; return; }
  if (!cryptoReady()){
    out.innerHTML = '<div class="note warn"><div class="lbl">Not available here</div><p>Encryption needs a secure page. Open the tool at its https address (or http://localhost) and publish from there. Opening the file straight off your hard drive will not work for this step.</p></div>';
    return;
  }
  const pw = $('#pubPw').value;
  if (!pw){ out.innerHTML = '<div class="note warn"><div class="lbl">Password needed</div><p>Type the team password. It is the key, so staff cannot open the file without it.</p></div>'; return; }
  const cfg = window.NOBOX_CONFIG || {};
  if (cfg.passwordHash && window.noboxHash && window.noboxHash(pw) !== cfg.passwordHash){
    out.innerHTML = '<div class="note warn"><div class="lbl">That is not the team password</div><p>It does not match the one set in config.js, so staff would not be able to open this file. Use the team password, or reset it in set-password.html first.</p></div>';
    return;
  }
  out.innerHTML = '<p class="hint">Encrypting ' + state.rows.length + ' rows...</p>';
  const label = new Date(state.month.y, state.month.m, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
  const payload = {
    month: label,
    monthKey: state.month.y + '-' + String(state.month.m + 1).padStart(2, '0'),
    generated: new Date().toISOString(),
    counts: {
      unsupported: state.rows.length,
      waitlisted: state.rows.filter(r => r.status === STATUS.WAIT).length,
      angel: state.rows.filter(r => r.status === STATUS.ANGEL).length
    },
    rows: state.rows
  };
  try {
    const text = await encryptPayload(pw, payload);
    download(new Blob([text], { type:'application/json' }), 'latest.enc');
    out.innerHTML = '<div class="note"><div class="lbl">Encrypted and downloaded</div>' +
      '<p><strong>latest.enc</strong> is in your downloads, ' + Math.round(text.length / 1024) + ' KB, covering ' + label + '.</p>' +
      '<p>Upload it to the <code>data</code> folder in GitHub, replacing the old one. Render redeploys on its own and staff see the new month next time they open the page.</p></div>';
  } catch(e){
    out.innerHTML = '<div class="note warn"><div class="lbl">Encryption failed</div><p>' + String(e.message || e) + '</p></div>';
  }
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
$('#btnPublish').addEventListener('click', publish);
$('#btnReset').addEventListener('click', () => { if (confirm('Clear the loaded files and start over?')) location.reload(); });
document.querySelectorAll('.view-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.view-tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); state.view = t.dataset.view; renderView();
}));
(function initMonth(){
  const d = new Date();
  $('#monthPick').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();
