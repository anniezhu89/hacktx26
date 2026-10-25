import {
  communityBoardResponse,
  communityConfigResponse,
  communityPreferencesResponse,
  communitySavedResponse,
  type CommunityFilters,
} from "@labelbridge/contracts";
import { parseEnvelope, toApiError } from "../api/client";
async function send(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  try {
    return await fetch("/api/community/" + path, {
      method,
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw toApiError(e);
  }
}
export const communityClient = {
  config: async (signal?: AbortSignal) =>
    (
      await parseEnvelope(
        await send("config", "GET", undefined, signal),
        communityConfigResponse,
      )
    ).data.data,
  search: async (filters: CommunityFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(filters)
          .filter(([k]) => k !== "categories")
          .map(([k, v]) => [k, String(v)]),
      ),
      categories: filters.categories.join(","),
    });
    return (
      await parseEnvelope(
        await send("listings?" + query, "GET", undefined, signal),
        communityBoardResponse,
      )
    ).data.data;
  },
  refresh: async (filters: CommunityFilters, signal?: AbortSignal) =>
    (
      await parseEnvelope(
        await send("refresh", "POST", filters, signal),
        communityBoardResponse,
      )
    ).data.data,
  saved: async (signal?: AbortSignal) =>
    (
      await parseEnvelope(
        await send("saved", "GET", undefined, signal),
        communitySavedResponse,
      )
    ).data.data,
  save: async (id: string, remove = false) =>
    (
      await parseEnvelope(
        await send(
          remove ? `saved/${encodeURIComponent(id)}` : "saved",
          remove ? "DELETE" : "POST",
          remove ? undefined : { listingId: id },
        ),
        communitySavedResponse,
      )
    ).data.data,
  preferences: async (signal?: AbortSignal) =>
    (
      await parseEnvelope(
        await send("preferences", "GET", undefined, signal),
        communityPreferencesResponse,
      )
    ).data.data,
  saveDefaults: async (filters: CommunityFilters) =>
    (
      await parseEnvelope(
        await send("preferences", "PUT", filters),
        communityPreferencesResponse,
      )
    ).data.data,
};
