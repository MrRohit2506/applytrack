# ApplyTrack — Authentication, Applications, Analytics, CSV, Reminders (Phases 1–4)

MERN app (React + Vite + Tailwind / Express / MongoDB + Mongoose).
**Phase 1:** registration, login, logout, cookie sessions, protected routes. **Phase 2:** per-user job-application CRUD with
search, status/date filters, sorting and server-side pagination. **Phase 3:** analytics dashboard, CSV export/import, in-app deadline
reminders and UI polish. **Phase 4:** tests, security hardening and deployment preparation (nothing has been deployed). Status, verification evidence and the security review: see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

## Architecture

| Concern | Choice |
|---|---|
| Session | Signed JWT (HS256, 7-day default) in an **HttpOnly** cookie `applytrack_session`, `Path=/api`. Never returned in bodies, never in localStorage/sessionStorage. |
| Revocation | `User.tokenVersion` is embedded in the JWT and checked against the DB on every protected request. **Logout increments it**, so the old cookie is useless even if replayed. *Limitation:* logout signs the user out of **all** their devices. |
| Passwords | `bcryptjs` (pure JS, no native build), cost 12 (configurable), 8–72 bytes, ≥1 letter + ≥1 number. Stored in `passwordHash` (`select: false`). |
| CSRF | HMAC-signed double-submit token (`GET /api/auth/csrf` → `X-CSRF-Token` header) **plus** an `Origin` allow-list check on all unsafe methods. Works for same-site and cross-site deployments (does not rely on `SameSite` alone). |
| CORS | Explicit origins from `CLIENT_ORIGIN`, `credentials: true`, never `*`. |
| Rate limiting | `/api/auth/login` and `/register`: 10 / 15 min / IP (`AUTH_RATE_LIMIT_MAX`). Failed logins: 10 / 15 min / **account** (`LOGIN_FAILURE_LIMIT`). Whole API: 1000 / 15 min / IP (`API_RATE_LIMIT_MAX`). |
| Validation | Zod (server schemas in `server/src/validation`, mirrored client-side in `client/src/lib/validators.js`). |
| Dev networking | Vite proxies `/api` → `http://localhost:5000`, so dev is same-origin and cookies work with `SameSite=Lax`. |

### Folder structure
```
applytrack/
├── package.json            # convenience scripts (install:all, test, build, ...)
├── server/
│   ├── .env.example
│   ├── src/
│   │   ├── server.js       # connect DB, init indexes, listen, graceful shutdown
│   │   ├── app.js          # helmet, CORS, body limit, cookies, routes, error handling
│   │   ├── config/         # env.js (validated env), db.js
│   │   ├── models/User.js
│   │   ├── controllers/auth.controller.js
│   │   ├── routes/         # index, auth, health
│   │   ├── middleware/     # auth, csrf, rateLimiters, validate, errorHandler
│   │   ├── validation/auth.schemas.js
│   │   └── utils/          # AppError, asyncHandler, cookies, token
│   └── tests/              # env.setup.js, auth.test.js (Vitest + Supertest)
└── client/
    ├── .env.example
    └── src/
        ├── main.jsx, App.jsx, index.css
        ├── lib/            # apiClient.js, validators.js
        ├── context/AuthContext.jsx
        ├── components/     # ProtectedRoute, PublicOnlyRoute, FormField, Alert, ...
        ├── pages/          # Login, Register, Dashboard, NotFound
        └── test/           # Vitest + Testing Library
```

## Prerequisites
- Node.js ≥ 20 (see `.nvmrc`; developed against Node 22) and npm ≥ 10
- MongoDB, either:
  - **Local:** install MongoDB Community, or `docker run -d --name applytrack-mongo -p 27017:27017 mongo:7`
    → `MONGODB_URI=mongodb://127.0.0.1:27017/applytrack`
  - **Atlas:** create a free cluster, add a DB user, allow your IP in *Network Access*, and copy the
    `mongodb+srv://…` string into `MONGODB_URI`.

## Setup
```bash
# 1. install
npm run install:all            # or: npm --prefix server install && npm --prefix client install

# 2. configure the server
cp server/.env.example server/.env
#   generate two DIFFERENT secrets and paste them in as JWT_SECRET and CSRF_SECRET:
openssl rand -hex 32
openssl rand -hex 32
#   set MONGODB_URI

# 3. (optional) client config — defaults already work with the dev proxy
cp client/.env.example client/.env

# 4. run (two terminals)
npm run dev:server             # http://localhost:5000
npm run dev:client             # http://localhost:5173  <- open this
```
The server **refuses to start** (exit code 1) if env validation fails or MongoDB is unreachable. There is no mock-DB mode.

## Commands
| Task | Command |
|---|---|
| Install everything | `npm run install:all` (then commit the generated `package-lock.json` files) |
| Start API (watch) | `npm run dev:server` |
| Start client | `npm run dev:client` |
| Start API (prod) | `npm run start` |
| All tests | `npm test` (server then client) |
| Server / client tests only | `npm run test:server` / `npm run test:client` |
| Lint (ESLint, both packages) | `npm run lint` |
| Production client build | `npm run build` (output: `client/dist`) |
| Lint + tests + build | `npm run verify` |
| Validate environment (no start, no DB, prints a non-secret summary) | `NODE_ENV=production npm run check:env` |
| Dependency audit (runtime deps, high+) / everything | `npm run audit` / `npm run audit:all` |
| Read-only smoke test of a running API | `npm run smoke -- https://api.example.com https://app.example.com` |

## Environment variables
**Server** (`server/.env` locally; the hosting platform's environment settings in production; template: `server/.env.example`). The server refuses to start, with a message that never contains secret values, if validation fails (`npm run check:env` runs the same validation).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | prod: yes | `development` | `production` enables secure cookies and the strict checks below |
| `PORT` | no | `5000` | Listen port (Render and most hosts inject it) |
| `MONGODB_URI` | **yes** | – | Atlas/local connection string. In production it **must name the database** (`…mongodb.net/applytrack?…`); an empty name would silently use MongoDB's default `test` database, so startup fails; `test`/`admin`/`local`/`config` are refused too |
| `JWT_SECRET` | **yes** | – | ≥ 32 random chars (`openssl rand -hex 32`); placeholders starting `CHANGE_ME` are rejected |
| `CSRF_SECRET` | **yes** | – | ≥ 32 random chars, **different** from `JWT_SECRET` |
| `CLIENT_ORIGIN` | **yes** | – | Comma-separated exact browser origin(s) allowed by CORS and the CSRF Origin check, e.g. `https://app.example.com`. No wildcard, no path; `https://` is mandatory in production |
| `COOKIE_SAMESITE` | no | `lax` | `lax` (same-site) or `none` (cross-site; needs HTTPS) or `strict` |
| `COOKIE_SECURE` | no | `true` in production, else `false` | Must not be `false` in production |
| `COOKIE_DOMAIN` | no | host-only | Only set to share the cookie across subdomains |
| `SESSION_TTL_HOURS` | no | `168` | Session lifetime (cookie and token) |
| `BCRYPT_ROUNDS` | no | `12` | Password hashing cost (4–15) |
| `TRUST_PROXY` | no | `0` | Number of proxies in front of the app. **Must match your hosting** (see Deployment); a warning is logged in production when it is `0` |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MINUTES` | no | `10` / `15` | Login/register attempts per IP per window |
| `LOGIN_FAILURE_LIMIT` | no | `10` | Failed logins per account (email) per window |
| `API_RATE_LIMIT_MAX` | no | `1000` | Requests per IP per 15 min for the whole API |
| `REMINDER_WINDOW_DAYS` | no | `7` | Default reminder look-ahead (1–90) |
| `IMPORT_MAX_BYTES` / `IMPORT_MAX_ROWS` | no | `1048576` / `1000` | CSV import limits |
| `TEST_MONGODB_URI` | tests only | in-memory DB | Optional separate **test** database (name must contain `test`). Never set this in production |

**Client** (build-time, **public**: anything `VITE_*` is bundled into the JavaScript, so never put a secret there): `VITE_API_BASE_URL` (default `/api`, a same-origin path; a full `https://api…/api` URL for a cross-origin API), `VITE_DEV_API_TARGET` (dev proxy target only).

## API
All responses are JSON: success `{ "data": … }`, error `{ "error": { "code", "message", "fieldErrors"? } }`.
Unsafe requests (POST) need cookie `applytrack_csrf` (set by `/api/auth/csrf`) and header `X-CSRF-Token`.

| Method & path | Auth | Success | Errors |
|---|---|---|---|
| `GET /api/health` | – | `200 {status, database, uptimeSeconds}` | `503` if DB down |
| `GET /api/auth/csrf` | – | `200 {csrfToken}` | |
| `POST /api/auth/register` `{name,email,password}` | – | `201 {user}` + session cookie (signs in) | `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `403 CSRF_INVALID`, `429` |
| `POST /api/auth/login` `{email,password}` | – | `200 {user}` + session cookie | `400`, `401 INVALID_CREDENTIALS` (generic), `403`, `429` |
| `POST /api/auth/logout` | – | `200 {message}`; cookie cleared, token revoked | `403` |
| `GET /api/auth/me` | cookie | `200 {user}` | `401 UNAUTHENTICATED` |

Also: `400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE` (10 kb limit), `404 NOT_FOUND`.
`user` = `{ id, name, email, createdAt, updatedAt }` — the hash and `tokenVersion` are never serialised.

### Sample requests (curl)
```bash
J=/tmp/jar.txt; API=http://localhost:5000/api
TOKEN=$(curl -s -c $J $API/auth/csrf | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
curl -s -b $J -c $J -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"Sup3rSecret!"}'
curl -s -b $J $API/auth/me
curl -s -b $J -c $J -X POST $API/auth/logout -H "X-CSRF-Token: $TOKEN"
curl -s -b $J $API/auth/me        # -> 401
```

## Manual verification checklist
1. `GET http://localhost:5000/api/health` → `database: "connected"`.
2. Register at `/register` → redirected to `/dashboard`. DevTools → Application → Cookies: `applytrack_session` is
   **HttpOnly**; Local/Session Storage are empty.
3. In `mongosh`: `db.users.findOne()` → `passwordHash` begins with `$2`, no plaintext.
4. Register the same email again → "An account with this email already exists."
5. Refresh `/dashboard` → still signed in (spinner, no content flash).
6. Sign out → back at `/login`; opening `/dashboard` redirects to `/login`; `GET /api/auth/me` → 401.
7. Wrong password → generic "Invalid email or password." for both wrong password and unknown email.
8. Stop the API, reload → "We couldn't reach the server" with *Try again* (not a redirect to login).

---
# Phase 2 — Application management

## What was added
```
server/src/constants/applicationStatus.js     statuses + sort allowlist (single source of truth, server)
server/src/models/Application.js              Mongoose model + indexes
server/src/validation/application.schemas.js  Zod schemas (create, update, list query)
server/src/services/applicationQuery.js       pure filter/sort/pagination/serialisation helpers
server/src/controllers/application.controller.js, routes/application.routes.js
server/src/middleware/validateObjectId.js     strict 24-hex id check
server/src/utils/dates.js                     calendar-date parse/format
server/tests/{applications,applicationQuery,dates}.test.js, helpers.js
client/src/pages/ApplicationsPage.jsx         + components/{ApplicationsTable,ApplicationCards,ApplicationFilters,
                                                ApplicationFormModal,ConfirmDeleteDialog,Pagination,Modal,StatusBadge,
                                                DashboardLayout,FormControls}.jsx
client/src/hooks/useApplications.js, context/ToastContext.jsx, lib/{applicationConstants,applicationValidators,dates}.js
```
Modified Phase 1 files: `validate.js` (query support + unknown-field errors), `errorHandler.js` (Mongoose errors → safe 400),
`app.js` (CORS now allows PATCH/DELETE; API limiter configurable), `routes/index.js`, `env.js`, `rateLimiters.js`,
`client/src/lib/apiClient.js` (query strings + `api.applications.*`), `App.jsx`, `main.jsx`, `DashboardPage.jsx`
(header extracted into `DashboardLayout`). No new dependencies.

## Data model (`Application`)
| Field | Type / rule |
|---|---|
| `userId` | ObjectId → User, required, **immutable**, set from the session only |
| `company`, `role` | required, trimmed + internal whitespace collapsed, ≤ 120 chars, case preserved |
| `applicationDate` | required calendar date |
| `deadline` | optional calendar date (`null` = none) |
| `status` | `Applied` \| `Interview` \| `Offer` \| `Rejected` \| `Withdrawn` (default `Applied`) |
| `jobUrl` | optional, `http(s)` only, ≤ 2048 (`""` = none) |
| `notes` | optional, ≤ 2000 (`""` = none) |
| `createdAt`/`updatedAt` | Mongoose timestamps |

**Optional-field policy:** omitted = default (create) / unchanged (PATCH); `""` or `null` = clear. Responses always return
`deadline: null`, `jobUrl: ""`, `notes: ""` for empty values. `userId` is never returned.

**Calendar dates:** `applicationDate`/`deadline` are dates, not instants. Wire format is `YYYY-MM-DD` (strict; years 1900–2100),
stored at 00:00 UTC, serialised from UTC parts, and the UI formats them from the string parts, so no timezone can shift a day.
Range filters are **inclusive** on both ends.

**Indexes** (all start with `userId`, since every query is ownership-scoped):
1. `{userId, applicationDate:-1, _id:-1}` default list order and date-range filter
2. `{userId, status:1, applicationDate:-1, _id:-1}` status filter + default order
3. `{userId, deadline:1, _id:-1}` deadline filter/sort

Not indexed on purpose: `company`/`role` (case-insensitive *substring* search can't use a B-tree index; it is already narrowed to one
user's rows), `jobUrl`, `notes`. No uniqueness rule: applying to the same company twice is allowed.

## API (all require the session cookie; unsafe methods also need `X-CSRF-Token`)
Success: `{ "data": … }`. Error: `{ "error": { "code", "message", "fieldErrors"? } }`.

| Method & path | Success | Notable errors |
|---|---|---|
| `GET /api/applications` | `200 { data: { applications: [...], pagination: { page, limit, total, totalPages } } }` | `400` invalid query, `401` |
| `POST /api/applications` | `201 { data: { application } }` | `400` validation / unknown field, `401`, `403` CSRF |
| `GET /api/applications/:id` | `200 { data: { application } }` | `400 INVALID_ID`, `401`, `404` |
| `PATCH /api/applications/:id` | `200 { data: { application } }` | `400`, `401`, `404` |
| `DELETE /api/applications/:id` | `200 { data: { id, message } }` | `400`, `401`, `404` |

`application` = `{ id, company, role, applicationDate, deadline, status, jobUrl, notes, createdAt, updatedAt }`.

**Create** body: `company`, `role`, `applicationDate` required; `deadline`, `status`, `jobUrl`, `notes` optional.
**PATCH** body: any subset of those fields (at least one); `deadline`/`jobUrl`/`notes` accept `null`/`""` to clear.
Bodies are **strict**: unknown or protected keys (`userId`, `_id`, `id`, `createdAt`, …) → `400` with a per-field error. Nothing is silently dropped.

**List query parameters** (unknown parameters → `400`; empty values are treated as unset):

| Param | Meaning | Default / limits |
|---|---|---|
| `search` | case-insensitive literal substring in company **or** role | ≤ 100 chars |
| `status` | one or more statuses: `status=Offer&status=Applied` or `status=Offer,Applied` | any of the five |
| `applicationDateFrom`, `applicationDateTo` | inclusive `YYYY-MM-DD` range (either end optional) | `from` ≤ `to` else 400 |
| `deadlineFrom`, `deadlineTo` | inclusive range; **applications without a deadline never match** an active deadline filter | same |
| `sortBy` | `applicationDate` \| `deadline` \| `company` \| `status` | `applicationDate` |
| `sortOrder` | `asc` \| `desc` | `desc` for applicationDate, otherwise `asc` |
| `page` | whole number ≥ 1 | `1` (max 100000) |
| `limit` | whole number 1–100 | `10` |

Sorting rules: ties break by newest-created first (stable pagination); `company` sorts case-insensitively; `deadline` always puts
applications **without** a deadline last, in both directions.
A page beyond the last returns `200` with an empty `applications` array and accurate `pagination` (the UI jumps to the last valid page).
`total`/`totalPages` always describe the filtered, ownership-scoped result set (`totalPages` is `0` when nothing matches).

```bash
# after logging in and keeping the cookie jar ($J) and CSRF token ($TOKEN) as in the Phase 1 example
curl -s -b $J -X POST $API/applications -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" \
  -d '{"company":"Acme","role":"Frontend Engineer","applicationDate":"2026-03-05","status":"Applied"}'
curl -s -b $J "$API/applications?search=acme&status=Applied&status=Interview&sortBy=company&sortOrder=asc&page=1&limit=10"
curl -s -b $J -X PATCH $API/applications/<id> -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" -d '{"status":"Offer","deadline":null}'
curl -s -b $J -X DELETE $API/applications/<id> -H "X-CSRF-Token: $TOKEN"
```

## Authorization decisions
- Every application route sits behind `requireAuth`; the owner is always `req.user._id` from the verified session.
- Every query (list, count, aggregate `$match`, get, update, delete) includes `userId`. A record that belongs to someone else yields the
  **same `404`** as a missing one. Ownership is enforced inside the database query, not after loading.
- `userId` cannot be supplied or changed: it is rejected in bodies and query strings, and is `immutable` in the schema.
- Query values are type-checked (objects like `search[$ne]=x` are `400`), search input is regex-escaped, sort fields are allowlisted.
- Notes and other application contents are never logged.

## Frontend
`/applications` (inside the shared authenticated `DashboardLayout`): debounced search (300 ms), multi-select status chips, four date
filters, sort controls, clear-filters, page-size selector, Previous/Next with "Page X of Y", total count, a table on `md+` and cards below.
Create/edit use one accessible modal form (edit sends only changed fields); delete uses a confirmation dialog. Loading, background-refresh,
empty, no-results, error + retry, validation, success/failure toasts and expired-session handling (401 → back to `/login` with a notice) are implemented.
Overlapping requests are aborted and guarded by a sequence number so a slow older response can't overwrite a newer one.

## Phase 2 limitations
- Repeated identical creates are only prevented client-side (submit lock); the server has no idempotency key and, by design, no uniqueness rule.
- The list includes `notes` for every row (simpler edit flow, at most 2 KB × page size).
- `status` list/sort order is alphabetical (which happens to match the lifecycle order).
- Filter/sort/page state lives in component state, not in the URL, so it resets on page reload.
- The client's status list is a mirror of the server constant (separate packages); the API remains authoritative.

---
# Phase 3: Analytics, CSV import/export, deadline reminders

## What was added
```
server/src/services/analytics.js            rate definitions, time buckets, aggregation pipelines (pure helpers)
server/src/services/deadlines.js            overdue / due-today / upcoming logic + reminder pipelines
server/src/services/applicationCsv.js       CSV columns, import validation, duplicate planning, batched commit, report
server/src/utils/csv.js                     RFC 4180 parser, cell escaping, formula-injection defence, header mapping
server/src/controllers/{analytics,applicationCsv}.controller.js
server/src/routes/{analytics,reminders}.routes.js   (+ /export and /import added to application.routes.js)
server/src/validation/analytics.schemas.js  query schemas (overview, reminders, import)
server/tests/{analytics,reminders,csvExportImport}.test.js (DB) and {csv,deadlines,analyticsService}.test.js (pure)
client/src/pages/AnalyticsPage.jsx          + DashboardPage.jsx rewritten around real data
client/src/components/{ActivityChart,StatusDistributionChart,MetricCard,RemindersPanel,DeadlineBadge,
                       ImportCsvModal,PageHeader}.jsx, hooks/useFetch.js, lib/{format,download}.js
```
Changed Phase 1/2 files: `apiClient.js` (raw-text bodies, file download, `api.analytics/reminders/applications.exportCsv/importCsv`),
`ApplicationsPage.jsx` (Export/Import buttons, `?edit=<id>` deep link, shared `PageHeader`), `DashboardLayout.jsx` (Analytics link, skip-to-content link),
`App.jsx`, `app.js` (CORS `exposedHeaders`), `env.js`, `application.routes.js`, `validation/application.schemas.js` (three helpers exported), `utils/dates.js`.

**No new dependencies.** Charts are small hand-written SVG/CSS components (status bars, activity bars) with text and table alternatives; a charting
library was not necessary for two simple charts and could not be installed or verified in the build environment. The CSV parser is a small tested
module rather than a package; imports arrive as a `text/csv` request body, so no multipart/upload library is needed.

**MongoDB Atlas:** no configuration change. Everything uses the existing `MONGODB_URI` and the single existing connection (`config/db.js`). No new collection,
**no new index** (the existing `{userId, applicationDate}`, `{userId, status, applicationDate}` and `{userId, deadline}` indexes serve every new query),
no migration, nothing is dropped or rewritten. Import only inserts new documents. No transactions are used (see "Import failure behaviour").

## Analytics: `GET /api/analytics/overview`
Query (all optional; unknown parameters → 400): `from`, `to` (inclusive `YYYY-MM-DD` application dates, `from` ≤ `to`), `groupBy` = `day|week|month`
(default `month`; weeks start Monday; more than 400 periods → 400), `windowDays` (1–90, default `REMINDER_WINDOW_DAYS`), `today` (`YYYY-MM-DD`, default server UTC date).
```json
{ "data": {
  "scope":   { "from": null, "to": null, "groupBy": "month", "today": "2026-03-10", "windowDays": 7 },
  "totals":  { "total": 8, "byStatus": { "Applied": 3, "Interview": 2, "Offer": 1, "Rejected": 1, "Withdrawn": 1 }, "interviewCount": 2, "offerCount": 1 },
  "rates":   { "denominator": 7, "excludedWithdrawn": 1,
               "responseRate":  { "numerator": 4, "denominator": 7, "percent": 57.1 },
               "interviewRate": { "numerator": 3, "denominator": 7, "percent": 42.9 },
               "offerRate":     { "numerator": 1, "denominator": 7, "percent": 14.3 } },
  "timeline": [ { "period": "2026-01-01", "count": 2 } ],
  "deadlines": { "overdue": 1, "dueToday": 1, "upcoming": 1, "windowDays": 7 },
  "recent":   { "last7Days": 3, "last30Days": 5 } } }
```
**Definitions** (also shown in the UI under "How these numbers are calculated"):
- ApplyTrack stores each application's **current status only**: there is no status history, interview date or response date. Rates are therefore a snapshot of
  where applications stand now. An application that had an interview and was then rejected counts as *Rejected*, so the interview rate can understate interviews.
  Time-to-response and interview scheduling analytics are **not** offered because the data does not exist.
- `denominator` = total − Withdrawn (withdrawing is the user's decision, not an employer response).
- `responseRate` = (Interview + Offer + Rejected) ÷ denominator; `interviewRate` = (Interview + Offer) ÷ denominator; `offerRate` = Offer ÷ denominator.
  `percent` is rounded to one decimal and is **`null`** (UI: "—", "Not enough data yet") when the denominator is 0, never a misleading 0%.
- `from`/`to` limit `totals`, `rates` and `timeline`. `deadlines` and `recent` ignore them. `recent` counts applications dated within the last 7 / 30 days (today included, future dates excluded).
- The timeline contains every period between the first and last data point (or the requested range) with zero-filled gaps; it is `[]` when nothing matches.
- Implementation: three aggregations run in parallel (a `$facet` for status + timeline using `$dateTrunc` in UTC, one for deadline counts, one for recent activity). Every one starts with `{ userId }` from the session.

## Deadline reminders: `GET /api/reminders` (in-app only)
Query: `windowDays` (1–90, default `REMINDER_WINDOW_DAYS` = 7), `today`.
```json
{ "data": { "today": "2026-03-10", "windowDays": 7,
  "counts": { "overdue": 1, "dueToday": 1, "upcoming": 1, "total": 3 },
  "reminders": [ { "id": "…", "company": "Globex", "role": "Dev", "status": "Interview", "applicationDate": "2026-01-20",
                   "deadline": "2026-03-09", "category": "overdue", "daysUntil": -1 } ],
  "truncated": false } }
```
- **Which applications:** the user's own applications with a deadline whose status is **Applied or Interview** (pending). Offer, Rejected and Withdrawn are excluded because a deadline no longer matters; applications without a deadline never appear.
- **Categories:** `overdue` (deadline before today, no lower limit), `dueToday`, `upcoming` (1…`windowDays` days ahead, inclusive). Sorted by deadline ascending, capped at 100 items (`counts` always reflect everything; `truncated` says whether items were cut).
- **Timezones:** deadlines are calendar dates. The browser sends its **local** calendar date as `today`, so "due today" matches the user's wall clock; the server falls back to the UTC date. All comparisons are whole-day arithmetic on `YYYY-MM-DD`, so no instant/offset conversion can cause off-by-one errors (tested around month, year, leap-day and DST boundaries).
- **No notifications:** reminders are computed when the dashboard loads. There is **no** email, push or browser notification, no background worker and no scheduler, so nothing can be sent twice and nothing needs extra runtime. They update because every dashboard visit re-queries (create/edit/delete/deadline changes show up on the next load).
- **Privacy:** items contain only company, role, status and dates (no notes/URLs); every query is owner-scoped. Each reminder links to `/applications?edit=<id>`, which opens that record's edit form via the Phase 2 `GET /api/applications/:id`.

## CSV export: `GET /api/applications/export`
Streams **all** of the signed-in user's applications from a database cursor in small chunks (bounded memory, no pagination involved, so nothing can be omitted). The current list filters are deliberately **not** applied; the UI says so next to the button. Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="applytrack-applications-YYYY-MM-DD.csv"` (the browser names the download with its local date), `X-Record-Count`.
- **Columns (stable order):** `company,role,applicationDate,deadline,status,jobUrl,notes`. Never exported: ids, `userId`, timestamps, or anything authentication-related.
- **Format:** UTF-8 **with a BOM** (so Excel shows non-ASCII text correctly; the importer strips it), CRLF line endings, RFC 4180 quoting (commas, quotes and line breaks inside quoted cells), dates as `YYYY-MM-DD`, empty deadline/jobUrl/notes as empty cells. An account with no applications downloads a header-only file.
- **Formula injection:** any cell that spreadsheets could evaluate as a formula (starts with `=`, `+`, `-`, `@`, a tab or CR, also after leading spaces) is prefixed with `'`. The importer removes that apostrophe again, so exports round-trip. Side effect: a note beginning with "- " appears with a leading `'` in a spreadsheet.
- Server-side errors before streaming starts return the normal JSON error; the filename/notes are never logged.

## CSV import: `POST /api/applications/import`
Body: the CSV text, `Content-Type: text/csv` (or `text/plain`). Query: `commit=true|false` (**default `false` = preview, nothing is written**), `duplicates=skip|import` (default `skip`). Needs the session cookie and `X-CSRF-Token`.
- **Limits** (checked on the server, not just the browser): `IMPORT_MAX_BYTES` (default 1 MiB → `413`), `IMPORT_MAX_ROWS` (default 1000 data rows → `400 CSV_TOO_MANY_ROWS`), 50 columns. The file type is not trusted: content is validated structurally (text only, header present, rows parse).
- **Headers:** first row. Required `company`, `role`, `applicationDate`; optional `deadline`, `status`, `jobUrl`, `notes`. Matching ignores case, spaces, `_` and `-` (`Job Title` → `role`, `application_date` → `applicationDate`). Missing or duplicated required columns → `400 CSV_INVALID_HEADERS`. **Any other column (`userId`, `_id`, `id`, `createdAt`, …) is ignored and listed in `ignoredColumns`, and is never read**, so a file cannot assign ownership, ids or timestamps. Records are always created for the authenticated user.
- **Row validation** reuses the Phase 2 create schema, so rules are identical to the API (company/role ≤ 120, dates must be real `YYYY-MM-DD` dates, status one of the five (matched case-insensitively), http/https `jobUrl`, notes ≤ 2000). Empty cell = no value (status → Applied). Wrong column count is a row error.
- **Duplicates:** same user + same company + same role (case-insensitive, whitespace-normalised) + same application date. Applying to the same company on another date, or for another role, is *not* a duplicate. Checked against existing records and earlier rows of the same file. `skip` leaves them out, `import` imports them anyway; **existing applications are never overwritten**.
- **Response** (`200`, or `207` if the database failed part-way): `totalRows, validRows, invalidRows, duplicateRows, importable, ignoredColumns, errors[{row, errors{field:message}}] (first 50), errorsTruncated, duplicates[{row,company,role,applicationDate,reason: existing|in-file}], preview[first 5]`, plus on commit `imported, skippedDuplicates, rejected, failedWrites, notAttempted, dbErrors[{fromRow,toRow,notSaved}], outcome: completed|partial|failed|nothing-to-import`. `row` counts records with the header as row 1.
- **Workflow in the UI:** choose file → the server validates it (preview; nothing saved) → counts, ignored columns, row errors, duplicates and the first rows are shown → the user picks the duplicate policy and confirms → results (imported / skipped / rejected / not saved). The file is re-sent and fully re-validated on confirm; nothing from the preview is trusted. Valid rows are imported even if other rows are invalid, and invalid rows are always reported, never silently dropped.
- **Import failure behaviour:** rows are inserted in unordered batches of 100. If a batch fails, the driver's inserted count is used, later batches are not attempted, and the response is `207` with the exact numbers; errors never include database details. **No transaction** is used: rows are independent and already validated, and transaction support of the configured deployment could not be verified here, so accurate per-batch reporting was chosen instead. Re-running the import is safe because duplicates are skipped by default.
- Not handled: non-UTF-8 files (undecodable bytes become replacement characters), Excel `.xlsx` files, and dates in other formats (these are reported per row).

## UI
Dashboard (real summary numbers + reminders), **Analytics** (key numbers, three rate cards, status distribution, applications over time with a "view as a table" alternative, deadlines, recent activity, a definitions panel, grouping and date-range controls), **Applications** (Export CSV / Import CSV / Add), shared `PageHeader`, skip-to-content link, loading / error-with-retry / empty / no-results states, accessible labels, focus management and non-colour-only status/deadline indicators (text + symbol + colour).

## Manual verification (Phase 3)
1. Sign in, add a few applications with different statuses and deadlines (one past, one today, one within 7 days). Dashboard: the numbers match; reminders show *Overdue / Due today / Due in N days*; **Open** opens the edit form; change a deadline or status, return to the dashboard, and the reminder updates.
2. Analytics: figures match your records; switch grouping; set a date range; use "View as a table"; with a brand-new account you should see empty states, and rates should show "—" rather than 0%.
3. Applications → **Export CSV**: open the file in a spreadsheet (Unicode intact; a note starting with `=` is shown with a leading apostrophe).
4. **Import CSV** with the exported file into a second account: preview counts, confirm, check the list. Re-import into the same account: all rows flagged as possible duplicates and skipped. Try a file with a bad date/status/URL and an extra `userId` column: rows are listed with reasons, the column is ignored.
5. Sign in as another user: you only ever see your own data in analytics, reminders, export and import results.

---
# Phase 4: Testing, security hardening, deployment readiness

> **Nothing has been deployed.** This phase prepared code, configuration and instructions. No live service, Atlas setting or paid resource was touched.

## Test suites
Server tests (`server/tests`, Vitest + Supertest) run against an **isolated database**: an in-memory MongoDB by default, or `TEST_MONGODB_URI` whose database name contains `test`. The helpers additionally refuse to wipe any connected database whose name does not contain `test`, and `tests/env.setup.js` overrides `MONGODB_URI` with an unused placeholder, so a developer's real `.env` can never be the target.

| Area | Files |
|---|---|
| Auth, sessions, CSRF, CORS, rate limit | `auth.test.js`, `security.test.js` (JWT forgery/expiry/revocation, cookie flags, NoSQL operator payloads, brute-force limiter, header hardening, safe 500s, no secret leakage) |
| Applications CRUD/filter/sort/paginate, ownership | `applications.test.js` |
| Analytics, reminders | `analytics.test.js`, `reminders.test.js`, `analyticsService.test.js`, `deadlines.test.js` |
| CSV export/import (escaping, formula injection, limits, duplicates, partial failure, round trip) | `csvExportImport.test.js`, `csv.test.js` |
| Whole user journey through the real app | `journey.test.js` (register → create → edit/filter → analytics → reminder → export → import into a second account → re-import → delete → logout/replay) |
| Configuration safety | `env.test.js` (production rules, secret-free errors), `mongoUri.test.js`, `logger.test.js` (redaction) |

Client tests (`client/src/test`, Vitest + Testing Library + jsdom): login/register forms, `AuthProvider` states (loading/authenticated/unauthenticated/network error, logout failure, expired session, CSRF refresh, no web-storage tokens), full routing with the real components and a stubbed network (`App.routing.test.jsx`: guards, redirects, logout, refresh restore, 404, expired session, server-down retry), applications page (CRUD, filters, search, sort, pagination, export, import, reminder deep link), analytics, dashboard/reminders, charts, import modal, error boundary, API client.

**End-to-end scope:** the API journey is tested end-to-end in-process (`journey.test.js`), and the front end is integration-tested against a stubbed network. A browser-driven test (Playwright) of the deployed UI against the real API is **not** included: it needs both servers and a database running, which was disproportionate here. Use the manual checklists, plus `npm run smoke` against a deployed API.

## Security controls (summary; findings and residual risk: `PROJECT_STATUS.md`)
- **Passwords:** bcrypt (cost 12), 8–72 bytes, never logged or returned; equal-time response for unknown emails.
- **Sessions:** signed JWT in an `HttpOnly`, `Secure` (production), `SameSite` cookie scoped to `/api`; per-user `tokenVersion` revocation on logout; expiry enforced; algorithm pinned to HS256.
- **Brute force:** per-IP limit on login/register **and** a per-account limit on failed logins (counts failures only). Trade-off: someone who knows an email can deliberately lock that account's logins for the window; the 429 message is generic.
- **CSRF:** HMAC double-submit token plus `Origin` allow-list on every unsafe request.
- **CORS:** explicit origins with credentials, never `*`.
- **Authorization:** every query includes the session user's id; foreign records answer with the same 404 as missing ones; `userId`/ids/timestamps can't be set through bodies, query strings or CSV columns.
- **Input handling:** strict Zod schemas for bodies and queries (unknown keys rejected), Node's flat query parser (so `a[$ne]=x` can never become an object), strict 24-hex ids, regex-escaped search, request/CSV size and row limits.
- **Output:** React escapes all content; no `dangerouslySetInnerHTML`; job links only render for `http(s)` with `rel="noopener noreferrer"`; JSON responses carry `nosniff`; CSV cells that spreadsheets could execute are neutralised.
- **Errors/logging:** one error shape; 5xx bodies contain a `requestId` only; logs are single-line, redacted (connection strings, JWTs, `password=`/`token=`/`Authorization` values), never contain bodies, cookies or query strings; unknown 4xx from body-parsing (bad encoding/charset) are 4xx, not 500.
- **Headers:** `helmet` defaults on the API; the Vercel config adds CSP, HSTS, `X-Frame-Options: DENY`, referrer and permissions policies for the SPA.

## MongoDB Atlas
Phase 4 changed nothing in Atlas and needs no schema migration: collections, fields and indexes are unchanged and existing documents remain valid.
1. **Cluster vs database:** one Atlas *cluster* hosts many *databases*. Using the same cluster for production and tests is fine **only if** they use different **database names** (and ideally different users). Using the same *database* is not: tests delete data. Tests here use an in-memory server by default; if you use `TEST_MONGODB_URI`, give it its own database (e.g. `applytrack_test`) and, ideally, its own user.
2. **Database user (least privilege):** create a dedicated user for the app with the built-in `readWrite` role scoped to the single application database (not `atlasAdmin`, not "read and write to any database"). `readWrite` includes the index creation the server performs at startup.
3. **Connection string:** Atlas → *Connect* → *Drivers*, then add the database name before the `?`: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/applytrack?retryWrites=true&w=majority`. URL-encode special characters in the password. Put it in the host's secret/environment settings, never in a file in the repo.
4. **Network access:** Atlas only accepts connections from IPs on the project's access list. You must add your host's outbound IPs yourself (this repo does not and cannot do it). Render's free web services have **no fixed outbound IPs**, which is why many setups allow `0.0.0.0/0`; that leaves protection to the database credentials alone, so use a strong generated password and a least-privilege user, or use a host/plan with static egress IPs or private networking. This is a decision for you; nothing was changed.
5. **Verify:** on start the server logs `MongoDB connected` with the **database name** (never the URI). Confirm it is the intended one. `GET /api/health` reports `database: connected`.

## Deployment (instructions only)
**Files prepared:** `render.yaml` (API blueprint, placeholders, `autoDeploy: false`, free plan), `client/vercel.json` (build settings, SPA fallback, security headers), `.nvmrc`, `.github/workflows/ci.yml`. Build/start commands: API `npm install --omit=dev` / `npm start` in `server/` (binds to `PORT`); frontend `npm run build` in `client/`, output `dist`.

### Pick a cookie topology first (this decides several variables)
| | A. Frontend proxies `/api` (recommended if you have no custom domain) | B. Custom domains on one site (`app.example.com` + `api.example.com`) | C. Different sites (`*.vercel.app` + `*.onrender.com`) |
|---|---|---|---|
| Browser sees | one origin | same-site, two origins | cross-site |
| Setup | add a Vercel rewrite `{"source":"/api/:path*","destination":"https://<your-api-host>/api/:path*"}` **before** the SPA rewrite in `client/vercel.json` | DNS + custom domains on both hosts | nothing extra |
| `VITE_API_BASE_URL` | `/api` | `https://api.example.com/api` | `https://<api-host>/api` |
| `CLIENT_ORIGIN` | the frontend's own origin | `https://app.example.com` | `https://<frontend-host>` |
| `COOKIE_SAMESITE` | `lax` | `lax` | `none` (requires HTTPS) |
| CSP `connect-src` in `vercel.json` | `'self'` (as shipped) | add `https://api.example.com` | add the API origin |
| Caveats | proxy timeout limits for big exports; client IP forwarding (see `TRUST_PROXY`) | needs a domain you own | **third-party-cookie blocking (Safari, Firefox, and Chrome's phase-out) can break sign-in**, so a login may appear to succeed but the session is not kept. Not recommended. |

All topologies: `NODE_ENV=production`, `COOKIE_SECURE` left at its default (`true`), `CLIENT_ORIGIN` **exactly** the browser origin (scheme + host, no trailing slash). Never weaken `SameSite`/`Secure` or add `*` origins to make something work.

### `TRUST_PROXY`
It is the number of proxy hops between the internet and the app. Too low → every user shares one rate-limit bucket (they throttle each other). Too high → clients can spoof their IP. Start with **`1`** for a single hosting load balancer (Render); with topology A the Vercel proxy may add one more hop, so the correct value might be `2`. **Verify after deployment:** the API sends `RateLimit-Remaining` headers; call any `/api` endpoint from two different networks (e.g. Wi-Fi and mobile data): if the counters drop together, the bucket is shared and the value is too low. This could not be tested here.

### Steps (nothing below has been performed)
1. **Atlas:** create the least-privilege user and the access-list entry (see above); copy the connection string with the database name into your password manager.
2. **API on Render:** New → Blueprint (or Web Service) from the repo with `rootDir: server`; supply `MONGODB_URI` and `CLIENT_ORIGIN` when prompted (`JWT_SECRET`/`CSRF_SECRET` are generated by the blueprint, or generate your own with `openssl rand -hex 32`). Set `COOKIE_SAMESITE` and `TRUST_PROXY` per the topology. Health check path `/api/health`. Confirm the log shows `MongoDB connected {"database":"applytrack"}`.
3. **Frontend on Vercel:** import the repo with root directory `client`; set `VITE_API_BASE_URL` per the topology (build-time, so redeploy after changing it); apply the topology A rewrite if chosen. `client/vercel.json` provides the SPA fallback (deep links such as `/applications` survive a refresh).
4. **Set `CLIENT_ORIGIN` on the API to the final frontend URL** and redeploy the API if it changed.
5. **Verify**
   - `npm run check:env` locally with production-like values (no secrets are printed).
   - `npm run smoke -- https://<api> https://<frontend>`: read-only; checks health, 401s on private routes, CSRF/CORS behaviour, cookie flags.
   - By hand in a real browser: register, sign out, sign in, **refresh a deep link**, create/edit/delete an application, export and re-import, open the dashboard reminders, sign out and confirm `/dashboard` redirects. In DevTools confirm the session cookie is `HttpOnly; Secure` and is sent on API requests. Test in Safari as well if possible.

## Operations notes
- **Logging:** JSON lines in production (`level,time,msg,…`); one `request` line per API call (method, path without query, status, ms, `requestId`), startup/connection events, redacted errors. No log shipping is configured; use your host's log viewer.
- **Health:** `GET /api/health` → `200 {status, database, uptimeSeconds}` or `503` when the database is not connected. It exposes no hosts, versions or secrets.
- **Shutdown:** `SIGTERM`/`SIGINT` stop accepting connections, close idle sockets, disconnect from MongoDB, and force-exit after 10 s. Unhandled rejections/exceptions are logged (redacted) and exit so the platform restarts the process.
- **Indexes:** created at startup (`User.init()`/`Application.init()`); the DB user must be allowed to create indexes (`readWrite` is).
- **Free-tier note:** idle free instances sleep; the first request after a pause is slow (the frontend shows its loading/retry states).

## Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| Server exits with `Invalid environment configuration …` | Read the listed variable names; run `npm run check:env`. Typical: placeholder or short secrets, `CLIENT_ORIGIN` not `https://` in production, `MONGODB_URI` missing the database name |
| `Failed to connect to MongoDB` | Wrong password or URL-encoding; user lacks access to that database; **IP not on the Atlas access list**; `retryWrites`/`w` parameters mangled by the host's UI |
| `MongoServerSelectionError` / timeouts | Access list, DNS/SRV resolution blocked, or the cluster is paused |
| Browser: "blocked by CORS policy" | `CLIENT_ORIGIN` does not exactly equal the page's origin (check `http` vs `https`, `www`, trailing slash, port) |
| `403 CSRF_INVALID` | Origin not in `CLIENT_ORIGIN`; blocked cookies (the CSRF cookie never arrived); an old tab after a secret rotation (reload) |
| Login succeeds but the next request is `401` | Cookie not stored/sent: cross-site topology with third-party cookies blocked, `COOKIE_SAMESITE=lax` while the frontend is on another site, `Secure` cookie over plain `http`, or `VITE_API_BASE_URL` pointing at a different host than configured |
| Everyone gets `429` quickly | `TRUST_PROXY` too low (shared bucket) or a genuine attack; adjust per the section above |
| Refreshing `/applications` shows 404 on the host | SPA rewrite missing (`client/vercel.json` not picked up: set the project root to `client`) |
| `npm test` fails downloading MongoDB | `mongodb-memory-server` needs internet once to fetch `mongod`, or set `MONGOMS_SYSTEM_BINARY` to a local `mongod`, or use `TEST_MONGODB_URI` (database name must contain `test`) |
| Tests refuse to run: "database name must contain test" | Intentional safety check |
| `EADDRINUSE`/Vite port 5173 busy | `strictPort` is on because `CLIENT_ORIGIN` expects 5173; free the port |
| Excel shows `Ã©`-style characters in an import | Save as "CSV UTF-8"; exports include a BOM for this reason |
| Import: `413` / `CSV_TOO_MANY_ROWS` | Raise `IMPORT_MAX_BYTES` / `IMPORT_MAX_ROWS` or split the file |
| Build/install errors about Node features | Use Node ≥ 20 (`nvm use`) |

## Known limitations / remaining work
- Logout revokes **all** sessions of the user (tokenVersion model). Per-device sessions would need a session store.
- Registration reveals whether an email is taken (required 409 behaviour); mitigated by rate limiting, but not eliminated.
- No email verification, password reset, or account lockout (out of Phase 1 scope).
- Rate limiter state is in-memory per process; use a shared store (e.g. Redis) if you run multiple instances.
- Dependency versions in the `package.json` files were chosen from knowledge, not resolved against the registry, and there is no lockfile yet: run `npm install` and commit the generated `package-lock.json` files.
