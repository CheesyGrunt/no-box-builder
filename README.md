# Deployed Monthly: No Box Builder

Runs the Soldiers' Angels Virtual Services "Members Without a Box" process in a browser.
Drop in the report exports, confirm the columns, and it builds the No Box list, the Client ID
batches, the statuses, the flags, and the handoff lists for Logistics and Volunteer Services.

| Page | Who it is for |
|---|---|
| `index.html` | **Staff.** Password, then read this month's list. No uploading. |
| `build.html` | **Director of Virtual Services.** Runs the monthly process and publishes. |
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

## The team password

One password does two jobs: it gates `build.html` and `sop.html`, and it is the encryption key
for the published list. Set it once:

1. Open `set-password.html`, type the password, hit Generate.
2. Paste the block over `window.NOBOX_CONFIG` in `config.js`. Commit.
3. Use that same password when you publish. The builder refuses to publish with a different
   one, so staff can never be locked out of a file you posted.

To rotate it: set a new one in `config.js`, then republish `latest.enc` with the new password.
Both steps, or staff will hit a file they cannot open.

## Publishing each month

1. Open **build.html** on the live site, not off your hard drive. Encryption needs a secure
   page, and a local file is not one.
2. Run stages 1 through 4 as usual.
3. Stage 5: type the team password, click **Encrypt and download**. You get `latest.enc`.
4. In GitHub, open the `data` folder, **Add file → Upload files**, drop in `latest.enc`,
   commit. It replaces last month's.
5. Render redeploys in about a minute. Staff see the new month next time they open the page.

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
