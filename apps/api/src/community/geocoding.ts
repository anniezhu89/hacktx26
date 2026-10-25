import {
  communityOrigin,
  communityPoint,
  type CommunityOrigin,
} from "@labelbridge/contracts";
import seed from "../../../../fixtures/community/retrieval.json";
import { CommunityHttp, object, string, ProviderFailure } from "./http";
import type { CommunityConfig } from "./config";
export type GeocodedVenue = {
  latitude: number;
  longitude: number;
  timezone: string | null;
  dataMode: "live" | "fixture";
};
export class CommunityGeocoder {
  private cache = new Map<
    string,
    { value: Record<string, unknown> | null; at: number }
  >();
  private pending = new Map<string, Promise<Record<string, unknown> | null>>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private config: CommunityConfig,
    private http: CommunityHttp,
    private now: () => number = Date.now,
    private spacingMs = 1100,
  ) {}
  private async lookup(query: string) {
    if (!this.config.geoKey) return null;
    const key = query.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < 24 * 60 * 60_000)
      return cached.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = this.tail.then(async () => {
      try {
        const url = new URL("https://api.opencagedata.com/geocode/v1/json");
        for (const [k, v] of Object.entries({
          q: query,
          key: this.config.geoKey,
          limit: "2",
          countrycode: "us",
        }))
          url.searchParams.set(k, v);
        const data = object(await this.http.json(url));
        if (object(data.status).code !== 200 || !Array.isArray(data.results))
          throw new ProviderFailure("Geocoder response invalid");
        const result =
          data.results.length === 1 ? object(data.results[0]) : null;
        if (this.cache.size >= 500)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value: result, at: this.now() });
        return result;
      } finally {
        await new Promise((r) => setTimeout(r, this.spacingMs));
      }
    });
    this.pending.set(key, task);
    this.tail = task.catch(() => undefined);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  async origin(location: string): Promise<CommunityOrigin | null> {
    if (this.config.mode === "fixture")
      return /^(Austin(?:,\s*(?:TX|Texas))?|78701)$/i.test(location)
        ? communityOrigin.parse({
            ...seed.origin,
            label: location,
            accuracy: /^\d/.test(location) ? "zip_centroid" : "city_centroid",
            timezone: "America/Chicago",
            dataMode: "fixture",
          })
        : null;
    const result = await this.lookup(location);
    if (!result) return null;
    const c = object(result.components);
    const zip = /^\d{5}$/.test(location);
    const city = string(c.city) ?? string(c.town) ?? string(c.village) ?? "";
    if (
      zip
        ? String(c.postcode).slice(0, 5) !== location
        : city.toLowerCase() !== location.split(",")[0].trim().toLowerCase()
    )
      return null;
    const point = communityPoint.safeParse({
      latitude: object(result.geometry).lat,
      longitude: object(result.geometry).lng,
    });
    return point.success
      ? {
          ...point.data,
          label:
            [city, string(c.state_code)].filter(Boolean).join(", ") || location,
          accuracy: zip ? "zip_centroid" : "city_centroid",
          timezone: string(object(object(result.annotations).timezone).name),
          dataMode: "live",
        }
      : null;
  }
  async venue(address: string): Promise<GeocodedVenue | null> {
    if (this.config.mode === "fixture") {
      const point = (
        seed.venues as Record<string, { latitude: number; longitude: number }>
      )[address];
      return point
        ? { ...point, timezone: "America/Chicago", dataMode: "fixture" }
        : null;
    }
    const result = await this.lookup(address);
    if (!result || Number(result.confidence) < 6) return null;
    const c = object(result.components);
    if (
      !c.house_number ||
      !c.road ||
      !/\d/.test(address) ||
      ["city", "town", "village", "road", "postcode"].includes(String(c._type))
    )
      return null;
    const point = communityPoint.safeParse({
      latitude: object(result.geometry).lat,
      longitude: object(result.geometry).lng,
    });
    return point.success
      ? {
          ...point.data,
          timezone: string(object(object(result.annotations).timezone).name),
          dataMode: "live",
        }
      : null;
  }
}
