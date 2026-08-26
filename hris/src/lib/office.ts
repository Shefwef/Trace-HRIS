/**
 * Where Trace actually is.
 *
 * One module so the map picker, the attendance card and anything else that
 * names the office all agree — an address duplicated across three components
 * is an address that will eventually disagree with itself.
 *
 * The coordinates are only an anchor: they centre the initial map view and bias
 * place search towards Dhaka. Nothing recorded depends on them, because an
 * off-site pin's coordinates come from the place the employee actually picked.
 * So being a few hundred metres out costs nothing but a slightly wider initial
 * view, and moving office is an env change rather than a deploy.
 *
 * `NEXT_PUBLIC_` is required, not stylistic: both consumers are client
 * components, and Next only inlines that prefix into the browser bundle.
 */

/** Falls back when the var is unset, empty, or not a number. */
function envNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : fallback;
}

export const OFFICE = {
  name: 'Trace Consulting Ltd',
  address:
    process.env.NEXT_PUBLIC_OFFICE_ADDRESS ??
    'Level 2, Plot 285, Road 19/C, Mohakhali New DOHS, Dhaka-1206, Bangladesh',
  /**
   * Mohakhali New DOHS, approximated from OpenStreetMap — which has thin data
   * for this neighbourhood and confuses it with the other Mohakhali DOHS in
   * Kafrul. Worth confirming in the picker once a Geoapify key is set.
   */
  lat: envNumber(process.env.NEXT_PUBLIC_OFFICE_LAT, 23.7815),
  lng: envNumber(process.env.NEXT_PUBLIC_OFFICE_LNG, 90.4001),
} as const;

/**
 * `{lat, lng}` because that is what our own components speak. MapLibre wants
 * `[lng, lat]` tuples instead, so the flip happens at that boundary only —
 * see LocationMap.
 */
export const OFFICE_CENTER = { lat: OFFICE.lat, lng: OFFICE.lng };
