export const CONTRACT_VERSION = "1" as const;

export type DataMode = "live" | "cached" | "fixture";
export type Provenance = "ai" | "user" | "volunteer";
export type ReviewState = "unreviewed" | "user_confirmed" | "needs_help" | "unresolved";
export type FieldKey = "medicationName" | "strength" | "dosageForm" | "quantity" | "directions";
export type Persona = "patient" | "supporter" | "reviewer";
export type TaskCategory = "research" | "call_pharmacy" | "transport" | "review_label";
export type TaskStatus = "proposed" | "accepted" | "completed";
export type PriceBasis = "source_listed" | "estimate" | "unknown";
export type ReviewStatus = "pending" | "claimed" | "submitted" | "needs_new_image" | "closed";
export type Availability = "weeknights" | "weekends" | "limited";
export type Transport = "pickup" | "needs_ride" | "delivery";
export type Budget = "can_pay" | "lowest" | "barrier";

export type LabelField = {
  key: FieldKey;
  rawText: string | null;
  value: string | null;
  evidenceExcerpt: string | null;
  provenance: Provenance;
  reviewState: ReviewState;
};

export type LabelLine = {
  text: string;
  key: FieldKey | null;
  unreadable?: boolean;
};

export type ReferencePassage = {
  title: string;
  url: string;
  passage: string;
};

export type Explanation = {
  originalDirections: string;
  simplifiedText: string;
  fieldRevision: number;
  references: ReferencePassage[];
  unresolvedQuestions: string[];
  eligibleForExplanation: true;
};

export type SavingsOption = {
  id: string;
  sourceTitle: string;
  url: string;
  retrievedAt: string;
  matchedProduct: string;
  optionType: "savings_program" | "assistance_program";
  amount: number | null;
  currency: "USD" | null;
  priceBasis: PriceBasis;
  eligibilityNotes: string;
  missingRequirements: string[];
};

export type HeldOutListing = {
  id: string;
  sourceTitle: string;
  reason: string;
};

export type SavingsResult = {
  revision: number;
  location: string;
  copayNote: string | null;
  options: SavingsOption[];
  heldOut: HeldOutListing[];
  summary: string;
};

export type Task = {
  id: string;
  category: TaskCategory;
  description: string;
  owner: "patient" | "supporter" | null;
  status: TaskStatus;
  acceptedAt: string | null;
};

export type Question = {
  id: string;
  text: string;
  source: "user" | "system";
};

export type ReviewProposal = {
  key: FieldKey;
  value: string;
};

export type ReviewRequest = {
  id: string;
  caseId: string;
  caseRevision: number;
  selectedFields: FieldKey[];
  consentAt: string;
  status: ReviewStatus;
  proposals: ReviewProposal[];
  conflict: string | null;
};

export type Preferences = {
  availability: Availability;
  transport: Transport;
  budget: Budget;
};

export type MedCase = {
  id: string;
  revision: number;
  createdAt: string;
  expiresAt: string;
  fictionalData: true;
  contractVersion: typeof CONTRACT_VERSION;
  requestId: string;
  dataMode: DataMode;
  source: "sample" | "upload" | "text";
  sampleId: string | null;
  title: string;
  situation: string;
  lines: LabelLine[];
  imageUrl: string | null;
  imageAlt: string;
  fields: LabelField[];
  meaningUnclear: boolean;
  questions: Question[];
  tasks: Task[];
  preferences: Preferences;
  planReady: boolean;
  sharingEnabled: boolean;
  explanation: Explanation | null;
  savings: SavingsResult | null;
  review: ReviewRequest | null;
  clearedNote: boolean;
};

export type FieldMeta = {
  key: FieldKey;
  label: string;
  critical: boolean;
  hint: string;
};

export type StepResult = {
  med: MedCase;
  error: string | null;
  announcement: string;
};
