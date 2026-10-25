import type { DataMode } from "../api/client";
export const DATA_MODE_TEXT: Record<DataMode, string> = {
  fixture: "Local result — no live provider response",
  cached: "Cached data: saved from an earlier request",
  live: "Live data",
};
export const DATA_MODE_LABEL: Record<DataMode | "unavailable", string> = {
  fixture: "Simulated",
  cached: "Cached",
  live: "Live",
  unavailable: "Unavailable",
};
