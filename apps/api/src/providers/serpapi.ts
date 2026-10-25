import { pharmacyLookup, type PharmacyLookup } from "@labelbridge/contracts";
import { ProviderError, withRetry } from "./shared";

const defaultEndpoint = "https://serpapi.com/search";
// A cold query against the Maps engine was observed at ~14s in a 2026-10-24
// spike (a cached one at ~0.9s), so the budget is well above the fast path.
const timeoutMs = 25_000;
/** Plan requirement: normalized searches are cached for 15 minutes. */
export const cacheTtlMs = 15 * 60_000;
/** More than this is noise in a list nobody can rank by distance. */
const maxResults = 10;
/**
 * Results further than this from the anchor are dropped. Generous enough to
 * keep genuinely nearby pharmacies in an adjacent ZIP code, tight enough that
 * the provider's unrelated-city fallback cannot survive it.
 */
const clusterRadiusKm = 50;

export type SerpApiConfig = { apiKey: string; endpoint: string };

/**
 * Reads provider configuration from the environment. Returns null when no key
 * is present, which keeps the pharmacy lookup in explicit fixture mode rather
 * than pretending a search ran.
 */
export function serpApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): SerpApiConfig | null {
  const apiKey = env.SERPAPI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, endpoint: env.SERPAPI_ENDPOINT?.trim() || defaultEndpoint };
}

export const sourceTitle = "Google Maps results via SerpApi";

const orderingNote =
  "Listed in the source's own order, not by distance: no distance was measured.";
const hoursNote =
  "Opening hours are as reported by the source and may be out of date. Call before travelling.";
const notConfirmedNote =
  "Not a confirmation that a pharmacy stocks this medication or will fill this prescription.";

type RawResult = {
  title?: unknown;
  address?: unknown;
  phone?: unknown;
  website?: unknown;
  hours?: unknown;
  place_id?: unknown;
  gps_coordinates?: { latitude?: unknown; longitude?: unknown };
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const url = (value: unknown): string | null => {
  const raw = str(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    // Only ordinary web links are ever handed to the browser.
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

type Point = { lat: number; lng: number };

const pointOf = (raw: RawResult): Point | null => {
  const lat = raw.gps_coordinates?.latitude;
  const lng = raw.gps_coordinates?.longitude;
  return typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
};

/** Great-circle distance in km. Used only to validate the provider's answer. */
export function distanceKm(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The tokens an address must contain for a result to anchor the search area.
 * For "Austin, TX" both "Austin, TX" and "Austin" count, because the provider
 * writes the state separately from the city in some addresses.
 */
function locationTokens(location: string): string[] {
  const trimmed = location.trim();
  const beforeComma = trimmed.split(",")[0]?.trim();
  const tokens = [trimmed];
  if (beforeComma && beforeComma !== trimmed) tokens.push(beforeComma);
  return tokens.map((t) => t.toLowerCase());
}

/**
 * Checks the provider actually understood the location, and keeps only
 * results in the same area.
 *
 * This guard exists because of an observed failure rather than a theoretical
 * one: in a 2026-10-24 spike, an unusable location ("pharmacy near ZZ00000
 * Nowhere") returned HTTP 200, `search_metadata.status: "Success"`, no error
 * field, and fourteen real pharmacies scattered across three states. Without
 * this check the demo would present one of them as a nearby pharmacy.
 */
export function localize(
  location: string,
  raw: RawResult[],
): { kept: RawResult[]; dropped: number } | null {
  const tokens = locationTokens(location);
  const anchors = raw.filter((entry) => {
    const address = str(entry.address)?.toLowerCase();
    return !!address && tokens.some((token) => address.includes(token));
  });
  // Nothing in the provider's answer mentions the place that was asked for.
  if (anchors.length === 0) return null;
  const anchorPoints = anchors
    .map(pointOf)
    .filter((p): p is Point => p !== null);
  // Anchored by address but with no usable coordinates: the address match is
  // the only evidence available, so fall back to the anchors alone.
  if (anchorPoints.length === 0)
    return { kept: anchors, dropped: raw.length - anchors.length };
  const centre: Point = {
    lat: median(anchorPoints.map((p) => p.lat)),
    lng: median(anchorPoints.map((p) => p.lng)),
  };
  const kept = raw.filter((entry) => {
    const point = pointOf(entry);
    // A result with no coordinates is kept only if its address anchors it.
    if (!point) return anchors.includes(entry);
    return distanceKm(centre, point) <= clusterRadiusKm;
  });
  return { kept, dropped: raw.length - kept.length };
}

function mapResults(
  location: string,
  retrievedAt: string,
  raw: RawResult[],
): PharmacyLookup {
  const base = {
    locationQuery: location,
    sourceTitle,
    retrievedAt,
    ordering: "source_order" as const,
  };
  if (raw.length === 0)
    return pharmacyLookup.parse({
      ...base,
      status: "no_results",
      results: [],
      notes: ["The source returned no pharmacies for this location."],
    });
  const localized = localize(location, raw);
  if (!localized || localized.kept.length === 0)
    return pharmacyLookup.parse({
      ...base,
      status: "location_not_recognised",
      results: [],
      notes: [
        "The source did not return results for this location, so nothing is shown. Check the ZIP code or try a nearby city.",
      ],
    });
  const results = localized.kept
    .map((entry, index) => {
      const name = str(entry.title);
      const address = str(entry.address);
      if (!name || !address) return null;
      return {
        id: str(entry.place_id) ?? `result-${index + 1}`,
        name,
        address,
        phone: str(entry.phone),
        website: url(entry.website),
        hoursText: str(entry.hours),
        sourceRank: index + 1,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, maxResults)
    // Renumbered after filtering so the ranks stay 1..n and contiguous.
    .map((result, index) => ({ ...result, sourceRank: index + 1 }));
  if (results.length === 0)
    return pharmacyLookup.parse({
      ...base,
      status: "no_results",
      results: [],
      notes: ["The source returned no usable pharmacy entries."],
    });
  const notes = [orderingNote, hoursNote, notConfirmedNote];
  if (localized.dropped > 0)
    notes.push(
      `${localized.dropped} result${localized.dropped === 1 ? "" : "s"} outside the searched area ${localized.dropped === 1 ? "was" : "were"} removed.`,
    );
  return pharmacyLookup.parse({ ...base, status: "ok", results, notes });
}

type Fetch = typeof fetch;

/** The provider reports "no results" in a 200 body rather than as an error. */
const emptyResultError = /returned? (any|no) results/i;

async function callOnce(
  config: SerpApiConfig,
  location: string,
  fetchImpl: Fetch,
): Promise<RawResult[]> {
  const target = new URL(config.endpoint);
  target.searchParams.set("engine", "google_maps");
  target.searchParams.set("type", "search");
  // The only case data that ever reaches the search provider is the coarse
  // location the user typed. No medication name, strength, directions,
  // prescription number, patient name or label text is sent: a third party
  // receiving "pharmacy near 78751" learns nothing about the prescription.
  target.searchParams.set("q", `pharmacy near ${location}`);
  target.searchParams.set("hl", "en");
  target.searchParams.set("api_key", config.apiKey);
  let response: Response;
  try {
    response = await fetchImpl(target, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    throw new ProviderError(`search request failed (${name})`, true);
  }
  if (!response.ok) {
    // 401/403 mean the credential is wrong and 400 the request shape is, so
    // no retry can help and no further search credit should be spent.
    const retryable = response.status === 429 || response.status >= 500;
    const fatal = [400, 401, 403].includes(response.status);
    throw new ProviderError(
      `search provider ${response.status}`,
      retryable,
      fatal,
    );
  }
  let body: { error?: unknown; local_results?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new ProviderError("search provider returned invalid JSON", false);
  }
  const error = str(body.error);
  // An empty result set is a legitimate answer, not a provider failure, and
  // the plan requires the two to be inspected separately.
  if (error) {
    if (emptyResultError.test(error)) return [];
    throw new ProviderError("search provider reported a query error", false);
  }
  return Array.isArray(body.local_results)
    ? (body.local_results as RawResult[])
    : [];
}

type CacheEntry = { at: number; lookup: PharmacyLookup };

/**
 * Caches normalized lookups for 15 minutes. The key is the coarse location
 * alone, so the cache holds no personal or prescription data and is shared
 * across cases without leaking anything between them.
 */
export class PharmacyCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number) {}

  private static key(location: string) {
    return location.trim().toLowerCase().replace(/\s+/g, " ");
  }

  get(location: string): PharmacyLookup | null {
    const entry = this.entries.get(PharmacyCache.key(location));
    if (!entry) return null;
    if (this.now() - entry.at >= cacheTtlMs) {
      this.entries.delete(PharmacyCache.key(location));
      return null;
    }
    return entry.lookup;
  }

  set(location: string, lookup: PharmacyLookup) {
    if (this.entries.size > 500) this.entries.clear();
    this.entries.set(PharmacyCache.key(location), {
      at: this.now(),
      lookup,
    });
  }
}

/**
 * Looks up pharmacies near a coarse location. Any provider failure surfaces as
 * `null` so the caller can return an explicit unavailable state rather than an
 * invented or stale list.
 */
export async function findPharmacies(
  config: SerpApiConfig,
  location: string,
  options: {
    fetchImpl?: Fetch;
    onError?: (message: string) => void;
    now?: () => number;
  } = {},
): Promise<PharmacyLookup | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const at = new Date((options.now ?? Date.now)()).toISOString();
  return withRetry(
    async () =>
      mapResults(location, at, await callOnce(config, location, fetchImpl)),
    options.onError,
  );
}
