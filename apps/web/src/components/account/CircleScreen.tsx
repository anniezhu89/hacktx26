import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  sharedView,
  type Case,
  type Connection,
  type Invitation,
  type SavedLabel,
} from "@labelbridge/contracts";
import { toApiError, type ApiClient, type ApiError } from "../../api/client";
import type { WorkspaceClient } from "../../api/workspace";
import { FIELD_LABELS, FIELD_ORDER, type FieldKey } from "../../lib/fields";
import { ConfirmDialog, type ConfirmRequest } from "../ConfirmDialog";

const SCOPE_TEXT: Record<Invitation["scope"], string> = {
  reading_and_tasks: "Reading support and practical tasks",
  reading: "Reading support only",
  tasks: "Practical tasks only",
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function ShareEditor({
  client,
  caseClient,
  connection,
  labels,
  onSaved,
}: {
  client: WorkspaceClient;
  caseClient: ApiClient;
  connection: Connection;
  labels: SavedLabel[];
  onSaved: (message: string) => void;
}) {
  const [caseId, setCaseId] = useState(labels[0]?.caseId ?? "");
  const existing = connection.grants.find((g) => g.caseId === caseId);
  const [keys, setKeys] = useState<FieldKey[]>(existing?.fieldKeys ?? []);
  const [image, setImage] = useState(existing?.image ?? false);
  const [record, setRecord] = useState<Case | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const reading = connection.scope !== "tasks";

  useEffect(() => {
    const g = connection.grants.find((x) => x.caseId === caseId);
    setKeys(g?.fieldKeys ?? []);
    setImage(g?.image ?? false);
    setRecord(null);
    if (caseId)
      caseClient.getCase(caseId).then(
        (r) => setRecord(r.case),
        (e) => setError(toApiError(e)),
      );
  }, [caseId, connection, caseClient]);

  // Exactly what the server will send: the shared helper, same rules.
  const preview = record
    ? sharedView({ ...record, sharing: { supporter: true, fieldKeys: keys } })
    : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await client.setGrant(connection.id, caseId, {
        fieldKeys: reading ? keys : [],
        image: reading && image,
      });
      onSaved(`Sharing saved for ${connection.personName}.`);
    } catch (err) {
      setError(toApiError(err));
    }
  }

  if (!labels.length)
    return (
      <p className="muted">
        Save a label to My labels first; only saved labels can be shared.
      </p>
    );

  return (
    <section
      className="sharing-layout"
      aria-label={`Sharing with ${connection.personName}`}
    >
      <form className="workspace-card form-card" onSubmit={save} noValidate>
        <h2>Choose what {connection.personName} can see</h2>
        <label>
          Label
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            {labels.map((l) => (
              <option key={l.caseId} value={l.caseId}>
                {l.title ?? "Name not confirmed yet"}
              </option>
            ))}
          </select>
        </label>
        {reading ? (
          <>
            <fieldset>
              <legend>Fields from this label</legend>
              {FIELD_ORDER.map((k) => (
                <label key={k} className="choice">
                  <input
                    type="checkbox"
                    checked={keys.includes(k)}
                    onChange={(e) =>
                      setKeys((list) =>
                        e.target.checked
                          ? [...list, k]
                          : list.filter((x) => x !== k),
                      )
                    }
                  />
                  {FIELD_LABELS[k]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Original image permission</legend>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={image}
                  onChange={(e) => setImage(e.target.checked)}
                />
                Share the original label image
              </label>
              <p className="muted">
                Separate from sharing fields. Labels added as text have no
                image.
              </p>
            </fieldset>
          </>
        ) : (
          <p className="muted">
            This connection is for practical tasks only, so label details cannot
            be shared. Granting the label lets them see its tasks.
          </p>
        )}
        {error && (
          <p className="banner banner-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary fit">
            Save sharing choices
          </button>
          {existing && (
            <button
              type="button"
              className="danger"
              onClick={() =>
                void client.removeGrant(connection.id, caseId).then(
                  () => onSaved("Access to this label was removed."),
                  (e) => setError(toApiError(e)),
                )
              }
            >
              Stop sharing this label
            </button>
          )}
        </div>
      </form>
      <aside
        className="workspace-card preview-card"
        aria-labelledby="preview-for"
      >
        <span className="eyebrow" id="preview-for">
          Preview for {connection.personName}
        </span>
        {!preview ? (
          <p>Loading preview…</p>
        ) : (
          <>
            {preview.fields.length === 0 && <p>No label details selected.</p>}
            {preview.fields.map((f) => (
              <div
                key={f.key}
                className={`read-only-field ${f.value === null ? "unavailable" : ""}`}
              >
                <span>{FIELD_LABELS[f.key]}</span>
                <b>{f.value ?? "Hidden: not confirmed by you yet"}</b>
              </div>
            ))}
            {reading && image && (
              <p className="muted">
                They can also open the original label image, if this label has
                one.
              </p>
            )}
          </>
        )}
        <p className="alert info">
          <span>
            {connection.personName} cannot edit or confirm these details.
            Nothing is sent by email or text.
          </span>
        </p>
      </aside>
    </section>
  );
}

export function CircleScreen({
  client,
  caseClient,
}: {
  client: WorkspaceClient;
  caseClient: ApiClient;
}) {
  const [data, setData] = useState<{
    invitations: Invitation[];
    connections: Connection[];
  } | null>(null);
  const [labels, setLabels] = useState<SavedLabel[]>([]);
  const [view, setView] = useState<"list" | "invite" | "accept" | string>(
    "list",
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState<{ name: string; code: string } | null>(
    null,
  );
  const [inviteName, setInviteName] = useState("");
  const [scope, setScope] = useState<Invitation["scope"]>("reading_and_tasks");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const load = useCallback(() => {
    client.circle().then(
      (r) => setData(r.data),
      (e) => setError(toApiError(e)),
    );
    client.savedLabels().then(
      (r) => setLabels(r.data),
      () => setLabels([]),
    );
  }, [client]);
  useEffect(load, [load]);

  const act = async (
    work: () => Promise<{
      data: { invitations: Invitation[]; connections: Connection[] };
    }>,
    message: string,
  ) => {
    setError(null);
    try {
      setData((await work()).data);
      setNotice(message);
      return true;
    } catch (e) {
      setError(toApiError(e));
      return false;
    }
  };

  const mine =
    data?.connections.filter((c) => c.direction === "supports_me") ?? [];
  const helping =
    data?.connections.filter((c) => c.direction === "i_support") ?? [];
  const managing = mine.find((c) => c.id === view);

  return (
    <main id="main" tabIndex={-1} className="workspace shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">Support circle</span>
          <h1>People you trust</h1>
          <p>
            Connections see only the labels and fields you choose. Nothing is
            shared when someone accepts.
          </p>
        </div>
        <button
          type="button"
          className="primary fit"
          onClick={() => setView("invite")}
        >
          Invite someone
        </button>
      </header>
      <nav className="flow-tabs" aria-label="Support circle">
        {[
          ["list", "Connections"],
          ["invite", "Invite"],
          ["accept", "Accept an invitation"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "active" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div aria-live="polite">
        {notice && <p className="alert success">{notice}</p>}
        {error && (
          <p className="banner banner-error" role="alert">
            {error.message}
          </p>
        )}
      </div>

      {view === "list" && (
        <div className="two-column">
          <section className="workspace-card" aria-labelledby="supporting-me">
            <h2 id="supporting-me">People who support you</h2>
            {mine.length === 0 && (
              <p className="muted">No one yet. Invite someone you trust.</p>
            )}
            {mine.map((c) => (
              <div key={c.id} className="person-row">
                <span className="avatar" aria-hidden="true">
                  {initials(c.personName)}
                </span>
                <div>
                  <b>{c.personName}</b>
                  <p>
                    {SCOPE_TEXT[c.scope]} ·{" "}
                    {c.grants.length
                      ? `${c.grants.length} label${c.grants.length === 1 ? "" : "s"} shared`
                      : "Nothing shared yet"}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setView(c.id)}
                >
                  Manage<span className="sr-only"> {c.personName}</span>
                </button>
              </div>
            ))}
            {helping.length > 0 && (
              <>
                <h2>People you support</h2>
                {helping.map((c) => (
                  <div key={c.id} className="person-row">
                    <span className="avatar pale" aria-hidden="true">
                      {initials(c.personName)}
                    </span>
                    <div>
                      <b>{c.personName}</b>
                      <p>{SCOPE_TEXT[c.scope]} · see the Supporter workspace</p>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setConfirm({
                          title: `Leave ${c.personName}'s support circle?`,
                          body: "You will lose access to anything they shared with you.",
                          confirmLabel: "Leave circle",
                          onConfirm: () =>
                            void act(
                              () => client.removeConnection(c.id),
                              "You left the support circle.",
                            ),
                        })
                      }
                    >
                      Leave
                      <span className="sr-only"> {c.personName}'s circle</span>
                    </button>
                  </div>
                ))}
              </>
            )}
          </section>
          <section className="workspace-card" aria-labelledby="pending-heading">
            <h2 id="pending-heading">Invitations you sent</h2>
            {!data?.invitations.length && (
              <p className="muted">No invitations yet.</p>
            )}
            {data?.invitations.map((i) => (
              <div key={i.id} className="person-row">
                <span className="avatar pale" aria-hidden="true">
                  {initials(i.inviteeName)}
                </span>
                <div>
                  <b>{i.inviteeName}</b>
                  <p>
                    {SCOPE_TEXT[i.scope]} ·{" "}
                    {i.status === "pending"
                      ? `expires ${new Date(i.expiresAt).toLocaleString()}`
                      : i.status}
                  </p>
                </div>
                {i.status === "pending" ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void act(
                        () => client.revokeInvitation(i.id),
                        "Invitation canceled.",
                      )
                    }
                  >
                    Cancel
                    <span className="sr-only">
                      {" "}
                      invitation for {i.inviteeName}
                    </span>
                  </button>
                ) : (
                  <span className="pill gray">{i.status}</span>
                )}
              </div>
            ))}
          </section>
        </div>
      )}

      {view === "invite" && (
        <section
          className="workspace-card narrow form-card"
          aria-labelledby="invite-heading"
        >
          <h2 id="invite-heading">Invite someone you trust</h2>
          <p className="alert info">
            <b>No label information is shared automatically.</b>{" "}
            <span>You choose access after they accept.</span>
          </p>
          {created ? (
            <div className="read-only-field">
              <span>
                Single-use invitation code for {created.name} (expires in 72
                hours)
              </span>
              <b className="invite-code">{created.code}</b>
              <p className="muted">
                No email or message was sent. Give this code to {created.name}{" "}
                yourself; they enter it under “Accept an invitation” after
                signing in. It is shown only once.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setCreated(null);
                  setView("list");
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                client.invite(inviteName.trim(), scope).then(
                  (r) => {
                    setCreated({ name: inviteName.trim(), code: r.data.code });
                    setInviteName("");
                    load();
                  },
                  (err) => setError(toApiError(err)),
                );
              }}
            >
              <label>
                Their name
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                />
              </label>
              <label>
                How they can help
                <select
                  value={scope}
                  onChange={(e) =>
                    setScope(e.target.value as Invitation["scope"])
                  }
                >
                  {Object.entries(SCOPE_TEXT).map(([id, text]) => (
                    <option key={id} value={id}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="primary fit"
                disabled={!inviteName.trim()}
              >
                Create invitation code
              </button>
            </form>
          )}
        </section>
      )}

      {view === "accept" && (
        <section
          className="workspace-card narrow form-card"
          aria-labelledby="accept-heading"
        >
          <h2 id="accept-heading">Accept an invitation</h2>
          <p>
            Accepting connects your accounts. You will not see any medication
            information unless they share it with you later.
          </p>
          <label>
            Invitation code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="action-row">
            <button
              type="button"
              className="primary fit"
              disabled={code.trim().length < 16}
              onClick={() =>
                void act(
                  () => client.respondToInvite(code.trim(), "accept"),
                  "Invitation accepted.",
                ).then((ok) => ok && (setCode(""), setView("list")))
              }
            >
              Accept invitation
            </button>
            <button
              type="button"
              className="secondary"
              disabled={code.trim().length < 16}
              onClick={() =>
                void act(
                  () => client.respondToInvite(code.trim(), "decline"),
                  "Invitation declined. Nothing was shared.",
                ).then((ok) => ok && setCode(""))
              }
            >
              Decline
            </button>
          </div>
        </section>
      )}

      {managing && (
        <>
          <button
            type="button"
            className="back"
            onClick={() => setView("list")}
          >
            <span aria-hidden="true">← </span>Connections
          </button>
          <div className="person-row">
            <span className="avatar" aria-hidden="true">
              {initials(managing.personName)}
            </span>
            <div>
              <b>{managing.personName}</b>
              <p>
                Connected {new Date(managing.connectedAt).toLocaleDateString()}{" "}
                · {SCOPE_TEXT[managing.scope]}
              </p>
            </div>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setConfirm({
                  title: `Remove ${managing.personName}?`,
                  body: "All of their access ends now. It cannot erase what they already saw. No notification is sent.",
                  confirmLabel: "Revoke all access",
                  onConfirm: () =>
                    void act(
                      () => client.removeConnection(managing.id),
                      "Access revoked.",
                    ).then((ok) => ok && setView("list")),
                })
              }
            >
              Revoke all access
            </button>
          </div>
          <ShareEditor
            key={managing.id}
            client={client}
            caseClient={caseClient}
            connection={managing}
            labels={labels}
            onSaved={(m) => {
              setNotice(m);
              load();
            }}
          />
        </>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}
