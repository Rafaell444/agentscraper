# Real-estate listings monitor

Watches several Georgian property websites and records every **newly posted
Tbilisi** listing, by **owners (მესაკუთრე) and agents alike**, for every
deal type (sale, rent, daily rent, mortgage) and property type (apartments,
houses, land, commercial). Each listing is marked with who posted it, and
postings of the same property (other sites, other posters, other prices)
are linked together. The data lives in the CRM database (Supabase) and is
also exported to one Excel workbook, `properties.xlsx`, with **one tab per
website**.

"Newly posted" means the ad was created at most `NEW_WITHIN_DAYS` (default 2)
days before the monitor first saw it, so old ads that are merely bumped to
the top are ignored. Rows are kept for `MAX_AGE_DAYS` (default 30) after
their last update on the site. The scope is configurable: `FILTER_CITY=""`
keeps every city, `OWNERS_ONLY=1` restricts the feeds to direct owners,
`NEW_WITHIN_DAYS=0` keeps bumped ads too. Phone numbers written inside a
listing's text are extracted automatically.

| Tab          | Website                  | Notes |
|--------------|--------------------------|-------|
| `MyHome`     | myhome.ge                | Site filter: Tbilisi, owner listings. Phones are masked on the site; `phone_enricher.py` reveals them through the site's own button. |
| `SS.ge`      | home.ss.ge               | Site filter: Tbilisi, individual posters. Phone and building details come from each detail page. |
| `binebi.ge`  | binebi.ge                | Site filter: Tbilisi. The owner/agent flag is only on the detail page, so every listing is read once. |
| `place.ge`   | place.ge                 | Small portal; phone and owner/agent flag are on the list page. |
| `rentals.ge` | rentals.ge               | Expat-oriented agency site; read through the public data API its own pages use. All posts are agency posts. |

Not added: livo.ge is the same TNET database as MyHome (identical listing
IDs), so it would only duplicate MyHome posts.

Optional, collected only with `--sites housing,makler` and not in the
owners-only scope: housing.ge never says who posted an ad, and makler.ge is an
agency. Sites checked and skipped: livo.ge (same TNET database as MyHome,
same listing IDs), korter.ge (aggregates MyHome/SS.ge ads), saxli.ge (stale),
and agency sites such as tbilisihome.ge or rentals.ge.

## CRM web app

The `crm/` folder contains a web CRM for agents: owner/agent tabs, filters,
call tracking, manual phone entry (for MyHome, whose numbers can only be
revealed by a person), notes, lead statuses, follow-ups, posters grouped by
phone, "same property posted N times" with prices per copy, analytics,
clients (tourists/expats we represent) with automatic matching, shortlists
and alerts (`notify.py` runs in the cloud after each collection and notifies
the assigned agent in the CRM and on Telegram), a publishing queue that
posts listings with our contact to Telegram/Facebook (`publish.py`), public
QR-code pages per target group (`/p/indian`, `/p/students`, `/p/tourists`,
`/p/ru`) and a public card per listing (`/p/l/<id>?lang=en|ru|ka`), a price
benchmark on every listing against the neighbourhood median, a market page
(median $/m², rents, new owner posts, days on market per area), a viewing
calendar with conflict warnings, deals with commission and monthly report per
agent, and one-tap WhatsApp templates in Georgian, English and Russian. It runs locally on SQLite and
deploys for free to Vercel with a Supabase Postgres database, which is also
where the collector writes. See [crm/README.md](crm/README.md).

## MyHome phone numbers

MyHome shows phones only after a logged-in click behind Cloudflare's bot
check, which never completes for an automated browser (tested from GitHub,
Tor and a home connection). The cloud run therefore does not try; agents open
the ad, press "ნომრის ნახვა" and type the number into the listing's manual
phone field in the CRM. `phone_enricher.py` is kept for manual local use.

## Columns

Property ID, Link, Title, Deal Type, Property Type, Status (new/old build),
Condition (renovation), City, District, Neighbourhood, Address, Area m2, Yard
Area m2, Rooms, Bedrooms, Bathrooms, Floor, Total Floors, Price USD, Price GEL,
Price per m2 USD, Owner Type (მესაკუთრე / აგენტი / ბროკერი / დეველოპერი ...),
Owner Name, Phone Number, Agency, VIP, Posted, Updated, Description, Image,
Timestamp Added, Detail Status. A field a site does not publish stays blank.

## How it runs

GitHub Actions runs `.github/workflows/monitor.yml` twice per hour (minutes 13
and 43; GitHub schedules are best-effort and can start late):

1. `collect.py` reads every site's feed, newest first. The first run for a
   site backfills `BACKFILL_PAGES` result pages (default 50); later runs read
   `DELTA_PAGES` pages (default 10) and stop early once two consecutive pages
   contain nothing new. Existing rows are updated in place (price changes,
   bumps), new rows are appended. Sites that need a detail page read up to
   `DETAIL_LIMIT` (default 150) of them per run, newest first. Per-site
   overrides: `SSGE_DETAIL_LIMIT`, `PLACE_BACKFILL_PAGES`, and so on.
2. `phone_enricher.py` reveals up to `PHONE_BROWSER_RETRY_LIMIT` (12) MyHome
   phone numbers per run, owner listings first (`--all-owner-types` includes
   agencies).
3. `build_workbook.py` writes `properties.xlsx` from the database. It is
   uploaded as a workflow artifact (`properties-xlsx`, kept 14 days) and
   synchronized to Google Drive.

Nothing is committed by the workflow: the CRM database (`DATABASE_URL`
secret) is the single store, which keeps the repository free of personal
data and lets it be public. Without `DATABASE_URL` (local experiments) the
collector falls back to `data/<site>.csv` files, which are git-ignored.

## Local use

```powershell
py -3 -m pip install -r requirements.txt
py -3 collect.py                       # all sites, then builds properties.xlsx
py -3 collect.py --sites myhome,ssge --delta-pages 3 --detail-limit 20
py -3 build_workbook.py                # rebuild the workbook only
```

Set `VERIFY_TLS=0` only on a local network that injects an HTTPS-inspection
certificate; CI always validates certificates.

If a site rate-limits your IP (housing.ge does this quickly), route the
collector through a running Tor Browser. Tor Browser opens a SOCKS proxy on
port 9150 while it is open; no browser extension is needed:

```powershell
$env:PROXY_URL = "socks5h://127.0.0.1:9150"
py -3 collect.py --sites housing
```

`PROXY_URL` accepts any http, https or socks5 proxy URL.

## One-time MyHome login setup

Most phone reveals require a logged-in MyHome/TNET session. On your computer:

```powershell
py -3 capture_myhome_session.py
```

Log in in the Chrome window. After MyHome shows the authenticated state, the
browser closes automatically and creates `myhome-storage-state.b64.txt`. Copy
its entire contents to the GitHub repository secret named
`MYHOME_STORAGE_STATE_B64`:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Never commit or share either generated session file. Repeat this step when the
MyHome session expires. Paste the file contents as the secret value, not the
file name or path. If MyHome rejects the saved session on GitHub's runner, add
`MYHOME_EMAIL` and `MYHOME_PASSWORD` as repository secrets (both together; the
workflow rejects a partial pair). Interactive CAPTCHA challenges are not
bypassed.

## Google Drive synchronization

The recommended permanent setup uses the included `google_drive_webapp.gs`
Apps Script receiver. Deploy it as a web app running as your Google account,
then add `GOOGLE_DRIVE_WEBHOOK_URL` and `GOOGLE_DRIVE_UPLOAD_TOKEN` as GitHub
repository secrets. Use the deployed web-app URL ending in `/exec`, not the
Apps Script editor URL.

The older desktop OAuth method remains supported through
`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and
`GOOGLE_DRIVE_REFRESH_TOKEN`. If neither method is configured, Drive
synchronization is skipped without stopping the run.

## Running in the cloud only

Everything runs on GitHub's servers; your computer can stay off and no AI
model is involved. Push the repository and the schedule takes over. Open the
repository's `Actions` page, select **Collect real-estate listings**, and
choose **Run workflow** to start a run by hand. Check the log for one
`mode=... total=...` line per site, then download the `properties-xlsx`
artifact or open the Drive copy.

The manual run accepts two optional inputs for a one-off deeper crawl:
`backfill_pages` (result pages to read per site, for example `300`) and
`detail_limit` (detail pages to read per site in that run, for example
`3000`). Such a run may take hours; it saves progress every 25 pages and 100
detail pages, and the scheduled runs continue from wherever it stopped.
