# Biometric Fingerprint Integration Steps — ZKTeco M2-LR → Trace HRIS

**Audience:** whoever is standing in front of the device in the Trace office, laptop
open, with admin access to the HRIS.

**Scope:** this is the *physical* runbook. It assumes the application-side
integration layer exists and tells you what to type into the device, what to click
in the HRIS, and how to prove the loop works.

---

## 0. Status legend

Every step is tagged so you know whether it is code or hands-on-device work:

| Tag | Meaning |
|---|---|
| **APP** | Already in the codebase. You only click/configure. |
| **DEVICE** | Requires physical access to the M2-LR. |
| **NETWORK** | Requires the office router/firewall (may need an IT admin). |
| **DEFER** | Do not do this until the earlier tests pass. |

> **Current app-side status.** The integration layer in §3 is implemented as part of
> the "off-site work location + biometric + Excel reports" work. **No step from §6
> onward has been executed against a physical M2-LR yet.** Until §11 Test C passes
> with a real finger on the real device, the correct statement is *"HRIS is
> integration-ready"* — not *"the M2-LR is integrated."*

---

## 1. The one idea that matters

The M2-LR is the **source of truth for presence**. The HRIS never does fingerprint
matching, never stores a fingerprint template, and never asks the device for
anything it can compute itself.

```
finger on the M2-LR
      │
      │  the DEVICE dials OUT to the HRIS  (ADMS / PUSH)
      ▼
POST /api/biometric/iclock/cdata?SN=…&table=ATTLOG
      │
      ├─ log the raw body to biometric_sync_logs      (always, even on failure)
      ├─ parse tab-separated punch lines               (adms.ts)
      ├─ resolve deviceUserId → employeeId             (biometric_device_users)
      ├─ dedupeKey collision?  → mark DUPLICATE, stop
      └─ apply to attendance_records                   (same service as the web button)
              │
              └─ first punch of the day → work location defaults to OFFICE
```

**The device dials out. The app never dials in.** This is the single most common
misunderstanding, and it drives everything below: the HRIS needs a *publicly
reachable HTTPS URL*, and the device needs that URL typed into its Cloud Server
Setting. There is no polling, no SDK, no port to open **into** the office.

---

## 2. Device facts (from the supplied configuration)

| Property | Value |
|---|---|
| Model | M2-LR |
| Display | 2.8-inch |
| User capacity | 3,000 |
| Authentication | Fingerprint · Card · Password |
| Interfaces | USB Type-A, TCP/IP, Wi-Fi, electric lock, door sensor, exit button |
| Warranty | 1 year |
| Fingerprint algorithm | ZKFinger V13.0 (V10.0 compatibility noted in the manual) |
| Attendance log capacity | up to 150,000 records |
| Server integration | ADMS / Cloud Server Setting; PUSH protocol; ZKBio Time supported |

**Do not assume a legacy ZKTeco SDK (`node-zklib`, `zkemkeeper`) is the right path
for this firmware.** Those talk the old TCP pull protocol on port 4370. This device
family ships PUSH firmware, which is the opposite direction and much easier to host.
§4 tells you how to find out which one you actually have.

---

## 3. What the HRIS already provides — **APP**

### 3.1 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/biometric/iclock/cdata` | registered serial number | Device handshake. Returns the device's operating parameters. |
| `POST` | `/api/biometric/iclock/cdata` | registered serial number | Punch upload (`table=ATTLOG`) and operation logs. |
| `GET` | `/api/biometric/iclock/getrequest` | registered serial number | Device polls for pending commands. Returns `OK` when idle. |
| `POST` | `/api/biometric/iclock/devicecmd` | registered serial number | Device reports command results. |
| `POST` | `/api/biometric/events` | `Authorization: Bearer $BIOMETRIC_DEVICE_SECRET` | **Fallback/bridge path** — normalized JSON from a LAN agent or from existing middleware. |
| `POST` | `/api/biometric/mock` | Clerk session + `biometric.simulate` permission | Development punch. Same pipeline, `source = MOCK`. |
| `GET` | `/api/biometric/devices` | Clerk session + `biometric.view` | Device list + health. |
| `POST` | `/api/biometric/devices` | Clerk session + `biometric.manage` | Register a device. |
| `GET`/`POST`/`DELETE` | `/api/biometric/devices/[id]/users` | Clerk session + `biometric.manage` | `deviceUserId → employeeId` mapping. |

The four `/iclock/*` routes are the only routes in the app outside Clerk's session
gate (they are listed in `hris/src/proxy.ts`), because a wall-mounted terminal has
no browser session. They are guarded instead by: `BIOMETRIC_INGEST_ENABLED`, a
serial number that must already exist and be active in `biometric_devices`, an
optional source-IP allowlist, and a per-serial rate limit.

### 3.2 Screens

| Screen | Who | What |
|---|---|---|
| `/admin/biometric` | HR · Admin · Super Admin | Device health cards, last-seen, pending-event count, event log, mapping table. |
| `/admin/biometric` → **Simulate punch** | Super Admin | Fire a mock CHECK_IN / CHECK_OUT for any employee. |
| `/reports` → **Biometric event log** | HR · Admin · Super Admin | Excel export of raw device events with status. |

### 3.3 Tables

| Table | Holds |
|---|---|
| `biometric_devices` | One row per terminal: serial, model, firmware, IP, protocol, status, `lastSeenAt`. |
| `biometric_device_users` | The `deviceUserId ↔ employeeId` map. Unique per `(device, deviceUserId)` **and** per `(device, employee)`. |
| `biometric_events` | Every punch received, with `dedupeKey` (unique), `rawPayload`, and a status of `PENDING`/`APPLIED`/`DUPLICATE`/`UNMAPPED`/`REJECTED`. |
| `biometric_sync_logs` | Every HTTP conversation with the device, inbound and outbound, including rejected ones. **This is your debugging surface.** |

`attendance_records.biometricDeviceId` is a real foreign key to `biometric_devices`,
and `attendance_records.source` is one of `MANUAL` / `BIOMETRIC` / `MOCK`.

### 3.4 Environment variables

Set these in `hris/.env.local` for dev and in **Vercel → Project Settings →
Environment Variables** for production:

```
BIOMETRIC_INGEST_ENABLED=false        # flip to true only when you are ready to receive
BIOMETRIC_DEVICE_SECRET=              # long random string; only for /api/biometric/events
BIOMETRIC_ALLOWED_IPS=                # optional CSV; office public IP(s). Empty = no IP check
BIOMETRIC_MOCK_ENABLED=true           # set false in production once the device is live
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`BIOMETRIC_INGEST_ENABLED=false` makes every `/iclock/*` route answer `503` while
still writing a `biometric_sync_logs` row. That is deliberate: you can point the
device at production and watch the log fill up **before** anything touches
attendance.

---

## 4. Before you touch the device — **DEVICE**

Fill this in. Photograph every screen before changing a single value.

```
Model                     : M2-LR
Serial number             : ____________________
Firmware version          : ____________________
Push/comm protocol shown  : ____________________   (PUSH? BEST? SDK?)
Ethernet or Wi-Fi         : ____________________
IP address                : ____________________
Subnet mask               : ____________________
Gateway                   : ____________________
DNS                       : ____________________
MAC address               : ____________________
Wi-Fi SSID (if used)      : ____________________
Existing ADMS server addr : ____________________   ← CRITICAL, see §5
Existing ADMS server port : ____________________
Existing ADMS path/prefix : ____________________
Device time / timezone    : ____________________
Enrolled user IDs on box  : ____________________
Controls a door lock?     : ____________________
```

Where to look on the M2-LR:

- Serial / firmware → `MENU → System Info → Device Info`
- Network → `MENU → COMM. → Ethernet` (or `Wireless Network`)
- ADMS → `MENU → COMM. → Cloud Server Setting`
- Protocol → `MENU → COMM. → Cloud Server Setting` (some firmwares show
  `PUSH`/`BEST` here; others under `Comm. Type`)
- Time → `MENU → System → Date Time`

Rules:

- **Never factory-reset the device.** You will lose every enrolled fingerprint and
  will have to re-enroll all 12 people.
- **Do not clear attendance logs.** They are your rollback.
- If the protocol field says something other than PUSH, stop and read §12 Option D.

---

## 5. Find out who currently owns the device — **DEVICE**

> Is the M2-LR already pushing to another server?

Look at the **existing ADMS server address** you just recorded.

| What you see | What it means | Go to |
|---|---|---|
| Blank / `0.0.0.0` / disabled | Device is unclaimed. Best case. | §6 |
| An office LAN IP (`192.168.x.x`) | A local attendance server owns it. | §12 Option A/B |
| A public host / `*.zkbiotime*` / `*.zkteco*` | ZKBio Time or ZKBio Cloud owns it. | §12 Option A |
| Anything you don't recognise | **Find the owner before changing it.** | §12 |

If someone in the office relies on the current attendance software for payroll, do
**not** repoint the device. Use the bridge path (§12 Option B) instead — the HRIS
supports it through `POST /api/biometric/events`, and it does not disturb the
existing system at all.

The M2-LR can only push to **one** ADMS server. There is no fan-out.

---

## 6. Network — **NETWORK**

The device needs outbound HTTPS to the internet (or to your LAN host in dev). It
does **not** need any inbound port.

1. Prefer **Ethernet** over Wi-Fi for a wall terminal. Fewer surprises.
2. Give the device a **DHCP reservation** or a documented static IP, so a router
   reboot doesn't change it. You will need the IP again for troubleshooting.
3. Confirm DNS resolves — the ADMS address will be a hostname, not an IP.
4. Confirm outbound `443` is allowed from the device's VLAN.
5. `MENU → COMM. → Network Diagnosis` (if present) to ping the gateway.

Never expose the M2-LR itself to the public internet. Nothing about this
integration requires it.

### Testing against localhost first

The device cannot reach `localhost:3000`. To test locally, tunnel:

```bash
npx untun@latest tunnel http://localhost:3000
```

Use the printed HTTPS hostname as the device's server address. Delete the tunnel
when you are done — anything reachable during that window can post punches.

---

## 7. Register the device in the HRIS — **APP**

Do this **before** touching the Cloud Server Setting, so the first handshake is
recognised instead of rejected.

1. Sign in as Super Admin → `/admin/biometric`.
2. **Register device**:
   - Name: `Office entrance — M2-LR`
   - Model: `M2-LR`
   - Serial number: **exactly** what you recorded in §4, case-sensitive, no spaces
   - Firmware version: as recorded
   - IP address: as recorded (informational only)
   - Protocol: `ADMS_PUSH`
   - Timezone: `Asia/Dhaka`
3. Save. The device appears with status **UNCONFIGURED** and no `lastSeenAt`.

If the serial number is wrong, every push is rejected with `UNKNOWN_DEVICE` and
logged in `biometric_sync_logs`. That log line is how you will notice.

---

## 8. Map employees to device user IDs — **APP**

**Never map by name.** Names collide, change, and are typed differently on the
device than in Clerk.

1. `/admin/biometric` → **Device users**.
2. For each person: pick the employee, type the numeric **device user ID** the
   M2-LR shows for them (`MENU → User Mgt. → All Users` → the `ID` field).
3. Save. The mapping is audited (`biometric.mapping_changed`).

A punch from an unmapped `deviceUserId` is **not** discarded — it is stored with
status `UNMAPPED` and shown on `/admin/biometric` with a one-click "map to
employee" action, which then replays it. So mapping order does not matter much;
you just get a queue to clear.

Suggested convention for a 12-person office — reuse the HRIS `employeeIdCode`
digits so the two systems read the same:

```
Device user ID   Employee
10001            Fuad M Khalid Hossen
10002            Abu Saleh Muhammad Saifullah
10003            Umme Mahbuba Tama
…
```

---

## 9. Prove the pipeline works **without** the device — **APP**

Do this before §10. If the mock path fails, the device path will fail too, and you
will not know which half is broken.

### 9.1 From the UI

`/admin/biometric` → **Simulate punch** → pick a mapped employee → **CHECK_IN**.

Expected:

- A row appears in the event log: `MOCK`, status `APPLIED`.
- `/attendance` for that employee shows a clock-in at the simulated time.
- The employee's dashboard **Current Work Location** card reads **Office**.
- `attendance_records.source = 'MOCK'`.

### 9.2 From the command line (bridge path)

This also validates `BIOMETRIC_DEVICE_SECRET`, which is what a LAN agent would use:

```bash
curl -sS -X POST https://trace-hris.vercel.app/api/biometric/events -H "Content-Type: application/json" -H "Authorization: Bearer $BIOMETRIC_DEVICE_SECRET" -d '{"serialNumber":"YOUR_SERIAL","events":[{"deviceUserId":"10001","eventTime":"2026-08-25T09:02:00+06:00","punchType":"CHECK_IN","verifyMethod":"FINGERPRINT","sourceEventId":"bridge-test-1"}]}'
```

Expected: `{"received":1,"applied":1,"duplicates":0,"unmapped":0}`.

Send the **exact same command a second time**. Expected:
`{"received":1,"applied":0,"duplicates":1,"unmapped":0}` — and **no** second
clock-in. That is the idempotency guarantee, tested.

---

## 10. Point the device at the HRIS — **DEVICE / DEFER**

Only after §7, §8 and §9 pass.

1. In the HRIS, set `BIOMETRIC_INGEST_ENABLED=true` and redeploy.
2. On the device: `MENU → COMM. → Cloud Server Setting`.
3. Enter:

| Field | Value |
|---|---|
| Enable Domain Name | **On** (you are using a hostname, not an IP) |
| Server Address | `trace-hris.vercel.app` |
| Server Port | `443` |
| Enable Proxy Server | **Off** (unless office IT requires one) |

Notes that will save you an hour:

- Some firmwares want the **bare host** with no scheme and no path. Others accept
  `https://host`. Try bare host first.
- The device appends `/iclock/cdata` itself. If your firmware does **not** let you
  set a path prefix, the app also answers on the bare `/iclock/*` paths — a rewrite
  in `hris/next.config.ts` maps `/iclock/:path*` → `/api/biometric/iclock/:path*`.
  Check that the rewrite is present before blaming the device.
- **Do not copy the example address/port from the ZKTeco manual.** Those are demo
  values.

4. Save. The device usually reboots or reconnects within ~30 seconds.
5. Watch `/admin/biometric`. Expected within a minute:
   - status → **ONLINE**
   - `lastSeenAt` → "a few seconds ago"
   - a `biometric_sync_logs` row: `INBOUND · handshake · /iclock/cdata`

If nothing arrives, go to §13.

---

## 11. Test matrix — **DEVICE / DEFER**

Run in order with **one** authorized test employee. Do not enroll everyone yet.

### Test A — Handshake
- [ ] Device status is **ONLINE** in `/admin/biometric`
- [ ] Serial number matches the registered row
- [ ] `lastSeenAt` updates as you watch (refresh twice, 30 s apart)
- [ ] A handshake row exists in `biometric_sync_logs`

### Test B — First real punch
- [ ] Test employee is enrolled on the device (`MENU → User Mgt. → New User → Fingerprint`)
- [ ] Their device user ID is mapped in `/admin/biometric`
- [ ] Employee places finger; device shows a successful verification
- [ ] Event appears in the HRIS event log within ~60 s, status `APPLIED`
- [ ] `verifyMethod` reads `FINGERPRINT`
- [ ] `eventTime` matches the wall clock in **Dhaka time**, not UTC
- [ ] `/attendance` shows the clock-in at that time
- [ ] Employee dashboard **Current Work Location** = **Office**
- [ ] `attendance_records.source = 'BIOMETRIC'` and `biometricDeviceId` is set

### Test C — Correct employee
- [ ] The attendance row belongs to the right person
- [ ] A second employee punches; their row is separate and correct
- [ ] Nothing was matched by name anywhere

### Test D — Duplicates
- [ ] Same employee punches twice within a minute → attendance clock-in **unchanged**
- [ ] Second event is stored with status `DUPLICATE` (or ignored as a re-punch), not applied
- [ ] `1 physical punch = 1 logical attendance change` holds

### Test E — Clock-out
- [ ] Employee punches at end of day
- [ ] `clockOut` is set; `clockIn` is **byte-for-byte unchanged**
- [ ] Total hours computed correctly

### Test F — Off-site independence (the whole point of Feature 1)
- [ ] After clock-in, employee opens **Change Work Location**, picks a destination, confirms
- [ ] Work location = **Off-site**, with the place name and start time
- [ ] `clockIn` is **unchanged**
- [ ] Employee taps **Return to Office** → location = **Office**, `clockIn` still unchanged
- [ ] `/admin/work-location` shows the full timeline for that employee
- [ ] The employee cannot edit or delete any past location event

### Test G — Offline / retry
- [ ] Unplug the device's network cable (or disable Wi-Fi)
- [ ] Employee punches; device stores it locally
- [ ] Restore the network
- [ ] The stored punch arrives at the HRIS **once**, with its **original** timestamp
- [ ] Device status returns to **ONLINE**

### Test H — Rejection paths
- [ ] Punch from an unmapped device user ID → status `UNMAPPED`, visible in the admin queue, no attendance change
- [ ] `curl` the `/iclock/cdata` endpoint with a bogus `SN=` → rejected, logged as `UNKNOWN_DEVICE`
- [ ] `curl` `/api/biometric/events` with a wrong bearer token → `401`, logged, no event stored

### Test I — Reports
- [ ] `/reports` → **Monthly attendance** → Export Excel contains the biometric punches
- [ ] The **Off-site work** report shows the Test F timeline with lat/long, purpose, and duration
- [ ] Headers are frozen, filters are on, times render as times not as raw numbers

---

## 12. Time synchronisation — **DEVICE**

Attendance accuracy is device-clock accuracy. A device that is 20 minutes fast
makes everyone look punctual.

1. `MENU → System → Date Time` → set the timezone to **GMT+6** (Asia/Dhaka).
2. Turn on **DST = off** (Bangladesh has no DST).
3. Enable NTP if the firmware offers it.
4. Verify the device clock against your phone to the minute.

App side, for reference:

- All timestamps are stored in Postgres as UTC (`DateTime`).
- Day bucketing uses **Asia/Dhaka local dates** (`hris/src/lib/time.ts`), so a
  06:30 punch belongs to that morning, not to the previous UTC day.
- The UI renders Dhaka local time.
- Nothing is computed from browser-local time.

If the device pushes a timestamp with no timezone offset, the ingestion layer
interprets it in the device's configured timezone (`biometric_devices.timezone`,
default `Asia/Dhaka`). Getting §12.1 wrong therefore shifts attendance — check it.

---

## 13. If the device already belongs to another system

### Option A — Existing software is ZKBio Time / ZKBio Cloud
Leave the device pointed at ZKBio Time. Use its official API and relay into
`POST /api/biometric/events`. Never read ZKBio Time's database directly.

### Option B — Existing software is another vendor (recommended fallback)
Write a small LAN relay that reads from the existing system's API/export and posts
to `POST /api/biometric/events` with the bearer secret. The HRIS ingestion service,
deduplication, and attendance application are identical — only the transport
differs. This is the path the older `BIOMETRIC_INTEGRATION.md` bridge design
became; nothing about it was thrown away.

### Option C — Existing software can be retired
Get written sign-off from whoever depends on it, export its history, then follow
§10. Keep the export for a full leave cycle.

### Option D — Firmware only speaks the legacy SDK protocol (no PUSH)
Then the device cannot dial out, and you need a LAN agent that pulls over TCP 4370
using `node-zklib` and posts to `POST /api/biometric/events`. Same destination,
same idempotency, same attendance service. Run it on an always-on office machine
as a scheduled task. Only take this route after confirming with §4 that PUSH is
genuinely unavailable.

---

## 14. Enrolling the rest of the team — **DEVICE / DEFER**

Only after §11 passes for two employees.

For each person:

1. Confirm they exist and are **active** in `/admin/employees`.
2. Assign their device user ID from the convention in §8.
3. `MENU → User Mgt. → New User` → set ID → **Fingerprint** → capture (the manual
   recommends 3 presses of the same finger; enroll a second finger as backup).
4. Record the exact device user ID in `/admin/biometric` → **Device users**.
5. Have them punch once. Confirm the event lands on the right employee.
6. Note the enrollment in the audit trail (the mapping save does this automatically).

Never import fingerprint templates into the HRIS database. The app stores
`deviceUserId`, timestamps, and verification method — nothing biometric.

---

## 15. Production cutover checklist — **DEFER**

- [ ] Existing attendance data exported and stored outside the device
- [ ] Every §4 setting photographed and written down
- [ ] Device registered, all 12 employees mapped
- [ ] §11 Tests A–I pass
- [ ] `BIOMETRIC_MOCK_ENABLED=false` in Vercel production
- [ ] `BIOMETRIC_INGEST_ENABLED=true` in Vercel production
- [ ] `BIOMETRIC_ALLOWED_IPS` set to the office public IP, if it is static
- [ ] HR briefed: what "Off-site" means on the dashboard, and that it does **not**
      affect clock-in
- [ ] Employees briefed: punch in at the door; use **Change Work Location** when
      leaving for official work; **Return to Office** on the way back
- [ ] One full working day observed before trusting the numbers
- [ ] Rollback rehearsed (§17)

---

## 16. Troubleshooting

Start here every time:

```sql
SELECT "createdAt", direction, status, endpoint, "httpStatus", message
FROM biometric_sync_logs
ORDER BY "createdAt" DESC
LIMIT 50;
```

If that table is **empty**, the device never reached the app — it is a network or
address problem (§16.2). If it has rows, the device reached you and the problem is
in parsing, mapping, or config (§16.1). That single check splits the problem space
in half.

### 16.1 Rows exist, but no attendance

| `status` in the log / event | Cause | Fix |
|---|---|---|
| `UNKNOWN_DEVICE` | Serial mismatch | Re-read the serial in §4; it is case-sensitive |
| `INGEST_DISABLED` | Kill switch on | `BIOMETRIC_INGEST_ENABLED=true`, redeploy |
| `IP_NOT_ALLOWED` | Office IP changed | Update or clear `BIOMETRIC_ALLOWED_IPS` |
| `UNMAPPED` | `deviceUserId` not mapped | Map it in `/admin/biometric`; the event replays |
| `DUPLICATE` | Retry delivery | Correct behaviour. Nothing to fix. |
| `PARSE_ERROR` | Unexpected wire format | Read `rawPayload` on the log row and adjust `hris/src/lib/biometric/adms.ts`. The raw body is stored precisely so this is a 10-minute fix, not a guess. |
| `REJECTED` + employee inactive | Deactivated user punched | Reactivate, or leave rejected — both are audited |

### 16.2 No rows at all

Check, in this order:

1. Device has a valid IP (`MENU → COMM. → Ethernet`)
2. Gateway and DNS are set (a blank DNS with a hostname address = silent failure)
3. **Enable Domain Name** is On and the address has no scheme/trailing slash
4. Port is `443` for HTTPS (not `80`, not `8080`)
5. Outbound 443 is permitted on the device's VLAN
6. The Cloud Server Setting was actually **saved** (re-open the menu and read it back)
7. Another attendance server is not still configured as the destination
8. `curl -sS "https://trace-hris.vercel.app/api/biometric/iclock/cdata?SN=YOUR_SERIAL&options=all"`
   from your laptop — if that returns a config body, the app is fine and the
   problem is entirely device-side/network

### 16.3 Attendance is on the wrong day

Almost always the device timezone (§12) or a punch before 06:00 Dhaka. Check
`biometric_devices.timezone` and the device's own clock.

### 16.4 Attendance belongs to the wrong employee

Check `biometric_device_users` for a stale mapping — most often a device user ID
that was reassigned on the device when someone left. Deactivate the old mapping
rather than editing it, so the audit trail survives.

### 16.5 Duplicate attendance rows

Should be impossible: `biometric_events.dedupeKey` is `UNIQUE` and
`attendance_records` is `UNIQUE (employeeId, date)`. If you see it anyway, capture
both rows and the two `biometric_sync_logs` entries before deleting anything.

---

## 17. Rollback

Rolling back is deliberately boring — no migration is reversed, nothing is deleted.

**Level 1 — stop ingesting (seconds).**
Set `BIOMETRIC_INGEST_ENABLED=false` and redeploy. Every `/iclock/*` call now
returns `503` and is logged. The device keeps its punches locally and will resend
them when you re-enable. Manual clock-in/out keeps working normally — it is a
different code path.

**Level 2 — take the device back (minutes).**
`MENU → COMM. → Cloud Server Setting` → restore the address/port from your §4
photographs. The previous attendance system resumes ownership.

**Level 3 — correct the data (hours).**
Attendance rows created by the device are marked `source = 'BIOMETRIC'` with a
`biometricDeviceId`, so they are trivially separable from human entries:

```sql
SELECT * FROM attendance_records
WHERE source = 'BIOMETRIC' AND date >= '2026-09-01';
```

HR corrects them through the normal attendance edit path, which writes audit rows.
Never `DELETE` from `biometric_events` — it is the evidence of what the device
actually said.

The work-location feature is independent of all of this. Turning off biometrics
does not affect it; it only loses the automatic `OFFICE_CLOCK_IN` event that a
manual clock-in also produces.

---

## 18. Official documentation

Consult these for the **exact firmware on your unit** — it wins over anything
found online, including this file:

- M2-LR / M2F PRO-LR User Manual
- M2-LR / M2F PRO-LR Installation Guide
- ZKBio Time documentation and API reference
- ZKTeco PUSH SDK / ADMS protocol documentation
- ZKTeco standalone SDK docs — only if §13 Option D applies

The `/iclock/*` request/response shapes implemented in the app follow the widely
documented PUSH protocol. **They are not guaranteed to match your firmware
byte-for-byte.** This is exactly why every request body is written to
`biometric_sync_logs.rawPayload` before parsing: the first real handshake documents
the true wire format for you, and the parser is one file
(`hris/src/lib/biometric/adms.ts`) to adjust.

---

## 19. Definition of done

The integration is complete when **all** of these are true:

- [ ] An employee places a finger on the M2-LR and the device verifies them
- [ ] The event reaches the HRIS and is stored **exactly once**
- [ ] It maps to the correct employee via `deviceUserId`, never by name
- [ ] Attendance clock-in is created at the device's timestamp, in Dhaka time
- [ ] Work location defaults to **Office** on that first punch
- [ ] Changing work location leaves clock-in and clock-out untouched
- [ ] HR/Admin can see the punch, the device health, and the location timeline
- [ ] A retried delivery produces no duplicate
- [ ] A network interruption is recovered without duplication
- [ ] Unmapped and rejected events are visible and recoverable, not silently dropped
- [ ] No fingerprint template or image exists anywhere in the HRIS database
- [ ] §17 rollback has been rehearsed at Level 1 and Level 2

Until every box is ticked, the honest status is **"integration-ready, not
integrated."**

---

*Companion documents: [`BIOMETRIC_INTEGRATION.md`](./BIOMETRIC_INTEGRATION.md) for
the architecture and why ADMS/PUSH was chosen over the SDK;
[`hris/ARCHITECTURE.md`](./hris/ARCHITECTURE.md) §3 for how ingestion joins the
existing attendance data flow.*
