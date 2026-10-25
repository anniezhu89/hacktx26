import { Temporal } from "@js-temporal/polyfill";
import type { CommunityListing } from "@labelbridge/contracts";

type DateResult = Pick<
  CommunityListing,
  "startAt" | "endAt" | "dateStatus" | "timezone"
>;
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
function datesIn(text: string) {
  const dates: string[] = [];
  for (const m of text.matchAll(/\b(\d{4}-\d{2}-\d{2})(?=\b|T)/g))
    dates.push(m[1]);
  for (const m of text.matchAll(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/gi,
  ))
    dates.push(
      `${m[3]}-${String(months.indexOf(m[1].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`,
    );
  return [...new Set(dates)];
}
export function parseCommunityDate(
  text: string | null,
  timezone: string | null,
  secondary: string | null = null,
): DateResult {
  const unresolved: DateResult = {
    startAt: null,
    endAt: null,
    dateStatus: "incomplete",
    timezone,
  };
  if (!text) return unresolved;
  const dates = datesIn(text);
  if (dates.length > 1) return { ...unresolved, dateStatus: "conflicting" };
  if (!dates.length) return unresolved;
  try {
    const date = Temporal.PlainDate.from(dates[0]);
    if (secondary) {
      const other = datesIn(secondary);
      if (other.some((d) => d !== dates[0]))
        return { ...unresolved, dateStatus: "conflicting" };
      const short = /\b([a-z]{3})[a-z]*\s+(\d{1,2})/i.exec(secondary);
      if (
        short &&
        months.includes(short[1].toLowerCase()) &&
        (months.indexOf(short[1].toLowerCase()) + 1 !== date.month ||
          Number(short[2]) !== date.day)
      )
        return { ...unresolved, dateStatus: "conflicting" };
    }
    const iso =
      /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})/.exec(
        text,
      );
    if (iso) {
      const instant = Temporal.Instant.from(iso[0]);
      if (timezone)
        Temporal.ZonedDateTime.from(`${iso[0]}[${timezone}]`, {
          offset: "reject",
        });
      return {
        ...unresolved,
        startAt: instant.toString(),
        dateStatus: "confirmed",
      };
    }
    const time = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(text);
    const time24 = /T(\d{2}):(\d{2})/.exec(text);
    if (!time && !time24)
      return {
        ...unresolved,
        startAt: date.toString(),
        dateStatus: "confirmed",
      };
    if (!timezone) return unresolved;
    let hour = Number(time?.[1] ?? time24?.[1]);
    const minute = Number(time?.[2] ?? time24?.[2] ?? 0);
    if (time) {
      if (hour < 1 || hour > 12) return unresolved;
      hour = (hour % 12) + (time[3].toUpperCase() === "PM" ? 12 : 0);
    }
    const zoned = Temporal.ZonedDateTime.from(
      {
        timeZone: timezone,
        year: date.year,
        month: date.month,
        day: date.day,
        hour,
        minute,
      },
      { disambiguation: "reject", overflow: "reject" },
    );
    if (
      (/\bCDT\b/.test(text) && zoned.offset !== "-05:00") ||
      (/\bCST\b/.test(text) && zoned.offset !== "-06:00")
    )
      return { ...unresolved, dateStatus: "conflicting" };
    return {
      ...unresolved,
      startAt: zoned.toInstant().toString(),
      dateStatus: "confirmed",
    };
  } catch {
    return unresolved;
  }
}
export function communityDateWindow(
  now: number,
  days: number,
  timezone = "America/Chicago",
) {
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(timezone)
    .toPlainDate();
  return { start: today.toString(), end: today.add({ days }).toString() };
}
export function inCommunityWindow(
  listing: CommunityListing,
  now: number,
  days: number,
) {
  if (listing.kind === "ongoing_resource") return true;
  if (!listing.startAt || listing.dateStatus !== "confirmed") return null;
  const zone = listing.timezone ?? "UTC";
  const window = communityDateWindow(now, days, zone);
  if (listing.startAt.length === 10)
    return listing.startAt >= window.start && listing.startAt < window.end;
  try {
    const start = Temporal.Instant.from(listing.startAt);
    const end = Temporal.PlainDate.from(window.end)
      .toZonedDateTime(zone)
      .toInstant();
    return (
      Temporal.Instant.compare(
        start,
        Temporal.Instant.fromEpochMilliseconds(now),
      ) >= 0 && Temporal.Instant.compare(start, end) < 0
    );
  } catch {
    return null;
  }
}
