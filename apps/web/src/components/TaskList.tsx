import type { Task, TaskActor } from "../api/client";

const CATEGORY: Record<Task["category"], string> = {
  research: "Look into",
  call_pharmacy: "Call the pharmacy",
  transport: "Travel",
  review_label: "Label help",
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function ownerText(task: Task, viewer: TaskActor) {
  if (task.ownerRole === viewer) return "you";
  if (task.ownerRole === "supporter") return "your supporter";
  if (task.ownerRole === "patient") return "the patient";
  return "someone";
}

export function statusText(task: Task, viewer: TaskActor) {
  if (task.status === "proposed")
    return "Suggested. Nobody has accepted it yet.";
  const who = ownerText(task, viewer);
  const when = task.acceptedAt ? ` at ${time(task.acceptedAt)}` : "";
  return task.status === "accepted"
    ? `Accepted by ${who}${when}.`
    : `Done. Accepted by ${who}${when}.`;
}

export type TaskAction = "claim" | "complete" | "release";

export function TaskList({
  tasks,
  viewer,
  busy,
  onAction,
}: {
  tasks: Task[];
  viewer: TaskActor;
  busy: boolean;
  onAction: (task: Task, action: TaskAction) => void;
}) {
  if (!tasks.length) return <p className="hint">No tasks yet.</p>;
  return (
    <ul className="review-list" aria-label="Tasks">
      {tasks.map((t) => {
        const mine = t.ownerRole === viewer;
        const name = <span className="sr-only">: {t.description}</span>;
        return (
          <li key={t.id} className={`review-card task-${t.status}`}>
            <p className="meta">{CATEGORY[t.category]}</p>
            <h5>{t.description}</h5>
            <p className="state-text">{statusText(t, viewer)}</p>
            <div className="actions">
              {t.status === "proposed" && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => onAction(t, "claim")}
                >
                  I&apos;ll do this{name}
                </button>
              )}
              {t.status === "accepted" && mine && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(t, "complete")}
                  >
                    Mark done{name}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(t, "release")}
                  >
                    Give it back{name}
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
