import { describe, expect, it } from "vitest";
import {
  communityFilters,
  communityListing,
  safeCommunityUrl,
  type CommunityListing,
  type CommunityOrigin,
} from "../../../packages/contracts/src/index";
import {
  parseCommunityDate,
  communityDateWindow,
  inCommunityWindow,
} from "../../../apps/api/src/community/dates";
import {
  distanceFor,
  haversineMiles,
} from "../../../apps/api/src/community/geo";
import { CommunityStore } from "../../../apps/api/src/community/store";
const now = Date.parse("2026-10-25T17:00:00Z");
const origin: CommunityOrigin = {
  latitude: 0,
  longitude: 0,
  label: "Synthetic ZIP centroid",
  accuracy: "zip_centroid",
  timezone: "America/Chicago",
  dataMode: "fixture",
};
function listing(changes: Partial<CommunityListing> = {}): CommunityListing {
  return communityListing.parse({
    id: "synthetic-event",
    kind: "event",
    title: "Fictional workshop",
    organizer: null,
    category: "health_workshops",
    description: "Fictional public evidence.",
    sourceUrl: "https://example.org/event",
    registrationUrl: null,
    sourceEvidence: [
      {
        field: "title",
        excerpt: "Fictional workshop",
        sourceUrl: "https://example.org/event",
      },
    ],
    originalDateText: "October 28, 2026",
    startAt: "2026-10-28",
    endAt: null,
    timezone: "America/Chicago",
    dateStatus: "confirmed",
    venueName: "Demo Hall",
    address: "100 Demo Plaza, Austin, TX",
    latitude: 0,
    longitude: 0,
    locationMode: "physical",
    costAmount: null,
    currency: null,
    costText: null,
    eligibilityText: null,
    languageInfo: null,
    accessibilityInfo: null,
    retrievedAt: new Date(now).toISOString(),
    sourceCheckedAt: null,
    dataMode: "fixture",
    warnings: [],
    enrichmentStatus: "source_only",
    geocodingMode: "fixture",
    ...changes,
  });
}

describe("community distance boundaries", () => {
  it("includes 24.9 miles and excludes 25.1 miles before rounding", () => {
    const within = listing({ latitude: 0.360381 });
    const outside = listing({ latitude: 0.363276 });
    expect(
      haversineMiles(origin, within as { latitude: number; longitude: number }),
    ).toBeCloseTo(24.9, 1);
    expect(distanceFor(within, origin, 25)?.section).toBe("nearby");
    expect(distanceFor(outside, origin, 25)).toBeNull();
  });
  it("handles identical, exact boundary and antipodal points", () => {
    expect(haversineMiles(origin, origin)).toBe(0);
    const p = listing({ latitude: ((25 / 3958.7613) * 180) / Math.PI });
    expect(distanceFor(p, origin, 25)?.distanceMiles).toBe(25);
    expect(haversineMiles(origin, { latitude: 0, longitude: 180 })).toBeCloseTo(
      12436.8,
      0,
    );
  });
  it("rejects invalid coordinates", () => {
    for (const point of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: NaN, longitude: 0 },
    ])
      expect(() => haversineMiles(origin, point)).toThrow();
  });
  it("labels ZIP-centroid distances approximate", () =>
    expect(distanceFor(listing(), origin, 25)?.distanceApproximate).toBe(true));
  it("does not mix live origins with fixture venue coordinates", () =>
    expect(
      distanceFor(listing(), { ...origin, dataMode: "live" }, 25)?.section,
    ).toBe("distance_unverified"));
  it("keeps missing addresses and coordinates outside the strict feed", () => {
    for (const l of [
      listing({ address: null }),
      listing({ latitude: null, longitude: null }),
      listing({ geocodingMode: null }),
    ]) {
      expect(distanceFor(l, origin, 25)?.section).toBe("distance_unverified");
      expect(distanceFor(l, origin, 25)?.distanceMiles).toBeNull();
    }
  });
  it("separates online events", () =>
    expect(
      distanceFor(
        listing({
          locationMode: "online",
          latitude: null,
          longitude: null,
          geocodingMode: null,
          address: null,
        }),
        origin,
        25,
      )?.section,
    ).toBe("online"));
});
describe("community evidence dates", () => {
  it("preserves date-only events without invented midnight times", () =>
    expect(
      parseCommunityDate("October 28, 2026", "America/Chicago"),
    ).toMatchObject({ startAt: "2026-10-28", dateStatus: "confirmed" }));
  it("does not guess a missing year or timezone", () => {
    expect(
      parseCommunityDate("Oct 28, 10:00 AM", "America/Chicago").startAt,
    ).toBeNull();
    expect(
      parseCommunityDate("Oct 28, 2026, 10:00 AM", null).startAt,
    ).toBeNull();
  });
  it("flags conflicting source dates", () => {
    expect(
      parseCommunityDate("Oct 28, 2026", "America/Chicago", "Oct 29")
        .dateStatus,
    ).toBe("conflicting");
    expect(
      parseCommunityDate("2026-10-28 or 2026-10-29", "America/Chicago")
        .dateStatus,
    ).toBe("conflicting");
  });
  it("rejects invalid and DST-gap/ambiguous local times", () => {
    for (const value of [
      "2026-02-30",
      "Mar 8, 2026, 2:30 AM",
      "Nov 1, 2026, 1:30 AM",
    ])
      expect(parseCommunityDate(value, "America/Chicago").startAt).toBeNull();
  });
  it("uses actual DST transitions, with no fixed UTC offset", () => {
    expect(
      parseCommunityDate("Mar 8, 2026, 1:30 AM", "America/Chicago").startAt,
    ).toBe("2026-03-08T07:30:00Z");
    expect(
      parseCommunityDate("Mar 8, 2026, 3:30 AM", "America/Chicago").startAt,
    ).toBe("2026-03-08T08:30:00Z");
    expect(
      parseCommunityDate("Nov 2, 2026, 10:00 AM", "America/Chicago").startAt,
    ).toBe("2026-11-02T16:00:00Z");
  });
  it("accepts an explicit offset to disambiguate a fall-back time", () =>
    expect(
      parseCommunityDate("2026-11-01T01:30:00-05:00", "America/Chicago")
        .startAt,
    ).toBe("2026-11-01T06:30:00Z"));
  it("rejects a source timezone abbreviation that conflicts with the venue", () =>
    expect(
      parseCommunityDate("Nov 2, 2026, 10:00 AM CDT", "America/Chicago")
        .dateStatus,
    ).toBe("conflicting"));
  it("filters past and window-boundary events by event-local calendar", () => {
    expect(inCommunityWindow(listing({ startAt: "2026-10-24" }), now, 30)).toBe(
      false,
    );
    expect(inCommunityWindow(listing({ startAt: "2026-11-23" }), now, 30)).toBe(
      true,
    );
    expect(inCommunityWindow(listing({ startAt: "2026-11-24" }), now, 30)).toBe(
      false,
    );
    expect(
      communityDateWindow(
        Date.parse("2026-10-26T02:00:00Z"),
        1,
        "America/Chicago",
      ),
    ).toEqual({ start: "2026-10-25", end: "2026-10-26" });
  });
  it("does not treat opening hours as an event", () =>
    expect(
      parseCommunityDate("Monday-Friday 9 AM-5 PM", "America/Chicago").startAt,
    ).toBeNull());
});
describe("community contracts and private saves", () => {
  it("requires evidence for monetary claims and rejects per-user cache fields", () => {
    expect(() => listing({ costAmount: 10, currency: "USD" })).toThrow();
    expect(
      communityListing.safeParse({ ...listing(), distanceMiles: 1 }).success,
    ).toBe(false);
  });
  it("keeps save relations isolated and imports idempotent", () => {
    const store = new CommunityStore(() => now);
    store.upsert(listing());
    store.upsert(listing());
    store.save("alice", "synthetic-event");
    store.save("alice", "synthetic-event");
    expect(store.saved("alice")).toHaveLength(1);
    expect(store.saved("bob")).toHaveLength(0);
    store.remove("bob", "synthetic-event");
    expect(store.saved("alice")).toHaveLength(1);
    store.forgetAccount("alice");
    expect(store.saved("alice")).toHaveLength(0);
  });
  it("never saves unknown listing IDs and clears expired records", () => {
    let clock = now;
    const store = new CommunityStore(() => clock);
    expect(() => store.save("alice", "missing")).toThrow();
    store.upsert(listing());
    store.save("alice", "synthetic-event");
    clock += 8 * 24 * 60 * 60 * 1000;
    expect(store.saved("alice")).toEqual([]);
  });
  it("documents bounded defaults and rejects precise home addresses", () => {
    expect(
      communityFilters.parse({ location: "Austin, TX", categories: [] }),
    ).toMatchObject({
      radiusMiles: 25,
      dateWindowDays: 30,
      categories: ["health_workshops"],
    });
    expect(
      communityFilters.safeParse({ location: "123 Patient Street" }).success,
    ).toBe(false);
  });
  it("rejects unsafe links", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://localhost/x",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://[::1]/",
      "https://user:pass@example.org/",
    ])
      expect(safeCommunityUrl(url)).toBe(false);
    expect(safeCommunityUrl("https://example.org/events")).toBe(true);
  });
});
