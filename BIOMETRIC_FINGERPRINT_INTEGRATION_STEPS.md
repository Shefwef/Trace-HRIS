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

Nothing from Step 3 onward has been executed. Steps 1, 2 and 4 to 8 are ordinary
application work and are verifiable on a laptop; Step 3 and Steps 9 to 14 have
never been run against the real PC or the real device. Until Step 13 passes, the
correct description of this feature is **integration-ready**, not "integrated".
Do not tell the office it works before Step 13.

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

## Step 9 — Audit form **PC** / **DEVICE**

Fill this in completely before writing any agent code. Guessing here is what
turns a one-hour job into a week.

```
--- Vendor software ---
Name and version (its About / Help page):  ______________________
   expected: ZKBioTime 8.x, or BioTime 8.0 / 8.5
Exact URL the PM opens on their phone:     ______________________
   -> host: ____________  port: ______   (ZKBioTime often 8081)
PC LAN IP (ipconfig):                      ______________________
PC LAN IP is DHCP or static?               ______________________
Login for an integration account:          created? Y / N   read-only? Y / N
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

The "exact URL the PM opens on their phone" line does most of the work — it
gives you the port, and the product identification, in one field.

## Step 10 — Probe the API **PC**

From the office PC, in a terminal. Substitute your values.

```bash
curl -sS -u "USER:PASS" "http://192.168.1.50:8081/personnel/api/employees/?page_size=5"
```

**If you get JSON** shaped `{"count":…,"msg":…,"code":0,"data":[…]}` — note it
is `data`, not `results` — Path A works. Record every `emp_code` you see; that
is your mapping input for Step 6.

Then the punches:

```bash
curl -sS -u "USER:PASS" "http://192.168.1.50:8081/iclock/api/transactions/?page_size=5&ordering=-punch_time"
```

Confirm on a real row: `punch_time` is offset-less wall clock, `punch_state` is
`"0"` or `"1"`, `verify_type` is `1` for a fingerprint, and `terminal_sn`
matches the serial from Step 9.

And device health:

```bash
curl -sS -u "USER:PASS" "http://192.168.1.50:8081/iclock/api/terminals/"
```

`state: "1"` means online. Note that it is `/terminals/`, not `/devices/` —
the latter 404s.

**If you get 403 with an `IsNotOpenAPI` marker**, the license gates the API.
Try JWT before giving up:

```bash
curl -sS -X POST "http://192.168.1.50:8081/jwt-api-token-auth/" -H "Content-Type: application/json" -d '{"username":"USER","password":"PASS"}'
```

Then reuse the returned token as `-H "Authorization: JWT <token>"`. Basic auth is
reported to pass the gate where JWT does not, so try both orders. First requests
can take 30 to 45 seconds cold; that is the Django app waking up, not a failure.

**If both fail**, stop and go to Step 11. Do not attempt to work around the
license, and do not change anything in the software's settings to try to enable
it.

**Proof:** paste the working curl command into the audit form. That command,
minus the credentials, is the agent's specification.

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
