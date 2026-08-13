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
      { key:'clientId', label:'Client ID (if present)', col:'', hints:['client: contact id','contact id','client id'] },
      { key:'status',   label:'Status', col:'F', hints:['status'] },
      { key:'reportBy', label:'Report by date', col:'G', hints:['report by date','report by','assigned report'] },
      { key:'provider',  label:'Provider', col:'', hints:['provider name','provider','angel','assigned to','volunteer name','service provider','owner'] },
      { key:'providerEmail', label:'Provider email', col:'', hints:['provider email','provider: email','angel email','volunteer email','assigned to email','email'] },
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
  $('#btnFinish').disabled = !(ok('part2') && state.rows.length);
  const fin = $('#btnFinish');
  if (fin) fin.textContent = ok('waitlist') ? 'Fill, flag, and finish' : 'Fill, flag, and finish without a waitlist';
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
      provider:'', providerEmail:'',
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
const BATCH_MAX = 70;      // Salesforce will not take more IDs than this in one filter
const BATCH_TARGET = 7;

function makeBatches(){
  const ids = state.rows.map(r => r.clientId).filter(Boolean);
  const typed = +$('#batchSize').value || BATCH_MAX;

  /* Two hard edges. Salesforce will not take more than 70 IDs in one filter,
     and we never want more than 7 bundles. That fixes the size to a range:
     no smaller than what 7 bundles requires, no larger than 70. */
  const minSize = Math.max(1, Math.ceil(ids.length / BATCH_TARGET));
  const impossible = minSize > BATCH_MAX;   // too many members for 7 bundles of 70

  let size = typed, why = '';
  if (impossible){
    size = BATCH_MAX;
    why = 'over';
  } else if (typed > BATCH_MAX){
    size = BATCH_MAX; why = 'capped';
  } else if (typed < minSize){
    size = minSize; why = 'raised';
  }
  if (size !== typed) $('#batchSize').value = size;
  $('#batchSize').min = impossible ? BATCH_MAX : minSize;
  $('#batchSize').max = BATCH_MAX;

  state.batches = [];
  for (let i = 0; i < ids.length; i += size) state.batches.push(ids.slice(i, i + size));

  $('#batches').innerHTML = state.batches.map((b, i) =>
    `<div class="batch"><div class="batch-top"><div class="t">Bundle ${i+1} of ${state.batches.length} &nbsp;·&nbsp; ${b.length} IDs</div>
      <button class="copy" data-b="${i}">Copy</button></div><pre>${b.join(', ')}</pre></div>`).join('');

  const n = state.batches.length, tag = $('#batchCount');
  if (tag){
    let msg, colour;
    if (impossible){
      msg = ids.length + ' members cannot fit into 7 bundles at ' + BATCH_MAX + ' each. ' +
            'That is ' + n + ' bundles. Stop and reach out to the Director of Virtual Services or the Salesforce Administrator.';
      colour = 'var(--red)';
    } else if (why === 'capped'){
      msg = 'Salesforce caps a filter at ' + BATCH_MAX + ' IDs, so the size was pulled back to ' + BATCH_MAX + '. ' + n + ' bundles.';
      colour = 'var(--red)';
    } else if (why === 'raised'){
      msg = 'Raised to ' + size + '. Anything smaller makes more than 7 bundles. ' + n + ' bundles.';
      colour = 'var(--red)';
    } else {
      msg = n + ' bundle' + (n === 1 ? '' : 's') + ' of up to ' + size + '. Anywhere from ' + minSize + ' to ' + BATCH_MAX + ' works.';
      colour = 'var(--ok)';
    }
    tag.textContent = msg;
    tag.style.color = colour;
  }

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
  const p2 = state.files.part2, wl = state.files.waitlist || { map:{}, rows:[], headerRow:1 };

  const byClient = {}, byId = {};
  memberRows('part2').forEach(r => {
    const n = norm(r[p2.map.name]);
    if (n) (byClient[n] = byClient[n] || []).push(r);
    if (p2.map.clientId > -1){
      const id = String(r[p2.map.clientId] == null ? '' : r[p2.map.clientId]).trim();
      if (id) (byId[id] = byId[id] || []).push(r);
    }
  });

  const waitset = new Set();
  const haveWaitlist = ok('waitlist');
  if (haveWaitlist) memberRows('waitlist').forEach(r => { const n = norm(r[wl.map.name]); if (n) waitset.add(n); });
  state.hadWaitlist = haveWaitlist;

  const g = (r, k) => (p2.map[k] > -1 ? r[p2.map[k]] : null);

  state.rows.forEach(row => {
    /* Match on Client ID when Part 2 carries one, since names drift and IDs do
       not. Fall back to the name. */
    const hits = (row.clientId && byId[row.clientId]) || byClient[row.key] || [];
    row.matched = hits.length > 0;
    row.matchedBy = hits.length ? ((row.clientId && byId[row.clientId]) ? 'id' : 'name') : '';

    const assigned = hits.filter(r => String(g(r, 'status') || '').trim().toLowerCase() === 'assigned');
    row.serviceDelivery = assigned.length ? 'Yes' : '';

    /* Earliest assigned date drives the outreach order, and the provider on
       that same row is the person Volunteer Services needs to reach. */
    let earliest = null, earliestRow = null;
    assigned.forEach(r => {
      const d = toDate(g(r, 'reportBy'));
      if (d && (!earliest || d < earliest)){ earliest = d; earliestRow = r; }
    });
    row.reportBy = earliest;

    const provRow = earliestRow || assigned.find(r => String(g(r, 'provider') || '').trim() !== '') || hits[0];
    if (provRow){
      row.provider = String(g(provRow, 'provider') || '').trim();
      row.providerEmail = String(g(provRow, 'providerEmail') || '').trim();
    }
    if (!row.provider){
      const any = hits.find(r => String(g(r, 'provider') || '').trim() !== '');
      if (any){ row.provider = String(g(any, 'provider') || '').trim(); row.providerEmail = String(g(any, 'providerEmail') || '').trim(); }
    }

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

  const size = Math.max(10, +$('#batchSize').value || 70);
  const ids = state.rows.map(r => r.clientId).filter(Boolean);
  state.missing = state.rows.filter(r => !r.matched).map(r => {
    const pos = ids.indexOf(r.clientId);
    return { name:r.name, clientId:r.clientId, batch: pos > -1 ? Math.floor(pos / size) + 1 : null };
  });

  state.editable = true;
  paintSummary();

  $('#p3').classList.add('ready');
  $('#p4').classList.remove('locked');
  $('#chip3').className = 'stage-chip done';
  $('#chip4').className = 'stage-chip on';
  const unmatched = state.rows.filter(r => !r.matched).length;
  const angels = state.rows.filter(r => effStatus(r) === STATUS.ANGEL);
  const noProv = angels.filter(r => !r.provider).length;
  const bits = [];
  if (!state.hadWaitlist) bits.push('No waitlist file was loaded, so nobody is marked Waitlisted this month.');
  if (unmatched) bits.push(unmatched + ' member(s) had no matching row in Part 2, so their dates and addresses are blank.');
  if (angels.length && noProv === angels.length) bits.push('No provider names came through. Check the Provider and Provider email dropdowns on the Part 2 file above.');
  else if (noProv) bits.push(noProv + ' of ' + angels.length + ' outreach rows have no provider listed.');
  $('#hint3').textContent = bits.join(' ');
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
  const cfg = window.NOBOX_CONFIG || {};
  if (!updatedBy()){ out.innerHTML = '<div class="note warn"><div class="lbl">Pick who ran this</div><p>Choose a name under <strong>Updated by</strong> before publishing. It shows on the staff site.</p></div>'; return; }
  const pw = keyFor($('#pubPw').value);
  if (siteLocked()){
    if (!$('#pubPw').value){ out.innerHTML = '<div class="note warn"><div class="lbl">Password needed</div><p>Type the team password. It is the key, so staff cannot open the file without it.</p></div>'; return; }
    if (window.noboxHash && window.noboxHash($('#pubPw').value) !== cfg.passwordHash){
      out.innerHTML = '<div class="note warn"><div class="lbl">That is not the team password</div><p>It does not match config.js, so staff would not be able to open this file.</p></div>';
      return;
    }
  }
  out.innerHTML = '<p class="hint">Encrypting ' + state.rows.length + ' rows...</p>';
  const label = new Date(state.month.y, state.month.m, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
  const payload = {
    month: label,
    monthKey: state.month.y + '-' + String(state.month.m + 1).padStart(2, '0'),
    generated: new Date().toISOString(),
    updatedBy: updatedBy(),
    stats: state.stage1 ? {
      total: state.stage1.total,
      got: state.stage1.got,
      noBox: state.stage1.noBox,
      coverage: state.stage1.total ? Math.round(state.stage1.got / state.stage1.total * 100) : 0
    } : null,
    counts: {
      unsupported: state.rows.length,
      waitlisted: state.rows.filter(r => r.status === STATUS.WAIT).length,
      angel: state.rows.filter(r => r.status === STATUS.ANGEL).length
    },
    rows: state.rows
  };
  try {
    const text = await encryptPayload(pw, payload);
    rememberWho();
    download(new Blob([text], { type:'application/json' }), 'latest.enc');
    out.innerHTML = '<div class="note"><div class="lbl">Encrypted and downloaded</div>' +
      '<p><strong>latest.enc</strong> is in your downloads, ' + Math.round(text.length / 1024) + ' KB, covering ' + label + '.</p>' +
      '<p>Upload it to the <code>data</code> folder in GitHub, replacing the old one. Render redeploys on its own and staff see the new month next time they open the page.</p>' +
      '<p class="hint" style="margin:8px 0 0">Mischief managed.</p></div>';
  } catch(e){
    out.innerHTML = '<div class="note warn"><div class="lbl">Encryption failed</div><p>' + String(e.message || e) + '</p></div>';
  }
}

/* ---------- summary, recomputed whenever a decision changes ---------- */
function paintSummary(){
  const c = s => state.rows.filter(r => effStatus(r) === s).length;
  const total = state.rows.length, wait = c(STATUS.WAIT), angel = c(STATUS.ANGEL);
  $('#stats2').innerHTML = statBlock([
    ['True count of unsupported', total, ''],
    ['Current waitlist count', wait, 'g'],
    ['Pending service delivery', angel, 'b'],
    ['Total boxes to send', state.rows.filter(shippable).length, 'o']
  ]);

  const held = state.rows.filter(needsDecision).length;
  const decided = state.rows.filter(isSettled).length;
  const purple = state.rows.filter(r => r.flagPurple && !r.override).length;
  const red = state.rows.filter(r => r.flagRed && !r.override).length;
  const zipf = state.rows.filter(r => r.zipFixed).length;

  const bits = [];

  /* Every no-box member should come back in Part 2. One that does not usually
     means a batch was skipped or its export was cut short, so name the batch. */
  const miss = state.missing || [];
  if (miss.length){
    const byBatch = {};
    miss.forEach(m => { const k = m.batch || '?'; byBatch[k] = (byBatch[k] || 0) + 1; });
    const lines = Object.keys(byBatch).sort((x, y) => x - y)
      .map(k => (k === '?' ? 'no batch' : 'batch ' + k) + ': ' + byBatch[k]);
    const whole = Object.keys(byBatch).filter(k => byBatch[k] >= Math.min(state.batches.length ? state.batches[0].length : 70, 60));
    bits.push('<div class="note warn"><div class="lbl">' + miss.length + ' of ' + state.rows.length +
      ' did not come back in Part 2</div>' +
      '<p>These members have no service delivery rows, so they have no address, no date, and no provider. ' +
      'They are held out of every handoff list and sit on the Needs review tab marked <strong>Missing from Part 2</strong>.</p>' +
      '<p>Spread across ' + lines.join(', ') + '.' +
      (whole.length ? ' A whole batch missing usually means that filter was never run, or the export was cut short.' : '') +
      '</p><p><button class="btn sm out" id="btnMissing">Copy the ' + miss.length + ' missing Client IDs</button></p></div>');
  }

  if (held) bits.push(`<div class="note warn"><div class="lbl">${held} still waiting on a decision</div><p>` +
    (red ? red + ' flagged red for a Mail Stop Date in the reporting month. ' : '') +
    (purple ? purple + ' flagged purple for a non-military mailing city. ' : '') +
    (zipf ? zipf + ' had a letter O corrected to a zero in the zip, worth a glance. ' : '') +
    `Work them on the Needs review tab. Fix the address or pick a decision, and each one drops off the tab as you go.</p></div>`);
  else bits.push('<div class="note"><div class="lbl">Needs review is clear</div><p>Every flagged row has been fixed or decided. Nothing is waiting on you.</p></div>');
  if (decided) bits.push(`<div class="note"><div class="lbl">${decided} row${decided === 1 ? '' : 's'} settled by hand</div><p>Fixes and decisions travel with the published file, so staff can see a person made the call. They are on the Decisions tab if you want to change one.</p></div>`);
  $('#alerts').innerHTML = bits.join('');

  const mb = $('#btnMissing');
  if (mb) mb.addEventListener('click', () => {
    copyText((state.missing || []).map(m => m.clientId).filter(Boolean).join(', '));
    mb.textContent = 'Copied, re-run those in Part 2';
    setTimeout(() => { mb.textContent = 'Copy the ' + (state.missing || []).length + ' missing Client IDs'; }, 2500);
  });
}
window.onOverrideChange = paintSummary;

/* ---------- publish straight to the live site ---------- */
const WHO_KEY = 'nobox-updated-by';
function updatedBy(){ return ($('#updatedBy') && $('#updatedBy').value || '').trim(); }
function rememberWho(){ try{ localStorage.setItem(WHO_KEY, updatedBy()); }catch(e){} }
function restoreWho(){
  try{
    const v = localStorage.getItem(WHO_KEY);
    if (v && $('#updatedBy')) $('#updatedBy').value = v;
  }catch(e){}
}

const GH = {
  key: 'nobox-gh-token',
  cfg(){
    const g = (window.NOBOX_CONFIG || {}).github || {};
    return {
      owner: ($('#ghOwner').value || g.owner || '').trim(),
      repo:  ($('#ghRepo').value  || g.repo  || '').trim(),
      branch: (g.branch || 'main'),
      path:  (g.path || 'data/latest.enc')
    };
  },
  token(){ return $('#ghToken').value.trim(); },
  remember(t){ try{ $('#ghSave').checked ? localStorage.setItem(GH.key, t) : localStorage.removeItem(GH.key); }catch(e){} },
  restore(){
    try{
      const t = localStorage.getItem(GH.key);
      if (t){ $('#ghToken').value = t; $('#ghSave').checked = true; }
    }catch(e){}
    const g = (window.NOBOX_CONFIG || {}).github || {};
    if (g.owner) $('#ghOwner').value = g.owner;
    if (g.repo)  $('#ghRepo').value = g.repo;
  },
  async call(url, opts){
    const bust = (opts && opts.method === 'PUT') ? url
      : url + (url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(bust, Object.assign({ cache:'no-store' }, opts, {
      /* Only headers GitHub lists in access-control-allow-headers may be set
         here. Anything else fails the CORS preflight and surfaces as a bare
         "Failed to fetch" with no status. cache:'no-store' plus the query
         cache-buster above do the same job without a custom header. */
      headers: Object.assign({
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Authorization': 'Bearer ' + GH.token()
      }, (opts || {}).headers || {})
    }));
    return res;
  },
  /* Always read the sha immediately before writing, uncached. */
  async currentSha(g){
    const res = await GH.call('https://api.github.com/repos/' + g.owner + '/' + g.repo +
      '/contents/' + g.path + '?ref=' + encodeURIComponent(g.branch));
    if (res.status === 200) return (await res.json()).sha;
    if (res.status === 404) return null;
    throw new Error('status ' + res.status);
  }
};

/* A plain, unencrypted record of each month's coverage. Counts only, no member
   data, so staff can open the history without a key. The newest publish for a
   month wins, which means the run on the 1st becomes that month's final word. */
async function updateHistory(g, payload){
  const dir = g.path.indexOf('/') > -1 ? g.path.slice(0, g.path.lastIndexOf('/')) : 'data';
  const url = 'https://api.github.com/repos/' + g.owner + '/' + g.repo + '/contents/' + dir + '/history.json';

  let history = [], sha = null;
  const cur = await GH.call(url + '?ref=' + encodeURIComponent(g.branch));
  if (cur.status === 200){
    const meta = await cur.json();
    sha = meta.sha;
    try { history = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))); } catch(e){ history = []; }
    if (!Array.isArray(history)) history = [];
  }

  const entry = {
    monthKey: payload.monthKey,
    month: payload.month,
    published: payload.generated,
    updatedBy: payload.updatedBy || '',
    total: payload.stats ? payload.stats.total : null,
    got: payload.stats ? payload.stats.got : null,
    noBox: payload.stats ? payload.stats.noBox : null,
    coverage: payload.stats ? payload.stats.coverage : null
  };
  history = history.filter(h => h.monthKey !== entry.monthKey);
  history.push(entry);
  history.sort((x, y) => String(x.monthKey).localeCompare(String(y.monthKey)));

  const body = {
    message: 'Record ' + payload.month + ' coverage',
    content: b64.enc(new TextEncoder().encode(JSON.stringify(history, null, 2))),
    branch: g.branch
  };
  if (sha) body.sha = sha;
  const put = await GH.call(url, { method:'PUT', body: JSON.stringify(body) });
  return put.ok ? history.length : 0;
}

/* Anything ending .enc in the data folder that is not the live file is left
   over from a manual upload. Remove it so nobody opens the wrong month. */
async function sweepOldFiles(g){
  const dir = g.path.indexOf('/') > -1 ? g.path.slice(0, g.path.lastIndexOf('/')) : '';
  if (!dir) return [];
  const live = g.path.slice(g.path.lastIndexOf('/') + 1);
  const res = await GH.call('https://api.github.com/repos/' + g.owner + '/' + g.repo +
    '/contents/' + dir + '?ref=' + encodeURIComponent(g.branch));
  if (res.status !== 200) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];

  const strays = items.filter(f => f.type === 'file' && f.name !== live && /\.enc$/i.test(f.name));
  const gone = [];
  for (const f of strays){
    const del = await GH.call('https://api.github.com/repos/' + g.owner + '/' + g.repo +
      '/contents/' + dir + '/' + encodeURIComponent(f.name), {
        method:'DELETE',
        body: JSON.stringify({ message:'Remove stray published file ' + f.name, sha:f.sha, branch:g.branch })
      });
    if (del.ok) gone.push(f.name);
  }
  return gone;
}

async function publishLive(){
  const out = $('#pubOut');
  const note = (k, t, b) => { out.innerHTML = '<div class="note' + (k ? ' ' + k : '') + '"><div class="lbl">' + t + '</div><p>' + b + '</p></div>'; };

  if (!state.rows.length) return note('warn', 'Nothing to publish', 'Finish stage 3 first.');
  if (!cryptoReady()) return note('warn', 'Open the live site', 'Encryption needs a secure page. Use the https address, not a file on your hard drive.');

  const cfg = window.NOBOX_CONFIG || {};
  if (!updatedBy()) return note('warn', 'Pick who ran this', 'Choose a name under <strong>Updated by</strong> before publishing. It shows on the staff site.');
  const pw = keyFor($('#pubPw').value);
  if (siteLocked()){
    if (!$('#pubPw').value) return note('warn', 'Password needed', 'Type the team password. It is the encryption key.');
    if (window.noboxHash && window.noboxHash($('#pubPw').value) !== cfg.passwordHash)
      return note('warn', 'That is not the team password', 'It does not match config.js, so staff could not open the file.');
  }

  const g = GH.cfg();
  if (!g.owner || !g.repo) return note('warn', 'Repo needed', 'Fill in the GitHub owner and repository name.');
  if (!GH.token()) return note('warn', 'Token needed', 'Paste a GitHub token with Contents write access to this repo. Instructions are below.');

  out.innerHTML = '<p class="hint">Encrypting ' + state.rows.length + ' rows...</p>';
  const label = new Date(state.month.y, state.month.m, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
  const payload = {
    month: label,
    monthKey: state.month.y + '-' + String(state.month.m + 1).padStart(2, '0'),
    generated: new Date().toISOString(),
    updatedBy: updatedBy(),
    stats: state.stage1 ? {
      total: state.stage1.total,
      got: state.stage1.got,
      noBox: state.stage1.noBox,
      coverage: state.stage1.total ? Math.round(state.stage1.got / state.stage1.total * 100) : 0
    } : null,
    counts: {
      unsupported: state.rows.length,
      waitlisted: state.rows.filter(r => r.status === STATUS.WAIT).length,
      angel: state.rows.filter(r => r.status === STATUS.ANGEL).length
    },
    rows: state.rows
  };

  let text;
  try { text = await encryptPayload(pw, payload); }
  catch(e){ return note('warn', 'Encryption failed', String(e.message || e)); }

  const api = 'https://api.github.com/repos/' + g.owner + '/' + g.repo + '/contents/' + g.path;
  const content = b64.enc(new TextEncoder().encode(text));

  out.innerHTML = '<p class="hint">Uploading to GitHub...</p>';
  try {
    let sha = null;
    const cur = await GH.call(api + '?ref=' + encodeURIComponent(g.branch));
    if (cur.status === 200){ sha = (await cur.json()).sha; }
    else if (cur.status === 401) return note('warn', 'Token rejected', 'GitHub did not accept that token. Check it was copied whole and has not expired.');
    else if (cur.status === 403) return note('warn', 'Token lacks permission', 'The token needs Contents set to Read and write on this repository.');
    else if (cur.status !== 404) return note('warn', 'GitHub said no', 'Status ' + cur.status + '. Check the owner and repository names.');

    const body = {
      message: 'Publish No Box list for ' + label,
      content: content,
      branch: g.branch
    };

    /* A 409 means the file moved under us between reading the sha and writing.
       Re-read and try again rather than making it the user's problem. */
    let put = null;
    for (let attempt = 0; attempt < 4; attempt++){
      if (sha) body.sha = sha; else delete body.sha;
      put = await GH.call(api, { method:'PUT', body: JSON.stringify(body) });
      if (put.status !== 409) break;
      out.innerHTML = '<p class="hint">The file changed on GitHub, syncing and retrying...</p>';
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
      try { sha = await GH.currentSha(g); } catch(e){ break; }
    }

    if (put.status === 409)
      return note('warn', 'Could not sync with GitHub',
        'The file kept changing while publishing. Wait a few seconds and click publish again. ' +
        'If it keeps happening, use the manual fallback below, which never conflicts.');

    if (!put.ok){
      const e = await put.json().catch(() => ({}));
      return note('warn', 'Upload failed', 'Status ' + put.status + '. ' + (e.message || 'Check the repo name, branch, and token permissions.'));
    }

    GH.remember(GH.token());
    rememberWho();
    const res = await put.json();
    const url = res.commit && res.commit.html_url;

    /* The publish overwrites data/latest.enc in place, so there is never a
       second copy of the current list. This only sweeps up strays, such as a
       file uploaded by hand under another name during the manual fallback. */
    let swept = [], months = 0;
    try { swept = await sweepOldFiles(g); } catch(e){}
    try { months = await updateHistory(g, payload); } catch(e){}

    out.innerHTML = '<div class="note"><div class="lbl">Published</div>' +
      '<p>' + label + ' is live, ' + state.rows.length + ' members, ' + Math.round(text.length / 1024) + ' KB encrypted.' +
      (url ? ' <a href="' + url + '" target="_blank" rel="noopener">See the commit</a>.' : '') + '</p>' +
      '<p>It replaced last month\'s file at the same path, so there is only ever one list.' +
      (swept.length ? ' Also cleared ' + swept.length + ' stray file' + (swept.length === 1 ? '' : 's') +
        ' left in the data folder: ' + swept.join(', ') + '.' : '') + '</p>' +
      (months ? '<p>Coverage recorded. The history now holds ' + months + ' month' + (months === 1 ? '' : 's') + '.</p>' : '') +
      '<p>Render is rebuilding now. Give it about a minute, then the staff site will show this month.</p>' +
      '<div class="rowline" style="margin-top:14px">' +
        '<button class="btn gold" id="btnStaffSite">Open the staff site</button>' +
        '<span class="hint">Give Render a minute first, then sign in as staff would.</span>' +
      '</div>' +
      '<p class="hint" style="margin:14px 0 0">Mischief managed.</p></div>';

    const ss = $('#btnStaffSite');
    if (ss) ss.addEventListener('click', () => window.open('index.html', '_blank'));
  } catch(e){
    note('warn', 'Could not reach GitHub', String(e.message || e) + '. Check your connection, then try the manual download below.');
  }
}

/* ---------- connection check ----------
   GitHub answers 404 for "repo does not exist" AND for "your token cannot
   see this repo", which makes a bad token look like a bad name. This pulls
   the two apart and says which one it is. */
async function checkConnection(){
  const out = $('#pubOut');
  const note = (k, t, b) => { out.innerHTML = '<div class="note' + (k ? ' ' + k : '') + '"><div class="lbl">' + t + '</div><p>' + b + '</p></div>'; };
  const g = GH.cfg();

  if (!g.owner || !g.repo) return note('warn', 'Fill in the repo', 'Owner and repository are both needed.');
  if (!GH.token()) return note('warn', 'Token needed', 'Paste your GitHub access token first.');

  out.innerHTML = '<p class="hint">Checking...</p>';
  try {
    const repo = await GH.call('https://api.github.com/repos/' + g.owner + '/' + g.repo);
    if (repo.status === 401)
      return note('warn', 'The token is not valid', 'GitHub rejected it outright. It was probably truncated when pasted, or it has expired. Generate a new one.');
    if (repo.status === 404)
      return note('warn', 'Cannot see that repository',
        'Either <strong>' + g.owner + '/' + g.repo + '</strong> does not exist, or your token was not given access to it. ' +
        'Check the spelling first. If it is right, edit the token in GitHub: under Repository access it must list this repo, ' +
        'and under Permissions it needs <strong>Contents: Read and write</strong>. A token without Contents access returns this same 404.');
    if (!repo.ok) return note('warn', 'GitHub said no', 'Status ' + repo.status + ' looking up the repository.');

    const info = await repo.json();
    const perms = (info.permissions || {});
    let line = 'Found <strong>' + info.full_name + '</strong>' + (info.private ? ', private' : ', public') + '.';

    // can we actually write? probe the data path
    const probe = await GH.call('https://api.github.com/repos/' + g.owner + '/' + g.repo +
      '/contents/' + g.path + '?ref=' + encodeURIComponent(g.branch));
    if (probe.status === 200) line += ' A published file is already there and can be replaced.';
    else if (probe.status === 404) line += ' Nothing published yet, so the first publish will create ' + g.path + '.';
    else if (probe.status === 403) return note('warn', 'Token cannot write here',
      'The repo is visible but the token lacks write access. Set <strong>Contents</strong> to <strong>Read and write</strong> on the token.');

    if (perms.push === false) return note('warn', 'Read only',
      'The token can see the repo but cannot write to it. Set Contents to Read and write.');

    GH.remember(GH.token());
    note('', 'Connection is good', line + ' Publish to the live site will work.');
  } catch(e){
    note('warn', 'Could not reach GitHub',
      String(e.message || e) + '. The request never left the browser. Check that you are online.');
  }
}

/* ---------- open mode banner ---------- */
function openModeBanner(){
  if (siteLocked()) return;
  const box = document.createElement('div');
  box.className = 'note warn';
  box.style.marginBottom = '18px';
  box.innerHTML = '<div class="lbl">No password set</div>' +
    '<p>Anyone with the link can open the published list, and the password box below is ignored. ' +
    'Fine while you are testing. Set a password in <a href="set-password.html">set-password.html</a> ' +
    'and republish before staff or real member data go anywhere near this.</p>';
  const p1 = document.getElementById('p1');
  p1.parentNode.insertBefore(box, p1);
  const pw = document.getElementById('pubPw');
  if (pw){ pw.disabled = true; pw.placeholder = 'Not needed while no password is set'; }
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
$('#btnBack').addEventListener('click', () => { location.href = 'index.html'; });
$('#btnPublish').addEventListener('click', publish);
$('#btnPublishLive').addEventListener('click', publishLive);
$('#btnCheck').addEventListener('click', checkConnection);

/* A dialog we control, rather than the browser's, which cannot be styled and
   leads with the domain name. */
function askConfirm(opts){
  return new Promise(resolve => {
    const back = el('div', 'modal-back');
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3 class="mt"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
        '<path d="M14.2 2 5.6 13.4h5.1L9.4 22l8.9-11.7h-5.3z" fill="currentColor"/></svg>' +
        opts.title + '</h3>' +
        opts.body +
        '<div class="mact">' +
          '<button class="btn" id="mYes">' + opts.yes + '</button>' +
          '<button class="btn out" id="mNo">' + opts.no + '</button>' +
        '</div></div>';
    document.body.appendChild(back);
    const done = v => { back.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = e => { if (e.key === 'Escape') done(false); };
    back.querySelector('#mYes').addEventListener('click', () => done(true));
    back.querySelector('#mNo').addEventListener('click', () => done(false));
    back.addEventListener('click', e => { if (e.target === back) done(false); });
    document.addEventListener('keydown', esc);
    back.querySelector('#mNo').focus();
  });
}

/* One stage at a time. The next panel does not exist until this one is done,
   so there is no scrolling past a step by accident. */
function openStage(id, chipDone, chipNext){
  $(id).classList.remove('locked');
  if (chipDone) $(chipDone).className = 'stage-chip done';
  if (chipNext) $(chipNext).className = 'stage-chip on';
  setTimeout(() => $(id).scrollIntoView({ behavior:'smooth', block:'start' }), 60);
}
$('#btnToStage3').addEventListener('click', () => {
  $('#p2').classList.add('ready');
  openStage('#p3', '#chip2', '#chip3');
});
$('#btnToPublish').addEventListener('click', async () => {
  const open_ = state.rows.filter(needsDecision).length;
  if (open_){
    const okay = await askConfirm({
      title: open_ === 1 ? 'You left a sock on the floor' : 'You left ' + open_ + ' socks on the floor',
      body: '<p><strong>' + open_ + ' member' + (open_ === 1 ? '' : 's') + '</strong> on the Needs review tab ' +
            (open_ === 1 ? 'has' : 'have') + ' no decision yet, so ' + (open_ === 1 ? 'it stays' : 'they stay') +
            ' off the Logistics list and no box goes out.</p>' +
            '<p>Fix the address, or pick a decision on each one. Holding on purpose counts as a decision.</p>',
      yes: 'Publish anyway',
      no: 'Go back and finish'
    });
    if (!okay) return;
  }
  openStage('#p5', '#chip4', null);
});
GH.restore();
restoreWho();
openModeBanner();
$('#btnReset').addEventListener('click', () => { if (confirm('Clear the loaded files and start over?')) location.reload(); });
document.querySelectorAll('.view-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.view-tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); state.view = t.dataset.view; renderView();
}));
(function initMonth(){
  const d = new Date();
  $('#monthPick').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();
