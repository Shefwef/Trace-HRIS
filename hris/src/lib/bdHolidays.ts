/**
 * Bangladesh public holidays.
 *
 * Primary source: Google Calendar's official "Holidays in Bangladesh" ICS feed.
 * Google curates all BD public holidays including moon-dependent Islamic and
 * Hindu observances, so the sync covers Eids, Puja, Ashura, etc. — not just
 * fixed Gregorian dates.
 *
 * Fallback (used only when the Google fetch fails): the hardcoded list of
 * fixed-date holidays below. Better than nothing when offline.
 */

const GOOGLE_BD_ICS_URL =
  'https://calendar.google.com/calendar/ical/en.bd%23holiday%40group.v.calendar.google.com/public/basic.ics';

export interface SeedHoliday {
  name: string;
  /** MM-DD — recurring, applied to whichever year the sync call requests. */
  monthDay: string;
  description?: string;
}

/** Fallback list: only the fixed Gregorian dates. */
export const BD_FIXED_HOLIDAYS: SeedHoliday[] = [
  { name: 'International Mother Language Day (Shaheed Dibash)', monthDay: '02-21' },
  { name: 'Independence Day', monthDay: '03-26' },
  { name: 'Pahela Baishakh (Bengali New Year)', monthDay: '04-14' },
  { name: 'May Day (International Workers\' Day)', monthDay: '05-01' },
  { name: 'Victory Day', monthDay: '12-16' },
  { name: 'Christmas Day (Bara Din)', monthDay: '12-25' },
];

/** Gregorian moveable holidays that shift each year — currently none. */
export const BD_GREGORIAN_MOVEABLE: Record<number, SeedHoliday[]> = {};

export interface FetchedHoliday {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  description?: string;
}

/**
 * Whitelist of Bangladesh government-recognized public holidays.
 * Google's ICS feed includes cultural observances and international days
 * that aren't actual gazetted public holidays — we filter to just the ones
 * listed in the Ministry of Public Administration gazette.
 * Match is case-insensitive substring; the regex here is intentionally loose
 * to catch spelling variants ("Eid al-Fitr" vs "Eid ul-Fitr", etc.).
 */
const RECOGNIZED_BD_HOLIDAY_PATTERNS: RegExp[] = [
  // Fixed Gregorian gazetted holidays
  /language\s+day|shaheed\s+dibash/i,
  /independence\s+day/i,
  /pahela\s+baishakh|bengali\s+new\s+year|bangla\s+new\s+year/i,
  /may\s+day|international\s+workers/i,
  /victory\s+day/i,
  /christmas/i,

  // Islamic (moon-dependent)
  /shab[- ]e[- ]barat/i,
  /shab[- ]e[- ]qadr|lailat[- ]?ul[- ]?qadr/i,
  /eid[- ]?(al|ul)?[- ]?fitr/i,
  /eid[- ]?(al|ul)?[- ]?(adha|azha)/i,
  /ashura|muharram/i,
  /milad[- ]?un[- ]?nabi|mawlid|eid[- ]e[- ]milad/i,
  /jumat[- ]?ul[- ]?(bidah|wida|vida)/i,

  // Hindu
  /durga\s+puja|vijaya\s+dashami|dashami/i,
  /janmashtami/i,

  // Buddhist
  /buddha\s+purnima|vesak/i,
];

function isRecognizedBDHoliday(name: string): boolean {
  return RECOGNIZED_BD_HOLIDAY_PATTERNS.some((p) => p.test(name));
}

/**
 * Fetch the "Holidays in Bangladesh" ICS feed from Google and parse events
 * for the requested year. Filters against the recognized-holiday whitelist
 * so cultural observances (Ekushey Boi Mela, etc.) and international days
 * don't pollute the calendar.
 */
async function fetchGoogleHolidays(year: number): Promise<FetchedHoliday[]> {
  const res = await fetch(GOOGLE_BD_ICS_URL, {
    // Holidays don't shift day-to-day; a daily revalidation is plenty.
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`Google ICS fetch failed: ${res.status}`);
  const ics = await res.text();
  const all = parseICS(ics, year);
  return all.filter((h) => isRecognizedBDHoliday(h.name));
}

/**
 * Minimal RFC 5545 iCal parser — just enough to pull SUMMARY + DTSTART from
 * VEVENT blocks for whole-day (VALUE=DATE) entries. Not a general iCal parser.
 */
function parseICS(ics: string, year: number): FetchedHoliday[] {
  // Unfold continuation lines: RFC 5545 §3.1 wraps long lines with CRLF + space.
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: FetchedHoliday[] = [];
  let inEvent = false;
  let name = '';
  let date = '';
  let description: string | undefined;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      name = '';
      date = '';
      description = undefined;
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (name && date && date.startsWith(`${year}-`)) {
        events.push({ name, date, description });
      }
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith('SUMMARY:')) {
      name = decodeICSValue(line.slice('SUMMARY:'.length));
    } else if (line.startsWith('DTSTART;VALUE=DATE:')) {
      const raw = line.slice('DTSTART;VALUE=DATE:'.length);
      // YYYYMMDD → YYYY-MM-DD
      if (/^\d{8}$/.test(raw)) {
        date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      }
    } else if (line.startsWith('DESCRIPTION:')) {
      description = decodeICSValue(line.slice('DESCRIPTION:'.length));
    }
  }

  // De-dupe by (name, date) — Google occasionally lists the same holiday twice
  // when it's observed as both a religious and public holiday.
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const key = `${e.name.toLowerCase()}|${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => a.date.localeCompare(b.date));
}

function decodeICSValue(v: string): string {
  return v
    .replace(/\\n/g, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** Fallback builder — hardcoded fixed dates only. */
function fallbackHolidaysForYear(year: number): FetchedHoliday[] {
  const fixed = BD_FIXED_HOLIDAYS.map((h) => ({
    name: h.name,
    date: `${year}-${h.monthDay}`,
    description: h.description,
  }));
  const moveable = (BD_GREGORIAN_MOVEABLE[year] ?? []).map((h) => ({
    name: h.name,
    date: `${year}-${h.monthDay}`,
    description: h.description,
  }));
  return [...fixed, ...moveable].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Expand to full YYYY-MM-DD entries for the given year.
 * Fetches from Google's BD holiday calendar; falls back to hardcoded list
 * on network error so admins are never left with an empty sync.
 */
export async function holidaysForYear(year: number): Promise<FetchedHoliday[]> {
  try {
    const fetched = await fetchGoogleHolidays(year);
    if (fetched.length > 0) return fetched;
    console.warn('[bdHolidays] Google returned 0 events for', year, '— using fallback');
  } catch (e) {
    console.warn('[bdHolidays] Google fetch failed, using fallback:', e);
  }
  return fallbackHolidaysForYear(year);
}
