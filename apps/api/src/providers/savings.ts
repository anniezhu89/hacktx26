import { savingsLookup, type SavingsLookup } from "@labelbridge/contracts";
import { identifyGeneric } from "./generic-drugs";
import type { SerpApiConfig } from "./serpapi";
import { ProviderError, withRetry } from "./shared";

const timeoutMs = 25_000;
/** Plan requirement: normalized searches are cached for 15 minutes. */
export const cacheTtlMs = 15 * 60_000;
const maxResults = 8;

export const sourceTitle = "Web search results via SerpApi";

/**
 * Hosts whose results may be surfaced. The plan requires allowlisted sources
 * and forbids following model-generated URLs; nothing here is ever fetched,
 * only linked, and anything off this list is dropped rather than shown.
 *
 * Subdomains match, so "synthroidpro.com" is covered by its own entry but
 * "notsynthroid.com" is not: matching is on a label boundary, not substring.
 */
export const allowedHosts = [
  // Government and nonprofit assistance directories.
  "medicare.gov",
  "medicaid.gov",
  "hhs.gov",
  "nih.gov",
  "fda.gov",
  "cms.gov",
  "needymeds.org",
  "rxassist.org",
  "patientadvocate.org",
  "pparx.org",
  "goodrx.com",
  // Manufacturer programme pages for allowlisted generics.
  "abbvie.com",
  "synthroid.com",
  "synthroidpro.com",
  "unithroid.com",
  "tirosint.com",
  "pfizerforall.com",
  "pfizer.com",
  "lilly.com",
  "lillycares.com",
  "astrazeneca-us.com",
  "sanofi.com",
  "sanofipatientconnection.com",
  "novocare.com",
  "merckhelps.com",
  "bmspaf.org",
];

const hostAllowed = (host: string) =>
  allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );

type RawResult = {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
  source?: unknown;
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Classifies by wording in the source's own text, never by inference. */
function optionType(text: string): "program" | "coupon" | "resource" {
  if (/\b(coupon|savings card|discount card)\b/i.test(text)) return "coupon";
  if (/\b(program|assistance|support|patient access)\b/i.test(text))
    return "program";
  return "resource";
}

const orderingNote =
  "Listed in the order the source returned them, not ranked by value.";
const noPriceNote =
  "No prices are shown. A search result cannot establish what you would actually pay.";
const eligibilityNote =
  "Eligibility was not assessed. Conditions are whatever the linked source states.";

/**
 * Keeps only results that are plainly about the identified medication and
 * come from an allowlisted host.
 *
 * The drug check is the important half. The provider answers a medication
 * that does not exist with a different medication's results, and it also
 * returns generic manufacturer landing pages ("Available Programs") that are
 * about no drug in particular. Neither may become a savings option.
 */
export function selectResults(
  generic: string,
  raw: RawResult[],
): { kept: RawResult[]; droppedOffTopic: number; droppedHost: number } {
  const needle = generic.toLowerCase();
  let droppedOffTopic = 0;
  let droppedHost = 0;
  const kept: RawResult[] = [];
  for (const entry of raw) {
    const link = str(entry.link);
    const title = str(entry.title);
    if (!link || !title) continue;
    let host: string;
    try {
      const parsed = new URL(link);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      host = parsed.hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const text = `${title} ${str(entry.snippet) ?? ""}`.toLowerCase();
    if (!text.includes(needle)) {
      droppedOffTopic++;
      continue;
    }
    if (!hostAllowed(host)) {
      droppedHost++;
      continue;
    }
    kept.push(entry);
  }
  return { kept, droppedOffTopic, droppedHost };
}

function mapResults(
  generic: string | null,
  retrievedAt: string,
  raw: RawResult[],
): SavingsLookup {
  const base = { sourceTitle, retrievedAt };
  if (generic === null)
    return savingsLookup.parse({
      ...base,
      product: null,
      status: "product_not_identified",
      options: [],
      notes: [
        "The medication on this label could not be identified, so no savings information was looked up. Searching an unrecognised name returns results for a different medication, which would be worse than showing nothing.",
      ],
    });
  const selected = selectResults(generic, raw);
  const options = selected.kept.slice(0, maxResults).map((entry, index) => {
    const title = str(entry.title)!;
    const snippet = str(entry.snippet);
    return {
      id: `savings-${index + 1}`,
      sourceTitle: title,
      url: str(entry.link)!,
      retrievedAt,
      matchedProduct: {
        // Every attribute stays null, including the name. These are programme
        // and resource pages: the source states no specific product, so there
        // is nothing to claim. Asserting the generic here was worse than
        // useless — `productMatch` compares exact strings, so "levothyroxine"
        // against a label reading "Levothyroxine Sodium" rendered a false
        // "this is for a different product than your label" warning.
        // Which medication was searched for is carried by `lookup.product`.
        medicationName: null,
        strength: null,
        dosageForm: null,
        quantity: null,
        location: null,
      },
      optionType: optionType(`${title} ${snippet ?? ""}`),
      // Amounts stay null in this increment. A snippet can carry a number
      // without stating which strength, quantity or pharmacy it applies to,
      // and the contract only permits an amount with attributable evidence.
      amount: null,
      currency: null,
      priceBasis: "unknown" as const,
      sourceEvidence: snippet,
      eligibilityNotes: [eligibilityNote],
      missingRequirements: [
        "Whether you qualify",
        "What you would actually pay for this strength and quantity",
      ],
    };
  });
  if (options.length === 0) {
    const notes = [
      "No savings programs from a recognised source mentioned this medication.",
    ];
    if (selected.droppedOffTopic > 0 || selected.droppedHost > 0)
      notes.push(
        `${selected.droppedOffTopic + selected.droppedHost} result(s) were set aside: they were about another medication or came from a source this demo does not list.`,
      );
    return savingsLookup.parse({
      ...base,
      product: generic,
      status: "no_results",
      options: [],
      notes,
    });
  }
  const notes = [orderingNote, noPriceNote];
  if (selected.droppedOffTopic > 0)
    notes.push(
      `${selected.droppedOffTopic} result(s) that did not mention ${generic} were set aside.`,
    );
  return savingsLookup.parse({
    ...base,
    product: generic,
    status: "ok",
    options,
    notes,
  });
}

type Fetch = typeof fetch;

const emptyResultError = /returned? (any|no) results/i;

async function callOnce(
  config: SerpApiConfig,
  generic: string,
  fetchImpl: Fetch,
): Promise<RawResult[]> {
  const target = new URL(config.endpoint);
  target.searchParams.set("engine", "google");
  // The query carries the generic drug name and nothing else. No patient
  // name, prescriber, prescription number, quantity, directions or location
  // is sent: a spike showed adding a location also made results worse.
  target.searchParams.set(
    "q",
    `${generic} prescription savings program patient assistance`,
  );
  target.searchParams.set("hl", "en");
  target.searchParams.set("gl", "us");
  target.searchParams.set("num", "10");
  target.searchParams.set("api_key", config.apiKey);
  let response: Response;
  try {
    response = await fetchImpl(target, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    throw new ProviderError(`savings request failed (${name})`, true);
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const fatal = [400, 401, 403].includes(response.status);
    throw new ProviderError(
      `savings provider ${response.status}`,
      retryable,
      fatal,
    );
  }
  let body: { error?: unknown; organic_results?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new ProviderError("savings provider returned invalid JSON", false);
  }
  const error = str(body.error);
  if (error) {
    if (emptyResultError.test(error)) return [];
    throw new ProviderError("savings provider reported a query error", false);
  }
  // `ai_overview` is deliberately ignored: it is generated text, not a source,
  // and must never become a cited savings option.
  return Array.isArray(body.organic_results)
    ? (body.organic_results as RawResult[])
    : [];
}

type CacheEntry = { at: number; lookup: SavingsLookup };

/**
 * Caches lookups for 15 minutes, keyed on the identified generic alone. The
 * key holds no personal data and nothing that identifies a case.
 */
export class SavingsCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number) {}

  get(generic: string): SavingsLookup | null {
    const entry = this.entries.get(generic);
    if (!entry) return null;
    if (this.now() - entry.at >= cacheTtlMs) {
      this.entries.delete(generic);
      return null;
    }
    return entry.lookup;
  }

  set(generic: string, lookup: SavingsLookup) {
    if (this.entries.size > 500) this.entries.clear();
    this.entries.set(generic, { at: this.now(), lookup });
  }
}

/**
 * Looks up savings programs for a label's medication.
 *
 * Returns the identified generic alongside the lookup so the caller can cache
 * on it. A null generic short-circuits before any search is spent, because an
 * unidentified medication cannot produce a trustworthy answer.
 */
export function identifyFor(medicationName: string | null): string | null {
  return identifyGeneric(medicationName);
}

export async function findSavings(
  config: SerpApiConfig,
  generic: string,
  options: {
    fetchImpl?: Fetch;
    onError?: (message: string) => void;
    now?: () => number;
  } = {},
): Promise<SavingsLookup | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const at = new Date((options.now ?? Date.now)()).toISOString();
  return withRetry(
    async () =>
      mapResults(generic, at, await callOnce(config, generic, fetchImpl)),
    options.onError,
  );
}

/** The explicit state for a medication the demo cannot identify. */
export function notIdentified(now: () => number): SavingsLookup {
  return mapResults(null, new Date(now()).toISOString(), []);
}
