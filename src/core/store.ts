import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Artifact,
  BridgeState,
  ContextEntry,
  Task,
  TaskStatus,
} from "../protocol/index.js";

/**
 * In-memory task queue + context blackboard with best-effort JSON persistence.
 * The hub runs as a single process, so a plain object with synchronous writes
 * is enough; there is no cross-process contention to guard against.
 *
 * Emits a `"change"` event after every mutation so observers (the dashboard's
 * SSE stream, the watch CLI) can react without polling the state file.
 */
export class Store extends EventEmitter {
  private tasks = new Map<string, Task>();
  private context = new Map<string, ContextEntry>();

  constructor(private readonly filePath?: string) {
    super();
    // Every dashboard tab holds one SSE listener; don't warn at the default 10.
    this.setMaxListeners(100);
    if (filePath && existsSync(filePath)) {
      this.load(filePath);
    }
  }

  private load(path: string): void {
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as BridgeState;
      for (const t of data.tasks ?? []) this.tasks.set(t.id, t);
      for (const c of data.context ?? []) this.context.set(c.key, c);
    } catch {
      // Corrupt or partial state file — start clean rather than crash.
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    const snapshot: BridgeState = {
      tasks: [...this.tasks.values()],
      context: [...this.context.values()],
    };
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2));
    } catch {
      // Persistence is best-effort; keep serving from memory on failure.
    }
  }

  createTask(input: {
    from: string;
    to: string;
    title: string;
    prompt: string;
    context?: Record<string, unknown>;
    depth: number;
    parentId?: string;
  }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.tasks.set(task.id, task);
    this.persist();
    this.emit("change", { kind: "task", id: task.id });
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /** Oldest pending task addressed to `agent`, or undefined. */
  nextPending(agent: string): Task | undefined {
    return [...this.tasks.values()]
      .filter((t) => t.to === agent && t.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  listTasks(filter?: { to?: string; status?: TaskStatus }): Task[] {
    return [...this.tasks.values()]
      .filter((t) => (filter?.to ? t.to === filter.to : true))
      .filter((t) => (filter?.status ? t.status === filter.status : true))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  updateTask(
    id: string,
    patch: Partial<Pick<Task, "status" | "result" | "artifacts">>,
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    this.emit("change", { kind: "task", id: task.id });
    return task;
  }

  setContext(key: string, value: unknown, updatedBy: string): ContextEntry {
    const entry: ContextEntry = {
      key,
      value,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
    this.context.set(key, entry);
    this.persist();
    this.emit("change", { kind: "context", key });
    return entry;
  }

  getContext(key: string): ContextEntry | undefined {
    return this.context.get(key);
  }

  listContext(): ContextEntry[] {
    return [...this.context.values()];
  }
}

export type { Artifact };
