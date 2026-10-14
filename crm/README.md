# მესაკუთრე CRM

Web CRM for the owner listings collected by the scraper in the parent
folder. Agents log in, filter listings, call owners, record notes, set the
lead status and follow-up date, and see analytics. Everything runs on free
tiers: the collector on GitHub Actions, the app on Vercel, the database on
Supabase (Postgres).

Stack: Next.js 15 (App Router), Prisma, Tailwind, Recharts. Locally the
database is a SQLite file; in production it is Postgres. The same schema is
used for both (`scripts/prepare-schema.mjs` switches the provider from the
`DATABASE_URL`).

## Pages

| Page | What it does |
|---|---|
| `/` | Dashboard: new listings today / 7 / 30 days, phone coverage, lead funnel, per-day chart by site, districts, neighbourhoods, property types, rooms, median $/m² by district, median price by rooms, agent activity, overdue follow-ups, latest listings. |
| `/listings` | All listings with filters (site, deal, type, district, neighbourhood, rooms, price, area, lead status, agent, phone, period, archive), sorting, pagination, CSV export. |
| `/listings/<id>` | Full listing details, owner phone (tap to call, WhatsApp), "I called" button, notes, lead status / agent / follow-up / priority, history, other listings with the same phone. |
| `/owners` | Unique phone numbers with all their listings across sites (one owner with several properties, or one property posted on several sites). |
| `/followups` | Overdue / today / upcoming calls. |
| `/agents` | Agents with their 30-day activity; admins add agents, reset passwords, deactivate accounts. |

Listings come only from the collector (`../collect.py` → `../sync_db.py`).
CRM data (leads, notes, history) lives in separate tables and survives every
sync. Listings that drop out of the collector's scope are archived, not
deleted, so notes stay attached.

## Run locally

```powershell
cd crm
npm install
copy .env.example .env        # defaults are fine locally
npm run db:push               # creates prisma/dev.db
npm run db:seed               # admin user from ADMIN_EMAIL / ADMIN_PASSWORD in .env
npm run dev                   # http://localhost:3000
```

Load listings into the local database from the parent folder:

```powershell
py -3 collect.py
py -3 sync_db.py              # DATABASE_URL defaults to file:./dev.db (crm/prisma/dev.db)
```

## Deploy for free (Supabase + Vercel + GitHub Actions)

1. **Supabase**: create a free project. In *Project Settings → Database*
   copy two connection strings (choose *URI*, fill in your password):
   - *Transaction pooler* (port 6543) → this is `DATABASE_URL`; append
     `?pgbouncer=true`.
   - *Session pooler* or *Direct* (port 5432) → this is `DIRECT_URL`.
2. **Vercel**: import the GitHub repository, set *Root Directory* to `crm`.
   Add environment variables `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`
   (any long random string), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
   Deploy. The build runs `prisma db push`, which creates the tables.
3. **First admin**: run the seed once against the cloud database from your
   computer:

   ```powershell
   cd crm
   $env:DATABASE_URL = "<DIRECT_URL value>"
   $env:ADMIN_EMAIL = "you@example.com"; $env:ADMIN_PASSWORD = "<strong password>"
   npm run db:push
   npm run db:seed
   ```

   Then log in on the Vercel URL and add the other agents on the *Agents*
   page.
4. **GitHub Actions**: add a repository secret `DATABASE_URL` with the
   *Direct* (port 5432) connection string. From then on every scheduled run
   (twice per hour) pushes new listings into the CRM automatically. The
   Excel export keeps working as before.

Free-tier headroom: a 30-day window of Tbilisi owner listings is a few
thousand rows, far below Supabase's 500 MB and Vercel's hobby limits.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` | prepare schema for the current `DATABASE_URL`, generate Prisma client, push schema, build |
| `npm run db:push` | create/update tables |
| `npm run db:seed` | create or update the admin user |
| `npm run typecheck` | TypeScript check |
