/**
 * Map tiles: OpenStreetMap raster tiles via MapLibre GL (no API key needed).
 * Geocoding: Nominatim (OSM's free geocoding service, no API key needed).
 *
 * OSM tile usage policy: max 2 parallel requests per user, cache enabled by
 * default in MapLibre, attribution required (included in OSM_MAP_STYLE).
 * Nominatim usage policy: max 1 req/sec — the 350 ms debounce in the picker
 * keeps us well within that limit for a single-company HRIS.
 */

/** Maps are always available — neither tiles nor geocoding require a paid key. */
export const MAPS_ENABLED = true;

/**
 * Inline MapLibre style that loads OSM raster tiles.
 * Pass this object directly as the `style` prop of MapLibreMap so MapLibre
 * never makes a request to Geoapify and no origin restriction applies.
 */
export const OSM_MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster' as const, source: 'osm' }],
};

// ─── Shared types ─────────────────────────────────────────

/** One search result, flattened to just what the modal and the DB care about. */
export interface PlaceHit {
  placeId?: string;
  /** Bold line in the dropdown: an amenity name, or street + house number. */
  primary: string;
  /** Muted second line: remainder of the display name. */
  secondary: string;
  /** Full single-line address, stored as `formattedAddress`. */
  formatted?: string;
  lat?: number;
  lon?: number;
}

// ─── Nominatim types ──────────────────────────────────────

interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
}

function toHit(r: NominatimResult): PlaceHit {
  const parts = r.display_name.split(', ');
  const primary = r.name || parts[0] || r.display_name;
  const secondary = parts.slice(1, 3).join(', ');
  return {
    placeId: `${r.osm_type}${r.osm_id}`,
    primary,
    secondary,
    formatted: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  };
}

async function nominatimGet(
  path: 'search' | 'reverse',
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const q = new URLSearchParams({ format: 'json', addressdetails: '1', ...params });
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}?${q}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim ${path} failed (HTTP ${res.status}).`);
  return res;
}

/**
 * Place search via Nominatim.
 *
 * Uses a viewbox biased around the office so Dhaka results float to the top,
 * but `bounded=0` lets it fall back to wider results rather than returning
 * nothing when a consultant is working outside Dhaka.
 */
export async function searchPlaces(
  text: string,
  near: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  const pad = 0.5; // ~55 km viewbox — covers greater Dhaka
  const viewbox = `${near.lng - pad},${near.lat + pad},${near.lng + pad},${near.lat - pad}`;
  const res = await nominatimGet(
    'search',
    { q: text, limit: '6', viewbox, bounded: '0' },
    signal,
  );
  const results: NominatimResult[] = await res.json();
  return results.map(toHit);
}

/** Names a dropped pin via Nominatim reverse geocoding. Returns null on failure. */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<PlaceHit | null> {
  try {
    const res = await nominatimGet('reverse', { lat: String(lat), lon: String(lon) }, signal);
    const r: NominatimResult = await res.json();
    // Nominatim returns `{ error: 'Unable to geocode' }` for ocean/void clicks
    if (!r.display_name) return null;
    return toHit(r);
  } catch {
    return null;
  }
}
