import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError, type DataMode, type Result } from "../api/client";
import { createLatestTracker } from "./guards";
import type { SessionError } from "./useCaseSession";

const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

/**
 * A result derived from one case revision (explanation, savings). It is shown
 * only while the case is still at that revision: any field change hides it,
 * and responses that arrive for an older revision or another case are dropped.
 */
export function useRevisionResult<T>(caseId: string, revision: number) {
  const key = `${caseId}:${revision}`;
  const [state, setState] = useState<{
    key: string;
    data: T;
    dataMode: DataMode;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<(SessionError & { key: string }) | null>(
    null,
  );
  const tracker = useRef(createLatestTracker());
  const controller = useRef<AbortController | null>(null);
  const currentKey = useRef(key);
  currentKey.current = key;

  // A new revision invalidates in-flight requests for the old one.
  useEffect(() => {
    tracker.current.invalidate();
    controller.current?.abort();
    setPending(false);
  }, [key]);

  const request = useCallback(
    async (
      run: (signal: AbortSignal) => Promise<Result<T>>,
      onError?: (error: ReturnType<typeof toApiError>) => boolean,
    ) => {
      if (pending) return;
      const requestKey = currentKey.current;
      controller.current?.abort();
      controller.current = new AbortController();
      const token = tracker.current.begin();
      setPending(true);
      setError(null);
      try {
        const r = await run(controller.current.signal);
        if (
          !tracker.current.isCurrent(token) ||
          requestKey !== currentKey.current
        )
          return;
        setState({ key: requestKey, data: r.data, dataMode: r.dataMode });
      } catch (e) {
        if (isAbort(e) || !tracker.current.isCurrent(token)) return;
        const err = toApiError(e);
        if (onError?.(err)) return;
        setError({
          key: requestKey,
          error: err,
          retry: err.retryable ? () => void request(run, onError) : null,
        });
      } finally {
        if (tracker.current.isCurrent(token)) setPending(false);
      }
    },
    [pending],
  );

  const fresh = state?.key === key ? state : null;
  return {
    data: fresh?.data ?? null,
    dataMode: fresh?.dataMode ?? null,
    /** A result existed for an earlier revision and was discarded. */
    stale: state !== null && state.key !== key,
    pending,
    error: error?.key === key ? error : null,
    request,
  };
}
