import { useCallback, useEffect, useState } from "react";
import type { SharedLabel, Task } from "@labelbridge/contracts";
import { toApiError, type ApiError } from "../../api/client";
import type { WorkspaceClient } from "../../api/workspace";
import { FIELD_LABELS } from "../../lib/fields";

const TASK_STATUS: Record<Task["status"], { text: string; tone: string }> = {
  proposed: { text: "Suggested", tone: "peach" },
  accepted: { text: "Accepted", tone: "lavender" },
  completed: { text: "Completed", tone: "" },
  declined: { text: "Declined", tone: "gray" },
  canceled: { text: "Canceled", tone: "gray" },
};

export function SupporterWorkspace({
  client,
  accountId,
}: {
  client: WorkspaceClient;
  accountId: string;
}) {
  const [labels, setLabels] = useState<SharedLabel[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    client.sharedWithMe().then(
      (r) => setLabels(r.data),
      (e) => setError(toApiError(e)),
    );
  }, [client]);
  useEffect(load, [load]);

  async function act(
    label: SharedLabel,
    task: Task,
    action: "claim" | "complete" | "release" | "decline",
  ) {
    setBusy(true);
    setError(null);
    try {
      const r = await client.sharedTask(label.caseId, task.id, {
        expectedRevision: label.revision,
        action,
      });
      setNotice(`Task ${TASK_STATUS[r.data.task.status].text.toLowerCase()}.`);
    } catch (e) {
      const err = toApiError(e);
      // Someone else acted first, or access changed: show the latest state.
      setError(
        err.code === "STATE_CONFLICT" || err.code === "REVISION_CONFLICT"
          ? ({
              ...err,
              message:
                "Someone changed this task first. The list was refreshed.",
            } as ApiError)
          : err,
      );
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <main id="main" tabIndex={-1} className="workspace shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">Separate workspace</span>
          <h1>Supporter workspace</h1>
          <p>Fictional information that people chose to share with you.</p>
        </div>
      </header>
      <p className="alert info">
        <b>Supporters have view-only label access.</b>{" "}
        <span>
          You cannot edit medication fields or confirm anyone's review.
        </span>
      </p>
      <div aria-live="polite">
        {notice && <p className="alert success">{notice}</p>}
        {error && (
          <p className="banner banner-error" role="alert">
            {error.message}
          </p>
        )}
      </div>
      {!labels && !error && <p className="hint">Loading…</p>}
      {labels?.length === 0 && (
        <section className="empty-state workspace-card">
          <span className="pill gray">Nothing shared with you</span>
          <h2>No labels are shared with you right now</h2>
          <p>
            Someone must invite you and then choose a label to share. If access
            was revoked, it no longer appears here.
          </p>
        </section>
      )}
      {labels?.map((l) => (
        <section
          key={`${l.connectionId}-${l.caseId}`}
          className="workspace-card shared-label"
          aria-labelledby={`shared-${l.caseId}`}
        >
          <h2 id={`shared-${l.caseId}`}>Shared by {l.ownerName}</h2>
          {l.fields.length === 0 && (
            <p className="muted">
              No label details are shared; only practical tasks.
            </p>
          )}
          {l.fields.map((f) => (
            <div
              key={f.key}
              className={`read-only-field ${f.value === null ? "unavailable" : ""}`}
            >
              <span>{FIELD_LABELS[f.key]}</span>
              <b>{f.value ?? "Not confirmed by the patient yet"}</b>
            </div>
          ))}
          {l.imageUrl && (
            <img
              className="label-image shared-image"
              src={l.imageUrl}
              alt={`Original fictional label image shared by ${l.ownerName}`}
            />
          )}
          {l.tasksAllowed && (
            <>
              <h3>Practical tasks</h3>
              {l.tasks.length === 0 && <p className="muted">No tasks yet.</p>}
              <ul className="review-list">
                {l.tasks.map((t) => {
                  const mine =
                    t.ownerRole === "supporter" && t.owner === accountId;
                  return (
                    <li key={t.id} className={`review-card task-${t.status}`}>
                      <div className="section-title">
                        <b>{t.description}</b>
                        <span className={`pill ${TASK_STATUS[t.status].tone}`}>
                          {t.status === "accepted" && !mine
                            ? "Accepted by someone else"
                            : TASK_STATUS[t.status].text}
                        </span>
                      </div>
                      <div className="action-row">
                        {t.status === "proposed" && (
                          <>
                            <button
                              type="button"
                              className="primary fit"
                              disabled={busy}
                              onClick={() => void act(l, t, "claim")}
                            >
                              Accept task
                              <span className="sr-only">: {t.description}</span>
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => void act(l, t, "decline")}
                            >
                              Decline
                              <span className="sr-only">: {t.description}</span>
                            </button>
                          </>
                        )}
                        {t.status === "accepted" && mine && (
                          <>
                            <button
                              type="button"
                              className="primary fit"
                              disabled={busy}
                              onClick={() => void act(l, t, "complete")}
                            >
                              Mark completed
                              <span className="sr-only">: {t.description}</span>
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => void act(l, t, "release")}
                            >
                              Hand back
                              <span className="sr-only">: {t.description}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      ))}
    </main>
  );
}
