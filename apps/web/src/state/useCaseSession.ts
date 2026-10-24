import { useCallback, useEffect, useRef, useState } from "react";
import type { Case } from "@labelbridge/contracts";
import {
  toApiError,
  type ApiClient,
  type ApiError,
  type CaseResult,
  type FieldsRequest,
  type IntakeSource,
} from "../api/client";
import type { SampleLabel } from "../samples";
import { createLatestTracker, shouldAcceptCase } from "./guards";

/** What the patient submitted, kept in the browser for side-by-side review. */
export type DisplaySource =
  | { kind: "sample"; sample: SampleLabel }
  | { kind: "image"; previewUrl: string; fileName: string }
  | { kind: "text"; text: string };

export type PendingOp = "create" | "update" | "reload";

export interface SessionError {
  error: ApiError;
  retry: (() => void) | null;
}

const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

export function useCaseSession(api: ApiClient) {
  const [result, setResult] = useState<CaseResult | null>(null);
  const [source, setSource] = useState<DisplaySource | null>(null);
  const [pending, setPending] = useState<PendingOp | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expired, setExpired] = useState<string | null>(null);

  const tracker = useRef(createLatestTracker());
  const controller = useRef<AbortController | null>(null);
  const caseRef = useRef<Case | null>(null);
  const sourceRef = useRef<DisplaySource | null>(null);
  const pendingRef = useRef(false);

  const revokePreview = (s: DisplaySource | null) => {
    if (s?.kind === "image") URL.revokeObjectURL(s.previewUrl);
  };

  useEffect(() => () => revokePreview(sourceRef.current), []);

  const begin = (op: PendingOp) => {
    controller.current?.abort();
    controller.current = new AbortController();
    pendingRef.current = true;
    setPending(op);
    setError(null);
    return {
      token: tracker.current.begin(),
      signal: controller.current.signal,
    };
  };

  const finish = (token: number) => {
    if (!tracker.current.isCurrent(token)) return false;
    pendingRef.current = false;
    setPending(null);
    return true;
  };

  const accept = (next: CaseResult) => {
    if (!shouldAcceptCase(caseRef.current, next.case)) return;
    caseRef.current = next.case;
    setResult(next);
  };

  const clearCase = useCallback(() => {
    tracker.current.invalidate();
    controller.current?.abort();
    pendingRef.current = false;
    revokePreview(sourceRef.current);
    sourceRef.current = null;
    caseRef.current = null;
    setResult(null);
    setSource(null);
    setPending(null);
    setError(null);
    setNotice(null);
  }, []);

  const handleGone = (e: ApiError) => {
    clearCase();
    setExpired(
      e.code === "EXPIRED"
        ? "This demo case expired and its image and fields were cleared. Start again with a fresh sample."
        : "This demo case is no longer available (the demo server may have restarted). Start again with a fresh sample.",
    );
  };

  const create = useCallback(
    async (intake: IntakeSource, sample?: SampleLabel) => {
      if (pendingRef.current) return;
      setExpired(null);
      setNotice(null);
      const { token, signal } = begin("create");
      try {
        const next = await api.createCase(intake, signal);
        if (!finish(token)) return;
        const display: DisplaySource =
          intake.kind === "image"
            ? {
                kind: "image",
                previewUrl: URL.createObjectURL(intake.file),
                fileName: intake.file.name,
              }
            : sample
              ? { kind: "sample", sample }
              : { kind: "text", text: intake.text };
        revokePreview(sourceRef.current);
        sourceRef.current = display;
        caseRef.current = null;
        setSource(display);
        accept(next);
      } catch (e) {
        if (isAbort(e) || !finish(token)) return;
        const err = toApiError(e);
        setError({
          error: err,
          retry: err.retryable ? () => void create(intake, sample) : null,
        });
      }
    },
    [api],
  );

  const reload = useCallback(
    async (conflictMessage?: string) => {
      const current = caseRef.current;
      if (!current) return;
      const { token, signal } = begin("reload");
      try {
        const next = await api.getCase(current.id, signal);
        if (!finish(token)) return;
        // A reload after a conflict must replace state even at equal revision.
        caseRef.current = null;
        accept(next);
        if (conflictMessage)
          setNotice(
            `${conflictMessage} You are now viewing version ${next.case.revision}. Check the field and try your change again.`,
          );
      } catch (e) {
        if (isAbort(e) || !finish(token)) return;
        const err = toApiError(e);
        if (err.code === "EXPIRED" || err.code === "NOT_FOUND")
          return handleGone(err);
        setError({ error: err, retry: () => void reload(conflictMessage) });
      }
    },
    [api],
  );

  const updateFields = useCallback(
    async (changes: FieldsRequest["changes"], description: string) => {
      const current = caseRef.current;
      if (!current || pendingRef.current) return;
      setNotice(null);
      const { token, signal } = begin("update");
      try {
        const next = await api.updateFields(
          current.id,
          { expectedRevision: current.revision, changes },
          signal,
        );
        if (!finish(token)) return;
        accept(next);
        setNotice(description);
      } catch (e) {
        if (isAbort(e) || !finish(token)) return;
        const err = toApiError(e);
        if (err.code === "REVISION_CONFLICT")
          return void reload("This label changed after you opened it.");
        if (err.code === "EXPIRED" || err.code === "NOT_FOUND")
          return handleGone(err);
        setError({
          error: err,
          retry: err.retryable
            ? () => void updateFields(changes, description)
            : null,
        });
      }
    },
    [api, reload],
  );

  const startOver = useCallback(() => {
    clearCase();
    setExpired(null);
  }, [clearCase]);

  return {
    result,
    source,
    pending,
    error,
    notice,
    expired,
    create,
    updateFields,
    reload,
    startOver,
    dismissError: () => setError(null),
  };
}

export type CaseSession = ReturnType<typeof useCaseSession>;
