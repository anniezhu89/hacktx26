import { createHash } from "node:crypto";
import {
  eligibleForExplanation,
  medicineCandidatesResponse,
  medicineConfirmRequest,
  medicineIdentityResponse,
  medicineInfoRequest,
  medicineInfoResponse,
  medicineLookupRequest,
  type Case,
  type MedicineCandidate,
  type MedicineInfo,
  type MedicineSource,
} from "@labelbridge/contracts";
import type { Response } from "express";
import { ApiError, parseBody } from "../errors";
import { fetchLabeling, type SplDocument } from "../providers/dailymed";
import type { GeminiConfig } from "../providers/gemini";
import { educationLinks, type EducationLink } from "../providers/medlineplus";
import { summarise, translate, type Point } from "../providers/medicine-ai";
import { findCandidates } from "../providers/rxnorm";
import type { RouteContext } from "./context";

export type MedicineOptions = {
  fetchImpl: typeof fetch;
  /** Model for summaries/translations; null leaves them unavailable. */
  ai: GeminiConfig | null;
  /**
   * DailyMed text is manufacturer-supplied, so its copyright status is not
   * guaranteed. Summaries and translations of it run only when the operator
   * has confirmed reuse (LABELBRIDGE_ALLOW_LABELING_DERIVATIVES=1).
   */
  allowDerivatives: boolean;
};

type SectionKey = MedicineInfo["sections"][number]["key"];
const SECTIONS: SectionKey[] = [
  "uses",
  "side_effects",
  "serious_warnings",
  "interactions",
];
const cacheMs = 12 * 60 * 60 * 1000;
const aiPassagesPerSection = 8;

class TtlCache<T> {
  private items = new Map<string, { at: number; value: T }>();
  constructor(private now: () => number) {}
  get(key: string) {
    const hit = this.items.get(key);
    if (hit && this.now() - hit.at < cacheMs) return hit.value;
    this.items.delete(key);
    return undefined;
  }
  set(key: string, value: T) {
    if (this.items.size > 500) this.items.clear();
    this.items.set(key, { at: this.now(), value });
  }
}

const confirmedValue = (c: Case, key: string) =>
  c.fields
    .find((f) => f.key === key && f.reviewState === "user_confirmed")
    ?.value?.trim() ?? "";

/** Changes whenever any of the three identity fields changes. */
export function identityKeyOf(c: Case) {
  const parts = ["medicationName", "strength", "dosageForm"].map((k) =>
    confirmedValue(c, k).toLowerCase().replace(/\s+/g, " "),
  );
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 20);
}

export const PERSONALIZED_UNAVAILABLE =
  "No personalized interaction checker is connected. The U.S. National Library of Medicine retired its free interaction service in January 2024, and decodRx has no licensed replacement. The general interaction text comes from this product's labeling and is not a check of your medicines. An empty result would never mean a combination is safe.";

export function registerMedicineRoutes(
  ctx: RouteContext,
  options: MedicineOptions | null,
) {
  const { api, send, now } = ctx;
  const state = new Map<
    string,
    {
      candidates?: { key: string; list: MedicineCandidate[] };
      identity?: {
        key: string;
        candidate: MedicineCandidate;
        confirmedAt: string;
      };
    }
  >();
  const lookups = new TtlCache<{
    status: "single" | "multiple" | "none";
    candidates: MedicineCandidate[];
  }>(now);
  const labeling = new TtlCache<{
    document: SplDocument;
    labelCount: number;
  } | null>(now);
  const education = new TtlCache<EducationLink[]>(now);
  const derived = new TtlCache<{
    summaries?: Map<SectionKey, { points: Point[]; rejected: number }> | null;
    translations?: { accepted: Map<string, string>; rejected: number } | null;
  }>(now);
  const iso = () => new Date(now()).toISOString();

  const gated = (res: Response, id: string, expectedRevision: number) => {
    const record = ctx.ownedCase(res, id);
    if (expectedRevision !== record.case.revision)
      throw new ApiError(
        "REVISION_CONFLICT",
        "This label changed since it was loaded. Reload and try again.",
      );
    // The same gate as explanations: every critical field confirmed by the patient.
    if (!eligibleForExplanation(record.case.fields))
      throw new ApiError(
        "NEEDS_CLARIFICATION",
        "Confirm the medication name, strength, dosage form and directions first.",
      );
    return record;
  };
  const unavailable = () => {
    if (!options)
      throw new ApiError(
        "PROVIDER_UNAVAILABLE",
        "Reference lookups are turned off on this server.",
      );
    return options;
  };

  api.post("/cases/:id/medicine/candidates", async (req, res) => {
    const input = parseBody(medicineLookupRequest, req.body);
    const record = gated(res, req.params.id, input.expectedRevision);
    const query = {
      medicationName: confirmedValue(record.case, "medicationName"),
      strength: confirmedValue(record.case, "strength"),
      dosageForm: confirmedValue(record.case, "dosageForm"),
    };
    const key = identityKeyOf(record.case);
    const cacheKey = JSON.stringify(query).toLowerCase();
    let result = lookups.get(cacheKey);

    if (result) res.locals.dataMode = "cached";
    else if (options) {
      try {
        result = await findCandidates(query, options.fetchImpl);
        lookups.set(cacheKey, result);
        res.locals.dataMode = "live";
      } catch (error) {
        res.locals.providerError =
          error instanceof Error ? error.message : "rxnorm failed";
      }
    }
    const status = result?.status ?? "unavailable";
    const list = result?.candidates ?? [];
    const entry = state.get(record.case.id) ?? {};
    entry.candidates = { key, list };
    state.set(record.case.id, entry);
    send(res, medicineCandidatesResponse, {
      status,
      identityKey: key,
      query,
      candidates: list,
      retrievedAt: iso(),
    });
  });

  api.post("/cases/:id/medicine/confirm", (req, res) => {
    const input = parseBody(medicineConfirmRequest, req.body);
    const record = gated(res, req.params.id, input.expectedRevision);
    const key = identityKeyOf(record.case);
    const entry = state.get(record.case.id);
    if (input.identityKey !== key || entry?.candidates?.key !== key)
      throw new ApiError(
        "STATE_CONFLICT",
        "The label details changed. Look up the reference medicine again.",
      );
    const candidate = entry.candidates.list.find(
      (c) => c.rxcui === input.rxcui,
    );
    if (!candidate)
      throw new ApiError(
        "BAD_REQUEST",
        "Choose one of the listed reference medicines.",
      );
    if (candidate.match.level === "conflict")
      throw new ApiError(
        "STATE_CONFLICT",
        "This reference medicine does not match your label. It cannot be used.",
      );
    entry.identity = { key, candidate, confirmedAt: iso() };
    send(res, medicineIdentityResponse, {
      identityKey: key,
      identity: candidate,
      confirmedAt: entry.identity.confirmedAt,
    });
  });

  api.post("/cases/:id/medicine/info", async (req, res) => {
    const input = parseBody(medicineInfoRequest, req.body);
    const record = gated(res, req.params.id, input.expectedRevision);
    const key = identityKeyOf(record.case);
    const identity = state.get(record.case.id)?.identity;
    if (!identity || identity.key !== key)
      throw new ApiError(
        "STATE_CONFLICT",
        "Confirm the reference medicine for the current label details first.",
      );
    const opts = unavailable();
    const { candidate } = identity;
    let live = false;
    const note = (m: string) => (res.locals.providerError = m);

    let lab = labeling.get(candidate.rxcui);
    if (lab === undefined) {
      try {
        lab = await fetchLabeling(candidate.rxcui, opts.fetchImpl);
        labeling.set(candidate.rxcui, lab);
        live = true;
      } catch (error) {
        note(error instanceof Error ? error.message : "dailymed failed");
        lab = null;
      }
    }
    let links = education.get(`${candidate.rxcui}|${input.language}`);
    if (links === undefined) {
      try {
        links = await educationLinks(
          candidate.rxcui,
          input.language,
          opts.fetchImpl,
        );
        education.set(`${candidate.rxcui}|${input.language}`, links);
        live = true;
      } catch (error) {
        note(error instanceof Error ? error.message : "medlineplus failed");
        links = [];
      }
    }
    res.locals.dataMode = live ? "live" : "cached";

    const retrievedAt = iso();
    const sources: MedicineSource[] = [
      {
        id: `rxnorm-${candidate.rxcui}`,
        kind: "rxnorm",
        title: candidate.name,
        url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${candidate.rxcui}`,
        publisher: "RxNorm, U.S. National Library of Medicine",
        documentId: candidate.rxcui,
        version: null,
        updatedAt: null,
        retrievedAt,
        language: "en",
        scope: candidate.termType === "SBD" ? "product" : "formulation",
        reuse: "excerpts_with_attribution",
      },
    ];
    const doc = lab?.document;
    const docSourceId = doc ? `dailymed-${doc.setId}-v${doc.version}` : "";
    if (doc)
      sources.push({
        id: docSourceId,
        kind: "dailymed",
        title: doc.title,
        url: doc.url,
        publisher:
          "DailyMed, U.S. National Library of Medicine (labeling text supplied by the manufacturer)",
        documentId: doc.setId,
        version: doc.version,
        updatedAt: doc.effectiveDate,
        retrievedAt,
        language: "en",
        scope: "product",
        reuse: "excerpts_with_attribution",
      });
    if (links.length)
      sources.push({
        id: `medlineplus-${candidate.rxcui}-${input.language}`,
        kind: "medlineplus",
        title:
          input.language === "es" ? "MedlinePlus en español" : "MedlinePlus",
        url: links[0].url,
        publisher: "MedlinePlus.gov, U.S. National Library of Medicine",
        documentId: null,
        version: null,
        updatedAt: null,
        retrievedAt,
        language: input.language,
        scope: "ingredient",
        reuse: "link_only",
      });

    const passagesFor = (k: SectionKey) =>
      doc ? doc.sections[k].map((p) => ({ ...p, sourceId: docSourceId })) : [];
    const medicine = [
      ...candidate.ingredients,
      ...(candidate.brand ? [candidate.brand] : []),
    ];
    const aiReady = opts.allowDerivatives && !!opts.ai && !!doc;
    // Cache by medicine identity, source version, language and mode.
    const cacheKey = `${candidate.rxcui}|${doc?.setId}|${doc?.version}|${input.language}|${input.mode}`;
    let out = derived.get(cacheKey);
    if (!out && aiReady) {
      out = {};
      const sections = SECTIONS.map((k) => ({
        key: k,
        passages: passagesFor(k).slice(0, aiPassagesPerSection),
      }));
      if (input.mode !== "source")
        out.summaries = await summarise(
          opts.ai!,
          { language: input.language, mode: input.mode, medicine, sections },
          opts.fetchImpl,
          note,
        );
      else if (input.language === "es")
        out.translations = await translate(
          opts.ai!,
          { medicine, passages: sections.flatMap((s) => s.passages) },
          opts.fetchImpl,
          note,
        );
      // Failed calls are not cached, so a later request can try again.
      if (out.summaries !== null && out.translations !== null)
        derived.set(cacheKey, out);
    }

    const sections = SECTIONS.map((k) => {
      const passages = passagesFor(k);
      const summary = out?.summaries?.get(k);
      const summaryStatus =
        input.mode === "source"
          ? "not_requested"
          : !passages.length
            ? "no_source"
            : !opts.allowDerivatives
              ? "disabled"
              : !opts.ai || out?.summaries === null || !out
                ? "unavailable"
                : summary?.points.length
                  ? "ok"
                  : "rejected";
      const wantsTranslation =
        input.mode === "source" && input.language === "es";
      const accepted = out?.translations?.accepted;
      const translations =
        wantsTranslation && accepted
          ? passages
              .filter((p) => accepted.has(p.id))
              .map((p) => ({ passageId: p.id, text: accepted.get(p.id)! }))
          : null;
      const translationStatus = !wantsTranslation
        ? "not_requested"
        : !passages.length
          ? "no_source"
          : !opts.allowDerivatives
            ? "disabled"
            : !opts.ai || !accepted
              ? "unavailable"
              : translations!.length === passages.length
                ? "ok"
                : "rejected";
      return {
        key: k,
        passages,
        summary:
          summaryStatus === "ok"
            ? {
                kind: "ai_summary" as const,
                language: input.language,
                points: summary!.points,
              }
            : null,
        summaryStatus,
        translations: translations?.length ? translations : null,
        translationStatus,
      };
    });

    const notes = [
      "General reference information, not advice about your treatment. Your label's directions decide how much you take; strength is the amount in each unit, not your dose.",
    ];
    if (doc)
      notes.push(
        `This labeling is for "${doc.title}". It matches the ingredients, strength and form you confirmed, but your pharmacy's product may come from a different manufacturer.${lab!.labelCount > 1 ? ` DailyMed lists ${lab!.labelCount} labels for this formulation; this is the most recently published.` : ""}`,
        "DailyMed shows labeling as the manufacturer submitted it. Being listed on DailyMed does not by itself mean the product is FDA-approved.",
      );
    else
      notes.push(
        "No product labeling was found or it could not be retrieved, so no labeling passages are shown.",
      );
    if (input.language === "es")
      notes.push(
        "DailyMed labeling is in English only. MedlinePlus links in Spanish are written by the publisher; any Spanish produced here by AI is marked as an AI translation.",
      );
    if (!opts.allowDerivatives && doc)
      notes.push(
        "AI summaries and translations are turned off on this server until reuse of manufacturer labeling text is confirmed. The original passages are shown instead.",
      );

    send(res, medicineInfoResponse, {
      identityKey: key,
      rxcui: candidate.rxcui,
      language: input.language,
      mode: input.mode,
      sources,
      sections,
      educationLinks: links.map((l) => ({
        ...l,
        sourceId: `medlineplus-${candidate.rxcui}-${input.language}`,
      })),
      interactions: {
        personalized: {
          status: "unavailable",
          reason: PERSONALIZED_UNAVAILABLE,
        },
      },
      notes,
    });
  });

  return { forgetCase: (caseId: string) => state.delete(caseId) };
}
