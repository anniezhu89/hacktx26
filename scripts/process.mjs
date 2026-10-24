import { spawnSync } from "node:child_process";
export function run(command, args, cwd = process.cwd(), env = process.env) {
  const executable = command === "npm" ? process.execPath : command;
  const actualArgs =
    command === "npm"
      ? [
          process.env.npm_execpath ||
            new URL("../node_modules/npm/bin/npm-cli.js", import.meta.url)
              .pathname,
          ...args,
        ]
      : args;
  const result = spawnSync(executable, actualArgs, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}
