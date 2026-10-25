import { z } from "zod";

export const communityCategory = z.enum([
  "health_workshops",
  "benefits_assistance",
  "volunteering",
  "meals_assistance",
  "accessible_activities",
]);
export const COMMUNITY_CATEGORY_LABELS: Record<
  z.infer<typeof communityCategory>,
  string
> = {
  health_workshops: "Health workshops",
  benefits_assistance: "Insurance and benefits assistance",
  volunteering: "Volunteering",
  meals_assistance: "Community meals and assistance",
  accessible_activities: "Accessible social and recreational activities",
};
export const communityLocation = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine(
    (value) =>
      /^\d{5}$/.test(value) ||
      /^[\p{L} .'-]{2,60}(,\s*[\p{L} .'-]{2,30})?$/u.test(value),
    "Use a city and state or ZIP, never a home address",
  );
export function safeCommunityUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !host.endsWith(".local") &&
      !host.endsWith(".internal") &&
      ![".localhost", ".lan", ".home", ".invalid", ".test"].some((suffix) =>
        host.endsWith(suffix),
      ) &&
      host !== "localhost" &&
      /^[a-z\d.-]+\.[a-z]{2,}$/i.test(host)
    );
  } catch {
    return false;
  }
}
export const communityUrl = z
  .string()
  .url()
  .refine(safeCommunityUrl, "Public HTTP(S) domain required");
const stamp = z.string().datetime({ offset: true });
const dateOrInstant = z.union([stamp, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const mode = z.enum(["live", "cached", "fixture"]);
export const communityPoint = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const communityEvidence = z
  .object({
    field: z.string().min(1),
    excerpt: z.string().min(1).max(10000),
    sourceUrl: communityUrl,
  })
  .strict();
export const communityListing = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["event", "ongoing_resource"]),
    title: z.string().min(1).max(300),
    organizer: z.string().nullable(),
    category: communityCategory,
    description: z.string().max(1500),
    sourceUrl: communityUrl,
    registrationUrl: communityUrl.nullable(),
    sourceEvidence: z.array(communityEvidence).min(1),
    originalDateText: z.string().nullable(),
    startAt: dateOrInstant.nullable(),
    endAt: dateOrInstant.nullable(),
    timezone: z.string().nullable(),
    dateStatus: z.enum([
      "confirmed",
      "incomplete",
      "conflicting",
      "not_applicable",
    ]),
    venueName: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    locationMode: z.enum(["physical", "online", "unknown"]),
    costAmount: z.number().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
    costText: z.string().nullable(),
    eligibilityText: z.string().nullable(),
    languageInfo: z.string().nullable(),
    accessibilityInfo: z.string().nullable(),
    retrievedAt: stamp,
    sourceCheckedAt: stamp.nullable(),
    dataMode: mode,
    warnings: z.array(z.string()),
    enrichmentStatus: z.enum(["source_only", "muse", "unavailable"]),
    geocodingMode: z.enum(["live", "fixture"]).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.latitude === null) !== (value.longitude === null))
      ctx.addIssue({ code: "custom", message: "Coordinates must be a pair" });
    if (
      value.locationMode === "online" &&
      (value.latitude !== null || value.longitude !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Online listings have no venue coordinates",
      });
    if (
      value.kind === "event" &&
      value.dateStatus === "confirmed" &&
      value.startAt === null
    )
      ctx.addIssue({
        code: "custom",
        message: "Confirmed event needs a supported date",
      });
    if (
      value.kind === "ongoing_resource" &&
      (value.dateStatus !== "not_applicable" ||
        value.startAt !== null ||
        value.endAt !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Opening hours are not event dates",
      });
    if (
      value.costAmount !== null &&
      (!value.costText ||
        !value.sourceEvidence.some(
          (e) => e.field === "costText" && e.excerpt.includes(value.costText!),
        ))
    )
      ctx.addIssue({ code: "custom", message: "Cost requires evidence" });
  });
export const communityFilters = z
  .object({
    location: communityLocation,
    radiusMiles: z.number().min(1).max(100).default(25),
    dateWindowDays: z.number().int().min(1).max(90).default(30),
    categories: z
      .array(communityCategory)
      .max(3)
      .default(["health_workshops"])
      .transform((values) => [
        ...new Set(values.length ? values : ["health_workshops" as const]),
      ]),
    freeOnly: z.boolean().default(false),
    kind: z.enum(["event", "ongoing_resource"]).default("event"),
  })
  .strict();
export const communityView = z
  .object({
    listing: communityListing,
    distanceMiles: z.number().nonnegative().nullable(),
    distanceApproximate: z.boolean(),
    section: z.enum([
      "nearby",
      "distance_unverified",
      "online",
      "date_unverified",
    ]),
    matchReasons: z.array(z.string()),
    saved: z.boolean(),
  })
  .strict();
export const communityOrigin = communityPoint.extend({
  label: z.string(),
  accuracy: z.enum(["city_centroid", "zip_centroid"]),
  timezone: z.string().nullable(),
  dataMode: z.enum(["live", "fixture"]),
});
export const communityBoard = z
  .object({
    items: z.array(communityView),
    filters: communityFilters,
    origin: communityOrigin.nullable(),
    status: z.enum(["ok", "empty", "partial", "unavailable"]),
    warnings: z.array(z.string()),
    cache: z
      .object({
        status: z.enum(["fresh", "cached", "stale"]),
        retrievedAt: stamp.nullable(),
        expiresAt: stamp.nullable(),
        refreshAfter: stamp.nullable(),
      })
      .strict(),
    providers: z
      .object({
        retrieval: z.enum(["live", "fixture", "unavailable"]),
        enrichment: z.enum(["live", "fixture", "unavailable"]),
        geocoding: z.enum(["live", "fixture", "unavailable"]),
      })
      .strict(),
  })
  .strict();
const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      contractVersion: z.literal("1"),
      requestId: z.string().min(1),
      dataMode: mode,
      data,
    })
    .strict();
export const communityConfigResponse = envelope(
  z
    .object({
      enabled: z.boolean(),
      mode: z.enum(["live", "fixture"]),
      defaults: communityFilters,
      limits: z
        .object({
          queries: z.number().int(),
          details: z.number().int(),
          concurrency: z.number().int(),
          cacheMinutes: z.number().int(),
          cooldownSeconds: z.number().int(),
        })
        .strict(),
    })
    .strict(),
);
export const communityBoardResponse = envelope(communityBoard);
export const communityListingResponse = envelope(communityView);
export const communitySavedResponse = envelope(z.array(communityView));
export const communitySaveRequest = z
  .object({ listingId: z.string().min(1).max(100) })
  .strict();
export const communityPreferencesRequest = communityFilters;
export const communityPreferencesResponse = envelope(
  z
    .object({
      filters: communityFilters,
      profileLocation: communityLocation.nullable(),
    })
    .strict(),
);
export type CommunityListing = z.infer<typeof communityListing>;
export type CommunityFilters = z.infer<typeof communityFilters>;
export type CommunityCategory = z.infer<typeof communityCategory>;
export type CommunityView = z.infer<typeof communityView>;
export type CommunityBoard = z.infer<typeof communityBoard>;
export type CommunityOrigin = z.infer<typeof communityOrigin>;
