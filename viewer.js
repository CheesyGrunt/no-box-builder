/* ============================================================
   Staff viewer. Fetches the encrypted list, decrypts it in the
   browser with the team password, and renders it read only.
   Needs core.js first.
   ============================================================ */
(function(){
  const DATA_URL = 'data/latest.enc';
  let fileText = null;

  const msg = (kind, title, body) =>
    `<div class="note${kind === 'warn' ? ' warn' : ''}"><div class="lbl">${title}</div><p>${body}</p></div>`;

  function show(html){ document.getElementById('unlockMsg').innerHTML = html; }

  async function fetchData(){
    if (fileText) return fileText;
    const res = await fetch(DATA_URL, { cache:'no-store' });
    if (!res.ok) throw new Error('missing');
    fileText = await res.text();
    return fileText;
  }

  async function open_(){
    const pw = document.getElementById('pw').value;
    if (!pw){ show(msg('warn', 'Password needed', 'Enter the team password.')); return; }
    if (!cryptoReady()){
      show(msg('warn', 'Open this from the web address',
        'This page has to be opened from its https link, not from a file on your computer. Ask for the link.'));
      return;
    }
    show('<p class="hint">Opening...</p>');

    let text;
    try { text = await fetchData(); }
    catch(e){
      show(msg('warn', 'No list published yet',
        'Nothing has been posted for this month. The Director of Virtual Services publishes it once the monthly run is finished.') +
        ((window.NOBOX_CONFIG || {}).adminHash
          ? '<div class="rowline" style="margin-top:12px"><input type="password" id="adminPw" placeholder="Admin password" style="min-width:200px"><button class="btn sm" id="adminGo">Run the first report</button></div><div id="adminMsg"></div>'
          : ''));
      wireAdmin();
      return;
    }

    let payload;
    try { payload = await decryptPayload(pw, text); }
    catch(e){
      show(msg('warn', 'That password did not work',
        'Check it and try again. If it still fails, the list may have been republished with a new password.'));
      return;
    }

    state.rows = reviveRows(payload.rows || []);
    const mk = (payload.monthKey || '').split('-');
    if (mk.length === 2) state.month = { y:+mk[0], m:+mk[1] - 1 };

    document.getElementById('unlock').style.display = 'none';
    document.getElementById('content').style.display = '';
    document.getElementById('monthChip').textContent = payload.month || '';
    document.getElementById('monthChip').className = 'stage-chip on';
    if ((window.NOBOX_CONFIG || {}).adminHash) document.getElementById('btnRun').style.display = '';

    const gen = payload.generated ? new Date(payload.generated) : null;
    document.getElementById('subLine').textContent =
      (payload.month ? payload.month + '. ' : '') + state.rows.length + ' members did not receive a box' +
      (gen ? '. Published ' + gen.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + '.' : '.');

    paint();
    showAdmin(gen);
  }

  /* The run button only appears for whoever knows the admin password.
     Staff never see a way to overwrite the month. */
  function showAdmin(gen){
    const cfg = window.NOBOX_CONFIG || {};
    if (!cfg.adminHash){
      document.getElementById('adminPanel').style.display = 'none';
      return;
    }
    const now = new Date();
    const stale = gen && (now.getFullYear() !== gen.getFullYear() || now.getMonth() !== gen.getMonth());
    document.getElementById('staleLine').textContent = stale
      ? 'This list is from last month. A new run will replace it everywhere the moment you publish.'
      : 'This month is already published. Running again replaces it.';
    if (stale) document.getElementById('adminPanel').style.borderLeftColor = 'var(--red)';
  }

  function goAdmin(){
    const cfg = window.NOBOX_CONFIG || {};
    const pw = document.getElementById('adminPw').value;
    const box = document.getElementById('adminMsg');
    if (!pw){ box.innerHTML = msg('warn', 'Password needed', 'Enter the admin password.'); return; }
    if (!window.noboxHash || window.noboxHash(pw) !== cfg.adminHash){
      box.innerHTML = msg('warn', 'Not the admin password', 'This is the second password, the one only you have.');
      return;
    }
    try { sessionStorage.setItem('nobox-admin', cfg.adminHash); } catch(e){}
    location.href = 'build.html';
  }

  function paint(){
    const c = s => state.rows.filter(r => r.status === s).length;
    const wait = c(STATUS.WAIT), angel = c(STATUS.ANGEL), total = state.rows.length;
    document.getElementById('stats2').innerHTML = [
      ['Total without a box', total, ''],
      ['Already waitlisted', wait, 'g'],
      ['Waiting on Angel contact', angel, 'b'],
      ['Boxes to send', total - wait - angel, 'o']
    ].map(([l, v, k]) => `<div class="stat ${k}"><dt>${l}</dt><dd>${v}</dd></div>`).join('');

    const held = state.rows.filter(r => r.status === STATUS.SEND && (r.flagRed || r.flagPurple || !r.addr1)).length;
    document.getElementById('r-log').textContent = state.rows.filter(r => r.status === STATUS.SEND && !r.flagRed && !r.flagPurple && r.addr1).length;
    document.getElementById('r-vol').textContent = angel;
    document.getElementById('r-rev').textContent = VIEWS.review.rows().length;

    document.getElementById('alerts').innerHTML = held
      ? msg('warn', 'Some rows are held back',
          held + ' member' + (held === 1 ? ' is' : 's are') + ' kept out of the Logistics list until an address or an eligibility date is confirmed. They are on the Needs review tab. Do not ship to a held row without checking with Virtual Services first.')
      : msg('', 'Nothing held back', 'Every member cleared to receive a box has a verified military address.');

    renderView();
  }

  function wireAdmin(){
    const g = document.getElementById('adminGo'), p = document.getElementById('adminPw');
    if (g && !g.dataset.wired){ g.dataset.wired = '1'; g.addEventListener('click', goAdmin); }
    if (p && !p.dataset.wired){ p.dataset.wired = '1'; p.addEventListener('keydown', e => { if (e.key === 'Enter') goAdmin(); }); }
  }
  wireAdmin();
  document.getElementById('btnRun').addEventListener('click', () => {
    document.getElementById('adminPanel').scrollIntoView({ behavior:'smooth', block:'center' });
    document.getElementById('adminPw').focus();
  });
  document.getElementById('go').addEventListener('click', open_);
  document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') open_(); });
  document.getElementById('btnSop').addEventListener('click', () => window.open('sop.html', '_blank'));
  document.getElementById('btnCsv').addEventListener('click', exportCsv);
  document.getElementById('btnXlsx').addEventListener('click', exportXlsx);

  function switchTo(v){
    state.view = v;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
    renderView();
    document.getElementById('views').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  document.querySelectorAll('.view-tab').forEach(t => t.addEventListener('click', () => switchTo(t.dataset.view)));
  document.querySelectorAll('.role').forEach(r => r.addEventListener('click', () => switchTo(r.dataset.goto)));

  document.getElementById('pw').focus();
})();
