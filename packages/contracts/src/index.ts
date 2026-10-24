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
    status: z.enum(["proposed", "accepted", "completed"]),
    acceptedAt: timestamp.nullable(),
  })
  .strict()
  .refine(
    (t) =>
      t.status === "proposed"
        ? t.owner === null && t.acceptedAt === null
        : t.owner !== null && t.acceptedAt !== null,
    "Task acceptance requires explicit owner and timestamp",
  );
export const caseSchema = z
  .object({
    id,
    revision: z.number().int().nonnegative(),
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
          extraction: z.literal("fixture"),
          explanation: z.literal("fixture"),
          search: z.literal("fixture"),
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
export const sessionResponse = envelope(
  z.object({ role: z.enum(["patient", "supporter", "reviewer"]) }).strict(),
);
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
    fields,
    status: eligibleForExplanation(fields) ? "ready" : "reviewing",
  });
  return {
    case: next,
    invalidate: ["explanation", "savings", "plan"] as const,
  };
}
