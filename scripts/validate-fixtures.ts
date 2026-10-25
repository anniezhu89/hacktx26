import { readFileSync } from "node:fs";
import {
  caseSchema,
  explanation,
  savingsOption,
  reviewRequest,
  reviewerView,
  sharedCase,
  planResponse,
  medicineInfo,
  circleResponse,
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
medicineInfo.parse(read("medicine-info"));
circleResponse.shape.data.parse(read("circle"));
// A citation to a passage that was not retrieved must be rejected.
const badCitation = read("medicine-info");
badCitation.sections[0].summary.points[0].passageIds = ["invented-id"];
if (medicineInfo.safeParse(badCitation).success)
  throw new Error("medicine-info must reject invented citations");
console.log("All twelve synthetic contract fixtures validated.");
