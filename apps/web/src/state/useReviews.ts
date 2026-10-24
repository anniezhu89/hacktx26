import { useCallback, useEffect, useRef, useState } from "react";
import {
  toApiError,
  type ApiClient,
  type ApiError,
  type DataMode,
  type ReviewRequest,
  type ReviewRespond,
  type ReviewerView,
} from "../api/client";
import type { FieldKey } from "../lib/fields";
import { createLatestTracker } from "./guards";
import type { SessionError } from "./useCaseSession";

const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

/**
 * The server has no reading-help routes yet (backend still pending). The
 * v1.1 patient and reviewer read routes are not stubbed by the backend, so
 * they answer NOT_FOUND; the case itself is checked by the case session.
 */
export const isUnavailable = (e: ApiError) =>
  e.code === "NOT_IMPLEMENTED" || e.code === "NOT_FOUND";

/** Patient side: requests for one case. Ignores responses for other cases. */
export function usePatientReviews(api: ApiClient, caseId: string | null) {
  const [reviews, setReviews] = useState<ReviewRequest[] | null>(null);
  const [dataMode, setDataMode] = useState<DataMode | null>(null);
  const [pending, setPending] = useState<"load" | "create" | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const tracker = useRef(createLatestTracker());
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (!caseId) return;
    const token = tracker.current.begin();
    setPending("load");
    setError(null);
    try {
      const r = await api.listCaseReviews(caseId);
      if (!tracker.current.isCurrent(token)) return;
      setReviews(r.data);
      setDataMode(r.dataMode);
    } catch (e) {
      if (isAbort(e) || !tracker.current.isCurrent(token)) return;
      setError({ error: toApiError(e), retry: () => void load() });
    } finally {
      if (tracker.current.isCurrent(token)) setPending(null);
    }
  }, [api, caseId]);

  useEffect(() => {
    tracker.current.invalidate();
    busy.current = false;
    setReviews(null);
    setError(null);
    setPending(null);
    void load();
  }, [load]);

  const create = useCallback(
    async (selectedFields: FieldKey[], expectedRevision: number) => {
      if (!caseId || busy.current) return false;
      busy.current = true;
      const token = tracker.current.begin();
      setPending("create");
      setError(null);
      try {
        await api.createReview(caseId, {
          expectedRevision,
          selectedFields,
          consent: true,
        });
        if (!tracker.current.isCurrent(token)) return false;
        busy.current = false;
        await load();
        return true;
      } catch (e) {
        if (isAbort(e) || !tracker.current.isCurrent(token)) return false;
        const err = toApiError(e);
        setError({
          error: err,
          retry: err.retryable
            ? () => void create(selectedFields, expectedRevision)
            : null,
        });
        setPending(null);
        return false;
      } finally {
        busy.current = false;
      }
    },
    [api, caseId, load],
  );

  return { reviews, dataMode, pending, error, refresh: load, create };
}

export type PatientReviews = ReturnType<typeof usePatientReviews>;

/** Volunteer side: queue plus the one request this volunteer is reading. */
export function useReviewerQueue(api: ApiClient) {
  const [queue, setQueue] = useState<ReviewRequest[] | null>(null);
  const [active, setActive] = useState<ReviewerView | null>(null);
  const [dataMode, setDataMode] = useState<DataMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<"claim" | "open" | "respond" | null>(
    null,
  );
  const [error, setError] = useState<
    (SessionError & { op: "load" | "claim" | "open" | "respond" }) | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Queue refreshes and mutations are tracked separately so a refresh never
  // discards a claim or submission result.
  const loads = useRef(createLatestTracker());
  const ops = useRef(createLatestTracker());
  const busy = useRef(false);

  const run = useCallback(
    async <T>(
      op: "load" | "claim" | "open" | "respond",
      call: () => Promise<T>,
      onSuccess: (value: T) => void,
      retry: () => void,
    ) => {
      const isLoad = op === "load";
      if (!isLoad && busy.current) return false;
      const tracker = isLoad ? loads.current : ops.current;
      const token = tracker.begin();
      if (isLoad) setLoading(true);
      else {
        busy.current = true;
        setPending(op);
      }
      // A refresh clears only its own earlier error, so a claim conflict
      // message survives the queue reload that follows it.
      setError((e) => (isLoad && e && e.op !== "load" ? e : null));
      try {
        const value = await call();
        if (tracker.isCurrent(token)) onSuccess(value);
        return true;
      } catch (e) {
        if (isAbort(e) || !tracker.isCurrent(token)) return false;
        const err = toApiError(e);
        setError({ op, error: err, retry: err.retryable ? retry : null });
        return false;
      } finally {
        if (tracker.isCurrent(token)) {
          if (isLoad) setLoading(false);
          else {
            busy.current = false;
            setPending(null);
          }
        }
      }
    },
    [],
  );

  const load = useCallback(
    () =>
      run(
        "load",
        () => api.listReviewQueue(),
        (r) => {
          setQueue(r.data);
          setDataMode(r.dataMode);
        },
        () => void load(),
      ),
    [api, run],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const claim = useCallback(
    async (id: string) => {
      setNotice(null);
      const ok = await run(
        "claim",
        () => api.claimReview(id),
        (r) => {
          setActive(r.data);
          setDataMode(r.dataMode);
        },
        () => void claim(id),
      );
      if (!ok) void load();
    },
    [api, run, load],
  );

  const open = useCallback(
    (id: string) =>
      run(
        "open",
        () => api.getReviewerView(id),
        (r) => setActive(r.data),
        () => void open(id),
      ),
    [api, run],
  );

  const respond = useCallback(
    async (body: Omit<ReviewRespond, "expectedRevision">) => {
      if (!active) return;
      const view = active;
      const ok = await run(
        "respond",
        () =>
          api.respondToReview(view.review.id, {
            ...body,
            expectedRevision: view.review.caseRevision,
          }),
        () => {
          setActive(null);
          setNotice(
            body.outcome === "submitted"
              ? "Your reading was sent to the patient for their own review."
              : "The patient was asked for a clearer image.",
          );
        },
        () => void respond(body),
      );
      if (ok) void load();
    },
    [active, api, run, load],
  );

  return {
    queue,
    active,
    dataMode,
    loading,
    pending,
    error,
    notice,
    refresh: load,
    claim,
    open,
    respond,
    close: () => setActive(null),
    imageSrc: active ? api.reviewImageSrc(active) : null,
  };
}

export type ReviewerQueue = ReturnType<typeof useReviewerQueue>;
