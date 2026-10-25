import { ProviderError } from "./shared";

type Fetch = typeof fetch;
const base = "https://connect.medlineplus.gov/service";
const timeoutMs = 12_000;

export type EducationLink = {
  title: string;
  url: string;
  language: "en" | "es";
};

/**
 * Patient-education links for an RxNorm concept. MedlinePlus Connect permits
 * linking to and displaying its returned data, not copying the linked pages,
 * so only titles and links are kept; the articles are never fetched.
 */
export async function educationLinks(
  rxcui: string,
  language: "en" | "es",
  fetchImpl: Fetch = fetch,
): Promise<EducationLink[]> {
  const params = new URLSearchParams({
    "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.88",
    "mainSearchCriteria.v.c": rxcui,
    knowledgeResponseType: "application/json",
    "informationRecipient.languageCode.c": language,
  });
  let response: Response;
  try {
    response = await fetchImpl(`${base}?${params}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ProviderError(
      `medlineplus request failed (${error instanceof Error ? error.name : "unknown"})`,
      true,
    );
  }
  if (!response.ok)
    throw new ProviderError(
      `medlineplus ${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  const body = (await response.json().catch(() => null)) as {
    feed?: {
      entry?: { title?: { _value?: string }; link?: { href?: string }[] }[];
    };
  } | null;
  const links: EducationLink[] = [];
  for (const entry of body?.feed?.entry ?? []) {
    const href = entry.link?.[0]?.href;
    const title = entry.title?._value?.trim();
    if (!href || !title || !URL.canParse(href)) continue;
    const url = new URL(href);
    // Never link out anywhere but MedlinePlus itself.
    if (url.protocol !== "https:" || url.hostname !== "medlineplus.gov")
      continue;
    links.push({ title, url: url.toString(), language });
    if (links.length >= 4) break;
  }
  return links;
}
