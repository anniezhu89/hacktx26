import type { SourcePassage } from "@labelbridge/contracts";
import { ProviderError } from "./shared";

type Fetch = typeof fetch;
type SectionKey = "uses" | "side_effects" | "serious_warnings" | "interactions";

const base = "https://dailymed.nlm.nih.gov/dailymed";
const timeoutMs = 15_000;
const maxDocumentBytes = 4 * 1024 * 1024;
const maxPassagesPerSection = 30;
const maxPassageChars = 1500;

/** LOINC section codes used in SPL product labeling. */
export const SECTION_CODES: Record<SectionKey, string[]> = {
  uses: ["34067-9"], // Indications & usage
  side_effects: ["34084-4"], // Adverse reactions
  serious_warnings: ["34066-1", "43685-7", "34071-1", "34070-3"], // Boxed warning, W&P, Warnings, Contraindications
  interactions: ["34073-7"], // Drug interactions
};

export type SplDocument = {
  setId: string;
  version: string;
  title: string;
  effectiveDate: string | null;
  url: string;
  sections: Record<SectionKey, Omit<SourcePassage, "sourceId">[]>;
};

async function get(url: string, fetchImpl: Fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ProviderError(
      `dailymed request failed (${error instanceof Error ? error.name : "unknown"})`,
      true,
    );
  }
  if (!response.ok)
    throw new ProviderError(
      `dailymed ${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  return response;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
/** Plain text only: retrieved markup is never rendered. */
export function textOf(xml: string) {
  return xml
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(
            e[1] === "x" || e[1] === "X"
              ? parseInt(e.slice(2), 16)
              : Number(e.slice(1)),
          )
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** The whole <section> element that owns the code at `index`, nesting-aware. */
function enclosingSection(xml: string, index: number) {
  const start = xml.lastIndexOf("<section", index);
  if (start < 0) return null;
  const tag = /<(\/?)section\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return xml.slice(start, m.index + m[0].length);
  }
  return null;
}

function passagesOf(section: string, idPrefix: string) {
  const sectionTitle = textOf(
    section.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "",
  );
  const blocks = [
    ...section.matchAll(/<(paragraph|item)\b[^>]*>([\s\S]*?)<\/\1>/g),
  ].map((m) => textOf(m[2]));
  const passages: Omit<SourcePassage, "sourceId">[] = [];
  for (const text of blocks) {
    if (text.length < 3 || passages.some((p) => p.text === text)) continue;
    passages.push({
      id: `${idPrefix}:${passages.length + 1}`,
      sectionTitle: sectionTitle || "Labeling section",
      text:
        text.length > maxPassageChars
          ? `${text.slice(0, maxPassageChars).trimEnd()}…`
          : text,
    });
    if (passages.length >= maxPassagesPerSection) break;
  }
  return passages;
}

export function parseSpl(xml: string, setId: string): SplDocument {
  const version = xml.match(/<versionNumber value="(\d+)"/)?.[1] ?? "unknown";
  const effective = xml.match(/<effectiveTime value="(\d{8})/)?.[1];
  const title =
    textOf(xml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "") ||
    "Product labeling";
  const sections = {
    uses: [],
    side_effects: [],
    serious_warnings: [],
    interactions: [],
  } as SplDocument["sections"];
  for (const key of Object.keys(SECTION_CODES) as SectionKey[])
    for (const code of SECTION_CODES[key]) {
      const at = xml.indexOf(`<code code="${code}"`);
      const section = at >= 0 ? enclosingSection(xml, at) : null;
      if (section)
        sections[key].push(
          ...passagesOf(section, `${setId}:${version}:${code}`),
        );
    }
  return {
    setId,
    version,
    title,
    effectiveDate: effective
      ? `${effective.slice(0, 4)}-${effective.slice(4, 6)}-${effective.slice(6, 8)}`
      : null,
    url: `${base}/drugInfo.cfm?setid=${encodeURIComponent(setId)}`,
    sections,
  };
}

/**
 * The most recently published labeling for an RxNorm concept. Many
 * manufacturers label the same formulation; this is one of them.
 */
export async function fetchLabeling(rxcui: string, fetchImpl: Fetch = fetch) {
  const list = (await (
    await get(
      `${base}/services/v2/spls.json?rxcui=${encodeURIComponent(rxcui)}&pagesize=5`,
      fetchImpl,
    )
  ).json()) as {
    data?: {
      setid: string;
      spl_version: number;
      title: string;
      published_date: string;
    }[];
    metadata?: { total_elements?: number };
  };
  const latest = list.data?.[0];
  if (!latest) return null;
  if (!/^[0-9a-f-]{36}$/i.test(latest.setid))
    throw new ProviderError("dailymed returned an unexpected set id", false);
  const response = await get(
    `${base}/services/v2/spls/${latest.setid}.xml`,
    fetchImpl,
  );
  const xml = await response.text();
  if (xml.length > maxDocumentBytes)
    throw new ProviderError("dailymed document too large", false);
  const document = parseSpl(xml, latest.setid);
  // The listing's title names the product and labeler; the document's first
  // <title> is often the "Highlights" heading instead.
  if (latest.title?.trim()) document.title = latest.title.trim();
  return {
    document,
    labelCount: list.metadata?.total_elements ?? list.data!.length,
  };
}
