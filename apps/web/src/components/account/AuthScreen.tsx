import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TextSize } from "../../api/workspace";
import type { AccountSession } from "../../state/useAccount";

type Step = "signin" | "create" | "recover" | "welcome";

export function AuthScreen({
  account,
  start = "signin",
  onDone,
  onGuest,
  onTextSize,
}: {
  account: AccountSession;
  start?: Step;
  onDone: () => void;
  onGuest: () => void;
  onTextSize: (size: TextSize) => void;
}) {
  const [step, setStep] = useState<Step>(start);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [supporter, setSupporter] = useState(false);
  const [volunteer, setVolunteer] = useState(false);
  const [size, setSize] = useState<TextSize>("standard");
  const [local, setLocal] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    account.clearError();
    setLocal(null);
  }, [step]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocal(null);
    if (step === "signin") {
      if (await account.signin(email, password)) onDone();
    } else if (step === "create") {
      if (password.length < 10)
        return setLocal("Use a password of at least 10 characters.");
      if (
        await account.signup({
          name: name.trim(),
          email,
          password,
          uses: { supporter: false, volunteer: false },
        })
      )
        setStep("welcome");
    } else if (step === "recover") {
      await account.recover(email);
    } else if (
      await account.update({
        name: name.trim() || undefined,
        uses: { supporter, volunteer },
        textSize: size,
      })
    ) {
      onTextSize(size);
      onDone();
    }
  }

  const title = {
    signin: "Welcome back",
    create: "Create your account",
    recover: "Recover your account",
    welcome: "Welcome to LabelBridge",
  }[step];
  const message = local ?? account.error?.message;

  return (
    <main id="main" tabIndex={-1} className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-heading">
        <span className="eyebrow">
          {step === "welcome" ? "Account created" : "Optional demo account"}
        </span>
        <h1 id="auth-heading" tabIndex={-1} ref={heading}>
          {title}
        </h1>
        <p>
          {step === "create"
            ? "Save fictional label reviews and support tasks. Demo accounts live in this server's memory only."
            : step === "recover"
              ? "Enter the email you used."
              : step === "welcome"
                ? "Set up a few preferences. You can change these in Settings at any time."
                : "Sign in to your personal workspace."}
        </p>
        <form noValidate onSubmit={submit}>
          {step === "welcome" ? (
            <>
              <label>
                What should we call you?
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={account.account?.name}
                  autoComplete="nickname"
                />
              </label>
              <fieldset className="use-choices">
                <legend>How would you like to use LabelBridge?</legend>
                <label className="choice selected-choice">
                  <input
                    type="checkbox"
                    checked
                    readOnly
                    aria-describedby="use-self"
                  />
                  <span>
                    <b>Read and save my labels</b>
                    <small id="use-self">
                      Your personal label workspace is always available.
                    </small>
                  </span>
                </label>
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={supporter}
                    onChange={(e) => setSupporter(e.target.checked)}
                    aria-describedby="use-supporter"
                  />
                  <span>
                    <b>Help a family member or friend</b>
                    <small id="use-supporter">
                      Choosing this does not give you access to anyone's
                      information. They must invite you and choose what to
                      share.
                    </small>
                  </span>
                </label>
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={volunteer}
                    onChange={(e) => setVolunteer(e.target.checked)}
                    aria-describedby="use-volunteer"
                  />
                  <span>
                    <b>Volunteer to read label text</b>
                    <small id="use-volunteer">
                      Choosing this asks for approval; it does not mean you are
                      approved.
                    </small>
                  </span>
                </label>
              </fieldset>
              <fieldset>
                <legend>Choose a comfortable text size</legend>
                {(["standard", "larger", "largest"] as const).map((s) => (
                  <label key={s} className="choice">
                    <input
                      type="radio"
                      name="welcome-size"
                      checked={size === s}
                      onChange={() => {
                        setSize(s);
                        onTextSize(s);
                      }}
                    />
                    {s[0].toUpperCase() + s.slice(1)}
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <>
              {step === "create" && (
                <label>
                  Preferred name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="nickname"
                    required
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              {step !== "recover" && (
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      step === "create" ? "new-password" : "current-password"
                    }
                    aria-describedby={
                      step === "create" ? "password-hint" : undefined
                    }
                    required
                  />
                  {step === "create" && (
                    <span id="password-hint" className="hint">
                      At least 10 characters. Do not reuse a real password.
                    </span>
                  )}
                </label>
              )}
            </>
          )}
          {message && (
            <p
              className={`banner ${account.error?.code === "PROVIDER_UNAVAILABLE" ? "banner-info" : "banner-error"}`}
              role="alert"
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            className="primary wide"
            disabled={account.pending}
          >
            {account.pending
              ? "Please wait…"
              : {
                  signin: "Sign in",
                  create: "Create account",
                  recover: "Request recovery",
                  welcome: "Finish setup",
                }[step]}
          </button>
        </form>
        {step !== "welcome" && (
          <>
            <div className="auth-links">
              {step === "signin" && (
                <button type="button" onClick={() => setStep("recover")}>
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(step === "signin" ? "create" : "signin")}
              >
                {step === "signin"
                  ? "Create an account"
                  : "Already have an account? Sign in"}
              </button>
            </div>
            <div className="or">
              <span>or</span>
            </div>
            <button type="button" className="demo-button" onClick={onGuest}>
              Try the demo without signing in
            </button>
          </>
        )}
      </section>
    </main>
  );
}
