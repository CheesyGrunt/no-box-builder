"""Rebuild the dashboard from a fresh VS_Database export.

    python tools/refresh_data.py path/to/VS_Database_v3.xlsx

Reads the workbook, aggregates it, and writes data.json plus a new
index.html with the data embedded. No names or individual records
ever leave the workbook.
"""
import pandas as pd, json, numpy as np, sys, os, datetime, re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'VS_Database_v3.xlsx')
if not os.path.exists(SRC):
    sys.exit(f'Workbook not found: {SRC}')
xl = pd.ExcelFile(SRC)

def clean(v):
    if pd.isna(v): return None
    if isinstance(v,(np.integer,)): return int(v)
    if isinstance(v,(np.floating,float)): return round(float(v),2)
    return v

# ---- Summary sheet: header on row index 1
s = pd.read_excel(xl,'Summary',header=1)
s = s[s['Year'].notna()]
s = s[s['Year'].astype(str).str.match(r'^\d{4}')]
summary = []
for _,r in s.iterrows():
    summary.append({
        'year': int(r['Year']),
        'program': str(r['Program']).strip(),
        'volunteers': clean(r['# Volunteers']),
        'hours': clean(r['Hours Volunteered']),
        'inKind': clean(r['In-Kind Value']),
        'timeValue': clean(r['Volunteer Time Value']),
        'staffLabor': clean(r['Paid Staff Labor']),
        'packages': clean(r['Packages Supported']),
        'letters': clean(r['Letters Supported']),
        'items': clean(r['Items Supported']),
        'quantity': clean(r['Quantity Supported']),
        'engagements': clean(r['Engagements']),
        'falseReports': clean(r['Potential False Reports']),
    })

# ---- YTD comparison ------------------------------------------------
# The sheet gets renamed and the reporting window moves, so nothing here is
# positional: we find the sheet by keyword and the blocks by their labels.
def find_ytd_sheet(names):
    cands = [n for n in names if 'ytd' in n.lower()]
    if not cands:
        return None
    cands.sort(key=lambda n: (0 if re.search(r'compar', n, re.I) else 1, len(n)))
    return cands[0]

def txt(g, i, j):
    if 0 <= i < len(g) and 0 <= j < g.shape[1]:
        v = g.iloc[i, j]
        if pd.notna(v) and str(v).strip():
            return str(v).strip()
    return None

def is_stop(v):
    return v is None or re.match(r'^note\s*:', v, re.I)

ytd = None
sheet = find_ytd_sheet(xl.sheet_names)
if sheet:
    g = pd.read_excel(xl, sheet, header=None)

    # anchor on the cell that says "Metric"
    anchor = None
    for i in range(min(14, len(g))):
        for j in range(min(5, g.shape[1])):
            if str(g.iloc[i, j]).strip().lower() == 'metric':
                anchor = (i, j)
                break
        if anchor:
            break

    if anchor:
        i0, j0 = anchor
        prior_label = txt(g, i0, j0 + 1) or 'Prior'
        current_label = txt(g, i0, j0 + 2) or 'Current'

        # free text off to the right: banner, period line, disclaimer
        banner = period = disclaimer = None
        for i in range(max(0, i0 - 2), min(len(g), i0 + 9)):
            for j in range(j0 + 5, g.shape[1]):
                v = txt(g, i, j)
                if not v or len(v) < 20:
                    continue
                if re.match(r'^disclaimer', v, re.I):
                    disclaimer = re.sub(r'^disclaimer\s*:\s*', '', v, flags=re.I)
                elif re.match(r'^period', v, re.I):
                    period = re.sub(r'^period\s*:\s*', '', v, flags=re.I)
                elif banner is None:
                    banner = v

        metrics = []
        i = i0 + 1
        while i < len(g):
            m = txt(g, i, j0)
            if is_stop(m):
                break
            metrics.append({
                'metric': m,
                'prior': clean(g.iloc[i, j0 + 1]),
                'current': clean(g.iloc[i, j0 + 2]),
                'delta': clean(g.iloc[i, j0 + 3]),
                'pct': None if pd.isna(g.iloc[i, j0 + 4]) else round(float(g.iloc[i, j0 + 4]), 5),
            })
            i += 1

        # optional per-program block underneath
        programs, families, total = [], [], None
        bp = None
        for i in range(len(g)):
            if str(g.iloc[i, j0]).strip().upper() == 'BY PROGRAM':
                bp = i
                break
        if bp is not None:
            hrow = bp + 1
            colmap = {}
            for j in range(g.shape[1]):
                h = txt(g, hrow, j)
                if not h:
                    continue
                m = re.match(r'^(\d{4})\s+(.+)$', h)
                if m:
                    colmap.setdefault(m.group(2).strip(), {})[int(m.group(1))] = j
            families = [f for f in colmap if len(colmap[f]) >= 2]
            i = hrow + 1
            while i < len(g):
                name = txt(g, i, j0)
                if is_stop(name):
                    break
                row = {'program': name}
                for f in families:
                    yrs = sorted(colmap[f])
                    row[f] = {'prior': clean(g.iloc[i, colmap[f][yrs[0]]]) or 0,
                              'current': clean(g.iloc[i, colmap[f][yrs[-1]]]) or 0}
                if name.strip().lower() == 'total':
                    total = row
                else:
                    programs.append(row)
                i += 1

        ytd = {'sheet': sheet, 'banner': banner, 'period': period, 'disclaimer': disclaimer,
               'priorLabel': prior_label, 'currentLabel': current_label,
               'metrics': metrics, 'families': families, 'programs': programs, 'total': total}

# ---- Raw rows -> monthly + categorical aggregates (NO names retained)
cols=['Date Supported','Hours Volunteered','Total Cost of Support','Program','Service',
      'Client Status','Number of Supported','Potential False Reports','Year','Service Provider']
frames=[]
for sheet in ['Past Years Raw','Current Year Raw']:
    d = pd.read_excel(xl,sheet,header=1)
    frames.append(d[cols])
raw = pd.concat(frames,ignore_index=True)
raw['Date Supported']=pd.to_datetime(raw['Date Supported'],errors='coerce')
raw=raw[raw['Date Supported'].notna()]
raw['Year']=pd.to_numeric(raw['Year'],errors='coerce')
raw=raw[raw['Year'].notna()]
raw['Year']=raw['Year'].astype(int)
raw=raw[(raw['Year']>=2023)&(raw['Year']<=2026)]
raw=raw[raw['Date Supported'].dt.year.between(2022,2027)]
raw['m']=raw['Date Supported'].dt.month
for c in ['Hours Volunteered','Total Cost of Support','Number of Supported']:
    raw[c]=pd.to_numeric(raw[c],errors='coerce').fillna(0)

monthly = (raw.groupby(['Year','m'])
    .agg(hours=('Hours Volunteered','sum'),
         inKind=('Total Cost of Support','sum'),
         engagements=('Program','size'),
         supported=('Number of Supported','sum'))
    .reset_index())
monthly=[{'year':int(r.Year),'month':int(r.m),'hours':round(r.hours,1),
          'inKind':round(r.inKind,2),'engagements':int(r.engagements),
          'supported':round(r.supported,1)} for r in monthly.itertuples()]

prog_month = (raw.groupby(['Year','m','Program'])['Hours Volunteered'].sum().reset_index())
progMonthly=[{'year':int(r.Year),'month':int(r.m),'program':str(r.Program),
              'hours':round(r._4,1)} for r in prog_month.itertuples()]

services = (raw.groupby(['Year','Service'])
    .agg(count=('Service','size'),hours=('Hours Volunteered','sum'))
    .reset_index())
services=[{'year':int(r.Year),'service':str(r.Service),'count':int(r.count),
           'hours':round(r.hours,1)} for r in services.itertuples() if str(r.Service)!='nan']

status = (raw.groupby(['Year','Client Status']).size().reset_index(name='count'))
status=[{'year':int(r.Year),'status':str(r._2),'count':int(r.count)}
        for r in status.itertuples() if str(r._2)!='nan']

# volunteer distribution (anonymous buckets of hours per provider)
vp = raw.groupby(['Year','Service Provider'])['Hours Volunteered'].sum().reset_index()
def bucket(h):
    if h<10: return '<10 hrs'
    if h<50: return '10-49 hrs'
    if h<100: return '50-99 hrs'
    if h<250: return '100-249 hrs'
    return '250+ hrs'
vp['b']=vp['Hours Volunteered'].apply(bucket)
vd = vp.groupby(['Year','b']).size().reset_index(name='count')
volDist=[{'year':int(r.Year),'bucket':str(r.b),'count':int(r.count)} for r in vd.itertuples()]

out={'generated':datetime.date.today().isoformat(),'summary':summary,'ytd':ytd,'monthly':monthly,
     'progMonthly':progMonthly,'services':services,'status':status,'volDist':volDist}
payload = json.dumps(out, separators=(',', ':'))

with open(os.path.join(HERE, 'data.json'), 'w') as f:
    f.write(payload)

tpl = open(os.path.join(HERE, 'template.html')).read()
with open(os.path.join(HERE, 'index.html'), 'w') as f:
    f.write(tpl.replace('/*__VS_DATA__*/', payload))

print(f'OK  {len(summary)} program-year rows, {len(monthly)} months, {len(services)} service rows')
print(f'    years: {sorted(set(x["year"] for x in summary))}')
print(f'    wrote data.json and index.html ({round(len(payload)/1024,1)} KB of data)')
