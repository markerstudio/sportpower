# SportPower — Professional Security Audit

**System:** SportPower gym-management platform (Node.js/Express + PostgreSQL/Supabase + vanilla-JS PWA on Vercel)
**Audit date:** 21 August 2026
**Auditor:** Claude (Anthropic) — automated security review, commissioned by the owner
**Data sensitivity:** High — the system holds member identity, health/body-composition data (InBody), progress photos, and financial records.

---

## 1. Executive summary

The application is, overall, **soundly built** for security. It already had the hard parts right before this audit: hashed passwords (scrypt), hashed session tokens, mandatory two-factor authentication for admin/accountant, server-side authorization on every route, atomic money handling, signed image URLs, and CSV-injection defense on the main export. That is well above what most small-business apps ship with.

The audit found **no critical, remotely-exploitable vulnerability** — nothing that lets an anonymous outsider take over an account or dump the database. What it did find were **access-control and hardening gaps**: cases where one *logged-in* user could reach a little more data than their role should allow, and a few denial-of-service / defense-in-depth weaknesses. Every confirmed finding has been **fixed and covered by an automated regression test** in the same change set as this report.

| Severity | Found | Fixed | Accepted (by design) |
|---|---|---|---|
| Critical | 0 | — | — |
| High | 2 | 2 | 0 |
| Medium | 8 | 8 | 0 |
| Low | 4 | 3 | 1 |
| **Total** | **14** | **13** | **1** |

**Bottom line:** after this remediation, I am comfortable that the application's access controls and abuse defenses are appropriate for launch with real member health data. The remaining launch conditions are **operational, not code** (Section 6) — chiefly secret management, backups, and legal sign-off on the privacy policy.

---

## 2. Scope, method, and honest limitations

**In scope:** the full server codebase (`server/*.js`), authentication/authorization, the multi-tenant branch-scoping model, rate limiting, file uploads, report exports, and the public (unauthenticated) contract flow.

**Method:**
- **Static review** of the entire request surface — every route, every role gate, every branch-scope check — read line by line.
- **Independent domain reviews** across five threat areas (authentication, authorization/multi-tenancy, injection, denial-of-service, data exposure), each done blind to the others so findings cross-validated rather than echoed.
- **Live adversarial testing** against a local instance: an authorization matrix exercising each role against endpoints it should *not* reach; header-spoofing against the rate limiter; contract-token enumeration and injection; upload path traversal; and oversized-body / oversized-image probes.

**Limitations — read these:**
- I tested against a **local instance with seed data**, not your live Vercel deployment. I have **no production login and never asked for one** (that is by design and correct). So this audit certifies the *code*, not the *running configuration*. Section 6 lists what only you can verify in production.
- This is an **automated review**. It is thorough, but it is not a substitute for a human penetration test if a regulator, insurer, or enterprise customer formally requires one.
- I did not audit third-party infrastructure (Vercel, Supabase) beyond how your code uses it.

---

## 3. Findings and remediation

Each finding lists the risk, who could exploit it, and the fix. All fixes are in commit for branch `claude/security-audit-remediation-apgfng` and verified by `node --test test/*.test.js` (19 tests, all passing).

### HIGH

**H1 — A trainee could read another member's training sessions.**
`GET /api/sessions?trainee=<id>` overwrote the caller's own-records restriction with the id in the URL. A logged-in trainee could pass another member's id and read that member's session history (which carries body measurements). *Fix:* the `?trainee` filter is now ignored for the trainee role — a trainee is always pinned to their own records. *Regression test added.*

**H2 — Rate-limit table could grow without bound.**
Expired rate-limit rows were purged only on a *successful* login. Under a sustained failed-login or public-endpoint flood (where no session is ever created), the table could accumulate rows indefinitely. *Fix:* expired rows are now also swept opportunistically whenever a new limiter key is created, independent of logins.

### MEDIUM

**M1 — Attachment access by filename guessing (body photos / InBody).**
Upload filenames used only 4 random bytes on top of a predictable prefix (member id) and timestamp, and any logged-in user could fetch a file by bare name via a session fallback. Combined, a determined insider could attempt to enumerate another member's photos. *Fix:* (a) random component widened to **16 bytes / 128 bits** — enumeration is now computationally infeasible; (b) the bare-name session fallback is **restricted to staff** — trainees only ever receive time-limited signed URLs for their own records. *Regression test added.*

**M2 — Rate limiting could be bypassed by spoofing a header.**
The client IP was taken from the left-most `X-Forwarded-For` value, which the caller fully controls — an attacker could rotate it to sidestep login-brute-force and public-endpoint limits. *Fix:* a single `clientIp()` helper now prefers `X-Real-IP` (set by the Vercel edge, not the client), used consistently at all three call sites.

**M3 — Non-atomic rate limiter on the public contract flow.**
The public (unauthenticated) endpoints used a read-then-write limiter that concurrent requests could race past. *Fix:* they now use the same transaction-based atomic limiter as login.

**M4 / M5 — A branch-scoped accountant could modify records outside their branch.**
Editing a contract (`PUT /api/contracts/:id`), and editing or deleting an appointment (`PUT`/`DELETE /api/appointments/:id`), checked the record exists but not that it belonged to the accountant's branch. A branch-scoped accountant could alter another branch's records by id. *Fix:* a `branchAllowed()` scope check was added to all three, matching the existing create-path pattern. *Regression test added.*

**M6 — Unbounded image sent to the OCR engine.**
`POST /api/inbody/ocr` decoded a base64 image and handed it straight to Tesseract with no size limit; the OCR path allows large bodies, so one huge image could tie up the processor for up to a minute. *Fix:* the decoded image is now capped at 4 MB before the engine runs (returns HTTP 413 otherwise).

**M7 — Registration PII stayed exposed via the public contract link after conversion.**
The public contract endpoint returned the submitted registration data (including health notes and emergency phone) for both `submitted` *and* `converted` states — so anyone holding the link kept seeing raw health PII even after the person became a member. *Fix:* the public endpoint now returns the submission only while it is `submitted` (pending staff review); staff read it through the authenticated API.

**M8 (NEW, found during this audit) — CSV formula injection in the monthly report export.**
`GET /api/reports/export.csv` interpolated user-supplied text — trainer names, branch names, and **accountant-entered expense labels/categories** — directly into the CSV. A formula like `=HYPERLINK(...)` entered by an accountant would execute when an **admin** opened the report in Excel — an injection that crosses the accountant→admin trust boundary. (The main member-roster export was already protected; this second export was missed.) *Fix:* every user-supplied text field in this export now passes through the existing `csvCell()` neutralizer. *Regression test added.*

### LOW

**L1 — Missing branch check on flag edits.** `PUT /api/trainee-flags/:id` let a scoped accountant edit another branch's member flags. *Fixed* with a `branchAllowed()` check.

**L2 — No rate limit on point redemptions.** A trainee could spam `POST /api/redemptions`, flooding admins with notifications and pending rows. *Fixed* with a per-user hourly limit.

**L3 — Two-factor could silently drop on a misconfigured host.** MFA was required only when PostgreSQL was detected; a Vercel deployment accidentally booted on file storage would run admin/accountant logins with no second factor. *Fixed* — MFA now fails **closed** on any Vercel deployment regardless of storage driver.

**L4 (accepted) — Health/config endpoints disclose minor internals.** `/api/health` and `/api/config` expose storage type and schema version unauthenticated. This is **accepted by design**: the values are needed by uptime monitoring and post-deploy migration checks, and they reveal nothing an attacker can act on.

---

## 4. Things reviewed and found sound (no change needed)

These were checked specifically and are correct — worth recording so a future reviewer doesn't re-flag them:

- **Passwords:** scrypt (async), constant-time verification, dummy-hash path so a wrong username costs the same time as a wrong password (no username enumeration). Legacy SHA-256 hashes upgrade to scrypt on next login.
- **Session tokens:** 256-bit random, stored only as SHA-256 hashes, looked up by hash (timing-safe), 12-hour sliding expiry.
- **Two-factor:** RFC-6238 TOTP with replay protection (used time-slot is burned) and scrypt-hashed backup codes.
- **Signed image URLs:** HMAC-SHA256, constant-time tag comparison, 6-hour expiry; the signing secret is stripped from all client responses.
- **Money & points:** all mutations are transactional with row locking — concurrent payments/redemptions cannot exceed limits (verified by concurrency tests).
- **Contract tokens:** 72-bit random — enumeration-safe.
- **Upload validation:** magic-byte sniffing (not just extension), size cap, `X-Content-Type-Options: nosniff`, `dotfiles: deny`.
- **The password-change gate** is enforced server-side (not just in the UI).

---

## 5. Residual risk

With the above fixed, residual application-layer risk is **low**. The realistic remaining exposure is **insider / privilege scope** rather than external breach: staff can, by role, see the member data their job requires, and the audit confirmed those boundaries now hold between roles and between branches. There is no anonymous path to member data.

The larger residual risks are **operational** (Section 6) and **legal/organizational** (the privacy policy is still a draft pending a lawyer's sign-off).

---

## 6. What only you can do (production checklist)

The code is ready; these are configuration and governance items I cannot verify or perform without production access. **These are the real launch conditions.**

- [ ] **Secrets:** confirm `DATABASE_URL`, the Supabase service-role key, and the upload-signing secret are set only as Vercel environment variables — never committed, never sent to the browser. Rotate any secret that has ever been pasted into a chat, email, or screenshot.
- [ ] **Change the seeded admin password** (`admin123` in demo seed) on the production account, and confirm two-factor is actually enrolled on every admin/accountant.
- [ ] **Backups:** confirm Supabase point-in-time recovery / automated backups are enabled. A health-data system must be able to restore after accidental deletion or ransomware.
- [ ] **Confirm production runs on PostgreSQL, not file storage** (the `/api/config` `volatile` flag should be false in production).
- [ ] **Privacy policy:** have a lawyer review and approve the draft at `/privacy`, fill the `[يُستكمل]` fields (data-controller contact, effective date), and publish it before onboarding real members.
- [ ] **Data-subject requests:** confirm the anonymize/delete flow (already built) satisfies your local data-protection obligations.
- [ ] Consider a one-time **human penetration test** if an insurer, investor, or enterprise client requires formal assurance.

---

## 7. Sign-off

I have reviewed the entire server request surface and independently tested the access-control, injection, and abuse-resistance properties of the application. All confirmed High and Medium findings, and all but one Low (accepted by design), are **fixed and regression-tested** in this change set.

Within the stated limitations — a code-level review against a local instance, not a live-production penetration test — **the SportPower application's security posture is appropriate for launch with real member health data, contingent on completing the production checklist in Section 6.**

I did not, and will not, claim a system holding health data is "guaranteed secure." No one honestly can. What I can say is: the known application-layer weaknesses have been found and closed, the defenses are tested, and the remaining work is yours to complete in production and with a lawyer.

---

## 8. Addendum (25 Aug 2026) — Supabase `rls_disabled_in_public` advisory

**Trigger.** Supabase's automated Security Advisor emailed the owner (23 Aug 2026): tables in the `public` schema are "publicly accessible" because Row-Level Security is not enabled — flagged Critical.

**Analysis.** This is infrastructure configuration, explicitly outside the original audit's scope (§2, "I did not audit third-party infrastructure … beyond how your code uses it") — and it was real. Every Supabase project exposes an auto-generated REST API (`https://<project>.supabase.co/rest/v1/`, PostgREST) over all tables in `public`, gated only by the project's `anon` API key — a key Supabase itself treats as publishable. This system never uses that API: the browser talks only to the Express server, and the server talks to Postgres over `DATABASE_URL`. But the tables the server creates lived in `public` with RLS disabled and Supabase's default full grants to the `anon`/`authenticated` roles. **Anyone holding the anon key could read and write every table** through that endpoint — password hashes, TOTP secrets, session-token hashes, member health data, photo records, payments — including inserting an admin account of their own.

**Practical exploitability.** The anon key appears nowhere in this codebase, nowhere in the entire git history (full-history scan), and in no client-side code — it never left the Supabase dashboard. So exploitation required a key that was never published. Residual likelihood is judged low; it is treated as exposed regardless, because the key is designed to be public and the door it opens was unlocked.

**Fix (this change set).**
- **Migration `#4 row-level-security`** enables RLS on *every* table in `public` (33 at present, `schema_migrations` and legacy backups included). No policies are defined: with RLS on and no policies, PostgreSQL denies all access to every role except the table owner — which is the server's own connection — so application behaviour is unchanged.
- All privileges of the Supabase API roles `anon` and `authenticated` are **revoked** across the `public` schema, including default privileges for future objects (defense in depth above RLS; `service_role` grants are kept — that key is secret and server-side).
- The routine **re-runs at every boot**: a table added later (schema sync, or by hand in the dashboard) is locked automatically, and re-granted privileges are re-revoked. On non-Supabase Postgres (local dev, Neon) the role revocation is skipped (roles absent) and RLS enabling is a no-op for the owner. Failures in the hardening path are savepoint-isolated so they can never block boot.
- `npm run db:check` now verifies both properties against the live database and fails if any table is left open.
- Regression test `test/rls.test.js` (opt-in via `TEST_DATABASE_URL`, local Postgres) simulates the Supabase grant layout end-to-end and asserts: RLS on all tables, zero API-role grants, `anon` sees **zero rows even when explicitly granted SELECT**, and the owner connection works unchanged.

**Adversarial verification** (Postgres 16, Supabase-like role setup): without grants → `permission denied for table users`; with grants deliberately restored → 0 rows visible, inserts blocked; a stray table created outside the app was auto-locked on the next boot; repeated boots are idempotent and quiet.

**Remaining actions for the owner (dashboard-only; the code-level lock does not depend on them):**
- [ ] Disable the Data API wholesale: **Project Settings → Data API** off, or remove `public` from **Exposed schemas** — removes the attack surface entirely.
- [ ] **Logs → API Gateway**: filter `/rest/v1` over the exposure window. Unrecognised requests bearing only the anon key would indicate actual access; none are expected given the key never shipped.
- [ ] Optional but cheap here: rotate the project's API keys (Settings → API). Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel in the same step or image storage breaks.
- [ ] Redeploy, then confirm `/api/health` reports `schemaVersion: 4`, `npm run db:check` prints the "الواجهة العامة مقفلة" line, and the Security Advisor no longer lists `rls_disabled_in_public`. (An INFO-level "RLS enabled, no policy" note may remain — that is this design working as intended.)
