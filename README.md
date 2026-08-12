# Deployed Monthly: No Box Builder

Runs the Soldiers' Angels Virtual Services "Members Without a Box" process in a browser.
Drop in the report exports, confirm the columns, and it builds the No Box list, the Client ID
batches, the statuses, the flags, and the handoff lists for Logistics and Volunteer Services.

| Page | Who it is for |
|---|---|
| `index.html` | **Everyone.** Team password, then this month's list. The Run new report button appears here for whoever has the admin password. |
| `build.html` | **You.** The monthly run and publishing. Reached through Run new report. |
| `sop.html` | The written SOP. |
| `set-password.html` | Sets the team password. |

---

## How the data is protected

Report exports are read in browser memory and never uploaded. When you publish, the finished
list is encrypted **in your browser** with AES-256-GCM, using a key derived from the team
password via PBKDF2 (250,000 iterations). Only the ciphertext is committed, as
`data/latest.enc`. Staff decrypt it in their own browser when they type the password.

So a leaked URL does not leak member data. The file is unreadable without the password.

What this does not protect against:

- Anyone who has the password. Treat it like a door key and reissue it when people leave.
- Git history. Once an encrypted file is committed it is in the history for good. If the
  password is ever exposed, rotate the password **and** republish, and treat the old file as
  compromised.
- Anything staff export. A downloaded .csv is plain text on their machine, same as an emailed
  spreadsheet would be.

**Make the repo private anyway.** Encryption is the control that matters, but there is no
reason to publish even ciphertext to the world. Render deploys from private repos.

**Never commit a raw report export.** `.gitignore` blocks spreadsheets by default.

---

## Running it

**Locally:** download the repo and open `index.html` in Chrome or Edge. That is all it takes.

**On GitHub Pages:** Settings → Pages → Build and deployment → Deploy from a branch →
`main` / `/ (root)` → Save. The site appears at
`https://<your-username>.github.io/<repo-name>/` within a minute or two.

Pages on a free account only publishes from a public repo. Since no data lives here, public is
fine. If the repo must stay private, skip Pages and open `index.html` locally instead, or use a
paid plan.

---

## The flow

| Stage | You do | The tool does |
|---|---|---|
| 1 | Set the reporting month. Drop in Deployed Report + Details | Applies the Got a Box rule, builds the No Box list, pulls Client IDs, reports coverage |
| 2 | Copy each batch into the Part 2 filter | Splits Client IDs into batches of 70 |
| 3 | Drop in Part 2 + Currently Waitlisted | Fills dates, names, addresses. Sets Status. Applies gold, blue, purple, red |
| 4 | Review flags, export | Builds the workbook and the two handoff lists |

Steps that are gone because the tool does them: the Got a Box formula, Prompts 1 through 6,
the `[Current Month]` swap, and hard-coding the tab. Values are written directly, so no
formulas ever exist to convert.

Steps that stay human: pulling the reports with the right filters, and clearing the purple and
red flags before anything ships.

---

## Two passwords

| Password | Who has it | What it does |
|---|---|---|
| **Team** | Everyone | Opens the list. Also the encryption key for the published file. |
| **Admin** | You | Unlocks **Run new report**. Nobody else can overwrite what staff see. |

Set both at once in `set-password.html`, paste the block into `config.js`, commit.

Rotating the team password means two steps: change `config.js` **and** republish, or staff
will hit a file they cannot open. Rotating the admin password is just `config.js`.

## Publishing each month

Everything happens on the live site. No downloads, no GitHub tab.

1. Sign in at the home page with the team password. You see the current month, same as staff.
2. Click **Run new report**, enter the admin password.
3. Run stages 1 through 4.
4. Stage 5: enter the team password, click **Publish to the live site**.

That encrypts in your browser, commits `data/latest.enc` through the GitHub API, and Render
redeploys. About a minute later staff see the new month.

**One-time setup for that button:** a GitHub fine-grained access token with **Contents:
Read and write** on this one repo. The builder page has step-by-step instructions in a
drop-down. The token goes in the page, never in the repo. Tick Remember and you type it once.

If GitHub is unreachable or the token expires, the same panel has a manual fallback that
downloads the encrypted file so you can upload it by hand.

## Column mapping

Every file panel has a mapping block: sheet, header row, and one dropdown per field. Defaults are set
from real exports: Deployed Report header on row 17 with client names in B and the Completed
Record Count in H, Details with client name in L, Contact ID in K, and Mail Stop Date in H.
The tool also matches on header text, so it usually lands on the right columns by itself.

The Completed Record Count column is deliberately **not** auto-detected. That report repeats the
header "Record Count" three times, once per status group, and only the middle one is the right
answer. It stays pinned to H and shows you the resulting no-box count so you can confirm it.

Part 2 addresses can arrive either as one combined "Client Address" field or as separate street,
city, state, and zip columns. The tool handles both. If a combined column is mapped it wins, and
the street/city/state/zip are pulled out of it.

Under each file it prints the row count and two sample names. **If that count looks wrong, the
mapping is wrong.** Fix it there before building.

Your mapping is remembered in the browser, so you set it once and it sticks. When the source
system moves a column, change the dropdown instead of touching code.

---

## Status rules

Applied in priority order, matching the SOP:

1. Name appears on the Currently Waitlisted report → **Waitlisted** (gold)
2. Service Delivery is "Yes" and Report by Date falls in the reporting month → **Needs Angel Contact** (blue)
3. Everything else → **Unsupported, send Box**

Flags layered on top:

- **Red**: Mail Stop Date falls in the reporting month. Confirm eligibility before shipping.
- **Purple**: mailing city is filled in but is not APO, FPO, or DPO. Verify the address.

The Logistics list holds back red, purple, and missing-address rows by default. Uncheck the
box to see them.

---

## Files

```
index.html          staff viewer
build.html          the builder
viewer.js           fetch, decrypt, render for staff
core.js             shared helpers, views, exports, encryption
app.js              parsing, matching, status rules, publishing
data/latest.enc     the published list, encrypted
styles.css          styling for every page
config.js           your password hash, the one file you edit
gate.js             the lock screen
set-password.html   generates the hash for a password you pick
sop.html            the written SOP
vendor/       SheetJS (reads exports) and ExcelJS (writes styled workbooks)
```

Libraries are vendored on purpose, so the tool works with no internet connection.

---

## If something looks off

| What you see | What is probably wrong |
|---|---|
| Row count under a file reads 0 | Wrong sheet or wrong header row. Fix it in that file's mapping block. |
| Client IDs come back blank | The name column in Details is not pointing at the client name, or names differ between reports. |
| Nobody is gold | The waitlist file is not loaded, or its name column is mapped to the wrong column. |
| Nobody is blue | Reporting month is set wrong, or Part 2 exported without Status and Report by Date. |
| Addresses are blank | Part 2 street/city/state/zip columns are mapped wrong, or that batch did not export. |
| Lots of purple | The address pull grabbed home addresses instead of military ones. Recheck the Part 2 export. |

---

Process questions go to the Director of Virtual Services.
