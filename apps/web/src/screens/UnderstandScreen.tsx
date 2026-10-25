import { useState } from "react";
import { Link } from "react-router-dom";
import { blockersForExplanation, formatWhen, getField } from "../domain/rules";
import { useCase } from "../state/CaseContext";
import { QuestionPanel } from "../components/QuestionPanel";
import { Alert, DemoFailureToggle, Page, Pill } from "../components/ui";

export function UnderstandScreen() {
  const { medCase, explain, pending } = useCase();
  const [fail, setFail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!medCase) return null;
  const blockers = blockersForExplanation(medCase);
  const directions = getField(medCase, "directions").value;

  return (
    <Page
      kicker="Understand"
      title="The label’s words, then a plainer reading."
      lede="Plain language stays beside the original directions. It is a reading aid. It does not change the prescription, add clock times, or decide that a dose is right for you."
    >
      {blockers.length > 0 ? (
        <Alert tone="amber" title="A dosing explanation stays off">
          <ul>
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p>
            You can still write pharmacist questions or <Link to="/review">go back to the label</Link>.
          </p>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="rose" title="Reading not created">
          <p>{error}</p>
        </Alert>
      ) : null}

      <div className="lb-split-even">
        <section className="lb-card lb-stack" aria-labelledby="original-title">
          <p className="lb-kicker">On the label</p>
          <h2 id="original-title" className="lb-h2">
            Original directions
          </h2>
          <blockquote className="lb-quote">{directions || "No directions have been entered."}</blockquote>
        </section>
        <section className="lb-card lb-stack" aria-labelledby="plain-title">
          <div className="lb-cluster">
            <p className="lb-kicker">Plain language</p>
            {medCase.explanation ? <Pill tone="ink">Fixture</Pill> : null}
          </div>
          <h2 id="plain-title" className="lb-h2">
            What those words say
          </h2>
          {medCase.explanation ? (
            <>
              <p className="lb-quote">{medCase.explanation.simplifiedText}</p>
              <p className="lb-faint">
                Based on field revision {medCase.explanation.fieldRevision}. Not medical advice.
              </p>
              {medCase.explanation.references.length === 0 ? (
                <p>No reference page is attached because this medication name is outside the sample set.</p>
              ) : (
                medCase.explanation.references.map((reference) => (
                  <div key={reference.url} className="lb-ref">
                    <strong>{reference.title}</strong>
                    <p>{reference.passage}</p>
                    <a href={reference.url} target="_blank" rel="noreferrer">
                      Open {reference.title} in a new tab
                    </a>
                  </div>
                ))
              )}
            </>
          ) : (
            <p className="lb-muted">
              {blockers.length > 0
                ? "The plain-language column stays empty while a critical field is unconfirmed, unreadable, or unclear."
                : "No reading yet. Prepare one from the confirmed directions."}
            </p>
          )}
        </section>
      </div>

      {blockers.length === 0 ? (
        <>
          <button
            type="button"
            className="lb-btn lb-btn-primary"
            disabled={pending.explain}
            aria-busy={pending.explain}
            onClick={() => {
              void explain(fail).then((result) => setError(result.ok ? null : result.message));
            }}
          >
            {pending.explain ? "Preparing…" : "Prepare plain language"}
          </button>
          <DemoFailureToggle
            checked={fail}
            onChange={setFail}
            label="Simulate a failed reading on the next try."
          />
        </>
      ) : null}

      {medCase.explanation ? (
        <p className="lb-faint">Prepared for this session. Data mode: fixture. {formatWhen(medCase.createdAt)} case start.</p>
      ) : null}

      <QuestionPanel />
    </Page>
  );
}
