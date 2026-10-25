export const STEPS = [
  "Add a label",
  "Check the details",
  "Explore support",
] as const;

export function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="progress" aria-label={`Step ${step} of ${STEPS.length}`}>
      {STEPS.map((label, index) => {
        const n = index + 1;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li
            key={label}
            className={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="progress-dot" aria-hidden="true">
              {state === "done" ? "✓" : n}
            </span>
            <span className="progress-label">
              {label}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
