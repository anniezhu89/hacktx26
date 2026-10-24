import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.mjs";
export function verify(ref = "HEAD") {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  mkdirSync(resolve(root, ".verification"), { recursive: true });
  const directory = resolve(root, ".verification", `${sha}-${Date.now()}`);
  const report = {
    sha,
    mode: "fixture",
    startedAt: new Date().toISOString(),
    result: "FAILED",
    commands: [],
  };
  try {
    run("git", ["worktree", "add", "--detach", directory, sha], root);
    if (git("-C", directory, "status", "--porcelain"))
      throw new Error("Verification tree is not clean");
    for (const args of [["ci"], ["run", "check"], ["run", "smoke"]]) {
      run("npm", args, directory, {
        ...process.env,
        LABELBRIDGE_VERIFYING: "1",
      });
      report.commands.push({
        command: `npm ${args.join(" ")}`,
        outcome: "PASS",
      });
    }
    report.result = "PASS";
  } catch (error) {
    report.error = String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(
      resolve(root, ".verification", `${sha}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `Committed SHA ${sha}: ${report.result}. Report: .verification/${sha}.json`,
    );
    if (report.result === "PASS" && existsSync(directory))
      run("git", ["worktree", "remove", directory], root);
  }
  return sha;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  verify(process.argv[2]);
