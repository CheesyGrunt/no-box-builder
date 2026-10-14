# Community Support Program Numbers
Soldiers' Angels food programs dashboard: MVFDs + food pantries in one place.

**What it shows:** every client who attended an MVFD or pantry this year (counted once, at their first visit), first-timers per session and month, who attended both, how often they came (click any bucket to see names + emails), attendance per session, pounds, food value, in-kind (slot ready), households, client status by site, and Community Support numbers.

## Two passwords
| Password | Who | Opens |
|---|---|---|
| Viewer | Staff | The dashboard (`index.html`), including client names and emails |
| Admin | You | The Kitchens (`kitchens.html`) and Change Passwords (`passwords.html`) |

All data is published as `data/hall.enc.json`, encrypted (AES-256-GCM) with the viewer password. Without it the file is unreadable, so the numbers and names are protected even though Render serves the site publicly. The viewer password itself is stored in `data/keys.enc.json`, encrypted with the admin password, so the Kitchens can re-lock new data without you retyping it. Raw reports are never uploaded (`.gitignore` blocks .xls/.xlsx/.csv).

To change either password: Kitchens > **Change passwords** (or go to `/passwords.html`).

## Files
| Path | What it is |
|---|---|
| `index.html` | The dashboard (viewer password) |
| `kitchens.html` | The Kitchens: update page (admin password) |
| `passwords.html` | Change the viewer and/or admin password |
| `config.js` | Year, household cap, GitHub repo for publishing |
| `assets/processor.js` | Reads the reports and does all the math (browser + Node) |
| `assets/github.js` | Publishing + saved-token helpers for the admin pages |
| `assets/app.js`, `assets/kitchens.js`, `assets/styles.css` | Page code and styling |
| `data/hall.enc.json` | Locked data (created by your first Kitchens publish) |
| `data/keys.enc.json` | Locked keyring (created by your first Kitchens publish) |
| `scripts/build.js` | Optional command-line version of the Kitchens |

## Reports it reads (Salesforce exports)
1. 2026 - Pantry Total Value Pounds: pantry session pounds + value
2. 2026 - MVFD Value Pounds: MVFD session pounds + value
3. 2026 Pantry Attended Clients: who came to each pantry
4. 2026 MVFD Attended Clients: who came to each MVFD
5. 2026 - MVFD Stats: household size, ages, military, ethnicity, race (MVFD clients)
5b. 2026 Pantry Attended Client Stats: the same breakdown for pantry clients
6. 2026 Community Support: monthly manual entries
7. In-kind (optional): any report with an in-kind/value/amount column

Detection is by file name + column headers, so new export dates in the file name are fine.

## First time
1. Open `your-site.onrender.com/kitchens.html`. It asks you to set the admin and viewer passwords.
2. Drop in the 7 reports, **Process reports**, paste your GitHub token, **Publish to GitHub**.
3. Wait about a minute, open the dashboard, enter the viewer password.

## Updating (every time)
1. In the Kitchens, click **Open all reports** (links live in `config.js`), then export each one: Export > Details Only > Excel.
2. On the dashboard, click **Update data** (top right) and enter the admin password.
3. Drop all 7 files in the box. Every slot should turn green.
4. Click **Process reports** and check the tiles and the "give these a look" list.
5. Click **Publish to GitHub**. Render redeploys in about a minute.

No token handy? Click **Download files instead**, then in GitHub open `data` > Add file > Upload files > drop `hall.enc.json` + `keys.enc.json` > Commit.

## GitHub token (one time)
GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
- Repository access: Only select repositories > `sa-food-impact`
- Permissions: Contents = Read and write
- Expiration: 1 year (set a reminder)

Paste it in the Kitchens once with "Remember" checked; it's stored on that computer locked with the admin password.
