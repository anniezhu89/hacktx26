import express, { type Response } from "express";
import {
  fieldsRevisionOf,
  reviewClaimRequest,
  reviewCreateRequest,
  reviewResponse,
  reviewResponseRequest,
  reviewerViewResponse,
  reviewsResponse,
} from "@labelbridge/contracts";
import { ApiError, parseBody } from "../errors";
import { maxImageBytes } from "../image";
import type { Reader, ReviewRecord } from "../reviews";
import { requireSession } from "../session";
import type { RouteContext } from "./context";

export function registerReviewRoutes(ctx: RouteContext) {
  const { api, cases, reviews, accounts, send } = ctx;

  /** Approved volunteer account, or the guest demo's reader persona. */
  const readerOf = (res: Response): Reader => {
    const session = requireSession(res);
    if (session.accountId) {
      const account = accounts.get(session.accountId);
      if (!accounts.isApprovedVolunteer(account))
        throw new ApiError(
          "FORBIDDEN",
          account?.uses.volunteer
            ? "Your volunteer application is pending approval. No requests are shown before approval."
            : "Volunteer reading is not turned on for this account.",
        );
      return { kind: "account", id: account!.id };
    }
    if (session.role !== "reviewer")
      throw new ApiError(
        "FORBIDDEN",
        "Switch to the volunteer reader demo view first.",
      );
    return { kind: "guest", workspaceId: session.workspaceId };
  };

  /** The patient who owns the request's case. */
  const ownedReview = (res: Response, id: string) => {
    const record = reviews.get(id);
    ctx.ownedCase(res, record.review.caseId);
    return record;
  };

  const viewOf = (record: ReviewRecord) => {
    const lookup = cases.lookup(record.review.caseId);
    if (lookup.status !== "found")
      throw new ApiError(
        "NOT_FOUND",
        "This request's label is no longer available.",
      );
    const fromImage = lookup.record.image !== null;
    return {
      review: record.review,
      // Label evidence only. For photos the reading came from the model, so
      // its text is withheld: volunteers never see extraction guesses.
      excerpts: record.review.selectedFields.map((key) => {
        const field = lookup.record.case.fields.find((f) => f.key === key)!;
        return {
          key,
          textExcerpt:
            fromImage || field.rawText === null ? null : field.evidence,
          crop: null,
        };
      }),
      imageUrl: record.image
        ? `/api/reviews/${encodeURIComponent(record.review.id)}/image`
        : null,
    };
  };

  api.post("/cases/:id/reviews", (req, res) => {
    const record = ctx.ownedCase(res, req.params.id);
    const input = parseBody(reviewCreateRequest, req.body);
    if (input.expectedRevision !== record.case.revision)
      throw new ApiError(
        "REVISION_CONFLICT",
        "This label changed since it was loaded. Reload and try again.",
      );
    const session = requireSession(res);
    const created = reviews.create({
      caseId: record.case.id,
      caseRevision: fieldsRevisionOf(record.case),
      selectedFields: [...new Set(input.selectedFields)],
      workspaceId: record.workspaceId,
      ownerAccountId: session.accountId ?? null,
    });
    send(res, reviewResponse, created.review, 201);
  });

  api.get("/cases/:id/reviews", (req, res) => {
    const record = ctx.ownedCase(res, req.params.id);
    send(
      res,
      reviewsResponse,
      reviews.forCase(record.case.id).map((r) => r.review),
    );
  });

  const multipart = express.raw({
    type: "multipart/form-data",
    limit: maxImageBytes + 256 * 1024,
  });

  // The patient's browser crops the hard-to-read section; only that is stored.
  api.put(
    "/reviews/:id/image",
    (req, res, next) => {
      res.locals.multipart = true;
      multipart(req, res, next);
    },
    async (req, res) => {
      const record = ownedReview(res, req.params.id);
      if (record.review.status !== "pending")
        throw new ApiError(
          "STATE_CONFLICT",
          "The image can only change before a volunteer claims the request.",
        );
      record.image = await ctx.readImageUpload(req);
      send(res, reviewResponse, record.review);
    },
  );

  api.post("/reviews/:id/cancel", (req, res) => {
    ownedReview(res, req.params.id);
    send(res, reviewResponse, reviews.cancel(req.params.id).review);
  });

  api.get("/reviews", (_req, res) => {
    const reader = readerOf(res);
    send(
      res,
      reviewsResponse,
      reviews.queueFor(reader).map((r) => r.review),
    );
  });

  api.post("/reviews/:id/claim", (req, res) => {
    const reader = readerOf(res);
    parseBody(reviewClaimRequest, req.body);
    send(
      res,
      reviewerViewResponse,
      viewOf(reviews.claim(req.params.id, reader)),
    );
  });

  api.get("/reviews/:id", (req, res) => {
    const reader = readerOf(res);
    send(
      res,
      reviewerViewResponse,
      viewOf(reviews.claimedBy(req.params.id, reader)),
    );
  });

  api.get("/reviews/:id/image", (req, res) => {
    const record = reviews.claimedBy(req.params.id, readerOf(res));
    if (!record.image)
      throw new ApiError(
        "NOT_FOUND",
        "No image section was shared for this request.",
      );
    res.setHeader("Content-Type", record.image.mime);
    res.setHeader("Content-Disposition", "inline");
    res.send(record.image.bytes);
  });

  api.post("/reviews/:id/release", (req, res) => {
    send(
      res,
      reviewResponse,
      reviews.release(req.params.id, readerOf(res)).review,
    );
  });

  api.post("/reviews/:id/response", (req, res) => {
    const reader = readerOf(res);
    const input = parseBody(reviewResponseRequest, req.body);
    const record = reviews.claimedBy(req.params.id, reader);
    const lookup = cases.lookup(record.review.caseId);
    if (lookup.status !== "found")
      throw new ApiError(
        "NOT_FOUND",
        "This request's label is no longer available.",
      );
    // A request made for an older version of the label cannot answer the new one.
    if (
      input.expectedRevision !== record.review.caseRevision ||
      fieldsRevisionOf(lookup.record.case) !== record.review.caseRevision
    )
      throw new ApiError(
        "REVISION_CONFLICT",
        "The patient changed this label after asking. This request no longer applies.",
      );
    if (input.outcome === "needs_new_image" && input.proposals.length)
      throw new ApiError(
        "BAD_REQUEST",
        "An unreadable response has no transcription.",
      );
    if (
      input.proposals.some((p) => !record.review.selectedFields.includes(p.key))
    )
      throw new ApiError(
        "BAD_REQUEST",
        "Answer only the parts you were asked to read.",
      );
    if (
      new Set(input.proposals.map((p) => p.key)).size !== input.proposals.length
    )
      throw new ApiError("BAD_REQUEST", "One answer per part.");
    // Proposals stay separate: they never change the patient's fields.
    send(
      res,
      reviewResponse,
      reviews.respond(req.params.id, reader, input.outcome, input.proposals)
        .review,
    );
  });
}
