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

    await loadOverlay();

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
    $('btnSF').style.display = '';
    $('emptyState').style.display = 'none';
    $('dataArea').style.display = '';
    paint();
    setAdmin(gen);
  }

  /* ============================================================
     Volunteer Services notes and box requests.

     Read by everyone who can sign in. Written only by someone holding the
     Volunteer Services key, and only ever to data/requests.enc. If any of
     this fails, the page falls back to the plain published list rather than
     showing an error over the top of the report.
     ============================================================ */
  const VS_KEY = 'nobox-vs-token';      // shared with the builder's own token box
  const ME_KEY = 'nobox-vs-name';
  let overlayDirty = 0, overlayBusy = false;

  const ghCfg = () => {
    const g = (cfg().github || {});
    return { owner:g.owner || '', repo:g.repo || '', branch:g.branch || 'main', path:g.path || 'data/latest.enc' };
  };
  const vsToken = () => { try { return localStorage.getItem(VS_KEY) || ''; } catch(e){ return ''; } };

  async function loadOverlay(){
    state.overlay = emptyOverlay();
    try {
      const res = await fetch(OVERLAY_PATH + '?_=' + Date.now(), { cache:'no-store' });
      if (res.ok){
        const raw = await res.text();
        const probe = JSON.parse(raw);
        if (probe && probe.ct && probe.salt && probe.iv){
          const o = await decryptPayload(teamPw, raw);
          if (o && o.entries) state.overlay = o;
        }
      }
    } catch(e){
      /* No notes file yet, or it will not open. Either way the report itself
         is unaffected, so carry on with an empty set rather than stopping. */
      state.overlay = emptyOverlay();
    }
    /* A notes file left over from last month is set aside, not merged. */
    if (state.overlay.monthKey && monthKeyNow() && state.overlay.monthKey !== monthKeyNow())
      state.overlay = emptyOverlay();
    try { state.whoami = localStorage.getItem(ME_KEY) || ''; } catch(e){}
    state.vsEdit = !!vsToken() && ghCfg().path !== OVERLAY_PATH;
    applyOverlay();
  }

  /* Dirty tracking. The save is explicit rather than automatic: Volunteer
     Services should be able to work down the list and send it all at once,
     and an accidental keystroke should not reach the Director. */
  window.onOverlayChange = function(){
    overlayDirty++;
    paint();            // paint ends by refreshing the save bar
  };

  function paintVsBar(){
    const bar = $('vsbar');
    if (!bar) return;
    /* Unsaved work keeps the bar on screen whatever tab you are on. Approving
       the last request empties the approvals tab, which bounces you back to
       the full list, and the Save button must not leave with it. */
    const show = overlayDirty > 0 ||
      ((state.view === 'volunteer' || state.view === 'approvals') && (state.vsEdit || state.canApprove));
    bar.style.display = show ? '' : 'none';
    if (!show) return;
    const who = state.whoami || 'not set';
    bar.innerHTML =
      '<div class="vswho"><span class="lb">Working as</span>' +
        '<button class="linky" id="vsWho">' + who + '</button></div>' +
      (overlayDirty
        ? '<span class="vsnag">' + overlayDirty + ' change' + (overlayDirty === 1 ? '' : 's') + ' not saved yet</span>'
        : '<span class="hint">Everything is saved.</span>') +
      '<button class="btn sm gold" id="vsSave"' + (overlayDirty && !overlayBusy ? '' : ' disabled') + '>' +
        (overlayBusy ? 'Saving...' : 'Save to the site') + '</button>' +
      '<div id="vsOut" class="vsout"></div>';

    $('vsWho').addEventListener('click', askWho);
    $('vsSave').addEventListener('click', doSave);
  }

  function askWho(){
    const name = prompt('Your name, so notes you add are signed.\n\nThis shows next to every note you write.',
      state.whoami || '');
    if (name == null) return;
    state.whoami = name.trim();
    try { localStorage.setItem(ME_KEY, state.whoami); } catch(e){}
    paintVsBar();
    renderView();
  }

  async function doSave(){
    const out = () => $('vsOut');
    if (!state.whoami){ askWho(); if (!state.whoami) return; }
    const token = vsToken();
    if (!token){ askVsKey(); return; }
    if (!cryptoReady()){
      out().innerHTML = msg('warn', 'Open the live site',
        'Saving needs the https address, not a file opened from your hard drive.');
      return;
    }
    overlayBusy = true; paintVsBar();
    try {
      state.overlay.monthKey = state.overlay.monthKey || monthKeyNow();
      const merged = await saveOverlay(token, ghCfg(), teamPw, state.overlay);
      state.overlay = merged;
      applyOverlay();
      overlayDirty = 0; overlayBusy = false;
      paintVsBar(); paint();
      $('vsOut').innerHTML = msg('', 'Saved',
        'The Director of Virtual Services will see this. Render takes about a minute to pick it up, ' +
        'so give it a moment before you reload.');
    } catch(e){
      overlayBusy = false; paintVsBar();
      const m = String(e.message || e);
      $('vsOut').innerHTML = /401/.test(m)
        ? msg('warn', 'That key was not accepted', 'Ask the Director of Virtual Services for a new editing key. Nothing was lost, your changes are still on screen.')
        : /403/.test(m)
        ? msg('warn', 'That key cannot write here', 'It needs Contents set to Read and write on this repository. Your changes are still on screen.')
        : msg('warn', 'Could not save', m + '. Nothing was changed on the site, and your work is still on screen. Try again in a moment.');
    }
  }

  /* The editing key. Pasting it turns the Volunteer Services tab from a list
     into a worksheet. It is kept in this browser only. */
  function askVsKey(){
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3 class="mt"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
        '<path d="M14.2 2 5.6 13.4h5.1L9.4 22l8.9-11.7h-5.3z" fill="currentColor"/></svg>Volunteer Services key</h3>' +
        '<p>Paste the editing key the Director of Virtual Services gave you. It stays in this browser, ' +
        'so you only do this once on this computer.</p>' +
        '<p><input type="password" id="vkPw" placeholder="Editing key" style="width:100%;font-size:16px;padding:11px 13px"></p>' +
        '<p class="hint">Without it you can still read everything. You just cannot add notes.</p>' +
        '<div class="mact"><button class="btn" id="vkGo">Turn on editing</button>' +
        '<button class="btn out" id="vkNo">Cancel</button>' +
        (vsToken() ? '<button class="btn out" id="vkClear">Forget this key</button>' : '') +
        '</div></div>';
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', e => { if (e.target === back) close(); });
    back.querySelector('#vkNo').addEventListener('click', close);
    const clr = back.querySelector('#vkClear');
    if (clr) clr.addEventListener('click', () => {
      try { localStorage.removeItem(VS_KEY); } catch(e){}
      state.vsEdit = false; close(); paint(); paintVsBar();
    });
    const go = () => {
      const v = back.querySelector('#vkPw').value.trim();
      if (!v) return;
      try { localStorage.setItem(VS_KEY, v); } catch(e){}
      state.vsEdit = ghCfg().path !== OVERLAY_PATH;
      close();
      if (!state.whoami) askWho();
      paint(); paintVsBar();
    };
    back.querySelector('#vkGo').addEventListener('click', go);
    const b = back.querySelector('#vkPw');
    b.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    b.focus();
  }

  /* Leaving with notes not yet sent is almost always a mistake. */
  window.addEventListener('beforeunload', e => {
    if (!overlayDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

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
    $('btnSF').style.display = '';
    $('btnVsKey').style.display = '';
  }

  /* Both admin doors, one dialog. The password is the same either way, so the
     only thing that changes is where you land and what it says. */
  const DOORS = {
    'build.html': {
      title: 'Update the report',
      body: () => stateOfMonth()
    },
    'salesforce.html': {
      title: 'Salesforce import',
      body: () => 'Builds the three tab import workbook for the members Logistics shipped to. ' +
                  'Run it once the boxes have actually gone out.'
    },
    'approve': {
      title: 'Approve box requests',
      body: () => {
        const n = VIEWS.approvals.rows().length;
        return (n ? n + ' member' + (n === 1 ? '' : 's') + ' Volunteer Services could not place. '
                  : 'Nothing is waiting right now. ') +
               'Approving one puts it on the Logistics list for a box. Nothing is deleted either way.';
      }
    }
  };

  function askAdmin(dest, onOk){
    const door = DOORS[dest] || DOORS['build.html'];
    const c = cfg();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3 class="mt"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
        '<path d="M14.2 2 5.6 13.4h5.1L9.4 22l8.9-11.7h-5.3z" fill="currentColor"/></svg>' + door.title + '</h3>' +
        '<p>' + door.body() + '</p>' +
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
      close();
      if (typeof onOk === 'function') onOk(); else location.href = dest;
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

    /* The approvals card only exists when there is something to approve, so an
       empty queue never sits on the page looking like a job nobody has done. */
    const waiting = VIEWS.approvals.rows().length;
    const card = $('roleApprove');
    if (card){
      card.style.display = waiting ? '' : 'none';
      $('r-app').textContent = waiting;
    }

    const who = (state.updatedBy || 'Director of Virtual Services').replace(/^The\s+/i, '');
    const settled = state.rows.filter(isSettled).length;
    const approved = counted().filter(approvedForBox).length;

    let alerts = '';
    if (waiting){
      alerts += msg('warn', 'Waiting on the Director',
        waiting + ' member' + (waiting === 1 ? '' : 's') + ' Volunteer Services could not place ' +
        (waiting === 1 ? 'is' : 'are') + ' waiting on a decision. ' +
        'Until then ' + (waiting === 1 ? 'it is' : 'they are') + ' not on the Logistics list.');
    }
    if (approved){
      alerts += msg('', 'Added after outreach',
        approved + ' member' + (approved === 1 ? '' : 's') + ' moved onto the Logistics list after ' +
        'Volunteer Services came up empty and the Director approved a box. ' +
        'They are still on the Volunteer Services tab with the full history against them.');
    }
    if (settled){
      alerts += msg('', 'Reviewed', 'The ' + who + ' has reviewed everything annotated under Needs review. ' +
            'Those rows are shown in the applicable tab.');
    }
    $('alerts').innerHTML = alerts;

    renderView();
    paintVsBar();
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
    paintVsBar();
    /* The approvals tab is readable by anyone signed in, so the queue is never
       a secret. The buttons only appear once the admin password is in. This
       runs before the scroll so nothing can swallow the prompt. */
    if (v === 'approvals' && !state.canApprove){
      if (cfg().adminHash) askAdmin('approve', () => { state.canApprove = true; renderView(); paintVsBar(); });
      else { state.canApprove = true; renderView(); paintVsBar(); }
    }
    try { $('views').scrollIntoView({ behavior:'smooth', block:'start' }); } catch(e){}
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
  $('btnUpdate').addEventListener('click', () => askAdmin('build.html'));
  $('btnSF').addEventListener('click', () => askAdmin('salesforce.html'));
  $('btnVsKey').addEventListener('click', askVsKey);
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
