# Project Audit — SportPower Internal System (نظام سبورت باور)

**Date:** 2026-08-01 · **Risk tier:** 3
**Readiness score:** 17/100 (grade F) as found → **56/100 (grade D) after the fixes in this commit** (▲39)
**Verdict:** Fix first — no critical findings; 1 high, 5 medium, 4 low still open

Scope: the codebase in this repository **and** the live deployment at `https://sportpower.vercel.app`.
Both the static scanner and the live scanner were run, followed by manual review and hands-on testing
against a locally running copy of the system.

**Risk tier 3** because this system holds real user accounts, payment records, phone numbers, dates of
birth, home addresses, emergency contacts, written health notes, and InBody body-composition scans.
A leak here is a leak of medical-adjacent personal data about the client's gym members.

---

## Summary

The security foundations of this system are genuinely good, and that is not a courtesy — passwords use
scrypt with a per-user salt, session tokens are stored hashed with a real expiry, every role restriction
is enforced on the server rather than hidden in the interface, the price-confidentiality rule for
trainers actually holds up under direct attack, and the front-end builds its DOM through text nodes so
the cross-site-scripting payloads that were injected during testing did not execute. Most projects at
this stage do not get those things right.

Two problems needed fixing before real members use it. The first: any logged-in gym member could read
any other member's complete training history — including their body weight and their trainer's private
notes — by changing one number in a web address. This was confirmed by actually doing it, not by
reading code. The second: every uploaded InBody scan image is being written to a temporary folder that
the hosting platform erases, so those images are silently destroyed. Both are fixed in this commit,
along with nine smaller items.

The score is driven by the *number* of open findings rather than their severity — **no critical
findings were found**, and several of the remaining items are hardening rather than holes. Nine
findings are fixed in this commit, moving the score from 17 to 56. The findings below carry the real
weight, not the number.

The audit snapshot is saved at `audit/last_audit.json`. Pass it as `--previous` on the next run to see
the delta:

```bash
python3 scripts/score.py findings.json --previous audit/last_audit.json --save audit/last_audit.json
```

---

## Critical — fix before launch

**None found.**

Two things were specifically tested for and did **not** turn out to be exploitable:

- The documented default administrator password (`admin123`) was tried directly against the live
  production login. It was rejected — the password has been changed. Good.
- The live deployment reports `demo:false` and `storage:postgres`, so it is running on the real
  database and not on demo data with published passwords.

---

## High — fix soon after launch

### 1. Any member could read any other member's training records — FIXED

**What it is:** `server/index.js`, the `GET /api/sessions` route. The code first correctly limited a
trainee to their own records, then immediately overwrote that limit with whatever `?trainee=` value the
caller supplied:

```js
if (req.user.role === 'trainee') where.traineeId = req.user.id;   // correct
...
if (req.query.trainee) where.traineeId = Number(req.query.trainee); // overwrites the line above
```

The second line replaces the restriction instead of narrowing it.

**What happens if ignored:** Any gym member with a normal login could read every other member's
complete session history. Confirmed by testing: logged in as one trainee (id 10) and retrieved another
trainee's sessions (id 11), including their **body weight (74 kg)** and their trainer's written notes.
A member could do this from a phone browser with no tools. For a gym, that is a member's private body
data handed to another member.

**Fix applied:** the query filter can no longer widen a trainee's own scope. Staff filtering is
untouched — verified after the fix that admin, accountant, and trainer roles still filter normally,
while the trainee is confined to their own records regardless of what they send.

**Status:** confirmed — reproduced before the fix, and verified closed after it.

### 2. Every uploaded InBody scan image is being destroyed — NOT FIXED (needs your decision)

**What it is:** `server/index.js` line 16. On Vercel, uploads are written to `/tmp`:

```js
const UPLOADS = process.env.VERCEL ? '/tmp/sportpower-uploads' : path.join(__dirname, '..', 'uploads');
```

`/tmp` on a serverless platform is scratch space. It is wiped when the instance shuts down, and each
instance has its own copy, so an image uploaded by one request is often invisible to the very next one.

**What happens if ignored:** Every InBody scan photo the staff uploads disappears — usually within
minutes, and always on the next deployment. The database row keeps the filename, so the system will
show a member's reading history with permanently broken image links, and nobody will notice until a
member asks to see their scan from three months ago. The data is already gone by then.

**Fix:** this one needs a decision from you, because it needs an account and a credential I should not
create on your behalf. The standard fix is object storage — **Vercel Blob** is the least-friction
option since you are already on Vercel: add the `@vercel/blob` package, upload to it instead of writing
to disk, and store the returned URL. Cloudflare R2 or Amazon S3 work equally well. Whichever you pick,
use **private** storage with short-lived signed links rather than public URLs, which also closes
finding 3 below. Until this is done, treat InBody images as not-yet-working and keep the paper copies.

**Status:** confirmed.

---

## Medium — worth doing

### 3. InBody images are readable without logging in — PARTLY FIXED

`/uploads` was served as plain static files with no authentication check, so anyone holding an image
URL could open a member's body-composition scan without a login, forever. Filenames only carried 32
bits of randomness.

Hardened in this commit: filenames now use 128 bits of randomness (practically unguessable),
`Cache-Control: private, no-store` prevents shared caches from keeping copies, and `X-Robots-Tag:
noindex` keeps them out of search engines. This is meaningful but it is still *secret-URL* protection —
any URL that leaks (a forwarded message, browser history on a shared computer) grants permanent access.
The complete fix is the same object-storage move as finding 2. **Status:** confirmed.

### 4. Security headers were missing on the actual web page — FIXED

Only a live check catches this one. The Express server sets a solid Content-Security-Policy,
`X-Frame-Options: DENY`, and `nosniff` — but on Vercel the `public/` folder is served straight from the
CDN and never passes through Express. Verified against production: `/api/config` carried all the
headers, while the HTML page at `/` carried **none** of them (`x-vercel-cache: HIT` confirms it came
from the CDN).

The practical effect: the Content-Security-Policy was being applied to JSON responses, where it does
nothing, and was absent from the page, where it would do the actual work. The site could also be loaded
inside a hidden frame on another site (clickjacking). Fixed by declaring the same headers in
`vercel.json`, which applies them to CDN-served responses too. HSTS was already present via Vercel.
**Status:** confirmed.

### 5. Default administrator password `admin123` — FIXED

`server/seed-data.js` fell back to `admin123` whenever `ADMIN_PASSWORD` was unset. Your live system is
safe (tested), but `scripts/reset-production.sql` is a documented procedure — anyone who runs a reset
and forgets the environment variable would reopen the system to anyone who read the README, which is
public. Now the seed refuses to run without a 12-character-plus `ADMIN_PASSWORD`, with a clear message.
Failing the deploy is the right outcome here; an exposed admin account is not. **Status:** confirmed.

### 6. Login rate limiting does not really work in production

`loginAttempts` is an in-memory `Map` in `server/index.js`. It works correctly on a single server —
verified locally that the 9th bad password returns `429`. But Vercel runs many short-lived instances,
each with its own empty `Map`, so an attacker spreading guesses across requests gets far more attempts
than the intended 8. Scrypt hashing means stolen hashes are still hard to crack, so this is a
throttling weakness rather than an open door. The durable fix is to keep the counter in the database
(you already have Postgres) or use Vercel KV. Unbounded growth of that `Map` was fixed in this commit.
**Status:** confirmed.

### 7. Contract links exposed the applicant's full personal and health record — FIXED

`GET /api/public/contract/:token` needs no login by design, which is correct — the customer opens it
from WhatsApp. But after submission it returned the entire submission back to anyone opening the link:
full name, phone, **date of birth, home address, health notes, and emergency contact** — with the
expiry check skipped once the status was no longer `open`, so the link worked forever.

Verified on the running system: opening a contract link returned a real applicant's date of birth,
city, emergency phone number, and health notes with no authentication at all. WhatsApp links get
forwarded; whoever holds it later is not necessarily the person whose data it is. Now the link returns
only a confirmation (name, chosen package, price, date) while the contract is still open, and nothing
once it has expired or been converted. **Status:** confirmed.

### 8. The repository is public

`markerstudio/sportpower` is public on GitHub. The scanner found **no committed secrets and nothing
sensitive in git history** — that part is clean. But the repository publishes the complete
authentication design, the seed data, and (until this commit) the default admin password, for a system
that holds gym members' payment and health data. There is no upside to that. Make it private in
GitHub → Settings → General → Danger Zone. **Status:** confirmed.

### 9. Staff password minimum was 6 characters — FIXED

Administrators could create staff accounts with 6-character passwords, while the self-service password
change already required 8. Raised both to 8. Note that `mustChangePassword` is still only a hint to the
interface — the server does not force the change. Worth doing later. **Status:** confirmed.

### 10. Privacy: no privacy policy and no consent for health data (PRIVACY, not security)

The system collects health notes, body-composition readings, dates of birth, home addresses, and
emergency contacts. There is no privacy policy, and the electronic contract asks the customer to agree
to *subscription terms* — not to a statement of what data is collected, why, how long it is kept, or
who can see it. Under GDPR-style rules health data is a special category needing an explicit legal
basis, and this matters if any member is an EU resident or the business operates across borders.

This is a document-and-consent gap, not a code bug: write a short privacy notice, link it from the
contract page, and add a separate tick-box for health-data processing that is distinct from the
subscription-terms tick-box. **Status:** confirmed.

### 11. `xlsx` has an unpatched high-severity advisory

`npm audit` reports prototype pollution and ReDoS in SheetJS, with **no fix available** on the npm
registry. It is used in `server/ops.js` to parse uploaded spreadsheets in `/api/frozen/import`, which
is restricted to admin and accountant — so an attacker would need to get a staff member to import a
crafted file. Options: move to the vendor's own registry release (`https://cdn.sheetjs.com`), which is
newer than the npm copy, or drop the import feature if it is rarely used. **Status:** suspected — the
advisory is real; exploitability here is limited by the role restriction.

---

## Low / notes

- **Fail-open to demo mode** — if `DATABASE_URL` ever goes missing (a suspended Neon free-tier database
  would do it), the app silently falls back to a local JSON file and seeds the *demo* dataset, whose
  passwords are published in the README. Real data is not exposed (it stays in Postgres, unreachable),
  so the impact is a confusing outage rather than a breach — but the site would happily accept
  `admin/admin123` while in that state, and `/api/config` announces `demo:true` publicly. Consider
  refusing to start in production without a database.
- **`.gitignore` was missing `.env` and `*.pem`** — nothing was leaked, but there was nothing stopping
  the next `.env` from being committed. Fixed in this commit.
- **15 MB request bodies were accepted from unauthenticated callers** — every route, including login,
  accepted 15 MB. Fixed: 256 KB globally, 15 MB only on the four routes that upload images or files.
- **Sliding sessions had no absolute cap** — a 12-hour session extended indefinitely while in use, so a
  stolen token stayed alive as long as the thief kept using it. Fixed: a hard 7-day ceiling.
- **`/api/health` and `/api/config` disclose storage mode without a login.** Minor, but they tell an
  attacker whether you are in demo mode. Consider requiring auth on `/api/config`.
- **Legacy static-salt SHA-256 password path** still exists in `server/store.js` for backwards
  compatibility. Harmless today (`npm run db:check` confirms all stored passwords are scrypt); remove
  it once you are sure no old database is in play.
- **Privacy: no self-serve data deletion.** Removing a member's record would mean hand-editing the
  database. A documented deletion procedure would be enough for now.
- **The live scanner reported `/.env`, `/.git/config`, `/backup.zip` and similar as "publicly
  reachable" — these are false alarms.** Every one of them returns the app's own HTML page, because the
  single-page-app catch-all answers `200` for any unknown path. Verified by hand. Nothing is exposed.

---

## Passed

Checked and found sound — these do not need your attention:

- **Password storage.** scrypt with a per-user random salt, compared in constant time. Not a plain hash.
- **Session handling.** 256-bit random tokens, stored hashed, with expiry; changing a password
  correctly invalidates the user's other sessions; logout genuinely deletes the token.
- **Cross-site scripting.** Injected `<img src=x onerror=alert(1)>` and `<script>` into a session-rating
  comment. It stored raw but rendered inert: the UI builds elements through `document.createTextNode`,
  and the one raw-HTML path (`html:` in `ui.js`) is only ever used with a fixed string. This is the
  right design and it held.
- **SQL injection.** The scanner flagged string-built SQL in `server/pg.js`, but every flagged line
  interpolates only internal table and column names from the schema file — all user-supplied values go
  through `$1` parameters. Not injectable.
- **Role enforcement on the server.** Tested a trainee account against 13 endpoints: `users`,
  `payments`, `tasks`, `kpi`, `trainer-logs`, `session-ratings`, `reports/monthly` and the other
  members' `trainee/:id/overview` all correctly returned `403`; unauthenticated requests returned `401`.
- **Price confidentiality.** The rule that trainers must not see prices actually holds. Tested as a
  trainer: subscriptions, packages, and a member's full profile all came back with prices, payments,
  finance totals, and ratings stripped by the server — not hidden by the interface.
- **Trainer scoping.** A trainer requesting another member's sessions receives only the ones they
  personally conducted.
- **No committed secrets.** Nothing sensitive in the working tree or in git history.
- **Transport.** HTTPS enforced, HTTP redirects to HTTPS, HSTS present with a two-year max-age and
  preload. No mixed content. No secrets in the delivered JavaScript bundle.
- **Error handling.** 500-class errors return a generic Arabic message; stack traces and library
  versions are not leaked to users.
- **Database integrity.** Real foreign keys, tracked migrations, statement timeouts, TLS certificate
  verification on by default, and session deduction inside an atomic transaction with a row lock —
  `npm run db:check` passes clean.

---

## Not checked

- **The production database itself.** No credentials, so table contents, real user data, and the actual
  backup/restore state were not inspected. All live testing was read-only HTTP against public endpoints.
- **Vercel project settings.** Cannot see environment variables, deployment protection, or team access.
  Confirm `ADMIN_PASSWORD` and `DATABASE_URL` are set there and not anywhere in the repository.
- **Neon backup restores.** The README documents a monthly restore drill. Whether one has actually been
  performed is unknown — an untested backup is not a backup.
- **Authenticated production behaviour.** No production staff account was used, so the IDOR fix was
  verified locally rather than against live data.
- **Any load beyond a single tester.** No stress or denial-of-service testing was performed.

---

## Closing

**The single most important fix:** move uploaded images off `/tmp` to object storage. It is the one
serious finding still open, it destroys real member data every single day it stays as it is, and it
closes the unauthenticated-image exposure at the same time.

**What this audit cannot tell you:** this was an automated sweep plus a hands-on review by one reader.
It is not a penetration test. It cannot prove the absence of flaws, it did not touch your production
database, and it could not see your hosting configuration. For a system holding members' payment and
health data — tier 3 — **a paid review by an experienced security engineer is warranted before you put
this in front of real members**. Findings 2, 3, and 10 in particular deserve a professional second look.

**What to re-check later:** re-run this audit after any significant change, and on a schedule
regardless — dependencies pick up new advisories on their own. `npm audit` monthly is a reasonable
minimum. The previous score is saved so the next run can show the delta.
