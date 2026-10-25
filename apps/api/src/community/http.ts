/** Only fixed official endpoints are fetched. Public source links are never fetched. */
export class ProviderFailure extends Error {}
export class CommunityHttp {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 45000,
    private concurrency = 2,
    private delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  async json(url: URL, init: RequestInit = {}): Promise<unknown> {
    if (
      ![
        "https://serpapi.com/search.json",
        "https://api.meta.ai/v1/chat/completions",
        "https://api.opencagedata.com/geocode/v1/json",
      ].includes(url.origin + url.pathname)
    )
      throw new ProviderFailure("Provider URL rejected");
    if (this.active >= this.concurrency)
      await new Promise<void>((r) => this.waiting.push(r));
    else this.active++;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await this.fetchImpl(url, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          if (!res.ok) {
            if ((res.status === 429 || res.status >= 500) && !attempt) {
              await this.delay(150 + Math.floor(Math.random() * 150));
              continue;
            }
            throw new ProviderFailure(`Provider HTTP ${res.status}`);
          }
          if (!/application\/json/i.test(res.headers.get("content-type") ?? ""))
            throw new ProviderFailure("Provider content type rejected");
          const reader = res.body?.getReader();
          if (!reader) throw new ProviderFailure("Provider response missing");
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > 1_000_000)
                throw new ProviderFailure("Provider response too large");
              chunks.push(part.value);
            }
          } finally {
            await reader.cancel();
          }
          try {
            return JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            throw new ProviderFailure("Provider JSON invalid");
          }
        } catch (error) {
          if (error instanceof ProviderFailure) throw error;
          if (!attempt) {
            await this.delay(150);
            continue;
          }
          throw new ProviderFailure(
            "Provider request unavailable or timed out",
          );
        }
      }
      throw new ProviderFailure("Provider unavailable");
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function string(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 10000)
    : null;
}
