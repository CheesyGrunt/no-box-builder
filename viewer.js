/* ============================================================
   Staff page.

   Sign in is checked against the hash in config.js, so it works even
   when nothing has been published. Once signed in, the same password
   decrypts the list if there is one. If there is not, you get the
   empty state and the update button, not an error.

   Needs core.js first.
   ============================================================ */
(function(){
  const DATA_URL = 'data/latest.enc';
  const $ = id => document.getElementById(id);
  const cfg = () => window.NOBOX_CONFIG || {};

  const msg = (kind, title, body) =>
    `<div class="note${kind === 'warn' ? ' warn' : ''}"><div class="lbl">${title}</div><p>${body}</p></div>`;

  let teamPw = '';

  /* ---------- sign in ---------- */
  async function signIn(){
    const typed = $('pw') ? $('pw').value : '';
    const c = cfg();

    if (siteLocked()){
      if (!typed){ $('unlockMsg').innerHTML = msg('warn', 'Password needed', 'Enter the team password.'); return; }
      if (!window.noboxHash || window.noboxHash(typed) !== c.passwordHash){
        $('unlockMsg').innerHTML = msg('warn', 'That password did not work',
          'Check it and try again. Use the team password, not the admin one.');
        $('pw').select();
        return;
      }
    }
    teamPw = keyFor(typed);

    try { sessionStorage.setItem('nobox-unlocked', c.passwordHash || 'open'); } catch(e){}
    $('unlock').style.display = 'none';
    $('content').style.display = '';
    if (!siteLocked()) warnOpenMode();
    await loadList();
  }

  /* ---------- the published list, if there is one ---------- */
  async function loadList(){
    let text = null;
    try {
      const res = await fetch(DATA_URL, { cache:'no-store' });
      if (res.ok){
        const raw = await res.text();
        const probe = JSON.parse(raw);          // an HTML 404 page would throw here
        if (probe && probe.ct && probe.salt && probe.iv) text = raw;
      }
    } catch(e){ text = null; }

    if (!text){ showEmpty(null); return; }

    let payload;
    try { payload = await decryptPayload(teamPw, text); }
    catch(e){
      showEmpty('locked');
      return;
    }

    state.rows = reviveRows(payload.rows || []);
    const mk = String(payload.monthKey || '').split('-');
    if (mk.length === 2) state.month = { y:+mk[0], m:+mk[1] - 1 };

    const gen = payload.generated ? new Date(payload.generated) : null;
    $('monthChip').textContent = payload.month || 'Published';
    $('monthChip').className = 'stage-chip on';
    $('subLine').textContent =
      (payload.month ? payload.month + '. ' : '') + state.rows.length + ' members did not receive a box.';
    stamp(gen);

    $('emptyState').style.display = 'none';
    $('dataArea').style.display = '';
    paint();
    setAdmin(gen);
  }

  /* The date this list was published, said plainly. Staff should never have to
     wonder whether they are working from something a month stale. */
  function stamp(gen){
    const box = $('pubStamp');
    if (!gen){ box.style.display = 'none'; return; }
    const days = Math.floor((Date.now() - gen.getTime()) / 86400000);
    const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' :
                days < 30 ? days + ' days ago' : 'over a month ago';
    box.className = 'pubstamp' + (days > 35 ? ' old' : '');
    box.innerHTML = '<span class="lb">Last updated</span>' +
      '<span class="dt">' + gen.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) + '</span>' +
      '<span class="ago">' + ago + '</span>';
    box.style.display = '';
  }

  function showEmpty(reason){
    $('monthChip').textContent = 'No data';
    $('monthChip').className = 'stage-chip';
    $('dataArea').style.display = 'none';
    $('emptyState').style.display = '';
    $('subLine').textContent = '';
    $('pubStamp').style.display = 'none';
    if (reason === 'locked'){
      $('emptyState').querySelector('h3').textContent = 'This list will not open';
      $('emptyState').innerHTML =
        '<h3>This list will not open</h3>' +
        '<p>A list is published, but it was encrypted with a different password than the one set on this site.</p>' +
        '<p>Running the report again and publishing will fix it.</p>';
    }
    setAdmin(null);
  }

  /* ---------- update report ---------- */
  function setAdmin(gen){
    const c = cfg();
    $('btnUpdate').style.display = '';
    if (!c.adminHash){
      $('adminPw').style.display = 'none';
      $('staleLine').textContent = 'No admin password is set, so anyone signed in can replace the list.';
    } else if (!gen){
      $('staleLine').textContent = 'Nothing is published yet. Run the report to post the first month.';
    } else {
      const now = new Date();
      const stale = now.getFullYear() !== gen.getFullYear() || now.getMonth() !== gen.getMonth();
      $('staleLine').textContent = stale
        ? 'This list is from a previous month. Publishing a new run replaces it everywhere.'
        : 'This month is already published. Running again replaces it.';
      if (stale) $('adminPanel').style.borderLeftColor = 'var(--red)';
    }
  }

  function toBuilder(){
    const c = cfg();
    const pw = $('adminPw').value;
    if (c.adminHash){
      if (!pw){ $('adminMsg').innerHTML = msg('warn', 'Password needed', 'Enter the admin password.'); return; }
      if (!window.noboxHash || window.noboxHash(pw) !== c.adminHash){
        $('adminMsg').innerHTML = msg('warn', 'Not the admin password', 'This is the second password, the one only you have.');
        $('adminPw').select();
        return;
      }
      try { sessionStorage.setItem('nobox-admin', c.adminHash); } catch(e){}
    }
    location.href = 'build.html';
  }

  /* ---------- rendering ---------- */
  function paint(){
    const c = s => state.rows.filter(r => r.status === s).length;
    const wait = c(STATUS.WAIT), angel = c(STATUS.ANGEL), total = state.rows.length;
    $('stats2').innerHTML = [
      ['Total without a box', total, ''],
      ['Already waitlisted', wait, 'g'],
      ['Waiting on Angel contact', angel, 'b'],
      ['Boxes to send', total - wait - angel, 'o']
    ].map(([l, v, k]) => `<div class="stat ${k}"><dt>${l}</dt><dd>${v}</dd></div>`).join('');

    const ship = r => r.status === STATUS.SEND && !r.flagRed && !r.flagPurple && r.addr1 && r.city && r.zip;
    const held = state.rows.filter(r => r.status === STATUS.SEND && !ship(r)).length;
    $('r-log').textContent = state.rows.filter(ship).length;
    $('r-vol').textContent = angel;
    $('r-rev').textContent = VIEWS.review.rows().length;

    $('alerts').innerHTML = held
      ? msg('warn', 'Some rows are held back',
          held + ' member' + (held === 1 ? ' is' : 's are') + ' kept out of the Logistics list until an address or an eligibility date is confirmed. They are on the Needs review tab. Do not ship to a held row without checking with Virtual Services first.')
      : msg('', 'Nothing held back', 'Every member cleared to receive a box has a verified military address.');

    renderView();
  }

  function switchTo(v){
    state.view = v;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
    renderView();
    $('views').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function warnOpenMode(){
    const b = document.createElement('div');
    b.className = 'note warn';
    b.style.margin = '0 0 20px';
    b.innerHTML = '<div class="lbl">No password set</div><p>This page opens for anyone with the link. ' +
      'Turn on passwords in <a href="set-password.html">set-password.html</a> before staff or real member data.</p>';
    $('content').insertBefore(b, $('content').firstChild);
  }

  /* ---------- wire up ---------- */
  $('go').addEventListener('click', signIn);
  $('pw').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  $('adminGo').addEventListener('click', toBuilder);
  $('adminPw').addEventListener('keydown', e => { if (e.key === 'Enter') toBuilder(); });
  $('btnUpdate').addEventListener('click', () => {
    $('adminPanel').scrollIntoView({ behavior:'smooth', block:'center' });
    if (cfg().adminHash) $('adminPw').focus();
  });
  $('btnSop').addEventListener('click', () => window.open('sop.html', '_blank'));
  $('btnCsv').addEventListener('click', exportCsv);
  $('btnXlsx').addEventListener('click', exportXlsx);
  document.querySelectorAll('.view-tab').forEach(t => t.addEventListener('click', () => switchTo(t.dataset.view)));
  document.querySelectorAll('.role').forEach(r => r.addEventListener('click', () => switchTo(r.dataset.goto)));

  if (!siteLocked()){
    $('unlock').style.display = 'none';
    $('content').style.display = '';
    warnOpenMode();
    teamPw = keyFor('');
    loadList();
  } else {
    $('pw').focus();
  }
})();
