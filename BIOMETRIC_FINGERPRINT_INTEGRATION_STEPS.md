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

## YOU ARE HERE — Quick reference for the office PC visit

You have ZKBioTime open on the PC. Do these four things in order:

1. **Find the URL** — open a browser on the PC and go to `http://127.0.0.1:8081`.
   If it loads the ZKBioTime login page, that is your base URL. Note the port.

2. **Get credentials** — the username + password you use to log into ZKBioTime
   right now are the API credentials. No separate API key page needed.
   (Optional but recommended: create a dedicated `hris_integration` account
   under System → User Management with the Operator role instead of using admin.)

3. **Test with curl from the PC terminal** (Command Prompt or PowerShell):
   ```cmd
   curl -s -u "YOUR_USERNAME:YOUR_PASSWORD" "http://127.0.0.1:8081/iclock/api/transactions/?page_size=5"
   ```
   Success looks like: `{"count":…,"code":0,"data":[…]}`
   If you get 403, see Step 10a for the JWT fallback.

4. **Write down and bring back** these five values (never put them in a commit):
   - Base URL (e.g. `http://127.0.0.1:8081` or the LAN IP if running from another machine)
   - Username and password
   - Auth method that worked (`basic` or `jwt`)
   - Device serial number from `MENU → System Info → Device Info` on the fingerprint machine

Then follow Steps 9 and 10 below for the full detail.

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

### 9a — Extract the API credentials from ZKBioTime

ZKBioTime uses username + password to authenticate its API. You have two options:

**Option 1 — use the existing admin account (quickest)**

Ask the IT PM for the ZKBioTime admin username and password. This is the same
login used to access the web UI from the phone. Write them down — they become
`BIOTIME_USERNAME` and `BIOTIME_PASSWORD` in `agent/.env`.

**Option 2 — create a dedicated read-only account (recommended for production)**

Inside ZKBioTime on the PC:
1. Log in to the ZKBioTime web interface (the same URL the PM uses on their phone)
2. Go to **System → User Management** (may also be under **Admin → Accounts**)
3. Create a new account — username something like `hris_integration`
4. Assign it the **reports** or **operator** role — the minimum that can read
   `/personnel/` and `/iclock/` endpoints
5. Note the username and password — these become `BIOTIME_USERNAME` and
   `BIOTIME_PASSWORD` in `agent/.env`

**Option 3 — generate an API token directly (if ZKBioTime shows one)**

Some ZKBioTime installations expose a token in **System → API Settings** or
**Integrations**. If you see a pre-generated token there, copy it. It goes in
`agent/.env` as `BIOTIME_TOKEN` and the agent uses `Authorization: Token <value>`
instead of username/password. Check Step 10 to verify which auth method works.

### 9b — Audit form (fill in on the PC)

```
--- Credentials to extract and bring back ---
ZKBioTime username:                        ______________________
ZKBioTime password:                        ______________________  (never commit this)
Pre-generated API token (if exists):       ______________________  (never commit this)
Auth method that worked (basic|jwt|token): ______________________

--- Vendor software ---
Name and version (its About / Help page):  ______________________
   expected: ZKBioTime 8.x, or BioTime 8.0 / 8.5
Exact URL the PM opens on their phone:     ______________________
   -> host: ____________  port: ______   (ZKBioTime often 8081)
PC LAN IP (ipconfig):                      ______________________
PC LAN IP is DHCP or static?               ______________________
Dedicated integration account created?     Y / N   read-only? Y / N
Its database engine + port:                ______________________
   ZKBioTime bundles PostgreSQL by default
PC can make outbound HTTPS (443)?          Y / N
   test:  curl -sS -o NUL -w "%{http_code}" https://example.com

--- Device ---
Serial number   MENU -> System Info -> Device Info:   ________________
Firmware / push version, same screen:                 ________________
Cloud server address currently set
   MENU -> COMM. -> Cloud Server Setting:             ________________
   READ ONLY. Write it down. Do not change it.
Device clock reads (compare to your phone):           ________________
Device timezone setting:                              ________________
   must be GMT+6, no DST
```

The "exact URL the PM opens on their phone" gives you the LAN IP and port in
one field — that becomes `BIOTIME_BASE_URL` in `agent/.env`.

## Step 10 — Probe the API and confirm credentials work **PC** then **your machine**

Do this in two stages: first from the office PC (to confirm the local API is
reachable), then from your development machine (to confirm the agent will be
able to reach it remotely).

### 10a — Test from the office PC

Open a terminal on the office PC. Substitute the real LAN IP, port, and the
credentials you extracted in Step 9.

**Try HTTP Basic auth first** (most reliable against the ZKBioTime license gate):

```bash
curl -sS -u "BIOTIME_USERNAME:BIOTIME_PASSWORD" \
  "http://192.168.1.50:8081/personnel/api/employees/?page_size=5"
```

**If you get JSON** shaped `{"count":…,"msg":…,"code":0,"data":[…]}` — note it
is `data`, not `results` — Path A with Basic auth works. Record every `emp_code`
you see; that is your mapping input for the admin screen.

Then the punches:

```bash
curl -sS -u "BIOTIME_USERNAME:BIOTIME_PASSWORD" \
  "http://192.168.1.50:8081/iclock/api/transactions/?page_size=5&ordering=-punch_time"
```

Confirm on a real row: `punch_time` is offset-less wall clock (`"2026-09-07 09:02:13"`),
`punch_state` is `"0"` (in) or `"1"` (out), `verify_type` is `1` for fingerprint,
and `terminal_sn` matches the serial from Step 9.

Device health:

```bash
curl -sS -u "BIOTIME_USERNAME:BIOTIME_PASSWORD" \
  "http://192.168.1.50:8081/iclock/api/terminals/"
```

`state: "1"` means online. It is `/terminals/`, not `/devices/` — the latter 404s.

**If Basic auth returns 403 with an `IsNotOpenAPI` marker**, try JWT:

```bash
# 1. Get a token
curl -sS -X POST "http://192.168.1.50:8081/jwt-api-token-auth/" \
  -H "Content-Type: application/json" \
  -d '{"username":"BIOTIME_USERNAME","password":"BIOTIME_PASSWORD"}'
# -> returns {"token":"ey..."}

# 2. Use it
curl -sS -H "Authorization: JWT ey..." \
  "http://192.168.1.50:8081/iclock/api/transactions/?page_size=5"
```

Basic auth is reported to pass the license gate where JWT does not, so try Basic
first. First requests can take 30–45 seconds cold — the Django app is waking up,
not failing.

**If both fail**, stop and go to Step 11.

### 10b — Bring the credentials to your development machine

Once Step 10a passes, fill in `agent/.env` on your development machine (this
file is gitignored and must never be committed):

```ini
HRIS_BASE_URL=https://<your-vercel-or-custom-domain>
BIOMETRIC_INGEST_TOKEN=          # generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

BIOTIME_BASE_URL=http://192.168.1.50:8081   # the LAN IP and port from Step 9
BIOTIME_USERNAME=                            # from Step 9a
BIOTIME_PASSWORD=                            # from Step 9a — never commit
BIOTIME_AUTH=basic                           # basic | jwt — whichever passed in Step 10a
BIOTIME_TERMINAL_SN=                         # device serial from Step 9

POLL_SECONDS=60
LOOKBACK_MINUTES=15
```

And add to `hris/.env.local`:

```ini
BIOMETRIC_INGEST_TOKEN=          # same value as above
BIOMETRIC_TZ=Asia/Dhaka
BIOMETRIC_DEVICE_SERIAL=         # same serial as above
```

**Note:** `BIOTIME_BASE_URL` uses the office PC's **LAN IP**, which means the
agent must run on the office LAN (i.e., on the office PC itself, not remotely
from your laptop). The agent on the PC dials out to your HRIS over HTTPS; your
HRIS never needs to reach in. This is the correct architecture.

**Proof:** paste the working curl command (minus credentials) into the audit
form. That command is the agent's specification.

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
