import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Artifact,
  BridgeState,
  ContextEntry,
  Message,
  MessageKind,
  Task,
  TaskStatus,
} from "../protocol/index.js";
import { isTerminal } from "../protocol/index.js";

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
  /** conversation lines, keyed by thread (root task) id, in arrival order */
  private messages = new Map<string, Message[]>();
  /** folders chosen for conversations, most recent first */
  private folders: string[] = [];

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
      for (const c of data.context ?? []) this.context.set(Store.ctxKey(c.folder, c.key), c);
      for (const m of data.messages ?? []) this.threadMessages(m.threadId).push(m);
      this.folders = Array.isArray(data.folders) ? data.folders.filter((f) => typeof f === "string") : [];
    } catch {
      // Corrupt or partial state file — start clean rather than crash.
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    const snapshot: BridgeState = {
      tasks: [...this.tasks.values()],
      context: [...this.context.values()],
      messages: [...this.messages.values()].flat(),
      folders: this.folders,
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
    cwd?: string;
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

  /** Remember a folder as recently used (moves it to the front). */
  touchFolder(path: string): void {
    this.folders = [path, ...this.folders.filter((f) => f !== path)].slice(0, 30);
    this.persist();
    this.emit("change", { kind: "folders" });
  }

  forgetFolder(path: string): void {
    this.folders = this.folders.filter((f) => f !== path);
    this.persist();
    this.emit("change", { kind: "folders" });
  }

  listFolders(): string[] {
    return [...this.folders];
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /** Root of the delegation tree a task belongs to (itself when it has no parent). */
  threadOf(taskId: string): string {
    let cur = this.tasks.get(taskId);
    const seen = new Set<string>();
    while (cur?.parentId && this.tasks.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = this.tasks.get(cur.parentId);
    }
    return cur?.id ?? taskId;
  }

  private threadMessages(threadId: string): Message[] {
    let list = this.messages.get(threadId);
    if (!list) {
      list = [];
      this.messages.set(threadId, list);
    }
    return list;
  }

  addMessage(input: {
    taskId: string;
    from: string;
    to?: string;
    kind: MessageKind;
    text: string;
    meta?: Record<string, unknown>;
  }): Message {
    const message: Message = {
      id: randomUUID(),
      threadId: this.threadOf(input.taskId),
      at: new Date().toISOString(),
      ...input,
    };
    this.threadMessages(message.threadId).push(message);
    this.persist();
    this.emit("change", { kind: "message", id: message.id, threadId: message.threadId, taskId: message.taskId });
    return message;
  }

  /**
   * Remove a whole conversation: its root task, everything delegated from it,
   * and its transcript. Returns the removed tasks so the caller can delete
   * their spawn logs. The caller decides what to do about live tasks.
   */
  deleteThread(rootId: string): Task[] {
    const family = [...this.tasks.values()].filter((t) => this.threadOf(t.id) === rootId);
    if (family.length === 0) return [];
    for (const t of family) this.tasks.delete(t.id);
    this.messages.delete(rootId);
    this.persist();
    this.emit("change", { kind: "thread-deleted", threadId: rootId, count: family.length });
    return family;
  }

  listMessages(threadId: string): Message[] {
    return [...(this.messages.get(threadId) ?? [])];
  }

  /** Root tasks (thread heads), newest first, with a line count each. */
  listThreads(): Array<{ task: Task; messages: number; lastAt: string }> {
    return [...this.tasks.values()]
      .filter((t) => !t.parentId || !this.tasks.has(t.parentId))
      .map((t) => {
        const msgs = this.messages.get(t.id) ?? [];
        return { task: t, messages: msgs.length, lastAt: msgs[msgs.length - 1]?.at ?? t.updatedAt };
      })
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
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
    patch: Partial<Pick<Task, "status" | "result" | "artifacts" | "dispatchedAt" | "pid" | "exitCode" | "usage">>,
    /** `touch: false` records bookkeeping (pid, exit code) without moving `updatedAt` */
    opts: { touch?: boolean } = {},
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, patch, opts.touch === false ? {} : { updatedAt: new Date().toISOString() });
    // `undefined` means "clear the field" — drop it so it doesn't persist as null.
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      if (patch[key] === undefined) delete task[key];
    }
    this.persist();
    this.emit("change", { kind: "task", id: task.id });
    return task;
  }

  /**
   * Drop finished tasks last touched before `cutoff` (ISO time). Returns what
   * was removed so the caller can clean up their spawn logs too.
   */
  prune(cutoff: string): Task[] {
    const removed: Task[] = [];
    for (const task of this.tasks.values()) {
      if (isTerminal(task.status) && task.updatedAt < cutoff) removed.push(task);
    }
    if (removed.length === 0) return removed;
    for (const t of removed) {
      this.tasks.delete(t.id);
      // A thread's transcript goes with its root task.
      this.messages.delete(t.id);
    }
    this.persist();
    this.emit("change", { kind: "prune", count: removed.length });
    return removed;
  }

  private static ctxKey(folder: string | undefined, key: string): string {
    return `${folder ?? ""}\u0000${key}`;
  }

  /**
   * Write a blackboard entry. `folder` scopes it (undefined = the hub's own
   * project), so conversations in different projects never see each other's keys.
   */
  setContext(key: string, value: unknown, updatedBy: string, folder?: string): ContextEntry {
    const entry: ContextEntry = {
      ...(folder ? { folder } : {}),
      key,
      value,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
    this.context.set(Store.ctxKey(folder, key), entry);
    this.persist();
    this.emit("change", { kind: "context", key });
    return entry;
  }

  getContext(key: string, folder?: string): ContextEntry | undefined {
    return this.context.get(Store.ctxKey(folder, key));
  }

  /** Entries of one folder's blackboard; pass `"*"` for every folder. */
  listContext(folder?: string): ContextEntry[] {
    const all = [...this.context.values()];
    return folder === "*" ? all : all.filter((c) => (c.folder ?? undefined) === folder);
  }
}

export type { Artifact };
