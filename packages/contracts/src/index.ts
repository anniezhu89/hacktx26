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
    // v1.6: "declined" (a supporter said no to a suggestion) and "canceled"
    // (the patient withdrew it) are terminal and kept for the record.
    status: z.enum([
      "proposed",
      "accepted",
      "completed",
      "declined",
      "canceled",
    ]),
    acceptedAt: timestamp.nullable(),
  })
  .strict()
  .refine(
    (t) =>
      t.status === "proposed" || t.status === "declined"
        ? t.owner === null && t.acceptedAt === null && !t.ownerRole
        : t.status === "canceled" ||
          (t.owner !== null && t.acceptedAt !== null),
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
    // v1.6: a claim lapses at this time unless a response arrives first.
    claimExpiresAt: timestamp.nullable().optional(),
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
  // v1.5: optional and coarse. The programs search deliberately sends no
  // location at all: adding one measurably degraded results (generic
  // manufacturer portals displaced the drug's own programs), and it is extra
  // data for a third party to no benefit. Kept in the contract because a
  // later price search needs it, and coarse for the same reason the pharmacy
  // lookup is, so a street address can never be forwarded.
  location: coarseLocation.optional(),
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
  // v1.6: supporters may decline a suggestion; the patient may cancel one.
  action: z.enum(["claim", "complete", "release", "decline", "cancel"]),
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
// v1.5: a bare option list could not distinguish "nothing was found" from
// "we could not tell which medication this is", and those need different
// answers. A search engine will answer an invented drug name with a real
// different drug's results, so the second state is not hypothetical.
export const savingsLookup = z
  .object({
    /** The generic actually searched for, or null when none was identified. */
    product: z.string().min(1).nullable(),
    sourceTitle: z.string().min(1),
    retrievedAt: timestamp,
    status: z.enum(["ok", "no_results", "product_not_identified"]),
    options: z.array(savingsOption),
    notes: z.array(z.string()),
  })
  .strict()
  .refine(
    (s) => (s.status === "ok" ? s.options.length > 0 : s.options.length === 0),
    "Options are only valid with status ok",
  )
  .refine(
    (s) => (s.status === "product_not_identified") === (s.product === null),
    "product is null exactly when the medication was not identified",
  );
export const savingsResponse = envelope(savingsLookup);
export type SavingsLookup = z.infer<typeof savingsLookup>;
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
  if (parsed.action === "decline") {
    if (actor.role !== "supporter") throw new Error("FORBIDDEN");
    if (existing.status !== "proposed") throw new Error("STATE_CONFLICT");
    updated = { ...existing, status: "declined" };
  } else if (parsed.action === "cancel") {
    // Only the patient withdraws a task; a supporter releases or declines.
    if (actor.role !== "patient") throw new Error("FORBIDDEN");
    if (existing.status !== "proposed" && existing.status !== "accepted")
      throw new Error("STATE_CONFLICT");
    updated = { ...existing, status: "canceled" };
  } else if (parsed.action === "claim") {
    if (existing.status !== "proposed") throw new Error("STATE_CONFLICT");
    updated = {
      ...existing,
      status: "accepted",
      owner: actor.id,
      ownerRole: actor.role,
      acceptedAt: now,
    };
  } else {
    if (existing.status !== "accepted") throw new Error("STATE_CONFLICT");
    if (!mine && !(parsed.action === "release" && strandedSupporterTask))
      throw new Error("FORBIDDEN");
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

// ---------------------------------------------------------------------------
// v1.6 (additive; wire contractVersion stays "1"). Demo accounts, support
// circle, volunteer reading and the medicine translator.
//
//   Accounts (in-memory demo accounts; not production authentication)
//     GET    /api/account                      → accountResponse (null = guest)
//     POST   /api/account/signup   signupRequest      → accountResponse
//     POST   /api/account/signin   signinRequest      → accountResponse
//     POST   /api/account/signout                     → accountResponse
//     PATCH  /api/account          preferencesRequest → accountResponse
//     DELETE /api/account          deleteAccountRequest → deletionResponse
//     POST   /api/account/recovery recoveryRequest    → 503 PROVIDER_UNAVAILABLE
//     GET    /api/account/labels                      → savedLabelsResponse
//     POST   /api/account/labels   attachRequest      → savedLabelsResponse
//   Support circle (accounts only)
//     GET    /api/circle                              → circleResponse
//     POST   /api/circle/invitations inviteRequest    → invitationCreatedResponse
//     DELETE /api/circle/invitations/:id              → circleResponse
//     POST   /api/circle/accept    acceptInviteRequest → circleResponse
//     PUT    /api/circle/connections/:id/grants/:caseId grantRequest → circleResponse
//     DELETE /api/circle/connections/:id/grants/:caseId → circleResponse
//     DELETE /api/circle/connections/:id              → circleResponse
//     GET    /api/circle/shared                       → sharedLabelsResponse
//     GET    /api/circle/shared/:caseId/image          (image grant only)
//     PATCH  /api/circle/shared/:caseId/tasks/:taskId  taskRequest → taskActionResponse
//   Volunteer (approved accounts; queue excludes their own requests)
//     PUT    /api/reviews/:id/image   multipart image (patient, before claim)
//     POST   /api/reviews/:id/release | /cancel       → reviewResponse
//   Medicine translator (patient; confirmed critical fields required)
//     POST   /api/cases/:id/medicine/candidates medicineLookupRequest
//     POST   /api/cases/:id/medicine/confirm    medicineConfirmRequest
//     POST   /api/cases/:id/medicine/info       medicineInfoRequest
// ---------------------------------------------------------------------------

export const textSize = z.enum(["standard", "larger", "largest"]);
/** Optional workspaces. Reading and saving one's own labels is always on. */
export const workspaceUses = z
  .object({ supporter: z.boolean(), volunteer: z.boolean() })
  .strict();
export const account = z
  .object({
    id,
    name: z.string().min(1).max(60),
    email: z.string().email(),
    uses: workspaceUses,
    textSize,
    // Server-side approval state; choosing "volunteer" only requests it.
    volunteerStatus: z.enum(["not_requested", "pending", "approved"]),
    createdAt: timestamp,
    /** Plain statement of where data lives and when it is deleted. */
    retention: z.string(),
  })
  .strict();
const email = z.string().trim().toLowerCase().email().max(200);
export const signupRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    email,
    password: z.string().min(10).max(200),
    uses: workspaceUses,
    textSize: textSize.optional(),
    fictionalDataAcknowledged: z.literal(true),
  })
  .strict();
export const signinRequest = z
  .object({ email, password: z.string().min(1).max(200) })
  .strict();
export const preferencesRequest = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    uses: workspaceUses.optional(),
    textSize: textSize.optional(),
  })
  .strict();
export const deleteAccountRequest = z
  .object({
    password: z.string().min(1).max(200),
    confirm: z.literal("DELETE"),
  })
  .strict();
export const recoveryRequest = z.object({ email }).strict();
export const accountResponse = envelope(
  z.object({ account: account.nullable() }).strict(),
);
export const savedLabel = z
  .object({
    caseId: id,
    /** The confirmed medication name, or null while it is unconfirmed. */
    title: z.string().nullable(),
    status: z.enum(["reviewing", "needs_help", "ready"]),
    confirmedRequired: z.number().int().min(0).max(4),
    savedAt: timestamp,
    expiresAt: timestamp,
  })
  .strict();
export const savedLabelsResponse = envelope(z.array(savedLabel));
export const attachRequest = z.object({ caseId: id }).strict();

export const supportScope = z.enum(["reading_and_tasks", "reading", "tasks"]);
export const invitation = z
  .object({
    id,
    inviteeName: z.string().min(1).max(60),
    scope: supportScope,
    status: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
    createdAt: timestamp,
    expiresAt: timestamp,
  })
  .strict();
export const inviteRequest = z
  .object({
    inviteeName: z.string().trim().min(1).max(60),
    scope: supportScope,
  })
  .strict();
/** The single-use code is returned once, to the inviter, at creation only. */
export const invitationCreatedResponse = envelope(
  z.object({ invitation, code: z.string().min(16) }).strict(),
);
export const acceptInviteRequest = z
  .object({
    code: z.string().trim().min(16).max(80),
    decision: z.enum(["accept", "decline"]),
  })
  .strict();
export const grant = z
  .object({
    caseId: id,
    fieldKeys: z
      .array(fieldKey)
      .refine((k) => new Set(k).size === k.length, "Duplicate field"),
    /** Separate from fields: the original label image. */
    image: z.boolean(),
  })
  .strict();
export const grantRequest = grant.omit({ caseId: true });
export const connection = z
  .object({
    id,
    personName: z.string(),
    direction: z.enum(["supports_me", "i_support"]),
    scope: supportScope,
    connectedAt: timestamp,
    /** Only for "supports_me": what this person can see. */
    grants: z.array(grant),
  })
  .strict();
export const circleResponse = envelope(
  z
    .object({
      invitations: z.array(invitation),
      connections: z.array(connection),
    })
    .strict(),
);
/** A supporter's view of one label: granted, confirmed values only. */
export const sharedLabel = z
  .object({
    connectionId: id,
    ownerName: z.string(),
    caseId: id,
    revision: z.number().int().nonnegative(),
    fields: z.array(sharedField),
    imageUrl: z
      .string()
      .regex(/^\/api\/circle\/shared\/[^/]+\/image$/)
      .nullable(),
    tasksAllowed: z.boolean(),
    tasks: z.array(task),
  })
  .strict();
export const sharedLabelsResponse = envelope(z.array(sharedLabel));

// Medicine translator -------------------------------------------------------
export const medicineSectionKey = z.enum([
  "uses",
  "side_effects",
  "serious_warnings",
  "interactions",
]);
export const language = z.enum(["en", "es"]);
export const explanationMode = z.enum(["overview", "terms", "source"]);
export const medicineLookupRequest = expectedRevision.extend({
  // The patient agreed to send name, strength and form (nothing else) to NLM.
  consent: z.literal(true),
});
const matchCheck = z
  .object({
    attribute: z.enum(["ingredients", "strength", "form", "release", "brand"]),
    status: z.enum([
      "match",
      "equivalent",
      "mismatch",
      "not_on_label",
      "unknown",
    ]),
    note: z.string(),
  })
  .strict();
export const medicineCandidate = z
  .object({
    rxcui: z.string().regex(/^\d+$/),
    name: z.string(),
    termType: z.enum(["SCD", "SBD", "GPCK", "BPCK"]),
    brand: z.string().nullable(),
    ingredients: z.array(z.string()).min(1),
    /** Strength per unit (per tablet, per mL...). Never the prescribed dose. */
    strengths: z.array(z.string()),
    doseForm: z.string().nullable(),
    releaseType: z.enum(["immediate", "extended", "delayed", "not_stated"]),
    match: z
      .object({
        level: z.enum(["formulation", "partial", "conflict"]),
        checks: z.array(matchCheck),
      })
      .strict(),
  })
  .strict();
export const medicineQuery = z
  .object({
    medicationName: z.string(),
    strength: z.string(),
    dosageForm: z.string(),
  })
  .strict();
export const medicineCandidatesResponse = envelope(
  z
    .object({
      status: z.enum(["single", "multiple", "none", "unavailable"]),
      /** Changes whenever name, strength or form change. */
      identityKey: z.string(),
      query: medicineQuery,
      candidates: z.array(medicineCandidate),
      retrievedAt: timestamp,
    })
    .strict(),
);
export const medicineConfirmRequest = expectedRevision.extend({
  rxcui: z.string().regex(/^\d+$/),
  identityKey: z.string().min(1),
  compared: z.literal(true),
});
export const medicineIdentityResponse = envelope(
  z
    .object({
      identityKey: z.string(),
      identity: medicineCandidate,
      confirmedAt: timestamp,
    })
    .strict(),
);
export const medicineInfoRequest = expectedRevision.extend({
  language,
  mode: explanationMode,
});
export const medicineSource = z
  .object({
    id,
    kind: z.enum(["rxnorm", "dailymed", "medlineplus"]),
    title: z.string(),
    url: z.string().url(),
    publisher: z.string(),
    documentId: z.string().nullable(),
    version: z.string().nullable(),
    updatedAt: z.string().nullable(),
    retrievedAt: timestamp,
    language,
    /** What the content describes: an ingredient, a formulation or one product. */
    scope: z.enum(["ingredient", "formulation", "product"]),
    reuse: z.enum(["excerpts_with_attribution", "link_only"]),
  })
  .strict();
export const sourcePassage = z
  .object({
    id: z.string().min(1),
    sourceId: id,
    sectionTitle: z.string(),
    text: z.string().min(1),
  })
  .strict();
const derivedStatus = z.enum([
  "ok",
  "not_requested",
  "disabled",
  "unavailable",
  "rejected",
  "no_source",
]);
export const aiPoint = z
  .object({ text: z.string().min(1), passageIds: z.array(z.string()).min(1) })
  .strict();
export const medicineSection = z
  .object({
    key: medicineSectionKey,
    passages: z.array(sourcePassage),
    summary: z
      .object({
        kind: z.literal("ai_summary"),
        language,
        points: z.array(aiPoint).min(1),
      })
      .strict()
      .nullable(),
    summaryStatus: derivedStatus,
    translations: z
      .array(z.object({ passageId: z.string(), text: z.string() }).strict())
      .nullable(),
    translationStatus: derivedStatus,
  })
  .strict()
  .refine((s) => {
    const ids = new Set(s.passages.map((p) => p.id));
    return (
      (s.summary?.points ?? []).every((p) =>
        p.passageIds.every((i) => ids.has(i)),
      ) && (s.translations ?? []).every((t) => ids.has(t.passageId))
    );
  }, "Every citation must name a passage retrieved for this section");
export const medicineInfo = z
  .object({
    identityKey: z.string(),
    rxcui: z.string(),
    language,
    mode: explanationMode,
    sources: z.array(medicineSource),
    sections: z.array(medicineSection).length(4),
    educationLinks: z.array(
      z
        .object({
          title: z.string(),
          url: z.string().url(),
          language,
          sourceId: id,
        })
        .strict(),
    ),
    interactions: z
      .object({
        personalized: z
          .object({ status: z.literal("unavailable"), reason: z.string() })
          .strict(),
      })
      .strict(),
    notes: z.array(z.string()),
  })
  .strict()
  .refine((info) => {
    const sourceIds = new Set(info.sources.map((s) => s.id));
    return info.sections.every((s) =>
      s.passages.every((p) => sourceIds.has(p.sourceId)),
    );
  }, "Every passage must come from a listed source");
export const medicineInfoResponse = envelope(medicineInfo);

export type Account = z.infer<typeof account>;
export type Invitation = z.infer<typeof invitation>;
export type Connection = z.infer<typeof connection>;
export type Grant = z.infer<typeof grant>;
export type SharedLabel = z.infer<typeof sharedLabel>;
export type SavedLabel = z.infer<typeof savedLabel>;
export type MedicineCandidate = z.infer<typeof medicineCandidate>;
export type MedicineInfo = z.infer<typeof medicineInfo>;
export type MedicineSource = z.infer<typeof medicineSource>;
export type SourcePassage = z.infer<typeof sourcePassage>;

// v1.7: isolated additive community board contracts.
export * from "./community";
