import { Temporal } from "@js-temporal/polyfill";
import type { CommunityFilters } from "@labelbridge/contracts";
import seed from "../../../../fixtures/community/retrieval.json";
import type { Candidate } from "./normalize";
export function fixtureCandidates(
  filters: CommunityFilters,
  now: number,
): Candidate[] {
  if (!/^(Austin(?:,\s*(?:TX|Texas))?|78701)$/i.test(filters.location))
    return [];
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO("America/Chicago")
    .toPlainDate();
  const records = filters.kind === "event" ? seed.events : seed.resources;
  return records
    .filter((r) =>
      filters.categories.includes(
        r.category as CommunityFilters["categories"][number],
      ),
    )
    .map((r, index) => {
      const event = r as (typeof seed.events)[number];
      return {
        id: `fixture-candidate-${index}`,
        category: r.category as CommunityFilters["categories"][number],
        kind: filters.kind,
        previousDate: null,
        raw: {
          title: r.title,
          description: r.description,
          link: r.url,
          address: event.address,
          venue: { name: event.venue },
          price: event.price,
          date:
            filters.kind === "event"
              ? {
                  when: `${today.add({ days: event.dayOffset }).toString()}${event.time ? ` ${event.time}` : ""}`,
                }
              : undefined,
          ticket_info: /Registration required/.test(r.description)
            ? [{ link: r.url }]
            : [],
        },
      };
    });
}
