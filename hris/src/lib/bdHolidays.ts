/**
 * Bangladesh public holidays — fixed (non-lunar) dates only.
 *
 * We deliberately exclude Islamic and Hindu holidays that depend on moon
 * sightings. Those dates are only confirmed by the Ministry gazette a few
 * weeks before, and shipping guessed dates is worse than shipping nothing.
 * Add them by hand in Holiday Manager as the gazette is published.
 *
 * Sources: Ministry of Public Administration annual public-holiday gazette.
 */

export interface SeedHoliday {
  name: string;
  /** MM-DD — recurring, applied to whichever year the sync call requests. */
  monthDay: string;
  description?: string;
}

export const BD_FIXED_HOLIDAYS: SeedHoliday[] = [
  { name: 'International Mother Language Day (Shaheed Dibash)', monthDay: '02-21' },
  { name: "Sheikh Mujibur Rahman's Birthday & National Children's Day", monthDay: '03-17' },
  { name: 'Independence Day', monthDay: '03-26' },
  { name: 'Pahela Baishakh (Bengali New Year)', monthDay: '04-14' },
  { name: 'May Day (International Workers\' Day)', monthDay: '05-01' },
  { name: 'National Mourning Day', monthDay: '08-15' },
  { name: 'Victory Day', monthDay: '12-16' },
  { name: 'Christmas Day (Bara Din)', monthDay: '12-25' },
];

/**
 * Good Friday 2026-specific date (moves by Gregorian rule each year).
 * Add other years' dates here explicitly when needed.
 */
export const BD_GREGORIAN_MOVEABLE: Record<number, SeedHoliday[]> = {
  2026: [
    { name: 'Good Friday', monthDay: '04-03' },
  ],
};

/** Expand the seed list to full YYYY-MM-DD entries for the given year. */
export function holidaysForYear(year: number): { name: string; date: string; description?: string }[] {
  const fixed = BD_FIXED_HOLIDAYS.map((h) => ({ name: h.name, date: `${year}-${h.monthDay}`, description: h.description }));
  const moveable = (BD_GREGORIAN_MOVEABLE[year] ?? []).map((h) => ({ name: h.name, date: `${year}-${h.monthDay}`, description: h.description }));
  return [...fixed, ...moveable].sort((a, b) => a.date.localeCompare(b.date));
}
