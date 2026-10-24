import type { Case } from "@labelbridge/contracts";
import { ApiError } from "./errors";
import type { ValidatedImage } from "./image";

export const caseLifetimeMs = 60 * 60 * 1000;
const tombstoneLifetimeMs = 24 * 60 * 60 * 1000;
const maxCases = 500;

export type CaseRecord = {
  case: Case;
  workspaceId: string;
  image: ValidatedImage | null;
};

export type Lookup =
  | { status: "found"; record: CaseRecord }
  | { status: "expired" }
  | { status: "missing" };

// Single-process in-memory store for the synthetic demo. All state, including
// images, is lost on restart; nothing is written to disk.
export class CaseStore {
  private cases = new Map<string, CaseRecord>();
  private tombstones = new Map<string, number>();
  constructor(private now: () => number) {}

  create(record: CaseRecord) {
    this.sweep();
    if (this.cases.size >= maxCases)
      throw new ApiError(
        "RATE_LIMITED",
        "Demo case capacity reached; try again later.",
      );
    this.cases.set(record.case.id, record);
    return record;
  }

  lookup(id: string): Lookup {
    const record = this.cases.get(id);
    if (record) {
      if (Date.parse(record.case.expiresAt) > this.now())
        return { status: "found", record };
      this.expire(id);
      return { status: "expired" };
    }
    return this.tombstones.has(id)
      ? { status: "expired" }
      : { status: "missing" };
  }

  // Callers check the revision and write in one synchronous step, so
  // concurrent requests in this single-process store cannot interleave.
  // Derived explanations/savings/plans will be invalidated here.
  replaceCase(record: CaseRecord, next: Case) {
    record.case = next;
  }

  delete(id: string) {
    return this.cases.delete(id);
  }

  sweep() {
    const now = this.now();
    for (const [id, record] of this.cases)
      if (Date.parse(record.case.expiresAt) <= now) this.expire(id);
    for (const [id, at] of this.tombstones)
      if (now - at > tombstoneLifetimeMs) this.tombstones.delete(id);
  }

  private expire(id: string) {
    this.cases.delete(id);
    this.tombstones.set(id, this.now());
  }
}
