/**
 * Office-local calendar helpers.
 *
 * Trace runs in Bangladesh (Asia/Dhaka, UTC+6, no DST) but the server runs in
 * UTC. Deriving a day key with `getUTCDate()` therefore files every event
 * between midnight and 06:00 local under the *previous* calendar day — a bug
 * that is invisible during office hours and wrong every early morning.
 *
 * Everything that needs "which day is it for the employee" goes through here.
 * `Intl.DateTimeFormat` does the zone arithmetic, so there is no offset math to
 * get wrong and no extra dependency.
 */

/** The office timezone. Override only if Trace opens somewhere else. */
export const APP_TZ = process.env.APP_TIMEZONE ?? 'Asia/Dhaka';

// en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TZ,
  weekday: 'short',
});

const DOW: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** `yyyy-MM-dd` for the office-local day containing `at`. */
export function localDayKey(at: Date = new Date()): string {
  return dayKeyFormatter.format(at);
}

/**
 * The value to store in a Prisma `@db.Date` column for the office-local day
 * containing `at`. Prisma serialises `@db.Date` from the UTC components, so a
 * UTC-midnight Date carrying the local Y/M/D is the correct representation.
 */
export function localDateOnly(at: Date = new Date()): Date {
  const [y, m, d] = localDayKey(at).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Turn a `yyyy-MM-dd` string into the same `@db.Date` representation. */
export function dayKeyToDateOnly(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Office-local day of week, 0 = Sunday. */
export function localDayOfWeek(at: Date = new Date()): number {
  return DOW[weekdayFormatter.format(at)] ?? 0;
}

/**
 * Whether `at` falls on a non-working day, per the `workDaysBitmask` setting
 * (bit N set = day N is a workday; the default 31 is Sun–Thu, so Friday and
 * Saturday are the Bangladesh weekend).
 *
 * Pass the bitmask from SystemSettings. The default is only a fallback for
 * callers that have not loaded settings.
 */
export function isNonWorkingDay(at: Date = new Date(), workDaysBitmask = 31): boolean {
  return (workDaysBitmask & (1 << localDayOfWeek(at))) === 0;
}

/** Inclusive `@db.Date` bounds for a month, in office-local terms. */
export function monthRange(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

/**
 * Combine a local dayKey ("YYYY-MM-DD") with a wall-clock "HH:mm" time and
 * return the corresponding UTC instant. Used to turn the office `workEndTime`
 * setting into a comparable Date for overtime calculations.
 *
 * Example: dayKey="2026-09-21", time="17:30", APP_TZ="Asia/Dhaka" →
 *          2026-09-21T11:30:00Z (17:30 Dhaka).
 */
export function localTimeOnDayToUtc(dayKey: string, time: string): Date {
  const { start } = localDayBounds(dayKey); // local midnight, as a UTC Date
  const [h = 0, m = 0] = time.split(':').map(Number);
  return new Date(start.getTime() + (h * 60 + m) * 60_000);
}

/**
 * UTC instants bounding an office-local day — for querying `DateTime` columns
 * (as opposed to `@db.Date`) such as `WorkLocationEvent.startedAt`.
 */
export function localDayBounds(dayKey: string): { start: Date; end: Date } {
  const [y, m, d] = dayKey.split('-').map(Number);
  // Probe local noon to read the zone's offset for that date, then anchor.
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const offsetMinutes = tzOffsetMinutes(probe);
  const start = new Date(Date.UTC(y, m - 1, d) - offsetMinutes * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Minutes that APP_TZ is ahead of UTC at the given instant. */
export function tzOffsetMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}
