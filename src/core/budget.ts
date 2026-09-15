import type { Task, TaskBudget } from "../protocol/index.js";
import type { BridgeConfig } from "./config.js";
import type { Store } from "./store.js";

/**
 * Budgets: how much one request may spend before the hub stops it.
 *
 * On a subscription the scarce thing is the plan's usage limit, not money, so
 * a budget counts what drains it: worker runs, output tokens, wall time. It
 * applies to one *request* — a message a person sent (and everything handed
 * out from it), a flow run, or a top-level delegation from an agent. A
 * person's follow-up in the same conversation starts a fresh budget.
 *
 * Runs and time are enforced before anything starts (and time also stops
 * work in flight); output tokens are only known once a run reports, so a
 * token budget stops the *next* run, not the one that crossed it. Minutes
 * count from the first run launched for the request, not from when it was
 * made, so time spent queued or waiting for a person is free.
 */

export const BUDGET_DEFAULTS: Required<TaskBudget> = { runs: 20, outputTokens: 0, minutes: 120 };

export interface BudgetUsage {
  runs: number;
  outputTokens: number;
  minutes: number;
}

export interface BudgetReport {
  /** the task the budget belongs to */
  root: string;
  used: BudgetUsage;
  /** 0 means no limit */
  limit: Required<TaskBudget>;
  live: boolean;
}

export interface BudgetBreach {
  kind: "runs" | "outputTokens" | "minutes";
  used: number;
  limit: number;
}

const TERMINAL = new Set(["done", "failed", "cancelled"]);

/** A request starts where a person (or a flow) asked, or where a chain has no parent. */
export function startsRequest(task: Task): boolean {
  return !task.parentId || task.from === "human" || task.to.startsWith("flow:");
}

export function budgetRoot(store: Store, taskId: string): Task | undefined {
  let task = store.getTask(taskId);
  const seen = new Set<string>();
  while (task && !startsRequest(task) && !seen.has(task.id)) {
    seen.add(task.id);
    const parent = task.parentId ? store.getTask(task.parentId) : undefined;
    if (!parent) break;
    task = parent;
  }
  return task;
}

/** Every task that spends from this root's budget: the root and its descendants, stopping at nested requests. */
export function budgetScope(store: Store, rootId: string): Task[] {
  const all = store.listTasks();
  const root = store.getTask(rootId);
  if (!root) return [];
  const scope: Task[] = [root];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const t of all) {
      if (t.parentId !== id || startsRequest(t)) continue;
      scope.push(t);
      stack.push(t.id);
    }
  }
  return scope;
}

export function budgetLimit(config: BridgeConfig, root: Task): Required<TaskBudget> {
  const pick = (key: keyof TaskBudget): number => {
    const v = root.budget?.[key] ?? config.budget?.[key] ?? BUDGET_DEFAULTS[key];
    return typeof v === "number" && v > 0 ? v : 0;
  };
  return { runs: pick("runs"), outputTokens: pick("outputTokens"), minutes: pick("minutes") };
}

export function budgetUsage(store: Store, rootId: string, extraRuns = 0): BudgetUsage {
  const scope = budgetScope(store, rootId);
  let runs = extraRuns;
  let outputTokens = 0;
  let end = 0;
  // The clock starts when work first launches: waiting in a queue, or for a
  // person or polling agent to pick the task up, doesn't spend the budget.
  let start = Number.POSITIVE_INFINITY;
  let live = false;
  for (const t of scope) {
    if (t.dispatchedAt) {
      runs++;
      start = Math.min(start, Date.parse(t.dispatchedAt));
    }
    outputTokens += t.usage?.outputTokens ?? 0;
    if (!TERMINAL.has(t.status)) live = true;
    end = Math.max(end, Date.parse(t.updatedAt));
  }
  const minutes = Number.isFinite(start) ? Math.max(0, (live ? Date.now() : end) - start) / 60_000 : 0;
  return { runs, outputTokens, minutes };
}

export function budgetReport(config: BridgeConfig, store: Store, rootId: string): BudgetReport | undefined {
  const root = store.getTask(rootId);
  if (!root) return undefined;
  const used = budgetUsage(store, rootId);
  const live = budgetScope(store, rootId).some((t) => !TERMINAL.has(t.status));
  return { root: rootId, used: { ...used, minutes: Math.round(used.minutes * 10) / 10 }, limit: budgetLimit(config, root), live };
}

/**
 * Would starting one more run break the budget? `pendingRuns` counts runs
 * already admitted but not launched yet (queued), so a burst can't slip past.
 */
export function checkBudget(config: BridgeConfig, store: Store, rootId: string, pendingRuns = 0): BudgetBreach | undefined {
  const root = store.getTask(rootId);
  if (!root) return undefined;
  const limit = budgetLimit(config, root);
  const used = budgetUsage(store, rootId, pendingRuns);
  if (limit.runs && used.runs >= limit.runs) return { kind: "runs", used: used.runs, limit: limit.runs };
  if (limit.outputTokens && used.outputTokens >= limit.outputTokens) {
    return { kind: "outputTokens", used: used.outputTokens, limit: limit.outputTokens };
  }
  if (limit.minutes && used.minutes >= limit.minutes) {
    return { kind: "minutes", used: Math.round(used.minutes * 10) / 10, limit: limit.minutes };
  }
  return undefined;
}

/** Validate a budget from a request body: numbers ≥ 0, whole runs and tokens. */
export function parseBudget(value: unknown): TaskBudget | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return "`budget` must be an object like { runs, outputTokens, minutes }";
  const out: TaskBudget = {};
  for (const key of ["runs", "outputTokens", "minutes"] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return `budget.${key} must be a number ≥ 0 (0 = no limit)`;
    out[key] = key === "minutes" ? n : Math.round(n);
  }
  return out;
}

/** The sentence the hub records when a budget stops something — in the hub's language. */
export function describeBreach(breach: BudgetBreach, language?: string): string {
  const vi = /^vi|việt/i.test((language ?? "").trim());
  const n = (x: number) => x.toLocaleString("en-US");
  if (vi) {
    const what = breach.kind === "runs" ? `${breach.used}/${breach.limit} lượt chạy` : breach.kind === "outputTokens" ? `${n(breach.used)}/${n(breach.limit)} token ra` : `${breach.used}/${breach.limit} phút`;
    return `hết ngân sách của yêu cầu này: đã dùng ${what}`;
  }
  const what = breach.kind === "runs" ? `${breach.used}/${breach.limit} runs` : breach.kind === "outputTokens" ? `${n(breach.used)}/${n(breach.limit)} output tokens` : `${breach.used}/${breach.limit} minutes`;
  return `budget for this request used up: ${what}`;
}
