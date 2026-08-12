# Deployed Monthly: No Box Builder

Runs the Soldiers' Angels Virtual Services "Members Without a Box" process in a browser.
Drop in the report exports, confirm the columns, and it builds the No Box list, the Client ID
batches, the statuses, the flags, and the handoff lists for Logistics and Volunteer Services.

**Live tool:** `index.html` &nbsp;·&nbsp; **The written SOP:** `sop.html`

---

## Everything stays on your machine

No file is uploaded, stored, or transmitted. The page has no back end and makes no network
calls. Excel files are read in browser memory and discarded when you close the tab. That is
the reason this repo can be public without exposing anything: it contains code, not data.

**Never commit a report export to this repo.** `.gitignore` blocks spreadsheets by default.

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

## Setting a password

The site is otherwise reachable by anyone with the link. To put a lock on it:

1. Open `set-password.html` and type the password you want.
2. Copy the generated block and paste it over `window.NOBOX_CONFIG` in `config.js`.
3. Commit. Render redeploys in about a minute.

The password is never stored, only a SHA-256 hash of it. Unlocking lasts for the browser tab.
To remove the password, set `passwordHash` back to `''` and commit.

**What this is:** a lock on the front door that keeps casual visitors out.
**What this is not:** encryption. The hash is visible in page source. That trade is fine here
because the site holds code and no member data. If that ever changes, move to real auth
(Cloudflare Access is free for small teams and takes about 20 minutes).

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
index.html          the tool
app.js              parsing, matching, status rules, exports
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
