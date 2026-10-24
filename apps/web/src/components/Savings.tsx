import { useState, type FormEvent } from "react";
import { eligibleForExplanation, type Case } from "@labelbridge/contracts";
import type { ApiClient, SavingsData } from "../api/client";
import { DATA_MODE_TEXT } from "../lib/dataMode";
import { FIELD_LABELS } from "../lib/fields";
import { priceView, type SavingsOption } from "../lib/understand";
import type { CaseSession } from "../state/useCaseSession";
import { useRevisionResult } from "../state/useRevisionResult";
import { ErrorBanner } from "./ErrorBanner";

const OPTION_TYPE: Record<SavingsOption["optionType"], string> = {
  program: "Savings program",
  coupon: "Coupon",
  price: "Listed price",
  resource: "Help resource",
};

const BASIS: Record<SavingsOption["priceBasis"], string> = {
  source_listed: "Price listed by the source",
  estimate: "Estimate from the source",
  unknown: "No price available",
};

const MATCH_TEXT = {
  match: "matches",
  mismatch: "does not match",
  unknown: "unknown",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function OptionCard({
  option,
  fields,
}: {
  option: SavingsOption;
  fields: Case["fields"];
}) {
  const view = priceView(option, fields);
  const match = view.match;
  return (
    <li className="review-card">
      <h5>{option.sourceTitle}</h5>
      <p className="meta">
        {OPTION_TYPE[option.optionType]} · Retrieved {when(option.retrievedAt)}
      </p>
      {view.kind === "other-product" ? (
        <p>
          Price not shown: it is for a different product (the strength, form or
          quantity differs from your label).
        </p>
      ) : view.kind === "price" ? (
        <p>
          <strong>{view.price}</strong> —{" "}
          {BASIS[option.priceBasis].toLowerCase()}. Not a pharmacy-confirmed
          price.
          {!view.comparable &&
            " Some product details could not be checked, so do not compare this price."}
        </p>
      ) : (
        <p>{BASIS.unknown}.</p>
      )}
      {option.sourceEvidence && !match.mismatch && (
        <blockquote className="excerpt-text">
          {option.sourceEvidence}
        </blockquote>
      )}
      {match.mismatch && (
        <p className="banner banner-blocked">
          This is for a different product than your label.
        </p>
      )}
      <details>
        <summary>Product details checked</summary>
        <ul>
          {match.attributes.map((a) => (
            <li key={a.key}>
              {FIELD_LABELS[a.key]}: {MATCH_TEXT[a.state]}
              {a.theirs !== null && ` (source: ${a.theirs})`}
            </li>
          ))}
        </ul>
      </details>
      {option.eligibilityNotes.length > 0 && (
        <>
          <p className="evidence-label">Eligibility</p>
          <ul>
            {option.eligibilityNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
      {option.missingRequirements.length > 0 && (
        <>
          <p className="evidence-label">Still unknown</p>
          <ul>
            {option.missingRequirements.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
      <a href={option.url} target="_blank" rel="noopener noreferrer">
        Open source<span className="sr-only">: {option.sourceTitle}</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}

export type SavingsResult = ReturnType<typeof useRevisionResult<SavingsData>>;

export function Savings({
  api,
  caseData,
  session,
  result,
}: {
  api: ApiClient;
  caseData: Case;
  session: CaseSession;
  /** Owned by the review screen so the support plan can use chosen options. */
  result: SavingsResult;
}) {
  const [location, setLocation] = useState("");
  const [copay, setCopay] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const eligible = eligibleForExplanation(caseData.fields);
  const quantity = caseData.fields.find((f) => f.key === "quantity");
  const quantityConfirmed =
    quantity?.reviewState === "user_confirmed" && !!quantity.value?.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    const found: string[] = [];
    const place = location.trim();
    if (!place) found.push("Enter a city or ZIP code.");
    const copayValue = copay.trim() === "" ? undefined : Number(copay);
    if (
      copayValue !== undefined &&
      !(Number.isFinite(copayValue) && copayValue >= 0)
    )
      found.push("Copay must be a number of 0 or more, or left blank.");
    setErrors(found);
    if (found.length) return;
    void result.request(
      (signal) =>
        api.searchSavings(
          caseData.id,
          {
            expectedRevision: caseData.revision,
            location: place,
            ...(copayValue !== undefined ? { copay: copayValue } : {}),
          },
          signal,
        ),
      (err) => {
        if (err.code !== "REVISION_CONFLICT") return false;
        void session.reload("This label changed before the search finished.");
        return true;
      },
    );
  }

  const options = result.data?.options ?? null;

  return (
    <section aria-labelledby="savings-heading" className="panel stack-sm">
      <h3 id="savings-heading">Ways to save</h3>
      <p>
        Find savings programs and price information from cited sources. Prices
        are only shown with source evidence and are not guaranteed at your
        pharmacy. Your insurance benefits are never guessed.
      </p>
      {!eligible ? (
        <p className="banner banner-blocked">
          Available after you confirm the medication name, strength, dosage
          form, and directions above.
        </p>
      ) : (
        <form noValidate onSubmit={submit} className="stack-sm">
          {!quantityConfirmed && (
            <p className="banner banner-info">
              Quantity is not confirmed, so prices cannot be compared. General
              savings programs can still be shown.
            </p>
          )}
          <div className="stack-sm">
            <label htmlFor="savings-location" className="field-label">
              City or ZIP code
            </label>
            <input
              id="savings-location"
              type="text"
              maxLength={100}
              autoComplete="off"
              value={location}
              aria-describedby="savings-location-hint"
              onChange={(e) => setLocation(e.target.value)}
            />
            <p id="savings-location-hint" className="hint">
              Do not enter a street address.
            </p>
          </div>
          <div className="stack-sm">
            <label htmlFor="savings-copay" className="field-label">
              Your copay in US dollars (optional)
            </label>
            <input
              id="savings-copay"
              type="text"
              inputMode="decimal"
              value={copay}
              aria-describedby="savings-copay-hint"
              onChange={(e) => setCopay(e.target.value)}
            />
            <p id="savings-copay-hint" className="hint">
              Only if you know it from a receipt or your plan. Leave blank if
              not.
            </p>
          </div>
          {errors.length > 0 && (
            <div className="banner banner-error" role="alert">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {result.stale && !result.data && (
            <p className="banner banner-info">
              Your fields changed, so earlier results were removed. Search again
              to see results for the current label.
            </p>
          )}
          <button type="submit" className="primary" disabled={result.pending}>
            {result.pending ? "Searching…" : "Find savings"}
          </button>
        </form>
      )}
      <div aria-live="polite">
        {result.pending && <p className="hint">Searching sources…</p>}
        {options && options.length === 0 && (
          <p>
            No savings resources were found for this search. Try a nearby city,
            or ask your pharmacist about discount programs.
          </p>
        )}
      </div>
      {result.error?.error.code === "NOT_IMPLEMENTED" ? (
        <p className="banner banner-info">
          Savings search is not available on this server yet.
        </p>
      ) : (
        result.error && (
          <ErrorBanner error={result.error} retrying={result.pending} />
        )
      )}
      {options && result.dataMode && (
        <p className="badge">{DATA_MODE_TEXT[result.dataMode]}</p>
      )}
      {options && options.length > 0 && (
        <>
          <p className="hint">
            Results are listed in the order the sources returned them, not
            ranked by price.
          </p>
          <ul className="review-list" aria-label="Savings results">
            {options.map((o) => (
              <OptionCard key={o.id} option={o} fields={caseData.fields} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
