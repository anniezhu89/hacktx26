import { DATA_MODE_TEXT } from "../lib/dataMode";
import { FIELD_LABELS } from "../lib/fields";
import type { SupporterViewState } from "../state/useSupporterView";
import { ErrorBanner } from "./ErrorBanner";
import { TaskList } from "./TaskList";

const unavailableCode = (code: string) =>
  code === "NOT_IMPLEMENTED" || code === "NOT_FOUND";

export function SupporterView({ view }: { view: SupporterViewState }) {
  const unavailable =
    view.error?.op === "load" && unavailableCode(view.error.error.code);
  return (
    <section aria-labelledby="supporter-heading" className="stack">
      <h2 id="supporter-heading">Shared with you</h2>
      <p className="banner banner-info">
        You see only what the patient chose to share from a fictional label.
        This is a demo view, not a login. Helping with tasks never changes their
        medication or directions.
      </p>
      {view.dataMode && (
        <p className="badge">{DATA_MODE_TEXT[view.dataMode]}</p>
      )}
      <div aria-live="polite">
        {view.notice && <p className="banner banner-ok">{view.notice}</p>}
        {view.loading && view.shared === null && (
          <p className="hint">Loading…</p>
        )}
        {view.shared?.length === 0 && (
          <p>Nothing has been shared with you yet.</p>
        )}
      </div>
      {unavailable ? (
        <p className="banner banner-info">
          The supporter view is not available on this server yet.
        </p>
      ) : (
        view.error && <ErrorBanner error={view.error} retrying={view.loading} />
      )}
      {view.shared?.map((item, index) => {
        const name = item.fields.find((f) => f.key === "medicationName")?.value;
        const title = `Shared label ${index + 1}${name ? `: ${name}` : ""}`;
        return (
          <article
            key={item.caseId}
            className="panel stack-sm"
            aria-labelledby={`shared-${item.caseId}`}
          >
            <h3 id={`shared-${item.caseId}`}>{title}</h3>
            {item.fields.length ? (
              <dl className="compare">
                {item.fields.map((f) => (
                  <div key={f.key}>
                    <dt>{FIELD_LABELS[f.key]}</dt>
                    <dd>
                      {f.value ?? (
                        <strong className="unknown">
                          {f.reviewState === "user_confirmed"
                            ? "Unknown"
                            : "Not shown until the patient confirms it"}
                        </strong>
                      )}{" "}
                      <span className="hint">
                        (
                        {f.reviewState === "user_confirmed"
                          ? "confirmed by the patient"
                          : "not confirmed yet"}
                        )
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="hint">The patient shared tasks only.</p>
            )}
            <h4>Tasks</h4>
            <TaskList
              tasks={item.tasks}
              viewer="supporter"
              busy={view.acting}
              onAction={(t, action) => void view.act(item, t.id, action)}
              label={`Tasks for ${title}`}
            />
          </article>
        );
      })}
      <button
        type="button"
        disabled={view.loading}
        onClick={() => void view.refresh()}
      >
        {view.loading ? "Checking…" : "Check for updates"}
      </button>
    </section>
  );
}
