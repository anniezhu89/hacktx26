import { randomUUID } from "node:crypto";
import type { Case, Task, planRequest } from "@labelbridge/contracts";

type PlanInput = ReturnType<typeof planRequest.parse>;

/**
 * Deterministic practical suggestions. No model writes these, nothing about
 * medication or directions is suggested, and every task starts unassigned.
 */
export function suggestPlan(c: Case, input: PlanInput) {
  const make = (category: Task["category"], description: string): Task => ({
    id: randomUUID(),
    category,
    description,
    owner: null,
    status: "proposed",
    acceptedAt: null,
  });
  const tasks: Task[] = [];
  const tradeoffs: string[] = [];
  if (
    c.fields.some(
      (f) => f.key !== "quantity" && f.reviewState !== "user_confirmed",
    )
  )
    tasks.push(
      make(
        "review_label",
        "Help read and check the parts of the label that are not confirmed yet",
      ),
    );
  if (c.questions.length)
    tasks.push(
      make(
        "call_pharmacy",
        "Call the pharmacy with the questions listed on this label",
      ),
    );
  for (let i = 0; i < input.selectedOptionIds.length; i++)
    tasks.push(
      make(
        "research",
        "Look into the chosen savings source and note what it needs",
      ),
    );
  tasks.push(
    make(
      "call_pharmacy",
      "Ask the pharmacy what this quantity will cost before pickup",
    ),
  );
  for (const s of input.supporterConstraints) {
    if (/no|can't|cannot|none/i.test(s.transport))
      tradeoffs.push(
        "Your supporter cannot help with travel, so pickup may need another plan.",
      );
    else
      tasks.push(
        make(
          "transport",
          `Arrange a ride to pick up the medication (${s.transport})`,
        ),
      );
    if (s.availability.trim())
      tradeoffs.push(
        `Your supporter is available: ${s.availability.trim()}. Calls and pickup may need to fit that time.`,
      );
    if (s.budget !== null)
      tradeoffs.push(
        `A budget of $${s.budget} was noted. Prices are not confirmed, so check the cost with the pharmacy.`,
      );
  }
  return { tasks, tradeoffs };
}
