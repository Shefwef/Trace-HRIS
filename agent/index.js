/**
 * Trace HRIS — Biometric Punch Agent
 *
 * Runs on the office PC. Every POLL_SECONDS seconds it fetches new punch
 * records from ZKBioTime and forwards them to the HRIS ingest endpoint.
 * Nothing in ZKBioTime is ever modified — this is read-only.
 *
 * Environment (agent/.env):
 *   HRIS_BASE_URL          Public HTTPS URL of the deployed HRIS
 *   BIOMETRIC_INGEST_TOKEN Shared secret — must match hris/.env.local
 *   BIOTIME_BASE_URL       http://<LAN-IP>:<port>  e.g. http://192.168.68.64:8081
 *   BIOTIME_USERNAME       ZKBioTime login username
 *   BIOTIME_PASSWORD       ZKBioTime login password
 *   BIOTIME_AUTH           basic | jwt | token
 *   BIOTIME_TERMINAL_SN    Device serial — FQQ2251600181
 *   POLL_SECONDS           How often to poll (default 60)
 *   LOOKBACK_MINUTES       Overlap window each poll (default 15)
 *
 * IP address note: BIOTIME_BASE_URL uses the office PC's LAN IP. If DHCP
 * reassigns that IP, update this value and restart the agent. The permanent
 * fix is a DHCP reservation for the PC's MAC address in the router admin page
 * (see BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md Step 12).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Load .env manually — no external deps needed for this
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(resolve(__dirname, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env is optional if vars are already in the environment
}

// ---------------------------------------------------------------------------
// Config — validated at startup so failures are loud and immediate
// ---------------------------------------------------------------------------
const HRIS_BASE_URL        = required('HRIS_BASE_URL');
const INGEST_TOKEN         = required('BIOMETRIC_INGEST_TOKEN');
const BIOTIME_BASE_URL     = required('BIOTIME_BASE_URL');
const BIOTIME_USERNAME     = required('BIOTIME_USERNAME');
const BIOTIME_PASSWORD     = required('BIOTIME_PASSWORD');
const BIOTIME_AUTH         = process.env.BIOTIME_AUTH ?? 'basic';
const BIOTIME_TERMINAL_SN  = required('BIOTIME_TERMINAL_SN');
const POLL_SECONDS         = Number(process.env.POLL_SECONDS ?? '60');
const LOOKBACK_MINUTES     = Number(process.env.LOOKBACK_MINUTES ?? '15');

function required(key) {
  const val = process.env[key];
  if (!val) { console.error(`FATAL: ${key} is not set in agent/.env`); process.exit(1); }
  return val;
}

// ---------------------------------------------------------------------------
// Auth header for ZKBioTime
// ---------------------------------------------------------------------------
let jwtToken = null;

async function biotimeAuthHeader() {
  if (BIOTIME_AUTH === 'basic') {
    const creds = Buffer.from(`${BIOTIME_USERNAME}:${BIOTIME_PASSWORD}`).toString('base64');
    return { Authorization: `Basic ${creds}` };
  }
  if (BIOTIME_AUTH === 'token') {
    return { Authorization: `Token ${BIOTIME_PASSWORD}` };
  }
  // jwt — fetch/refresh token as needed
  if (!jwtToken) jwtToken = await fetchJwt();
  return { Authorization: `JWT ${jwtToken}` };
}

async function fetchJwt() {
  const res = await fetch(`${BIOTIME_BASE_URL}/jwt-api-token-auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: BIOTIME_BASE_URL },
    body: JSON.stringify({ username: BIOTIME_USERNAME, password: BIOTIME_PASSWORD }),
  });
  if (!res.ok) throw new Error(`JWT fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.token) throw new Error('JWT response missing token field');
  log('JWT token refreshed');
  return json.token;
}

// ---------------------------------------------------------------------------
// ZKBioTime helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for our device newer than `since`.
 * ZKBioTime paginates with page/page_size; we follow `next` until done.
 * Returns raw transaction objects from the API.
 */
async function fetchPunches(since) {
  const sinceStr = formatBiotimeDate(since);
  const allPunches = [];
  let url = `${BIOTIME_BASE_URL}/iclock/api/transactions/` +
    `?terminal_sn=${BIOTIME_TERMINAL_SN}` +
    `&start_time=${encodeURIComponent(sinceStr)}` +
    `&ordering=punch_time` +
    `&page_size=500`;

  while (url) {
    const headers = await biotimeAuthHeader();
    const res = await fetch(url, { headers });

    // JWT may expire — refresh once and retry
    if (res.status === 401 && BIOTIME_AUTH === 'jwt') {
      jwtToken = await fetchJwt();
      const retryHeaders = await biotimeAuthHeader();
      const retry = await fetch(url, { headers: retryHeaders });
      if (!retry.ok) throw new Error(`ZKBioTime /transactions/ failed: ${retry.status}`);
      const json = await retry.json();
      allPunches.push(...(json.data ?? []));
      url = json.next ?? null;
      continue;
    }

    if (!res.ok) throw new Error(`ZKBioTime /transactions/ failed: ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`ZKBioTime error: ${json.msg}`);
    allPunches.push(...(json.data ?? []));
    url = json.next ?? null;
  }

  return allPunches;
}

/**
 * Normalise ZKBioTime punch_state to what the HRIS ingest accepts.
 *
 * The HRIS ingest only processes "0" (clock-in) and "1" (clock-out).
 * ZKBioTime sends "255" (Unknown) when the device isn't configured with
 * explicit In/Out states — which is the case at Trace. We resolve "255"
 * by time of day: before 13:00 → clock-in, 13:00 and after → clock-out.
 * This matches how ZKBioTime's own reports handle state-less taps.
 *
 * States 2–5 (break, overtime) are left as-is so the HRIS skips them
 * cleanly, preserving the original data in rawPayload.
 */
function normalisePunchState(punch) {
  if (punch.punch_state !== '255') return punch.punch_state;
  const hour = parseInt(punch.punch_time.slice(11, 13), 10);
  return hour < 13 ? '0' : '1';
}

// ---------------------------------------------------------------------------
// Date/time helpers
// ---------------------------------------------------------------------------

/** Format a Date as "YYYY-MM-DD HH:MM:SS" for ZKBioTime query params. */
function formatBiotimeDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// HRIS ingest
// ---------------------------------------------------------------------------

async function postToHris(punches) {
  const body = {
    deviceSerial: BIOTIME_TERMINAL_SN,
    punches: punches.map((p) => ({
      deviceUserId: String(p.emp_code),
      punchedAt: p.punch_time,         // "YYYY-MM-DD HH:MM:SS" wall-clock, as-is
      punchState: normalisePunchState(p),
      verifyType: p.verify_type ?? undefined,
      sourceId: String(p.id),
    })),
  };

  const res = await fetch(`${HRIS_BASE_URL}/api/biometric/punches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INGEST_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HRIS ingest failed ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
function warn(...args) {
  console.warn(new Date().toISOString(), '[WARN]', ...args);
}

// ---------------------------------------------------------------------------
// Main poll loop
// ---------------------------------------------------------------------------
let cursor = null; // last successful poll time; null = cold start

async function poll() {
  const since = cursor
    ? new Date(cursor.getTime() - LOOKBACK_MINUTES * 60 * 1000)
    : new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

  log(`Polling since ${formatBiotimeDate(since)} (cursor: ${cursor ? formatBiotimeDate(cursor) : 'cold start'})`);

  const rawPunches = await fetchPunches(since);
  log(`Fetched ${rawPunches.length} punch(es) from ZKBioTime`);

  if (rawPunches.length === 0) {
    cursor = new Date();
    return;
  }

  // Batch in chunks of 500 (HRIS API limit)
  const BATCH = 500;
  let totalApplied = 0, totalDuplicates = 0, totalUnmapped = 0;

  for (let i = 0; i < rawPunches.length; i += BATCH) {
    const batch = rawPunches.slice(i, i + BATCH);
    const result = await postToHris(batch);
    totalApplied    += result.applied    ?? 0;
    totalDuplicates += result.duplicates ?? 0;
    totalUnmapped   += result.unmapped   ?? 0;
    log(`Batch ${Math.floor(i / BATCH) + 1}: applied=${result.applied} duplicates=${result.duplicates} unmapped=${result.unmapped}`);
  }

  log(`Done — applied=${totalApplied} duplicates=${totalDuplicates} unmapped=${totalUnmapped}`);
  cursor = new Date();
}

async function run() {
  log('Trace HRIS Biometric Agent starting');
  log(`HRIS:    ${HRIS_BASE_URL}`);
  log(`BioTime: ${BIOTIME_BASE_URL}  auth=${BIOTIME_AUTH}  sn=${BIOTIME_TERMINAL_SN}`);
  log(`Poll every ${POLL_SECONDS}s, lookback ${LOOKBACK_MINUTES}min`);

  // Verify ZKBioTime is reachable before entering the loop
  try {
    const headers = await biotimeAuthHeader();
    const res = await fetch(`${BIOTIME_BASE_URL}/iclock/api/terminals/`, { headers });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = await res.json();
    const device = json.data?.find((d) => d.sn === BIOTIME_TERMINAL_SN);
    if (!device) warn(`Terminal ${BIOTIME_TERMINAL_SN} not found in ZKBioTime — check BIOTIME_TERMINAL_SN`);
    else log(`Terminal ${device.terminal_name} (${device.sn}) state=${device.state} last_activity=${device.last_activity}`);
  } catch (err) {
    warn(`ZKBioTime connectivity check failed: ${err.message}`);
    warn('Continuing anyway — will retry on first poll');
  }

  // Poll immediately, then on schedule
  await pollSafe();
  setInterval(pollSafe, POLL_SECONDS * 1000);
}

async function pollSafe() {
  try {
    await poll();
  } catch (err) {
    // Keep cursor unmoved so next poll catches up from the same point
    warn(`Poll failed (cursor unchanged): ${err.message}`);
  }
}

run();
