import type {
  Explanation,
  FieldKey,
  FieldMeta,
  LabelField,
  MedCase,
  Preferences,
  Question,
  ReviewProposal,
  ReviewRequest,
  ReviewState,
  SavingsResult,
  StepResult,
  Task,
  TaskCategory,
} from "./types";

export const FIELD_META: FieldMeta[] = [
  {
    key: "medicationName",
    label: "Medication name",
    critical: true,
    hint: "The drug name printed on the label.",
  },
  {
    key: "strength",
    label: "Strength",
    critical: true,
    hint: "Keep the number and the unit together, such as 10 MG or 90 MCG. Leave it blank if you cannot read it.",
  },
  {
    key: "dosageForm",
    label: "Dosage form",
    critical: true,
    hint: "Tablet, capsule, liquid, inhaler, or another form printed on the label.",
  },
  {
    key: "quantity",
    label: "Quantity",
    critical: false,
    hint: "Required before this demo will treat a product as comparable. No product price is shown without it.",
  },
  {
    key: "directions",
    label: "Exact directions",
    critical: true,
    hint: "Copy the directions as printed. Do not simplify them in this box.",
  },
];

export const PREFERENCE_COPY = {
  availability: [
    { value: "weeknights", label: "Weekday evenings" },
    { value: "weekends", label: "Weekends" },
    { value: "limited", label: "Limited this week" },
  ],
  transport: [
    { value: "pickup", label: "Someone can pick it up" },
    { value: "needs_ride", label: "Needs a ride" },
    { value: "delivery", label: "Ask about delivery" },
  ],
  budget: [
    { value: "can_pay", label: "Can pay a confirmed pharmacy charge" },
    { value: "lowest", label: "Need the lowest confirmed option" },
    { value: "barrier", label: "Cost is a barrier" },
  ],
} as const;

const TEMPLATES: { directions: string; simplified: string }[] = [
  {
    directions: "Take 1 tablet by mouth once daily.",
    simplified: "Take 1 tablet by mouth, 1 time each day.",
  },
  {
    directions: "Take 1 tablet by mouth twice daily with meals.",
    simplified: "Take 1 tablet by mouth 2 times each day, with meals. No clock times were added.",
  },
  {
    directions: "Inhale 2 puffs by mouth every 4 to 6 hours as needed for wheezing.",
    simplified:
      "For wheezing, inhale 2 puffs by mouth when you need it. If you need it again, wait 4 to 6 hours. These directions stay as needed. No clock times were added.",
  },
];

const DRUG_REFERENCES: Record<string, Explanation["references"][number]> = {
  lisinopril: {
    title: "MedlinePlus: Lisinopril",
    url: "https://medlineplus.gov/druginfo/meds/a692051.html",
    passage:
      "Fixture pointer, not a live quotation. MedlinePlus has a public page describing what lisinopril is commonly used for. That page is general reference material, not this label’s directions.",
  },
  metformin: {
    title: "MedlinePlus: Metformin",
    url: "https://medlineplus.gov/druginfo/meds/a696005.html",
    passage:
      "Fixture pointer, not a live quotation. MedlinePlus has a public page describing what metformin is commonly used for. That page is general reference material, not this label’s directions.",
  },
  albuterol: {
    title: "MedlinePlus: Albuterol oral inhalation",
    url: "https://medlineplus.gov/druginfo/meds/a682145.html",
    passage:
      "Fixture pointer, not a live quotation. MedlinePlus has a public page for albuterol oral inhalation. That page is general reference material, not this label’s directions.",
  },
};

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function fieldMeta(key: FieldKey) {
  const meta = FIELD_META.find((item) => item.key === key);
  if (!meta) throw new Error(`Missing field meta for ${key}`);
  return meta;
}

export function getField(med: MedCase, key: FieldKey) {
  const field = med.fields.find((item) => item.key === key);
  if (!field) throw new Error(`Missing field ${key}`);
  return field;
}

export function normalizeSpace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function shortId(id: string) {
  return id.slice(0, 8);
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function reviewLabel(state: ReviewState) {
  switch (state) {
    case "unreviewed":
      return "Needs your review";
    case "user_confirmed":
      return "Matches the label";
    case "needs_help":
      return "Waiting on a person";
    case "unresolved":
      return "Could not be read";
  }
}

export function provenanceLabel(provenance: LabelField["provenance"]) {
  switch (provenance) {
    case "ai":
      return "Fixture extraction";
    case "user":
      return "Typed by you";
    case "volunteer":
      return "Reviewer reading";
  }
}

export function preferenceLabel<K extends keyof typeof PREFERENCE_COPY>(
  group: K,
  value: Preferences[K],
) {
  const match = PREFERENCE_COPY[group].find((item) => item.value === value);
  return match?.label ?? value;
}

export function taskCategoryLabel(category: TaskCategory) {
  switch (category) {
    case "research":
      return "Research";
    case "call_pharmacy":
      return "Call the pharmacy";
    case "transport":
      return "Transportation";
    case "review_label":
      return "Read the label";
  }
}

export function taskStatusLabel(task: Task) {
  if (task.status === "proposed" || !task.owner) return "Proposal, not accepted";
  if (task.status === "accepted") return `Accepted by the ${task.owner}`;
  return `Completed by the ${task.owner}`;
}

export function medicationTitle(med: MedCase) {
  return getField(med, "medicationName").value?.trim() || "Name not read yet";
}

export function systemQuestions(med: MedCase): Question[] {
  const questions: Question[] = [];
  for (const meta of FIELD_META) {
    if (!meta.critical) continue;
    const field = getField(med, meta.key);
    if (field.reviewState === "unresolved" || field.reviewState === "needs_help" || !field.value) {
      questions.push({
        id: `sys-${meta.key}`,
        source: "system",
        text: `Can you help me read the ${meta.label.toLowerCase()} on this label? I do not want to guess.`,
      });
    }
  }
  if (med.meaningUnclear) {
    questions.push({
      id: "sys-meaning",
      source: "system",
      text: "The directions are readable, but I am not sure what they mean. What should I ask the pharmacist?",
    });
  }
  return questions;
}

export function allQuestions(med: MedCase) {
  return [...systemQuestions(med), ...med.questions];
}

export function blockersForExplanation(med: MedCase) {
  const reasons: string[] = [];
  for (const meta of FIELD_META) {
    if (!meta.critical) continue;
    const field = getField(med, meta.key);
    if (!field.value || field.reviewState === "unresolved" || field.reviewState === "needs_help") {
      reasons.push(`Confirm the ${meta.label.toLowerCase()} before a dosing explanation can be written.`);
    } else if (field.reviewState !== "user_confirmed") {
      reasons.push(`Mark that the ${meta.label.toLowerCase()} matches the label.`);
    }
  }
  if (med.meaningUnclear) {
    reasons.push("You marked the directions as unclear in meaning.");
  }
  const directions = normalizeSpace(getField(med, "directions").value ?? "");
  if (reasons.length === 0 && !TEMPLATES.some((item) => item.directions === directions)) {
    reasons.push(
      "These exact directions are not in the reviewed sample set, so this demo will not write a dosing explanation.",
    );
  }
  return reasons;
}

export function buildExplanation(med: MedCase): Explanation | null {
  if (blockersForExplanation(med).length > 0) return null;
  const printed = getField(med, "directions").value ?? "";
  const template = TEMPLATES.find((item) => item.directions === normalizeSpace(printed));
  if (!template) return null;
  const name = normalizeSpace(getField(med, "medicationName").value ?? "").toLowerCase();
  const reference = DRUG_REFERENCES[name];
  return {
    originalDirections: printed,
    simplifiedText: template.simplified,
    fieldRevision: med.revision,
    references: reference ? [reference] : [],
    unresolvedQuestions: allQuestions(med).map((question) => question.text),
    eligibleForExplanation: true,
  };
}

function productReady(med: MedCase) {
  return (["medicationName", "strength", "dosageForm", "quantity"] as const).every((key) => {
    const field = getField(med, key);
    return Boolean(field.value) && field.reviewState === "user_confirmed";
  });
}

function isLisinoprilPackage(med: MedCase) {
  const name = normalizeSpace(getField(med, "medicationName").value ?? "").toLowerCase();
  const strength = normalizeSpace(getField(med, "strength").value ?? "").toLowerCase();
  const form = normalizeSpace(getField(med, "dosageForm").value ?? "").toLowerCase();
  const quantity = normalizeSpace(getField(med, "quantity").value ?? "").toLowerCase();
  return name === "lisinopril" && strength === "10 mg" && form === "tablet" && (quantity === "30" || quantity === "30 tablets");
}

export function buildSavings(med: MedCase, location: string, copay: string): SavingsResult {
  const retrievedAt = new Date().toISOString();
  const options: SavingsResult["options"] = [
    {
      id: "needymeds",
      sourceTitle: "NeedyMeds",
      url: "https://www.needymeds.org/",
      retrievedAt,
      matchedProduct: "Not matched to a specific package",
      optionType: "savings_program",
      amount: null,
      currency: null,
      priceBasis: "unknown",
      eligibilityNotes: "A public directory of patient-assistance and discount programs. This demo does not know whether you qualify.",
      missingRequirements: ["Eligibility", "A source-listed price"],
    },
    {
      id: "rxoutreach",
      sourceTitle: "Rx Outreach",
      url: "https://rxoutreach.org/",
      retrievedAt,
      matchedProduct: "Not matched to a specific package",
      optionType: "assistance_program",
      amount: null,
      currency: null,
      priceBasis: "unknown",
      eligibilityNotes: "A nonprofit pharmacy program. Opening the site does not mean this prescription qualifies.",
      missingRequirements: ["Eligibility", "A confirmed pharmacy charge"],
    },
  ];

  let summary =
    "No listing in this demo matches this exact drug, strength, form, and quantity. Program links are places to look, not quotes.";
  const heldOut: SavingsResult["heldOut"] = [];

  if (!productReady(med)) {
    summary =
      "Name, strength, dosage form, and quantity are not all confirmed, so product-specific prices stay hidden. These program links are places to look, not quotes.";
  } else if (isLisinoprilPackage(med)) {
    heldOut.push({
      id: "held-20mg",
      sourceTitle: "Listing for lisinopril 20 mg tablets",
      reason: "Different strength. Held out so it is not treated as an equivalent price. No dollar amount is shown.",
    });
    summary =
      "The confirmed product is lisinopril 10 MG tablets, quantity 30. This demo has no source-listed price for that package. A different strength was held out.";
  }

  const copayNote = copay.trim()
    ? `You entered a copay of ${copay.trim()}. This demo does not subtract that number from a price or estimate what insurance would pay.`
    : null;

  return {
    revision: med.revision,
    location: location.trim(),
    copayNote,
    options,
    heldOut,
    summary,
  };
}

export function proposedTasks(med: MedCase): Task[] {
  const proposals: { category: TaskCategory; description: string }[] = [];
  const needsRead = FIELD_META.some((meta) => {
    if (!meta.critical) return false;
    const field = getField(med, meta.key);
    return field.reviewState === "unresolved" || field.reviewState === "needs_help" || !field.value;
  });
  if (needsRead) {
    proposals.push({
      category: "review_label",
      description: "Get a clearer image or a human reading for every critical field that is still unresolved.",
    });
  }
  if (med.savings && med.savings.options.length > 0) {
    proposals.push({
      category: "research",
      description: "Open the savings-program links and write down what they ask for. Eligibility is still unknown.",
    });
  }
  if (med.preferences.transport === "needs_ride") {
    proposals.push({
      category: "transport",
      description: "Arrange a ride for pickup after the pharmacy says the medication is ready.",
    });
  }
  if (med.preferences.transport === "delivery") {
    proposals.push({
      category: "research",
      description: "Ask the pharmacy whether delivery is offered and what it costs. Do not assume it is available.",
    });
  }
  if (med.preferences.budget === "barrier") {
    proposals.push({
      category: "research",
      description: "List which savings programs you can apply for with the documents you already have.",
    });
  }
  proposals.push({
    category: "call_pharmacy",
    description: "Call the pharmacy and ask what would actually be charged before anyone goes to pick it up.",
  });

  const kept = med.tasks.filter((task) => task.status !== "proposed");
  const fresh = proposals
    .filter((proposal) => !kept.some((task) => task.category === proposal.category && task.description === proposal.description))
    .map((proposal) => ({
      id: crypto.randomUUID(),
      category: proposal.category,
      description: proposal.description,
      owner: null,
      status: "proposed" as const,
      acceptedAt: null,
    }));
  return [...kept, ...fresh];
}

function editCase(med: MedCase, mutate: (draft: MedCase) => MedCase): MedCase {
  const edited = mutate(med);
  const hadDependents = Boolean(
    med.explanation || med.savings || med.planReady || med.tasks.some((task) => task.status === "proposed"),
  );
  return {
    ...edited,
    revision: med.revision + 1,
    requestId: crypto.randomUUID(),
    explanation: null,
    savings: null,
    planReady: false,
    tasks: edited.tasks.filter((task) => task.status !== "proposed"),
    clearedNote: hadDependents || med.clearedNote,
  };
}

export function withFieldValue(med: MedCase, key: FieldKey, value: string) {
  const nextValue = value.trim() === "" ? null : value;
  return editCase(med, (draft) => ({
    ...draft,
    fields: draft.fields.map((field) =>
      field.key === key
        ? {
            ...field,
            value: nextValue,
            rawText: nextValue,
            provenance: "user",
            reviewState: "unreviewed",
          }
        : field,
    ),
  }));
}

export function withReviewState(med: MedCase, key: FieldKey, reviewState: ReviewState): StepResult {
  const field = getField(med, key);
  if (reviewState === "user_confirmed" && !field.value) {
    return {
      med,
      error: `Enter the ${fieldMeta(key).label.toLowerCase()} from the label before marking it as a match.`,
      announcement: "",
    };
  }
  const medNext = editCase(med, (draft) => ({
    ...draft,
    fields: draft.fields.map((item) => {
      if (item.key !== key) return item;
      if (reviewState === "unresolved") {
        return { ...item, value: null, rawText: null, reviewState };
      }
      return { ...item, reviewState };
    }),
  }));
  return {
    med: medNext,
    error: null,
    announcement:
      reviewState === "user_confirmed"
        ? `${fieldMeta(key).label} marked as matching the label. That is a reading check, not a clinical approval.`
        : `${fieldMeta(key).label} marked as ${reviewLabel(reviewState).toLowerCase()}.`,
  };
}

export function confirmReadableCritical(med: MedCase): StepResult {
  const readable = med.fields.filter((field) => {
    const meta = fieldMeta(field.key);
    return meta.critical && field.value && field.reviewState !== "unresolved" && field.reviewState !== "user_confirmed";
  });
  if (readable.length === 0) {
    return {
      med,
      error: "There is no readable critical field left to mark. Unreadable fields stay unresolved.",
      announcement: "",
    };
  }
  return {
    med: editCase(med, (draft) => ({
      ...draft,
      fields: draft.fields.map((field) => {
        const meta = fieldMeta(field.key);
        if (!meta.critical || !field.value || field.reviewState === "unresolved") return field;
        return { ...field, reviewState: "user_confirmed" };
      }),
    })),
    error: null,
    announcement: "Readable critical fields were marked as matches. Unreadable fields were left unresolved.",
  };
}

export function withMeaningUnclear(med: MedCase, meaningUnclear: boolean) {
  return editCase(med, (draft) => ({ ...draft, meaningUnclear }));
}

export function withQuestion(med: MedCase, text: string): StepResult {
  const cleaned = text.trim();
  if (!cleaned) {
    return { med, error: "Write a question before adding it.", announcement: "" };
  }
  return {
    med: {
      ...med,
      questions: [...med.questions, { id: crypto.randomUUID(), text: cleaned.slice(0, 240), source: "user" }],
    },
    error: null,
    announcement: "Question added for the pharmacist.",
  };
}

export function withoutQuestion(med: MedCase, id: string) {
  return { ...med, questions: med.questions.filter((question) => question.id !== id) };
}

export function requestHelp(med: MedCase, keys: FieldKey[], consent: boolean): StepResult {
  if (!consent) {
    return {
      med,
      error: "Consent is required before a reviewer can see this fictional label.",
      announcement: "",
    };
  }
  if (keys.length === 0) {
    return { med, error: "Choose at least one field for a person to read.", announcement: "" };
  }
  if (med.review && (med.review.status === "pending" || med.review.status === "claimed")) {
    return { med, error: "A reading request is already open.", announcement: "" };
  }
  const edited = editCase(med, (draft) => ({
    ...draft,
    fields: draft.fields.map((field) => {
      if (!keys.includes(field.key) || field.reviewState === "unresolved") return field;
      return { ...field, reviewState: "needs_help" };
    }),
  }));
  const review: ReviewRequest = {
    id: crypto.randomUUID(),
    caseId: edited.id,
    caseRevision: edited.revision,
    selectedFields: keys,
    consentAt: new Date().toISOString(),
    status: "pending",
    proposals: [],
    conflict: null,
  };
  return {
    med: { ...edited, review },
    error: null,
    announcement: "A reviewer can now read the selected fields. This is not a clinical check.",
  };
}

export function claimReview(med: MedCase): StepResult {
  if (!med.review) return { med, error: "There is no reading request.", announcement: "" };
  if (med.review.status === "claimed") {
    return { med, error: "This reading is already claimed.", announcement: "" };
  }
  if (med.review.status !== "pending") {
    return { med, error: "This reading is no longer waiting to be claimed.", announcement: "" };
  }
  return {
    med: { ...med, review: { ...med.review, status: "claimed", conflict: null } },
    error: null,
    announcement: "You claimed this reading. Transcribe only what you can see.",
  };
}

export function submitReading(med: MedCase, proposals: ReviewProposal[]): StepResult {
  if (!med.review || med.review.status !== "claimed") {
    return { med, error: "Claim the reading before submitting.", announcement: "" };
  }
  if (med.review.caseRevision !== med.revision) {
    return {
      med: {
        ...med,
        review: {
          ...med.review,
          conflict: "The patient changed this case after you claimed it. Your reading was not saved.",
        },
      },
      error: "The patient changed this case after you claimed it. Your reading was not saved.",
      announcement: "Reading not saved because the case changed.",
    };
  }
  const clean = proposals
    .filter((proposal) => med.review?.selectedFields.includes(proposal.key))
    .map((proposal) => ({ key: proposal.key, value: proposal.value.trim() }));
  if (clean.every((proposal) => !proposal.value)) {
    return {
      med,
      error: "Type what you can see, or ask for a clearer image instead of submitting a blank reading.",
      announcement: "",
    };
  }
  return {
    med: { ...med, review: { ...med.review, status: "submitted", proposals: clean, conflict: null } },
    error: null,
    announcement: "Reading submitted. The patient still has to review it. Nothing was auto-confirmed.",
  };
}

export function askForClearerImage(med: MedCase): StepResult {
  if (!med.review || med.review.status !== "claimed") {
    return { med, error: "Claim the reading before responding.", announcement: "" };
  }
  if (med.review.caseRevision !== med.revision) {
    return {
      med: {
        ...med,
        review: { ...med.review, conflict: "The patient changed this case. Nothing was sent." },
      },
      error: "The patient changed this case. Nothing was sent.",
      announcement: "",
    };
  }
  return {
    med: { ...med, review: { ...med.review, status: "needs_new_image", proposals: [], conflict: null } },
    error: null,
    announcement: "The patient will be asked for a clearer image.",
  };
}

export function reloadReview(med: MedCase): StepResult {
  if (!med.review) return { med, error: "There is no reading request.", announcement: "" };
  const status = med.review.status === "pending" ? "pending" : "claimed";
  return {
    med: {
      ...med,
      review: { ...med.review, caseRevision: med.revision, status, proposals: [], conflict: null },
    },
    error: null,
    announcement: "The reading desk is now looking at the current revision.",
  };
}

export function applyProposals(med: MedCase, keys: FieldKey[]): StepResult {
  const review = med.review;
  if (!review || review.status !== "submitted") {
    return { med, error: "There is no proposed reading to apply.", announcement: "" };
  }
  if (review.caseRevision !== med.revision) {
    return {
      med: {
        ...med,
        review: {
          ...review,
          conflict: "The label changed after this reading was submitted, so it was not applied.",
        },
      },
      error: "The label changed after this reading was submitted, so it was not applied.",
      announcement: "",
    };
  }
  const usable = keys.filter((key) => review.proposals.some((proposal) => proposal.key === key && proposal.value.trim()));
  if (usable.length === 0) {
    return { med, error: "Choose a proposed reading that has text.", announcement: "" };
  }
  return {
    med: editCase(med, (draft) => ({
      ...draft,
      fields: draft.fields.map((field) => {
        if (!usable.includes(field.key)) return field;
        const proposal = review.proposals.find((item) => item.key === field.key);
        if (!proposal) return field;
        return {
          ...field,
          value: proposal.value.trim(),
          rawText: proposal.value.trim(),
          provenance: "volunteer",
          reviewState: "unreviewed",
        };
      }),
      review: { ...review, status: "closed", conflict: null },
    })),
    error: null,
    announcement: "The proposed reading is in the fields. You still need to mark what matches the label.",
  };
}

export function dismissReview(med: MedCase): StepResult {
  if (!med.review) return { med, error: null, announcement: "" };
  return {
    med: { ...med, review: { ...med.review, status: "closed", conflict: null } },
    error: null,
    announcement: "The proposed reading was dismissed. Your fields were not changed.",
  };
}

export function replaceImage(med: MedCase, imageUrl: string) {
  return editCase(med, (draft) => ({
    ...draft,
    source: "upload" as const,
    sampleId: null,
    imageUrl,
    imageAlt: "Uploaded medication label. This demo does not read the new image automatically.",
    lines: [],
    title: "Uploaded label",
    situation: "The image changed, so confirmed fields need another look. This demo still does not read the file.",
    fields: draft.fields.map((field) =>
      field.reviewState === "user_confirmed" ? { ...field, reviewState: "unreviewed" as const } : field,
    ),
  }));
}

export function withPreferences(med: MedCase, preferences: Preferences) {
  const next = { ...med, preferences };
  if (!med.planReady) return next;
  return { ...next, tasks: proposedTasks(next) };
}

export function withSharing(med: MedCase, sharingEnabled: boolean): StepResult {
  return {
    med: { ...med, sharingEnabled },
    error: null,
    announcement: sharingEnabled
      ? "A supporter can now see the medication name, preferences, and tasks."
      : "Sharing is off. The supporter view no longer shows this plan.",
  };
}

export function withSuggestedTasks(med: MedCase) {
  return {
    ...med,
    planReady: true,
    tasks: proposedTasks(med),
    clearedNote: false,
  };
}

export function applyTask(
  med: MedCase,
  taskId: string,
  action: "accept" | "complete" | "release",
  actor: "patient" | "supporter",
): StepResult {
  const task = med.tasks.find((item) => item.id === taskId);
  if (!task) return { med, error: "That task is no longer on the plan.", announcement: "" };
  if (action === "accept") {
    if (task.status !== "proposed") {
      return { med, error: "That task was already taken.", announcement: "" };
    }
    return {
      med: {
        ...med,
        tasks: med.tasks.map((item) =>
          item.id === taskId
            ? { ...item, status: "accepted", owner: actor, acceptedAt: new Date().toISOString() }
            : item,
        ),
      },
      error: null,
      announcement: `Task accepted by the ${actor}.`,
    };
  }
  if (task.owner !== actor || task.status !== "accepted") {
    return { med, error: "Only the person who accepted this task can change it.", announcement: "" };
  }
  if (action === "complete") {
    return {
      med: {
        ...med,
        tasks: med.tasks.map((item) => (item.id === taskId ? { ...item, status: "completed" } : item)),
      },
      error: null,
      announcement: "Task marked complete.",
    };
  }
  return {
    med: {
      ...med,
      tasks: med.tasks.map((item) =>
        item.id === taskId ? { ...item, status: "proposed", owner: null, acceptedAt: null } : item,
      ),
    },
    error: null,
    announcement: "Task released. It is a proposal again.",
  };
}

export function validateImage(file: File) {
  const okType = file.type === "image/jpeg" || file.type === "image/png";
  if (!okType) {
    return `Use a JPEG or PNG. This file is ${file.type || "an unrecognized type"}.`;
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > 5 * 1024 * 1024) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `This image is ${mb} MB. The demo limit is 5 MB.`;
  }
  return null;
}

export function criticalReviewDone(med: MedCase) {
  return FIELD_META.filter((meta) => meta.critical).every((meta) => getField(med, meta.key).reviewState === "user_confirmed");
}
