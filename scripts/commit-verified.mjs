import { execFileSync } from "node:child_process";
import { run } from "./process.mjs";
import { verify } from "./verify-sha.mjs";
const message = process.argv.slice(2).join(" ").trim();
if (!message)
  throw new Error("Provide a commit message; stage files explicitly first.");
if (
  !execFileSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf8",
  }).trim()
)
  throw new Error("No staged files.");
run("npm", ["run", "check"]);
run("git", ["commit", "-m", message]);
verify("HEAD");
