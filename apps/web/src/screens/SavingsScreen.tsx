import { useState } from "react";
import { formatWhen, getField } from "../domain/rules";
import type { FieldKey, PriceBasis } from "../domain/types";
import { useCase } from "../state/CaseContext";
import { Alert, DemoFailureToggle, Page, Pill } from "../components/ui";

const CHECKS: { key: FieldKey; label: string }[] = [
  { key: "medicationName", label: "Drug" },
  { key: "strength", label: "Strength" },
  { key: "dosageForm", label: "Form" },
  { key: "quantity", label: "Quantity" },
];

function basisCopy(basis: PriceBasis) {
  switch (basis) {
    case "source_listed":
      return "Listed by the source. Not a confirmed charge.";
    case "estimate":
      return "Estimate. Not a pharmacy quote.";
    case "unknown":
      return "No price is shown.";
  }
}

export function SavingsScreen() {
  const { medCase, searchSavings, pending } = useCase();
  const [location, setLocation] = useState("Austin, TX");
  const [copay, setCopay] = useState("");
  const [fail, setFail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!medCase) return null;
  const savings = medCase.savings;

  return (
    <Page
      kicker="Savings"
      title="Resources first. Prices only when the product matches."
      lede="A program link is not a quote. This demo will not rank a different strength, form, or quantity as if it were the same package, and it will not estimate what insurance pays."
    >
      <section className="lb-card lb-stack" aria-labelledby="match-title">
        <h2 id="match-title" className="lb-h2">
          What has to match
        </h2>
        <ul className="lb-checklist">
          {CHECKS.map((item) => {
            const field = getField(medCase, item.key);
            const confirmed = Boolean(field.value) && field.reviewState === "user_confirmed";
            return (
              <li key={item.key}>
                <span>{item.label}</span>
                <span>{field.value || "Blank"}</span>
                <strong>{confirmed ? "Confirmed" : "Not confirmed"}</strong>
              </li>
            );
          })}
          <li>
            <span>Location</span>
            <span>{savings?.location || location || "Blank"}</span>
            <strong>{savings ? "Recorded" : "Not searched yet"}</strong>
          </li>
        </ul>
      </section>

      {error ? (
        <Alert tone="rose" title="Search did not finish">
          <p>{error}</p>
        </Alert>
      ) : null}

      <form
        className="lb-card lb-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void searchSavings(location, copay, fail).then((result) => setError(result.ok ? null : result.message));
        }}
      >
        <h2 className="lb-h2">Search context</h2>
        <label className="lb-field" htmlFor="location">
          City or region
          <input id="location" className="lb-input" value={location} maxLength={80} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label className="lb-field" htmlFor="copay">
          Copay you already know, optional
          <input
            id="copay"
            className="lb-input"
            value={copay}
            maxLength={40}
            onChange={(event) => setCopay(event.target.value)}
            placeholder="Leave blank if you do not have one"
          />
        </label>
        <button type="submit" className="lb-btn lb-btn-primary" disabled={pending.savings} aria-busy={pending.savings}>
          {pending.savings ? "Searching…" : "Search savings resources"}
        </button>
      </form>

      <DemoFailureToggle checked={fail} onChange={setFail} label="Simulate a failed search on the next try." />

      {savings ? (
        <section className="lb-stack" aria-labelledby="results-title">
          <div className="lb-cluster">
            <h2 id="results-title" className="lb-h2">
              Results
            </h2>
            <Pill tone="ink">Fixture</Pill>
          </div>
          <Alert tone="sage" title="How to read this list">
            <p>{savings.summary}</p>
            {savings.copayNote ? <p>{savings.copayNote}</p> : null}
          </Alert>
          {savings.options.map((option) => (
            <article key={option.id} className="lb-card lb-option">
              <div>
                <p className="lb-kicker">{option.optionType === "savings_program" ? "Savings program" : "Assistance program"}</p>
                <h3 className="lb-h2">{option.sourceTitle}</h3>
                <p>{option.eligibilityNotes}</p>
                <p className="lb-muted">{option.matchedProduct}</p>
                <ul>
                  {option.missingRequirements.map((item) => (
                    <li key={item}>Missing: {item}</li>
                  ))}
                </ul>
                <p className="lb-faint">Retrieved {formatWhen(option.retrievedAt)}</p>
                <a href={option.url} target="_blank" rel="noreferrer">
                  Open {option.sourceTitle} in a new tab
                </a>
              </div>
              <div className="lb-price">
                <span className="lb-price-basis">Amount</span>
                <span className="lb-price-amount">{option.amount == null ? "Not listed" : `${option.currency} ${option.amount}`}</span>
                <span>{basisCopy(option.priceBasis)}</span>
              </div>
            </article>
          ))}
          {savings.heldOut.length > 0 ? (
            <div className="lb-stack">
              <h3 className="lb-h2">Not used for comparison</h3>
              {savings.heldOut.map((item) => (
                <article key={item.id} className="lb-card lb-held">
                  <strong>{item.sourceTitle}</strong>
                  <p>{item.reason}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="lb-muted">No search yet. Running one will not invent a dollar amount.</p>
      )}
    </Page>
  );
}
