import type { ApiClient } from "../api/client";
import type { CaseSession } from "../state/useCaseSession";
import { Intake, type IntakeMode } from "./Intake";

/**
 * Patient start composition for Figma desktop-01-start (node 4:2).
 * Layout and tokens match that frame; sample copy uses the current
 * levothyroxine fixtures (the Figma raster still shows the older
 * "Fictional Demo Tablet" / 0.5 mg placeholder).
 */
export function StartScreen({
  session,
  apiKind,
  intakeMode,
  expired,
}: {
  session: CaseSession;
  apiKind: ApiClient["kind"];
  intakeMode: IntakeMode;
  expired: string | null;
}) {
  return (
    <div className="start-screen" data-figma-node="4:2">
      {expired && (
        <div className="banner banner-error" role="alert">
          <p>{expired}</p>
        </div>
      )}
      <Intake
        key={intakeMode}
        session={session}
        apiKind={apiKind}
        initialMode={intakeMode}
      />
    </div>
  );
}
