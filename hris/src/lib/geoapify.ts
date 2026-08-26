/**
 * Geoapify — place search and map tiles.
 *
 * Chosen over Google Maps Platform because the free tier needs no billing
 * information and permits commercial use with attribution. The trade-off is
 * honest and worth writing down: Geoapify is built on OpenStreetMap, whose
 * coverage of Dhaka is patchier than Google's. Searching this very office
 * ("Road 19/C, Mohakhali New DOHS") returns a weak building match, and a
 * looser search collides with the *other* Mohakhali DOHS in Kafrul. That is
 * exactly why the map stays clickable: when search cannot find a place, the
 * employee pans and drops a pin instead, and `placeName` — the only required
 * field — is still whatever they typed.
 *
 * The key is `NEXT_PUBLIC_` out of necessity, not laziness: MapLibre fetches
 * tiles straight from the browser, so the key is in the page either way.
 * Proxying search through our own route would add a hop for no security gain.
 * The real mitigation is Geoapify's allowed-origin restriction — see
 * .env.example.
 */

const KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;

/** Search and the map are one purchase — either both work or neither does. */
export const MAPS_ENABLED = !!KEY;

/**
 * Pale, low-ink basemap. Deliberate: this map exists to confirm a pin, so the
 * pin should be the loudest thing on it. Positron also carries fewer label
 * layers than the `osm-bright` family, which means less to rasterise per frame.
 * Override with any vector style id Geoapify publishes (`osm-bright-smooth`,
 * `klokantech-basic`, `dark-matter`, …) if the look ever needs to change.
 */
const STYLE = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_STYLE || 'positron';

/** MapLibre reads the whole style document from here; tiles follow from it. */
export function mapStyleUrl(): string {
  return `https://maps.geoapify.com/v1/styles/${STYLE}/style.json?apiKey=${KEY}`;
}

/** One search result, flattened to just what the modal and the DB care about. */
export interface PlaceHit {
  /**
   * Absent from Geoapify's documented field list, so treated as optional — though
   * `/search` and `/reverse` do both return it in practice. Our own column is a
   * plain `String?` capped at 300 chars with no format assumption (see
   * StartOffsiteSchema), so present-or-absent costs nothing either way.
   */
  placeId?: string;
  /** Bold line in the dropdown: an amenity name, or street + house number. */
  primary: string;
  /** Muted second line: whatever the address has left over. */
  secondary: string;
  /** Full single-line address, stored as `formattedAddress`. */
  formatted?: string;
  lat?: number;
  lon?: number;
}

/** Geoapify's documented `features[].properties` fields, narrowed to ours. */
interface RawProps {
  place_id?: string;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  lat?: number;
  lon?: number;
}

function toHit(p: RawProps): PlaceHit {
  return {
    ...(p.place_id ? { placeId: p.place_id } : {}),
    // A POI carries `name`; a bare street address does not, and there
    // `address_line1` already holds "street + house number".
    primary: p.name || p.address_line1 || p.formatted || 'Unnamed place',
    secondary: p.address_line2 || '',
    ...(p.formatted ? { formatted: p.formatted } : {}),
    ...(typeof p.lat === 'number' ? { lat: p.lat } : {}),
    ...(typeof p.lon === 'number' ? { lon: p.lon } : {}),
  };
}

/**
 * Geoapify defaults to GeoJSON, which is the shape its own docs demonstrate
 * (`result.features[0].properties.formatted`). The `results` branch is cheap
 * insurance in case a `format=json` response ever reaches here.
 */
function extract(body: unknown): PlaceHit[] {
  const b = body as {
    features?: { properties?: RawProps }[];
    results?: RawProps[];
  } | null;
  if (b?.features) {
    return b.features.map((f) => toHit(f.properties ?? {}));
  }
  if (b?.results) return b.results.map(toHit);
  return [];
}

async function get(path: string, params: Record<string, string>, signal?: AbortSignal) {
  if (!KEY) throw new Error('Map search is not configured.');
  const q = new URLSearchParams({ ...params, apiKey: KEY, lang: 'en' });
  const res = await fetch(`https://api.geoapify.com/v1/geocode/${path}?${q}`, { signal });
  if (!res.ok) {
    // 401 means a bad or origin-blocked key; 429 means the daily credits ran
    // out. Both are worth surfacing verbatim — a silent empty list would read
    // as "no such place", which is a different and misleading problem.
    throw new Error(`Search failed (HTTP ${res.status}).`);
  }
  return extract(await res.json());
}

/**
 * Place search.
 *
 * Uses `/search`, NOT `/autocomplete`. Geoapify markets autocomplete as the
 * type-ahead endpoint, so it is the obvious choice — and on Dhaka's OSM data it
 * is measurably wrong. Measured against this key, same bias, same `limit=6`:
 *
 *   query                    /autocomplete            /search
 *   "Jamuna Future Park"     0 hits                   found
 *   "Gulshan Club"           6 hits, none correct     found, exact
 *   "BRAC Centre Mohakhali"  6 hits, none correct     found ("BRAC Center")
 *
 * Autocomplete's failure mode is worse than emptiness: asked for Gulshan Club it
 * confidently offers "Shainik Club Bus stop" and "BOLLYWOOD DANCE & FITNESS
 * CLUB", so an employee in a hurry can file a plausible-looking wrong site into
 * HR's report. `/search` costs the same 1 credit and both return an identical
 * FeatureCollection, so this is recall gained for nothing. Do not "optimise"
 * this back to autocomplete.
 *
 * The caller debounces by 350ms and requires 3 characters, which is what makes a
 * full-geocode endpoint reasonable to drive from a text field.
 *
 * Biased towards the office rather than hard-filtered to Bangladesh: a soft
 * proximity bias already floats Dhaka results to the top, while a
 * `countrycode:bd` filter would quietly break the consultant flying to a
 * client in Singapore.
 */
export function searchPlaces(
  text: string,
  near: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  return get(
    'search',
    {
      text,
      limit: '6',
      bias: `proximity:${near.lng},${near.lat}`,
    },
    signal,
  );
}

/** Names a dropped pin. Returns null when the coordinates resolve to nothing. */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<PlaceHit | null> {
  const hits = await get('reverse', { lat: String(lat), lon: String(lon) }, signal);
  return hits[0] ?? null;
}
