/* ============================================================
   Salesforce import builder.

   Reads the published month, takes the members Logistics shipped to, and
   writes the three-tab workbook. Every constant below was lifted from the
   template so the output matches what Salesforce already accepts. Change
   them here if the org changes them there.

   Needs core.js first.
   ============================================================ */
(function(){
  const DATA_URL = 'data/latest.enc';
  const $ = id => document.getElementById(id);
  const cfg = () => window.NOBOX_CONFIG || {};
  const msg = (kind, title, body) =>
    `<div class="note${kind === 'warn' ? ' warn' : ''}"><div class="lbl">${title}</div><p>${body}</p></div>`;

  /* ---------- constants copied from the template ---------- */
  const SF = {
    step1: {
      sheet: 'Step 1 - Engagement Create',
      notes: ['Update to SM Ifor (One Time Care Package Support: First Name Last Initial.)',
              'Put to Start Date', 'Don\u2019t Change', '', '', 'Update to Client ID',
              'Don\u2019t Change (OTC ID)', 'Don\u2019t Change (OTC ID)', 'Don\u2019t Change',
              'Don\u2019t Change', 'Don\u2019t Change', 'Don\u2019t Change', 'Don\u2019t Change'],
      headers: ['Name','pmdm__StartDate__c','pmdm__Stage__c','Branch_of_Service__c',
                'Message_to_Angels__c','pmdm__Contact__c','pmdm__Program__c','RecordTypeId',
                'Volunteer_Capacity__c','Registered_Volunteers__c','Volunteer_Capacity_Correct__c',
                'Requested_Wishlist_Quantities_Set__c','Documents_Provided__c'],
      stage: 'Active',
      program: 'a1N4x000006CkKlEAK',
      recordType: '0124x000000aJl3AAE',
      config: [['O3','API Type'],['P3','Enterprise'],['O4','Action'],['P4','Insert'],
               ['O5','Object'],['P5','pmdm__ProgramEngagement__c'],['O6','Data']]
    },
    paste: {
      sheet: 'Paste from Thing',
      headers: ['Name','pmdm__StartDate__c','pmdm__Stage__c','Branch_of_Service__c',
                'Message_to_Angels__c','pmdm__Contact__c','pmdm__Program__c','RecordTypeId',
                'Volunteer_Capacity__c','Registered_Volunteers__c','Volunteer_Capacity_Correct__c',
                'Requested_Wishlist_Quantities_Set__c','Documents_Provided__c',
                '__Status','__Id','__Action','__Errors'],
      banner: ['O1','TAKE THIS ONE']
    },
    step2: {
      sheet: 'Step 2 Service Complete',
      notes: ['Paste from Import','Change to (One Time Support for First Last)','Update to Client ID',
              'Don\u2019t Change','Don\u2019t Change','Update','Update','Don\u2019t Change',
              'Don\u2019t Change','Don\u2019t Change','Don\u2019t Change','Update','Don\u2019t Change'],
      headers: ['pmdm__ProgramEngagement__c','Name','pmdm__Contact__c',
                'pmdm__Service__r:pmdm__Service__c:Name','pmdm__Service_Provider__c',
                'Report_By_Date__c','Date_Supported__c','Hours_Volunteered__c',
                'Total_Cost_of_Support__c','Number_of_Letters_Sent__c',
                'Number_of_Total_Packages__c','Notes__c','Status__c'],
      service: 'One Time Support',
      provider: '003TR000009xAiBYAU',
      status: 'Completed',
      config: [['P2','API Type'],['Q2','Enterprise'],['P3','Action'],['Q3','Insert'],
               ['P4','Object'],['Q4','pmdm__ServiceDelivery__c'],['P5','Data']]
    }
  };

  let payload = null, picked = [];

  /* ---------- open the published month ---------- */
  async function signIn(){
    const typed = $('pw') ? $('pw').value : '';
    if (siteLocked()){
      if (!typed){ $('unlockMsg').innerHTML = msg('warn','Password needed','Enter the team password.'); return; }
      if (!window.noboxHash || window.noboxHash(typed) !== cfg().passwordHash){
        $('unlockMsg').innerHTML = msg('warn','That password did not work','Use the team password, not the admin one.');
        $('pw').select(); return;
      }
    }
    $('unlockMsg').innerHTML = '<p class="hint">Opening...</p>';

    let text = null;
    try {
      const res = await fetch(DATA_URL + '?_=' + Date.now(), { cache:'no-store' });
      if (res.ok){
        const raw = await res.text();
        const probe = JSON.parse(raw);
        if (probe && probe.ct) text = raw;
      }
    } catch(e){ text = null; }
    if (!text){
      $('unlockMsg').innerHTML = msg('warn','Nothing published yet',
        'Run the month in the builder and publish it first. This page works from the published list.');
      return;
    }

    try { payload = await decryptPayload(keyFor(typed), text); }
    catch(e){
      $('unlockMsg').innerHTML = msg('warn','That password did not open the file',
        'It may have been published with a different password.');
      return;
    }

    state.rows = reviveRows(payload.rows || []);
    const mk = String(payload.monthKey || '').split('-');
    if (mk.length === 2) state.month = { y:+mk[0], m:+mk[1] - 1 };

    $('unlock').style.display = 'none';
    $('content').style.display = '';
    setUp();
  }

  /* ---------- the list ---------- */
  function shipped(){ return state.rows.filter(shippable); }

  function setUp(){
    const list = shipped();
    picked = list.map(() => true);

    if (payload.month){
      $('monthBig').textContent = payload.month;
      $('monthHero').querySelector('.sm').textContent = 'the month these boxes belong to';
      $('monthHero').style.display = '';
    }
    $('cntBig').textContent = list.length;
    $('cntSm').textContent = 'members on the Logistics list\nuntick anyone who did not get a box';

    const today = new Date();
    $('expDate').value = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    $('notes').value = 'OTC for Non Support for ' + (payload.month || '');

    $('picks').innerHTML = list.map((r, i) => {
      const sp = names(r);
      return `<label class="pick"><input type="checkbox" data-i="${i}" checked>` +
        `<span class="nm">${r.name}</span>` +
        `<span class="sf">${sp.engagement}</span>` +
        `<span class="sf" style="margin-left:auto">${r.clientId || 'no client id'}</span></label>`;
    }).join('') || '<p class="hint" style="padding:14px">Nobody is on the Logistics list for this month.</p>';

    $('picks').querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', () => { picked[+cb.dataset.i] = cb.checked; tally(); });
    });
    tally();
  }

  function tally(){
    const n = picked.filter(Boolean).length;
    const noId = shipped().filter((r, i) => picked[i] && !r.clientId).length;
    $('pickCount').textContent = n + ' of ' + picked.length + ' selected' +
      (noId ? ' \u00b7 ' + noId + ' with no Client ID, which Salesforce will reject' : '');
    $('pickCount').style.color = noId ? 'var(--red)' : 'var(--ink-soft)';
    $('cntBig').textContent = n;
  }

  /* First name plus last initial for tab 1, full name for tab 3. */
  function names(r){
    const first = String(r.first || '').trim();
    const last = String(r.last || '').trim();
    return {
      engagement: 'One Time Care Package Support: ' + first + (last ? ' ' + last.charAt(0) + '.' : ''),
      support: 'One Time Support for ' + (first + ' ' + last).trim()
    };
  }

  /* ---------- build it ---------- */
  async function build(){
    const out = $('buildOut');
    const rows = shipped().filter((r, i) => picked[i]);
    if (!rows.length){ out.innerHTML = msg('warn','Nobody selected','Tick at least one member.'); return; }

    const p = $('expDate').value.split('-');
    const when = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
    const note = $('notes').value;

    out.innerHTML = '<p class="hint">Building...</p>';
    const wb = new ExcelJS.Workbook();
    wb.creator = 'No Box Builder';

    /* --- tab 1, engagement create --- */
    const s1 = wb.addWorksheet(SF.step1.sheet);
    setRow(s1, 1, SF.step1.notes);
    setRow(s1, 2, SF.step1.headers);
    rows.forEach((r, i) => {
      const row = s1.getRow(3 + i);
      row.values = [
        names(r).engagement,   // A
        when,                  // B
        SF.step1.stage,        // C
        '',                    // D branch of service, not carried by the No Box list
        '',                    // E message to angels
        r.clientId || '',      // F
        SF.step1.program,      // G
        SF.step1.recordType,   // H
        1, 0, true, true, true // I to M
      ];
      row.getCell(2).numFmt = 'm/d/yyyy';
    });
    SF.step1.config.forEach(([ref, val]) => { s1.getCell(ref).value = val; });
    style(s1, SF.step1.headers.length);

    /* --- tab 2, empty on purpose --- */
    const s2 = wb.addWorksheet(SF.paste.sheet);
    s2.getCell(SF.paste.banner[0]).value = SF.paste.banner[1];
    setRow(s2, 2, SF.paste.headers);
    style(s2, SF.paste.headers.length);

    /* --- tab 3, service complete --- */
    const s3 = wb.addWorksheet(SF.step2.sheet);
    setRow(s3, 1, SF.step2.notes);
    setRow(s3, 2, SF.step2.headers);
    rows.forEach((r, i) => {
      const row = s3.getRow(3 + i);
      row.values = [
        '',                    // A comes from the pasted import results
        names(r).support,      // B
        r.clientId || '',      // C
        SF.step2.service,      // D
        SF.step2.provider,     // E
        when,                  // F
        when,                  // G
        0, 0, 0, 1,            // H to K
        note,                  // L
        SF.step2.status        // M
      ];
      row.getCell(6).numFmt = 'm/d/yyyy';
      row.getCell(7).numFmt = 'm/d/yyyy';
    });
    SF.step2.config.forEach(([ref, val]) => { s3.getCell(ref).value = val; });
    style(s3, SF.step2.headers.length);

    const buf = await wb.xlsx.writeBuffer();
    const stamp = when.toLocaleString('en-US', { month:'short' }) + '-' + when.getDate() + '-' + when.getFullYear();
    download(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'Inserting for Sales Force - ' + stamp + '.xlsx');

    out.innerHTML = msg('', 'Built',
      rows.length + ' member' + (rows.length === 1 ? '' : 's') + ' on tabs 1 and 3. ' +
      'Import tab 1, paste the results into tab 2, then copy the new engagement IDs into column A of tab 3.') +
      '<p class="hint" style="margin-top:8px">Mischief managed.</p>';
  }

  /* An empty string is not the same as an empty cell to some importers, so
     blanks are left genuinely blank the way the template has them. */
  function setRow(ws, n, vals){
    const row = ws.getRow(n);
    vals.forEach((v, i) => { if (v !== '' && v != null) row.getCell(i + 1).value = v; });
  }

  function style(ws, cols){
    ws.getRow(1).font = { italic:true, color:{ argb:'FF8C8377' } };
    ws.getRow(2).font = { bold:true };
    for (let i = 1; i <= cols; i++) ws.getColumn(i).width = i === 1 || i === 2 ? 38 : 20;
    ws.views = [{ state:'frozen', ySplit:2 }];
  }

  /* ---------- wire up ---------- */
  $('go').addEventListener('click', signIn);
  $('pw').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  $('btnBack').addEventListener('click', () => { location.href = 'index.html'; });
  $('btnBuilder').addEventListener('click', () => { location.href = 'build.html'; });
  $('btnBuild').addEventListener('click', build);
  $('btnAll').addEventListener('click', () => {
    picked = picked.map(() => true);
    $('picks').querySelectorAll('input').forEach(cb => cb.checked = true); tally();
  });
  $('btnNone').addEventListener('click', () => {
    picked = picked.map(() => false);
    $('picks').querySelectorAll('input').forEach(cb => cb.checked = false); tally();
  });

  if (!siteLocked()){ $('unlock').style.display = 'none'; signIn(); }
  else $('pw').focus();
})();
