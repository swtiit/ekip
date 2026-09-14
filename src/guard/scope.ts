import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Folder confinement: decide whether a tool call stays inside the folder a
 * conversation was started in.
 *
 * Field-tested reason this exists: a headless `claude -p` started in folder A
 * read and wrote files in a sibling folder B without any permission prompt.
 * Nothing in the CLI confines a run to its working directory, so ekip checks
 * every file-touching tool call itself (see scope-hook.ts) and tells the agent
 * which folder it is working in.
 */

/** Resolve to a real absolute path, even when the target does not exist yet. */
export function realish(path: string): string {
  let cur = resolve(path);
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    tail.unshift(cur.slice(parent.length + 1));
    cur = parent;
  }
  let base = cur;
  try {
    base = realpathSync(cur);
  } catch {
    // keep the lexical path
  }
  return tail.length ? join(base, ...tail) : base;
}

export function isInside(scope: string, target: string): boolean {
  const root = realish(scope);
  const t = realish(target);
  if (t === root) return true;
  const rel = relative(root, t);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Places a command may legitimately name that are not project files. */
function systemPath(p: string): boolean {
  const home = homedir();
  const allowed = [
    "/usr", "/bin", "/sbin", "/opt", "/etc", "/dev", "/System", "/Library", "/Applications", "/nix",
    "/var/folders", "/private/var/folders", "/proc",
    join(home, ".npm"), join(home, ".cache"), join(home, ".nvm"), join(home, ".local"), join(home, ".cargo"),
    join(home, ".rustup"), join(home, ".pyenv"), join(home, ".bun"), join(home, "Library", "Caches"),
  ];
  return allowed.some((a) => p === a || p.startsWith(a + sep));
}

export interface ScopeVerdict {
  ok: boolean;
  /** the offending path, when not ok */
  path?: string;
}

const FILE_KEYS = ["file_path", "path", "notebook_path", "absolute_path", "directory", "dir"];

/**
 * Check one tool call. File tools must name paths inside `scope`; shell
 * commands must not reach into other user folders (absolute paths, `~`, or
 * `..` escapes). System locations (toolchains, caches, /dev/null) stay allowed.
 */
export function checkToolCall(scope: string, cwd: string, tool: string, input: unknown): ScopeVerdict {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const home = homedir();
  const expand = (p: string) => (p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p);

  if (tool === "Bash" || tool === "run_command" || tool === "shell") {
    const command = typeof args.command === "string" ? args.command : "";
    const tokens = command.split(/[\s;&|()<>=`"']+/).filter(Boolean);
    for (const raw of tokens) {
      if (!(raw.startsWith("/") || raw.startsWith("~") || raw.includes(".."))) continue;
      if (/^[a-z]+:\/\//i.test(raw)) continue; // URLs
      const target = resolve(cwd, expand(raw));
      if (isInside(scope, target)) continue;
      if (raw.startsWith("/") && systemPath(realish(target))) continue;
      return { ok: false, path: target };
    }
    return { ok: true };
  }

  for (const key of FILE_KEYS) {
    const value = args[key];
    if (typeof value !== "string" || !value) continue;
    const target = resolve(cwd, expand(value));
    // Claude Code keeps its own skills and plugins under ~/.claude; reading them is fine.
    if (tool === "Read" && isInside(join(home, ".claude"), target)) continue;
    if (!isInside(scope, target)) return { ok: false, path: target };
  }
  return { ok: true };
}

/** Tools whose inputs name files or run commands — the ones worth checking. */
export const GUARDED_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "Bash"];
