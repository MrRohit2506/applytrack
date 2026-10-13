# ApplyTrack — Project Status

_Last updated: 2026-10-12_

## Phase summary
| Phase | Scope | State |
|---|---|---|
| 1 | Foundation, MongoDB, cookie auth, CSRF, CORS, rate limits, protected routes | Implemented |
| 2 | Application CRUD, search, filters, sorting, server pagination, responsive UI | Implemented |
| 3 | Analytics, CSV export/import, in-app deadline reminders, UI polish | Implemented |
| 4 | Audit, tests, security hardening, deployment preparation, documentation | Implemented (**not deployed**) |

## Readiness assessment
**Not yet verified as production-ready.** The code, tests and deployment configuration are prepared, but the build environment had **no network, no installed dependencies and no MongoDB**, so the application has never been started, no database-backed test has run, no production build has been produced, no dependency audit has been possible, and nothing has been deployed. Treat the project as *ready for a first real test run and a staging deployment*, not as production-ready.

Required before calling it production-ready (in order):
1. `npm run install:all`, commit the two `package-lock.json` files, then `npm run verify` (lint + all tests + build). Fix whatever fails: expect small defects, since none of this has run.
2. `npm run audit` and `npm run audit:all`; assess findings (do not blindly upgrade).
3. Deploy to a **staging** environment (needs your authorization, accounts and Atlas access-list decision), run `npm run smoke`, then the manual browser checklist in the README, including Safari and a deep-link refresh.
4. Verify `TRUST_PROXY` for your topology (README, "TRUST_PROXY").

## Verification evidence: be skeptical of anything not marked "Executed"
| Check | Result |
|---|---|
| `node --check` on every server `.js` / `.mjs` file and scripts | Executed, pass |
| esbuild parse of all 65 client files | Executed, pass |
| Static cross-check of 278 relative imports (file + named/default export exist) | Executed, 0 problems |
| Pseudo-lint with the TypeScript compiler (`noUnusedLocals`, undeclared names) over server and client. **Validated first with a deliberately broken probe file**, after my first invocation turned out to check nothing. It is *not* ESLint | Executed. Found 1 unused import (fixed); 0 remaining |
| Pure-logic tests with a minimal Vitest stand-in under UTC, America/Los_Angeles, Pacific/Kiritimati, Asia/Kolkata: server `csv`(15) `deadlines`(6) `analyticsService`(12) `dates`(3) `applicationQuery`(9) `mongoUri`(3) `logger`(4); client `applicationValidators`(9) `format`(4) = 65 tests | Executed, all pass in every timezone |
| `scripts/smoke.mjs` run against a stand-in API: correct one passes 17/17 checks, a deliberately broken one fails exactly the 6 planted faults, unreachable API exits 1 | Executed. Verifies the script's logic only, not the real app |
| `.env.example` vs the 19 variables in `env.js`; README coverage of every variable; JSON config files parse | Executed, consistent |
| Secret scan of the tree (Mongo URIs with credentials, private keys, cloud/API key patterns) | Executed. Only hit: an intentional fake string inside a test fixture. No `.env` file exists |
| Server DB-backed suites: `auth`, `applications`, `analytics`, `reminders`, `csvExportImport`, `security`, `journey`; plus `env.test.js` (needs only Zod) | **Written, NOT executed** (`npm run test:server`) |
| Client suites: `ProtectedRoute`, `apiClient`, `ApplicationsPage`, `AnalyticsPage`, `DashboardPage`, `ImportCsvModal`, `charts`, `LoginPage`, `RegisterPage`, `AuthContext`, `App.routing`, `ErrorBoundary` | **Written, NOT executed** (`npm run test:client`) |
| ESLint (`npm run lint`) | **Configured, NOT executed** (config unverified) |
| `npm run build` | **NOT executed** |
| `npm audit` / dependency vulnerability review | **NOT executed** (needs network); version ranges were reviewed by reading only |
| Zod schemas, controllers, Mongoose queries/aggregations, CSV streaming, CORS/CSRF/cookie behaviour in a browser, responsive layout | **NOT executed** |
| Deployment (Render/Vercel/Atlas) | **NOT performed** |

**Existing failures vs introduced:** no executable check failed at baseline. Defects found by reading code and fixed in this phase are listed below; the only issues found in my own earlier output were an unused import in a test and (while writing the new logger test) a gap where `Authorization: Bearer <token>` redacted only the word "Bearer", fixed and re-tested.

## Security review (scope: reading and testing the repository's own code and configuration; no penetration test, no dependency scan, no infrastructure review)
### Fixed in Phase 4
| # | Finding (evidence) | Fix |
|---|---|---|
| 1 | Body-parser client errors other than two types (unsupported content-encoding/charset, aborted request) fell through to **500** (`errorHandler.js` mapped only `entity.parse.failed`/`entity.too.large`) | Generic 4xx mapping (415/400) + tests |
| 2 | Brute-force protection was per-IP only: many IPs could guess one account | Per-account failed-login limiter (`LOGIN_FAILURE_LIMIT`), failures only, generic message, tests |
| 3 | Dangerous production misconfigurations were accepted: URI without a database name (MongoDB falls back to its `test` database), `http://` origins, secure-cookie off, proxy count 0 behind a host | Startup validation fails (or warns) with secret-free messages; `check:env` script; tests (`env.test.js`) |
| 4 | No request log/id; connection strings or tokens could reach logs through error messages | Structured redacting logger, request ids, `requestId` in 5xx bodies; redaction tests |
| 5 | `Application` indexes not awaited at startup; no MongoDB connection-event logging; no handlers for unhandled rejections/exceptions | Added; server logs the **database name** at startup for verification |
| 6 | Extended query parser turned `a[$ne]=x` into objects (rejected only by validation) | Switched to the flat parser (defence in depth) + tests |
| 7 | Test helpers could wipe whichever database was connected | `assertTestDatabase()` guard (name must contain `test`) |
| 8 | No React error boundary (a render error blanked the app) | Added + test |
| 9 | Repo hygiene: `.gitignore` lacked keys/dumps/CSVs; Node 18 (EOL) in `engines`; no lint/CI/deploy config | Extended `.gitignore`, Node ≥ 20 + `.nvmrc`, ESLint config, CI workflow, `render.yaml`, `client/vercel.json` (SPA fallback + CSP/HSTS headers) |

### Verified by review and covered by tests (no change needed)
Password hashing and equal-time unknown-user path; JWT algorithm pinning, expiry, `tokenVersion` revocation, signature forgery/`alg:none`; cookie flags; CSRF + Origin checks; CORS allow-list (never `*` with credentials); ownership scoping in every list/read/write/aggregate/export/import/reminder query; mass-assignment rejection; strict ids/queries/bodies; regex-escaped search; XSS (no HTML sinks in the client; JSON `nosniff`); CSV formula injection and ownership spoofing; secrets only via environment; no secrets in the repository.

### Open risks (not fixed; accepted or need your decision)
| # | Risk | Mitigation / recommendation |
|---|---|---|
| R1 | **Dependencies unaudited**, no lockfiles, version ranges chosen without registry resolution | Run `npm run audit`/`audit:all`, commit lockfiles, use `npm ci` in CI |
| R2 | ESLint and every test/build step unexecuted | `npm run verify` |
| R3 | `TRUST_PROXY` correct value for your topology unverified; wrong value = shared rate-limit bucket or spoofable IP | README verification procedure |
| R4 | Cross-site cookies (Vercel + Render default domains) can break in browsers that block third-party cookies | Use topology A or B (README) |
| R5 | Atlas network access on free hosting often needs `0.0.0.0/0` | Your decision; least-privilege DB user, strong password, or static egress/private networking |
| R6 | Registration reveals whether an email exists (409); per-account limiter allows deliberate lockout | Accepted trade-offs; rate limits reduce abuse |
| R7 | Stolen session cookie stays valid until expiry (7 days) or logout; logout ends **all** devices; no session list | Shorter `SESSION_TTL_HOURS`; per-device sessions would need a session store |
| R8 | Rate-limit state is in memory (per process, reset on restart, not shared between instances) | Use a shared store (e.g. Redis) before scaling out |
| R9 | No email verification, password reset, MFA or CAPTCHA | Out of scope; plan before public launch |
| R10 | SPA CSP needs `style-src 'unsafe-inline'` (React inline style attributes) | Acceptable; scripts remain `'self'` only |
| R11 | No browser E2E, accessibility tooling, or visual/responsive inspection was run | Manual checklists; consider Playwright + axe |
| R12 | No monitoring/alerting; Atlas backups/retention not verified | Configure on your platform |
| R13 | Import: non-UTF-8 files and `.xlsx` unsupported; file re-sent on confirm; no transaction (per-batch reporting instead) | Documented behaviour |
| R14 | Dev-server-only advisories in Vite/esbuild may apply to local development | Check `npm audit`; they do not ship in the built site |

## Actions requiring your approval or credentials (none were taken)
- Creating or changing the Atlas database user, access list or cluster; choosing the network-access trade-off (R5).
- Creating Render/Vercel projects, domains, DNS records, or paid plans; the blueprint uses the free plan and `autoDeploy: false`.
- Setting production secrets (never paste them into chat; use the platform's environment settings).

## Decisions worth knowing
- Session = JWT in an HttpOnly cookie + `tokenVersion` revocation. CSRF = HMAC double-submit + Origin check. Rate limits: per IP and per failed-login account.
- Calendar dates are `YYYY-MM-DD` strings stored at UTC midnight; "today" for analytics/reminders is the browser's local date (UTC fallback).
- Analytics are snapshots of the **current** status; Withdrawn is excluded from rate denominators; zero denominators show "—".
- Reminders are in-app only (pending Applied/Interview with a deadline); no email/push/worker.
- CSV export streams everything the user owns (UTF-8 + BOM, formula-neutralised). Import is preview-then-confirm, ignores protected columns, skips probable duplicates by default, never overwrites, reports every rejected row and partial database failures exactly.
- No new runtime dependencies in Phases 3–4. Dev dependencies added in Phase 4: ESLint packages only.
- Atlas: no schema, index or configuration change in any phase after Phase 2.

## Next
Run the verification steps above, then stage and test. Further feature work only when requested.
