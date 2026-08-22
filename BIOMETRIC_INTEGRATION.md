# Fingerprint Biometric Integration — Planning Guide

> **For:** the technical owner planning to add a fingerprint scanner to the
> Trace HRIS attendance flow.
> **Status:** the backend already accepts biometric events. Only the
> device-side bridge needs to be built.

---

## What already works today

The attendance API was designed with biometrics in mind. Two endpoints matter:

```
POST /api/attendance/clock-in
POST /api/attendance/clock-out
```

Both accept an **optional JSON body**:

```json
{
  "source": "BIOMETRIC",
  "biometricDeviceId": "office-entrance-01",
  "timestamp": "2026-08-22T09:14:33.000Z"
}
```

- `source` — one of `"MANUAL"` (default) or `"BIOMETRIC"`. Stored on the
  record and shown in the audit log.
- `biometricDeviceId` — a free-form string identifying which device
  produced the event. Handy for debugging in a multi-device office.
- `timestamp` — ISO-8601 UTC. If omitted, the server uses `now`. Include
  this if the device buffers events during a network outage and sends
  them later.

Break-start and break-end have the same shape.

**Auth:** every request goes through `requireAuth()`, which reads the Clerk
session cookie. That's a problem for a headless device — see the auth
options below.

---

## The three architectures — pick one

### Option 1 — Standalone time-clock device on a wall

**How it works:** a purpose-built biometric time clock (ZKTeco K40, K50, F18,
or similar) mounts near the office entrance. Employees enroll their finger
once. When they arrive, they touch the sensor, hear a beep, and the device
POSTs to a small **bridge service** which forwards the event to Trace HRIS.

**Pros:**
- No laptops involved — works even if an employee's laptop is off
- Ideal for shift workers or field staff who don't sit at a computer all day
- Physical device is a visible cue that attendance is tracked
- Vendor SDKs (ZKTeco) provide fingerprint templates + user management

**Cons:**
- Hardware cost: ~$150–$300 per device
- Needs LAN/Wi-Fi at the mount location
- Fingerprint template ↔ HRIS user mapping is a one-time enrollment chore

**Recommended for:** offices with a fixed entrance and 10+ employees.

---

### Option 2 — Employee laptops using Windows Hello / Touch ID (WebAuthn)

**How it works:** on the attendance page, replace the "Clock In" button with
"Verify fingerprint & clock in." Clicking it invokes the browser's WebAuthn
API, which asks the OS to authenticate the current user via their laptop's
built-in fingerprint sensor. On success, the browser fires the POST as usual.

**Pros:**
- **Zero hardware to buy** — most modern laptops have fingerprint sensors
- Uses existing Clerk session for identity — no separate enrollment
- Same UX for remote and in-office workers

**Cons:**
- Employees whose laptops lack a sensor need a fallback (PIN? password?)
- Not "arrived at the office" attendance — it's "on my laptop attendance"
- Doesn't stop someone from clocking in from home
- WebAuthn is really an authentication standard — using it as an attendance
  gate is a slight abuse

**Recommended for:** distributed/remote teams where physical presence
doesn't matter.

---

### Option 3 — Mobile app + phone fingerprint

**How it works:** build a small mobile app (or a mobile-optimized web page)
that lives on the employee's phone. Tap → phone fingerprint prompt → app
POSTs to HRIS. Optionally require geofencing (must be within X meters of
office coordinates to succeed).

**Pros:**
- Employees always have their phone
- Geofencing adds "must be physically here"
- Fingerprint scanner is on every modern phone

**Cons:**
- Someone has to build and maintain the mobile app
- Geofencing has 5–20 m accuracy — not perfect
- Requires employees to install the app + grant permissions

**Recommended for:** field teams who move between sites.

---

## Recommended path for Trace: Option 1 with a ZKTeco device

Given Trace has a fixed office and 6 employees today, **one wall-mounted
device at the entrance** is the simplest and most visible solution. The
rest of this guide assumes Option 1.

### Bill of materials

| Item | Model suggestion | ~Cost (USD) |
|---|---|---|
| Fingerprint time clock | ZKTeco K40 Pro or F18 | $150–250 |
| Ethernet cable | Cat 6, 5–10 m | $5 |
| Optional PoE injector | If no power outlet at mount point | $20 |
| Optional metal enclosure | For tamper resistance | $30 |

**Total:** under $300 for hardware.

### Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  ZKTeco Device   │  ──►    │  Bridge service  │  ──►    │   Trace HRIS     │
│  at entrance     │  push   │  (Node.js on the │  HTTPS  │   /api/attendance│
│                  │  event  │   office LAN)    │  POST   │   /clock-in      │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

The bridge exists because ZKTeco devices push events using their own binary
protocol (or the vendor's HTTP webhook), not the JSON body our API expects.
The bridge translates.

### Build steps (technical checklist)

#### Step 1 — Backend prep (mostly done)

- [x] `source: 'BIOMETRIC'` accepted on clock-in/out — **already done**
- [x] `biometricDeviceId` field on `AttendanceRecord` — **already done**
- [ ] **Service account for the bridge** — new. Create a special Clerk
      user like `bridge@traceconsultingltd.com` with role `SUPER_ADMIN`,
      then generate a long-lived API token. Options:
  - a) Use Clerk's [server-side sessions](https://clerk.com/docs) with
       an actor token pattern to POST on behalf of any employee.
  - b) Add a separate auth path in `requireAuth()` that accepts a signed
       `x-hris-device-token` header and impersonates a specified employee.
       Simpler; ~40 lines of code.
- [ ] **Rate-limit exemption** — the bridge may burst 10+ events in a
      minute during rush hour. Bypass the per-user rate limiter for
      device-source requests. Handled inside the same auth-path change.

#### Step 2 — Enrollment (one-time, per employee)

Each employee needs to be enrolled on the device with a mapping to their
HRIS user ID. Two ways:

- **Vendor software** — ZKTeco ships ZKBio-CV / ZKAccess for user
  management. Enroll fingers, then export a CSV mapping enrollment ID →
  employee ID. Store it on the bridge.
- **Custom enrollment page** — build a small "enroll new fingerprint"
  admin page that walks HR through: pick employee → device puts sensor
  into enroll mode → three finger presses → save mapping.

Keep the mapping table in Postgres:

```sql
CREATE TABLE biometric_enrollment (
  device_id       text NOT NULL,
  enrollment_id   text NOT NULL,
  employee_id     text NOT NULL REFERENCES users(id),
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, enrollment_id)
);
```

#### Step 3 — Bridge service

A small Node.js process running on any always-on machine inside the office
LAN (Raspberry Pi 4 works; or a spare laptop). Reference outline:

```typescript
// bridge/index.ts
import Zkteco from 'node-zklib';
import fetch from 'node-fetch';

const HRIS_URL = 'https://trace-hris.vercel.app';
const BRIDGE_TOKEN = process.env.HRIS_BRIDGE_TOKEN!; // set as HRIS env var
const DEVICE_ID = 'office-entrance-01';

const device = new Zkteco('192.168.1.201', 4370, 10000, 4000);

await device.createSocket();
await device.startLiveCapture((event) => {
  // event: { uid, userId, timestamp, punchType }
  // punchType: 0 = check-in, 1 = check-out, 2 = break-out, 3 = break-in
  const path =
    event.punchType === 0 ? '/api/attendance/clock-in' :
    event.punchType === 1 ? '/api/attendance/clock-out' :
    event.punchType === 2 ? '/api/attendance/break/start' :
    event.punchType === 3 ? '/api/attendance/break/end' :
    null;
  if (!path) return;

  fetch(`${HRIS_URL}${path}`, {
    method: 'POST',
    headers: {
      'x-hris-device-token': BRIDGE_TOKEN,
      'x-hris-employee-id': event.userId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      source: 'BIOMETRIC',
      biometricDeviceId: DEVICE_ID,
      timestamp: new Date(event.timestamp).toISOString(),
    }),
  }).catch((e) => {
    // TODO: durable queue — retry on failure
    console.error('bridge forward failed', e);
  });
});
```

Key things the bridge needs:
- Reconnect + retry loop if the device or HRIS is temporarily unreachable
- Durable queue (SQLite file works) so events aren't lost during outages
- Log every forwarded event for reconciliation
- Runs on system boot (systemd unit on Linux)

#### Step 4 — Server-side auth path

Extend `hris/src/lib/api.ts::requireAuth()` to also accept device tokens:

```typescript
// Pseudocode — actual implementation goes in requireAuth()
const deviceToken = req?.headers.get('x-hris-device-token');
if (deviceToken && crypto.timingSafeEqual(
  Buffer.from(deviceToken),
  Buffer.from(process.env.HRIS_BRIDGE_TOKEN ?? ''),
)) {
  const employeeId = req.headers.get('x-hris-employee-id');
  if (!employeeId) return [null, err(400, 'MISSING_EMPLOYEE_ID', ...)];
  const user = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!user || !user.isActive) return [null, err(403, ...)];
  return [user, null]; // impersonate this employee, skip rate limiter
}
// Fall through to existing Clerk session check…
```

Store `HRIS_BRIDGE_TOKEN` in Vercel env vars and in the bridge's `.env`.
Rotate quarterly.

#### Step 5 — Fallback: manual clock-in always available

**Do not remove the current button.** If the device is unplugged, the
network is down, or a new hire hasn't been enrolled yet, employees should
still be able to clock in manually from the app. The `source: 'MANUAL'`
attribute makes these events distinguishable in the audit log — you can
build a "manual-only" report to flag suspicious patterns later.

---

## Security considerations

- **The bridge token is bearer auth.** Treat it like a database password.
  Rotate on employee departure if they had access to the bridge machine.
- **Physical device tamper.** ZKTeco devices have a tamper switch; wire it
  to send an alert if the case is opened. Store devices in a mounted
  enclosure.
- **Enrollment sessions must be authenticated.** Only HR/Super Admin should
  be able to enroll new fingerprints. Log every enrollment to the audit
  trail.
- **Fingerprint templates never leave the device.** ZKTeco stores templates
  locally; the bridge only knows enrollment IDs. This limits blast radius
  if the bridge is compromised.

---

## Testing plan

Before rolling out to all employees:

1. **Loopback test** — POST directly to `/api/attendance/clock-in` with the
   bridge token headers. Verify a record shows up with `source: BIOMETRIC`
   and the correct `biometricDeviceId`.
2. **Bridge dry-run** — connect the bridge to the device on a private
   network. Verify it forwards enrollment events without a real punch.
3. **Single-user pilot** — enroll one employee. Have them use only the
   device for a week. Verify their records look normal in the app.
4. **Full rollout** — enroll everyone. Keep the manual button visible for
   two weeks as a safety net.
5. **Audit reconciliation** — at the end of the pilot, cross-check bridge
   logs against HRIS attendance records. Any missing punches indicate
   bridge queue failures.

---

## Estimated effort

| Task | Time |
|---|---|
| Hardware ordering + arrival | 3–7 days |
| Backend auth-path change | 1–2 hours |
| Bridge scaffolding | 4–6 hours |
| Enrollment tool (custom page) | 4–6 hours (skip if using vendor software) |
| Physical install + Wi-Fi | 1 hour |
| Pilot week | 5 business days |
| Full rollout | 1 day |

**Total engineering time:** 1–2 developer-days. **Total wall-clock:** 2 weeks
from device order to full rollout.

---

## What to defer

- **Face recognition** — ZKTeco higher-end devices offer face capture too.
  Nice future upgrade; not needed for launch.
- **Attendance geofencing** — only relevant if you go with Option 3 mobile
  app. Skip if you're going with the wall-mounted device.
- **Multi-device redundancy** — one device per entrance is fine until Trace
  grows beyond 30 people or opens a second office.

---

## Questions to answer before starting

1. Which office entrance gets the device?
2. Is there Wi-Fi or Ethernet within 3 m of the mount point?
3. Who does enrollment — HR or the technical owner?
4. What's the policy if the device breaks — everyone falls back to manual
   for a day, or is there a spare?
5. Will remote/hybrid workers ever use the device, or do they always clock
   in from their laptops?

Answer those and the rest is a straightforward implementation.
