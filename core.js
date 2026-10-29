/* ============================================================
   Shared core: helpers, view definitions, exports, crypto.
   Loaded by both the builder (build.html) and the viewer (index.html).
   ============================================================ */

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
  editable: false,         // only the builder lets you change a row's bucket
  overlay: null,           // Volunteer Services notes and box requests, see below
  whoami: '',              // the name stamped on a note
  vsEdit: false,           // this browser holds the Volunteer Services key
  canApprove: false        // this browser has cleared the admin password
};

/* ---------- Volunteer Services overlay ----------

   Everything Volunteer Services types lives in its own file, separate from the
   published list. That separation is the whole point, not a detail:

     data/latest.enc     the month's report. Written ONLY by the builder,
                         behind the admin password. Volunteer Services has
                         no code path that touches it.
     data/requests.enc   notes, contact method, and box requests. Written
                         ONLY here. If it is missing, stale, or corrupt, the
                         staff page shows the report exactly as it would have
                         without it.

   So a mistake on the Volunteer Services side can cost at most the notes, and
   never the report. Nothing is ever deleted either: notes append, and an
   approval records a decision beside the request rather than replacing it. */
const OVERLAY_PATH = 'data/requests.enc';
/* Who signs off on a box request. Whoever holds the admin password is acting
   in this role, so it is the role that gets recorded against the decision. */
const APPROVER_ROLE = 'Director of Virtual Services';

/* A request has two halves: what Volunteer Services recommends, and what the
   Director decides. Keeping them apart means the record shows both, including
   the times the Director went the other way. */
const REQ = { PENDING:'pending', DECIDED:'decided' };
const WANT = { SEND:'send', NOSEND:'nosend' };
const WANT_LABEL  = { send:'Send a box', nosend:'Do not send a box' };
const WANT_SHORT  = { send:'Box requested', nosend:'Asked to skip' };
const OUT_LABEL   = { send:'Approved, on Logistics', nosend:'Agreed, no box' };

function monthKeyNow(){
  return state.month ? state.month.y + '-' + String(state.month.m + 1).padStart(2, '0') : '';
}
function emptyOverlay(){
  return { v:1, monthKey: monthKeyNow(), updated: new Date().toISOString(), entries:{} };
}
function rowId(r){ return String(r.clientId == null ? '' : r.clientId).trim(); }

/* Hang the overlay onto the rows so every view can read it without a lookup.
   A overlay from a previous month is ignored rather than merged, so last
   month's outreach notes never reappear against this month's list. */
function applyOverlay(){
  state.rows.forEach(r => { r.vs = null; r.req = null; });
  const o = state.overlay;
  if (!o || !o.entries) return;
  if (o.monthKey && monthKeyNow() && o.monthKey !== monthKeyNow()) return;
  state.rows.forEach(r => {
    const e = o.entries[rowId(r)];
    if (!e) return;
    r.vs = e;
    r.req = normaliseReq(e.req);
    e.req = r.req;
  });
}
/* Requests written before the recommendation had two directions carried a bare
   state. Read them as a request for a box, which is what they meant. */
function normaliseReq(q){
  if (!q) return null;
  if (q.want || q.outcome) return q;
  if (q.state === 'approved') return Object.assign({}, q, { want:WANT.SEND, state:REQ.DECIDED, outcome:WANT.SEND });
  if (q.state === 'declined') return Object.assign({}, q, { want:WANT.SEND, state:REQ.DECIDED, outcome:WANT.NOSEND });
  return Object.assign({}, q, { want:WANT.SEND, state:REQ.PENDING });
}
function overlayEntry(r, make){
  if (!state.overlay) return null;
  const id = rowId(r);
  if (!id) return null;
  if (!state.overlay.entries[id] && make)
    state.overlay.entries[id] = { contact:'', who:'', contactAt:'', notes:[], req:null };
  const e = state.overlay.entries[id] || null;
  if (e){ r.vs = e; r.req = e.req || null; }
  return e;
}
function pendingBox(r){ return !!(r.req && r.req.state === REQ.PENDING); }
function decidedBox(r){ return !!(r.req && r.req.state === REQ.DECIDED); }
function outcomeSend(r){ return decidedBox(r) && r.req.outcome === WANT.SEND; }
function outcomeNoSend(r){ return decidedBox(r) && r.req.outcome === WANT.NOSEND; }
/* The Director went against what was recommended. Worth showing, because
   Volunteer Services should not have to wonder what happened to their ask. */
function overruled(r){ return decidedBox(r) && r.req.want && r.req.outcome !== r.req.want; }

/* Two people can have the list open at once. Rather than let the second save
   wipe the first, the remote file is re-read and merged entry by entry: notes
   are unioned, and a decision always beats the request it answered. */
function mergeOverlays(a, b){
  a = a || emptyOverlay(); b = b || emptyOverlay();
  const out = { v:1, monthKey: b.monthKey || a.monthKey, updated: new Date().toISOString(), entries:{} };
  const ids = {};
  Object.keys(a.entries || {}).forEach(k => ids[k] = 1);
  Object.keys(b.entries || {}).forEach(k => ids[k] = 1);
  Object.keys(ids).forEach(id => {
    const x = (a.entries || {})[id] || {}, y = (b.entries || {})[id] || {};
    const notes = [], seen = {};
    (x.notes || []).concat(y.notes || []).forEach(n => {
      const k = String(n.at) + '|' + String(n.t);
      if (!seen[k]){ seen[k] = 1; notes.push(n); }
    });
    notes.sort((m, n) => String(m.at).localeCompare(String(n.at)));
    const yNewer = String(y.contactAt || '') >= String(x.contactAt || '');
    let req = null;
    const rx = x.req, ry = y.req;
    if (rx && ry){
      const dx = String(rx.decidedAt || ''), dy = String(ry.decidedAt || '');
      req = dy > dx ? ry : dx > dy ? rx : (String(ry.at || '') >= String(rx.at || '') ? ry : rx);
    } else req = ry || rx || null;
    out.entries[id] = {
      contact:   yNewer ? (y.contact || x.contact || '') : (x.contact || y.contact || ''),
      who:       yNewer ? (y.who || x.who || '')         : (x.who || y.who || ''),
      contactAt: yNewer ? (y.contactAt || x.contactAt || '') : (x.contactAt || ''),
      notes: notes,
      req: req
    };
  });
  return out;
}

/* ---------- overrides ----------
   The flags are the tool's best guess. When you know better, your decision
   wins and travels with the published file so Logistics can see a human
   cleared it rather than wondering why a flagged row is on their list. */
const DECISIONS = [
  ['',         'No change'],
  ['cleared',  'Cleared, send box'],
  ['hold',     'Hold, do not ship'],
  ['angel',    'Move to Volunteer Services'],
  ['waitlist', 'Move to Waitlisted'],
  ['passedmsd','Passed MSD, do not count'],
  ['exclude',  'Do not count, not a real member']
];
/* Decisions that take a member out of every number. Kept as a list so the
   reason stays visible on the row while the effect is the same. */
const NOT_COUNTED = ['exclude', 'passedmsd'];
const DECISION_LABEL = {
  cleared:'Cleared by VS', hold:'Held by VS',
  angel:'Moved to Volunteer Services', waitlist:'Moved to Waitlisted',
  exclude:'Not counted',
  passedmsd:'Passed MSD'
};

/* Test accounts and other records that are not real members. They stay visible
   so nobody wonders where a row went, but they are out of every count, every
   handoff list, and every percentage. */
function excluded(r){ return NOT_COUNTED.indexOf(r.override) > -1; }
function counted(){ return state.rows.filter(r => !excluded(r)); }

/* Editing an address in the review queue. The flags recompute immediately, so
   a fixed address stops being held the moment it is valid. */
const EDITABLE_FIELDS = ['street','city','state','zip','reportBy','serviceDelivery'];
const isoDate = d => d instanceof Date && !isNaN(d)
  ? d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') : '';
function applyEdit(row, field, raw){
  const v = String(raw == null ? '' : raw).trim();
  if (field === 'street'){ row.addr1 = v; row.addr2 = ''; }
  else if (field === 'city'){ row.city = v; }
  else if (field === 'state'){ row.state = v.toUpperCase(); }
  else if (field === 'zip'){ row.zip = cleanZip(v); row.zipFixed = false; }
  else if (field === 'reportBy'){
    /* The date box hands back yyyy-mm-dd. Build it locally so a date typed as
       the 23rd does not land on the 22nd in a western timezone. */
    const p = String(v).split('-');
    row.reportBy = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
  }
  else if (field === 'serviceDelivery'){ row.serviceDelivery = v; }
  row.flagPurple = !!row.city && !isMilCity(row.city);
  row.edited = true;
  return row;
}

function effStatus(r){
  /* A decision to send outranks everything else. Volunteer Services worked the
     member, nobody picked them up, and the Director signed off, so from here on
     they are a box. They stay on the Volunteer Services tab with the decision
     shown against them, so the outreach history is not lost. */
  if (outcomeSend(r)) return STATUS.SEND;
  if (r.override === 'angel') return STATUS.ANGEL;
  if (r.override === 'waitlist') return STATUS.WAIT;
  return r.status;
}
function autoHold(r){
  return !!(r.matched === false || r.flagRed || r.flagPurple || !r.addr1 || !r.city || !r.zip);
}
function heldBack(r){
  if (r.override === 'hold') return true;
  // A cleared row still cannot ship with no street address. Nothing to print.
  if (r.override === 'cleared') return !r.addr1;
  return autoHold(r);
}
/* An approved request still needs somewhere to send the box. The address check
   is the one thing an approval cannot wave through, because there would be
   nothing to print on the label. */
function shippable(r){
  if (excluded(r)) return false;
  /* A decision not to send pulls the member off the Logistics list whatever
     their status was. That covers the member who moved, who already got one
     another way, or who Volunteer Services placed at the last minute. */
  if (outcomeNoSend(r)) return false;
  if (outcomeSend(r)) return !!r.addr1;
  return effStatus(r) === STATUS.SEND && !heldBack(r);
}
/* Still open: flagged, and nobody has said what to do about it yet. A row with
   a decision on it is settled, whichever way it went. */
function needsDecision(r){ return (autoHold(r) || r.zipFixed) && !r.override; }
function isSettled(r){ return !!r.override || !!r.edited; }

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

/* Address parsing.

   Real exports carry more shapes than the SOP suggests:
     "CPR 1690, Box #12<br>APO, AE 09240"          line break, no country
     "379 Efss / v2x OPC 1201 Box 65, APO, AE 09309 US"
     "CSOJTF-C (J-8), APO, AE 09315 Jordan"        host country after the zip
     "HHC BDE, 1ABCT 1AD, APO, AE O9754"           letter O typed for zero
     "603rd MP Co, APO, Armed Forces- AE 09755 Latvia"
     "155 laws ave, Ukiah, California 95482"       spelled out state, not military

   Strategy: look for a military block anywhere in the string first, since APO,
   FPO, and DPO with an AA/AE/AP state is unambiguous and survives whatever
   noise surrounds it. Fall back to reading the last zip and working backwards. */

const STATE_NAMES = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO',
  connecticut:'CT', delaware:'DE', 'district of columbia':'DC', florida:'FL', georgia:'GA',
  hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY',
  louisiana:'LA', maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN',
  mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV',
  'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY',
  'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR',
  pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD',
  tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA',
  'west virginia':'WV', wisconsin:'WI', wyoming:'WY', 'puerto rico':'PR', guam:'GU',
  'virgin islands':'VI', 'american samoa':'AS', 'northern mariana islands':'MP'
};

function fixZip(z){
  // O typed for zero happens constantly in APO zips
  return String(z || '').replace(/^([O0-9]{5})/i, m => m.replace(/O/gi, '0'));
}
function splitStreet(street, out){
  const s = String(street || '').replace(/[,\s]+$/,'').replace(/^[,\s]+/,'').trim();
  const i = s.indexOf(',');
  if (i > 0){
    out.addr1 = s.slice(0, i).trim();
    out.addr2 = s.slice(i + 1).replace(/^[,\s]+/,'').trim();
  } else {
    out.addr1 = s;
    out.addr2 = '';
  }
}
function parseAddress(v){
  const out = { addr1:'', addr2:'', city:'', state:'', zip:'', zipFixed:false };
  if (v == null) return out;

  let s = String(v)
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/[\r\n]+/g, ', ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/(\s*,\s*){2,}/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '');
  if (!s) return out;

  // 1. military block, wherever it sits. "Armed Forces-" and stray commas allowed between.
  const mil = /\b(APO|FPO|DPO)\b[\s,]*(?:armed forces[\s\-,]*)?\b(AA|AE|AP)\b[\s,]*([O0-9]{5}(?:-\d{4})?)/i;
  let m = s.match(mil);
  if (m){
    out.city  = m[1].toUpperCase();
    out.state = m[2].toUpperCase();
    const z = fixZip(m[3]);
    out.zipFixed = z !== m[3];
    out.zip = z;
    splitStreet(s.slice(0, m.index), out);
    return out;
  }

  // 2. no military block: read the last zip and work backwards
  const zips = [...s.matchAll(/\d{5}(?:-\d{4})?/g)];
  if (zips.length){
    const z = zips[zips.length - 1];
    out.zip = z[0];
    const head = s.slice(0, z.index).replace(/[,\s]+$/,'');
    const st = head.match(/^(.*?)[,\s]+([A-Za-z][A-Za-z .]{0,24})$/);
    if (st){
      const raw = st[2].toLowerCase().replace(/[.]/g,'').trim();
      const abbr = raw.length === 2 ? raw.toUpperCase() : STATE_NAMES[raw];
      if (abbr){
        out.state = abbr;
        const rest = st[1].replace(/[,\s]+$/,'');
        const ci = rest.lastIndexOf(',');
        if (ci > 0){ out.city = rest.slice(ci + 1).trim(); splitStreet(rest.slice(0, ci), out); }
        else { out.city = rest.trim(); }
        return out;
      }
    }
    splitStreet(head, out);
    return out;
  }

  // 3. unreadable: keep it whole rather than lose it
  splitStreet(s, out);
  return out;
}

function save(){ try{ const m = {}; for (const k in state.files){ const f = state.files[k]; m[k] = { headerRow:f.headerRow, map:f.map }; } localStorage.setItem('nobox-map-v1', JSON.stringify(m)); }catch(e){} }
function loadSaved(key){ try{ const m = JSON.parse(localStorage.getItem('nobox-map-v1') || '{}'); return m[key] || null; }catch(e){ return null; } }

/* ---------- Stage 4: views ---------- */
const COLS = {
  full: [
    ['name','Client Name'],['status','Status'],['clientId','Client ID'],['mailStop','Mail Stop Date'],
    ['serviceDelivery','Service Delivery'],['reportBy','Report by Date'],['first','Client First Name'],['last','Client Last Name'],
    ['addr1','Mailing Address Line 1'],['addr2','Mailing Address Line 2'],['city','Mailing City'],['state','Mailing State/Province'],['zip','Mailing Zip/Postal Code']
  ],
  logistics: [
    ['name','Client Name'],['first','First Name'],['last','Last Name'],
    ['street','Mailing Address Line 1'],['city','Mailing City'],['state','State/Province'],['zip','Zip/Postal Code'],
    ['mailStop','Mail Stop Date'],['review','Review']
  ],
  /* Working set: fits the width without scrolling. The four address fields are
     grouped into one cell so the row stays on screen. */
  reviewCompact: [
    ['name','Client'],['review','Review'],['decision','Decision'],['clientId','Client ID'],
    ['mailStop','Mail Stop'],['reportBy','Report by'],['serviceDelivery','Svc Del'],
    ['addressEdit','Mailing address']
  ],
  /* Review queue: what is wrong, who it is, and the ID to jump to the record. */
  review: [
    ['name','Client Name'],['review','Review'],['decision','Decision'],['clientId','Client ID'],
    ['status','Status'],['mailStop','Mail Stop Date'],['reportBy','Report by Date'],
    ['serviceDelivery','Service Delivery'],
    ['street','Mailing Address Line 1'],
    ['city','Mailing City'],['state','State/Province'],['zip','Zip/Postal Code'],
    ['first','First Name'],['last','Last Name']
  ],
  /* What Logistics actually ships from. One cell per field, nothing else. */
  shipping: [
    ['first','First Name'],['last','Last Name'],
    ['street','Mailing Address Line 1'],
    ['city','Mailing City'],['state','State/Province'],['zip','Zip/Postal Code']
  ],
  /* On screen, how the member was contacted and who did it share one cell, so
     nine columns of outreach still fit without scrolling sideways. */
  volunteer: [
    ['reportBy','Report by Date'],['name','Client'],
    ['engagement','Pending Engagement'],
    ['provider','Provider'],['providerEmail','Provider Email'],
    ['contactBlock','Contact'],['vsnotes','Notes'],['boxreq','Box?']
  ],
  /* In a file they come apart again, because a spreadsheet wants one fact
     per column. */
  volunteerExport: [
    ['reportBy','Report by Date'],['name','Client'],
    ['engagement','Pending Engagement'],
    ['provider','Provider'],['providerEmail','Provider Email'],
    ['contact','Contact Method'],['who','Contacted by'],
    ['vsnotes','Notes'],['boxreq','Box?'],['decidedBy','Decided by']
  ],
  /* What the Director sees when signing off. The note trail is the whole
     argument either way, so it gets the room. */
  approvals: [
    ['name','Client'],['clientId','Client ID'],['reportBy','Report by'],
    ['engagement','Pending Engagement'],['contactBlock','Contact'],
    ['vsnotes','What happened'],['wants','Volunteer Services says'],['approve','Your call']
  ],
  waitlisted: [
    ['name','Client Name'],['clientId','Client ID'],['mailStop','Mail Stop Date'],['reportBy','Report by Date']
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
    desc:'Cleared to ship. Anything with an unresolved address or eligibility question is not here, it is on the Needs review tab. Export this and hand it over as is.',
    cols: COLS.logistics, exportCols: COLS.shipping,
    rows: () => state.rows.filter(shippable)
  },
  volunteer: {
    title:'Volunteer Services: reach out',
    desc:'These members have a service delivery this month and are waiting on an Angel to make contact. Soonest Report by Date first, so the top of the list is the most urgent. Pending Engagement is the open engagement that the Report by Date belongs to. Under Contact log how you reached them and who made contact, and add a note for each thing you tried. When you know the answer, set Box? to either send a box or do not send a box. Both go to the Director for a decision, and neither moves anybody on its own.',
    /* Columns earn their place. Pending Engagement only appears once a run has
       produced it, and the three outreach columns only once there is something
       in them, or once this browser can actually type into them. That keeps the
       builder's workbook free of three blank columns nobody filled. */
    cols: () => {
      const drop = [];
      if (!state.rows.some(r => r.engagement)) drop.push('engagement');
      if (!state.vsEdit && !state.rows.some(r => r.vs || r.req))
        drop.push('contactBlock', 'vsnotes', 'boxreq');
      return drop.length ? COLS.volunteer.filter(c => drop.indexOf(c[0]) === -1) : COLS.volunteer;
    },
    exportCols: () => {
      const drop = [];
      if (!state.rows.some(r => r.engagement)) drop.push('engagement');
      if (!state.rows.some(r => r.vs || r.req)) drop.push('contact','who','vsnotes','boxreq','decidedBy');
      else if (!state.rows.some(r => decidedBox(r))) drop.push('decidedBy');
      return drop.length ? COLS.volunteerExport.filter(c => drop.indexOf(c[0]) === -1) : COLS.volunteerExport;
    },
    sort:'reportBy',
    /* Approved members have become boxes, but they stay here. Their outreach
       history is the record of why the box was sent, and dropping them off the
       tab would hide the work that went in. */
    rows: () => counted().filter(r => effStatus(r) === STATUS.ANGEL || r.req)
  },
  approvals: {
    title:'Waiting on your approval',
    desc:'Volunteer Services has worked these members and is telling you what they think should happen. Their recommendation is in the Volunteer Services says column, with the notes behind it. You can go either way: sending a box puts the member on the Logistics list, not sending leaves them off it and records that the call was made deliberately. Nothing is deleted either way. The member stays on the Volunteer Services tab with the full history, and a decision that went against the recommendation says so.',
    cols: COLS.approvals, exportCols: COLS.approvals, hideWhenEmpty:true,
    sort:'reportBy',
    rows: () => counted().filter(pendingBox)
  },
  waitlisted: {
    title:'Already waitlisted',
    desc:'On the Currently Waitlisted Clients report. No box, no outreach needed. Here for the record.',
    cols: COLS.waitlisted, rows: () => counted().filter(r => effStatus(r) === STATUS.WAIT)
  },
  decisions: {
    title:'Decisions you made',
    desc:'Rows you cleared, held, moved, or whose address you corrected. Change any of them here and everything downstream updates.',
    cols: () => state.editable ? COLS.reviewCompact : COLS.review,
    exportCols: COLS.review, hideWhenEmpty:true,
    rows: () => state.rows.filter(isSettled)
  },
  review: {
    title:'Needs review before anything ships',
    desc:'What is wrong is in the Review column, and the Client ID is right there to look the record up. Scroll the table sideways to reach the address, the report by date, and the service delivery flag, all of which you can edit in place. Red means the Mail Stop Date lands in the reporting month, so confirm eligibility. Purple means the mailing city is not APO, FPO, or DPO. Incomplete means the address would not parse into city, state, and zip.',
    cols: () => state.editable ? COLS.reviewCompact : COLS.review,
    exportCols: COLS.review, hideWhenEmpty:true,
    rows: () => state.rows.filter(needsDecision)
  }
};
function cellVal(r, k){
  if (k === 'mailStop' || k === 'reportBy') return fmtDate(r[k]);
  /* Logistics wants one address line, not two. Nothing is dropped: whatever
     landed in line 2 is joined back on rather than thrown away. */
  if (k === 'street'){
    const a = String(r.addr1 || '').trim(), b = String(r.addr2 || '').trim();
    return b ? a + ', ' + b : a;
  }
  if (k === 'addressEdit'){
    const street = cellVal(r, 'street');
    const tail = [r.city, r.state, r.zip].filter(Boolean).join(', ');
    return [street, tail].filter(Boolean).join(' · ');
  }
  if (k === 'pending') return r.pending ? String(r.pending) : '';
  if (k === 'engagement') return r.engagement || '';
  if (k === 'decision') return r.override ? (DECISION_LABEL[r.override] || r.override) : '';
  if (k === 'contact') return r.vs ? (r.vs.contact || '') : '';
  if (k === 'who') return r.vs ? (r.vs.who || '') : '';
  if (k === 'contactBlock'){
    const a = cellVal(r, 'contact'), b = cellVal(r, 'who');
    return [a, b].filter(Boolean).join(' · ');
  }
  if (k === 'vsnotes'){
    const n = r.vs && r.vs.notes ? r.vs.notes : [];
    return n.map(x => (x.by ? x.by + ': ' : '') + x.t).join(' · ');
  }
  if (k === 'wants') return r.req && r.req.want ? WANT_LABEL[r.req.want] : '';
  if (k === 'decidedBy') return r.req && r.req.decidedBy ? r.req.decidedBy : '';
  if (k === 'boxreq' || k === 'approve'){
    if (!r.req) return '';
    if (r.req.state === REQ.PENDING) return WANT_SHORT[r.req.want] || 'Sent to the Director';
    return (OUT_LABEL[r.req.outcome] || '') + (overruled(r) ? ', against what was asked' : '');
  }
  if (k === 'review'){
    /* A row taken out of the counts says so and nothing else. The original
       flag is no longer the useful fact about it. */
    if (excluded(r)) return r.override === 'passedmsd' ? 'Passed MSD, not counted' : 'Not counted';
    /* On the Logistics list, why a member is here matters more than what was
       once wrong with their address. An approved request says so plainly. */
    if (outcomeSend(r)){
      const who = (r.req.decidedBy || 'the Director of Virtual Services').replace(/^The\s+/i, '');
      const t = ['Approved by ' + who];
      if (!r.addr1) t.push('No address');
      return t.join(' · ');
    }
    const t = [];
    if (r.matched === false) t.push('Missing from Part 2');
    else if (!r.addr1) t.push('No address');
    else if (!r.city || !r.zip) t.push('Incomplete address');
    if (r.flagRed) t.push('Confirm eligibility');
    if (r.flagPurple) t.push('Verify address');
    if (r.zipFixed) t.push('Check zip');
    if (r.edited) t.push('Address updated');
    if (!t.length) t.push('Cleared');
    return t.join(' · ');
  }
  return r[k] == null ? '' : String(r[k]);
}
/* Rows with no date sort to the bottom rather than the top, so a missing
   date never looks like the most urgent thing on the list. */
function byDate(field){
  return (a, b) => {
    const x = a[field], y = b[field];
    if (!x && !y) return String(a.last || a.name).localeCompare(String(b.last || b.name));
    if (!x) return 1;
    if (!y) return -1;
    return x - y;
  };
}
function activeRows(){
  const v = VIEWS[state.view];
  let rows = v.rows();
  if (v.sort) rows = rows.slice().sort(byDate(v.sort));
  return rows;
}
function renderView(){
  document.querySelectorAll('.view-tab').forEach(t => {
    const def = VIEWS[t.dataset.view];
    if (def && def.hideWhenEmpty) t.style.display = def.rows().length ? '' : 'none';
  });
  if (VIEWS[state.view] && VIEWS[state.view].hideWhenEmpty && !VIEWS[state.view].rows().length){
    state.view = 'all';
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('on', t.dataset.view === 'all'));
  }

  const v = VIEWS[state.view];
  $('#vTitle').textContent = v.title;
  $('#vDesc').textContent = v.desc;
  for (const k in VIEWS) { const n = document.getElementById('n-' + k); if (n) n.textContent = VIEWS[k].rows().length; }

  const help = $('#decisionHelp');
  if (help) help.style.display = (state.view === 'review' || state.view === 'decisions') ? '' : 'none';

  const fbox = $('#vFilters');
  if (state.view === 'logistics'){
    const held = state.rows.filter(r => effStatus(r) === STATUS.SEND && heldBack(r)).length;
    fbox.innerHTML = held
      ? `<span class="hint">${held} more would ship once resolved on the Needs review tab.</span>`
      : `<span class="hint">Nothing outstanding. Every send-a-box member is on this list.</span>`;
  } else fbox.innerHTML = '';

  const rows = activeRows();
  const cols = viewCols(v);
  const t = $('#vTable');
  /* The outreach tabs carry free text, so they wrap rather than run off the
     side. Everything else keeps the nowrap table it already had. */
  t.className = (state.editable && (state.view === 'review' || state.view === 'decisions')) ? 'compact'
              : (state.view === 'volunteer' || state.view === 'approvals') ? 'vs' : '';
  t.querySelector('thead').innerHTML = '<tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '</tr>';
  t.querySelector('tbody').innerHTML = rows.map(r => {
    let cls = '';
    if (excluded(r)) cls = 'excluded';
    else if (outcomeSend(r)) cls = 'decided';
    else if (outcomeNoSend(r)) cls = 'decided-no';
    else if (pendingBox(r)) cls = 'asked';
    else if (r.override === 'hold') cls = 'decided-hold';
    else if (r.override) cls = 'decided';
    else if (r.flagRed) cls = 'red';
    else if (effStatus(r) === STATUS.WAIT) cls = 'gold';
    else if (effStatus(r) === STATUS.ANGEL) cls = 'blue';
    return '<tr class="' + cls + '">' + cols.map(c => {
      let val = cellVal(r, c[0]);
      if (c[0] === 'status'){
        const tag = r.status === STATUS.WAIT ? 'gold' : r.status === STATUS.ANGEL ? 'blue' : 'send';
        val = `<span class="tag ${tag}">${val}</span>`;
      }
      if (c[0] === 'review' && val){
        val = val.split(' · ').map(x => {
          const cls = x === 'Verify address' ? 'purple'
                    : x === 'Cleared' ? 'send'
                    : /^Approved by/.test(x) ? 'send'
                    : x === 'Check zip' || x === 'Address updated' ? 'gold'
                    : /not counted/i.test(x) ? 'grey'
                    : 'red';
          return `<span class="tag ${cls}">${x}</span>`;
        }).join(' ');
      }

      /* ---- Volunteer Services cells ---- */
      if (c[0] === 'contactBlock' || c[0] === 'vsnotes' || c[0] === 'boxreq' || c[0] === 'wants'){
        const idx = state.rows.indexOf(r);
        const esc = s => String(s == null ? '' : s)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

        /* How they were reached, and who reached them. Two boxes, one cell. */
        if (c[0] === 'contactBlock'){
          if (state.vsEdit){
            val = `<div class="ctgrid">` +
              `<input class="vsfix" data-row="${idx}" data-f="contact" value="${esc(r.vs ? r.vs.contact : '')}" placeholder="how, e.g. text 10/28">` +
              `<input class="vsfix" data-row="${idx}" data-f="who" value="${esc(r.vs ? r.vs.who : '')}" placeholder="who made contact">` +
            `</div>`;
          } else {
            const a = esc(cellVal(r, 'contact')), b = esc(cellVal(r, 'who'));
            val = (a ? '<span class="ctm">' + a + '</span>' : '') +
                  (b ? '<span class="ctw">' + b + '</span>' : '');
          }
          return `<td data-l="${c[1]}">${val}</td>`;
        }

        if (c[0] === 'vsnotes'){
          const notes = (r.vs && r.vs.notes) ? r.vs.notes : [];
          const log = notes.map(n =>
            `<span class="nlog"><b>${esc(n.by || 'Volunteer Services')}</b> ${esc(n.t)}` +
            `<i>${n.at ? new Date(n.at).toLocaleDateString('en-US',{month:'numeric',day:'numeric'}) : ''}</i></span>`
          ).join('');
          /* Each note is signed where it is typed, so a second person picking
             the member up does not get recorded as the first. */
          val = `<div class="notecell">${log ? '<div class="notelog">' + log + '</div>' : ''}` +
            (state.vsEdit
              ? `<div class="noteadd">` +
                `<input class="vsby" data-row="${idx}" value="${esc(state.whoami)}" placeholder="your name">` +
                `<input class="vsnote" data-row="${idx}" placeholder="${notes.length ? 'Add another note' : 'What happened'}">` +
                `</div>`
              : '') + `</div>`;
          return `<td data-l="${c[1]}">${val}</td>`;
        }

        /* What Volunteer Services recommends, read only, for the Director's tab. */
        if (c[0] === 'wants'){
          const w = r.req && r.req.want;
          val = w ? `<span class="tag ${w === WANT.SEND ? 'gold' : 'grey'}">${WANT_LABEL[w]}</span>` : '';
          if (r.req && r.req.by) val += `<span class="nby">asked by ${esc(r.req.by)}</span>`;
          return `<td data-l="${c[1]}">${val}</td>`;
        }

        /* Box? A recommendation either way, and either way it goes to the
           Director. Volunteer Services can change their mind right up until
           he decides, after which the cell reports the decision instead. */
        const q = r.req;
        if (q && q.state === REQ.DECIDED){
          val = `<span class="tag ${q.outcome === WANT.SEND ? 'send' : 'grey'}">${esc(OUT_LABEL[q.outcome] || '')}</span>`;
          if (overruled(r)) val += `<span class="tag red">Against what was asked</span>`;
          if (q.decidedBy) val += `<span class="nby">${esc(String(q.decidedBy).replace(/^The\s+/i,''))}</span>`;
        } else if (state.vsEdit){
          const cur = q ? q.want : '';
          val = `<select class="vsbox" data-row="${idx}">` +
            [['','No recommendation'], [WANT.SEND, WANT_LABEL.send], [WANT.NOSEND, WANT_LABEL.nosend]]
              .map(o => `<option value="${o[0]}"${cur === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('') +
            `</select>` +
            (q ? `<span class="nby">waiting on the Director</span>` : '');
        } else {
          val = q ? `<span class="tag gold">${esc(WANT_SHORT[q.want] || '')}</span>` : '';
        }
        return `<td data-l="${c[1]}">${val}</td>`;
      }

      /* ---- the Director's sign off ---- */
      if (c[0] === 'approve'){
        const idx = state.rows.indexOf(r);
        val = state.canApprove
          ? `<div class="apact">` +
            `<button class="btn sm gold apyes" data-row="${idx}">Send a box</button>` +
            `<button class="btn sm out apno" data-row="${idx}">Do not send</button></div>`
          : `<span class="hint">Unlock with the admin password to decide.</span>`;
        return `<td data-l="${c[1]}">${val}</td>`;
      }
      if (state.editable && (state.view === 'review' || state.view === 'decisions')
          && (EDITABLE_FIELDS.includes(c[0]) || c[0] === 'addressEdit')){
        const idx = state.rows.indexOf(r);
        if (c[0] === 'addressEdit'){
          const esc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
          val = `<div class="addrgrid">` +
            `<input class="cellfix" data-row="${idx}" data-f="street" value="${esc(cellVal(r,'street'))}" placeholder="street" style="grid-column:1 / -1">` +
            `<input class="cellfix" data-row="${idx}" data-f="city" value="${esc(r.city)}" placeholder="city">` +
            `<input class="cellfix" data-row="${idx}" data-f="state" value="${esc(r.state)}" placeholder="ST" maxlength="2">` +
            `<input class="cellfix" data-row="${idx}" data-f="zip" value="${esc(r.zip)}" placeholder="zip">` +
          `</div>`;
          return `<td data-l="${c[1]}">${val}</td>`;
        }
        if (c[0] === 'serviceDelivery'){
          const cur = String(r.serviceDelivery || '');
          val = `<select class="cellfix" data-row="${idx}" data-f="serviceDelivery">` +
                ['', 'Yes', 'No'].map(o =>
                  `<option value="${o}"${cur === o ? ' selected' : ''}>${o || 'not set'}</option>`).join('') +
                `</select>`;
        } else if (c[0] === 'reportBy'){
          val = `<input class="cellfix" type="date" data-row="${idx}" data-f="reportBy" value="${isoDate(r.reportBy)}" style="width:150px">`;
        } else {
          const raw = String(cellVal(r, c[0])).replace(/"/g, '&quot;');
          val = `<input class="cellfix" data-row="${idx}" data-f="${c[0]}" value="${raw}"` +
                (c[0] === 'state' ? ' maxlength="2" style="width:52px"' : '') +
                (c[0] === 'zip' ? ' style="width:92px"' : '') + `>`;
        }
        return `<td data-l="${c[1]}">${val}</td>`;
      }
      if (c[0] === 'decision'){
        if (state.editable){
          val = `<select class="decide" data-row="${state.rows.indexOf(r)}">` +
            DECISIONS.map(d => `<option value="${d[0]}"${r.override === d[0] || (!r.override && !d[0]) ? ' selected' : ''}>${d[1]}</option>`).join('') +
            `</select>`;
        } else {
          val = r.override ? `<span class="tag ${r.override === 'hold' ? 'red' : 'send'}">${DECISION_LABEL[r.override]}</span>` : '';
        }
      }
      const pc = (r.flagPurple && ['street','addr1','addr2','city','state','zip'].includes(c[0])) ? ' class="flag-purple"' : '';
      return `<td${pc} data-l="${c[1]}">${val || ''}</td>`;
    }).join('') + '</tr>';
  }).join('') || `<tr><td colspan="${cols.length}" style="padding:20px;color:var(--ink-soft)">Nothing in this list.</td></tr>`;
  $('#vFoot').textContent = rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' shown.';

  if (state.editable){
    t.querySelectorAll('.cellfix').forEach(inp => {
      // change fires on blur, so the table is not rebuilt under the cursor
      inp.addEventListener('change', () => {
        const row = state.rows[+inp.dataset.row];
        if (!row) return;
        applyEdit(row, inp.dataset.f, inp.value);
        renderView();
        if (typeof window.onOverrideChange === 'function') window.onOverrideChange();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });
    t.querySelectorAll('select.decide').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = state.rows[+sel.dataset.row];
        if (!row) return;
        row.override = sel.value;
        renderView();
        if (typeof window.onOverrideChange === 'function') window.onOverrideChange();
      });
    });
  }

  /* ---- Volunteer Services controls ---- */
  const touched = () => { if (typeof window.onOverlayChange === 'function') window.onOverlayChange(); };

  if (state.vsEdit){
    t.querySelectorAll('.vsfix').forEach(inp => {
      inp.addEventListener('change', () => {
        const row = state.rows[+inp.dataset.row];
        if (!row) return;
        const e = overlayEntry(row, true);
        if (!e) return;
        e[inp.dataset.f] = inp.value.trim();     // contact, or who made it
        e.contactAt = new Date().toISOString();
        touched();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });

    /* Notes append. Nothing typed here ever overwrites what somebody else
       wrote, which is why the box empties instead of holding the last note.
       The name beside it signs that one note and becomes the default for the
       next, so a person only types it once. */
    t.querySelectorAll('.vsnote').forEach(inp => {
      const commit = () => {
        const row = state.rows[+inp.dataset.row];
        const txt = inp.value.trim();
        if (!row || !txt) return;
        const cell = inp.closest('.noteadd');
        const nameBox = cell ? cell.querySelector('.vsby') : null;
        const by = (nameBox && nameBox.value.trim()) || state.whoami || 'Volunteer Services';
        if (by && by !== state.whoami){
          state.whoami = by;
          if (typeof window.onWhoChange === 'function') window.onWhoChange(by);
        }
        const e = overlayEntry(row, true);
        if (!e) return;
        e.notes = e.notes || [];
        e.notes.push({ t: txt, by: by, at: new Date().toISOString() });
        /* Whoever logged the last note is who is working the member, unless
           somebody has already said otherwise. */
        if (!e.who) e.who = by;
        inp.value = '';
        renderView();
        touched();
      };
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); commit(); } });
    });

    /* Send a box, or do not send a box. Either one is a recommendation, and
       either one goes to the Director. Neither moves anybody on its own. */
    t.querySelectorAll('select.vsbox').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = state.rows[+sel.dataset.row];
        if (!row) return;
        const e = overlayEntry(row, true);
        if (!e) return;
        e.req = sel.value
          ? { want: sel.value, state: REQ.PENDING,
              by: state.whoami || 'Volunteer Services', at: new Date().toISOString() }
          : null;
        row.req = e.req;
        renderView();
        touched();
      });
    });
  }

  if (state.canApprove){
    const decide = (idx, send) => {
      const row = state.rows[idx];
      if (!row) return;
      const e = overlayEntry(row, true);
      if (!e || !e.req) return;
      /* The request itself is kept, so the row still says who asked, for what,
         when, and on the back of which notes. What was asked for sits alongside
         the outcome, so a decision that went the other way stays visible rather
         than being silently rewritten.

         A note is signed by its author. A decision is signed by the role that
         holds the admin password, because Logistics needs to know the box was
         authorised, not who happened to be at the keyboard. */
      e.req = Object.assign({}, e.req, {
        state: REQ.DECIDED,
        outcome: send ? WANT.SEND : WANT.NOSEND,
        decidedBy: APPROVER_ROLE,
        decidedAt: new Date().toISOString()
      });
      row.req = e.req;
      renderView();
      touched();
    };
    t.querySelectorAll('.apyes').forEach(b => b.addEventListener('click', () => decide(+b.dataset.row, true)));
    t.querySelectorAll('.apno').forEach(b => b.addEventListener('click', () => decide(+b.dataset.row, false)));
  }
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
function viewCols(v){ return typeof v.cols === 'function' ? v.cols() : v.cols; }
function colsFor(v){
  const e = v.exportCols;
  if (e) return typeof e === 'function' ? e() : e;
  return viewCols(v);
}
function exportCsv(){
  const v = VIEWS[state.view], rows = activeRows(), cols = colsFor(v);
  const esc = s => '"' + String(s == null ? '' : s).replace(/"/g,'""') + '"';
  const lines = [cols.map(c => esc(c[1])).join(',')];
  rows.forEach(r => lines.push(cols.map(c => esc(cellVal(r, c[0]))).join(',')));
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
        if (r.flagPurple && ['street','addr1','addr2','city','state','zip'].includes(k) && !r.flagRed){
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
  sheetFrom(ws, colsFor(v), activeRows(), { color: state.view === 'all' });
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

  sheetFrom(wb.addWorksheet('Logistics - Send Box'), COLS.shipping, state.rows.filter(r => r.status === STATUS.SEND), {});
  sheetFrom(wb.addWorksheet('Volunteer Svcs - Outreach'), viewCols(VIEWS.volunteer),
    state.rows.filter(r => r.status === STATUS.ANGEL).sort(byDate('reportBy')), {});
  sheetFrom(wb.addWorksheet('Waitlisted'), COLS.waitlisted, state.rows.filter(r => effStatus(r) === STATUS.WAIT), {});

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `No Box - ${stamp()}.xlsx`);
}

/* ---------- publishing crypto ----------
   Rows are encrypted in the browser with a key derived from the team
   password. What lands in the repo is ciphertext. Without the password
   the file is noise, so a leaked URL does not leak member data. */
const CRYPTO_ITER = 250000;
/* Open mode: no password set in config.js. The list is still encrypted on the
   wire, but with a key that is sitting right here in the code, so it protects
   nothing. It exists so the tool can be tested end to end before passwords are
   turned on. Both pages shout about it while it is active. */
const OPEN_KEY = 'nobox-open-mode-no-password-set';
function siteLocked(){ return !!(window.NOBOX_CONFIG || {}).passwordHash; }
function keyFor(pw){ return siteLocked() ? pw : OPEN_KEY; }
const b64 = {
  enc: buf => {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
    return btoa(s);
  },
  dec: s => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
};
function cryptoReady(){ return !!(window.crypto && window.crypto.subtle); }
async function deriveKey(pw, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iter, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
async function encryptPayload(pw, obj){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt, CRYPTO_ITER);
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  /* mode is plain metadata, not a secret. It lets the reader say "this was
     published before the password was set" instead of just "wrong password". */
  return JSON.stringify({
    v:1, iter:CRYPTO_ITER, mode: siteLocked() ? 'locked' : 'open',
    published: new Date().toISOString(),
    salt:b64.enc(salt), iv:b64.enc(iv), ct:b64.enc(ct)
  }, null, 0);
}
async function decryptPayload(pw, fileText){
  const f = JSON.parse(fileText);
  const key = await deriveKey(pw, b64.dec(f.salt), f.iter || CRYPTO_ITER);
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64.dec(f.iv) }, key, b64.dec(f.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
function reviveRows(rows){
  rows.forEach(r => {
    r.mailStop = r.mailStop ? new Date(r.mailStop) : null;
    r.reportBy = r.reportBy ? new Date(r.reportBy) : null;
  });
  return rows;
}

/* ---------- writing one file to GitHub ----------
   Used by the staff page for the overlay only. The builder has its own copy of
   this for the published list, so the two never share a code path. */
async function ghCall(token, url, opts){
  /* Only headers GitHub lists in access-control-allow-headers may be set here.
     Anything else fails the CORS preflight and surfaces as a bare
     "Failed to fetch" with no status. */
  const bust = (opts && opts.method && opts.method !== 'GET') ? url
    : url + (url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now();
  return fetch(bust, Object.assign({ cache:'no-store' }, opts, {
    headers: Object.assign({
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': 'Bearer ' + token
    }, (opts || {}).headers || {})
  }));
}
function ghUrl(g, path){
  return 'https://api.github.com/repos/' + g.owner + '/' + g.repo + '/contents/' + path;
}
async function ghGetText(token, g, path){
  const res = await ghCall(token, ghUrl(g, path) + '?ref=' + encodeURIComponent(g.branch));
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error('401 the key was not accepted');
  if (res.status === 403) throw new Error('403 the key cannot write to this repository');
  if (res.status !== 200) throw new Error('status ' + res.status);
  const meta = await res.json();
  return { sha: meta.sha, text: decodeURIComponent(escape(atob(String(meta.content || '').replace(/\s/g, '')))) };
}
async function ghPutText(token, g, path, text, message, sha){
  const body = { message: message, content: b64.enc(new TextEncoder().encode(text)), branch: g.branch };
  let put = null;
  for (let a = 0; a < 4; a++){
    if (sha) body.sha = sha; else delete body.sha;
    put = await ghCall(token, ghUrl(g, path), { method:'PUT', body: JSON.stringify(body) });
    if (put.status !== 409) break;
    await new Promise(r => setTimeout(r, 700 * (a + 1)));
    const re = await ghGetText(token, g, path).catch(() => null);
    sha = re ? re.sha : null;
  }
  if (!put.ok){
    const e = await put.json().catch(() => ({}));
    throw new Error('status ' + put.status + (e.message ? '. ' + e.message : ''));
  }
  return put.json();
}

/* The single door through which Volunteer Services writes anything.
   The path is a constant, not an argument, so no caller can point this at the
   published list by accident. Re-reads and merges first, so a second person
   saving a minute later cannot wipe the first person's notes. */
async function saveOverlay(token, g, pw, local){
  if (g.path === OVERLAY_PATH)
    throw new Error('config.js points the published list at the notes file. Fix that before saving.');

  let sha = null, remote = null;
  const cur = await ghGetText(token, g, OVERLAY_PATH);
  if (cur){
    sha = cur.sha;
    try { remote = await decryptPayload(pw, cur.text); } catch(e){ remote = null; }
  }
  /* A notes file that will not open is left alone rather than overwritten.
     Better to fail loudly than to quietly replace something unreadable. */
  if (cur && !remote)
    throw new Error('the notes already on the site could not be opened with this password, so nothing was changed');

  /* A notes file from a previous month is replaced, not merged. Merging would
     carry every one of last month's entries into this month's file under this
     month's key, and last month's outreach would reappear against a fresh list. */
  if (remote && remote.monthKey && local.monthKey && remote.monthKey !== local.monthKey) remote = null;

  const merged = mergeOverlays(remote, local);
  const text = await encryptPayload(pw, merged);
  await ghPutText(token, g, OVERLAY_PATH, text,
    'Volunteer Services notes for ' + (merged.monthKey || 'this month'), sha);
  return merged;
}
