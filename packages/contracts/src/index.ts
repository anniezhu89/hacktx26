import { z } from "zod";
export const contractVersion = "1" as const;
const id = z.string().min(1);
const timestamp = z.string().datetime();
export const fieldKey = z.enum([
  "medicationName",
  "strength",
  "dosageForm",
  "quantity",
  "exactDirections",
]);
export const reviewState = z.enum([
  "unreviewed",
  "user_confirmed",
  "needs_help",
  "unresolved",
]);
export const crop = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .refine(
    (c) => c.x + c.width <= 1 && c.y + c.height <= 1,
    "Crop exceeds image",
  );
export const labelField = z
  .object({
    key: fieldKey,
    rawText: z.string().nullable(),
    value: z.string().nullable(),
    evidence: z.string(),
    crop: crop.nullable(),
    provenance: z.enum(["ai", "user", "volunteer"]),
    reviewState,
  })
  .strict();
export const task = z
  .object({
    id,
    category: z.enum([
      "research",
      "call_pharmacy",
      "transport",
      "review_label",
    ]),
    description: z.string().min(1),
    owner: id.nullable(),
    // v1.2: which demo persona accepted the task (one person per role per
    // synthetic workspace). Absent or null while proposed.
    ownerRole: z.enum(["patient", "supporter"]).nullable().optional(),
    status: z.enum(["proposed", "accepted", "completed"]),
    acceptedAt: timestamp.nullable(),
  })
  .strict()
  .refine(
    (t) =>
      t.status === "proposed"
        ? t.owner === null && t.acceptedAt === null && !t.ownerRole
        : t.owner !== null && t.acceptedAt !== null,
    "Task acceptance requires explicit owner and timestamp",
  );
export const caseSchema = z
  .object({
    id,
    revision: z.number().int().nonnegative(),
    // v1.2: the revision at which label fields last changed. Task, plan and
    // sharing changes bump `revision` but not this, so explanations and
    // savings (whose fieldRevision refers to it) stay valid. Absent means
    // equal to `revision`.
    fieldsRevision: z.number().int().nonnegative().optional(),
    createdAt: timestamp,
    expiresAt: timestamp,
    fictionalData: z.literal(true),
    status: z.enum(["reviewing", "needs_help", "ready"]),
    fields: z
      .array(labelField)
      .length(5)
      .refine(
        (f) => new Set(f.map((v) => v.key)).size === 5,
        "All five distinct fields required",
      ),
    sharing: z
      .object({ supporter: z.boolean(), fieldKeys: z.array(fieldKey) })
      .strict(),
    questions: z.array(z.string()),
    tasks: z.array(task),
  })
  .strict();
export const reference = z
  .object({ passage: z.string().min(1), url: z.string().url() })
  .strict();
export const explanation = z
  .object({
    originalDirections: z.string(),
    simplifiedText: z.string(),
    fieldRevision: z.number().int().nonnegative(),
    references: z.array(reference),
    unresolvedQuestions: z.array(z.string()),
    eligibleForExplanation: z.boolean(),
  })
  .strict();
export const productAttributes = z
  .object({
    medicationName: z.string().nullable(),
    strength: z.string().nullable(),
    dosageForm: z.string().nullable(),
    quantity: z.string().nullable(),
    location: z.string().nullable(),
  })
  .strict();
export const savingsOption = z
  .object({
    id,
    sourceTitle: z.string(),
    url: z.string().url(),
    retrievedAt: timestamp,
    matchedProduct: productAttributes,
    optionType: z.enum(["program", "coupon", "price", "resource"]),
    amount: z.number().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
    priceBasis: z.enum(["source_listed", "estimate", "unknown"]),
    sourceEvidence: z.string().nullable(),
    eligibilityNotes: z.array(z.string()),
    missingRequirements: z.array(z.string()),
  })
  .strict()
  .refine(
    (s) =>
      s.amount === null ||
      (!!s.sourceEvidence && s.currency !== null && s.priceBasis !== "unknown"),
    "Amounts require source evidence, currency and price basis",
  );
export const proposal = z
  .object({
    key: fieldKey,
    visibleText: z.string().nullable(),
    evidence: z.string(),
  })
  .strict();
export const reviewRequest = z
  .object({
    id,
    caseId: id,
    caseRevision: z.number().int().nonnegative(),
    selectedFields: z.array(fieldKey).min(1),
    consentAt: timestamp,
    status: z.enum([
      "pending",
      "claimed",
      "submitted",
      "needs_new_image",
      "closed",
    ]),
    proposals: z.array(proposal),
  })
  .strict();
// v1.1: what a claiming reviewer may see for one selected field. Label
// evidence only: never extracted values, rawText or other AI suggestions.
// textExcerpt is verbatim patient-supplied label text (text intake), or null.
export const reviewerExcerpt = z
  .object({
    key: fieldKey,
    textExcerpt: z.string().nullable(),
    crop: crop.nullable(),
  })
  .strict();
// v1.1: reviewer's view of a claimed request. imageUrl is a server-issued,
// authorized path (GET /api/reviews/:id/image, claimer only) or null.
export const reviewerView = z
  .object({
    review: reviewRequest,
    excerpts: z.array(reviewerExcerpt),
    imageUrl: z
      .string()
      .regex(/^\/api\/reviews\/[^/]+\/image$/)
      .nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.excerpts.length === v.review.selectedFields.length &&
      v.excerpts.every((e) => v.review.selectedFields.includes(e.key)),
    "Excerpts must cover exactly the selected fields",
  );
export const expectedRevision = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();
export const intakeRequest = z
  .object({
    text: z.string().trim().min(1).max(20000),
    fictionalDataAcknowledged: z.literal(true),
  })
  .strict();
export const fieldsRequest = expectedRevision.extend({
  changes: z
    .array(
      z
        .object({
          key: fieldKey,
          value: z.string().nullable(),
          reviewState,
          // v1.1: applying a volunteer proposal. The server must check that
          // this review belongs to the case and submitted this exact value.
          fromReviewId: id.optional(),
        })
        .strict(),
    )
    .min(1),
});
export const savingsRequest = expectedRevision.extend({
  location: z.string().min(1).max(100),
  copay: z.number().nonnegative().optional(),
});
export const reviewCreateRequest = expectedRevision.extend({
  selectedFields: z.array(fieldKey).min(1),
  consent: z.literal(true),
});
export const reviewClaimRequest = z
  .object({ expectedState: z.literal("pending") })
  .strict();
export const reviewResponseRequest = expectedRevision.extend({
  outcome: z.enum(["submitted", "needs_new_image"]),
  proposals: z.array(proposal),
});
export const planRequest = expectedRevision.extend({
  supporterConstraints: z.array(
    z
      .object({
        supporterId: id,
        availability: z.string(),
        transport: z.string(),
        budget: z.number().nonnegative().nullable(),
      })
      .strict(),
  ),
  selectedOptionIds: z.array(id),
});
export const taskRequest = expectedRevision.extend({
  action: z.enum(["claim", "complete", "release"]),
});
export const demoSessionRequest = z
  .object({ role: z.enum(["patient", "supporter", "reviewer"]) })
  .strict();
export const errorCodes = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "REVISION_CONFLICT",
  "STATE_CONFLICT",
  "EXPIRED",
  "IMAGE_TOO_LARGE",
  "UNSUPPORTED_IMAGE",
  "NEEDS_CLARIFICATION",
  "INVALID_OUTPUT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
]);
export const apiError = z
  .object({
    error: z
      .object({
        code: errorCodes,
        message: z.string(),
        retryable: z.boolean(),
        requestId: id,
      })
      .strict(),
  })
  .strict();
export const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      contractVersion: z.literal("1"),
      requestId: id,
      dataMode: z.enum(["live", "cached", "fixture"]),
      data,
    })
    .strict();
export const healthResponse = envelope(
  z
    .object({
      status: z.literal("ok"),
      providers: z
        .object({
          // v1.3: image extraction can run against a live provider. The other
          // two stay literal "fixture" until they are actually implemented, so
          // the contract itself prevents claiming a provider that does not run.
          extraction: z.enum(["fixture", "live"]),
          explanation: z.literal("fixture"),
          // v1.4: reports only whether the search adapter is configured, and
          // it currently serves the pharmacy lookup alone. "live" here is not
          // a claim that savings-search works; that route is still pending.
          search: z.enum(["fixture", "live"]),
        })
        .strict(),
    })
    .strict(),
);
export const caseResponse = envelope(caseSchema);
export const explanationResponse = envelope(explanation);
export const savingsResponse = envelope(
  z.object({ options: z.array(savingsOption) }).strict(),
);
export const reviewResponse = envelope(reviewRequest);
export const reviewsResponse = envelope(z.array(reviewRequest));
// v1.1 routes (additive; wire contractVersion stays "1"):
//   GET  /api/cases/:id/reviews   patient owner → reviewsResponse
//   POST /api/reviews/:id/claim   reviewer      → reviewerViewResponse
//   GET  /api/reviews/:id         claimer only  → reviewerViewResponse
//   GET  /api/reviews/:id/image   claimer only  → image/png or image/jpeg
// GET /api/reviews (queue) stays reviewsResponse: no excerpts before a claim.
export const reviewerViewResponse = envelope(reviewerView);
export const planResponse = envelope(
  z
    .object({
      tasks: z.array(task),
      tradeoffs: z.array(z.string()),
      fieldRevision: z.number().int().nonnegative(),
    })
    .strict(),
);
export const deletionResponse = envelope(
  z.object({ deleted: z.literal(true) }).strict(),
);
// v1.2 shared support (additive; wire contractVersion stays "1"):
//   PATCH /api/cases/:id/sharing         patient   sharingRequest → caseResponse
//   GET   /api/shared                    supporter → sharedCasesResponse
//   POST  /api/cases/:id/plan            patient   planRequest → planResponse
//   PATCH /api/cases/:id/tasks/:taskId   patient or supporter (case must be
//         shared for the supporter) taskRequest → taskActionResponse
export const sharingRequest = expectedRevision.extend({
  supporter: z.boolean(),
  fieldKeys: z
    .array(fieldKey)
    .refine((k) => new Set(k).size === k.length, "Duplicate field"),
});
// What a supporter may see: permitted field values and review states only
// (no evidence, crops or raw text), plus the practical task list.
export const sharedField = z
  .object({ key: fieldKey, value: z.string().nullable(), reviewState })
  .strict();
export const sharedCase = z
  .object({
    caseId: id,
    revision: z.number().int().nonnegative(),
    expiresAt: timestamp,
    fictionalData: z.literal(true),
    fields: z.array(sharedField),
    tasks: z.array(task),
  })
  .strict();
export const sharedCasesResponse = envelope(z.array(sharedCase));
export const taskActionResponse = envelope(
  z.object({ task, caseRevision: z.number().int().nonnegative() }).strict(),
);
export const sessionResponse = envelope(
  z.object({ role: z.enum(["patient", "supporter", "reviewer"]) }).strict(),
);
// v1.4 pharmacy lookup (additive; wire contractVersion stays "1"):
//   POST /api/cases/:id/pharmacies   patient   pharmacySearchRequest
//                                              → pharmaciesResponse
//
// Deliberately coarse. The search provider is a third party, so the only
// location it may receive is a ZIP code or a place name: never a street
// address, and never anything read off the label. An allowlist is used rather
// than a denylist of street patterns, so an unanticipated format is rejected
// instead of forwarded.
const placeName = /^[\p{L} .'-]{2,60}(,\s*\p{L}{2,})?$/u;
export const coarseLocation = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .refine(
    (v) => /^\d{5}$/.test(v) || placeName.test(v),
    "Use a 5-digit ZIP code or a place name, not a street address",
  );
export const pharmacy = z
  .object({
    id,
    name: z.string().min(1),
    address: z.string().min(1),
    phone: z.string().nullable(),
    website: z.string().url().nullable(),
    // Verbatim source text, never parsed into an "open now" claim: opening
    // hours go stale and sending someone to a closed pharmacy is a real harm.
    hoursText: z.string().nullable(),
    // Position in the source's own ordering. See `ordering` below.
    sourceRank: z.number().int().positive(),
  })
  .strict();
export const pharmacyLookup = z
  .object({
    locationQuery: coarseLocation,
    sourceTitle: z.string().min(1),
    retrievedAt: timestamp,
    // The source's relevance order. No distance is measured, ranked or
    // claimed: a coarse location gives no point to measure from, so calling
    // any of these the "closest" pharmacy would be unfounded.
    ordering: z.literal("source_order"),
    // `location_not_recognised` is its own state because the provider answers
    // an unusable location with a successful-looking list of unrelated places.
    status: z.enum(["ok", "no_results", "location_not_recognised"]),
    results: z.array(pharmacy),
    notes: z.array(z.string()),
  })
  .strict()
  .refine(
    (l) => (l.status === "ok" ? l.results.length > 0 : l.results.length === 0),
    "Results are only valid with status ok",
  )
  .refine(
    (l) =>
      new Set(l.results.map((r) => r.sourceRank)).size === l.results.length,
    "Duplicate sourceRank",
  );
// No `expectedRevision`, unlike the other case routes: a pharmacy list is
// derived from the location alone and from nothing on the label, so tying it
// to a revision would both imply a dependency that does not exist and discard
// a valid list whenever an unrelated task or sharing change bumped the case.
export const pharmacySearchRequest = z
  .object({ location: coarseLocation })
  .strict();
export const pharmaciesResponse = envelope(pharmacyLookup);
export type Pharmacy = z.infer<typeof pharmacy>;
export type PharmacyLookup = z.infer<typeof pharmacyLookup>;

export function assertRevision(actual: number, expected: number) {
  if (actual !== expected) throw new Error("REVISION_CONFLICT");
}
export function eligibleForExplanation(fields: z.infer<typeof labelField>[]) {
  return ["medicationName", "strength", "dosageForm", "exactDirections"].every(
    (key) =>
      fields.some(
        (f) =>
          f.key === key &&
          !!f.value?.trim() &&
          f.reviewState === "user_confirmed",
      ),
  );
}
export type Case = z.infer<typeof caseSchema>;
export type ReviewRequest = z.infer<typeof reviewRequest>;
export type ReviewerView = z.infer<typeof reviewerView>;

// Storage adapters must replace dependent caches atomically with this revision.
// Accepted tasks are retained; suggestions must be regenerated separately.
export function applyFieldChanges(
  current: Case,
  input: z.infer<typeof fieldsRequest>,
) {
  const parsed = fieldsRequest.parse(input);
  assertRevision(current.revision, parsed.expectedRevision);
  if (new Set(parsed.changes.map((c) => c.key)).size !== parsed.changes.length)
    throw new Error("BAD_REQUEST");
  const fields = current.fields.map((field) => {
    const change = parsed.changes.find((c) => c.key === field.key);
    return change
      ? {
          ...field,
          value: change.value,
          reviewState: change.reviewState,
          provenance: change.fromReviewId
            ? ("volunteer" as const)
            : ("user" as const),
        }
      : field;
  });
  const next = caseSchema.parse({
    ...current,
    revision: current.revision + 1,
    fieldsRevision: current.revision + 1,
    fields,
    status: eligibleForExplanation(fields) ? "ready" : "reviewing",
    // Suggestions were made for the old fields; commitments are kept.
    tasks: current.tasks.filter((t) => t.status !== "proposed"),
  });
  return {
    case: next,
    invalidate: ["explanation", "savings", "plan"] as const,
  };
}

export type Task = z.infer<typeof task>;
export type SharedCase = z.infer<typeof sharedCase>;
export type DemoActor = { id: string; role: "patient" | "supporter" };

export const fieldsRevisionOf = (c: Case) => c.fieldsRevision ?? c.revision;

/** The supporter's view: only permitted fields, never evidence or crops. */
export function sharedView(c: Case): SharedCase | null {
  if (!c.sharing.supporter) return null;
  // Values the supporter may not see: unshared fields, and shared fields the
  // patient has not confirmed (unconfirmed automatic readings stay private).
  const hidden = c.fields
    .filter(
      (f) =>
        !c.sharing.fieldKeys.includes(f.key) ||
        f.reviewState !== "user_confirmed",
    )
    .flatMap((f) => [f.value, f.rawText])
    .filter(
      (v): v is string =>
        !!v && (v.trim().length >= 2 || /^\d$/.test(v.trim())),
    );
  // Task text is free text (possibly AI-written): redact hidden values.
  const redact = (text: string) =>
    hidden.reduce(
      (t, v) =>
        t.replace(
          // Whole-word match, so "30" does not hit "300".
          new RegExp(
            `(?<![\\w.])${v.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`,
            "gi",
          ),
          "[not shared]",
        ),
      text,
    );
  return sharedCase.parse({
    caseId: c.id,
    revision: c.revision,
    expiresAt: c.expiresAt,
    fictionalData: true,
    fields: c.fields
      .filter((f) => c.sharing.fieldKeys.includes(f.key))
      .map((f) => ({
        key: f.key,
        value: f.reviewState === "user_confirmed" ? f.value : null,
        reviewState: f.reviewState,
      })),
    tasks: c.tasks.map((t) => ({ ...t, description: redact(t.description) })),
  });
}

const bump = (current: Case, patch: Partial<Case>) =>
  caseSchema.parse({
    ...current,
    ...patch,
    revision: current.revision + 1,
    fieldsRevision: fieldsRevisionOf(current),
  });

export function applySharing(
  current: Case,
  input: z.infer<typeof sharingRequest>,
) {
  const parsed = sharingRequest.parse(input);
  assertRevision(current.revision, parsed.expectedRevision);
  return bump(current, {
    sharing: {
      supporter: parsed.supporter,
      fieldKeys: parsed.supporter ? parsed.fieldKeys : [],
    },
  });
}

/**
 * Replace earlier suggestions with new ones while keeping every accepted or
 * completed task exactly as it was: changing availability never cancels a
 * commitment.
 */
export function applyPlanTasks(current: Case, proposals: Task[]) {
  const kept = current.tasks.filter((t) => t.status !== "proposed");
  const fresh = proposals.map((t) =>
    task.parse({
      ...t,
      owner: null,
      ownerRole: null,
      acceptedAt: null,
      status: "proposed",
    }),
  );
  const ids = [...kept, ...fresh].map((t) => t.id);
  if (new Set(ids).size !== ids.length) throw new Error("BAD_REQUEST");
  return bump(current, { tasks: [...kept, ...fresh] });
}

/**
 * Claim, complete or release a task. Throws REVISION_CONFLICT, NOT_FOUND,
 * STATE_CONFLICT (e.g. already claimed) or FORBIDDEN (not the owner).
 */
export function applyTaskAction(
  current: Case,
  taskId: string,
  input: z.infer<typeof taskRequest>,
  actor: DemoActor,
  now: string,
) {
  const parsed = taskRequest.parse(input);
  assertRevision(current.revision, parsed.expectedRevision);
  const existing = current.tasks.find((t) => t.id === taskId);
  if (!existing) throw new Error("NOT_FOUND");
  // Ownership is by demo role (one person per role per synthetic workspace);
  // actor.id is recorded as owner but not compared, because demo sessions may
  // issue a new actor id when switching persona.
  const mine = existing.ownerRole === actor.role;
  // When sharing is off the supporter cannot reach the task, so the patient
  // may hand it back rather than leave it stranded.
  const strandedSupporterTask =
    actor.role === "patient" &&
    existing.ownerRole === "supporter" &&
    !current.sharing.supporter;
  let updated: Task;
  if (parsed.action === "claim") {
    if (existing.status !== "proposed") throw new Error("STATE_CONFLICT");
    updated = {
      ...existing,
      status: "accepted",
      owner: actor.id,
      ownerRole: actor.role,
      acceptedAt: now,
    };
  } else {
    if (existing.status === "proposed") throw new Error("STATE_CONFLICT");
    if (!mine && !(parsed.action === "release" && strandedSupporterTask))
      throw new Error("FORBIDDEN");
    if (existing.status === "completed") throw new Error("STATE_CONFLICT");
    updated =
      parsed.action === "complete"
        ? { ...existing, status: "completed" }
        : {
            ...existing,
            status: "proposed",
            owner: null,
            ownerRole: null,
            acceptedAt: null,
          };
  }
  const next = bump(current, {
    tasks: current.tasks.map((t) =>
      t.id === taskId ? task.parse(updated) : t,
    ),
  });
  return { case: next, task: next.tasks.find((t) => t.id === taskId)! };
}
