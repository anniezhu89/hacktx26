import type { Case } from "@labelbridge/contracts";

/** Tracks the latest request so older responses can be ignored. */
export function createLatestTracker() {
  let latest = 0;
  return {
    begin: () => ++latest,
    invalidate: () => {
      latest++;
    },
    isCurrent: (token: number) => token === latest,
  };
}

/** Never let a response for another case or an older revision replace state. */
export function shouldAcceptCase(current: Case | null, incoming: Case) {
  if (!current) return true;
  return current.id === incoming.id && incoming.revision >= current.revision;
}
