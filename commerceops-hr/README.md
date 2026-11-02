# You Team

An employee management system for an e-commerce company that sells on **Shopify,
Amazon, Flipkart and Myntra**. It is a real full-stack application — React +
TypeScript frontend, Express + Prisma API, PostgreSQL database — not a UI mockup.

What makes it specific to multi-channel retail: every employee carries a **sales
channel allocation** (who works on which marketplace, and what share of their
time), and headcount, cost and staffing are reported per channel with split
allocations pro-rated.

---

## Quick start

```bash
git clone <this repo>
cd commerceops-hr

npm install                      # installs root, server and web workspaces

cp server/.env.example server/.env
cp web/.env.example web/.env     # optional; defaults work as-is

npm run db:start                 # starts PostgreSQL (leave this running)
```

Then, in a **second terminal**:

```bash
npm run db:push                  # create the tables
npm run db:seed                  # load the demo organisation
npm run dev                      # start the API and the web app
```

> **Windows PowerShell:** run each line on its own. Windows PowerShell 5.1 has no
> `&&` operator — chaining with it is a parser error. Use `;` if you want them on
> one line, or switch to PowerShell 7+ where `&&` works.

Open **http://localhost:5173** and sign in with:

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@youteam.in` | `Admin@12345` |
| HR manager | `meera.krishnan@youteam.in` | `Welcome@123` |
| Manager | `priya.nair@youteam.in` | `Welcome@123` |
| Employee | `karthik.subramanian@youteam.in` | `Welcome@123` |

Each role sees a different slice of the app — sign in as the employee to see how
much the UI narrows.

> `npm run dev` also starts the database, so after the first setup a single
> `npm run dev` is all you need.

---

## About the database

**You do not need to install PostgreSQL.** `npm run db:start` runs a real
PostgreSQL 18 server from the `embedded-postgres` package, which ships the actual
platform binaries. It listens on **127.0.0.1:5544** and keeps its data between
restarts.

- The cluster is created with **UTF-8** encoding (the host locale would otherwise
  give you WIN1252, which cannot store `₹` or non-Latin-1 names).
- If the project lives in a cloud-synced folder (OneDrive, Dropbox, iCloud), the
  data directory is placed **outside** it — at `~/.commerceops-hr/pgdata` — because
  a sync client will happily corrupt a live database. The startup log says where
  it went. Override with an absolute `EMBEDDED_PG_DATA_DIR`.

### Using your own PostgreSQL instead

Point `DATABASE_URL` in `server/.env` at your instance and skip `db:start`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/commerceops_hr?schema=public"
```

Then run `npm run db:push` and `npm run db:seed`, and start with
`npm run dev:api` + `npm run dev:web` (or just `npm run dev`, which will notice
something is already listening on the port and stay out of the way).

---

## Commands

Run these from the project root.

| Command | What it does |
|---|---|
| `npm run dev` | Database + API + web, all together |
| `npm run build` | Type-check and build both the server and the web app |
| `npm run typecheck` | Type-check both workspaces |
| `npm start` | Run the compiled API (after `npm run build`) |
| `npm run db:start` | Start the bundled PostgreSQL (foreground) |
| `npm run db:stop` | Stop a cluster started by another process |
| `npm run db:push` | Sync the schema to the database |
| `npm run db:migrate` | Create and apply a new migration |
| `npm run db:seed` | Load the demo organisation (clears existing data first) |
| `npm run db:reset` | Drop everything, recreate and re-seed |
| `npm run db:studio` | Open Prisma Studio to browse the data |

There is also an end-to-end API check. With the server running:

```bash
node server/scripts/smoke-test.mjs
```

It exercises authentication and token rotation, every list endpoint, a full
employee create → update → delete cycle, leave approval with balance accounting,
payroll state transitions, and the RBAC rules — 68 assertions in total.

There is a second suite covering attendance specifically:

```bash
node server/scripts/attendance-test.mjs
```

---

## Project layout

```
commerceops-hr/
├── server/                        Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma          The data model
│   │   ├── migrations/            Versioned SQL
│   │   └── seed.ts                Demo organisation
│   ├── scripts/
│   │   ├── pg.ts                  Bundled PostgreSQL lifecycle
│   │   └── smoke-test.mjs         End-to-end API checks
│   └── src/
│       ├── index.ts               Entry point
│       ├── app.ts                 Middleware stack
│       ├── routes.ts              Mounts every module, lists the API
│       ├── config/env.ts          Validated environment (fails fast)
│       ├── lib/                   Prisma client, errors, dates, pagination
│       ├── middleware/            Auth, validation, error handling
│       └── modules/               One folder per domain area
│           ├── auth/ employees/ departments/ attendance/
│           └── leave/ payroll/ channels/ dashboard/ users/ misc/
└── web/                           React + Vite + Tailwind
    └── src/
        ├── App.tsx                Routes and route guards
        ├── lib/api.ts             Axios client with token refresh
        ├── store/auth.ts          Session state and permission helpers
        ├── hooks/use-api.ts       Every query and mutation
        ├── components/
        │   ├── ui/                Button, Field, Table, Modal, Badge, …
        │   ├── layout/            Shell, sidebar, topbar
        │   └── charts/            Chart frame, stat tiles, chart tokens
        └── pages/                 One file per screen
```

---

## The data model

```
User ──1:1── Employee ──* ChannelAssignment   (Shopify / Amazon / Flipkart / Myntra)
 │                │
 │                ├──* Attendance              (unique per employee per day)
 │                ├──* LeaveRequest ──* LeaveType
 │                ├──* LeaveBalance            (entitled vs used, per year)
 │                └──* Payslip ──* PayrollRun
 │
 ├──* RefreshToken                             (hashed, rotated on use)
 ├──* AuditLog
 └──* Announcement

Department ──* Employee        (and one Employee as its head)
Employee   ──* Employee        (self-referencing reporting line)
Holiday                        (excluded from leave-day counts)
```

Money is `Decimal(12,2)` in the database. The API serialises it as a **number**,
so clients never have to parse strings.

---

## What the application does

**Authentication** — email + password, bcrypt hashed. Short-lived JWT access
tokens with refresh tokens that are stored only as SHA-256 hashes and **rotated on
every use**, so a stolen refresh token works at most once. Changing a password
revokes every session. Login attempts are rate-limited separately from the rest
of the API.

**Roles** — `SUPER_ADMIN`, `HR_MANAGER`, `MANAGER`, `EMPLOYEE`. Enforced on the
server; the UI mirrors the same rules only so it doesn't show dead-end buttons.
Employees see their own record, their own attendance and their own payslips;
managers see their teams; HR manages everything; only a super admin can delete an
employee or mint another super admin.

**Employees** — full CRUD with search, filters (department, status, channel,
employment type), sorting and pagination. Reporting lines are cycle-checked, so
A → B → A is rejected. New employees get the current year's leave entitlement
automatically.

**Sales channels** — the e-commerce-specific part. Each employee can be allocated
across the four marketplaces with a percentage split, one marked primary and an
optional per-channel role. Allocation beyond 100% is refused. The channels page
reports headcount, **FTE** and pro-rated annual cost per marketplace.

**Attendance** — self check-in/check-out with a live "currently working" card,
worked hours computed from the two server timestamps (under four hours is recorded
as a half day), monthly summaries and a per-day chart. Details below.

**Leave** — requests count **working days only**, skipping weekends and company
holidays. Overlapping requests are rejected, and so are requests that exceed the
remaining balance. Approval debits the balance and writes on-leave attendance for
each day, in one transaction; cancelling an approved request credits the days back
and removes those rows.

**Payroll** — generates a draft month from each employee's CTC, deriving loss of
pay from recorded absences. Basic 50% of monthly gross, HRA 40% of basic, the rest
special allowance; PF 12% of basic capped at the ₹15,000 wage ceiling, professional
tax ₹200, TDS estimated at 5% of gross above a ₹5L CTC. Runs move
`DRAFT → APPROVED → PAID` and the transitions are enforced — a paid run cannot go
back, and only drafts can be deleted. Any run exports to CSV.

**Dashboard** — headcount KPIs, today's attendance, the approval queue, channel
staffing, a six-month headcount trend, upcoming birthdays and work anniversaries,
holidays and announcements, all in one request.

### Check-in / check-out

The attendance card sits at the top of the dashboard and the attendance page. It
shows today's date, check-in and check-out times, a live working duration, the
current status, and the employee's own history below.

- **The server owns the clock.** Timestamps come from `new Date()` on the API, not
  the browser, so a wrong laptop clock cannot change a punch.
- **UTC in, IST out.** Instants are stored in PostgreSQL in UTC and rendered in
  `Asia/Kolkata` with 12-hour AM/PM, regardless of the viewer's own timezone.
- **The business day is the IST calendar day.** This is the subtle one: IST is
  UTC+05:30, so between 00:00 and 05:30 IST the UTC date is still *yesterday*.
  Keying off the UTC date would file a 01:00 IST check-in against the previous day
  and then accept a second check-in at 09:00. `businessDayFor()` in
  `server/src/lib/dates.ts` is the single place that decides which day a punch
  belongs to.
- **One record per employee per day**, enforced by a unique index on
  `(employeeId, date)`.
- **Concurrency-safe.** Check-in claims the row with an `UPDATE … WHERE checkIn IS
  NULL`, falling back to an `INSERT` that races on the unique index; check-out is an
  `UPDATE … WHERE checkOut IS NULL`. Repeated clicks and simultaneous requests
  produce one record and one 409 — never a duplicate or an overwritten time. The UI
  additionally dedupes in-flight clicks by mutation key.
- **State survives refresh, logout and login**, because `GET /attendance/today`
  derives it from the database on every load rather than from local state.
- **Missing check-out.** A past day that was checked into but never closed is
  flagged `MISSING_CHECKOUT` for HR. A checkout time is **never** invented — the
  record keeps a null checkout and zero worked minutes until a human corrects it.
- **Corrections are audited.** Only HR and super admins can correct a record, a
  reason of at least 10 characters is mandatory, and the before/after values, the
  actor and the reason all go to `AuditLog`.

### Work location and the daily work report

Checking in asks **where** the employee is working: office, home, or other.
Anything other than the office requires a location, enforced both in the request
schema and in the service so it holds for every caller. The location is stored on
the day's attendance row and shown as a badge on the card and in history.

Once checked in, a **work report** section appears on the attendance card:

- Free-text task details plus a status of **Completed**, **In progress** or
  **Pending**.
- Any number of tasks can be added, edited or removed through the day.
- Reports hang off the day's `Attendance` row, not off the employee — so each
  working day automatically starts with an empty report.
- **Checking out locks the day.** The reports stay visible but become read-only;
  add, edit and delete all return 409. The rule lives in `assertWritableDay`,
  which requires the row to be today's, checked in, and not checked out — so a
  past day is never writable again, even through the API.

The dashboard shows headline KPIs and lists; the attendance page carries the
charts.

Visibility follows role: employees see only their own records, managers see
themselves plus their direct reports, HR and super admins see everyone. Asking for
an employee outside your scope returns an empty page rather than a leak.

Run the attendance test suite with the server up:

```bash
node server/scripts/attendance-test.mjs
```

55 assertions covering the lifecycle, duplicate and concurrent punches, the IST
business day, working-hour maths, missing check-outs, correction validation and
auditing, and the role-scoping rules.

---

## API

Everything is under `/api/v1`. `GET /api/v1` returns the full endpoint list, and
`GET /health` reports database connectivity.

Responses are consistently shaped — a single record as `{ "data": … }`, a list as
`{ "data": [...], "meta": { page, pageSize, total, totalPages, … } }`, and errors
as:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Validation failed",
             "details": [{ "field": "workEmail", "message": "Enter a valid work email" }] } }
```

Every request body, query string and path parameter is validated with Zod before
it reaches a controller, and the parsed (coerced) values are what the controller
receives.

---

## Design notes

The UI is a responsive admin console: a fixed sidebar on desktop that becomes an
off-canvas drawer below `lg`, tables that fall back to stacked cards on phones,
and wide content that scrolls inside its own container so the page body never
scrolls sideways.

Light and dark are both **selected** palettes rather than an automatic inversion,
driven by CSS custom properties and stamped onto `<html>` before first paint so a
reload never flashes white.

Charts use three categorical colours validated for the lightness band, chroma
floor, colour-vision-deficiency separation and contrast against this app's own
surfaces. Status is never carried by colour alone — every badge pairs its tone
with the status word, and decision-bearing ones add an icon. Each chart has a
table view toggle, which is both the accessibility fallback and the documented
relief for the one palette step that sits below 3:1 on the light surface.

---

## Configuration

`server/.env` (see `server/.env.example` for the full annotated list):

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS allow-list; comma-separate for several |
| `DATABASE_URL` | bundled PostgreSQL | Any PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | dev value | **Change before deploying** |
| `JWT_REFRESH_SECRET` | dev value | **Change before deploying** |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token lifetime |

The server validates its environment at boot and exits with a readable list of
problems rather than failing later in a confusing way.

`web/.env` only needs `VITE_API_BASE_URL` (default `/api/v1`, proxied by Vite in
development so the browser stays single-origin).

---

## Troubleshooting

**`Cannot reach the database`** — start it with `npm run db:start`, or check
`DATABASE_URL`. `curl http://localhost:4000/health` tells you what the API sees.

**Port 5544 or 4000 already in use** — change `EMBEDDED_PG_PORT` / `PORT` in
`server/.env` (update `DATABASE_URL` to match the new database port).

**The cluster will not start after an unclean shutdown** — remove the data
directory printed at startup and re-run `npm run db:start`, then `npm run db:push`
and `npm run db:seed`.

**`npm run db:seed` wipes data** — by design; it rebuilds the demo organisation
from scratch so it is safe to re-run.

---

## Production build

```bash
npm run build          # server → server/dist, web → web/dist
npm start              # serve the compiled API
```

`web/dist` is a static bundle for any CDN or static host. Before deploying:
set real JWT secrets, point `DATABASE_URL` at a managed PostgreSQL, set
`NODE_ENV=production` (which makes refresh cookies `Secure` and hides internal
error details), set `WEB_ORIGIN` to the deployed frontend, and apply migrations
with `npm run db:deploy --workspace server` rather than `db:push`.
