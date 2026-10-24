import { useState, type FormEvent } from "react";
import { fieldsRevisionOf, type Case } from "@labelbridge/contracts";
import type { ApiClient, ApiError, PlanData } from "../api/client";
import { FIELD_LABELS, FIELD_ORDER, type FieldKey } from "../lib/fields";
import type { CaseSession } from "../state/useCaseSession";
import type { SavingsResult } from "./Savings";
import { TaskList, type TaskAction } from "./TaskList";

const TRANSPORT = [
  "Can drive",
  "Can go by public transit",
  "Cannot help with travel",
];

// Backend routes for sharing, plans and tasks are pending (contract v1.2).
const notImplemented = (e: ApiError) => e.code === "NOT_IMPLEMENTED";

/**
 * Some pending routes answer NOT_FOUND, which also means a missing case. Check
 * the case: if it still loads, the route is missing; otherwise let the case
 * session show that the case is gone.
 */
function unavailableHandler(
  api: ApiClient,
  caseId: string,
  session: CaseSession,
  onUnavailable: () => void,
) {
  return (e: ApiError) => {
    if (notImplemented(e)) {
      onUnavailable();
      return true;
    }
    if (e.code !== "NOT_FOUND") return false;
    api.getCase(caseId).then(onUnavailable, () => void session.reload());
    return true;
  };
}

function SharingForm({
  api,
  caseData,
  session,
  onUnavailable,
}: {
  api: ApiClient;
  caseData: Case;
  session: CaseSession;
  onUnavailable: () => void;
}) {
  const [share, setShare] = useState(caseData.sharing.supporter);
  const [keys, setKeys] = useState<FieldKey[]>(caseData.sharing.fieldKeys);
  const [error, setError] = useState<string | null>(null);
  const busy = session.pending !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (share && !keys.length) {
      setError("Choose at least one part to share, or turn sharing off.");
      return;
    }
    setError(null);
    void session.mutate(
      (c, signal) =>
        api.updateSharing(
          c.id,
          {
            expectedRevision: c.revision,
            supporter: share,
            fieldKeys: share ? keys : [],
          },
          signal,
        ),
      share
        ? `Sharing saved: your supporter can see ${keys.map((k) => FIELD_LABELS[k]).join(", ")}.`
        : "Sharing turned off. Your supporter can no longer see this label in the app.",
      {
        onError: unavailableHandler(api, caseData.id, session, onUnavailable),
      },
    );
  }

  const current = caseData.sharing;
  return (
    <form noValidate onSubmit={submit} className="stack-sm">
      <h4>What your supporter can see</h4>
      <p>
        Now:{" "}
        <strong>
          {current.supporter
            ? `Shared: ${current.fieldKeys.map((k) => FIELD_LABELS[k]).join(", ")}`
            : "Not shared"}
        </strong>
      </p>
      <label className="choice">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
        />
        Share parts of this label with my supporter
      </label>
      {share && (
        <fieldset>
          <legend>Parts to share</legend>
          <div className="choices">
            {FIELD_ORDER.map((key) => (
              <label key={key} className="choice">
                <input
                  type="checkbox"
                  checked={keys.includes(key)}
                  onChange={(e) =>
                    setKeys((k) =>
                      e.target.checked
                        ? [...k, key]
                        : k.filter((x) => x !== key),
                    )
                  }
                />
                {FIELD_LABELS[key]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="hint">
        Turning sharing off stops access in this app. It cannot erase what your
        supporter has already seen. Nothing is sent by email or text message.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        Save sharing
      </button>
    </form>
  );
}

export function SharedSupport({
  api,
  caseData,
  session,
  savings,
}: {
  api: ApiClient;
  caseData: Case;
  session: CaseSession;
  savings: SavingsResult;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const [availability, setAvailability] = useState("");
  const [transport, setTransport] = useState(TRANSPORT[0]);
  const [budget, setBudget] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [plan, setPlan] = useState<{ key: number; data: PlanData } | null>(
    null,
  );
  const [errors, setErrors] = useState<string[]>([]);
  const busy = session.pending !== null;
  const fieldsRevision = fieldsRevisionOf(caseData);
  // Suggestions belong to the fields they were made for.
  const currentPlan = plan?.key === fieldsRevision ? plan.data : null;
  const options = savings.data?.options ?? [];
  const markUnavailable = () => setUnavailable(true);
  const handleUnavailable = unavailableHandler(
    api,
    caseData.id,
    session,
    markUnavailable,
  );
  // A missing task (NOT_FOUND) is a conflict, handled by the case session.
  const handleTaskUnavailable = (e: ApiError) => {
    if (!notImplemented(e)) return false;
    markUnavailable();
    return true;
  };

  function suggest(event: FormEvent) {
    event.preventDefault();
    const found: string[] = [];
    const budgetValue = budget.trim() === "" ? null : Number(budget);
    if (
      budgetValue !== null &&
      !(Number.isFinite(budgetValue) && budgetValue >= 0)
    )
      found.push("Budget must be a number of 0 or more, or left blank.");
    setErrors(found);
    if (found.length) return;
    void session.mutate(
      async (c, signal) => {
        const r = await api.requestPlan(
          c.id,
          {
            expectedRevision: c.revision,
            supporterConstraints: [
              {
                supporterId: "supporter",
                availability: availability.trim(),
                transport,
                budget: budgetValue,
              },
            ],
            selectedOptionIds: chosen.filter((id) =>
              options.some((o) => o.id === id),
            ),
          },
          signal,
        );
        // A superseded request was aborted; do not store its suggestions.
        if (!signal.aborted)
          setPlan({ key: r.data.fieldRevision, data: r.data });
      },
      "Suggestions updated. Tasks someone already accepted were kept.",
      { onError: handleUnavailable },
    );
  }

  function act(taskId: string, action: TaskAction) {
    void session.mutate(
      async (c, signal) => {
        await api.taskAction(
          c.id,
          taskId,
          { expectedRevision: c.revision, action },
          "patient",
          signal,
        );
      },
      action === "claim"
        ? "You accepted the task."
        : action === "complete"
          ? "Task marked done."
          : "Task given back. It is a suggestion again.",
      { taskAction: true, onError: handleTaskUnavailable },
    );
  }

  return (
    <section aria-labelledby="support-heading" className="panel stack-sm">
      <h3 id="support-heading">Shared support</h3>
      <p>
        Plan practical help with a trusted supporter, such as rides, calls and
        paperwork. Nothing here changes your medication or your directions.
      </p>
      {unavailable ? (
        <p className="banner banner-info">
          Shared support is not available on this server yet.
        </p>
      ) : (
        <>
          <SharingForm
            key={`${caseData.sharing.supporter}:${caseData.sharing.fieldKeys.join()}`}
            api={api}
            caseData={caseData}
            session={session}
            onUnavailable={markUnavailable}
          />

          <form noValidate onSubmit={suggest} className="stack-sm">
            <h4>Plan practical help</h4>
            <div className="stack-sm">
              <label htmlFor="support-availability" className="field-label">
                When is your supporter available? (optional)
              </label>
              <input
                id="support-availability"
                type="text"
                maxLength={200}
                value={availability}
                aria-describedby="support-availability-hint"
                onChange={(e) => setAvailability(e.target.value)}
              />
              <p id="support-availability-hint" className="hint">
                For example: weekday evenings.
              </p>
            </div>
            <fieldset>
              <legend>Travel</legend>
              <div className="choices">
                {TRANSPORT.map((t) => (
                  <label key={t} className="choice">
                    <input
                      type="radio"
                      name="support-transport"
                      checked={transport === t}
                      onChange={() => setTransport(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="stack-sm">
              <label htmlFor="support-budget" className="field-label">
                Spending limit in US dollars (optional)
              </label>
              <input
                id="support-budget"
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            {options.length > 0 && (
              <fieldset>
                <legend>Savings results to include</legend>
                <div className="choices">
                  {options.map((o) => (
                    <label key={o.id} className="choice">
                      <input
                        type="checkbox"
                        checked={chosen.includes(o.id)}
                        onChange={(e) =>
                          setChosen((c) =>
                            e.target.checked
                              ? [...c, o.id]
                              : c.filter((x) => x !== o.id),
                          )
                        }
                      />
                      {o.sourceTitle}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {errors.length > 0 && (
              <div className="banner banner-error" role="alert">
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Working…" : "Suggest tasks"}
            </button>
            <p className="hint">
              Suggestions are not commitments. A task belongs to someone only
              after they accept it, and changing these answers never cancels a
              task someone already accepted.
            </p>
          </form>

          {currentPlan && currentPlan.tradeoffs.length > 0 && (
            <div className="stack-sm">
              <h4>Things to weigh</h4>
              <ul>
                {currentPlan.tradeoffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <h4>Tasks</h4>
          <TaskList
            tasks={caseData.tasks}
            viewer="patient"
            busy={busy}
            onAction={(t, action) => act(t.id, action)}
            supporterCutOff={!caseData.sharing.supporter}
          />
        </>
      )}
    </section>
  );
}
