import type { ReactNode } from "react";
import type { ReviewState } from "../domain/types";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Page({
  kicker,
  title,
  lede,
  children,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <div className="lb-stack-lg">
      <header className="lb-stack">
        {kicker ? <p className="lb-kicker">{kicker}</p> : null}
        <h1 id="page-title" tabIndex={-1} className="lb-title">
          {title}
        </h1>
        {lede ? <p className="lb-lede">{lede}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function Alert({
  tone,
  title,
  children,
}: {
  tone: "amber" | "rose" | "sage" | "plain";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={tone === "plain" ? "lb-alert" : `lb-alert lb-alert-${tone}`} role="status" tabIndex={-1}>
      <strong>{title}</strong>
      <div className="lb-prose">{children}</div>
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "sage" | "amber" | "rose" | "ink" | "plain";
  children: string;
}) {
  return <span className={tone === "plain" ? "lb-pill" : `lb-pill lb-pill-${tone}`}>{children}</span>;
}

export function reviewTone(state: ReviewState): "sage" | "amber" | "rose" | "plain" {
  switch (state) {
    case "user_confirmed":
      return "sage";
    case "unreviewed":
      return "amber";
    case "needs_help":
      return "amber";
    case "unresolved":
      return "rose";
  }
}

export function DemoFailureToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <details className="lb-details">
      <summary>Demo controls</summary>
      <label className="lb-check">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    </details>
  );
}
