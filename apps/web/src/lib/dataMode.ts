import type { DataMode } from "../api/client";

export const DATA_MODE_TEXT: Record<DataMode, string> = {
  fixture: "Fixture data: built-in fictional examples, not a live reading",
  cached: "Cached data: saved from an earlier request",
  live: "Live data",
};
