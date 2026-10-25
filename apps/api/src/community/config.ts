import { COMMUNITY_CATEGORY_LABELS } from "@labelbridge/contracts";
export const defaults = {
  location: "Austin, TX",
  radiusMiles: 25,
  dateWindowDays: 30,
  categories: ["health_workshops" as const],
  freeOnly: false,
  kind: "event" as const,
};
const integer = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  max: number,
) =>
  Math.max(1, Math.min(max, Number.parseInt(env[key] ?? "", 10) || fallback));
export function communityConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: env.COMMUNITY_BOARD_ENABLED === "1",
    mode:
      env.COMMUNITY_DATA_MODE === "live"
        ? ("live" as const)
        : ("fixture" as const),
    serpKey: env.SERPAPI_API_KEY || "",
    metaKey: env.META_API_KEY || "",
    metaModel: env.META_MODEL || "muse-spark-1.3",
    geoKey: env.OPENCAGE_API_KEY || "",
    timeoutMs: integer(env, "COMMUNITY_TIMEOUT_MS", 45000, 60000),
    limits: {
      queries: integer(env, "COMMUNITY_MAX_QUERIES", 3, 3),
      details: integer(env, "COMMUNITY_MAX_DETAILS", 5, 5),
      concurrency: integer(env, "COMMUNITY_CONCURRENCY", 2, 4),
      cacheMinutes: integer(env, "COMMUNITY_CACHE_MINUTES", 60, 1440),
      cooldownSeconds: integer(env, "COMMUNITY_COOLDOWN_SECONDS", 60, 3600),
    },
  };
}
export type CommunityConfig = ReturnType<typeof communityConfig>;
export const queryCategory = {
  ...COMMUNITY_CATEGORY_LABELS,
  health_workshops: "health and wellness workshops",
  accessible_activities: "accessible community social activities",
};
