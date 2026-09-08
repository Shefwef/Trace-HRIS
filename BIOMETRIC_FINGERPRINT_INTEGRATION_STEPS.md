# Biometric Integration — Steps To Follow

The runbook. Do these in order. Each step says where you have to be, what you
type, and what proves it worked.

The design reasoning lives in
[BIOMETRIC_INTEGRATION.md](BIOMETRIC_INTEGRATION.md) — read §1 to §3 there once
before starting so the shape of this makes sense. The short version:

> The M2-LR already pushes its punches to the vendor's software on the office PC.
> That software keeps that job. A small agent on the same PC polls it and posts
> the punches out to the HRIS over HTTPS. No device setting is touched, no vendor
> setting is touched, and the HRIS is never addressed by IP.

## Status legend

| Tag | Meaning |
|---|---|
| **APP** | Code in this repo. Laptop, no office access needed. |
| **PC** | Needs a session on the office desktop that runs the vendor software. |
| **DEVICE** | Needs physical access to the M2-LR on the wall. |
| **NET** | Router or DNS configuration. |
| **DEFER** | Explicitly out of scope for now. |

## Honesty box

**Steps 1–8 are complete and merged.** The schema, ingest pipeline, API routes,
admin screen, and simulator are all running.

**As of September 2026:** ZKBioTime is confirmed as the vendor software. You now
have access to the system from the office PC. Steps 9–10 are where you are right
now — follow them to extract credentials and test the API.

Steps 9 to 16 have never been run against the real PC or the real device.
Until Step 13 passes, the correct description of this feature is
**integration-ready**, not "integrated". Do not tell the office it works before Step 13.

## Office PC visit — COMPLETE (September 2026)

All values confirmed. The office PC work is done.

| Value | Confirmed |
|---|---|
| `BIOTIME_BASE_URL` | `http://192.168.68.64:8081` |
| `BIOTIME_AUTH` | `basic` |
| `BIOTIME_USERNAME` | `admin` |
| `BIOTIME_TERMINAL_SN` | `FQQ2251600181` |
| `BIOMETRIC_DEVICE_SERIAL` | `FQQ2251600181` |
| Device name | SenseFP M2 (`terminal_name: "SenseFP M2"`) |
| Device state | `"1"` — online |
| Device timezone | `terminal_tz: 6` — GMT+6 ✓ |
| LAN IP on 192.168.68.64 | Confirmed responding ✓ |
| Total punches | 1,628 |
| Enrolled employees | 18 (`emp_code` 01, 10–26) |

**Important — `punch_state: "255"` (Unknown):** Many existing punches have
state `"255"` instead of `"0"` (In) or `"1"` (Out). This is because the device
was not configured with check-in/check-out states when those punches were
recorded — employees tapped without selecting a direction. The agent handles
`"255"` as a neutral tap and the HRIS ingest stores it as-is; the attendance
logic treats the first tap of the day as clock-in and the last as clock-out
regardless of `punch_state`. See Step 13 for the agent's handling.

**Employee roster from ZKBioTime** (emp_code → name, for the mapping screen):

| emp_code | Full name |
|---|---|
| 01 | Fuad M Khalid Hossen |
| 10 | Recardo Halder |
| 11 | Ahmed Julker Nine |
| 12 | Mimma Afrin |
| 13 | Tanvir Kabir |
| 14 | Tahsina Shiva |
| 15 | ASM Saifullah |
| 16 | Umme Mahbuba Tama |
| 17 | Shaila Rahman Ema |
| 18 | Nabeel Khan |
| 19 | Tanjum Tushi |
| 20 | Mobarok Uddin Ahmed |
| 21 | Moudud Sujan |
| 22 | M. Mahraj-ul-Alam Samrat |
| 23 | Milon Miah |
| 24 | Rubayat E Shams Anik |
| 25 | Fahmida Akter |
| 26 | Yasin |

Note: `emp_code "1001"` appears in transactions with no name — unenrolled/deleted
entry, will be stored as unmapped and flagged in the admin screen.

**Next action: back on your development machine → Step 10b (fill env files) → Step 13 (build the agent).**

Then follow Steps 9 and 10 below for the full detail and env-var setup.

2. **Get a token — try these in order until one works:**

   > **Windows note:** PowerShell has a `curl` alias that points to
   > `Invoke-WebRequest`, not the real curl binary — it will throw
   > "parameter name u is ambiguous" and similar errors. Always use
   > **`curl.exe`** (with the `.exe`) in PowerShell, or open
   > **Command Prompt** (`Win + R` → type `cmd` → Enter) and use `curl`
   > there — cmd.exe has no alias and always calls the real binary.

   **Option A — HTTP Basic auth (most reliable, try this first):**
   Basic auth on GET requests bypasses CSRF entirely — no token needed.
   In Command Prompt (`cmd.exe`):
   ```cmd
   curl -s -u "YOUR_USERNAME:YOUR_PASSWORD" "http://127.0.0.1:8081/iclock/api/transactions/?page_size=5"
   ```
   In PowerShell (note the `.exe`):
   ```powershell
   curl.exe -s -u "YOUR_USERNAME:YOUR_PASSWORD" "http://127.0.0.1:8081/iclock/api/transactions/?page_size=5"
   ```
   If either returns `{"code":0,"data":[...]}` — Basic auth works. You're done.
   Set `BIOTIME_AUTH=basic` and you don't need a token at all.

   **Option B — JWT via curl with Referer header (fixes CSRF):**
   The docs page UI gives "CSRF token missing". The fix is a `Referer` header,
   which Django's CSRF middleware accepts as a same-origin signal.
   In Command Prompt:
   ```cmd
   curl -s -X POST "http://127.0.0.1:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -H "Referer: http://127.0.0.1:8081/" -d "{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}"
   ```
   In PowerShell:
   ```powershell
   curl.exe -s -X POST "http://127.0.0.1:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -H "Referer: http://127.0.0.1:8081/" -d '{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}'
   ```
   Success returns `{"token":"eyJ..."}`. Copy that value — it is valid 7 days.

   **Option C — JWT with CSRF cookie (if Option B still fails):**
   In Command Prompt only (two commands chained with `&&`):
   ```cmd
   curl -s -c cookies.txt "http://127.0.0.1:8081/" && curl -s -X POST "http://127.0.0.1:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -H "Referer: http://127.0.0.1:8081/" -b cookies.txt -d "{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}"
   ```
   Fetches the login page to capture the CSRF cookie, then POSTs with it.
   Delete `cookies.txt` after copying the token.

   **Option D — General (non-expiring) Token:**
   Log into ZKBioTime in the browser → your user profile or
   `http://127.0.0.1:8081/api/` → look for an API Token field.
   Never expires — better than the 7-day JWT for a long-running agent.
   Set `BIOTIME_AUTH=token`.

3. **Verify the auth method reaches the data** (use whichever worked above):
   ```cmd
   curl -s -H "Authorization: JWT eyJ...your_token..." "http://127.0.0.1:8081/iclock/api/transactions/?page_size=5"
   ```
   General Token: replace `JWT` with `Token` and paste the General Token value.
   Basic auth: replace `-H "Authorization:..."` with `-u "USERNAME:PASSWORD"`.

   Success: `{"count":…,"code":0,"data":[…]}`
   If you get 403 on all options, stop and go to Step 11 (direct DB read).

4. **Write down and bring back** (never put these in a commit):
   - Base URL and port (e.g. `http://127.0.0.1:8081`)
   - The token you generated (JWT or General)
   - Which token type it is (`jwt` or `token`)
   - Device serial from `MENU → System Info → Device Info` on the fingerprint machine

Then follow Steps 9 and 10 below for the full audit and env-var setup.

## Do not, under any circumstances

- Factory-reset the M2-LR.
- Clear the M2-LR's attendance log.
- Change the M2-LR's ADMS / Cloud Server address. That points at the vendor
  software and is the only push slot the device has.
- Write to the vendor software's database.
- Delete or "clean up" anything inside the vendor software.

The vendor's professionals configured that installation. Every step below is
read-only with respect to their work.

---

# Phase 1 — Application work (no office access)

## Step 1 — Schema **APP**

Add to `hris/prisma/schema.prisma`:

- `MOCK` on `enum AttendanceSource` (currently `MANUAL`, `BIOMETRIC` only).
- `biometricUserId String? @unique` on `model User`.
- Models `BiometricDevice`, `BiometricPunch`, `BiometricSyncLog` — full
  definitions in BIOMETRIC_INTEGRATION.md §4.

The unique constraint that makes everything else safe:

```prisma
@@unique([deviceId, deviceUserId, punchedAt])
```

Then:

```bash
cd hris && npx prisma migrate dev --name biometric_punch_ingest
```

**Proof:** `npx prisma studio` lists the three new tables, and
`npx tsc --noEmit` exits 0.

## Step 2 — The ingest pipeline **APP**

One function, `ingestPunches()`, in `hris/src/lib/biometric.ts`. Every
transport — the API poller, the DB reader, the QA simulator — calls this and
nothing else. That is the point: there is one place where timezone conversion,
deduplication, mapping and attendance-writing happen.

It must:

1. Resolve `deviceSerial` to an active `BiometricDevice`, or reject.
2. Parse each `punchedAt` **as `Asia/Dhaka`** and convert to UTC. Do not let a
   bare string reach Prisma. `BIOMETRIC_TZ` supplies the zone; Bangladesh has no
   DST, so there is no ambiguity window to handle.
3. Insert with `skipDuplicates` / `ON CONFLICT DO NOTHING`. A repeat is a
   `duplicate`, counted, HTTP 200, not an error.
4. Map `deviceUserId` to `User.biometricUserId`. No match: store the punch with
   `employeeId = null` and count it as `unmapped`. Never drop it.
5. For each affected (employee, local day), recompute the `AttendanceRecord`:
   earliest `punchState = "0"` to `clockInTime`, latest `"1"` to `clockOutTime`,
   `source = BIOMETRIC`, `biometricDeviceId = serial`. Ignore `"2"`–`"5"`.
6. Never overwrite a field a human corrected. Manual wins; the raw punch is kept
   regardless.
7. Write one `BiometricSyncLog` row per batch.
8. Return `{ received, applied, duplicates, unmapped, rejected }`.

**Proof:** unit-test with a fixed batch. Calling it twice must give
`applied: n` then `applied: 0, duplicates: n`, with the attendance row identical
after the second call.

## Step 3 — The public ingest route **APP**

`hris/src/app/api/biometric/punches/route.ts`.

- Add `'/api/biometric/(.*)'` to `isPublicRoute` in `hris/src/proxy.ts`.
  It is currently `['/', '/sign-in(.*)', '/api/webhooks/(.*)']`.
- Authenticate with `Authorization: Bearer <BIOMETRIC_INGEST_TOKEN>`, compared
  in constant time. A script is calling this, not a person — there is no Clerk
  session to check.
- Validate the body with Zod, alongside the other schemas in
  `hris/src/lib/validation.ts`.
- Apply the existing Postgres fixed-window rate limiter.
- Cap the batch at 500 punches per request.

**Proof (no device needed).** With `npm run dev` running:

```bash
curl -s -X POST http://localhost:3000/api/biometric/punches -H "Content-Type: application/json" -H "Authorization: Bearer $BIOMETRIC_INGEST_TOKEN" -d '{"deviceSerial":"TEST-DEV-1","punches":[{"deviceUserId":"10001","punchedAt":"2026-08-25 09:02:13","punchState":"0","verifyType":1}]}'
```

First call: `{"received":1,"applied":1,"duplicates":0,"unmapped":0}`.
Run the identical command again: `{"received":1,"applied":0,"duplicates":1}`.
That second response is the single most important test in this document — it is
what makes the office agent safe to restart, retry and overlap.

Also confirm a wrong token returns 401 and that no punch was written.

## Step 4 — Fix the UTC day-key bugs **APP**

These are pre-existing and will corrupt biometric attendance if left alone.

- `hris/src/app/api/attendance/clock-in/route.ts` — day key built from
  `Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())`. In
  UTC+6 every punch before 06:00 local files under the previous day.
- `hris/src/app/api/attendance/today/route.ts` — same pattern, plus
  `isWeekend: [0,6].includes(...)` (Sunday + Saturday), which contradicts
  `hris/src/lib/leave.ts` where the Bangladesh weekend is correctly Friday +
  Saturday.
- `hris/src/screens/employee/Dashboard.tsx:40` — `new Date().toISOString().slice(0, 10)`.

Move all of them to `format(d, 'yyyy-MM-dd')` local keys, the way the calendar
and heatmap already did in commits `36c54b5` and `59c7222`.

**Proof:** set your machine clock to 02:00 Dhaka, clock in, and confirm the
record lands on today rather than yesterday.

## Step 5 — Permissions **APP**

Three keys into `hris/src/lib/permissions.ts` (24 today, 27 after):
`biometric.view`, `biometric.manage`, `biometric.simulate`. Add labels and a
"Biometric" entry to `PERMISSION_GROUPS`. Defaults: Super Admin all three,
Admin and HR `view` + `manage`, Line Manager and Employee none.

```bash
cd hris && npm run db:sync-roles
```

That is the non-destructive script. **Do not run `npm run db:seed`** — it
re-applies hardcoded passwords to all 12 Clerk accounts and prunes
non-allowlisted users.

**Proof:** the three rows appear at `/admin/permissions` and toggling one
changes behaviour within the 60-second cache TTL.

## Step 6 — Admin screen **APP**

`/admin/biometric`, gated on `biometric.view`, in `hris/src/screens/admin/`
following the `PermissionsMatrix.tsx` pattern.

- **Devices** — serial, alias, `lastSeenAt`, active toggle, register form.
- **Mapping** — every employee beside a `biometricUserId` input. Once Step 10
  is done, a **Suggest from device roster** button pre-fills it by name match.
- **Unmapped punches** — the `employeeId = null` queue, with a one-click assign.
  This is the screen that stops attendance from silently vanishing.
- **Recent punches** — last 100, with `verify_type` shown so you can see at a
  glance whether people are using fingerprint (1) or something else.
- **Sync log** — the last 50 `BiometricSyncLog` rows.

## Step 7 — Simulator **APP**

Behind `biometric.simulate`: pick an employee, pick In or Out, submit. Writes
through `ingestPunches()` with `source = MOCK`.

This exists so Steps 1 to 6 can be fully demonstrated and QA'd before anyone
goes to the office, and so a future regression can be reproduced without the
wall panel.

## Step 8 — Merge point **APP**

`npx tsc --noEmit` and `npm run build` both exit 0. QA the simulator path
end-to-end. This is a safe commit: nothing here can affect the office, because
nothing here talks to the office yet.

---

# Phase 2 — Identify the office setup (one sitting on the PC)

## Step 9 — Audit form and credential extraction **PC** / **DEVICE** ← DO THIS NEXT

Fill this in completely before writing any agent code. Guessing here is what
turns a one-hour job into a week.

**The credentials live inside ZKBioTime on the office PC — you need to extract
them and bring them back to your development machine.** The whole thing should
take under 30 minutes if you have someone at the PC.

### 9a — Get your API token from the ZKBioTime docs page

ZKBioTime has a built-in interactive API docs page. This is the fastest and
cleanest way to generate a token without touching any settings.

**Option 1 — JWT token via curl (CSRF-safe)**

The docs page UI (`/api/docs/`) will return "CSRF token missing" when you hit
Execute — this is a known Django CSRF protection issue with Swagger UIs. Use
curl with a `Referer` header instead, which Django accepts as same-origin:

In Command Prompt (`cmd.exe` — not PowerShell):
```cmd
curl -s -X POST "http://127.0.0.1:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -H "Referer: http://127.0.0.1:8081/" -d "{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}"
```

In PowerShell (`.exe` suffix required):
```powershell
curl.exe -s -X POST "http://127.0.0.1:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -H "Referer: http://127.0.0.1:8081/" -d '{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}'
```

Returns `{"token":"eyJ..."}`. Copy the token value — valid for **7 days**.
In `agent/.env` set: `BIOTIME_TOKEN=eyJ...` and `BIOTIME_AUTH=jwt`.
The agent sends: `Authorization: JWT eyJ...`

If the Referer header alone is not enough, fetch the CSRF cookie first
(Command Prompt only):
```cmd
curl -s -c cookies.txt "http://127.0.0.1:8081/" && curl -s -X POST "http://127.0.0.1:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -H "Referer: http://127.0.0.1:8081/" -b cookies.txt -d "{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}"
```

Delete `cookies.txt` after copying the token.

**Option 2 — General (non-expiring) token**

Some ZKBioTime versions expose a permanent token per user:
- Check `http://127.0.0.1:8081/api/` for a Token section, or
- Go to your user profile inside ZKBioTime — some builds show "API Token" there
- A General Token uses `Authorization: Token <value>` and never expires,
  making it more reliable for an always-running agent than the 7-day JWT
- In `agent/.env` set: `BIOTIME_TOKEN=ae600...` and `BIOTIME_AUTH=token`

**Option 3 — HTTP Basic auth (fallback, no token needed)**

If neither token method works, HTTP Basic auth uses your login credentials
directly on every request — no token to generate or renew:
- In `agent/.env` set: `BIOTIME_USERNAME=...`, `BIOTIME_PASSWORD=...`,
  `BIOTIME_AUTH=basic`
- Basic auth is reported to pass the ZKBioTime license gate where JWT does not

**Option 4 — create a dedicated integration account (recommended for production)**

Rather than using the admin account, create a purpose-built one:
1. Log into ZKBioTime → **System → User Management**
2. Add user: `hris_integration`, assign the **Operator** or **Reports** role
3. Generate its token via Option 1 or use Basic auth with its credentials
4. This account can be revoked without touching the admin password

### 9b — Audit form (COMPLETE — September 2026)

```
--- Credentials ---
Auth method that worked:                   basic  ✓
ZKBioTime username:                        admin  (use dedicated account in production)
ZKBioTime password:                        [in agent/.env only — never in this file]
JWT / General token:                       not needed — Basic auth confirmed working

--- Vendor software ---
Name:                                      ZKBioTime  ✓
PC LAN IP (ipconfig → IPv4 Address):       192.168.68.64  ✓
PC default gateway:                        192.168.68.1
BIOTIME_BASE_URL:                          http://192.168.68.64:8081  ✓
PC LAN IP is DHCP or static?              DHCP (recommend DHCP reservation — Step 12)
Dedicated integration account created?     N (using admin for now)
PC can make outbound HTTPS (443)?          TBC — run before deploying agent:
   curl.exe -s -o NUL -w "%{http_code}" https://example.com  (expect 200)

--- Device ---
Serial number:                             FQQ2251600181  ✓
Device name:                               SenseFP M2
Firmware version:                          ZAM70-NF28HA-Ver3.1.12
Push version:                              Ver 3.0.4S-20240809
Device timezone:                           GMT+6 (terminal_tz: 6)  ✓
Device state:                              "1" — online  ✓
Cloud server address currently set:        points at 192.168.68.64:8081 (ZKBioTime)
   DO NOT CHANGE — this is the device's only push slot.
Device timezone setting:                   GMT+6, no DST  ✓
```

## Step 10 — Probe the API and confirm credentials work **COMPLETE**

Do this in two stages: first from the office PC (to confirm the local API is
reachable), then from your development machine (to confirm the agent will be
able to reach it remotely).

### 10a — COMPLETE (September 2026)

All three endpoints confirmed working with HTTP Basic auth:

- `GET /personnel/api/employees/` → 18 employees, `code: 0` ✓
- `GET /iclock/api/transactions/` → 1,628 punches, `code: 0` ✓
- `GET /iclock/api/terminals/` → 1 device, `state: "1"` (online) ✓
- LAN IP `192.168.68.64` responds identically to `127.0.0.1` ✓

**Notable:** `punch_state` on most records is `"255"` (Unknown) — employees
tapped without selecting In/Out direction. The agent treats `"255"` the same
as any other punch: stores it as-is, and the attendance logic uses first tap
of the day as clock-in and last tap as clock-out regardless of state.

### 10b — Fill in env files on your development machine

Generate the shared ingest token once (run on your dev machine):

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. Then fill in these two files (both are gitignored):

**`agent/.env`** — create this file in the `agent/` directory:

```ini
HRIS_BASE_URL=https://<your-vercel-or-custom-domain>
BIOMETRIC_INGEST_TOKEN=<paste-generated-token-here>

BIOTIME_BASE_URL=http://192.168.68.64:8081
BIOTIME_USERNAME=admin
BIOTIME_PASSWORD=<ask-IT-PM>
BIOTIME_AUTH=basic
BIOTIME_TERMINAL_SN=FQQ2251600181

POLL_SECONDS=60
LOOKBACK_MINUTES=15
```

**`hris/.env.local`** — add these three lines:

```ini
BIOMETRIC_INGEST_TOKEN=<same-token-as-above>
BIOMETRIC_TZ=Asia/Dhaka
BIOMETRIC_DEVICE_SERIAL=FQQ2251600181
```

The agent runs on the office PC and dials **out** to the HRIS over HTTPS.
The HRIS never dials in. `BIOTIME_BASE_URL` uses the LAN IP because the
agent is on the same network as ZKBioTime.

Once both files are filled in, proceed to Step 13 (build the agent).

## Step 11 — Path B, only if Step 10 failed **PC**

Ask whoever administers the PC for a **read-only** database user, then:

```sql
SELECT emp_code, punch_time, punch_state, terminal_sn, id
FROM iclock_transaction
ORDER BY punch_time DESC
LIMIT 10;
```

`iclock_terminal.terminal_tz` holds the device's configured offset.

Read-only, permanently. `SELECT` and nothing else, enforced by the grant and not
by intention.

## Step 12 — Fix their two IP problems **NET**

Independent of the HRIS, and worth doing while you are there.

1. **DHCP reservation for the PC**, by MAC address, in the router admin page —
   or a static IP on the PC. This is what permanently ends the recurring "the
   device stopped working, someone retype the IP" outage, because the address
   burned into the device's menu stops going stale.
2. **DDNS on the router** — No-IP, DynDNS or DuckDNS — so the PM's phone uses a
   stable hostname instead of a public IP that rotates.

Neither is required for attendance sync. The agent dials *out*, so their WAN IP
is irrelevant to the HRIS. Do them because they fix a real recurring outage.

---

# Phase 3 — The agent

## Step 13 — Build and run it **APP** then **PC**

A standalone Node script in `agent/`, not part of the Next app. It runs on the
office PC.

Loop:

1. Ask the HRIS, or read from local state, for the newest punch already
   delivered. On a cold start, use `now - LOOKBACK_MINUTES`.
2. `GET /iclock/api/transactions/?terminal_sn=<SN>&start_time=<since>&ordering=punch_time&page_size=500`,
   following `next` until exhausted. `start_time` format is
   `YYYY-MM-DD HH:MM:SS`; URL-encode the space as `%20`.
3. Keep only `punch_state` `"0"` and `"1"`.
4. `POST` to `${HRIS_BASE_URL}/api/biometric/punches` with the bearer token.
5. Log the returned counts. Sleep `POLL_SECONDS`.

Requirements, each of which corresponds to a way this otherwise breaks in
production:

- **Overlap the window** by `LOOKBACK_MINUTES` on every poll. Cheap, because
  Step 3 made duplicates free, and it means a punch is never lost to a clock
  skew or a slow write.
- **Never delete or acknowledge anything** in the vendor software. Read only.
- **Retry with backoff** on network failure and keep the cursor unmoved.
- **Never log credentials or the token.**
- Install as a Windows service or a Scheduled Task set to *Run whether user is
  logged on or not*, so it survives a reboot and does not need someone's session
  to stay open.

Config in `agent/.env`, exactly the block in BIOMETRIC_INTEGRATION.md §6.
Generate the shared token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The same value goes in `hris/.env.local` as `BIOMETRIC_INGEST_TOKEN` and in
`agent/.env`. Both files are gitignored. Neither value goes in a commit, a log
line, or this document.

**Proof — this is the acceptance test for the whole feature.** Register the real
serial at `/admin/biometric`, map your own `emp_code` to your own account, start
the agent, walk to the wall panel and tap your finger. Within
`POLL_SECONDS + a few` the punch appears in Recent punches with `verify_type: 1`
and your attendance row for today shows a clock-in **at the wall-clock minute
you actually tapped**, not six hours off. Tap again at the end of the day and
confirm clock-out.

Then confirm the other half: the vendor software still shows that same punch, the
PM's phone panel still works, and `state` on `/iclock/api/terminals/` is still
`"1"`. Nothing was taken away from them.

## Step 14 — Test matrix **PC** / **DEVICE**

| # | Case | Expected |
|---|---|---|
| A | First clock-in of the day | `clockInTime` = tap time, local |
| B | Second clock-in same day | earliest wins, no duplicate row |
| C | Clock-out | `clockOutTime` = latest Out |
| D | Two clock-outs | latest wins |
| E | Punch before 06:00 Dhaka | files under **today**, not yesterday (Step 4) |
| F | Same batch replayed | `applied: 0, duplicates: n`, nothing changes |
| G | Unknown `emp_code` | stored, `unmapped: 1`, appears in the queue |
| H | Agent stopped 30 min, restarted | backlog arrives, none lost, none doubled |
| I | HRIS unreachable during a poll | agent retries, cursor unmoved, catches up |
| J | Break buttons in the web UI | still work, `BreakSession` rows unaffected |
| K | HR corrects a time by hand | correction survives the next sync |
| L | Wrong bearer token | 401, nothing written |
| M | Device offline | `state != "1"`, health card shows it, no crash |

E, F, H and K are the ones that fail quietly if you skip them.

## Step 15 — Cutover **PC**

Run the agent alongside the existing manual process for one full week. Compare
the HRIS attendance report against the vendor software's own report for the same
week; they should agree employee by employee, day by day. Only then tell people
the wall panel is the system of record for clock-in and clock-out.

## Step 16 — Rollback

Three levels, in increasing order of severity. You will almost certainly never
need past the first.

1. **Stop the agent.** Punches stop flowing. The HRIS keeps everything it
   already has; manual clock-in still works. The office is completely unaffected.
2. **Deactivate the device row** at `/admin/biometric`. Ingest starts rejecting
   that serial even if a stray agent is still running.
3. **Roll back the migration.** Removes the tables. Manual attendance is
   untouched, because it never depended on them.

At no level does rollback involve touching the device or the vendor software,
because at no point did we change them.

---

# Reference

## Endpoints (read-only, on the vendor software)

| Method | Path | Notes |
|---|---|---|
| POST | `/jwt-api-token-auth/` | `{"username","password"}` -> `{"token"}`, 7 days |
| GET | `/personnel/api/employees/` | roster, gives `emp_code` |
| GET | `/iclock/api/transactions/` | the punches |
| GET | `/iclock/api/terminals/` | device health. Not `/devices/` |
| GET | `/iclock/api/transactions/export/` | `?export_type=csv\|txt\|xls` |

Envelope: `{count, next, previous, msg, code, data}`. `code == 0` is success,
`next`/`previous` are absolute URLs, `page` is 1-indexed, `page_size` default 10.

## Value tables

`punch_state` — `"0"` Check In, `"1"` Check Out, `"2"` Break Out, `"3"` Break In,
`"4"` Overtime In, `"5"` Overtime Out. We use 0 and 1.

`verify_type` — `0` Any, `1` Fingerprint, `2` Pin, `3` Card, `4` ID, `7`
Password, `15` Face, `16` Palm.

## Device menu paths (M2-LR), for reading only

- Serial, firmware: `MENU -> System Info -> Device Info`
- Cloud server address: `MENU -> COMM. -> Cloud Server Setting` — **read, never
  write**
- Time: `MENU -> System -> Date Time` — must be GMT+6, no DST

## Deferred **DEFER**

- Break punches on the device. Buttons in the UI instead — reasoning in
  BIOMETRIC_INTEGRATION.md §5. The ingest already stores `punchState` as text
  and ignores `"2"`/`"3"`, so enabling this later needs no schema change.
- Overtime punch states `"4"` / `"5"`.
- Enrolling fingerprints from the HRIS. Enrollment stays in the vendor software.
- Pushing employees or schedules *into* the device. Read-only, always.
- Face and palm verification, even though the M2-LR supports them.

## Definition of done

- [ ] Steps 1 to 8 merged, `tsc` and `build` green, simulator QA'd
- [ ] Step 9 audit form fully filled in
- [ ] Step 10 or Step 11 produces real punch data
- [ ] Step 13 acceptance test passes with your own finger on the real device
- [ ] Vendor software and the PM's phone panel verified still working
- [ ] Test matrix A to M passes
- [ ] One week of parallel running agrees with the vendor's report
- [ ] `BIOMETRIC_INGEST_TOKEN` set in both places, in neither commit

Until every box is ticked, the feature is integration-ready. Not integrated.
