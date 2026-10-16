// Points git at the committed hooks in .githooks (so the pre-push checks apply to every clone). Runs from `npm install` (the "prepare" script).
// Quietly does nothing where there is no git checkout (a deploy that installs from a tarball) or no git command.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

if (existsSync(".git")) {
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
    console.log("git hooks: pre-push checks enabled (.githooks)");
  } catch {
    console.log("git hooks: git not available, skipped");
  }
}
