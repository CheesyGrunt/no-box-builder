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
  let envelope = null;

  async function loadList(){
    let text = null;
    try {
      const res = await fetch(DATA_URL + '?_=' + Date.now(), { cache:'no-store' });
      if (res.ok){
        const raw = await res.text();
        const probe = JSON.parse(raw);          // an HTML 404 page would throw here
        if (probe && probe.ct && probe.salt && probe.iv){ text = raw; envelope = probe; }
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

    state.updatedBy = payload.updatedBy || '';
    state.stats = payload.stats || null;
    if (state.stats && state.stats.coverage != null){
      const s = state.stats;
      const denom = s.eligible != null ? s.eligible : s.total;
      const gotPct = s.total ? Math.min(100, s.got / s.total * 100) : 0;
      const waitPct = s.total && s.waitlisted ? Math.min(100 - gotPct, s.waitlisted / s.total * 100) : 0;
      $('covStamp').innerHTML =
        '<span class="lb">Coverage this month, waitlist excluded</span>' +
        '<span class="dt">' + s.coverage + '%</span>' +
        '<span class="hbar mini"><i style="width:' + gotPct.toFixed(1) + '%"></i>' +
          (waitPct ? '<u style="width:' + waitPct.toFixed(1) + '%"></u>' : '') + '</span>' +
        '<span class="sm">' + s.got + ' of ' + denom + ' eligible received a box' +
        (s.waitlisted ? '<br>' + s.waitlisted + ' waitlisted, set aside'
                      : '<br>no waitlisted members this month, so nothing was set aside') + '</span>';
      $('covStamp').style.display = '';
    }
    if (payload.month){
      $('monthBig').textContent = payload.month;
      const mk2 = String(payload.monthKey || '').split('-');
      if (mk2.length === 2){
        const first = new Date(+mk2[0], +mk2[1] - 1, 1);
        const last = new Date(+mk2[0], +mk2[1], 0);
        const f = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
        $('monthHero').querySelector('.sm').textContent =
          f(first) + ' to ' + f(last) + ', ' + mk2[0] + '\nevery member deployed in this window';
      }
      $('monthHero').style.display = '';
    }
    const gen = payload.generated ? new Date(payload.generated) : null;
    $('monthChip').textContent = payload.month || 'Published';
    $('monthChip').className = 'stage-chip on';
    $('subLine').textContent =
      (payload.month ? payload.month + '. ' : '') + counted().length + ' members did not receive a box.';
    stamp(gen);

    showSchedule();
    $('btnHistory').style.display = '';
    $('btnUpdate').style.display = '';
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
    const who = state.updatedBy ? '\npublished by the ' + String(state.updatedBy).replace(/^The\s+/i, '') : '';
    box.innerHTML = '<span class="lb">Last updated</span>' +
      '<span class="dt">' + gen.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) + '</span>' +
      '<span class="sm">' + ago + who + '</span>';
    box.style.display = '';
  }

  /* The run schedule, with the next date worked out so nobody has to count
     forward from the 27th and wonder about the weekend. */
  const RUN_DAYS = [1, 15, 20, 25, 27];   // plus the last day of the month
  function nextBusinessDay(d){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
    return x;
  }
  function nextRun(from){
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const out = [];
    for (let m = -1; m <= 2; m++){
      const base = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const y = base.getFullYear(), mo = base.getMonth();
      const last = new Date(y, mo + 1, 0).getDate();
      RUN_DAYS.concat([last]).forEach(d => out.push(nextBusinessDay(new Date(y, mo, d))));
    }
    return out.filter(d => d >= today).sort((a, b) => a - b)[0] || null;
  }
  function showSchedule(){
    const box = $('schedule');
    if (!box) return;
    const nx = nextRun(new Date());
    const when = nx ? nx.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : '';
    box.innerHTML =
      (when ? '<span class="nx">Next run &nbsp;<b>' + when + '</b></span>' : '') +
      'This report is run on the 15th, the 20th, the 25th, the 27th, and the last day of the month. ' +
      'The final run happens on the 1st, to show the previous month closed out. ' +
      'Every run lands on a business day, so any of those dates falling on a weekend moves to the following business day.';
  }

  function showEmpty(reason){
    $('monthChip').textContent = 'No data';
    $('monthChip').className = 'stage-chip';
    $('dataArea').style.display = 'none';
    $('emptyState').style.display = '';
    $('subLine').textContent = '';
    $('pubStamp').style.display = 'none';
    showSchedule();
    if (reason === 'locked'){
      const fileMode = envelope && envelope.mode;
      const siteMode = siteLocked() ? 'locked' : 'open';
      let why, fix;
      if (fileMode === 'open' && siteMode === 'locked'){
        why = 'The published list was created before a password was set, so it cannot be opened now that one is.';
        fix = 'Run the report again and publish. The new file will use the team password.';
      } else if (fileMode === 'locked' && siteMode === 'open'){
        why = 'The published list was encrypted with a team password, but this site currently has no password set in config.js.';
        fix = 'Either restore the password block in config.js, or run the report again and publish while no password is set.';
      } else if (fileMode === 'locked'){
        why = 'The published list was encrypted with a different team password than the one this site now uses.';
        fix = 'Run the report again and publish with the current team password.';
      } else {
        why = 'The published list could not be decrypted.';
        fix = 'Run the report again and publish.';
      }
      const when = envelope && envelope.published
        ? ' It was published ' + new Date(envelope.published).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) + '.'
        : '';
      $('emptyState').innerHTML =
        '<h3>This list will not open</h3>' +
        '<p>' + why + when + '</p>' +
        '<p>' + fix + '</p>' +
        '<p class="hint" style="margin-top:14px">File was published in <strong>' + (fileMode || 'unknown') +
        '</strong> mode. This page is in <strong>' + siteMode + '</strong> mode.</p>';
    }
    setAdmin(null);
  }

  /* ---------- update report ----------
     No panel on the page. The button lives in the top bar and asks for the
     admin password in a dialog, so nobody browsing the list is tempted by a
     text box sitting under the headline. */
  let published = null;

  function stateOfMonth(){
    if (!published) return 'Nothing is published yet. Running the report posts the first month.';
    const now = new Date();
    const stale = now.getFullYear() !== published.getFullYear() || now.getMonth() !== published.getMonth();
    return stale
      ? 'The published list is from a previous month. Publishing a new run replaces it everywhere.'
      : 'This month is already published. Running again replaces it.';
  }

  function setAdmin(gen){
    published = gen || null;
    $('btnUpdate').style.display = '';
  }

  function askAdmin(){
    const c = cfg();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3 class="mt"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
        '<path d="M14.2 2 5.6 13.4h5.1L9.4 22l8.9-11.7h-5.3z" fill="currentColor"/></svg>Update the report</h3>' +
        '<p>' + stateOfMonth() + '</p>' +
        (c.adminHash
          ? '<p><input type="password" id="mPw" placeholder="Admin password" style="width:100%;font-size:16px;padding:11px 13px"></p><div id="mErr"></div>'
          : '<p class="hint">No admin password is set, so anyone signed in can replace the list.</p>') +
        '<div class="mact">' +
          '<button class="btn" id="mGo">Continue</button>' +
          '<button class="btn out" id="mNo">Cancel</button>' +
        '</div></div>';
    document.body.appendChild(back);

    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', e => { if (e.target === back) close(); });
    back.querySelector('#mNo').addEventListener('click', close);

    const go = () => {
      if (c.adminHash){
        const pw = back.querySelector('#mPw').value;
        if (!pw || !window.noboxHash || window.noboxHash(pw) !== c.adminHash){
          back.querySelector('#mErr').innerHTML = msg('warn', 'Not the admin password',
            'This is the second password, the one only the Director of Virtual Services has.');
          back.querySelector('#mPw').select();
          return;
        }
        try { sessionStorage.setItem('nobox-admin', c.adminHash); } catch(e){}
      }
      location.href = 'build.html';
    };
    back.querySelector('#mGo').addEventListener('click', go);
    const pwBox = back.querySelector('#mPw');
    if (pwBox){ pwBox.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); pwBox.focus(); }
    else back.querySelector('#mNo').focus();
  }

  /* ---------- rendering ---------- */
  function paint(){
    const c = s => counted().filter(r => effStatus(r) === s).length;
    const wait = c(STATUS.WAIT), angel = c(STATUS.ANGEL), total = counted().length;
    const cells = [
      ['Total without a box', total, ''],
      ['Already waitlisted', wait, 'g'],
      ['Waiting on Angel contact', angel, 'b'],
      ['Boxes to send', state.rows.filter(shippable).length, 'o']
    ];
    if (state.stats && state.stats.coverage != null)
      cells.push(['Coverage, waitlist excluded', state.stats.coverage + '%', '']);
    $('stats2').innerHTML = cells
      .map(([l, v, k]) => `<div class="stat ${k}"><dt>${l}</dt><dd>${v}</dd></div>`).join('');

    $('r-log').textContent = state.rows.filter(shippable).length;
    $('r-vol').textContent = angel;
    $('r-rev').textContent = VIEWS.review.rows().length;

    const who = (state.updatedBy || 'Director of Virtual Services').replace(/^The\s+/i, '');
    const settled = state.rows.filter(isSettled).length;
    $('alerts').innerHTML = settled
      ? msg('', 'Reviewed', 'The ' + who + ' has reviewed everything annotated under Needs review. ' +
            'Those rows are shown in the applicable tab.')
      : '';

    renderView();
  }

  /* Month by month coverage. Counts only, so it needs no password. */
  let history = null, histOpen = false;
  async function loadHistory(){
    if (history) return history;
    try {
      const res = await fetch('data/history.json?_=' + Date.now(), { cache:'no-store' });
      if (!res.ok) return (history = []);
      const j = await res.json();
      history = Array.isArray(j) ? j : [];
    } catch(e){ history = []; }
    return history;
  }
  async function toggleHistory(){
    const box = $('history');
    histOpen = !histOpen;
    if (!histOpen){ box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = '<p class="hint">Loading...</p>';
    window.scrollTo({ top:0, behavior:'smooth' });
    const list = (await loadHistory()).slice().sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)));
    if (!list.length){
      box.innerHTML = '<h3>Past months</h3><p class="hint">Nothing recorded yet. Each published month is added here from now on.</p>';
      return;
    }
    const now = state.month ? state.month.y + '-' + String(state.month.m + 1).padStart(2, '0') : '';
    const rows = list.map(m => {
      const pct = m.coverage == null ? 0 : m.coverage;
      /* Green is boxes delivered, gold is waitlisted and therefore left out of
         the maths, grey is what is still outstanding. */
      const base = (m.total || 0) + (m.waitlisted || 0) > 0 ? (m.total + (m.eligible != null ? 0 : 0)) : 0;
      const denom = m.total || 0;
      const gotPct = denom ? Math.min(100, m.got / denom * 100) : pct;
      const waitPct = denom && m.waitlisted ? Math.min(100 - gotPct, m.waitlisted / denom * 100) : 0;
      const legend = m.waitlisted ? m.got + ' of ' + m.eligible + ' eligible, ' + m.waitlisted + ' waitlisted set aside'
                                  : (m.got != null ? m.got + ' of ' + (m.eligible != null ? m.eligible : m.total) + ' eligible' : '');
      return '<div class="hrow' + (m.monthKey === now ? ' now' : '') + '">' +
        '<div class="hm">' + (m.month || m.monthKey) +
          (legend ? '<span class="hsub">' + legend + '</span>' : '') + '</div>' +
        '<div class="hbar">' +
          '<i style="width:' + gotPct.toFixed(1) + '%"></i>' +
          (waitPct ? '<u style="width:' + waitPct.toFixed(1) + '%"></u>' : '') +
        '</div>' +
        '<div class="hp">' + pct + '%</div></div>';
    }).join('');
    const avg = Math.round(list.reduce((s, m) => s + (m.coverage || 0), 0) / list.length);
    box.innerHTML = '<h3>Coverage by month</h3>' + rows +
      '<p class="hlegend"><span class="k green"></span>received a box' +
      '<span class="k gold"></span>waitlisted, left out of the percentage' +
      '<span class="k grey"></span>still without a box</p>' +
      '<p class="hnote">The percentage counts only eligible members. Waitlisted members are set aside, since they are already covered another way. ' +
      list.length + ' month' + (list.length === 1 ? '' : 's') + ' recorded, averaging ' + avg + '%. ' +
      'A month is finalised by the run on the 1st, which closes out the month before.</p>';
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
  $('btnUpdate').addEventListener('click', askAdmin);
  $('btnSop').addEventListener('click', () => window.open('sop.html', '_blank'));
  $('btnHistory').addEventListener('click', toggleHistory);
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
