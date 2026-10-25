import { useState, type FormEvent } from "react";
import type { TextSize } from "../../api/workspace";
import type { AccountSession } from "../../state/useAccount";
import { ConfirmDialog, type ConfirmRequest } from "../ConfirmDialog";

export function SettingsScreen({
  account,
  communityEnabled = false,
  onTextSize,
  onSignedOut,
}: {
  account: AccountSession;
  communityEnabled?: boolean;
  onTextSize: (size: TextSize) => void;
  onSignedOut: () => void;
}) {
  const me = account.account!;
  const [name, setName] = useState(me.name);
  const [location, setLocation] = useState(me.location ?? "");
  const [size, setSize] = useState<TextSize>(me.textSize);
  const [supporter, setSupporter] = useState(me.uses.supporter);
  const [volunteer, setVolunteer] = useState(me.uses.volunteer);
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (
      await account.update({
        name: name.trim() || me.name,
        ...(communityEnabled ? { location: location.trim() || null } : {}),
        textSize: size,
        uses: { supporter, volunteer },
      })
    ) {
      onTextSize(size);
      setSaved(true);
    }
  }

  return (
    <main id="main" tabIndex={-1} className="workspace shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Profile and settings</h1>
          <p>
            Choose how LabelBridge works for you. These choices change what you
            see, never what anyone can access.
          </p>
        </div>
      </header>
      <div aria-live="polite">
        {saved && (
          <p className="alert success">
            <b>Settings saved.</b>
          </p>
        )}
      </div>
      <div className="settings-grid">
        <form className="workspace-card form-card" onSubmit={save} noValidate>
          <h2>Profile</h2>
          <label>
            Preferred name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
            />
          </label>
          <label>
            Email address
            <input value={me.email} readOnly aria-describedby="email-note" />
            <span id="email-note" className="hint">
              Demo accounts cannot change email.
            </span>
          </label>
          {communityEnabled && (
            <label>
              Community location (city, state or ZIP)
              <input
                value={location}
                maxLength={80}
                onChange={(e) => setLocation(e.target.value)}
                aria-describedby="profile-location-note"
              />
              <span id="profile-location-note" className="hint">
                Optional coarse location for the Community board. Do not enter a
                home address.
              </span>
            </label>
          )}
          <h2>Reading preferences</h2>
          <fieldset>
            <legend>Text size</legend>
            {(["standard", "larger", "largest"] as const).map((s) => (
              <label key={s} className="choice">
                <input
                  type="radio"
                  name="text-size"
                  checked={size === s}
                  onChange={() => setSize(s)}
                />
                {s[0].toUpperCase() + s.slice(1)}
              </label>
            ))}
          </fieldset>
          <h2>Optional workspaces</h2>
          <label className="choice">
            <input
              type="checkbox"
              checked={supporter}
              onChange={(e) => setSupporter(e.target.checked)}
            />
            Show the Supporter workspace
          </label>
          <label className="choice">
            <input
              type="checkbox"
              checked={volunteer}
              onChange={(e) => setVolunteer(e.target.checked)}
            />
            Show the Volunteer workspace
            {me.uses.volunteer && (
              <span className="pill gray">
                {me.volunteerStatus === "approved"
                  ? "Approved"
                  : "Approval pending"}
              </span>
            )}
          </label>
          <p className="muted">
            Hiding a workspace does not revoke anything already shared with you
            or cancel tasks you accepted.
          </p>
          {account.error && (
            <p className="banner banner-error" role="alert">
              {account.error.message}
            </p>
          )}
          <button
            type="submit"
            className="primary fit"
            disabled={account.pending}
          >
            Save preferences
          </button>
        </form>
        <aside
          className="workspace-card account-actions"
          aria-labelledby="actions-heading"
        >
          <h2 id="actions-heading">Account actions</h2>
          <p className="muted">{me.retention}</p>
          <button
            type="button"
            className="secondary"
            disabled={account.pending}
            onClick={() =>
              void account.signout().then((ok) => ok && onSignedOut())
            }
          >
            Sign out
          </button>
          <h3>Delete account</h3>
          <p className="muted">
            Deletes this account, its saved labels, invitations and connections.
            People you shared with lose access immediately. This cannot be
            undone.
          </p>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="danger"
            disabled={account.pending || !password || typed !== "DELETE"}
            onClick={() =>
              setConfirm({
                title: "Delete your demo account?",
                body: "Your saved labels and sharing will be removed now. This cannot be undone.",
                confirmLabel: "Delete account",
                onConfirm: () =>
                  void account
                    .remove(password)
                    .then((ok) => ok && onSignedOut()),
              })
            }
          >
            Delete account
          </button>
        </aside>
      </div>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}
