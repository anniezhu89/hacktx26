/**
 * Failure taxonomy shared by the provider adapters. Messages are written by
 * the adapter itself, so no provider text, label content or credential can
 * reach a log or an API response through one.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** Credential/request faults: no retry and no other model will help. */
    readonly fatal = false,
  ) {
    super(message);
  }
}

/**
 * Runs `attempt` with one extra try for a transient failure. A fatal failure
 * stops immediately so no second billable call is spent on a request that
 * cannot succeed. Returns null once every attempt has failed.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  onError?: (message: string) => void,
): Promise<T | null> {
  for (let tries = 0; tries < 2; tries++) {
    try {
      return await attempt();
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : undefined;
      onError?.(error instanceof Error ? error.message : "provider failed");
      if (providerError?.fatal || !providerError?.retryable) return null;
      if (tries === 1) return null;
      // Small jittered pause before the single retry.
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    }
  }
  return null;
}
