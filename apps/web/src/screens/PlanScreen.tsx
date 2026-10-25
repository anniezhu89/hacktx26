import { useState } from "react";
import { Link } from "react-router-dom";
import { medicationTitle, preferenceLabel, PREFERENCE_COPY, taskCategoryLabel, taskStatusLabel } from "../domain/rules";
import type { Budget, Preferences, Transport, Availability } from "../domain/types";
import { useCase } from "../state/CaseContext";
import { Alert, DemoFailureToggle, Page, Pill } from "../components/ui";

export function PlanScreen() {
  const { persona, medCase } = useCase();
  if (persona === "supporter") return <SupporterPlan />;
  if (!medCase) {
    return (
      <Page kicker="Plan" title="A plan needs a case." lede="Start from a fictional label, then come back to share practical tasks.">
        <Link className="lb-btn lb-btn-primary" to="/">
          Go to start
        </Link>
      </Page>
    );
  }
  return <PatientPlan />;
}

function PatientPlan() {
  const { medCase, setPreferences, setSharing, suggestTasks, actOnTask, pending } = useCase();
  const [fail, setFail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"sage" | "rose">("sage");
  if (!medCase) return null;

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences({ ...medCase!.preferences, [key]: value });
  }

  return (
    <Page
      kicker="Plan"
      title="Practical help, not a new prescription."
      lede="Suggestions stay unassigned until someone accepts them. Changing availability refreshes suggestions and leaves accepted tasks alone."
    >
      {message ? (
        <Alert tone={tone} title={tone === "rose" ? "Not changed" : "Plan updated"}>
          <p>{message}</p>
        </Alert>
      ) : null}
      <div className="lb-split-even">
        <section className="lb-card lb-stack">
          <p className="lb-kicker">Patient</p>
          <h2 className="lb-h2">You keep the label</h2>
          <p>Medication name shared if you turn sharing on: {medicationTitle(medCase)}</p>
          <p className="lb-muted">Directions and the label image stay on the patient view.</p>
        </section>
        <section className="lb-card lb-stack">
          <p className="lb-kicker">Supporter</p>
          <h2 className="lb-h2">{medCase.sharingEnabled ? "Can see the plan" : "Cannot see this yet"}</h2>
          <button
            type="button"
            className="lb-btn lb-btn-secondary"
            aria-pressed={medCase.sharingEnabled}
            onClick={() => {
              const text = setSharing(!medCase.sharingEnabled);
              setTone("sage");
              setMessage(text);
            }}
          >
            {medCase.sharingEnabled ? "Stop sharing" : "Share name, preferences, and tasks"}
          </button>
        </section>
      </div>

      <PreferenceFields
        preferences={medCase.preferences}
        onAvailability={(value) => update("availability", value)}
        onTransport={(value) => update("transport", value)}
        onBudget={(value) => update("budget", value)}
      />

      <div className="lb-actions">
        <button
          type="button"
          className="lb-btn lb-btn-primary"
          disabled={pending.plan}
          aria-busy={pending.plan}
          onClick={() => {
            void suggestTasks(fail).then((result) => {
              setTone(result.ok ? "sage" : "rose");
              setMessage(result.message);
            });
          }}
        >
          {pending.plan ? "Preparing…" : medCase.planReady ? "Refresh suggestions" : "Suggest practical tasks"}
        </button>
      </div>
      <DemoFailureToggle checked={fail} onChange={setFail} label="Simulate a failed suggestion on the next try." />
      <TaskList
        onAction={(id, action) => {
          const problem = actOnTask(id, action);
          setTone(problem ? "rose" : "sage");
          setMessage(problem);
        }}
      />
    </Page>
  );
}

function SupporterPlan() {
  const { medCase, actOnTask } = useCase();
  const [message, setMessage] = useState<string | null>(null);
  if (!medCase || !medCase.sharingEnabled) {
    return (
      <Page
        kicker="Supporter"
        title="Nothing has been shared."
        lede="The patient has to turn sharing on. Until then, this view does not show a label, a name, or tasks."
      >
        <Alert tone="amber" title="Waiting on the patient">
          <p>Sharing is an explicit step. Switching to this view does not grant access.</p>
        </Alert>
      </Page>
    );
  }
  return (
    <Page
      kicker="Supporter"
      title="What the patient chose to share."
      lede="You can accept a practical task. You cannot see the label image, the directions, or a price."
    >
      {message ? (
        <Alert tone="rose" title="Not changed">
          <p>{message}</p>
        </Alert>
      ) : null}
      <section className="lb-card lb-stack">
        <h2 className="lb-h2">Medication name</h2>
        <p>{medicationTitle(medCase)}</p>
        <p>Availability: {preferenceLabel("availability", medCase.preferences.availability)}</p>
        <p>Transportation: {preferenceLabel("transport", medCase.preferences.transport)}</p>
        <p>Budget: {preferenceLabel("budget", medCase.preferences.budget)}</p>
      </section>
      <TaskList
        onAction={(id, action) => {
          setMessage(actOnTask(id, action));
        }}
      />
    </Page>
  );
}

function PreferenceFields({
  preferences,
  onAvailability,
  onTransport,
  onBudget,
}: {
  preferences: Preferences;
  onAvailability: (value: Availability) => void;
  onTransport: (value: Transport) => void;
  onBudget: (value: Budget) => void;
}) {
  return (
    <div className="lb-pref-grid">
      <fieldset className="lb-radios lb-card">
        <legend>Availability</legend>
        {PREFERENCE_COPY.availability.map((option) => (
          <label key={option.value} className="lb-radio">
            <input
              type="radio"
              name="availability"
              checked={preferences.availability === option.value}
              onChange={() => onAvailability(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="lb-radios lb-card">
        <legend>Transportation</legend>
        {PREFERENCE_COPY.transport.map((option) => (
          <label key={option.value} className="lb-radio">
            <input
              type="radio"
              name="transport"
              checked={preferences.transport === option.value}
              onChange={() => onTransport(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="lb-radios lb-card">
        <legend>Budget</legend>
        {PREFERENCE_COPY.budget.map((option) => (
          <label key={option.value} className="lb-radio">
            <input type="radio" name="budget" checked={preferences.budget === option.value} onChange={() => onBudget(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function TaskList({ onAction }: { onAction: (id: string, action: "accept" | "complete" | "release") => void }) {
  const { medCase, persona } = useCase();
  if (!medCase) return null;
  const actor = persona === "supporter" ? "supporter" : "patient";
  return (
    <section className="lb-stack" aria-labelledby="tasks-title">
      <h2 id="tasks-title" className="lb-h2">
        Tasks
      </h2>
      {medCase.tasks.length === 0 ? <p className="lb-muted">No tasks yet.</p> : null}
      {medCase.tasks.map((task) => (
        <article key={task.id} className="lb-task">
          <div className="lb-cluster">
            <Pill tone="plain">{taskCategoryLabel(task.category)}</Pill>
            <Pill tone={task.status === "completed" ? "sage" : task.status === "accepted" ? "amber" : "ink"}>
              {taskStatusLabel(task)}
            </Pill>
          </div>
          <p>{task.description}</p>
          <div className="lb-actions">
            {task.status === "proposed" ? (
              <button type="button" className="lb-btn lb-btn-primary" onClick={() => onAction(task.id, "accept")}>
                Accept task
              </button>
            ) : null}
            {task.status === "accepted" && task.owner === actor ? (
              <>
                <button type="button" className="lb-btn lb-btn-secondary" onClick={() => onAction(task.id, "complete")}>
                  Mark complete
                </button>
                <button type="button" className="lb-btn lb-btn-quiet" onClick={() => onAction(task.id, "release")}>
                  Release task
                </button>
              </>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
