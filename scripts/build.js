#!/usr/bin/env node
/* Optional command-line build (the Kitchens page does the same thing in the browser).
 * Usage:  npm install xlsx  &&  node scripts/build.js path/to/reports/*.xls*
 * Set VIEWER_PASSWORD and ADMIN_PASSWORD to write data/hall.enc.json + data/keys.enc.json.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const GH = require('../assets/processor.js');
const cfg = (() => { const src = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'); const w = {}; new Function('window', src)(w); return w.GREAT_HALL_CONFIG; })();

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Give me the report files.'); process.exit(1); }
  const reports = {};
  for (const f of files) {
    const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: false });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const name = path.basename(f);
    const key = GH.detect(name, rows);
    if (!key) { console.warn('Could not tell what this report is, skipped:', name); continue; }
    reports[key] = { name, rows };
    console.log(key.padEnd(15), '<-', name, `(${rows.length - 1} rows)`);
  }
  const out = GH.build(reports, { year: cfg.year, householdCap: cfg.householdCap });
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const V = process.env.VIEWER_PASSWORD, A = process.env.ADMIN_PASSWORD;
  if (!V || !A) { console.error('\nSet VIEWER_PASSWORD and ADMIN_PASSWORD to write the locked data files.'); }
  else {
    fs.writeFileSync(path.join(dir, 'hall.enc.json'), JSON.stringify(await GH.seal({ summary: out.summary, roster: out.roster }, V)));
    fs.writeFileSync(path.join(dir, 'keys.enc.json'), JSON.stringify(await GH.seal({ viewer: V, v: 1 }, A)));
    console.log('\nWrote data/hall.enc.json and data/keys.enc.json (' + out.roster.length + ' clients)');
  }
  console.log('\nTotals:', out.summary.totals);
  console.log('\nNotes:\n - ' + out.summary.quality.join('\n - '));
})();
