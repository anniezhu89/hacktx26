import type {
  CommunityCategory,
  CommunityFilters,
} from "@labelbridge/contracts";
import { CommunityHttp, object, string, ProviderFailure } from "./http";
import { queryCategory, type CommunityConfig } from "./config";
import { dateText, type Candidate } from "./normalize";
export class SerpCommunity {
  constructor(
    private config: CommunityConfig,
    private http: CommunityHttp,
  ) {}
  private async search(params: Record<string, string>) {
    if (!this.config.serpKey)
      throw new ProviderFailure("SerpApi is not configured");
    const url = new URL("https://serpapi.com/search.json");
    for (const [key, value] of Object.entries({
      ...params,
      api_key: this.config.serpKey,
      hl: "en",
      gl: "us",
    }))
      url.searchParams.set(key, value);
    const data = object(await this.http.json(url));
    if (
      data.error &&
      data.error !== "Google hasn't returned any results for this query."
    )
      throw new ProviderFailure("SerpApi reported a search error");
    return data;
  }
  async retrieve(filters: CommunityFilters, city: string) {
    const candidates: Candidate[] = [];
    const warnings: string[] = [];
    let queries = 0;
    let successes = 0;
    const categories = filters.categories.slice(0, this.config.limits.queries);
    const run = async (
      category: CommunityCategory,
      kind: "event" | "ongoing_resource",
    ) => {
      queries++;
      try {
        const events = kind === "event";
        const data = await this.search({
          engine: events ? "google_events" : "google",
          q: `${queryCategory[category]} ${events ? "events" : "organizer calendars ongoing resources"} in ${city}`,
          location: city,
        });
        const results = data[events ? "events_results" : "organic_results"];
        if (results !== undefined && !Array.isArray(results))
          throw new ProviderFailure("Search result structure invalid");
        if (
          results === undefined &&
          !data.error &&
          object(data.search_information).organic_results_state !==
            "Fully empty"
        )
          throw new ProviderFailure("Search results missing");
        successes++;
        for (const raw of (Array.isArray(results) ? results : []).slice(0, 8))
          candidates.push({
            id: `candidate-${candidates.length + 1}`,
            category,
            kind,
            raw: object(raw),
            previousDate: null,
          });
      } catch {
        warnings.push(
          `${queryCategory[category]} ${kind === "event" ? "event" : "resource"} search unavailable.`,
        );
      }
    };
    await Promise.all(
      categories.map((category) => run(category, filters.kind)),
    );
    // Fallback resources stay resources. They are never fabricated event occurrences.
    if (
      filters.kind === "event" &&
      candidates.length < 2 &&
      queries < this.config.limits.queries
    ) {
      await run(categories[0], "ongoing_resource");
      warnings.push(
        "Sparse event discovery: any organizer/resource results are available in the Ongoing resources tab.",
      );
    }
    let details = 0;
    await Promise.all(
      candidates
        .filter((c) => c.kind === "event" && string(c.raw.event_token))
        .slice(0, this.config.limits.details)
        .map(async (c) => {
          details++;
          try {
            const result = await this.search({
              engine: "google_event_details",
              event_token: string(c.raw.event_token)!,
            });
            const detail = object(result.event_details);
            if (!string(detail.title))
              throw new ProviderFailure("Event detail missing");
            c.previousDate = dateText(c.raw);
            c.raw = { ...c.raw, ...detail };
          } catch {
            warnings.push(
              "Some event details could not be enriched; discovery evidence was retained.",
            );
          }
        }),
    );
    return {
      candidates,
      warnings: [...new Set(warnings)],
      available: successes > 0,
      queries,
      details,
    };
  }
}
