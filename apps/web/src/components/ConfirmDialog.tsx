import { useEffect, useRef } from "react";

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Defaults to "Keep working". */
  cancelLabel?: string;
  /** Runs when the dialog closes without confirming (button or Escape). */
  onCancel?: () => void;
  /** "danger" (default) for discarding; "primary" for a safe action. */
  tone?: "danger" | "primary";
}

/**
 * Modal confirmation built on the native <dialog>: showModal() keeps focus
 * inside, Escape cancels, and focus returns to the control that opened it.
 */
export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (request && !el.open) {
      confirmed.current = false;
      opener.current = document.activeElement;
      el.showModal();
      cancel.current?.focus();
    } else if (!request && el.open) el.close();
  }, [request]);

  const restoreFocus = () => {
    const target = opener.current;
    opener.current = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  };

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onClose={() => {
        if (!confirmed.current) request?.onCancel?.();
        restoreFocus();
        onClose();
      }}
    >
      {request && (
        <>
          <h2 id="confirm-title">{request.title}</h2>
          <p id="confirm-body">{request.body}</p>
          <div className="dialog-actions">
            <button
              ref={cancel}
              type="button"
              className="secondary"
              onClick={() => dialog.current?.close()}
            >
              {request.cancelLabel ?? "Keep working"}
            </button>
            <button
              type="button"
              className={`primary ${request.tone === "primary" ? "" : "danger"}`}
              onClick={() => {
                const run = request.onConfirm;
                confirmed.current = true;
                // The action moves focus itself (to the next step's heading).
                opener.current = null;
                dialog.current?.close();
                run();
              }}
            >
              {request.confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
