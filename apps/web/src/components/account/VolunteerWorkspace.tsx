import type { Account } from "@labelbridge/contracts";
import { api } from "../../api";
import type { WorkspaceClient } from "../../api/workspace";
import { useReviewerQueue } from "../../state/useReviews";
import { VolunteerView } from "../VolunteerView";

function ApprovedQueue({ client }: { client: WorkspaceClient }) {
  const queue = useReviewerQueue(api);
  return (
    <VolunteerView
      queue={queue}
      onRelease={async (id) => {
        await client.releaseReview(id).catch(() => undefined);
        queue.close();
        await queue.refresh();
      }}
    />
  );
}

/** Approval is decided on the server; the preference alone shows nothing. */
export function VolunteerWorkspace({
  account,
  client,
}: {
  account: Account;
  client: WorkspaceClient;
}) {
  return (
    <main id="main" tabIndex={-1} className="workspace shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">Volunteer workspace</span>
          <h1>Volunteer reading</h1>
          <p>
            Read one selected section of someone's fictional label. You never
            see their name, profile or automatic reading.
          </p>
        </div>
      </header>
      {account.volunteerStatus === "approved" ? (
        <div className="workspace-card volunteer-card">
          <ApprovedQueue client={client} />
        </div>
      ) : (
        <section className="empty-state workspace-card">
          <span className="pill peach">Pending review</span>
          <h2>Your volunteer application is waiting for approval</h2>
          <p>
            Choosing volunteer reading does not mean you are approved. No
            requests or patient information are shown before the server operator
            approves your account.
          </p>
        </section>
      )}
    </main>
  );
}
