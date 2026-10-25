import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FieldKey, MedCase, Persona, Preferences, ReviewProposal, ReviewState } from "../domain/types";
import {
  applyProposals,
  applyTask,
  askForClearerImage,
  blockersForExplanation,
  buildExplanation,
  buildSavings,
  claimReview,
  confirmReadableCritical,
  delay,
  dismissReview,
  reloadReview,
  replaceImage,
  requestHelp,
  submitReading,
  validateImage,
  withFieldValue,
  withMeaningUnclear,
  withPreferences,
  withQuestion,
  withReviewState,
  withSharing,
  withSuggestedTasks,
  withoutQuestion,
} from "../domain/rules";

type Result = { ok: true; message: string } | { ok: false; message: string };

type Pending = {
  explain: boolean;
  savings: boolean;
  plan: boolean;
  review: boolean;
};

type CaseValue = {
  medCase: MedCase | null;
  persona: Persona;
  largeText: boolean;
  pending: Pending;
  liveMessage: string;
  setPersona: (persona: Persona) => void;
  setLargeText: (on: boolean) => void;
  startCase: (next: MedCase) => void;
  reset: () => void;
  updateField: (key: FieldKey, value: string) => void;
  setReviewState: (key: FieldKey, state: ReviewState) => string | null;
  confirmReadable: () => string | null;
  setMeaningUnclear: (on: boolean) => void;
  addQuestion: (text: string) => string | null;
  removeQuestion: (id: string) => void;
  requestReading: (keys: FieldKey[], consent: boolean) => string | null;
  claimReading: () => Promise<string | null>;
  submitReading: (proposals: ReviewProposal[]) => Promise<string | null>;
  requestNewImage: () => Promise<string | null>;
  reloadReading: () => string | null;
  applyProposed: (keys: FieldKey[]) => string | null;
  dismissProposed: () => void;
  explain: (fail: boolean) => Promise<Result>;
  searchSavings: (location: string, copay: string, fail: boolean) => Promise<Result>;
  setPreferences: (preferences: Preferences) => void;
  setSharing: (on: boolean) => string;
  suggestTasks: (fail: boolean) => Promise<Result>;
  actOnTask: (id: string, action: "accept" | "complete" | "release") => string | null;
  attachImage: (file: File) => string | null;
  dismissClearedNote: () => void;
};

const CaseContext = createContext<CaseValue | null>(null);

const idlePending: Pending = { explain: false, savings: false, plan: false, review: false };

export function CaseProvider({ children }: { children: ReactNode }) {
  const [medCase, setMedCase] = useState<MedCase | null>(null);
  const [persona, setPersona] = useState<Persona>("patient");
  const [largeText, setLargeText] = useState(false);
  const [pending, setPending] = useState<Pending>(idlePending);
  const [liveMessage, setLiveMessage] = useState("");
  const ref = useRef<MedCase | null>(null);
  const epoch = useRef(0);
  ref.current = medCase;

  useEffect(() => {
    document.documentElement.classList.toggle("lb-large", largeText);
  }, [largeText]);

  function announce(message: string) {
    if (message) setLiveMessage(message);
  }

  function apply(result: { med: MedCase; error: string | null; announcement: string }) {
    setMedCase(result.med);
    announce(result.announcement);
    return result.error;
  }

  const value: CaseValue = {
    medCase,
    persona,
    largeText,
    pending,
    liveMessage,
    setPersona,
    setLargeText,
    startCase(next) {
      epoch.current += 1;
      setMedCase(next);
      announce("Case started. Review each critical field against the label.");
    },
    reset() {
      epoch.current += 1;
      const current = ref.current;
      if (current?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(current.imageUrl);
      setMedCase(null);
      setPending(idlePending);
      announce("Case cleared from this browser tab.");
    },
    updateField(key, fieldValue) {
      setMedCase((current) => (current ? withFieldValue(current, key, fieldValue) : current));
    },
    setReviewState(key, state) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      return apply(withReviewState(current, key, state));
    },
    confirmReadable() {
      const current = ref.current;
      if (!current) return "Start a case first.";
      return apply(confirmReadableCritical(current));
    },
    setMeaningUnclear(on) {
      setMedCase((current) => (current ? withMeaningUnclear(current, on) : current));
      announce(on ? "Directions marked as unclear in meaning." : "Meaning flag cleared.");
    },
    addQuestion(text) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      return apply(withQuestion(current, text));
    },
    removeQuestion(id) {
      setMedCase((current) => (current ? withoutQuestion(current, id) : current));
    },
    requestReading(keys, consent) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      return apply(requestHelp(current, keys, consent));
    },
    async claimReading() {
      const current = ref.current;
      if (!current) return "Start a case first.";
      setPending((item) => ({ ...item, review: true }));
      await delay(350);
      setPending((item) => ({ ...item, review: false }));
      return apply(claimReview(ref.current ?? current));
    },
    async submitReading(proposals) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      setPending((item) => ({ ...item, review: true }));
      await delay(400);
      setPending((item) => ({ ...item, review: false }));
      return apply(submitReading(ref.current ?? current, proposals));
    },
    async requestNewImage() {
      const current = ref.current;
      if (!current) return "Start a case first.";
      setPending((item) => ({ ...item, review: true }));
      await delay(350);
      setPending((item) => ({ ...item, review: false }));
      return apply(askForClearerImage(ref.current ?? current));
    },
    reloadReading() {
      const current = ref.current;
      if (!current) return "Start a case first.";
      return apply(reloadReview(current));
    },
    applyProposed(keys) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      return apply(applyProposals(current, keys));
    },
    dismissProposed() {
      const current = ref.current;
      if (!current) return;
      apply(dismissReview(current));
    },
    async explain(fail) {
      const current = ref.current;
      if (!current) return { ok: false, message: "Start a case first." };
      const epochAt = epoch.current;
      const { id, revision } = current;
      setPending((item) => ({ ...item, explain: true }));
      announce("Preparing a plain-language reading.");
      await delay(700);
      setPending((item) => ({ ...item, explain: false }));
      if (epochAt !== epoch.current) return { ok: false, message: "That request was discarded." };
      const latest = ref.current;
      if (!latest || latest.id !== id || latest.revision !== revision) {
        announce("The label changed, so that reading was discarded.");
        return { ok: false, message: "The label changed, so that reading was discarded." };
      }
      if (fail) {
        announce("The explanation could not be prepared.");
        return { ok: false, message: "The reading could not be prepared. The label was not changed. Try again." };
      }
      const reasons = blockersForExplanation(latest);
      if (reasons.length > 0) {
        announce("Plain language stays off until the critical fields are confirmed.");
        return { ok: false, message: reasons.join(" ") };
      }
      const explanation = buildExplanation(latest);
      if (!explanation) {
        return { ok: false, message: "This demo will not write a dosing explanation for these directions." };
      }
      setMedCase((med) => {
        if (!med || med.id !== id || med.revision !== revision) return med;
        return { ...med, explanation, clearedNote: false };
      });
      announce("Plain-language reading ready. It is not medical advice.");
      return { ok: true, message: "Plain-language reading ready. It does not change the label and it is not medical advice." };
    },
    async searchSavings(location, copay, fail) {
      const current = ref.current;
      if (!current) return { ok: false, message: "Start a case first." };
      if (!location.trim()) {
        return { ok: false, message: "Enter a city or region so the search context is explicit. This demo does not look up local prices." };
      }
      const epochAt = epoch.current;
      const { id, revision } = current;
      setPending((item) => ({ ...item, savings: true }));
      announce("Searching fixture savings resources.");
      await delay(700);
      setPending((item) => ({ ...item, savings: false }));
      if (epochAt !== epoch.current) return { ok: false, message: "That search was discarded." };
      const latest = ref.current;
      if (!latest || latest.id !== id || latest.revision !== revision) {
        announce("The label changed, so that search was discarded.");
        return { ok: false, message: "The label changed, so that search was discarded." };
      }
      if (fail) {
        announce("Savings search failed.");
        return { ok: false, message: "The savings search failed. Nothing was saved. Try again." };
      }
      const savings = buildSavings(latest, location, copay);
      setMedCase((med) => {
        if (!med || med.id !== id || med.revision !== revision) return med;
        return { ...med, savings, clearedNote: false };
      });
      announce("Savings resources ready. Fixture data, not a pharmacy quote.");
      return { ok: true, message: "Fixture resources loaded. No price here is a pharmacy quote." };
    },
    setPreferences(preferences) {
      setMedCase((current) => (current ? withPreferences(current, preferences) : current));
    },
    setSharing(on) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      const result = withSharing(current, on);
      setMedCase(result.med);
      announce(result.announcement);
      return result.announcement;
    },
    async suggestTasks(fail) {
      const current = ref.current;
      if (!current) return { ok: false, message: "Start a case first." };
      const epochAt = epoch.current;
      const { id, revision } = current;
      setPending((item) => ({ ...item, plan: true }));
      announce("Preparing practical task suggestions.");
      await delay(500);
      setPending((item) => ({ ...item, plan: false }));
      if (epochAt !== epoch.current) return { ok: false, message: "That request was discarded." };
      const latest = ref.current;
      if (!latest || latest.id !== id || latest.revision !== revision) {
        return { ok: false, message: "The label changed, so new suggestions were not added. Accepted tasks were kept." };
      }
      if (fail) {
        return { ok: false, message: "Suggestions could not be prepared. Accepted tasks were not changed." };
      }
      setMedCase((med) => {
        if (!med || med.id !== id || med.revision !== revision) return med;
        return withSuggestedTasks(med);
      });
      announce("Task suggestions are ready. Nothing is accepted until someone accepts it.");
      return { ok: true, message: "Suggestions are ready. They stay unassigned until someone accepts them." };
    },
    actOnTask(id, action) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      if (persona === "reviewer") return "The reviewer desk cannot accept tasks.";
      const actor = persona === "supporter" ? "supporter" : "patient";
      return apply(applyTask(current, id, action, actor));
    },
    attachImage(file) {
      const current = ref.current;
      if (!current) return "Start a case first.";
      const problem = validateImage(file);
      if (problem) return problem;
      const url = URL.createObjectURL(file);
      if (current.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(current.imageUrl);
      setMedCase(replaceImage(current, url));
      announce("New image attached. Confirmed fields need to be checked again.");
      return null;
    },
    dismissClearedNote() {
      setMedCase((current) => (current ? { ...current, clearedNote: false } : current));
    },
  };

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCase() {
  const value = useContext(CaseContext);
  if (!value) throw new Error("useCase must be used inside CaseProvider");
  return value;
}
