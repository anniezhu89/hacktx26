import { randomUUID } from "node:crypto";
import { reviewRequest, type ReviewRequest } from "@labelbridge/contracts";
import { ApiError } from "./errors";
import type { ValidatedImage } from "./image";

export const claimLifetimeMs = 15 * 60 * 1000;

/** Who holds a claim: an approved volunteer account, or a guest demo session. */
export type Reader =
  { kind: "account"; id: string } | { kind: "guest"; workspaceId: string };

export type ReviewRecord = {
  review: ReviewRequest;
  /** The patient's workspace (owner of the case). */
  workspaceId: string;
  /** The patient's account when the case belongs to one. */
  ownerAccountId: string | null;
  /** The section the patient cropped; the full label image is never stored here. */
  image: ValidatedImage | null;
  claimedBy: Reader | null;
};

const sameReader = (a: Reader | null, b: Reader) =>
  !!a &&
  (a.kind === "account" && b.kind === "account"
    ? a.id === b.id
    : a.kind === "guest" &&
      b.kind === "guest" &&
      a.workspaceId === b.workspaceId);

/**
 * Reading-help requests. All transitions run synchronously after their checks,
 * so in this single-process store two claims cannot both succeed.
 */
export class ReviewStore {
  private records = new Map<string, ReviewRecord>();
  constructor(private now: () => number) {}

  create(
    input: Omit<ReviewRecord, "claimedBy" | "image" | "review"> & {
      caseId: string;
      caseRevision: number;
      selectedFields: ReviewRequest["selectedFields"];
    },
  ) {
    const record: ReviewRecord = {
      workspaceId: input.workspaceId,
      ownerAccountId: input.ownerAccountId,
      image: null,
      claimedBy: null,
      review: reviewRequest.parse({
        id: randomUUID(),
        caseId: input.caseId,
        caseRevision: input.caseRevision,
        selectedFields: input.selectedFields,
        consentAt: new Date(this.now()).toISOString(),
        status: "pending",
        proposals: [],
        claimExpiresAt: null,
      }),
    };
    this.records.set(record.review.id, record);
    return record;
  }

  /** A lapsed claim returns the request to the queue. */
  private refresh(record: ReviewRecord) {
    const expires = record.review.claimExpiresAt;
    if (
      record.review.status === "claimed" &&
      expires &&
      Date.parse(expires) <= this.now()
    ) {
      record.claimedBy = null;
      record.review = {
        ...record.review,
        status: "pending",
        claimExpiresAt: null,
      };
    }
    return record;
  }

  get(id: string) {
    const record = this.records.get(id);
    if (!record) throw new ApiError("NOT_FOUND", "Reading request not found.");
    return this.refresh(record);
  }

  forCase(caseId: string) {
    return [...this.records.values()]
      .filter((r) => r.review.caseId === caseId)
      .map((r) => this.refresh(r));
  }

  /** Whether a request is ever meant for this reader, regardless of state. */
  private eligible(r: ReviewRecord, reader: Reader) {
    return reader.kind === "guest"
      ? // Guest demo: a single browser reads its own synthetic request.
        r.workspaceId === reader.workspaceId && r.ownerAccountId === null
      : // Approved volunteers read other people's account requests only.
        r.ownerAccountId !== null && r.ownerAccountId !== reader.id;
  }

  /** Pending requests, plus any this reader holds; never their own. */
  queueFor(reader: Reader) {
    return [...this.records.values()]
      .map((r) => this.refresh(r))
      .filter(
        (r) =>
          this.eligible(r, reader) &&
          (r.review.status === "pending" ||
            (r.review.status === "claimed" && sameReader(r.claimedBy, reader))),
      );
  }

  claim(id: string, reader: Reader) {
    const record = this.get(id);
    if (!this.eligible(record, reader) || record.review.status === "closed")
      throw new ApiError("FORBIDDEN", "This request is not available to you.");
    if (record.review.status !== "pending")
      throw new ApiError(
        "STATE_CONFLICT",
        "Someone else already claimed or answered this request.",
      );
    record.claimedBy = reader;
    record.review = {
      ...record.review,
      status: "claimed",
      claimExpiresAt: new Date(this.now() + claimLifetimeMs).toISOString(),
    };
    return record;
  }

  /** The record, if this reader currently holds an unexpired claim on it. */
  claimedBy(id: string, reader: Reader) {
    const record = this.get(id);
    if (
      record.review.status !== "claimed" ||
      !sameReader(record.claimedBy, reader)
    )
      throw new ApiError(
        "FORBIDDEN",
        "Claim this request first; claims expire after 15 minutes.",
      );
    return record;
  }

  release(id: string, reader: Reader) {
    const record = this.claimedBy(id, reader);
    record.claimedBy = null;
    record.review = {
      ...record.review,
      status: "pending",
      claimExpiresAt: null,
    };
    return record;
  }

  respond(
    id: string,
    reader: Reader,
    outcome: "submitted" | "needs_new_image",
    proposals: ReviewRequest["proposals"],
  ) {
    const record = this.claimedBy(id, reader);
    record.claimedBy = null;
    record.review = reviewRequest.parse({
      ...record.review,
      status: outcome,
      proposals: outcome === "submitted" ? proposals : [],
      claimExpiresAt: null,
    });
    return record;
  }

  cancel(id: string) {
    const record = this.get(id);
    if (
      record.review.status !== "pending" &&
      record.review.status !== "claimed"
    )
      throw new ApiError(
        "STATE_CONFLICT",
        "Only an open request can be canceled.",
      );
    record.claimedBy = null;
    record.image = null;
    record.review = {
      ...record.review,
      status: "closed",
      claimExpiresAt: null,
    };
    return record;
  }

  forgetCase(caseId: string) {
    for (const [id, r] of this.records)
      if (r.review.caseId === caseId) this.records.delete(id);
  }
}
