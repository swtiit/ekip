import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Artifact, Task } from "../protocol/index.js";

/** ANSI palette shared by the CLI surfaces. */
export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

export const STATUS_GLYPH: Record<string, string> = {
  pending: `${C.yellow}◌ pending${C.reset}`,
  claimed: `${C.blue}● working${C.reset}`,
  done: `${C.green}✔ done${C.reset}`,
  failed: `${C.red}✖ failed${C.reset}`,
};

export interface HubState {
  project: string;
  hubUrl: string;
  agents: Array<{ name: string; adapter: string; spawnable: boolean }>;
  tasks: Task[];
  context: Array<{ key: string; value: unknown; updatedBy: string; updatedAt: string }>;
}

export class HubDownError extends Error {}

export async function apiState(base: string): Promise<HubState> {
  try {
    const res = await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(3000) });
    return (await res.json()) as HubState;
  } catch {
    throw new HubDownError(
      `Cannot reach the hub at ${base} — is \`agent-bridge serve\` running in this project?`,
    );
  }
}

export async function apiDelegate(
  base: string,
  body: { to: string; prompt: string; title?: string; from?: string },
): Promise<Task> {
  const res = await fetch(`${base}/api/delegate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { task?: Task; error?: string };
  if (!data.task) throw new Error(data.error ?? "delegate failed");
  return data.task;
}

const hhmmss = (iso?: string): string =>
  (iso ? new Date(iso) : new Date()).toTimeString().slice(0, 8);

function duration(a: string, b: string): string {
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  if (s < 90) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** Root task + all descendants via parentId, oldest first. */
export function taskFamily(tasks: Task[], rootId: string): Task[] {
  const children = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId) {
      const list = children.get(t.parentId) ?? [];
      list.push(t);
      children.set(t.parentId, list);
    }
  }
  const out: Task[] = [];
  const walk = (id: string): void => {
    const t = tasks.find((x) => x.id === id);
    if (t) out.push(t);
    for (const c of (children.get(id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
      walk(c.id);
  };
  walk(rootId);
  return out;
}

function printTransition(t: Task, rootId: string): void {
  const indent = t.id === rootId ? "" : "  ";
  const who = t.id === rootId ? `${C.bold}${t.to}${C.reset}` : `${C.cyan}${t.to}${C.reset}`;
  let line = `${C.dim}${hhmmss(t.updatedAt)}${C.reset}  ${indent}${STATUS_GLYPH[t.status] ?? t.status}  ${who}  ${C.dim}${t.title.slice(0, 48)}${C.reset}`;
  if (t.status === "done" || t.status === "failed") {
    line += ` ${C.dim}(${duration(t.createdAt, t.updatedAt)})${C.reset}`;
  }
  console.log(line);
  if ((t.status === "done" || t.status === "failed") && t.result && t.id !== rootId) {
    const snippet = t.result.replace(/\s+/g, " ").slice(0, 110);
    console.log(`${" ".repeat(11)}${indent}${C.dim}└ ${snippet}${C.reset}`);
  }
}

function printFinal(t: Task): void {
  const color = t.status === "done" ? C.green : C.red;
  console.log("");
  console.log(`${color}${C.bold}━━ ${t.status.toUpperCase()} ━━${C.reset} ${C.dim}${t.title} · ${duration(t.createdAt, t.updatedAt)} total${C.reset}`);
  if (t.result) console.log(`\n${t.result}\n`);
  if (t.artifacts?.length) {
    console.log(`${C.bold}Artifacts${C.reset}`);
    for (const a of t.artifacts) console.log(`  ${C.cyan}${a.kind}${C.reset}  ${a.label ?? ""}  ${C.dim}${a.value.slice(0, 80)}${C.reset}`);
  }
}

/**
 * Live-follow a task and its descendants until the root finishes.
 * Polls the hub and prints one line per status transition — `tail -f` for a
 * delegation tree. Returns a process exit code.
 */
export async function followTask(base: string, rootId: string): Promise<number> {
  const seen = new Map<string, string>();
  let root: Task | undefined;
  for (;;) {
    let state: HubState | undefined;
    try {
      state = await apiState(base);
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const t of taskFamily(state.tasks, rootId)) {
      if (seen.get(t.id) !== t.status) {
        seen.set(t.id, t.status);
        printTransition(t, rootId);
      }
    }
    root = state.tasks.find((t) => t.id === rootId);
    if (!root) {
      console.error(`${C.red}Unknown task ${rootId}${C.reset}`);
      return 1;
    }
    if (root.status === "done" || root.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  printFinal(root);
  return root.status === "done" ? 0 : 1;
}

/** Resolve a full or unique-prefix task id against the hub state. */
export function resolveTaskId(state: HubState, idOrPrefix: string): Task | undefined {
  const exact = state.tasks.find((t) => t.id === idOrPrefix);
  if (exact) return exact;
  const matches = state.tasks.filter((t) => t.id.startsWith(idOrPrefix));
  if (matches.length > 1) {
    throw new Error(
      `Task id prefix "${idOrPrefix}" is ambiguous (${matches.length} matches) — use more characters.`,
    );
  }
  return matches[0];
}

export function printTaskTable(tasks: Task[], limit = 20): void {
  const rows = tasks
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
  if (rows.length === 0) {
    console.log(`${C.dim}No tasks.${C.reset}`);
    return;
  }
  for (const t of rows) {
    const route = `${t.from} → ${t.to}`.padEnd(24).slice(0, 24);
    console.log(
      `${STATUS_GLYPH[t.status] ?? t.status}  ${C.dim}${t.id.slice(0, 8)}${C.reset}  ${route} ${C.dim}${hhmmss(t.updatedAt)}${C.reset}  ${t.title.slice(0, 44)}`,
    );
  }
}

export function printTaskDetail(t: Task): void {
  console.log(`${C.bold}${t.title}${C.reset}  ${STATUS_GLYPH[t.status] ?? t.status}`);
  console.log(`${C.dim}id${C.reset}       ${t.id}`);
  console.log(`${C.dim}route${C.reset}    ${t.from} → ${t.to}  (depth ${t.depth}${t.parentId ? `, parent ${t.parentId.slice(0, 8)}` : ""})`);
  console.log(`${C.dim}created${C.reset}  ${t.createdAt}`);
  console.log(`${C.dim}updated${C.reset}  ${t.updatedAt}  (${duration(t.createdAt, t.updatedAt)})`);
  console.log(`\n${C.bold}Prompt${C.reset}\n${t.prompt}`);
  if (t.result) console.log(`\n${C.bold}Result${C.reset}\n${t.result}`);
  if (t.artifacts?.length) {
    console.log(`\n${C.bold}Artifacts${C.reset}`);
    for (const a of t.artifacts as Artifact[])
      console.log(`  ${C.cyan}${a.kind}${C.reset}  ${a.label ?? ""}\n${a.value}`);
  }
}

/** Read a prompt argument: inline text, or @file to load from disk. */
export function readPromptArg(arg: string, cwd: string): string {
  if (arg.startsWith("@")) {
    const path = resolve(cwd, arg.slice(1));
    if (!existsSync(path)) throw new Error(`Prompt file not found: ${path}`);
    return readFileSync(path, "utf8");
  }
  return arg;
}
