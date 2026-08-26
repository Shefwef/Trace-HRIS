# Biometric Clock-In / Clock-Out — The Decided Plan

**Status:** design settled, not yet built. No code in `hris/` reads from the
device or from the vendor software yet.
**Scope:** fingerprint **clock-in and clock-out only**. Breaks stay as buttons in
the web UI.
**Device:** ZKTeco M2-LR, already installed at the Trace office and already
enrolled with every employee's fingerprint.
**Hard constraint:** the vendor's professionals installed and configured that
device and its desktop software. Nothing in this plan changes a single device
setting or a single vendor-software setting.

This document supersedes the earlier version of this file, which was written
before the device was bought and asked you to choose between a wall-mounted
terminal, WebAuthn on laptops, and a phone app. That choice was made in the real
world: the terminal is on the wall and people are already punching into it. What
is left is to get a copy of those punches into the HRIS.

For the ordered, do-this-then-that runbook, see
[BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md](BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md).

---

## 1. What is actually running in the office

Assembled from what the IT product manager described plus published
documentation of the ZKTeco stack. Every line marked **(assumed)** needs one
look at the office PC to confirm — see §9.

| Layer | What it is |
|---|---|
| Terminal | ZKTeco M2-LR on the wall. Holds the fingerprint templates and a local punch log. |
| Transport | Plain HTTP over the office LAN. The **device is the client** — it dials out to the PC. |
| Server | ZKTeco desktop software on a Windows PC, **(assumed)** ZKBioTime 8.x, formerly branded BioTime 8.0. |
| Store | The software's own database, **(assumed)** the PostgreSQL instance its installer bundles. Raw punches land in a table called `iclock_transaction`. |
| Remote access | The same software's web UI, reached from the PM's phone through the office router. |

The "phone app" the PM mentioned is the strongest clue for the product
identification: ZKBioTime is a Django web application, so its admin panel is
just a browser URL, which is exactly why it works from home once the router
forwards a port to the PC.

### How one punch travels today

```
  [ M2-LR on the wall ]
        |  employee taps finger
        |  device wakes up and dials OUT to the address stored in its own menu
        v
  POST http://<PC-LAN-IP>:<port>/iclock/cdata?SN=<serial>&table=ATTLOG
        |  body is tab-separated wall-clock text, no timezone offset
        v
  [ ZKBioTime on the office PC ]  --writes-->  iclock_transaction
        |
        v
  [ web UI ]  <-- PM's phone, from home, via the router
```

The device stores the PC's address. That single fact explains the whole
complaint the PM raised, and it is worth being precise about it, because two
different IPs are being conflated.

---

## 2. Their two IP problems are separate, and neither is ours

**Problem 1 — the PC's LAN IP changes, and the device stops working.**
The router hands the PC its LAN address by DHCP. When that lease is
reassigned the PC's address changes, the address burned into the M2-LR's menu
now points at nothing, and punches stop being delivered until someone retypes
the new address into the device.

*Fix:* a DHCP reservation for the PC's MAC address on the office router, or a
static IP configured on the PC itself. This is a few minutes of work in the
router admin page and it removes the recurring failure permanently. It has
nothing to do with the HRIS and is worth doing regardless of this project.

**Problem 2 — the router's WAN IP changes, and the phone can no longer reach
the admin panel.** The ISP allocates the office a dynamic public address. When
it rotates, whatever address the phone had saved is dead.

*Fix:* dynamic DNS. Most routers have a built-in DDNS client for No-IP or
DynDNS; DuckDNS is free. The phone then uses a stable hostname instead of a
number.

**Why neither touches the HRIS.** In the design below, the office side always
dials *out* to the HRIS. The HRIS never dials in. No port forwarding, no static
public IP, no VPN, no firewall rule. Whatever their WAN IP does on any given
day is irrelevant to attendance sync.

---

## 3. The decision: read from the vendor software, never from the device

The M2-LR can push its punches to exactly **one** server address. That slot is
occupied by the vendor's software, and everything the office relies on today —
enrollment, the reports the PM looks at, the phone panel — hangs off it.

So the plan reads a **copy** of the punches out of the vendor software and
forwards them to the HRIS. The vendor software stays the system of record for
the device. The HRIS becomes a second consumer of the same data.

```
  [ M2-LR ]                                     UNCHANGED
      |
      v
  [ ZKBioTime on office PC ]                    UNCHANGED
      |
      |  new: a small agent polls the software's own read API
      v
  [ trace-punch-agent ]  (Node script, office LAN, outbound only)
      |
      |  HTTPS POST, bearer token, batched, idempotent
      v
  [ HRIS /api/biometric/punches ]  ->  attendance_records
```

Three properties make this the right shape:

- **Nothing the vendor set up is modified.** No device menu is touched, no
  ADMS destination is repointed, no vendor setting is changed. If the agent is
  switched off, the office is exactly where it is today.
- **The HRIS is never addressed by IP.** The agent dials out to the
  HRIS's public HTTPS hostname. Their IP churn cannot break it.
- **It is reversible in one step.** Stop the agent. That is the entire rollback.

### Path A (primary) — the ZKBioTime REST API

ZKBioTime 8.x exposes a Django REST Framework API. The endpoints that matter:

| Endpoint | Use |
|---|---|
| `POST /jwt-api-token-auth/` | Get a JWT. Body `{"username","password"}`, returns `{"token"}`, valid 7 days. Header is `Authorization: JWT <token>`. HTTP Basic also works and reportedly passes the license gate described below. |
| `GET /iclock/api/transactions/` | **The punches.** Filters: `emp_code`, `terminal_sn`, `start_time`, `end_time`, `punch_state`, `ordering=-punch_time`. Times are `YYYY-MM-DD HH:MM:SS`. |
| `GET /personnel/api/employees/` | The roster. Gives `emp_code` next to `first_name`/`last_name`, which is how we build the employee mapping instead of typing it by hand. |
| `GET /iclock/api/terminals/` | Device health: `state` (`"1"` = online), `last_activity`, `transaction_count`. Feeds the admin health card. |

Every list endpoint returns `{count, next, previous, msg, code, data:[...]}` —
note the array is `data`, **not** the usual DRF `results`. `code == 0` means
success. Page with `page` and `page_size` (default 10, practical max ~1000).

Fields on one transaction, of which we need five:

```
emp_code           "10001"                  -> maps to an HRIS employee
punch_time         "2026-08-25 09:02:13"    -> LOCAL wall clock, NO offset
punch_state        "0"                      -> 0 In, 1 Out, 2 Break Out,
                                                3 Break In, 4 OT In, 5 OT Out
verify_type        1                        -> 1 fingerprint, 15 face, 3 card...
terminal_sn        "..."                    -> which device
id, upload_time, first_name, last_name, department, position,
punch_state_display, verify_type_display, work_code, gps_location,
area_alias, temperature, is_mask, terminal_alias
```

We consume `punch_state` 0 and 1 and ignore 2–5. Breaks are buttons, by
decision — see §5.

**Known caveat.** Some ZKBioTime licenses gate the API roots behind a flag that
surfaces as a `403` with an `IsNotOpenAPI` marker on `/personnel/` and
`/iclock/`. HTTP Basic auth is reported to pass the gate where JWT does not; the
alternative is the `api` license module. This is a two-minute curl test, not a
research project — it is Step 3 of the runbook, and Path B exists precisely
because it might fail.

### Path B (fallback) — read the software's database directly

If the API is license-locked, the same agent reads `iclock_transaction` over a
**read-only** database user. Columns of interest: `emp_code`, `punch_time`,
`punch_state`, `terminal_sn`, `id`. The companion table `iclock_terminal`
carries `terminal_tz`, the device's configured offset.

Slightly worse than Path A: it depends on an internal schema the vendor can
change on upgrade, and it needs a DB account. Strictly read-only, always —
writing into the vendor's tables is how you corrupt their reports.

### Path C (last resort) — poll the device over the SDK port

The M2-LR speaks a second, unrelated protocol: the standalone SDK on TCP
**4370**. Because it is not the ADMS/PUSH channel, reading it does **not**
consume the single push slot the vendor software holds, so it does not break
anything. Two reasons it stays last: it competes for the device's small pool of
concurrent connections, and it bypasses the vendor software entirely, so the
`emp_code` to employee mapping has to be maintained by hand instead of read from
the roster API. Never issue a clear-log command on this channel.

### Path D — rejected

Repointing the M2-LR's ADMS destination at the HRIS. It would work, and it
would take the push slot away from the vendor software, and the office's
enrollment and reports and phone panel would go dark. This is the thing the
"installed by professionals, keep that in mind" instruction exists to prevent.
Not doing it.

---

## 4. What lands in the HRIS

### The ingest endpoint

`POST /api/biometric/punches` — public route (added to `isPublicRoute` in
`hris/src/proxy.ts`), authenticated by a bearer token that is **not** a Clerk
session, because the caller is a script and not a person.

```jsonc
{
  "deviceSerial": "ABC1234567",
  "punches": [
    { "deviceUserId": "10001", "punchedAt": "2026-08-25 09:02:13",
      "punchState": "0", "verifyType": 1, "sourceId": "884213" }
  ]
}
```

Response counts every outcome, so the agent's log is diagnostic on its own:

```jsonc
{ "received": 1, "applied": 1, "duplicates": 0, "unmapped": 0, "rejected": 0 }
```

### Idempotency is mandatory, not an optimisation

The agent will re-send. It re-sends after a network blip, after a restart, and
on every overlap of its polling window. Punches are therefore deduplicated on
`(deviceSerial, deviceUserId, punchedAt)` with a unique index, and a repeat is
counted as a `duplicate` and returns 200 — not an error. Running the same batch
twice must produce `{"applied":0,"duplicates":n}` and change nothing.

### Timezone: the one that will bite

`punch_time` is **wall-clock text with no offset**. The device sends
`2026-08-25 09:02:13` and means 9:02 in Dhaka. Insert that string into a
`timestamptz` column and Postgres interprets it in the session timezone, which
on Neon is UTC — every punch silently shifts six hours and the whole day's
attendance is wrong in a way that looks plausible.

So: parse in `Asia/Dhaka` (GMT+6, and Bangladesh observes no DST), convert to
UTC once at the boundary, store UTC.

There is a pre-existing bug in the same family that this work has to fix.
`hris/src/app/api/attendance/clock-in/route.ts` derives its day key with
`Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())`. In
UTC+6 any punch before 06:00 local is filed under the previous calendar day.
`hris/src/app/api/attendance/today/route.ts` repeats the pattern and adds
`isWeekend: [0,6].includes(...)` — Sunday and Saturday — which contradicts
`hris/src/lib/leave.ts`, where the Bangladesh weekend is correctly Friday and
Saturday. Both need to move to local-date keys, the way the calendar and heatmap
already did in commits `36c54b5` and `59c7222`.

### Mapping a punch to a person

`emp_code` on the device is a number like `10001`. The HRIS needs a column for
it: `User.biometricUserId String? @unique`. The admin screen offers a
side-by-side mapping table, pre-filled by matching names from
`GET /personnel/api/employees/`, and an unmapped punch is stored and counted
rather than dropped, so nobody's attendance disappears because HR has not
finished the mapping yet.

### Turning punches into attendance

Per employee per local day, over that day's punches sorted by time:

- earliest `punch_state=0` becomes `clockInTime`
- latest `punch_state=1` becomes `clockOutTime`
- `source = BIOMETRIC`, `biometricDeviceId = <serial>`
- worked minutes computed as they are today, break minutes still from
  `BreakSession` rows created by the UI buttons

A device punch never overwrites a value a human already corrected. Manual
correction wins, is audited, and the raw punch is retained either way.

### Schema additions

```prisma
enum AttendanceSource { MANUAL  BIOMETRIC  MOCK }   // MOCK is new — dev/QA

model BiometricDevice {
  id            String   @id @default(cuid())
  serial        String   @unique
  alias         String
  isActive      Boolean  @default(true)
  lastSeenAt    DateTime?
  createdAt     DateTime @default(now())
  punches       BiometricPunch[]
  @@map("biometric_devices")
}

model BiometricPunch {
  id            String   @id @default(cuid())
  deviceId      String
  deviceUserId  String
  punchedAt     DateTime            // UTC, converted at ingest
  punchState    String              // "0" | "1"
  verifyType    Int?
  employeeId    String?             // null while unmapped
  appliedAt     DateTime?
  rawPayload    Json
  createdAt     DateTime @default(now())
  device        BiometricDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  @@unique([deviceId, deviceUserId, punchedAt])
  @@index([employeeId, punchedAt])
  @@map("biometric_punches")
}

model BiometricSyncLog {
  id         String   @id @default(cuid())
  deviceId   String?
  startedAt  DateTime @default(now())
  received   Int      @default(0)
  applied    Int      @default(0)
  duplicates Int      @default(0)
  unmapped   Int      @default(0)
  error      String?
  @@map("biometric_sync_logs")
}
```

`rawPayload` is kept deliberately. The first time a field means something other
than what this document says it means, that column is the only way to find out
without waiting for another punch.

### Permissions

Three new keys on the runtime matrix in `hris/src/lib/permissions.ts`, which
currently holds 24: `biometric.view`, `biometric.manage`, `biometric.simulate`.
Defaults: Super Admin all three; Admin and HR view and manage; Line Manager and
Employee none.

---

## 5. Breaks stay as buttons

Decided. The device yields clock-in and clock-out; breaks are the existing
**Take a break** / **End break** buttons in the web UI, writing `BreakSession`
rows exactly as they do now.

The reasoning is not merely preference. Every break would otherwise be four
walks to the wall panel instead of two clicks, and `punch_state` 2 and 3 are
easy for a hurried employee to select wrongly, which produces negative break
durations that someone then has to reconcile by hand. The wire format carries
2 and 3, so this is reversible later without any schema change — the ingest
already stores `punchState` as text and simply ignores those values.

---

## 6. The env-var end state

The goal you set: get the system to a point where connecting the device is
filling in a form. This is that form. Every value is obtainable from the office
PC in one sitting; none of it requires the vendor.

`hris/.env.local` (the HRIS side):

```ini
# Shared secret the office agent presents on every POST. Generate with
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BIOMETRIC_INGEST_TOKEN=

# Wall-clock timezone the device reports in. Bangladesh has no DST.
BIOMETRIC_TZ=Asia/Dhaka

# Serial of the M2-LR, from MENU -> System Info -> Device Info.
BIOMETRIC_DEVICE_SERIAL=
```

`agent/.env` (on the office PC, never in the repo):

```ini
# Where the HRIS lives. Public HTTPS. No IP, no port forwarding.
HRIS_BASE_URL=https://<the-vercel-or-custom-domain>
BIOMETRIC_INGEST_TOKEN=            # same value as above

# The vendor software. Take the host and port from the URL the PM opens on
# their phone; ZKBioTime installs commonly land on 8081.
BIOTIME_BASE_URL=http://192.168.1.50:8081
BIOTIME_USERNAME=
BIOTIME_PASSWORD=
BIOTIME_AUTH=basic                 # basic | jwt  — see the license gate, §3
BIOTIME_TERMINAL_SN=               # same serial; scopes the query to one device

POLL_SECONDS=60
LOOKBACK_MINUTES=15                # overlap window; dedupe makes it free
```

Path B swaps the four `BIOTIME_*` connection values for
`BIOTIME_DB_URL=postgresql://readonly_user:...@127.0.0.1:5432/biotime`.

The one thing that is not an env var is the `emp_code` to employee mapping,
because it is data and not configuration. It is a screen, pre-filled from the
roster API, and it is a ten-minute job for HR once.

---

## 7. What gets built, in order

| # | Deliverable | Depends on a physical device? |
|---|---|---|
| 1 | Prisma models, migration, `MOCK` on `AttendanceSource`, `User.biometricUserId` | no |
| 2 | `ingestPunches()` — the one pipeline every transport feeds | no |
| 3 | `POST /api/biometric/punches` + bearer auth + `isPublicRoute` entry | no |
| 4 | Fix the UTC day-key bugs in `clock-in` and `today` | no |
| 5 | Admin screen: device health, mapping table, recent punches, sync log | no |
| 6 | `MOCK` source + a simulate button behind `biometric.simulate` | no |
| 7 | `agent/` — the office-side poller, Path A | needs the PC, not the device |
| 8 | Path B database reader, only if Step 3 of the runbook fails | needs the PC |
| 9 | Live verification against real punches | **yes** |

Items 1 to 6 are ordinary application work and can be finished, reviewed and
merged before anyone goes near the office. Item 9 is the only one that can
honestly be called "integrated", and until it passes, this feature is
integration-ready and nothing stronger.

---

## 8. Security

- The ingest token is a secret. It goes in `.env.local` and `agent/.env`, both
  covered by `hris/.gitignore` (`.env`, `.env.*`, `.env*.local`, with
  `!.env.example`). It never appears in a commit, a log line or a client bundle.
- The ingest route is public in the routing sense and authenticated in every
  other sense: bearer token, device serial must match a registered active
  device, and the same Postgres fixed-window rate limiter that guards the rest
  of the API.
- **No fingerprint template, image or biometric feature vector is ever sent to
  or stored in the HRIS.** Templates stay on the M2-LR, where the vendor put
  them. The HRIS receives an integer and a timestamp. This is the property that
  keeps the whole feature out of biometric-data territory.
- The agent needs one read-only credential. If ZKBioTime supports a
  reports-only role, use it rather than `admin`.
- `next.config.ts` already sends `Permissions-Policy: geolocation=()`, which
  matches the standing rule that this system does not do location tracking.
- Never factory-reset the M2-LR. Never clear its attendance log. Both are
  irreversible and both destroy data the office depends on.

---

## 9. Six questions for the office

Everything above marked **(assumed)** collapses once these are answered. None
needs the vendor, and none needs a YouTube tutorial — the API is documented.

1. **The exact URL the PM opens on their phone.** Hostname and port. This alone
   confirms the product and version.
2. **Software name and version**, from its About or Help page. Expected:
   ZKBioTime 8.x or BioTime 8.0/8.5.
3. **Can a dedicated account be created for the integration?** Read-only if the
   product allows it.
4. **The M2-LR serial number**, from `MENU -> System Info -> Device Info`.
5. **Can the PC make outbound HTTPS calls?** Almost certainly yes, since it is
   already on the router. Nothing needs to come *in*.
6. **Which database does the software use, and on which port?** Only needed if
   Path A is license-gated.

Worth mentioning to the PM regardless of this project: the DHCP reservation in
§2 fixes the recurring "the device stopped working" outage on its own.

---

## 10. Sources

The protocol and API details here were read from source and from a live-probed
API reference, not inferred:

- `saifulcoder/adms-server-ZKTeco` — `routes/web.php` and
  `app/Http/Controllers/iclockController.php`. The ADMS/PUSH endpoint set and
  the tab-separated ATTLOG wire format.
- `fadyelgawly/claude-skill-biotime` — `reference/API_REFERENCE.md`. ZKBioTime
  8.0 endpoints, the `{count,next,previous,msg,code,data}` envelope, transaction
  fields, `punch_state` and `verify_type` value tables.
- `Supavasinan/zkbiotime-sdk` — the typed client. Confirms the endpoint paths
  and that HTTP Basic passes the `IsNotOpenAPI` license gate.
- `rabp99/biotime-reg` — a project that reimplemented BioTime 8.5's ingest.
  Source for the two invariants that cause silent corruption: the device
  re-sends unless it receives plain-text `OK`, and `punch_time` arrives as
  offset-less wall clock and must be converted using the terminal's timezone.
- `adrobinoga/zk-protocol` — `sections/realtime.md`. The separate TCP 4370 SDK
  protocol behind Path C.

---

*Design settled 25 August 2026. Nothing in this document has been executed
against the physical M2-LR.*
