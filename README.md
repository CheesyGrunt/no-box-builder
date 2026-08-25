# Virtual Services Impact Dashboard

A shareable, public-facing dashboard built from the Soldiers' Angels Virtual Services
engagement database. One HTML file, no server, no build step, no dependencies.

**What's in here**

| File | What it does |
| --- | --- |
| `index.html` | The whole site. Data is embedded, so it works anywhere. This is what gets deployed. |
| `template.html` | The site without data. Edit this when you want to change design or copy. |
| `data.json` | The aggregated dataset, in case anyone wants the raw numbers. |
| `tools/refresh_data.py` | Rebuilds `data.json` and `index.html` from a new workbook export. |
| `refresh.html` | **Browser-only rebuild.** No installs needed. Open it, drop the workbook in, download the new files. Use this on a locked-down work machine. It carries its own copy of `template.html` inside it, so if you change the design, that file has to be rebuilt too. |
| `refresh.bat` | Windows one-click rebuild and push, for a machine where you can install Git and Python. |
| `setup.html` | Run once. Locks your GitHub token behind a passphrase and gives you `auth.json`. |
| `auth.json` | The sealed token. Created by `setup.html`, uploaded by you. Useless without the passphrase. |
| `render.yaml` | Tells Render how to host it. |

## Publishing straight from the browser

`refresh.html` is passphrase-gated. Unlock it and it can commit the rebuilt
dashboard to GitHub itself, no manual upload.

Setup, once:

1. Open `setup.html`, choose a passphrase, paste a GitHub fine-grained token
   scoped to **this repo only** with **Contents: read and write**.
2. It hands you `auth.json`. Upload that to the repo.
3. From then on, open `refresh.html` **from the live site**, unlock, drop the
   workbook, click **Publish to the live site**.

The passphrase is never stored or compared against anything. It derives a key
that either opens `auth.json` or does not. The token is decrypted in memory and
never written to disk.

If `auth.json` is missing, or you opened `refresh.html` from your own folder
rather than the live site, the tool still works. It just falls back to giving
you the two files to upload by hand.

**Make the repo private.** `auth.json` lives in the repo, so on a public repo
anyone can download it and guess at the passphrase offline, as many times as
they like. On a private repo they cannot get the file at all, which is what
makes a short passphrase safe. Render deploys private repos on the free tier
and the live site stays public either way.

The vault itself uses AES-256-GCM behind 600,000 rounds of PBKDF2. Minimum
passphrase is 6 characters.

## Privacy

The source workbook has roughly 237,000 individual records with recipient names and
volunteer names in them. **None of that is in this repo.** The refresh script reads the
workbook, aggregates by year, program, month, service type, and recipient status, and
writes only those totals. No names, no individual rows, no client detail.

Keep `VS_Database_v3.xlsx` out of the repo. `.gitignore` already blocks `*.xlsx`.

## Updating the numbers

**No admin rights? Use the browser.** Open `refresh.html`, drop in the workbook,
and it hands you a new `index.html` and `data.json`. Upload those two to GitHub
through the website. Nothing gets installed and the workbook never leaves your machine.

**Windows with Git and Python installed:** drag `VS_Database_v3.xlsx` onto `refresh.bat`.

**Any platform, manually:**

```bash
pip install pandas openpyxl
python tools/refresh_data.py /path/to/VS_Database_v3.xlsx
git add data.json index.html
git commit -m "Refresh data through July 2026"
git push
```

Render redeploys automatically on push. Takes about a minute.

## Putting it on GitHub

```bash
cd vs-dashboard
git init
git add .
git commit -m "Virtual Services impact dashboard"
gh repo create vs-impact --public --source=. --push
```

No `gh` CLI? Create an empty repo at github.com/new, then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/vs-impact.git
git branch -M main
git push -u origin main
```

## Putting it on Render

1. Go to **dashboard.render.com** → **New** → **Static Site**
2. Connect your GitHub account and pick the repo
3. Fill in:
   - **Build Command:** leave empty
   - **Publish Directory:** `.`
4. **Create Static Site**

You get a URL like `https://vs-impact.onrender.com`. Free tier, no spin-down for
static sites, HTTPS included. Add a custom domain under **Settings → Custom Domains**
if you want something like `impact.soldiersangels.org`.

Render also reads `render.yaml` automatically if you use the Blueprint flow instead.

## Also works on

Because it's a static file, you can host it anywhere:

- **GitHub Pages** — Settings → Pages → deploy from `main` / root
- **Netlify / Cloudflare Pages** — drag the folder in
- **Anywhere** — email someone `index.html` and it opens offline

## Changing the design

Edit `template.html`, then re-run the refresh script to regenerate `index.html`.
If you edit `index.html` directly, the next refresh overwrites your changes.
