import { describe, it, expect } from "vitest";
import request from "supertest";
import {
  SavingsCache,
  cacheTtlMs,
  findSavings,
  selectResults,
} from "../../../apps/api/src/providers/savings";
import { identifyGeneric } from "../../../apps/api/src/providers/generic-drugs";
import { createApp, type LogEntry } from "../../../apps/api/src/app";
import type { SerpApiConfig } from "../../../apps/api/src/providers/serpapi";
import { savingsResponse } from "../../../packages/contracts/src/index";

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

/** Shaped from a real 2026-10-24 response for the levothyroxine query. */
const organic = [
  {
    title: "Synthroid's Support Programs",
    link: "https://www.synthroid.com/savings",
    snippet:
      "Commercially insured patients may pay as little as $25 a month for levothyroxine sodium. Uninsured patients will pay $39.95 for a 30-day prescription.",
  },
  {
    title: "Save on UNITHROID (levothyroxine sodium)",
    link: "https://unithroid.com/savings-card",
    snippet: "Download Savings Card. Terms and conditions apply.",
  },
  // Real result that mentions no drug: a generic manufacturer landing page.
  {
    title: "Available Programs",
    link: "https://www.abbvie.com/patients/patient-assistance.html",
    snippet: "Programs for eligible patients.",
  },
  // Mentions the drug but comes from a host this demo does not list.
  {
    title: "levothyroxine coupons",
    link: "https://example-coupons.invalid/levothyroxine",
    snippet: "Cheap levothyroxine here.",
  },
];

describe("identifying the medication", () => {
  it("resolves a generic name and a brand alias", () => {
    expect(identifyGeneric("Levothyroxine Sodium")).toBe("levothyroxine");
    expect(identifyGeneric("SYNTHROID 0.05 mg tablet")).toBe("levothyroxine");
    expect(identifyGeneric("Metformin HCl 500 mg")).toBe("metformin");
  });

  it("refuses an invented name rather than guessing a near match", () => {
    // The spike case: searching this returned real levothyroxine prices.
    expect(identifyGeneric("LEVOTHIX")).toBeNull();
    expect(identifyGeneric("LEVOTHIX 0.5 mg tablet")).toBeNull();
    expect(identifyGeneric("Fictional Demo Tablet")).toBeNull();
  });

  it("refuses an empty or missing name", () => {
    expect(identifyGeneric(null)).toBeNull();
    expect(identifyGeneric("   ")).toBeNull();
  });

  it("matches whole words only", () => {
    // "ibuprofen" must not be found inside an unrelated longer token.
    expect(identifyGeneric("superibuprofenol")).toBeNull();
  });
});

describe("selecting results", () => {
  it("drops results that do not mention the medication", () => {
    const selected = selectResults("levothyroxine", organic);
    expect(selected.kept.map((r) => r.title)).toEqual([
      "Synthroid's Support Programs",
      "Save on UNITHROID (levothyroxine sodium)",
    ]);
    expect(selected.droppedOffTopic).toBe(1);
    expect(selected.droppedHost).toBe(1);
  });

  it("drops a non-web link", () => {
    const selected = selectResults("levothyroxine", [
      { title: "x", link: "javascript:alert(1)", snippet: "levothyroxine" },
    ]);
    expect(selected.kept).toHaveLength(0);
  });
});

describe("mapping a savings lookup", () => {
  const lookup = (results: unknown[]) =>
    findSavings(config, "levothyroxine", {
      now,
      fetchImpl: async () => ok({ organic_results: results }),
    });

  it("never produces an amount in this increment", async () => {
    const result = await lookup(organic);
    expect(result?.status).toBe("ok");
    for (const option of result?.options ?? []) {
      expect(option.amount).toBeNull();
      expect(option.currency).toBeNull();
      expect(option.priceBasis).toBe("unknown");
    }
    // A dollar figure in a snippet must not become a price anywhere.
    expect(result?.notes.join(" ")).toMatch(/No prices are shown/i);
  });

  it("keeps the snippet verbatim as evidence", async () => {
    const result = await lookup(organic);
    expect(result?.options[0].sourceEvidence).toBe(organic[0].snippet);
  });

  it("claims only the generic as a matched product", async () => {
    const result = await lookup(organic);
    expect(result?.options[0].matchedProduct).toEqual({
      medicationName: "levothyroxine",
      strength: null,
      dosageForm: null,
      quantity: null,
      location: null,
    });
  });

  it("marks eligibility as unassessed", async () => {
    const result = await lookup(organic);
    expect(result?.options[0].eligibilityNotes.join(" ")).toMatch(
      /not assessed/i,
    );
    expect(result?.options[0].missingRequirements.length).toBeGreaterThan(0);
  });

  it("reports no_results when nothing survives selection", async () => {
    const result = await lookup([organic[2], organic[3]]);
    expect(result?.status).toBe("no_results");
    expect(result?.options).toEqual([]);
    expect(result?.product).toBe("levothyroxine");
  });

  it("treats an empty result list as an answer", async () => {
    const result = await lookup([]);
    expect(result?.status).toBe("no_results");
  });
});

describe("provider failures", () => {
  const failing = async (response: () => Promise<Response>) => {
    let calls = 0;
    const errors: string[] = [];
    const result = await findSavings(config, "levothyroxine", {
      now,
      onError: (m) => errors.push(m),
      fetchImpl: async () => {
        calls++;
        return response();
      },
    });
    return { result, calls, errors };
  };

  it("stops immediately on invalid credentials", async () => {
    const { result, calls } = await failing(
      async () => new Response("{}", { status: 401 }),
    );
    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it("retries once on a rate limit", async () => {
    const { result, calls } = await failing(
      async () => new Response("{}", { status: 429 }),
    );
    expect(result).toBeNull();
    expect(calls).toBe(2);
  });

  it("treats the provider's no-results message as an empty answer", async () => {
    const { result } = await failing(async () =>
      ok({ error: "Google hasn't returned any results for this query." }),
    );
    expect((result as { status: string }).status).toBe("no_results");
  });

  it("keeps provider wording out of the error message", async () => {
    const { result, errors } = await failing(async () =>
      ok({ error: "Unsupported `engine` parameter" }),
    );
    expect(result).toBeNull();
    expect(errors.join(" ")).not.toMatch(/engine parameter/i);
  });
});

describe("the query sent to the provider", () => {
  it("sends the generic only, with no label or patient data", async () => {
    let sent = "";
    await findSavings(config, "levothyroxine", {
      now,
      fetchImpl: async (input) => {
        sent = String(input);
        return ok({ organic_results: organic });
      },
    });
    const url = new URL(sent);
    expect(url.searchParams.get("q")).toBe(
      "levothyroxine prescription savings program patient assistance",
    );
    expect(sent).not.toMatch(/JAMIE|7741920|0\.05|Qty|78751|tablet/i);
  });
});

describe("the fifteen-minute cache", () => {
  it("expires on schedule", async () => {
    let clock = 0;
    const cache = new SavingsCache(() => clock);
    const lookup = await findSavings(config, "levothyroxine", {
      now,
      fetchImpl: async () => ok({ organic_results: organic }),
    });
    cache.set("levothyroxine", lookup!);
    clock += cacheTtlMs - 1;
    expect(cache.get("levothyroxine")).not.toBeNull();
    clock += 1;
    expect(cache.get("levothyroxine")).toBeNull();
  });
});

describe("POST /api/cases/:id/savings-search", () => {
  const setup = (
    fetchImpl?: typeof fetch,
    search: SerpApiConfig | null = config,
  ) => {
    const logs: LogEntry[] = [];
    const app = createApp(undefined, {
      now,
      log: (e) => logs.push(e),
      search,
      fetchImpl,
      limits: { savings: { limit: 50, windowMs: 60_000 } },
    });
    return { app, logs };
  };

  /** Creates a case and confirms its medication name, as the UI requires. */
  const confirmedCase = async (
    app: ReturnType<typeof createApp>,
    medication: string,
  ) => {
    const agent = request.agent(app);
    await agent.post("/api/session").send({ role: "patient" }).expect(200);
    const created = await agent
      .post("/api/cases")
      .send({
        text: `${medication}\n0.05 mg tablet\nQty: 30\nTake one tablet every morning.`,
        fictionalDataAcknowledged: true,
      })
      .expect(201);
    const id = created.body.data.id as string;
    const revision = created.body.data.revision as number;
    const updated = await agent
      .patch(`/api/cases/${id}/fields`)
      .send({
        expectedRevision: revision,
        changes: [
          {
            key: "medicationName",
            value: medication,
            reviewState: "user_confirmed",
          },
        ],
      })
      .expect(200);
    return { agent, id, revision: updated.body.data.revision as number };
  };

  it("returns live programs for an identified medication", async () => {
    const { app } = setup(async () => ok({ organic_results: organic }));
    const { agent, id, revision } = await confirmedCase(app, "Levothyroxine");
    const res = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send({ expectedRevision: revision });
    expect(res.status).toBe(200);
    const body = savingsResponse.parse(res.body);
    expect(body.dataMode).toBe("live");
    expect(body.data.status).toBe("ok");
    expect(body.data.product).toBe("levothyroxine");
    expect(body.data.options).toHaveLength(2);
  });

  it("refuses an unidentified medication without spending a search", async () => {
    let calls = 0;
    const { app } = setup(async () => {
      calls++;
      return ok({ organic_results: organic });
    });
    const { agent, id, revision } = await confirmedCase(app, "LEVOTHIX");
    const res = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send({ expectedRevision: revision })
      .expect(200);
    const body = savingsResponse.parse(res.body);
    expect(body.data.status).toBe("product_not_identified");
    expect(body.data.product).toBeNull();
    expect(body.data.options).toEqual([]);
    expect(calls).toBe(0);
  });

  it("does not search on an unconfirmed medication name", async () => {
    let calls = 0;
    const { app } = setup(async () => {
      calls++;
      return ok({ organic_results: organic });
    });
    const agent = request.agent(app);
    await agent.post("/api/session").send({ role: "patient" }).expect(200);
    const created = await agent
      .post("/api/cases")
      .send({
        text: "Levothyroxine\n0.05 mg tablet\nQty: 30\nTake one every morning.",
        fictionalDataAcknowledged: true,
      })
      .expect(201);
    const res = await agent
      .post(`/api/cases/${created.body.data.id}/savings-search`)
      .send({ expectedRevision: created.body.data.revision })
      .expect(200);
    expect(savingsResponse.parse(res.body).data.status).toBe(
      "product_not_identified",
    );
    expect(calls).toBe(0);
  });

  it("labels a repeated lookup cached and searches once", async () => {
    let calls = 0;
    const { app } = setup(async () => {
      calls++;
      return ok({ organic_results: organic });
    });
    const { agent, id, revision } = await confirmedCase(app, "Levothyroxine");
    const body = { expectedRevision: revision };
    await agent.post(`/api/cases/${id}/savings-search`).send(body).expect(200);
    const second = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send(body)
      .expect(200);
    expect(savingsResponse.parse(second.body).dataMode).toBe("cached");
    expect(calls).toBe(1);
  });

  it("rejects a stale revision", async () => {
    const { app } = setup(async () => ok({ organic_results: organic }));
    const { agent, id } = await confirmedCase(app, "Levothyroxine");
    const res = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send({ expectedRevision: 99 });
    expect(res.status).toBe(409);
  });

  it("rejects a street address as a location", async () => {
    const { app } = setup(async () => ok({ organic_results: organic }));
    const { agent, id, revision } = await confirmedCase(app, "Levothyroxine");
    const res = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send({ expectedRevision: revision, location: "1200 Example Pkwy" });
    expect(res.status).toBe(400);
  });

  it("returns 503 rather than a stale list when the provider fails", async () => {
    const { app, logs } = setup(
      async () => new Response("{}", { status: 401 }),
    );
    const { agent, id, revision } = await confirmedCase(app, "Levothyroxine");
    const res = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send({ expectedRevision: revision });
    expect(res.status).toBe(503);
    expect(logs.at(-1)?.providerError).toBe("savings provider 401");
  });

  it("no longer reports the route as unimplemented", async () => {
    const { app } = setup(async () => ok({ organic_results: organic }));
    const { agent, id, revision } = await confirmedCase(app, "Levothyroxine");
    const res = await agent
      .post(`/api/cases/${id}/savings-search`)
      .send({ expectedRevision: revision });
    expect(res.status).not.toBe(404);
  });
});
