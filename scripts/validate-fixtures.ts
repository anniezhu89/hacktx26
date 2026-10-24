import { readFileSync } from "node:fs";
import {
  caseSchema,
  explanation,
  savingsOption,
  reviewRequest,
  planResponse,
  eligibleForExplanation,
} from "../packages/contracts/src/index";
const read = (name: string) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));
for (const name of ["clear", "unreadable"]) caseSchema.parse(read(name));
explanation.parse(read("explanation"));
savingsOption.parse(read("savings"));
reviewRequest.parse(read("review"));
planResponse.parse(read("plan"));
if (eligibleForExplanation(caseSchema.parse(read("unreadable")).fields))
  throw new Error("Unreadable fixture must block explanation");
console.log("All six synthetic contract fixtures validated.");
