(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return n == null ? '-' : Math.round(n).toLocaleString('en-US'); };
  var money = function (n) { return n == null ? '-' : '$' + Math.round(n).toLocaleString('en-US'); };
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '0%'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PROG = { mvfd: 'MVFD', pantry: 'Pantry' };
  var KEY = 'cspn.view';
  var S, R;   // summary, roster

  function niceDate(iso) { if (!iso) return '-'; var p = iso.split('-'); return +p[1] + '/' + +p[2] + '/' + p[0]; }
  function progOf(c) { return c.m && c.p ? 'both' : c.m ? 'mvfd' : 'pantry'; }
  function store(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  function recall(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  // ---------- gate ----------
  var box = null;
  fetch('data/hall.enc.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (b) {
      box = b;
      if (!b) { $('gateMsg').innerHTML = 'Nothing has been published yet. An admin needs to run the first update in <a href="kitchens.html">the Kitchens</a>.'; $('gateForm').classList.add('hidden'); return; }
      var saved = recall(KEY); if (saved) open(saved, true);
    });
  $('gateForm').onsubmit = function (e) { e.preventDefault(); var p = $('gatePass').value; if (p && box) open(p); };
  wireEye();
  // clear anything Chrome autofilled into the box before the person types
  setTimeout(function () { if (document.activeElement !== $('gatePass')) $('gatePass').value = ''; }, 400);
  function open(pass, quiet) {
    if (!quiet) $('gateMsg').textContent = 'Opening...';
    GreatHall.unseal(box, pass).then(function (data) {
      S = data.summary; R = data.roster || [];
      store(KEY, pass); $('gatePass').value = ''; $('gateMsg').textContent = '';
      $('gate').classList.add('hidden'); $('dash').classList.remove('hidden'); $('stampBox').classList.remove('hidden');
      try { render(); }
      catch (err) {
        // the password was right; something on the page broke. Say so instead of blaming the password.
        console.error(err);
        var n = document.createElement('div'); n.className = 'card'; n.style.cssText = 'margin-top:20px;border-color:var(--warn)';
        n.innerHTML = '<b>The password worked, but part of the page hit an error.</b><br><span class="notes">Try Ctrl+Shift+R to reload. If it keeps happening, send Cody this: ' + esc(err && err.message || err) + '</span>';
        $('dash').insertBefore(n, $('dash').firstChild);
      }
    }, function () {
      store(KEY, null);
      if (!quiet) $('gateMsg').innerHTML = 'That password did not work. Click Show to see what is in the box. Chrome sometimes fills in a saved password before you type.';
    });
  }
  function wireEye() {
    document.querySelectorAll('.eye').forEach(function (b) {
      b.onclick = function () { var i = document.getElementById(b.dataset.for); var show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; i.focus(); };
    });
  }
  $('lockNow').onclick = function (e) { e.preventDefault(); store(KEY, null); location.reload(); };

  // ---------- render ----------
  function render() {
    var T = S.totals;
    $('yr').textContent = S.year;
    $('updated').textContent = new Date(S.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    var lastM = S.months.length ? S.months[S.months.length - 1] : null;
    var lastIdx = S.months.length; // 1-based month number of the latest month

    var k = [
      ['Unique clients', fmt(T.uniqueClients), 'Each person counted once, at their first visit', 'feature', function () { list('All unique clients', 'Everyone who attended an MVFD or pantry in ' + S.year + '.', function () { return true; }); }],
      ['Attended both', fmt(T.bothClients), pct(T.bothClients, T.uniqueClients) + ' of clients came to an MVFD and a pantry', 'feature', function () { list('Attended both', 'At least one MVFD and one pantry.', function (c) { return progOf(c) === 'both'; }); }],
      ['First-timers in ' + (lastM ? lastM.month : '-'), fmt(lastM ? lastM.newClients : 0), 'New faces this month', '', function () { var mm = ('0' + lastIdx).slice(-2); list('First-timers in ' + lastM.month + ' ' + S.year, 'First visit of the year landed in ' + lastM.month + '.', function (c) { return c.f.slice(5, 7) === mm; }); }],
      ['Total visits', fmt(T.totalVisits), fmt(T.mvfdVisits) + ' MVFD &middot; ' + fmt(T.pantryVisits) + ' pantry'],
      ['Service sessions', fmt(T.mvfdSessions + T.pantrySessions), fmt(T.mvfdSessions) + ' MVFD &middot; ' + fmt(T.pantrySessions) + ' pantry'],
      ['Pounds of food', fmt(T.pounds), fmt(T.mvfdPounds) + ' MVFD &middot; ' + fmt(T.pantryPounds) + ' pantry', 'feature'],
      ['Value of food', money(T.value), money(T.mvfdValue) + ' MVFD &middot; ' + money(T.pantryValue) + ' pantry', 'feature'],
      T.inKind == null ? ['Value of in-kind', 'Awaiting report', 'Add the in-kind report in the Kitchens', 'pending'] : ['Value of in-kind', money(T.inKind), esc(T.inKindSource || '')]
    ];
    $('kpis').innerHTML = k.map(function (x, i) {
      var click = x[4] ? ' clickable" role="button" tabindex="0" data-k="' + i : '';
      return '<div class="card kpi ' + (x[3] || '') + click + '">' + (x[4] ? '<span class="more">View list</span>' : '') + '<div class="label">' + x[0] + '</div><div class="value">' + x[1] + '</div><div class="note">' + x[2] + '</div></div>';
    }).join('');
    bindClicks($('kpis'), function (el) { k[+el.dataset.k][4](); });

    // overlap
    var o = S.overlap, tot = o.both + o.mvfdOnly + o.pantryOnly;
    var parts = [['MVFD only', o.mvfdOnly, 'var(--mvfd)', 'mvfd'], ['Both', o.both, 'var(--both)', 'both'], ['Pantry only', o.pantryOnly, 'var(--pantry)', 'pantry']];
    $('overlapBar').innerHTML = parts.map(function (p) { return '<div class="clickable" data-p="' + p[3] + '" style="flex:' + p[1] + ';background:' + p[2] + '" title="' + p[0] + ': ' + fmt(p[1]) + '">' + (p[1] / tot > .09 ? fmt(p[1]) : '') + '</div>'; }).join('');
    $('overlapLegend').innerHTML = parts.map(function (p) { return '<span class="clickable" role="button" tabindex="0" data-p="' + p[3] + '"><i style="background:' + p[2] + '"></i>' + p[0] + ' <b class="mono">' + fmt(p[1]) + '</b> (' + pct(p[1], tot) + ')</span>'; }).join('');
    var overlapList = function (el) { var p = el.dataset.p, lab = { mvfd: 'MVFD only', both: 'Attended both', pantry: 'Pantry only' }[p]; list(lab, 'Clients in the "' + lab + '" group.', function (c) { return progOf(c) === p; }); };
    bindClicks($('overlapBar'), overlapList); bindClicks($('overlapLegend'), overlapList);

    // frequency (every bucket clickable)
    var ranges = { '1 visit': [1, 1], '2-3 visits': [2, 3], '4-6 visits': [4, 6], '7-9 visits': [7, 9], '10+ visits': [10, 1e9] };
    $('freq').innerHTML = hbars(S.frequency.map(function (f) { return [f.bucket, f.count]; }), true, true);
    bindClicks($('freq'), function (el) {
      var b = el.dataset.v, r = ranges[b] || [0, 1e9];
      list('Clients with ' + b, 'Repeat attendance across MVFDs and pantries, most visits first.', function (c) { var t = c.m + c.p; return t >= r[0] && t <= r[1]; }, 'visits');
    });

    monthChart(); siteTable();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(monthChart, 150); }); sessions(); households(); statusPanel(); community(); notes();
  }

  function bindClicks(root, fn) {
    root.querySelectorAll('.clickable').forEach(function (el) {
      el.onclick = function () { fn(el); };
      el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(el); } };
    });
  }

  function hbars(rows, gold, clickable) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    var sum = rows.reduce(function (a, r) { return a + r[1]; }, 0);
    return rows.map(function (r) {
      var c = clickable ? ' clickable" role="button" tabindex="0" data-v="' + esc(r[0]) : '';
      return '<div class="hbar' + c + '"><span>' + esc(r[0]) + '</span><div class="track"><div class="fill' + (gold ? ' gold' : '') + '" style="width:' + (r[1] / max * 100) + '%"></div></div><span class="n">' + fmt(r[1]) + ' <span style="color:var(--gray)">' + pct(r[1], sum) + '</span></span></div>';
    }).join('') || '<p class="empty">No data.</p>';
  }

  // ---------- client list modal ----------
  function list(title, sub, pred, sort) {
    var rows = R.filter(pred);
    rows.sort(sort === 'visits' ? function (a, b) { return (b.m + b.p) - (a.m + a.p) || a.n.localeCompare(b.n); } : function (a, b) { return a.n.localeCompare(b.n); });
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header><div><div class="kicker">Client list</div><h2>' + esc(title) + '</h2><p class="lede" style="margin:4px 0 0">' + esc(sub) + '</p></div><button class="x" aria-label="Close">Close</button></header>' +
      '<div class="body"><div class="controls"><input type="search" placeholder="Search name or email" style="flex:1;min-width:200px"><select class="ms"><option value="">All sites</option></select><button class="ghost csv">Download CSV</button></div>' +
      '<div class="card tablewrap" style="padding:0 6px"><table class="center"></table></div><p class="notes cnt"></p></div></div>';
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    var q = '', site = '';
    var sites = {}; rows.forEach(function (c) { c.s.forEach(function (s) { sites[s] = 1; }); });
    bg.querySelector('.ms').innerHTML += Object.keys(sites).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    function cur() { return rows.filter(function (c) { return (!site || c.s.indexOf(site) !== -1) && (!q || c.n.toLowerCase().indexOf(q) !== -1 || (c.e || '').indexOf(q) !== -1); }); }
    function draw() {
      var r = cur(), shown = r.slice(0, 1500);
      bg.querySelector('table').innerHTML = '<thead><tr><th>Name</th><th>Email</th><th>Program</th><th>Sites</th><th>MVFD</th><th>Pantry</th><th>Total</th><th>First visit</th><th>Last visit</th></tr></thead><tbody>' +
        shown.map(function (c) {
          var p = progOf(c), pill = '<span class="pill ' + p + '">' + (p === 'both' ? 'Both' : PROG[p]) + '</span>';
          return '<tr><td>' + esc(c.n) + '</td><td style="font-size:14px">' + (c.e ? esc(c.e) : '<span style="color:var(--gray)">none on file</span>') + '</td><td>' + pill + '</td><td>' + esc(c.s.join(', ')) + '</td><td class="mono">' + c.m + '</td><td class="mono">' + c.p + '</td><td class="mono"><b>' + (c.m + c.p) + '</b></td><td class="mono">' + niceDate(c.f) + '</td><td class="mono">' + niceDate(c.l) + '</td></tr>';
        }).join('') + '</tbody>';
      bg.querySelector('.cnt').textContent = fmt(r.length) + ' clients' + (r.length > 1500 ? ' (showing the first 1,500; search or download the CSV for all)' : '') + '.';
    }
    function close() { bg.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    bg.onclick = function (e) { if (e.target === bg) close(); };
    bg.querySelector('.x').onclick = close;
    bg.querySelector('input').oninput = function () { q = this.value.toLowerCase().trim(); draw(); };
    bg.querySelector('.ms').onchange = function () { site = this.value; draw(); };
    bg.querySelector('.csv').onclick = function () {
      var qq = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
      var csv = ['Name,Email,Program,Status,Sites,MVFD visits,Pantry visits,Total visits,First visit,Last visit'].concat(cur().map(function (c) {
        var p = progOf(c); return [qq(c.n), qq(c.e), p === 'both' ? 'Both' : PROG[p], qq(c.st), qq(c.s.join('; ')), c.m, c.p, c.m + c.p, c.f, c.l].join(',');
      })).join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = title.replace(/[^\w]+/g, '-').toLowerCase() + '-' + S.year + '.csv'; a.click();
    };
    draw();
    bg.querySelector('input').focus();
  }

  // ---------- month chart ----------
  function monthChart() {
    var M = S.months; if (!M.length) { $('monthChart').innerHTML = '<p class="empty">No sessions yet.</p>'; return; }
    var W = Math.max(560, Math.round($('monthChart').clientWidth || 1000)), H = 320, pl = 56, pr = 24, pt = 18, pb = 34;
    var max = Math.max.apply(null, M.map(function (m) { return Math.max(m.mvfdVisits, m.pantryVisits, m.newClients); }));
    var step = Math.pow(10, Math.floor(Math.log10(max || 1))); var top = Math.ceil(max / step) * step; if (top / step < 4) { step /= 2; top = Math.ceil(max / step) * step; }
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / top); };
    var bw = (W - pl - pr) / M.length;
    var g = '', pts = [];
    for (var v = 0; v <= top; v += step) g += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (pl - 10) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + '</text>';
    M.forEach(function (m, i) {
      var x0 = pl + i * bw, w = Math.min(30, bw * .3), gap = 4, cx = x0 + bw / 2;
      var tip = esc(m.month + ' ' + S.year) + '|First-time clients: ' + fmt(m.newClients) + '|MVFD: ' + fmt(m.mvfdVisits) + ' visits, ' + fmt(m.mvfdPounds) + ' lbs, ' + money(m.mvfdValue) + '|Pantry: ' + fmt(m.pantryVisits) + ' visits, ' + fmt(m.pantryPounds) + ' lbs, ' + money(m.pantryValue);
      g += '<g data-tip="' + tip + '"><rect x="' + x0 + '" y="' + pt + '" width="' + bw + '" height="' + (H - pt - pb) + '" fill="transparent"/>';
      g += '<rect x="' + (cx - w - gap / 2) + '" y="' + y(m.mvfdVisits) + '" width="' + w + '" height="' + (y(0) - y(m.mvfdVisits)) + '" rx="3" fill="var(--mvfd)"/>';
      g += '<rect x="' + (cx + gap / 2) + '" y="' + y(m.pantryVisits) + '" width="' + w + '" height="' + (y(0) - y(m.pantryVisits)) + '" rx="3" fill="var(--pantry)"/></g>';
      g += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle">' + m.month + '</text>';
      pts.push([cx, y(m.newClients)]);
    });
    g += '<polyline points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '" fill="none" stroke="var(--gold-deep)" stroke-width="2.5" stroke-linejoin="round" pointer-events="none"/>';
    g += pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="#fff" stroke="var(--gold-deep)" stroke-width="2.5" pointer-events="none"/>'; }).join('');
    $('monthChart').innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Visits and first-time clients by month">' + g + '</svg>';
    var tipEl = $('tip');
    $('monthChart').querySelectorAll('[data-tip]').forEach(function (n) {
      function show(e) { var p = e.touches ? e.touches[0] : e; tipEl.innerHTML = n.getAttribute('data-tip').split('|').map(function (l, i) { return i ? l : '<b>' + l + '</b>'; }).join('<br>'); tipEl.style.opacity = 1; tipEl.style.left = Math.min(p.clientX + 14, innerWidth - 270) + 'px'; tipEl.style.top = (p.clientY + 14) + 'px'; }
      n.addEventListener('mousemove', show); n.addEventListener('touchstart', show, { passive: true });
      n.addEventListener('mouseleave', function () { tipEl.style.opacity = 0; });
    });
  }

  // ---------- by site (alphabetical, centered) ----------
  function siteTable() {
    var R2 = S.sites.slice().sort(function (a, b) { return a.site.localeCompare(b.site); });
    var t = { ms: 0, ps: 0, mv: 0, pv: 0, lb: 0, v: 0 };
    var body = R2.map(function (r) {
      t.ms += r.mvfdSessions; t.ps += r.pantrySessions; t.mv += r.mvfdVisits; t.pv += r.pantryVisits; t.lb += r.pounds; t.v += r.value;
      return '<tr><td><a href="#" class="siteLink" data-s="' + esc(r.site) + '">' + esc(r.site) + '</a></td><td class="mono">' + fmt(r.mvfdSessions) + '</td><td class="mono">' + fmt(r.pantrySessions) + '</td><td class="mono">' + fmt(r.mvfdVisits) + '</td><td class="mono">' + fmt(r.pantryVisits) + '</td><td class="mono">' + fmt(r.clients) + '</td><td class="mono">' + fmt(r.pounds) + '</td><td class="mono">' + money(r.value) + '</td></tr>';
    }).join('');
    $('siteTable').innerHTML = '<thead><tr><th>Site</th><th>MVFD<br>sessions</th><th>Pantry<br>sessions</th><th>MVFD<br>visits</th><th>Pantry<br>visits</th><th>Unique<br>clients</th><th>Pounds</th><th>Food<br>value</th></tr></thead><tbody>' + body +
      '</tbody><tfoot><tr><td>All sites</td><td class="mono">' + fmt(t.ms) + '</td><td class="mono">' + fmt(t.ps) + '</td><td class="mono">' + fmt(t.mv) + '</td><td class="mono">' + fmt(t.pv) + '</td><td class="mono">' + fmt(S.totals.uniqueClients) + '</td><td class="mono">' + fmt(t.lb) + '</td><td class="mono">' + money(t.v) + '</td></tr></tfoot>';
    $('siteTable').querySelectorAll('.siteLink').forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); var s = a.dataset.s; list(s + ' clients', 'Everyone who attended an MVFD or pantry at ' + s + '.', function (c) { return c.s.indexOf(s) !== -1; }, 'visits'); };
    });
  }

  // ---------- sessions (centered, scrolling) ----------
  var sf = { prog: 'all', site: '', status: '' };
  function sessions() {
    var sites = S.sites.map(function (s) { return s.site; }).sort();
    $('sessSite').innerHTML = '<option value="">All sites</option>' + sites.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    seg('sessProg', function (v) { sf.prog = v; drawSessions(); });
    $('sessSite').onchange = function () { sf.site = this.value; drawSessions(); };
    $('sessStatus').onchange = function () { sf.status = this.value; drawSessions(); };
    drawSessions();
  }
  function drawSessions() {
    var rows = S.sessions.filter(function (s) { return (sf.prog === 'all' || s.program === sf.prog) && (!sf.site || s.site === sf.site) && (!sf.status || s.status === sf.status); });
    var t = { a: 0, n: 0, lb: 0, v: 0 };
    var body = rows.map(function (s, i) {
      t.a += s.attendees; t.n += s.newClients || 0; t.lb += s.pounds || 0; t.v += s.value || 0;
      var tag = s.status === 'pending' ? '<span class="pill pending">pending</span>' : s.status === 'zero' ? '<span class="pill zero">$0 / 0 lbs</span>' : '<span class="pill">reported</span>';
      var nc = s.newClients ? '<a href="#" class="newLink" data-i="' + i + '">' + fmt(s.newClients) + '</a>' : '0';
      return '<tr><td class="mono">' + niceDate(s.date) + '</td><td><span class="pill ' + s.program + '">' + PROG[s.program] + '</span></td><td>' + esc(s.site) + '</td><td class="mono">' + fmt(s.attendees) + '</td><td class="mono">' + nc + '</td><td class="mono">' + (s.pounds == null ? '-' : fmt(s.pounds)) + '</td><td class="mono">' + (s.value == null ? '-' : money(s.value)) + '</td><td>' + tag + '</td></tr>';
    }).join('');
    $('sessTable').innerHTML = '<thead><tr><th>Date</th><th>Program</th><th>Site</th><th>Attended</th><th>First-timers</th><th>Pounds</th><th>Food value</th><th>Status</th></tr></thead><tbody>' + (body || '<tr><td colspan="8" class="empty">Nothing matches.</td></tr>') +
      '</tbody><tfoot><tr><td>' + fmt(rows.length) + ' sessions</td><td></td><td></td><td class="mono">' + fmt(t.a) + '</td><td class="mono">' + fmt(t.n) + '</td><td class="mono">' + fmt(t.lb) + '</td><td class="mono">' + money(t.v) + '</td><td></td></tr></tfoot>';
    $('sessTable').querySelectorAll('.newLink').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault(); var s = rows[+a.dataset.i];
        list('First-timers: ' + PROG[s.program] + ' ' + s.site + ' ' + niceDate(s.date), 'Clients whose first visit of the year was this session.', function (c) { return c.f === s.date && c.fs === s.site && c.fp === s.program; });
      };
    });
  }
  function seg(id, cb) {
    var el = $(id);
    el.querySelectorAll('button').forEach(function (b) { b.onclick = function () { el.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); cb(b.dataset.v); }; });
  }

  // ---------- client status with site filter ----------
  function statusPanel() {
    var sites = {}; R.forEach(function (c) { c.s.forEach(function (s) { sites[s] = 1; }); });
    $('statusSite').innerHTML = '<option value="">All sites</option>' + Object.keys(sites).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    $('statusSite').onchange = drawStatus;
    drawStatus();
  }
  function drawStatus() {
    var site = $('statusSite').value, counts = {}, n = 0;
    R.forEach(function (c) { if (site && c.s.indexOf(site) === -1) return; var st = c.st || 'Not listed'; counts[st] = (counts[st] || 0) + 1; n++; });
    var rows = Object.keys(counts).map(function (k) { return [k, counts[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    $('statusLede').textContent = 'Most recent status on file for each unique client' + (site ? ' who attended at ' + site : '') + ' (' + fmt(n) + ' clients).';
    $('status').innerHTML = hbars(rows);
  }

  function households() {
    var D = S.demographics;
    if (!D) { $('hh').innerHTML = '<p class="empty">Load the Stats reports to see households.</p>'; $('eth').innerHTML = $('race').innerHTML = '<p class="empty">No data.</p>'; return; }
    var counted = D.households - D.flagged;
    $('hhLede').innerHTML = 'From the ' + (D.sources && D.sources.length > 1 ? 'MVFD Stats and Pantry Client Stats reports' : D.sources && D.sources[0] === 'pantryStats' ? 'Pantry Client Stats report' : 'MVFD Stats report') + ', one household per client (latest record). <b class="mono">' + fmt(D.households) + '</b> households; people totals use the <b class="mono">' + fmt(counted) + '</b> with a clean household count.';
    $('hh').innerHTML =
      '<div class="grid g2" style="margin-bottom:14px"><div><div class="kicker">People in those homes</div><div class="mono" style="font-size:28px;font-weight:600">' + fmt(D.individuals) + '</div></div>' +
      '<div><div class="kicker">Avg household</div><div class="mono" style="font-size:28px;font-weight:600">' + (counted ? (D.individuals / counted).toFixed(1) : '-') + '</div></div></div>' +
      hbars([['Children 0-17', D.age0_17], ['Adults 18-59', D.age18_59], ['Seniors 60+', D.age60]], true) + '<div style="height:10px"></div>' +
      hbars([['Female', D.female], ['Male', D.male]]) + '<div style="height:10px"></div>' +
      hbars([['Veterans', D.veterans], ['Retired military', D.retired], ['Active duty', D.active], ['Guard/Reserve', D.guard]]);
    var ob = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); };
    $('eth').innerHTML = hbars(ob(D.ethnicity), true);
    $('race').innerHTML = hbars(ob(D.race));
  }

  function community() {
    var C = S.community;
    if (!C) { $('csKpis').innerHTML = '<div class="card empty" style="grid-column:1/-1">Load the Community Support report to fill this in.</div>'; return; }
    $('csLede').textContent = 'Numbers reported by hand each month by site coordinators and reps (' + C.entries + ' entries this year).';
    var cols = C.columns.filter(function (c) { return C.totals[c] > 0; });
    $('csKpis').innerHTML = cols.slice().sort(function (a, b) { return C.totals[b] - C.totals[a]; }).map(function (c) {
      return '<div class="card kpi"><div class="label">' + esc(c) + '</div><div class="value">' + fmt(C.totals[c]) + '</div></div>';
    }).join('');
    // categories down the side, months across the top, so it fits without sideways scrolling
    var order = cols.slice().sort(function (a, b) { return C.totals[b] - C.totals[a]; });
    $('csTable').innerHTML = '<thead><tr><th>Category</th>' + C.byMonth.map(function (m) { return '<th>' + m.month + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>' +
      order.map(function (c) { return '<tr><td>' + esc(c) + '</td>' + C.byMonth.map(function (m) { return '<td class="mono">' + fmt(m[c] || 0) + '</td>'; }).join('') + '<td class="mono"><b>' + fmt(C.totals[c]) + '</b></td></tr>'; }).join('') + '</tbody>';
  }

  function notes() {
    $('quality').innerHTML = (S.quality.length ? S.quality : ['No issues found in this load.']).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('');
    var src = S.sources, L = [];
    if (src.mvfdValue && src.mvfdValue.lastSession) L.push('MVFD pounds/value run through ' + niceDate(src.mvfdValue.lastSession) + '.');
    if (src.pantryValue && src.pantryValue.lastSession) L.push('Pantry pounds/value run through ' + niceDate(src.pantryValue.lastSession) + '.');
    L.push('Clients are matched across reports by full name, and counted as a first-timer at the first session they attended this year. Household sizes over ' + S.householdCap + ' are treated as entry errors.');
    $('sources').textContent = L.join(' ');
  }
})();
