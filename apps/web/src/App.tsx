import { CommunityBoard } from "./community/CommunityBoard";
import { communityClient } from "./community/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { toApiError, type Role } from "./api/client";
import { workspace, type TextSize } from "./api/workspace";
import { AuthScreen } from "./components/account/AuthScreen";
import { CircleScreen } from "./components/account/CircleScreen";
import { LabelsScreen } from "./components/account/LabelsScreen";
import { SettingsScreen } from "./components/account/SettingsScreen";
import { SupporterWorkspace } from "./components/account/SupporterWorkspace";
import { VolunteerWorkspace } from "./components/account/VolunteerWorkspace";
import { ConfirmDialog, type ConfirmRequest } from "./components/ConfirmDialog";
import { Intake } from "./components/Intake";
import { Review } from "./components/Review";
import { Support } from "./components/Support";
import { SupporterView } from "./components/SupporterView";
import { VolunteerView } from "./components/VolunteerView";
import { draftHasContent, emptyDraft, type IntakeDraft } from "./lib/intake";
import { useAccount } from "./state/useAccount";
import { useCaseSession } from "./state/useCaseSession";
import { usePatientReviews, useReviewerQueue } from "./state/useReviews";
import { useSupporterView } from "./state/useSupporterView";

// Only the display preference is stored; label contents never are.
const TEXT_SIZE_KEY = "labelbridge.textSize";
const SIZES: TextSize[] = ["standard", "larger", "largest"];

function readTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY);
    if (v === "larger" || v === "largest") return v;
    // Earlier builds stored a single on/off flag.
    return localStorage.getItem("labelbridge.largeText") === "1"
      ? "larger"
      : "standard";
  } catch {
    return "standard";
  }
}

function SupporterPane() {
  return <SupporterView view={useSupporterView(api)} />;
}

// Mounted only in the volunteer view, so the queue loads when it is opened.
function VolunteerPane() {
  return <VolunteerView queue={useReviewerQueue(api)} />;
}

type Step = "add" | "check" | "support";
type Screen =
  | "add"
  | "labels"
  | "circle"
  | "settings"
  | "supporter"
  | "volunteer"
  | "auth"
  | "community";

const PERSONAS: [Role, string][] = [
  ["patient", "Patient"],
  ["supporter", "Supporter"],
  ["reviewer", "Volunteer reader"],
];

export function App() {
  const [communityEnabled, setCommunityEnabled] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    communityClient.config(ctrl.signal).then(
      (config) => setCommunityEnabled(config.enabled),
      () => undefined,
    );
    return () => ctrl.abort();
  }, []);
  const account = useAccount(workspace);
  const me = account.account;
  const session = useCaseSession(api);
  const c = session.result?.case ?? null;
  const help = usePatientReviews(api, c?.id ?? null);
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft());
  const [caseStep, setCaseStep] = useState<"check" | "support">("check");
  const [screen, setScreen] = useState<Screen>("add");
  const [textSize, setTextSize] = useState<TextSize>(readTextSize);
  const [persona, setPersona] = useState<Role>("patient");
  const [announcement, setAnnouncement] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = useRef(new Set<string>());
  const headings = {
    add: useRef<HTMLHeadingElement>(null),
    check: useRef<HTMLHeadingElement>(null),
    support: useRef<HTMLHeadingElement>(null),
  };
  const focusNext = useRef<Step | null>(null);
  const step: Step = c ? caseStep : "add";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("large-text", textSize === "larger");
    root.classList.toggle("largest-text", textSize === "largest");
    try {
      localStorage.setItem(TEXT_SIZE_KEY, textSize);
    } catch {
      // Storage may be unavailable; the setting still works for this visit.
    }
  }, [textSize]);

  // An account's saved text size applies when it signs in.
  useEffect(() => {
    if (me) setTextSize(me.textSize);
  }, [me?.id]);

  // Saved labels are known from the account list.
  useEffect(() => {
    if (!me) return setSavedIds(new Set());
    workspace.savedLabels().then(
      (r) => setSavedIds(new Set(r.data.map((l) => l.caseId))),
      () => undefined,
    );
  }, [me?.id, screen]);

  // A new case comes from the server's response, never from the click alone.
  const lastCase = useRef<string | null>(null);
  useEffect(() => {
    const id = c?.id ?? null;
    if (id && id !== lastCase.current) {
      dirty.current.clear();
      setCaseStep("check");
      focusNext.current = "check";
    } else if (!id && lastCase.current) focusNext.current = "add";
    lastCase.current = id;
  }, [c?.id]);

  // Move focus to the heading of whichever step just appeared.
  useEffect(() => {
    const target = focusNext.current;
    if (!target || persona !== "patient" || screen !== "add") return;
    focusNext.current = null;
    window.scrollTo({ top: 0 });
    headings[target].current?.focus();
  });

  const hasWork = useCallback(
    () =>
      dirty.current.size > 0 ||
      (c !== null && c.revision > 0 && !savedIds.has(c.id)) ||
      (c === null && draftHasContent(draft)),
    [c, draft, savedIds],
  );

  // Warn before a reload or tab close discards a case or typed input.
  useEffect(() => {
    if ((!c || savedIds.has(c.id)) && !draftHasContent(draft)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [c, draft, savedIds]);

  const onDirtyChange = useCallback((key: string, isDirty: boolean) => {
    if (isDirty) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);

  function guarded(request: ConfirmRequest) {
    if (hasWork()) setConfirm(request);
    else request.onConfirm();
  }

  const go = (next: Screen) => {
    setScreen(next);
    setAnnouncement("");
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() =>
      (document.querySelector("main h1") as HTMLElement | null)?.focus(),
    );
  };

  const goTo = (next: "check" | "support") => {
    focusNext.current = next;
    setCaseStep(next);
  };

  // Going back keeps what was entered on step 1 so it can be resubmitted.
  const backToLabel = () =>
    guarded({
      title: "Go back to your label?",
      body: "Your checks on this reading will be discarded. What you entered on the first step stays filled in.",
      confirmLabel: "Discard checks and go back",
      onConfirm: () => {
        dirty.current.clear();
        session.startOver();
      },
    });

  const clearAll = () => {
    dirty.current.clear();
    session.startOver();
    setDraft(emptyDraft());
    focusNext.current = "add";
  };

  const startOver = () =>
    guarded({
      title: "Start over with a new label?",
      body: "This clears the current label, your checks, and anything you typed. Saved labels stay in My labels.",
      confirmLabel: "Start over",
      onConfirm: () => {
        clearAll();
        setScreen("add");
      },
    });

  const uploadClearer = () =>
    guarded({
      title: "Upload a clearer image?",
      body: "This reading and your checks will be discarded so a new photo can be read.",
      confirmLabel: "Discard and upload a photo",
      onConfirm: () => {
        dirty.current.clear();
        session.startOver();
        setDraft((d) => ({ ...d, mode: "image", file: null, fileError: null }));
      },
    });

  const saveCurrent = async () => {
    if (!c) return;
    setSaveError(null);
    try {
      const r = await workspace.saveLabel(c.id);
      setSavedIds(new Set(r.data.map((l) => l.caseId)));
      setAnnouncement("Saved to My labels. Saved labels are kept for 7 days.");
      await session.reload();
    } catch (e) {
      setSaveError(toApiError(e).message);
    }
  };

  /** After signing in, an open guest case can be saved, but only explicitly. */
  const afterSignIn = () => {
    const guestCase = c;
    go(guestCase ? "add" : "labels");
    if (guestCase)
      setConfirm({
        title: "Save the label you were checking?",
        body: "It belongs to this browser's guest session. Save it to My labels to keep working on it, or discard it.",
        confirmLabel: "Save to My labels",
        cancelLabel: "Discard it",
        tone: "primary",
        onConfirm: () => void saveCurrent(),
        onCancel: clearAll,
      });
  };

  const signedOut = () => {
    clearAll();
    setPersona("patient");
    go("add");
  };

  const workspaceNav: [Screen, string][] = [
    ["labels", "My labels"],
    ["add", "Add a label"],
    ["circle", "Support circle"],
    ["settings", "Settings"],
  ];

  if (communityEnabled) workspaceNav.push(["community", "Community"]);

  const flow = (
    <>
      {persona === "reviewer" && !me ? (
        <div className="shell persona-pane">
          <VolunteerPane />
        </div>
      ) : persona === "supporter" && !me ? (
        <div className="shell persona-pane">
          <SupporterPane />
        </div>
      ) : session.result ? (
        <>
          {me && (
            <div className="shell save-bar" aria-live="polite">
              {savedIds.has(session.result.case.id) ? (
                <p className="pill">Saved to My labels</p>
              ) : (
                <>
                  <p>
                    This label is temporary and will be deleted after an hour
                    unless you save it.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void saveCurrent()}
                    disabled={session.pending !== null}
                  >
                    Save to My labels
                  </button>
                </>
              )}
              {saveError && (
                <p className="field-error" role="alert">
                  {saveError}
                </p>
              )}
            </div>
          )}
          <div hidden={step !== "check"}>
            <Review
              session={session}
              result={session.result}
              source={session.source}
              help={help}
              headingRef={headings.check}
              onBack={backToLabel}
              onContinue={() => goTo("support")}
              onUploadClearer={uploadClearer}
              onDirtyChange={onDirtyChange}
            />
          </div>
          <div hidden={step !== "support"}>
            <Support
              api={api}
              caseData={session.result.case}
              session={session}
              headingRef={headings.support}
              onBack={() => goTo("check")}
            />
          </div>
          <div className="shell start-over">
            <button
              type="button"
              className="link-button"
              onClick={startOver}
              disabled={session.pending !== null}
            >
              Start over with another label
            </button>
          </div>
        </>
      ) : (
        <>
          {session.expired && (
            <div className="banner banner-error shell" role="alert">
              <p>{session.expired}</p>
            </div>
          )}
          <Intake
            draft={draft}
            onDraft={setDraft}
            session={session}
            headingRef={headings.add}
          />
        </>
      )}
    </>
  );

  const signedInScreen = (() => {
    if (!me) return null;
    switch (screen) {
      case "labels":
        return (
          <LabelsScreen
            client={workspace}
            onAdd={() => {
              clearAll();
              go("add");
            }}
            onOpen={(id) => {
              void session.open(id);
              go("add");
            }}
          />
        );
      case "circle":
        return <CircleScreen client={workspace} caseClient={api} />;
      case "settings":
        return (
          <SettingsScreen
            account={account}
            communityEnabled={communityEnabled}
            onTextSize={setTextSize}
            onSignedOut={signedOut}
          />
        );
      case "supporter":
        return <SupporterWorkspace client={workspace} accountId={me.id} />;
      case "volunteer":
        return <VolunteerWorkspace account={me} client={workspace} />;
      default:
        return null;
    }
  })();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <p className="notice">
        Demo: fictional medication data · Use made-up label information only
      </p>
      <header className="nav shell">
        <button
          type="button"
          className="brand"
          onClick={startOver}
          aria-label="decodRx, start over"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>decodRx</span>
        </button>
        <nav aria-label="Display and account options" className="nav-tools">
          {step === "add" &&
            persona === "patient" &&
            screen === "add" &&
            !me && (
              <a href="#how" className="nav-link">
                How it works
              </a>
            )}
          <a
            href="#help"
            className="nav-link"
            onClick={() => setHelpOpen(true)}
          >
            Get help
          </a>
          <button
            type="button"
            className="text-size"
            aria-label={`Text size: ${textSize}. Activate to change text size.`}
            aria-pressed={textSize !== "standard"}
            onClick={() =>
              setTextSize((s) => SIZES[(SIZES.indexOf(s) + 1) % SIZES.length])
            }
          >
            <b aria-hidden="true">Aa</b>
            <span className="text-size-label">Text size</span>
            <span className="sr-only">: {textSize}</span>
          </button>
          {!account.loading &&
            (me ? (
              <span className="signed-in">
                Signed in as <b>{me.name}</b>
              </span>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => go("auth")}
              >
                Sign in
              </button>
            ))}
        </nav>
      </header>
      {!me && (
        <nav className="demo-nav" aria-label="Workspaces">
          <div className="shell">
            {communityEnabled && (
              <button
                type="button"
                aria-current={screen === "community" ? "page" : undefined}
                onClick={() => go("community")}
              >
                Community
              </button>
            )}
            {PERSONAS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={
                  persona === id && screen === "add" ? "page" : undefined
                }
                onClick={() => {
                  setPersona(id);
                  setScreen("add");
                  setAnnouncement(`Showing the ${label.toLowerCase()} view.`);
                  if (id === "patient" && session.result) void session.reload();
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-current={screen === "auth" ? "page" : undefined}
              onClick={() => go("auth")}
            >
              Account
            </button>
          </div>
        </nav>
      )}
      {me && (
        <div className="workspace-bar">
          <nav className="shell" aria-label="Personal workspace">
            {workspaceNav.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={screen === id ? "active" : ""}
                aria-current={screen === id ? "page" : undefined}
                onClick={() => (id === "add" ? go("add") : go(id))}
              >
                {label}
              </button>
            ))}
          </nav>
          {(me.uses.supporter || me.uses.volunteer) && (
            <div
              className="workspace-switch shell"
              role="group"
              aria-label="Other workspaces"
            >
              <span>Switch workspace:</span>
              {me.uses.supporter && (
                <button
                  type="button"
                  className={screen === "supporter" ? "active" : ""}
                  aria-current={screen === "supporter" ? "page" : undefined}
                  onClick={() => go("supporter")}
                >
                  Supporter
                </button>
              )}
              {me.uses.volunteer && (
                <button
                  type="button"
                  className={screen === "volunteer" ? "active" : ""}
                  aria-current={screen === "volunteer" ? "page" : undefined}
                  onClick={() => go("volunteer")}
                >
                  Volunteer
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {screen === "auth" ? (
        <AuthScreen
          account={account}
          onDone={afterSignIn}
          onGuest={() => go("add")}
          onTextSize={setTextSize}
        />
      ) : screen === "community" && communityEnabled ? (
        <CommunityBoard
          key={me?.id ?? "guest"}
          account={account}
          onSignIn={() => go("auth")}
        />
      ) : signedInScreen ? (
        signedInScreen
      ) : (
        <main id="main" tabIndex={-1}>
          {flow}
        </main>
      )}

      <footer className="site-footer">
        <details
          id="help"
          className="help-guide shell"
          open={helpOpen}
          onToggle={(event) => setHelpOpen(event.currentTarget.open)}
        >
          <summary>Need help with a label?</summary>
          <p>
            Upload a clear photo or type the words exactly as printed. Check
            each extracted field against the original label. If a field is
            unreadable, mark it unknown or choose Get help. Medication questions
            should go to a pharmacist.
          </p>
        </details>
      </footer>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
