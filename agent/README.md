# Trace HRIS Biometric Agent

Runs on the office PC, polls ZKBioTime every minute, and forwards new punches
to the HRIS ingest endpoint.

## Running it

**Simple / recommended:** double-click **`start-agent.bat`**.

A console window titled *"Trace HRIS Biometric Agent"* opens and stays in
the taskbar. Minimise it and it keeps running in the background — click the
taskbar icon any time to bring the window back and check the log output.
Closing the window stops the agent.

**From a terminal:**

```powershell
cd agent
node index.js
```

## Auto-start on Windows login

So you don't have to remember to launch it manually after a reboot:

1. Right-click **`start-agent.bat`** → *Send to* → *Desktop (create shortcut)*.
2. Press **Win+R**, type `shell:startup`, press Enter — the Startup folder opens.
3. Drag the desktop shortcut into that folder.
4. (Optional) Right-click the shortcut → *Properties* → set **Run: Minimized**
   so it launches straight to the taskbar without stealing focus.

The agent will now start every time the user logs into Windows.

## Backfilling historical punches

The agent only looks back **12 hours** on cold start. Anything older than the
first successful poll never gets pulled unless you explicitly ask for it.

To backfill (e.g. after connecting a new HRIS instance or discovering a gap):

1. Open `agent/.env` and add or edit:

    ```env
    INITIAL_LOOKBACK_HOURS=8760
    ```

    - `168` = last 7 days
    - `720` = last 30 days
    - `8760` = last 365 days *(HRIS supports up to a year in the Punches tab filter)*

2. Stop the agent (close the window / Ctrl+C).
3. Start it again (`start-agent.bat`).
4. Watch for `Polling since <old-date>` in the first log line, followed by
   `Fetched N punch(es)` — a full year can take a couple of minutes.
5. **Reset it** — remove the `INITIAL_LOOKBACK_HOURS` line (or set back to
   `12`) and restart, so daily restarts don't re-download a year of data.

Duplicates are automatically skipped at the database level, so backfills are
always safe to repeat.

## Environment variables

All read from `agent/.env`:

| Var | Required | Default | Meaning |
|---|---|---|---|
| `HRIS_BASE_URL` | ✓ | — | Public HTTPS URL of the deployed HRIS |
| `BIOMETRIC_INGEST_TOKEN` | ✓ | — | Shared secret; must match `hris/.env.local` |
| `BIOTIME_BASE_URL` | ✓ | — | ZKBioTime URL, e.g. `http://192.168.68.64:8081` |
| `BIOTIME_USERNAME` | ✓ | — | ZKBioTime login |
| `BIOTIME_PASSWORD` | ✓ | — | ZKBioTime password |
| `BIOTIME_AUTH` | | `basic` | `basic`, `jwt`, or `token` |
| `BIOTIME_TERMINAL_SN` | ✓ | — | Device serial, e.g. `FQQ2251600181` |
| `POLL_SECONDS` | | `60` | How often to poll |
| `LOOKBACK_MINUTES` | | `15` | Overlap window each poll (handles clock skew) |
| `INITIAL_LOOKBACK_HOURS` | | `12` | Cold-start backfill window (see above) |

## Troubleshooting

- **Window closes immediately when double-clicking the .bat**
  Node.js isn't installed or isn't on the PATH. Install Node 18+ from
  https://nodejs.org/ and try again — the launcher will now print a clear
  error instead of vanishing.
- **`ZKBioTime connectivity check failed`**
  ZKBioTime service on the office PC isn't reachable at `BIOTIME_BASE_URL`.
  Confirm the LAN IP hasn't changed (routers often reassign after reboots —
  set a DHCP reservation for the PC's MAC address).
- **`Fetched 0 punch(es)`** on every poll, even after fresh fingerprint taps
  The taps aren't reaching ZKBioTime either — check the device's Cloud Server
  setting and network connection. This is a device ↔ ZKBioTime problem, not
  an agent problem.
- **Punches show as "Unmapped" in HRIS**
  The employee's biometric `emp_code` isn't mapped to their HRIS profile.
  Fix in HRIS → Biometric → Mapping tab.

## Running as a true Windows service (optional)

If you want the agent to run without any user logged in (e.g. on a headless
server), install [PM2](https://pm2.keymetrics.io/) with the Windows startup
helper:

```powershell
npm install -g pm2 pm2-windows-startup
cd agent
pm2 start index.js --name trace-agent
pm2 save
pm2-startup install
```

Then `pm2 monit` shows live logs from any terminal, and the agent survives
logouts and reboots without needing anyone signed in.
