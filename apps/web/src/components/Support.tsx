import type { RefObject } from "react";
import { fieldsRevisionOf, type Case } from "@labelbridge/contracts";
import type { ApiClient } from "../api/client";
import type { CaseSession } from "../state/useCaseSession";
import { workspace } from "../api/workspace";
import { Explanation } from "./Explanation";
import { MedicineTranslator } from "./MedicineTranslator";
import { Pharmacies } from "./Pharmacies";
import { Progress } from "./Progress";
import { SharedSupport } from "./SharedSupport";

/** Step 3. Each section calls the backend itself and shows its own state. */
export function Support({
  api,
  caseData,
  session,
  headingRef,
  onBack,
}: {
  api: ApiClient;
  caseData: Case;
  session: CaseSession;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  const busy = session.pending !== null;
  return (
    <>
      <section className="review-head shell">
        <button type="button" className="back" onClick={onBack} disabled={busy}>
          <span aria-hidden="true">← </span>Back to the label details
        </button>
        <h1 id="support-page-heading" tabIndex={-1} ref={headingRef}>
          Explore support
        </h1>
        <p>
          Optional help based on the details you confirmed. Nothing here changes
          your medication or your directions.
        </p>
        <Progress step={3} />
      </section>
      <div className="support-layout shell">
        <div className="support-section">
          <Explanation api={api} caseData={caseData} session={session} />
        </div>
        <div className="support-section">
          {/* Remounts when label fields change, dropping stale matches and explanations. */}
          <MedicineTranslator
            key={fieldsRevisionOf(caseData)}
            client={workspace}
            caseData={caseData}
          />
        </div>
        <div className="support-section">
          <Pharmacies api={api} caseData={caseData} />
        </div>
        <div className="support-section">
          <SharedSupport api={api} caseData={caseData} session={session} />
        </div>
      </div>
    </>
  );
}
