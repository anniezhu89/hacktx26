import { useCallback, useEffect, useRef, useState } from "react";
import {
  toApiError,
  type ApiClient,
  type DataMode,
  type SharedCase,
} from "../api/client";
import type { TaskAction } from "../components/TaskList";
import { createLatestTracker } from "./guards";
import type { SessionError } from "./useCaseSession";

const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

/** Supporter side: what patients shared, and the supporter's task actions. */
export function useSupporterView(api: ApiClient) {
  const [shared, setShared] = useState<SharedCase[] | null>(null);
  const [dataMode, setDataMode] = useState<DataMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<
    (SessionError & { op: "load" | "act" }) | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loads = useRef(createLatestTracker());
  const busy = useRef(false);

  const load = useCallback(async () => {
    const token = loads.current.begin();
    setLoading(true);
    setError((e) => (e?.op === "act" ? e : null));
    try {
      const r = await api.listShared();
      if (!loads.current.isCurrent(token)) return;
      setShared(r.data);
      setDataMode(r.dataMode);
    } catch (e) {
      if (isAbort(e) || !loads.current.isCurrent(token)) return;
      setError({ op: "load", error: toApiError(e), retry: () => void load() });
    } finally {
      if (loads.current.isCurrent(token)) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (item: SharedCase, taskId: string, action: TaskAction) => {
      if (busy.current) return;
      busy.current = true;
      setActing(true);
      setError(null);
      setNotice(null);
      try {
        await api.taskAction(
          item.caseId,
          taskId,
          { expectedRevision: item.revision, action },
          "supporter",
        );
        setNotice(
          action === "claim"
            ? "You accepted the task."
            : action === "complete"
              ? "Task marked done."
              : "Task given back. It is a suggestion again.",
        );
      } catch (e) {
        if (isAbort(e)) return;
        const err = toApiError(e);
        if (err.code === "REVISION_CONFLICT" || err.code === "STATE_CONFLICT")
          setNotice(
            "This changed before your action. The latest version is shown.",
          );
        else if (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")
          setNotice(
            "The patient is no longer sharing this, or it was removed.",
          );
        else
          setError({
            op: "act",
            error: err,
            retry: err.retryable ? () => void act(item, taskId, action) : null,
          });
      } finally {
        busy.current = false;
        setActing(false);
        void load();
      }
    },
    [api, load],
  );

  return {
    shared,
    dataMode,
    loading,
    acting,
    error,
    notice,
    refresh: load,
    act,
  };
}

export type SupporterViewState = ReturnType<typeof useSupporterView>;
