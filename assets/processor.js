/* The Great Hall - report processor
 * Shared by the browser (kitchens.html) and Node (scripts/build.js).
 * Input: rows from each Salesforce export (arrays of arrays, header row included).
 * Output: { summary, roster } where summary is public-safe aggregates and roster holds names (encrypt before publishing).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GreatHall = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ---------- small helpers ----------
  function low(s) { return String(s == null ? '' : s).replace(/ /g, ' ').trim().toLowerCase(); }
  function clean(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : null;
  }
  function nameKey(s) { return low(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' '); }
  function round2(n) { return Math.round((n || 0) * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  // Pull a date out of "MVFD Jane Doe - 03/19/2026 - Atlanta", "1/9/2026: 2026 Monthly Denver", or "... - 2026-03-19 - Atlanta"
  function findDate(s) {
    s = String(s || '');
    var m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return iso(+m[3], +m[1], +m[2]);
    m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    return null;
  }

  // Find the header row (Salesforce sometimes adds title rows) by looking for any of the keywords
  function headerIndex(rows, keywords) {
    for (var i = 0; i < Math.min(rows.length, 20); i++) {
      var joined = (rows[i] || []).map(low).join('|');
      for (var k = 0; k < keywords.length; k++) if (joined.indexOf(keywords[k]) !== -1) return i;
    }
    return 0;
  }
  // Column finder: first header that contains ALL words in one of the patterns
  function col(headers, patterns, exclude) {
    var H = headers.map(low);
    for (var p = 0; p < patterns.length; p++) {
      var words = patterns[p].split('+');
      for (var i = 0; i < H.length; i++) {
        if (exclude && exclude.some(function (x) { return H[i].indexOf(x) !== -1; })) continue;
        if (words.every(function (w) { return H[i].indexOf(w) !== -1; })) return i;
      }
    }
    return -1;
  }
  function table(rows, keywords) {
    var h = headerIndex(rows, keywords);
    var headers = (rows[h] || []).map(clean);
    var body = rows.slice(h + 1).filter(function (r) { return r && r.some(function (c) { return c !== null && c !== undefined && String(c).trim() !== ''; }); });
    return { headers: headers, rows: body };
  }

  // ---------- report detection ----------
  function detect(fileName, rows) {
    var f = low(fileName);
    var t = table(rows, ['full name', 'total food value', 'critical assistance', 'month']);
    var H = t.headers.map(low).join('|');
    if (H.indexOf('critical assistance') !== -1) return 'community';
    if (f.indexOf('stats') !== -1 && H.indexOf('full name') !== -1) return f.indexOf('pantry') !== -1 ? 'pantryStats' : 'stats';
    if (H.indexOf('total # household females') !== -1 || H.indexOf('program engagement') !== -1) return f.indexOf('pantry') !== -1 ? 'pantryStats' : 'stats';
    if (H.indexOf('total food value') !== -1 || H.indexOf('pounds of food') !== -1) return f.indexOf('pantry') !== -1 ? 'pantryValue' : 'mvfdValue';
    if (H.indexOf('full name') !== -1 && H.indexOf('service delivery') !== -1) {
      if (f.indexOf('pantry') !== -1) return 'pantryAttended';
      if (f.indexOf('mvfd') !== -1 || f.indexOf('distribution') !== -1) return 'mvfdAttended';
      return H.indexOf('total # household') !== -1 ? 'mvfdAttended' : 'pantryAttended';
    }
    if (f.indexOf('kind') !== -1) return 'inKind';
    return null;
  }

  var SLOTS = [
    { key: 'pantryValue',    label: 'Pantry Total Value Pounds', hint: 'Pantry Total Value Pounds' },
    { key: 'mvfdValue',      label: 'MVFD Value Pounds',         hint: 'MVFD Value Pounds' },
    { key: 'pantryAttended', label: 'Pantry Attended Clients',   hint: 'Pantry Attended Clients' },
    { key: 'mvfdAttended',   label: 'MVFD Attended Clients',     hint: 'MVFD Attended Clients' },
    { key: 'stats',          label: 'MVFD Stats',                hint: 'MVFD Stats' },
    { key: 'pantryStats',    label: 'Pantry Client Stats',       hint: 'Pantry Attended Client Stats' },
    { key: 'community',      label: 'Community Support',         hint: 'Community Support' },
    { key: 'inKind',         label: 'In-Kind (optional)',        hint: 'Any report with an in-kind value column' }
  ];

  // ---------- main ----------
  // reports: { key: { name: fileName, rows: [[...], ...] } }
  // opts: { year, householdCap, inKindManual }
  function build(reports, opts) {
    opts = opts || {};
    // Year: a number in config.js pins it; 'auto' (or blank) uses the year of the newest session in the Attended reports,
    // so 2027 reports roll the dashboard to 2027 on their own, and late 2026 reports run in January still count as 2026.
    var YEAR = +opts.year || autoYear(reports) || new Date().getFullYear();
    var CAP = +opts.householdCap || 20;
    var quality = [];
    var sources = {};
    function inYear(d) { return d && +d.slice(0, 4) === YEAR; }

    // ---- attendance (who came, when, where) ----
    var clients = {};        // key -> client
    var sessions = {};       // program|site|date -> session
    var noDate = 0, dupes = 0, outOfYear = 0;

    function sessionFor(program, site, date) {
      var k = program + '|' + site + '|' + date;
      if (!sessions[k]) sessions[k] = { program: program, site: site, date: date, attendees: 0, newClients: 0, pounds: null, value: null, valueRows: 0 };
      return sessions[k];
    }

    function readAttended(key, program) {
      var r = reports[key]; if (!r) { quality.push('Missing report: ' + slotLabel(key) + '.'); return; }
      var t = table(r.rows, ['full name']);
      var cName = col(t.headers, ['full name', 'name']);
      var cStatus = col(t.headers, ['client status', 'status']);
      var cDel = col(t.headers, ['service delivery name', 'service delivery']);
      var cSite = col(t.headers, ['service: service name', 'service name', 'site']);
      var cHH = col(t.headers, ['total # household'], ['females', 'males', 'aged', 'military', 'veterans']);
      var cEmail = col(t.headers, ['email']);
      var seen = {};
      var used = 0;
      t.rows.forEach(function (row) {
        var name = clean(row[cName]); if (!name) return;
        var del = clean(row[cDel]);
        var date = findDate(del);
        if (!date) { noDate++; return; }
        if (!inYear(date)) { outOfYear++; return; }
        var site = clean(row[cSite]) || 'Unknown';
        var k = nameKey(name);
        var sk = k + '|' + program + '|' + site + '|' + date;
        if (seen[sk]) { dupes++; return; }
        seen[sk] = 1; used++;
        var here = program + '|' + site + '|' + date;
        var c = clients[k] || (clients[k] = { names: {}, emails: {}, status: null, statusDate: '', sites: {}, mvfd: 0, pantry: 0, first: date, firstSess: here, last: date, hh: null });
        c.names[name] = (c.names[name] || 0) + 1;
        var em = cEmail >= 0 ? clean(row[cEmail]).toLowerCase() : '';
        if (em && em.indexOf('@') > 0) c.emails[em] = 1;
        c[program]++;
        c.sites[site] = 1;
        if (date < c.first) { c.first = date; c.firstSess = here; }
        if (date > c.last) c.last = date;
        var st = cStatus >= 0 ? clean(row[cStatus]) : '';
        if (st && date >= c.statusDate) { c.status = st; c.statusDate = date; }
        var hh = cHH >= 0 ? num(row[cHH]) : null;
        if (hh && hh > 0 && hh <= CAP) c.hh = hh;
        sessionFor(program, site, date).attendees++;
      });
      sources[key] = { file: r.name, rows: t.rows.length, used: used };
    }
    readAttended('mvfdAttended', 'mvfd');
    readAttended('pantryAttended', 'pantry');
    if (noDate) quality.push(noDate + ' attendance rows had no date in the Service Delivery Name and were skipped.');
    if (dupes) quality.push(dupes + ' duplicate attendance rows (same client, same session) were counted once.');
    if (outOfYear) quality.push(outOfYear + ' attendance rows were outside ' + YEAR + ' and left out.');

    var knownSites = {};
    Object.keys(sessions).forEach(function (k) { knownSites[sessions[k].site] = 1; });

    // ---- pounds + value (session totals repeat on every attendee row) ----
    function siteFromSession(name) {
      var s = clean(name).replace(/^[^:]*:\s*/, '').replace(/^\d{4}\s+/, '').replace(/^(monthly|pantry|mvfd|food distribution)\s+/i, '');
      var best = null;
      Object.keys(knownSites).forEach(function (site) {
        var a = low(site), b = low(s);
        if (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0) { if (!best || site.length > best.length) best = site; }
      });
      return best || s || 'Unknown';
    }
    function readValue(key, fallbackProgram) {
      var r = reports[key]; if (!r) { quality.push('Missing report: ' + slotLabel(key) + '.'); return; }
      var t = table(r.rows, ['total food value', 'pounds']);
      var cVal = col(t.headers, ['total food value', 'food value', 'value']);
      var cLbs = col(t.headers, ['pounds']);
      var cSess = col(t.headers, ['service session name', 'session name']);
      var cSite = col(t.headers, ['service'], ['session']);
      var seen = {};
      var lastDate = '';
      t.rows.forEach(function (row) {
        var sname = clean(row[cSess]);
        var date = findDate(sname);
        if (!date || !inYear(date)) return;
        var program = /pantry/i.test(sname) ? 'pantry' : (/monthly|mvfd|distribution/i.test(sname) ? 'mvfd' : fallbackProgram);
        var site = cSite >= 0 && clean(row[cSite]) ? clean(row[cSite]) : siteFromSession(sname);
        var s = sessionFor(program, site, date);
        s.valueRows++;
        var k = program + '|' + site + '|' + date;
        if (seen[k]) return;
        seen[k] = 1;
        s.value = round2(num(row[cVal]) || 0);
        s.pounds = round2(num(row[cLbs]) || 0);
        if (date > lastDate) lastDate = date;
      });
      sources[key] = { file: r.name, rows: t.rows.length, sessions: Object.keys(seen).length, lastSession: lastDate };
    }
    readValue('mvfdValue', 'mvfd');
    readValue('pantryValue', 'pantry');

    // ---- sessions list + totals ----
    var sessList = Object.keys(sessions).map(function (k) { return sessions[k]; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.site.localeCompare(b.site); });

    var T = { mvfd: { sessions: 0, visits: 0, pounds: 0, value: 0, pending: 0, zero: 0 }, pantry: { sessions: 0, visits: 0, pounds: 0, value: 0, pending: 0, zero: 0 } };
    sessList.forEach(function (s) {
      if (!s.attendees && s.valueRows) s.attendees = s.valueRows; // only in a value report: use its row count
      var t = T[s.program];
      t.sessions++;
      t.visits += s.attendees;
      if (s.value == null) { t.pending++; s.status = 'pending'; }
      else {
        t.pounds += s.pounds; t.value += s.value;
        s.status = (s.pounds === 0 && s.value === 0) ? 'zero' : 'reported';
        if (s.status === 'zero') t.zero++;
      }
    });
    if (T.mvfd.pending) quality.push(T.mvfd.pending + ' MVFD sessions have attendance but no pounds/value yet in the MVFD Value Pounds report.');
    if (T.pantry.pending) quality.push(T.pantry.pending + ' pantry sessions have attendance but no pounds/value yet in the Pantry Total Value Pounds report.');
    if (T.mvfd.zero + T.pantry.zero) quality.push((T.mvfd.zero + T.pantry.zero) + ' sessions show $0 and 0 lbs in Salesforce (likely not entered yet).');

    // ---- clients ----
    var keys = Object.keys(clients);
    var overlap = { both: 0, mvfdOnly: 0, pantryOnly: 0 };
    var freqB = [['1 visit', 1, 1], ['2-3 visits', 2, 3], ['4-6 visits', 4, 6], ['7-9 visits', 7, 9], ['10+ visits', 10, 1e9]];
    var freq = freqB.map(function (b) { return { bucket: b[0], count: 0 }; });
    var status = {};
    var roster = [];
    keys.forEach(function (k) {
      var c = clients[k];
      if (c.mvfd && c.pantry) overlap.both++; else if (c.mvfd) overlap.mvfdOnly++; else overlap.pantryOnly++;
      var total = c.mvfd + c.pantry;
      for (var i = 0; i < freqB.length; i++) if (total >= freqB[i][1] && total <= freqB[i][2]) { freq[i].count++; break; }
      var st = c.status || 'Not listed';
      status[st] = (status[st] || 0) + 1;
      var display = Object.keys(c.names).sort(function (a, b) { return c.names[b] - c.names[a]; })[0];
      if (sessions[c.firstSess]) sessions[c.firstSess].newClients++;
      roster.push({ n: display, e: Object.keys(c.emails).join('; '), st: c.status || '', s: Object.keys(c.sites).sort(), m: c.mvfd, p: c.pantry, f: c.first, fp: c.firstSess.split('|')[0], fs: c.firstSess.split('|')[1], l: c.last, h: c.hh });
    });
    roster.sort(function (a, b) { return (b.m + b.p) - (a.m + a.p) || a.n.localeCompare(b.n); });

    // ---- by site ----
    var sites = {};
    function siteRow(s) { return sites[s] || (sites[s] = { site: s, mvfdSessions: 0, pantrySessions: 0, mvfdVisits: 0, pantryVisits: 0, clients: 0, pounds: 0, value: 0 }); }
    sessList.forEach(function (s) {
      var r = siteRow(s.site);
      r[s.program + 'Sessions']++; r[s.program + 'Visits'] += s.attendees;
      if (s.value != null) { r.pounds += s.pounds; r.value += s.value; }
    });
    keys.forEach(function (k) { Object.keys(clients[k].sites).forEach(function (s) { siteRow(s).clients++; }); });
    var siteList = Object.keys(sites).map(function (k) { var r = sites[k]; r.pounds = round2(r.pounds); r.value = round2(r.value); return r; })
      .sort(function (a, b) { return (b.mvfdVisits + b.pantryVisits) - (a.mvfdVisits + a.pantryVisits); });

    // ---- by month ----
    var months = [];
    for (var mi = 0; mi < 12; mi++) months.push({ month: MONTHS[mi].slice(0, 3), newClients: 0, mvfdVisits: 0, pantryVisits: 0, mvfdPounds: 0, pantryPounds: 0, mvfdValue: 0, pantryValue: 0 });
    sessList.forEach(function (s) {
      var m = months[+s.date.slice(5, 7) - 1];
      m[s.program + 'Visits'] += s.attendees;
      m.newClients += s.newClients;
      if (s.value != null) { m[s.program + 'Pounds'] += s.pounds; m[s.program + 'Value'] += s.value; }
    });
    var lastMonth = 0;
    months.forEach(function (m, i) { if (m.mvfdVisits || m.pantryVisits) lastMonth = i; ['mvfdPounds','pantryPounds','mvfdValue','pantryValue'].forEach(function (f) { m[f] = round2(m[f]); }); });
    months = months.slice(0, lastMonth + 1);

    // ---- demographics (MVFD Stats + Pantry Client Stats: one household per client, latest record in the year) ----
    var demo = null;
    var statKeys = ['stats', 'pantryStats'].filter(function (k) { return reports[k]; });
    if (!reports.stats) quality.push('Missing report: MVFD Stats (household and demographic breakdown).');
    if (!reports.pantryStats) quality.push('Missing report: Pantry Attended Client Stats (pantry household breakdown).');
    if (statKeys.length) {
      var latest = {};
      statKeys.forEach(function (key) {
        var rs = reports[key];
        var t = table(rs.rows, ['full name']);
        var H = t.headers;
        var f = {
          name: col(H, ['full name']), del: col(H, ['service delivery name']),
          hh: col(H, ['total # household'], ['females', 'males', 'aged', 'military', 'veterans']),
          female: col(H, ['household+females']), male: col(H, ['household+males'], ['females']),
          a017: col(H, ['aged 0-17', '0-17']), a1859: col(H, ['aged 18-59', '18-59']), a60: col(H, ['aged 60', '60+']),
          active: col(H, ['active military']), guard: col(H, ['guard']), retired: col(H, ['retired']), vets: col(H, ['household veterans', 'veterans']),
          eth: col(H, ['ethnicity']), race: col(H, ['race']), state: col(H, ['state'])
        };
        var used = 0;
        t.rows.forEach(function (row) {
          var name = clean(row[f.name]); if (!name) return;
          var date = findDate(row[f.del]);
          if (!date || !inYear(date)) return;
          used++;
          var k = nameKey(name);
          if (!latest[k] || date >= latest[k].date) latest[k] = { date: date, row: row, f: f };
        });
        sources[key] = { file: rs.name, rows: t.rows.length, used: used };
      });
      var D = { households: 0, individuals: 0, female: 0, male: 0, age0_17: 0, age18_59: 0, age60: 0, active: 0, guard: 0, retired: 0, veterans: 0, flagged: 0, ethnicity: {}, race: {}, state: {} };
      var flaggedNames = 0;
      Object.keys(latest).forEach(function (k) {
        var row = latest[k].row, f = latest[k].f;
        D.households++;
        var hh = num(row[f.hh]);
        var parts = ['female','male','age0_17','age18_59','age60','active','guard','retired','veterans'];
        var src = [f.female, f.male, f.a017, f.a1859, f.a60, f.active, f.guard, f.retired, f.vets];
        var vals = src.map(function (c) { return c >= 0 ? (num(row[c]) || 0) : 0; });
        var bad = !(hh > 0) || hh > CAP || vals.some(function (v) { return v < 0 || v > CAP; });
        if (bad) { D.flagged++; }
        else {
          D.individuals += hh;
          parts.forEach(function (p, i) { D[p] += vals[i]; });
        }
        var e = (f.eth >= 0 && clean(row[f.eth])) || 'Not listed'; D.ethnicity[e] = (D.ethnicity[e] || 0) + 1;
        var r = (f.race >= 0 && clean(row[f.race])) || 'Not listed'; D.race[r] = (D.race[r] || 0) + 1;
        if (f.state >= 0) { var s = clean(row[f.state]).toUpperCase() || 'Not listed'; D.state[s] = (D.state[s] || 0) + 1; }
        if (!clients[k]) flaggedNames++;
      });
      if (D.flagged) quality.push(D.flagged + ' households in the Stats reports have a blank or impossible household count (over ' + CAP + ' people) and were left out of the people totals. Worth fixing in Salesforce.');
      if (flaggedNames) quality.push(flaggedNames + ' Stats report clients did not match anyone in the Attended reports (name spelled differently or not on those reports).');
      D.sources = statKeys;
      demo = D;
    }

    // ---- community support (manual monthly entries) ----
    var community = null;
    var rc = reports.community;
    if (!rc) quality.push('Missing report: Community Support.');
    else {
      var tc = table(rc.rows, ['critical assistance', 'month']);
      var HC = tc.headers;
      var cMonth = col(HC, ['month']), cSiteC = col(HC, ['site location', 'site']);
      var metricCols = [];
      HC.forEach(function (h, i) {
        var l = low(h);
        if (i === cMonth || l === 'year' || l.indexOf('did you') === 0 || l === 'notes') return;
        var numeric = 0, filled = 0;
        tc.rows.forEach(function (r) { var v = r[i]; if (v !== null && v !== undefined && String(v).trim() !== '') { filled++; if (num(v) !== null) numeric++; } });
        if (filled && numeric / filled > 0.8) metricCols.push({ i: i, label: niceLabel(h) });
      });
      var cTot = {}, cMon = {}, cSite = {};
      metricCols.forEach(function (m) { cTot[m.label] = 0; });
      tc.rows.forEach(function (r) {
        var mon = clean(r[cMonth]); var site = clean(r[cSiteC]).replace(/^Soldiers'? ?Angels\s*-\s*/i, '') || 'Unknown';
        metricCols.forEach(function (m) {
          var v = num(r[m.i]) || 0;
          cTot[m.label] += v;
          (cMon[mon] = cMon[mon] || {})[m.label] = ((cMon[mon] || {})[m.label] || 0) + v;
          (cSite[site] = cSite[site] || {})[m.label] = ((cSite[site] || {})[m.label] || 0) + v;
        });
      });
      community = {
        columns: metricCols.map(function (m) { return m.label; }),
        totals: cTot,
        entries: tc.rows.length,
        byMonth: MONTHS.filter(function (m) { return cMon[m]; }).map(function (m) { return Object.assign({ month: m.slice(0, 3) }, cMon[m]); }),
        bySite: Object.keys(cSite).sort().map(function (s) { return Object.assign({ site: s }, cSite[s]); })
      };
      sources.community = { file: rc.name, rows: tc.rows.length };
    }

    // ---- in-kind (slot for a future report, or a manual number) ----
    var inKind = { total: null, source: null };
    var rk = reports.inKind;
    if (rk) {
      var tk = table(rk.rows, ['in-kind', 'inkind', 'in kind', 'value', 'amount']);
      var cK = col(tk.headers, ['in-kind+value', 'inkind', 'in kind', 'in-kind', 'fair market', 'amount', 'value']);
      if (cK >= 0) {
        var sum = 0; tk.rows.forEach(function (r) { sum += num(r[cK]) || 0; });
        inKind = { total: round2(sum), source: tk.headers[cK] + ' (' + rk.name + ')' };
        sources.inKind = { file: rk.name, rows: tk.rows.length, column: tk.headers[cK] };
      } else quality.push('In-kind report loaded, but no in-kind/value/amount column was found.');
    } else if (num(opts.inKindManual) != null) {
      inKind = { total: round2(num(opts.inKindManual)), source: 'Entered by hand in the Kitchens' };
    }

    var summary = {
      generatedAt: new Date().toISOString(),
      year: YEAR,
      householdCap: CAP,
      totals: {
        uniqueClients: keys.length,
        mvfdClients: overlap.both + overlap.mvfdOnly,
        pantryClients: overlap.both + overlap.pantryOnly,
        bothClients: overlap.both,
        mvfdVisits: T.mvfd.visits, pantryVisits: T.pantry.visits, totalVisits: T.mvfd.visits + T.pantry.visits,
        mvfdSessions: T.mvfd.sessions, pantrySessions: T.pantry.sessions,
        mvfdPounds: round2(T.mvfd.pounds), pantryPounds: round2(T.pantry.pounds), pounds: round2(T.mvfd.pounds + T.pantry.pounds),
        mvfdValue: round2(T.mvfd.value), pantryValue: round2(T.pantry.value), value: round2(T.mvfd.value + T.pantry.value),
        pendingSessions: T.mvfd.pending + T.pantry.pending,
        inKind: inKind.total, inKindSource: inKind.source
      },
      overlap: overlap,
      frequency: freq,
      status: Object.keys(status).map(function (s) { return { status: s, count: status[s] }; }).sort(function (a, b) { return b.count - a.count; }),
      sites: siteList,
      months: months,
      sessions: sessList.map(function (s) { return { program: s.program, site: s.site, date: s.date, attendees: s.attendees, newClients: s.newClients, pounds: s.pounds, value: s.value, status: s.status }; }),
      demographics: demo,
      community: community,
      sources: sources,
      quality: quality
    };
    return { summary: summary, roster: roster };
  }

  function autoYear(reports) {
    var best = '';
    ['mvfdAttended', 'pantryAttended'].forEach(function (key) {
      var r = reports[key]; if (!r) return;
      var t = table(r.rows, ['full name']);
      var c = col(t.headers, ['service delivery name', 'service delivery']);
      if (c < 0) return;
      t.rows.forEach(function (row) { var d = findDate(row[c]); if (d && d > best) best = d; });
    });
    return best ? +best.slice(0, 4) : null;
  }

  // Friendlier names for the Community Support columns
  function niceLabel(h) {
    var l = clean(h).replace(/^z(?=[A-Z])/, '').replace(/^Critical Assistance - /i, '');
    var map = { 'items distributed': 'Other Items Distributed', 'other transp': 'Other Transportation', 'canteen gift card': 'Canteen Gift Cards' };
    if (map[l.toLowerCase()]) return map[l.toLowerCase()];
    return l.split(' ').map(function (w, i) { return (i && /^(and|of|or|the|for)$/i.test(w)) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  function slotLabel(key) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].key === key) return SLOTS[i].label; return key; }

  // ---------- crypto (AES-256-GCM, PBKDF2-SHA256) ----------
  function subtle() { return (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : require('crypto').webcrypto; }
  function b64(buf) {
    var bytes = new Uint8Array(buf);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s);
  }
  function unb64(str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    var s = atob(str), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
  }
  var ITER = 250000;
  async function deriveKey(pass, salt, iter) {
    var c = subtle();
    var base = await c.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return c.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, pass) {
    var c = subtle();
    var salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(pass, salt, ITER);
    var ct = await c.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct), sealedAt: new Date().toISOString() };
  }
  async function unseal(box, pass) {
    var c = subtle();
    var key = await deriveKey(pass, unb64(box.salt), box.iter || ITER);
    var pt = await c.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  return { build: build, detect: detect, SLOTS: SLOTS, seal: seal, unseal: unseal, findDate: findDate };
});
