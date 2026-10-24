import { readFileSync } from "node:fs";
import {
  caseSchema,
  explanation,
  savingsOption,
  reviewRequest,
  reviewerView,
  sharedCase,
  planResponse,
  eligibleForExplanation,
} from "../packages/contracts/src/index";
const read = (name: string) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));
for (const name of ["clear", "unreadable", "ambiguous"])
  caseSchema.parse(read(name));
explanation.parse(read("explanation"));
savingsOption.parse(read("savings"));
for (const name of ["review", "review-submitted"])
  reviewRequest.parse(read(name));
reviewerView.parse(read("reviewer-view"));
sharedCase.parse(read("shared-case"));
planResponse.parse(read("plan"));
for (const name of ["unreadable", "ambiguous"])
  if (eligibleForExplanation(caseSchema.parse(read(name)).fields))
    throw new Error(`${name} fixture must block explanation`);
console.log("All ten synthetic contract fixtures validated.");
