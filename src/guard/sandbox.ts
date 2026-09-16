import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { realish } from "./scope.js";

/**
 * OS-level folder confinement for agents that have no hook to check their
 * tool calls (Antigravity). On macOS the run is started under `sandbox-exec`
 * with a profile that:
 *
 * - writes: nothing in your home folder except the conversation's folder and
 *   an allowlist of places CLI agents keep state and caches (~/.gemini,
 *   ~/.cache, ~/.npm, ~/Library/Caches, ~/Library/Logs, Antigravity's app
 *   support folder). Shell startup files, LaunchAgents and other projects are
 *   refused. Writes outside home (temp folders) stay allowed.
 * - reads: not your ordinary home folders (Documents, other projects, …), and
 *   not credential stores — ~/.ssh, ~/.aws, ~/.gnupg, ~/.netrc, ~/.npmrc,
 *   git/docker/kube/gh credentials, Claude's and ekip's own files (the hub's
 *   tokens live in ~/.ekip/auth.json), shell history,
 *   browser profiles, Mail and Messages. (The keychain file stays reachable:
 *   agy signs in through it; its items remain protected by macOS itself.)
 * - network and processes are not restricted (the agent must reach its model).
 *
 * Field-tested with a real agy run. Later rules win in a sandbox profile,
 * which is what the allow-after-deny order relies on.
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

/** Where agents may write in home besides their folder. */
const WRITABLE_IN_HOME = [
  ".gemini",
  ".cache",
  ".npm",
  "Library/Caches",
  "Library/Logs",
  "Library/HTTPStorages",
  "Library/Application Support/Antigravity",
  // agy keeps its sign-in in the login keychain and opens the keychain file
  // itself (field-tested: blocking it means "please sign in"). The file is
  // encrypted, and macOS still asks before an app reads another app's item.
  "Library/Keychains",
];

/** Never readable, even though they sit in dot-folders or ~/Library. */
const SECRET_IN_HOME = [
  ".ssh", ".aws", ".gnupg", ".netrc", ".npmrc", ".git-credentials", ".docker", ".kube",
  ".config/gh", ".config/gcloud", ".azure", ".claude", ".claude.json", ".ekip",
  ".zsh_history", ".bash_history", ".python_history", ".node_repl_history",
  "Library/Cookies", "Library/Mail", "Library/Messages", "Library/Safari",
  "Library/Application Support/Google/Chrome", "Library/Application Support/Firefox",
  "Library/Application Support/BraveSoftware", "Library/Application Support/Arc",
];

export function sandboxProfile(scope: string, home = homedir(), command = ""): string {
  const root = realish(scope);
  const h = realish(home);
  // A sandboxed Claude run still needs its own settings and session files.
  const own = /(^|\/)claude$/.test(command) ? [".claude", ".claude.json"] : [];
  const writable = [...WRITABLE_IN_HOME, ...own];
  const secret = SECRET_IN_HOME.filter((d) => !own.includes(d));
  return [
    "(version 1)",
    "(allow default)",
    // writes: nothing in home, except agent state and caches
    `(deny file-write* (subpath ${quote(h)}))`,
    ...writable.map((d) => `(allow file-write* (subpath ${quote(join(h, d))}))`),
    // reads: not the ordinary folders in home (dot-folders and ~/Library stay readable)…
    `(deny file-read* (regex #"^${escapeRegex(h)}/[^.]"))`,
    `(allow file-read* (subpath ${quote(join(h, "Library"))}))`,
    // …and never credentials, history, keychains, browsers, mail
    ...secret.map((d) => `(deny file-read* file-write* (subpath ${quote(join(h, d))}))`),
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
  return { command: SANDBOX_EXEC, args: ["-p", sandboxProfile(scope, homedir(), command), command, ...args], confined: true };
}
