import {
  COMMUNITY_CATEGORY_LABELS,
  communityBoard,
  type CommunityBoard,
  type CommunityFilters,
  type CommunityListing,
  type CommunityOrigin,
  type CommunityView,
} from "@labelbridge/contracts";
import { ApiError } from "../errors";
import { communityConfig, defaults, type CommunityConfig } from "./config";
import { communityDateWindow, inCommunityWindow } from "./dates";
import { fixtureCandidates } from "./fixtures";
import { distanceFor } from "./geo";
import { CommunityGeocoder } from "./geocoding";
import { CommunityHttp } from "./http";
import { enrichMuse } from "./meta";
import { deduplicate, normalize } from "./normalize";
import { SerpCommunity } from "./serpapi";
import { CommunityStore } from "./store";
type PublicResult = {
  listings: CommunityListing[];
  origin: CommunityOrigin | null;
  warnings: string[];
  providers: CommunityBoard["providers"];
  available: boolean;
  retrievedAt: number;
};
export class CommunityService {
  readonly store: CommunityStore;
  private cache = new Map<string, PublicResult>();
  private pending = new Map<string, Promise<PublicResult>>();
  private attempts = new Map<string, number>();
  private geocoder: CommunityGeocoder;
  private serp: SerpCommunity;
  private http: CommunityHttp;
  constructor(
    readonly config: CommunityConfig = communityConfig(),
    private now: () => number = Date.now,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.store = new CommunityStore(now);
    this.http = new CommunityHttp(
      fetchImpl,
      config.timeoutMs,
      config.limits.concurrency,
    );
    this.geocoder = new CommunityGeocoder(config, this.http, now);
    this.serp = new SerpCommunity(config, this.http);
  }
  private key(filters: CommunityFilters) {
    return JSON.stringify([
      filters.location.trim().toLowerCase(),
      [...filters.categories].sort(),
      filters.kind,
      communityDateWindow(this.now(), filters.dateWindowDays),
      "en-US",
    ]);
  }
  private async retrieve(filters: CommunityFilters): Promise<PublicResult> {
    const retrievedAt = this.now();
    const fixture = this.config.mode === "fixture";
    const warnings: string[] = [];
    let origin: CommunityOrigin | null = null;
    try {
      origin = await this.geocoder.origin(filters.location);
    } catch {
      warnings.push("Origin geocoding unavailable.");
    }
    if (!origin)
      warnings.push(
        fixture
          ? "Fixtures cover Austin, TX / 78701 only. Try Austin or switch the server to live mode."
          : "Location could not be verified. Distances are unavailable. Configure OpenCage or try a city and state.",
      );
    // ZIPs need a reliably resolved city. Never send a precise address or guess a city.
    const city =
      origin?.label ??
      (/^\d{5}$/.test(filters.location) ? null : filters.location);
    const result = fixture
      ? {
          candidates: fixtureCandidates(filters, retrievedAt),
          warnings: [],
          available: true,
        }
      : city
        ? await this.serp.retrieve(filters, city)
        : {
            candidates: [],
            warnings: ["A ZIP must resolve to a city before searching."],
            available: false,
          };
    warnings.push(...result.warnings);
    const listings: CommunityListing[] = [];
    await Promise.all(
      result.candidates.slice(0, 24).map(async (candidate) => {
        const initial = normalize(
          candidate,
          retrievedAt,
          this.config.mode,
          null,
        );
        if (!initial) {
          warnings.push(
            "A result without a safe public source or title was omitted.",
          );
          return;
        }
        let venue = null;
        if (initial.address && initial.locationMode === "physical") {
          try {
            venue = await this.geocoder.venue(initial.address);
          } catch {
            warnings.push("Some venue locations could not be geocoded.");
          }
        }
        const zone =
          venue?.timezone ??
          (initial.address &&
          /\bAustin\b.*\b(TX|Texas)\b/i.test(initial.address)
            ? "America/Chicago"
            : null);
        const listing = normalize(
          candidate,
          retrievedAt,
          this.config.mode,
          zone,
        )!;
        if (venue) {
          listing.latitude = venue.latitude;
          listing.longitude = venue.longitude;
          listing.geocodingMode = venue.dataMode;
        }
        if (
          listing.dateStatus === "incomplete" ||
          listing.dateStatus === "conflicting"
        )
          listing.warnings.push(
            "Date or timezone is incomplete/conflicting; this is not a confirmed upcoming occurrence.",
          );
        listings.push(listing);
      }),
    );
    const unique = deduplicate(listings);
    const enriched = fixture
      ? { listings: unique, available: true }
      : await enrichMuse(unique, filters.categories, this.config, this.http);
    if (!enriched.available)
      warnings.push(
        "Muse enrichment unavailable; structured source results retained.",
      );
    const geoAvailable = fixture || !!this.config.geoKey;
    if (!geoAvailable)
      warnings.push(
        "Live geocoding is not configured. No live result is claimed to be within the selected radius.",
      );
    const providers: CommunityBoard["providers"] = {
      retrieval: result.available ? this.config.mode : "unavailable",
      enrichment: enriched.available ? this.config.mode : "unavailable",
      geocoding: geoAvailable && origin ? this.config.mode : "unavailable",
    };
    return {
      listings: enriched.listings,
      origin,
      warnings: [...new Set(warnings)],
      providers,
      available: result.available,
      retrievedAt,
    };
  }
  view(
    listing: CommunityListing,
    filters: CommunityFilters,
    origin: CommunityOrigin | null,
    accountId?: string,
  ): CommunityView | null {
    if (
      listing.kind !== filters.kind ||
      !filters.categories.includes(listing.category) ||
      (filters.freeOnly && listing.costAmount !== 0)
    )
      return null;
    const inWindow = inCommunityWindow(
      listing,
      this.now(),
      filters.dateWindowDays,
    );
    if (inWindow === false) return null;
    const distance = distanceFor(listing, origin, filters.radiusMiles);
    if (!distance) return null;
    return {
      listing,
      ...distance,
      section:
        inWindow === null && distance.section !== "online"
          ? "date_unverified"
          : distance.section,
      matchReasons: [
        `Retrieved for your selected interest: ${COMMUNITY_CATEGORY_LABELS[listing.category]}.`,
      ],
      saved: this.store.isSaved(accountId, listing.id),
    };
  }
  async search(
    filters: CommunityFilters,
    accountId?: string,
    force = false,
  ): Promise<CommunityBoard> {
    const key = this.key(filters);
    const prior = this.cache.get(key);
    let data = prior;
    let cached = !!prior;
    let stale = false;
    const last = this.attempts.get(key);
    const cooling =
      last !== undefined &&
      this.now() - last < this.config.limits.cooldownSeconds * 1000;
    if (force && cooling)
      throw new ApiError(
        "RATE_LIMITED",
        "Community refresh is cooling down. Use the current results and retry later.",
      );
    if (
      !data ||
      force ||
      this.now() - data.retrievedAt >= this.config.limits.cacheMinutes * 60000
    ) {
      if (cooling && !this.pending.has(key)) {
        stale = true;
      } else {
        let task = this.pending.get(key);
        if (!task) {
          if (this.attempts.size >= 200)
            this.attempts.delete(this.attempts.keys().next().value!);
          this.attempts.set(key, this.now());
          task = this.retrieve(filters);
          this.pending.set(key, task);
        }
        try {
          const fresh = await task;
          if (!fresh.available && prior?.available) {
            data = prior;
            stale = true;
          } else {
            data = fresh;
            cached = false;
            if (this.cache.size >= 100 && !this.cache.has(key))
              this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, data);
            for (const l of data.listings) this.store.upsert(l);
          }
        } finally {
          if (this.pending.get(key) === task) this.pending.delete(key);
        }
      }
    }
    data ??= {
      listings: [],
      origin: null,
      warnings: ["Search unavailable; retry after cooldown."],
      providers: {
        retrieval: "unavailable",
        enrichment: "unavailable",
        geocoding: "unavailable",
      },
      available: false,
      retrievedAt: this.now(),
    };
    const warnings = [
      ...data.warnings,
      ...(stale
        ? [
            "Refresh failed or is cooling down. Cached results retain their original retrieval timestamps.",
          ]
        : []),
    ];
    const items = data.listings.flatMap((l) => {
      const listing =
        cached && l.dataMode !== "fixture"
          ? { ...l, dataMode: "cached" as const }
          : l;
      const v = this.view(listing, filters, data.origin, accountId);
      return v ? [v] : [];
    });
    return communityBoard.parse({
      items,
      filters,
      origin: data.origin,
      status: !data.available
        ? "unavailable"
        : warnings.length
          ? "partial"
          : items.length
            ? "ok"
            : "empty",
      warnings,
      providers: data.providers,
      cache: {
        status: stale ? "stale" : cached ? "cached" : "fresh",
        retrievedAt: new Date(data.retrievedAt).toISOString(),
        expiresAt: new Date(
          data.retrievedAt + this.config.limits.cacheMinutes * 60000,
        ).toISOString(),
        refreshAfter: new Date(
          (this.attempts.get(key) ?? data.retrievedAt) +
            this.config.limits.cooldownSeconds * 1000,
        ).toISOString(),
      },
    });
  }
  detail(id: string, accountId?: string): CommunityView {
    const listing = this.store.get(id);
    if (!listing)
      throw new ApiError(
        "NOT_FOUND",
        "Community listing not found or expired. Search again.",
      );
    // Detail and saved views make no implicit radius/date assertion.
    return {
      listing,
      distanceMiles: null,
      distanceApproximate: false,
      section:
        listing.locationMode === "online" ? "online" : "distance_unverified",
      matchReasons: [],
      saved: this.store.isSaved(accountId, id),
    };
  }
  preferences(accountId: string, location?: string) {
    const saved = this.store.getPreferences(accountId);
    return {
      filters: {
        ...(saved ?? defaults),
        location: location ?? saved?.location ?? defaults.location,
      },
      profileLocation: location ?? null,
    };
  }
}
