import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import request from "supertest";
import {
  PharmacyCache,
  cacheTtlMs,
  findPharmacies,
  localize,
  serpApiConfig,
  type SerpApiConfig,
} from "../../../apps/api/src/providers/serpapi";
import { createApp, type LogEntry } from "../../../apps/api/src/app";
import {
  pharmaciesResponse,
  pharmacyLookup,
  coarseLocation,
} from "../../../packages/contracts/src/index";

const config: SerpApiConfig = {
  apiKey: "test-key",
  endpoint: "https://search.invalid/search",
};
const now = () => Date.parse("2026-10-24T12:00:00.000Z");

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/**
 * Shaped from a real 2026-10-24 Maps response for ZIP 78751. The third entry
 * is in the adjacent 78705 and is genuinely nearby, so the localization guard
 * must keep it.
 */
const austin = [
  {
    title: "Walgreens",
    address: "4501 Guadalupe St Walgreens, Austin, TX 78751",
    phone: "(000) 555-0101",
    website: "https://example.com/walgreens-fictionalised",
    hours: "Open · Closes 10 PM",
    place_id: "place-1",
    gps_coordinates: { latitude: 30.3110187, longitude: -97.7325283 },
  },
  {
    title: "H-E-B Pharmacy",
    address: "1000 E 41st St, Austin, TX 78751",
    phone: "(000) 555-0102",
    hours: "Closed · Opens 9 AM Sun",
    place_id: "place-2",
    gps_coordinates: { latitude: 30.300556, longitude: -97.719723 },
  },
  {
    title: "38th Street Pharmacy",
    address: "711 W 38th St C3, Austin, TX 78705",
    place_id: "place-3",
    gps_coordinates: { latitude: 30.303975, longitude: -97.741279 },
  },
];

/**
 * The observed silent failure: an unusable location returned HTTP 200,
 * `status: "Success"`, no error field, and real pharmacies hundreds of miles
 * apart in three states.
 */
const scattered = [
  {
    title: "Crown Center Apothecary",
    address: "2450 Grand Blvd, Kansas City, MO 64108",
    place_id: "s-1",
    gps_coordinates: { latitude: 39.0829871, longitude: -94.5827657 },
  },
  {
    title: "Clearwater Pharmacy",
    address: "130 Ross Ave Ste 111, Clearwater, KS 67026",
    place_id: "s-2",
    gps_coordinates: { latitude: 37.5049876, longitude: -97.5048855 },
  },
  {
    title: "Schusterman Center - Pharmacy",
    address: "4444 E 41st St, Tulsa, OK 74135",
    place_id: "s-3",
    gps_coordinates: { latitude: 36.1026522, longitude: -95.9260291 },
  },
];

describe("serpApiConfig", () => {
  it("returns null without a key so the lookup stays in fixture mode", () => {
    expect(serpApiConfig({})).toBeNull();
    expect(serpApiConfig({ SERPAPI_API_KEY: "  " })).toBeNull();
  });

  it("defaults the endpoint and honours an override", () => {
    expect(serpApiConfig({ SERPAPI_API_KEY: "k" })?.endpoint).toBe(
      "https://serpapi.com/search",
    );
    expect(
      serpApiConfig({
        SERPAPI_API_KEY: "k",
        SERPAPI_ENDPOINT: "https://x.test/s",
      })?.endpoint,
    ).toBe("https://x.test/s");
  });
});

describe("the request sent to the search provider", () => {
  it("sends the coarse location and nothing from the label", async () => {
    let sent = "";
    await findPharmacies(config, "78751", {
      now,
      fetchImpl: async (input) => {
        sent = String(input);
        return ok({ local_results: austin });
      },
    });
    const url = new URL(sent);
    expect(url.searchParams.get("engine")).toBe("google_maps");
    expect(url.searchParams.get("type")).toBe("search");
    expect(url.searchParams.get("q")).toBe("pharmacy near 78751");
    expect(url.searchParams.get("api_key")).toBe("test-key");
    // No medication, patient, prescriber or prescription data may appear.
    expect(sent).not.toMatch(/LEVOTHYROXINE SODIUM|JAMIE|7741920|mcg|tablet/i);
  });

  it("never sends coordinates, because none are collected", async () => {
    let sent = "";
    await findPharmacies(config, "Austin, TX", {
      now,
      fetchImpl: async (input) => {
        sent = String(input);
        return ok({ local_results: austin });
      },
    });
    expect(new URL(sent).searchParams.get("ll")).toBeNull();
  });
});

describe("mapping a successful lookup", () => {
  const lookup = async (results: unknown[], location = "78751") =>
    findPharmacies(config, location, {
      now,
      fetchImpl: async () => ok({ local_results: results }),
    });

  it("copies name, address, phone and hours verbatim", async () => {
    const result = await lookup(austin);
    expect(result?.status).toBe("ok");
    expect(result?.results[0]).toMatchObject({
      id: "place-1",
      name: "Walgreens",
      address: "4501 Guadalupe St Walgreens, Austin, TX 78751",
      phone: "(000) 555-0101",
      hoursText: "Open · Closes 10 PM",
      sourceRank: 1,
    });
    // Absent fields stay null rather than being filled in.
    expect(result?.results[2]).toMatchObject({
      phone: null,
      website: null,
      hoursText: null,
    });
  });

  it("declares source ordering and never a distance", async () => {
    const result = await lookup(austin);
    expect(result?.ordering).toBe("source_order");
    // No distance value is carried, and nothing claims proximity ranking.
    for (const entry of result?.results ?? [])
      expect(Object.keys(entry)).not.toContain("distance");
    expect(JSON.stringify(result)).not.toMatch(/closest|nearest|km away/i);
    expect(result?.notes.join(" ")).toMatch(/not by distance/i);
  });

  it("warns that hours may be stale instead of claiming open or closed", async () => {
    const result = await lookup(austin);
    expect(result?.notes.join(" ")).toMatch(/may be out of date/i);
    expect(result).not.toHaveProperty("openNow");
  });

  it("drops a website that is not an ordinary web link", async () => {
    const result = await lookup([
      { ...austin[0], website: "javascript:alert(1)" },
      { ...austin[1], website: "not a url" },
    ]);
    expect(result?.results.map((r) => r.website)).toEqual([null, null]);
  });

  it("skips entries with no name or address and renumbers the ranks", async () => {
    const result = await lookup([
      { ...austin[0], title: "   " },
      austin[1],
      { ...austin[2], address: undefined },
    ]);
    expect(result?.results.map((r) => r.sourceRank)).toEqual([1]);
    expect(result?.results[0].name).toBe("H-E-B Pharmacy");
  });

  it("produces a contract-valid lookup", async () => {
    const result = await lookup(austin);
    expect(() => pharmacyLookup.parse(result)).not.toThrow();
  });
});

describe("the localization guard", () => {
  it("rejects results that do not mention the requested location", () => {
    expect(localize("ZZ00000", scattered)).toBeNull();
  });

  it("keeps a genuinely nearby result in an adjacent ZIP code", () => {
    const result = localize("78751", austin);
    expect(result?.kept).toHaveLength(3);
    expect(result?.dropped).toBe(0);
  });

  it("anchors on a city name as well as a ZIP code", () => {
    expect(localize("Austin, TX", austin)?.kept).toHaveLength(3);
    expect(localize("Austin", austin)?.kept).toHaveLength(3);
  });

  it("drops an out-of-area result that rode along with good ones", () => {
    const result = localize("78751", [...austin, scattered[0]]);
    expect(result?.kept).toHaveLength(3);
    expect(result?.dropped).toBe(1);
  });

  it("reports an unrecognised location instead of unrelated pharmacies", async () => {
    const result = await findPharmacies(config, "Nowhere", {
      now,
      fetchImpl: async () => ok({ local_results: scattered }),
    });
    expect(result?.status).toBe("location_not_recognised");
    expect(result?.results).toEqual([]);
    // None of the misplaced pharmacies may reach the response.
    expect(JSON.stringify(result)).not.toMatch(/Tulsa|Kansas|Clearwater/);
  });

  it("notes how many results were removed", async () => {
    const result = await findPharmacies(config, "78751", {
      now,
      fetchImpl: async () =>
        ok({ local_results: [...austin, scattered[0], scattered[2]] }),
    });
    expect(result?.notes.join(" ")).toMatch(
      /2 results outside the searched area/,
    );
  });
});

describe("empty results and provider failures", () => {
  const failing = async (
    response: () => Promise<Response>,
  ): Promise<{ result: unknown; calls: number; errors: string[] }> => {
    let calls = 0;
    const errors: string[] = [];
    const result = await findPharmacies(config, "78751", {
      now,
      onError: (message) => errors.push(message),
      fetchImpl: async () => {
        calls++;
        return response();
      },
    });
    return { result, calls, errors };
  };

  it("treats an empty result list as an answer, not a failure", async () => {
    const { result } = await failing(async () => ok({ local_results: [] }));
    expect((result as { status: string }).status).toBe("no_results");
    expect((result as { results: unknown[] }).results).toEqual([]);
  });

  it("treats the provider's no-results message as an empty answer", async () => {
    const { result } = await failing(async () =>
      ok({ error: "Google hasn't returned any results for this query." }),
    );
    expect((result as { status: string }).status).toBe("no_results");
  });

  it("treats any other reported error as a provider failure", async () => {
    const { result, errors } = await failing(async () =>
      ok({ error: "Unsupported `engine` parameter" }),
    );
    expect(result).toBeNull();
    // The provider's own wording never reaches a log or a response.
    expect(errors.join(" ")).not.toMatch(/engine parameter/i);
  });

  it("stops immediately on invalid credentials, spending no second search", async () => {
    const { result, calls } = await failing(
      async () => new Response("{}", { status: 401 }),
    );
    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it("retries once on a rate limit, then gives up", async () => {
    const { result, calls } = await failing(
      async () => new Response("{}", { status: 429 }),
    );
    expect(result).toBeNull();
    expect(calls).toBe(2);
  });

  it("gives up on malformed JSON without retrying", async () => {
    const { result, calls } = await failing(
      async () =>
        new Response("<html>gateway</html>", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it("recovers when a transient failure is followed by a success", async () => {
    let calls = 0;
    const result = await findPharmacies(config, "78751", {
      now,
      fetchImpl: async () => {
        calls++;
        return calls === 1
          ? new Response("{}", { status: 503 })
          : ok({ local_results: austin });
      },
    });
    expect(result?.status).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("the fifteen-minute cache", () => {
  it("holds a lookup, expires it, and ignores case and spacing", () => {
    let clock = 0;
    const cache = new PharmacyCache(() => clock);
    const lookup = pharmacyLookup.parse(
      JSON.parse(readFileSync("fixtures/pharmacies.json", "utf8")),
    );
    cache.set("Austin, TX", lookup);
    expect(cache.get("austin,  tx")).not.toBeNull();
    clock += cacheTtlMs - 1;
    expect(cache.get("Austin, TX")).not.toBeNull();
    clock += 1;
    expect(cache.get("Austin, TX")).toBeNull();
  });
});

describe("the coarse location contract", () => {
  it("accepts a ZIP code or a place name", () => {
    for (const value of ["78751", "Austin", "Austin, TX", "San José"])
      expect(coarseLocation.safeParse(value).success).toBe(true);
  });

  it("rejects a street address, so one is never forwarded to the provider", () => {
    for (const value of [
      "1200 Example Pkwy, Springfield, ZZ 00000",
      "48 Sample Row",
      "Apt 4, 12 Example St",
      "78751-1234",
    ])
      expect(coarseLocation.safeParse(value).success).toBe(false);
  });
});

describe("POST /api/cases/:id/pharmacies", () => {
  const setup = (
    fetchImpl?: typeof fetch,
    search: SerpApiConfig | null = config,
    pharmacies = { limit: 50, windowMs: 60_000 },
  ) => {
    const logs: LogEntry[] = [];
    const app = createApp(undefined, {
      now,
      log: (entry) => logs.push(entry),
      search,
      fetchImpl,
      limits: { pharmacies },
    });
    return { app, logs };
  };

  const patientCase = async (app: ReturnType<typeof createApp>) => {
    const agent = request.agent(app);
    await agent.post("/api/session").send({ role: "patient" }).expect(200);
    const created = await agent
      .post("/api/cases")
      .send({
        text: "LEVOTHYROXINE SODIUM 0.05 mg tablet\nTAKE ONE TABLET BY MOUTH TWICE DAILY\nQty: 60",
        fictionalDataAcknowledged: true,
      })
      .expect(201);
    return { agent, id: created.body.data.id as string };
  };

  it("returns a live, contract-valid list", async () => {
    const { app } = setup(async () => ok({ local_results: austin }));
    const { agent, id } = await patientCase(app);
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "78751" });
    expect(res.status).toBe(200);
    const body = pharmaciesResponse.parse(res.body);
    expect(body.dataMode).toBe("live");
    expect(body.data.results).toHaveLength(3);
  });

  it("labels a repeated lookup cached and does not search again", async () => {
    let calls = 0;
    const { app } = setup(async () => {
      calls++;
      return ok({ local_results: austin });
    });
    const { agent, id } = await patientCase(app);
    const body = { location: "78751" };
    await agent.post(`/api/cases/${id}/pharmacies`).send(body).expect(200);
    const second = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send(body)
      .expect(200);
    expect(pharmaciesResponse.parse(second.body).dataMode).toBe("cached");
    expect(calls).toBe(1);
  });

  it("returns 503 when no search provider is configured", async () => {
    const { app } = setup(undefined, null);
    const { agent, id } = await patientCase(app);
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "78751" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("returns 503 rather than a stale list when the provider fails", async () => {
    const { app, logs } = setup(
      async () => new Response("{}", { status: 401 }),
    );
    const { agent, id } = await patientCase(app);
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "78751" });
    expect(res.status).toBe(503);
    const logged = logs.at(-1);
    expect(logged?.providerError).toBe("search provider 401");
    // The requested location is request content and stays out of the log.
    expect(JSON.stringify(logged)).not.toMatch(/78751/);
  });

  it("rejects a street address before any search is made", async () => {
    let calls = 0;
    const { app } = setup(async () => {
      calls++;
      return ok({ local_results: austin });
    });
    const { agent, id } = await patientCase(app);
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "1200 Example Pkwy, Springfield" });
    expect(res.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("still works after the case revision changes", async () => {
    const { app } = setup(async () => ok({ local_results: austin }));
    const { agent, id } = await patientCase(app);
    await agent
      .patch(`/api/cases/${id}/fields`)
      .send({
        expectedRevision: 0,
        changes: [
          { key: "quantity", value: "60", reviewState: "user_confirmed" },
        ],
      })
      .expect(200);
    // The list depends on the location only, so a field edit cannot stale it.
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "78751" });
    expect(res.status).toBe(200);
  });

  it("rejects an unexpected field in the request", async () => {
    const { app } = setup(async () => ok({ local_results: austin }));
    const { agent, id } = await patientCase(app);
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "78751", medicationName: "LEVOTHYROXINE SODIUM" });
    expect(res.status).toBe(400);
  });

  it("requires the owning patient session", async () => {
    const { app } = setup(async () => ok({ local_results: austin }));
    const { id } = await patientCase(app);
    const other = request.agent(app);
    await other.post("/api/session").send({ role: "patient" }).expect(200);
    const res = await other
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "78751" });
    expect(res.status).toBe(403);
  });

  it("passes an unrecognised location through as an explicit state", async () => {
    const { app } = setup(async () => ok({ local_results: scattered }));
    const { agent, id } = await patientCase(app);
    const res = await agent
      .post(`/api/cases/${id}/pharmacies`)
      .send({ location: "Nowhere" })
      .expect(200);
    const body = pharmaciesResponse.parse(res.body);
    expect(body.data.status).toBe("location_not_recognised");
    expect(body.data.results).toEqual([]);
  });

  it("caps repeated searches so credit cannot be drained", async () => {
    const { app } = setup(async () => ok({ local_results: austin }), config, {
      limit: 2,
      windowMs: 60_000,
    });
    const { agent, id } = await patientCase(app);
    // A fresh place each time, so the cache cannot absorb the burst.
    const search = (place: string) =>
      agent.post(`/api/cases/${id}/pharmacies`).send({ location: place });
    expect((await search("Alpha")).status).toBe(200);
    expect((await search("Beta")).status).toBe(200);
    const blocked = await search("Gamma");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });

  it("reports the configured search provider in health", async () => {
    const { app } = setup(async () => ok({ local_results: austin }));
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.data.providers.search).toBe("live");
    const { app: fixtureApp } = setup(undefined, null);
    const fixture = await request(fixtureApp).get("/api/health").expect(200);
    expect(fixture.body.data.providers.search).toBe("fixture");
  });
});
