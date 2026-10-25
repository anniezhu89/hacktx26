import { createHash } from "node:crypto";
import {
  communityListing,
  safeCommunityUrl,
  type CommunityCategory,
  type CommunityListing,
} from "@labelbridge/contracts";
import { parseCommunityDate } from "./dates";
import { object, string } from "./http";
export type Candidate = {
  id: string;
  category: CommunityCategory;
  kind: CommunityListing["kind"];
  raw: Record<string, unknown>;
  previousDate: string | null;
};
export const dateText = (raw: Record<string, unknown>) =>
  string(object(raw.date).when) ?? string(raw.date);
export function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.toString().replace(/\/$/, "");
}
export function publicUrl(value: unknown) {
  const v = string(value);
  if (
    !v ||
    !safeCommunityUrl(v) ||
    /(^|\.)serpapi\.com$/i.test(new URL(v).hostname)
  )
    return null;
  return canonicalUrl(v);
}
export function normalize(
  candidate: Candidate,
  now: number,
  mode: "live" | "fixture",
  timezone: string | null,
): CommunityListing | null {
  const raw = candidate.raw;
  const tickets = Array.isArray(raw.ticket_info)
    ? raw.ticket_info.map(object)
    : [];
  const registrationUrl =
    tickets.map((t) => publicUrl(t.link)).find(Boolean) ?? null;
  const sourceUrl =
    publicUrl(raw.description_source) ?? publicUrl(raw.link) ?? registrationUrl;
  const title = string(raw.title)?.slice(0, 300);
  if (!sourceUrl || !title) return null;
  const address = Array.isArray(raw.address)
    ? raw.address.map(string).filter(Boolean).join(", ") || null
    : string(raw.address);
  const originalDateText = dateText(raw);
  const description = (
    string(raw.description) ??
    string(raw.snippet) ??
    string(raw.type) ??
    title
  ).slice(0, 1500);
  const costText = string(raw.price);
  let costAmount: number | null = null;
  let currency: string | null = null;
  if (
    costText &&
    /^(free(?: admission| entry)?|no charge|\$0(?:\.00)?|USD\s*0(?:\.00)?)\.?$/i.test(
      costText,
    )
  )
    costAmount = 0;
  const price = costText && /^USD\s*(\d+(?:\.\d{1,2})?)$/i.exec(costText);
  if (price) {
    costAmount = Number(price[1]);
    currency = "USD";
  }
  const marked = (prefix: string) =>
    new RegExp(`(?:^|[.!?]\\s+)${prefix}:\\s*([^.!?]+[.!?]?)`, "i")
      .exec(description)?.[1]
      ?.trim() ?? null;
  const organizer =
    string(object(raw.organizer).name) ??
    string(raw.organizer) ??
    marked("Organizer");
  const eligibilityText = marked("Eligibility");
  const languageInfo = marked("Languages?");
  const accessibilityInfo = marked("Accessibility");
  const sourceEvidence = Object.entries({
    organizer,
    eligibilityText,
    languageInfo,
    accessibilityInfo,
    title,
    description,
    address,
    originalDateText,
    costText,
    registrationUrl,
    venueName: string(object(raw.venue).name),
  }).flatMap(([field, excerpt]) =>
    excerpt ? [{ field, excerpt, sourceUrl }] : [],
  );
  const dates =
    candidate.kind === "ongoing_resource"
      ? {
          startAt: null,
          endAt: null,
          timezone: null,
          dateStatus: "not_applicable" as const,
        }
      : parseCommunityDate(originalDateText, timezone, candidate.previousDate);
  const parsed = communityListing.safeParse({
    id: candidate.id,
    kind: candidate.kind,
    title,
    organizer,
    category: candidate.category,
    description,
    sourceUrl,
    registrationUrl,
    sourceEvidence,
    originalDateText,
    ...dates,
    venueName: string(object(raw.venue).name),
    address,
    latitude: null,
    longitude: null,
    locationMode:
      address && /^(online(?: event)?|virtual(?: event)?)$/i.test(address)
        ? "online"
        : address
          ? "physical"
          : "unknown",
    costAmount,
    currency,
    costText,
    eligibilityText,
    languageInfo,
    accessibilityInfo,
    retrievedAt: new Date(now).toISOString(),
    sourceCheckedAt: null,
    dataMode: mode,
    warnings: [
      "Search discovery evidence; organizer availability has not been checked.",
    ],
    enrichmentStatus: "source_only",
    geocodingMode: null,
  });
  return parsed.success ? parsed.data : null;
}
const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function deduplicate(listings: CommunityListing[]) {
  const found = new Map<string, CommunityListing>();
  for (const item of listings) {
    const key = [
      clean(item.title),
      clean(item.organizer ?? item.venueName ?? item.address ?? ""),
      item.startAt ?? item.originalDateText ?? "",
      canonicalUrl(item.sourceUrl),
    ].join("|");
    const prior = found.get(key);
    if (prior) {
      prior.sourceEvidence = [
        ...new Map(
          [...prior.sourceEvidence, ...item.sourceEvidence].map((e) => [
            JSON.stringify(e),
            e,
          ]),
        ).values(),
      ];
      continue;
    }
    found.set(key, {
      ...item,
      id:
        "community-" +
        createHash("sha256").update(key).digest("hex").slice(0, 24),
    });
  }
  return [...found.values()];
}
