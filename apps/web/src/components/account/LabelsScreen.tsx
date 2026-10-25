import { useCallback, useEffect, useState } from "react";
import type { SavedLabel } from "@labelbridge/contracts";
import { toApiError, type ApiError } from "../../api/client";
import type { WorkspaceClient } from "../../api/workspace";
import { ConfirmDialog, type ConfirmRequest } from "../ConfirmDialog";

const STATUS_TEXT: Record<SavedLabel["status"], string> = {
  ready: "Required details confirmed",
  reviewing: "Needs checking",
  needs_help: "Unknown details",
};

export function LabelsScreen({
  client,
  onAdd,
  onOpen,
}: {
  client: WorkspaceClient;
  onAdd: () => void;
  onOpen: (caseId: string) => void;
}) {
  const [labels, setLabels] = useState<SavedLabel[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<"all" | SavedLabel["status"]>("all");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    setError(null);
    client.savedLabels().then(
      (r) => setLabels(r.data),
      (e) => setError(toApiError(e)),
    );
  }, [client]);
  useEffect(load, [load]);

  const shown = (labels ?? []).filter(
    (l) =>
      (filter === "all" || l.status === filter) &&
      (l.title ?? "").toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <main id="main" tabIndex={-1} className="workspace shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">My labels</span>
          <h1>Saved fictional labels</h1>
          <p>
            Review, revisit or add labels. Only you can confirm your label
            details.
          </p>
        </div>
        <button type="button" className="primary fit" onClick={onAdd}>
          + Add a label
        </button>
      </header>
      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
      {error && (
        <div className="banner banner-error" role="alert">
          <p>{error.message}</p>
          <button type="button" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {labels && labels.length === 0 ? (
        <section className="empty-state workspace-card">
          <div className="empty-art" aria-hidden="true">
            LB
          </div>
          <h2>Your saved labels will appear here</h2>
          <p>
            Add a fictional label, check its details, then choose “Save to My
            labels”. Saved labels are kept for 7 days.
          </p>
          <button type="button" className="primary fit" onClick={onAdd}>
            Add your first label
          </button>
        </section>
      ) : (
        <>
          <div className="filter-row">
            <label>
              Filter labels
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">All statuses</option>
                <option value="reviewing">Needs checking</option>
                <option value="needs_help">Unknown details</option>
                <option value="ready">Required details confirmed</option>
              </select>
            </label>
            <label>
              Search labels
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by confirmed name"
              />
            </label>
          </div>
          {!labels && <p className="hint">Loading your labels…</p>}
          <ul className="label-list" aria-label="Saved labels">
            {shown.map((l) => (
              <li key={l.caseId} className="label-card">
                <div className="label-icon" aria-hidden="true">
                  Rx
                </div>
                <div>
                  <h2>{l.title ?? "Name not confirmed yet"}</h2>
                  <p>
                    Saved {new Date(l.savedAt).toLocaleDateString()} · kept
                    until {new Date(l.expiresAt).toLocaleDateString()} ·{" "}
                    {l.confirmedRequired} of 4 required details confirmed
                  </p>
                  <span
                    className={`pill ${l.status === "ready" ? "" : "peach"}`}
                  >
                    {STATUS_TEXT[l.status]}
                  </span>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onOpen(l.caseId)}
                  >
                    {l.status === "ready" ? "View details" : "Continue review"}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      setConfirm({
                        title: "Delete this label?",
                        body: "Its fields, image, reading-help requests and any sharing are deleted now. This cannot be undone.",
                        confirmLabel: "Delete label",
                        onConfirm: () =>
                          void client.deleteLabel(l.caseId).then(
                            () => {
                              setNotice("Label deleted.");
                              load();
                            },
                            (e) => setError(toApiError(e)),
                          ),
                      })
                    }
                  >
                    Delete<span className="sr-only"> {l.title ?? "label"}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {labels && labels.length > 0 && shown.length === 0 && (
            <p>No labels match this filter.</p>
          )}
        </>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}
