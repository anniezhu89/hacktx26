import {
  eligibleForExplanation,
  fieldsRevisionOf,
  type Case,
} from "@labelbridge/contracts";
import type { ApiClient, ExplanationData } from "../api/client";
import { DATA_MODE_TEXT } from "../lib/dataMode";
import { explanationProblems } from "../lib/understand";
import type { CaseSession } from "../state/useCaseSession";
import { useRevisionResult } from "../state/useRevisionResult";
import { ErrorBanner } from "./ErrorBanner";

const host = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function Explanation({
  api,
  caseData,
  session,
}: {
  api: ApiClient;
  caseData: Case;
  session: CaseSession;
}) {
  const result = useRevisionResult<ExplanationData>(
    caseData.id,
    fieldsRevisionOf(caseData),
  );
  const eligible = eligibleForExplanation(caseData.fields);
  const directions =
    caseData.fields.find((f) => f.key === "exactDirections")?.value ?? "";
  const data = result.data;
  // Defense in depth: never show text for another revision, that rewrites
  // the confirmed directions, or that changes their meaning.
  const mismatch =
    data !== null &&
    (data.originalDirections !== directions ||
      data.fieldRevision !== fieldsRevisionOf(caseData));
  const problems =
    data && data.simplifiedText
      ? explanationProblems(data.originalDirections, data.simplifiedText)
      : [];
  const blockedByServer =
    result.error?.error.code === "NEEDS_CLARIFICATION" ? result.error : null;

  const ask = () =>
    void result.request(
      (signal) =>
        api.requestExplanation(
          caseData.id,
          { expectedRevision: caseData.revision },
          signal,
        ),
      (err) => {
        if (err.code !== "REVISION_CONFLICT") return false;
        void session.reload(
          "This label changed before the explanation was ready.",
        );
        return true;
      },
    );

  return (
    <section aria-labelledby="understand-heading" className="panel stack-sm">
      <h3 id="understand-heading">Understand your directions</h3>
      {!eligible ? (
        <p className="banner banner-blocked">
          Available after you confirm the medication name, strength, dosage
          form, and directions above. Nothing is guessed in the meantime.
        </p>
      ) : (
        <>
          {result.stale && !data && (
            <p className="banner banner-info">
              Your fields changed, so the earlier explanation was removed. Ask
              again for one that matches the current label.
            </p>
          )}
          {!data && (
            <button
              type="button"
              className="primary"
              disabled={result.pending}
              onClick={ask}
            >
              {result.pending
                ? "Preparing explanation…"
                : "Show a plain-language explanation"}
            </button>
          )}
        </>
      )}
      <div aria-live="polite">
        {result.pending && <p className="hint">Preparing explanation…</p>}
      </div>
      {blockedByServer ? (
        <p className="banner banner-blocked" role="alert">
          {blockedByServer.error.message}
        </p>
      ) : (
        result.error && (
          <ErrorBanner error={result.error} retrying={result.pending} />
        )
      )}

      {data && (
        <div className="stack-sm">
          {result.dataMode && (
            <p className="badge">{DATA_MODE_TEXT[result.dataMode]}</p>
          )}
          {mismatch ? (
            <p className="banner banner-error" role="alert">
              The explanation did not match your confirmed directions, so it was
              not shown. Ask your pharmacist about the directions.
            </p>
          ) : (
            <div className="side-by-side">
              <div>
                <h4>Exactly as printed on your label</h4>
                <blockquote className="excerpt-text">
                  {data.originalDirections}
                </blockquote>
              </div>
              <div>
                <h4>In plain language</h4>
                {!data.eligibleForExplanation || !data.simplifiedText ? (
                  <p className="banner banner-blocked">
                    A plain-language version is not available for these
                    directions. Use the questions below with your pharmacist.
                  </p>
                ) : problems.length > 0 ? (
                  <p className="banner banner-error" role="alert">
                    The plain-language version was hidden because it changes the
                    meaning of your label: it {problems.join("; ")}. Use the
                    exact wording and ask your pharmacist.
                  </p>
                ) : (
                  <>
                    <blockquote className="excerpt-text">
                      {data.simplifiedText}
                    </blockquote>
                    {data.simplifiedText === data.originalDirections && (
                      <p className="hint">
                        In this demo the wording is not rewritten; it repeats
                        your label exactly.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          <p className="hint">
            This explains the wording on your label. It is not medical advice
            and does not change your directions.
          </p>

          <h4>Questions to ask your pharmacist</h4>
          {data.unresolvedQuestions.length ? (
            <ul>
              {data.unresolvedQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">No open questions were found.</p>
          )}

          <h4>Reference material</h4>
          {data.references.length ? (
            <ul className="stack-sm">
              {data.references.map((r) => (
                <li key={r.url + r.passage}>
                  <blockquote className="excerpt-text">{r.passage}</blockquote>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    Source: {host(r.url)}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">
              No reference passages are available for this demo product.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
