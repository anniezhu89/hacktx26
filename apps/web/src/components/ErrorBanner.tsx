import type { SessionError } from "../state/useCaseSession";

export function ErrorBanner({
  error,
  retrying,
}: {
  error: SessionError;
  retrying: boolean;
}) {
  return (
    <div className="banner banner-error" role="alert">
      <p>
        <strong>Something went wrong.</strong> {error.error.message}
      </p>
      {error.retry ? (
        <button type="button" onClick={error.retry} disabled={retrying}>
          Try again
        </button>
      ) : (
        <p>This cannot be fixed by trying again.</p>
      )}
      {error.error.requestId && (
        <p className="meta">Reference: {error.error.requestId}</p>
      )}
    </div>
  );
}
