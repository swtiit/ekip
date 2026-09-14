import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { realish } from "./scope.js";

/**
 * OS-level folder confinement for agents that have no hook to check their
 * tool calls (Antigravity). On macOS the run is started under `sandbox-exec`
 * with a profile that:
 *
 * - blocks writes anywhere in your home folder except the conversation's
 *   folder and the places CLI agents keep their own state (dot-folders,
 *   ~/Library) — writes outside home (temp dirs) stay allowed;
 * - blocks reads of your ordinary home folders (Documents, projects, …) and
 *   of credential folders (~/.ssh, ~/.aws, ~/.gnupg), except the
 *   conversation's folder.
 *
 * Field-tested with a probe: inside writes succeed; writing or reading a
 * sibling folder fails with "Operation not permitted". Later rules win in a
 * sandbox profile, which is what the allow-after-deny order relies on.
 *
 * Other platforms have no equivalent built in, so runs there get the
 * instruction only (the dispatcher still tells the agent its folder).
 */

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

function quote(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeRegex(path: string): string {
  return path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export function sandboxProfile(scope: string, home = homedir()): string {
  const root = realish(scope);
  const h = realish(home);
  const secrets = [".ssh", ".aws", ".gnupg"].map((d) => join(h, d));
  return [
    "(version 1)",
    "(allow default)",
    // writes: nothing in home…
    `(deny file-write* (subpath ${quote(h)}))`,
    // …except agent state (dot-folders, ~/Library)
    `(allow file-write* (regex #"^${escapeRegex(h)}/\\."))`,
    `(allow file-write* (subpath ${quote(join(h, "Library"))}))`,
    // reads: not the ordinary folders in home, not credentials
    `(deny file-read* (regex #"^${escapeRegex(h)}/[^.]"))`,
    `(allow file-read* (subpath ${quote(join(h, "Library"))}))`,
    ...secrets.map((s) => `(deny file-read* file-write* (subpath ${quote(s)}))`),
    // the conversation's folder wins over all of the above
    `(allow file-read* file-write* (subpath ${quote(root)}))`,
  ].join("\n");
}

export function sandboxAvailable(): boolean {
  return process.platform === "darwin" && existsSync(SANDBOX_EXEC);
}

/** Wrap a command so it runs confined to `scope`, or return it unchanged when the OS can't. */
export function confine(command: string, args: string[], scope: string | undefined): { command: string; args: string[]; confined: boolean } {
  if (!scope || !sandboxAvailable()) return { command, args, confined: false };
  return { command: SANDBOX_EXEC, args: ["-p", sandboxProfile(scope), command, ...args], confined: true };
}
