import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Task } from "../protocol/index.js";
import { DEFAULT_MAX_DEPTH, isTerminal } from "../protocol/index.js";
import { getAdapter } from "../adapters/index.js";
import type { WorkerEvent, WorkerExit } from "../adapters/index.js";
import type { AgentConfig, BridgeConfig } from "./config.js";
import { DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT_TOTAL, hubUrl, resolveRoleFile } from "./config.js";
import { checkToolCall } from "../guard/scope.js";
import { hubToken } from "./access.js";
import { spawnLogHint, spawnLogPath } from "./logs.js";
import { recordSeenModel } from "./models.js";
import type { Store } from "./store.js";
import { budgetLimit, budgetRoot, budgetScope, budgetUsage, checkBudget, describeBreach } from "./budget.js";
import { hubWords } from "./words.js";

export interface DispatchOutcome {
  spawned: boolean;
  /** true when the task waits for a concurrency slot instead of launching now */
  queued?: boolean;
  reason?: string;
  detail?: string;
}

interface RunningWorker {
  taskId: string;
  agent: string;
  pid: number;
  /** folder the worker runs in */
  folder: string;
  /** edits files — holds the folder's editor slot */
  writer: boolean;
}

/** Does this member edit files? Explicit `writer` wins; otherwise read it off its permissions. */
export function isWriter(agent: AgentConfig): boolean {
  if (agent.writer !== undefined) return agent.writer;
  if (agent.adapter === "antigravity") return true;
  const args = agent.args ?? [];
  return args.some((a) => /^(acceptEdits|bypassPermissions)$/.test(a) || a === "--dangerously-skip-permissions");
}

/** How long after a worker exits we wait for an in-flight post_result before failing the task. */
const EXIT_GRACE_MS = 1500;

/**
 * Turns a freshly-created task into a running headless agent — and keeps
 * watching it.
 *
 * Looks up the target agent in config, finds its adapter, and spawns it with a
 * bootstrap prompt telling it to claim the task, do the work, and post a
 * result. The agent reports back through the bridge MCP tools; the dispatcher
 * only tracks the *process*: when it exits without having posted a result,
 * the task fails immediately (with the exit code and any quota/permission
 * hint from its log) instead of waiting for the watchdog TTL.
 *
 * Concurrency: `maxConcurrent` (hub-wide, and optionally per agent) caps how
 * many workers run at once. Tasks past the cap queue in FIFO order and launch
 * as slots free up — the guard against a runaway conductor spawning ten Opus
 * runs into the same quota.
 */
export class Dispatcher {
  private readonly running = new Map<string, RunningWorker>();
  /**
   * Workers whose task is already finished but whose process is still alive.
   *
   * A spawned `claude -p` can linger for minutes after posting its result
   * (SessionEnd hooks, telemetry flushes). Field-tested: ~2 minutes. Those
   * seconds must not hold a concurrency slot, so the worker moves here — it
   * no longer counts against `maxConcurrent`, but stays killable.
   */
  private readonly lingering = new Map<string, RunningWorker>();
  private readonly queue: Task[] = [];

  constructor(
    private readonly config: BridgeConfig,
    private readonly store: Store,
  ) {}

  /** Standing role instructions from the agent's promptFile, if configured. */
  private rolePrompt(agent: AgentConfig): string | undefined {
    if (!agent.promptFile) return undefined;
    const path = resolveRoleFile(this.config.projectRoot, agent.promptFile);
    if (!path) return undefined;
    try {
      const text = readFileSync(path, "utf8").trim();
      return text || undefined;
    } catch {
      // Missing role file shouldn't block dispatch; the bootstrap still works.
      return undefined;
    }
  }

  /**
   * Who else is on the crew, by address and by what they are for — so an
   * agent picks "claude-coder" for code because its description says so, not
   * because it guessed from the name.
   */
  private crewLines(self: string): string[] {
    const others = this.config.agents.filter((a) => a.name !== self);
    if (others.length === 0) return [];
    return [
      `Your crew — delegate with \`bridge_delegate\` using the name on the left:`,
      ...others.map(
        (a) =>
          `- ${a.name}${a.label ? ` (${a.label})` : ""}: ${a.description ?? `${a.adapter} agent`}${
            a.spawnable === false ? " — works interactively, may not pick up right away" : ""
          }`,
      ),
    ];
  }

  /** The folder a task works in (its own, or the hub's project). */
  folderOf(task: Task): string {
    return task.cwd ?? this.config.projectRoot;
  }

  private guardOn(): boolean {
    return this.config.folderGuard !== false;
  }

  /**
   * One secret per launched run. It is handed only to that run (its prompt and
   * environment) and is required to claim the task, so another session — a
   * stray client, or a prompt-injected run — can't take over a task and post
   * its result before the real worker does.
   */
  private readonly runKeys = new Map<string, string>();

  issueRunKey(taskId: string): string {
    const key = randomBytes(18).toString("base64url");
    this.runKeys.set(taskId, key);
    return key;
  }

  /** undefined: the hub started no run for this task (so no key applies). */
  runKeyMatches(taskId: string, key: string | undefined): boolean | undefined {
    const expected = this.runKeys.get(taskId);
    if (expected === undefined) return undefined;
    if (typeof key !== "string" || key.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  }

  /** The task a run key was issued for, if it is still outstanding. */
  taskForRunKey(key: string | undefined): string | undefined {
    if (!key) return undefined;
    for (const [taskId, k] of this.runKeys) if (k === key) return taskId;
    return undefined;
  }

  private buildBootstrap(task: Task, role: string | undefined, runKey: string): string {
    const header = role
      ? [`[Standing role instructions for "${task.to}"]`, role, "", "---", ""]
      : [];
    const me = this.config.agents.find((a) => a.name === task.to);
    return [
      ...header,
      `You are the agent "${task.to}"${me?.label ? ` (${me.label})` : ""} in an ekip session.`,
      ...(me?.description ? [`Your part in the crew: ${me.description}`] : []),
      `A task has been delegated to you by "${task.from}".`,
      ``,
      `If instructions conflict, follow this order: (1) limits the hub enforces — working folder, parallel runs, delegation depth — which you cannot override; (2) your standing role instructions${role ? " above" : ""}; (3) the task request below; (4) your own defaults. If the task asks for something your role rules out, do only what the role allows and say plainly in bridge_post_result what you did not do and why.`,
      ``,
      `1. Call the MCP tool \`bridge_claim\` with { as: "${task.to}", task_id: "${task.id}", run_key: "${runKey}" } to acknowledge it. The run_key is yours alone: never write it into files, results or messages.`,
      `2. Do what the task asks, in the way your role describes — do the work yourself, or hand parts of it to crew members, whichever your role calls for.`,
      `3. When finished, call \`bridge_post_result\` with { task_id: "${task.id}", status: "done", result: "<summary>" }. Use status "failed" if you could not complete it.`,
      `You may read/write shared context with \`bridge_context_get\` / \`bridge_context_set\`, and delegate sub-tasks with \`bridge_delegate\` — the hub links them to this task (same folder, same budget) automatically.`,
      ...this.crewLines(task.to),
      ...(this.guardOn()
        ? [
            `Working folder: ${this.folderOf(task)}`,
            `Stay inside it. Read, search, create and change files only under this folder, and run commands from it. Do not look into or modify any other folder. If the task truly needs something outside it, stop and explain that in bridge_post_result instead.`,
          ]
        : []),
      ...(this.config.language
        ? [
            `Write in ${this.config.language}: everything you say, every bridge_say note, and your bridge_post_result summary. Code, file names, commands and identifiers stay as they are.`,
          ]
        : []),
      `Talk as you go: \`bridge_say\` posts a short note (a finding, a question for a peer, a decision) to this task's conversation, and \`bridge_thread\` reads what others said. Keep notes brief; the final answer still goes through bridge_post_result.`,
      ``,
      `Task (id ${task.id}): ${task.title}`,
      ``,
      task.prompt,
      ...(task.context && Object.keys(task.context).length > 0
        ? ["", "Attached context from the delegating agent:", JSON.stringify(task.context, null, 2)]
        : []),
    ].join("\n");
  }

  /** Reject outright: the task can never run, so say so on the task itself. */
  private refuse(task: Task, reason: string, meta?: Record<string, unknown>): DispatchOutcome {
    const text = this.words().refused(reason);
    this.store.updateTask(task.id, { status: "failed", result: text });
    this.store.addMessage({ taskId: task.id, from: "hub", kind: "system", text, meta: { refused: true, ...meta } });
    return { spawned: false, reason };
  }

  private onWorkerEvent(taskId: string, agent: string, event: WorkerEvent): void {
    if (event.kind === "text") {
      this.store.addMessage({ taskId, from: agent, kind: "agent", text: event.text });
    } else if (event.kind === "tool") {
      this.store.addMessage({
        taskId,
        from: agent,
        kind: "tool",
        text: summarizeToolInput(event.name, event.input),
        meta: { tool: event.name, input: event.input },
      });
      const task = this.store.getTask(taskId);
      if (task && this.guardOn()) {
        const folder = this.folderOf(task);
        const verdict = checkToolCall(folder, folder, event.name, event.input);
        if (!verdict.ok) {
          this.store.addMessage({
            taskId,
            from: "hub",
            kind: "system",
            text: this.words().blockedOutside(event.name, verdict.path ?? ""),
            meta: { guard: true, path: verdict.path, folder },
          });
        }
      }
    } else if (event.kind === "model") {
      recordSeenModel(event.model);
      const task = this.store.getTask(taskId);
      if (task?.usage?.model !== event.model) {
        this.store.updateTask(taskId, { usage: { ...task?.usage, model: event.model } }, { touch: false });
      }
    } else if (event.kind === "usage") {
      const task = this.store.getTask(taskId);
      this.store.updateTask(taskId, { usage: { model: task?.usage?.model, ...event.usage } }, { touch: false });
    }
  }

  /**
   * Slots are counted per folder, so a busy project doesn't queue another
   * one's work; a ceiling across all folders still guards the quota. A
   * member's own cap also applies per folder.
   */
  private hasSlot(agent: AgentConfig, task: Task): boolean {
    return this.slotBlocker(agent, task) === undefined;
  }

  /** The hub's sentences, in its reporting language (read live: Settings can change it). */
  private words() {
    return hubWords(this.config.language);
  }

  /** Why this task can't start yet, or undefined when it can. */
  private slotBlocker(agent: AgentConfig, task: Task): { reason: string; editor?: boolean } | undefined {
    const w = this.words();
    const total = this.config.maxConcurrentTotal ?? DEFAULT_MAX_CONCURRENT_TOTAL;
    if (this.running.size >= total) return { reason: w.blockAllFolders(this.running.size) };
    const folder = this.folderOf(task);
    let inFolder = 0;
    let agentInFolder = 0;
    const writers: string[] = [];
    for (const w of this.running.values()) {
      if (w.folder !== folder) continue;
      inFolder++;
      if (w.agent === agent.name) agentInFolder++;
      if (w.writer) writers.push(w.agent);
    }
    if (inFolder >= (this.config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)) return { reason: w.blockFolder(inFolder) };
    if (agent.maxConcurrent !== undefined && agentInFolder >= agent.maxConcurrent) return { reason: w.blockAgent(agentInFolder, agent.name) };
    const writerCap = this.config.writersPerFolder ?? 1;
    if (writerCap > 0 && isWriter(agent) && writers.length >= writerCap) {
      return { reason: w.blockEditor(writers.join(", ")), editor: true };
    }
    return undefined;
  }

  async dispatch(task: Task): Promise<DispatchOutcome> {
    const maxDepth = this.config.maxDepth ?? DEFAULT_MAX_DEPTH;
    if (task.depth > maxDepth) {
      return this.refuse(task, this.words().depthExceeded(maxDepth));
    }

    const root = budgetRoot(this.store, task.id);
    if (root) {
      const queuedInScope = this.queue.filter((q) => budgetRoot(this.store, q.id)?.id === root.id).length;
      const breach = checkBudget(this.config, this.store, root.id, queuedInScope);
      if (breach) return this.refuse(task, describeBreach(breach, this.config.language), { budget: breach, budgetRoot: root.id });
    }

    const agent = this.config.agents.find((a) => a.name === task.to);
    if (!agent) return this.refuse(task, this.words().unknownAgent(task.to));
    if (agent.spawnable === false) {
      return {
        spawned: false,
        reason: `agent "${task.to}" is not spawnable; it must poll for tasks`,
      };
    }
    if (!getAdapter(agent.adapter)) {
      return this.refuse(task, `no adapter "${agent.adapter}" registered for agent "${task.to}"`);
    }

    const blocker = this.slotBlocker(agent, task);
    if (blocker) {
      this.queue.push(task);
      this.store.addMessage({
        taskId: task.id,
        from: "hub",
        kind: "system",
        text: this.words().queued(agent.name, blocker.reason, this.queue.length),
        meta: { queued: true, writerWait: blocker.editor === true },
      });
      return {
        spawned: false,
        queued: true,
        reason: `queued: ${blocker.reason} (position ${this.queue.length})`,
      };
    }
    return this.launch(task, agent);
  }

  private async launch(task: Task, agent: AgentConfig): Promise<DispatchOutcome> {
    try {
      return await this.launchUnsafe(task, agent);
    } catch (err) {
      // e.g. the log folder can't be created, or the process table / fd limit is full.
      // Fail the task with the reason instead of leaving it pending with nobody coming.
      return this.refuse(task, this.words().couldNotStart((err as Error).message));
    }
  }

  private async launchUnsafe(task: Task, agent: AgentConfig): Promise<DispatchOutcome> {
    const adapter = getAdapter(agent.adapter)!;
    const runKey = this.issueRunKey(task.id);
    const result = await adapter.spawn({
      agentName: agent.name,
      runKey,
      prompt: this.buildBootstrap(task, this.rolePrompt(agent), runKey),
      // The conversation's folder wins: that is where the person asked for
      // the work to happen. Logs stay with the hub either way.
      cwd: task.cwd ?? agent.cwd ?? this.config.projectRoot,
      logFile: spawnLogPath(this.config.projectRoot, agent.name, task.id),
      taskId: task.id,
      hubUrl: hubUrl(this.config),
      depth: task.depth,
      extraArgs: agent.args,
      command: agent.command,
      scope: this.guardOn() ? this.folderOf(task) : undefined,
      // An explicit `sandbox: true` always applies; the Antigravity default follows the folder guard.
      sandbox: agent.sandbox === true || (agent.sandbox !== false && this.guardOn() && agent.adapter === "antigravity"),
      hubHeaders: hubToken(this.config) ? { Authorization: `Bearer ${hubToken(this.config)}` } : undefined,
      onExit: (exit) => this.onWorkerExit(task.id, agent.name, exit),
      onEvent: (event) => this.onWorkerEvent(task.id, agent.name, event),
    });

    if (!result.launched) {
      return this.refuse(task, result.detail ?? "adapter did not launch the worker");
    }
    if (result.pid !== undefined) {
      this.running.set(task.id, { taskId: task.id, agent: agent.name, pid: result.pid, folder: this.folderOf(task), writer: isWriter(agent) });
    }
    this.store.updateTask(task.id, { dispatchedAt: new Date().toISOString(), pid: result.pid }, { touch: false });
    return { spawned: true, detail: result.detail };
  }

  /**
   * The task reported in — give its slot back now, even though the process
   * may take a while to actually exit.
   */
  release(taskId: string): void {
    this.runKeys.delete(taskId);
    const worker = this.running.get(taskId);
    if (!worker) return;
    this.running.delete(taskId);
    this.lingering.set(taskId, worker);
    this.drainSoon();
  }

  private onWorkerExit(taskId: string, agent: string, exit: WorkerExit): void {
    this.runKeys.delete(taskId);
    this.running.delete(taskId);
    this.lingering.delete(taskId);
    // A slot opened — launch the next queued task for which there is room.
    this.drainSoon();

    const finish = (): void => {
      const task = this.store.getTask(taskId);
      if (!task) return;
      const patch: Parameters<Store["updateTask"]>[1] = { exitCode: exit.code, pid: undefined };
      if (isTerminal(task.status)) {
        // Already reported (or cancelled): keep the bookkeeping, don't move updatedAt.
        this.store.updateTask(taskId, patch, { touch: false });
        return;
      }
      {
        const w = this.words();
        const how = exit.error
          ? w.failedToStart(exit.error)
          : w.exited(exit.signal ? w.signal(exit.signal) : w.code(exit.code), task.status !== "pending");
        const hint = spawnLogHint(this.config.projectRoot, agent, taskId);
        patch.status = "failed";
        patch.result = `${how}${hint ? w.hints(hint) : ""}`;
        this.store.addMessage({ taskId, from: "hub", kind: "system", text: patch.result, meta: { workerExit: true } });
      }
      this.store.updateTask(taskId, patch);
    };
    // The post_result HTTP call completes before the CLI exits, but give a
    // moment for the transport to settle before declaring the task dead.
    if (exit.error) finish();
    else setTimeout(finish, EXIT_GRACE_MS).unref();
  }

  /** Launch what fits now; never lets a failure escape as an unhandled rejection. */
  private drainSoon(): void {
    this.drain().catch(() => {
      // launch() already turns failures into failed tasks; nothing else should reach here
    });
  }

  private async drain(): Promise<void> {
    for (let i = 0; i < this.queue.length; ) {
      const task = this.queue[i];
      const current = this.store.getTask(task.id);
      // Only still-pending work launches: a polling run may have claimed it meanwhile.
      if (!current || current.status !== "pending") {
        this.queue.splice(i, 1);
        continue;
      }
      const agent = this.config.agents.find((a) => a.name === task.to);
      if (!agent || !this.hasSlot(agent, current)) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      await this.launch(current, agent);
    }
  }

  /**
   * Kill a task's worker without touching the task's status — for the
   * watchdog, which has already declared the task failed and just needs the
   * process (and its slot) gone.
   */
  kill(taskId: string): boolean {
    const worker = this.running.get(taskId) ?? this.lingering.get(taskId);
    if (!worker) return false;
    this.running.delete(taskId);
    this.lingering.delete(taskId);
    killTree(worker.pid);
    this.drainSoon();
    return true;
  }

  /**
   * Time is the one budget that runs out while work is in flight: stop every
   * live request that has gone past its minutes. Called on the watchdog's beat.
   */
  enforceTimeBudgets(): string[] {
    const stopped: string[] = [];
    const roots = new Set<string>();
    for (const t of this.store.listTasks()) {
      if (isTerminal(t.status)) continue;
      const root = budgetRoot(this.store, t.id);
      if (root) roots.add(root.id);
    }
    for (const id of roots) {
      const root = this.store.getTask(id)!;
      const limit = budgetLimit(this.config, root);
      if (!limit.minutes) continue;
      const used = budgetUsage(this.store, id);
      if (used.minutes < limit.minutes) continue;
      const breach = { kind: "minutes" as const, used: Math.round(used.minutes * 10) / 10, limit: limit.minutes };
      const reason = describeBreach(breach, this.config.language);
      this.store.addMessage({ taskId: id, from: "hub", kind: "system", text: reason, meta: { budget: breach, budgetRoot: id } });
      // Stop what spends from this budget only — a follow-up request below it has its own.
      for (const t of budgetScope(this.store, id).reverse()) {
        if (!isTerminal(t.status)) stopped.push(...this.cancel(t.id, "hub", reason));
      }
    }
    return stopped;
  }

  /**
   * The hub is stopping: kill every worker it started and fail their tasks
   * with the reason, so nothing keeps editing files with nobody to report to.
   * Queued tasks stay pending — the next hub launches them.
   */
  shutdown(reason = this.words().hubStopped): string[] {
    const stopped: string[] = [];
    for (const [taskId, worker] of [...this.running, ...this.lingering]) {
      killTree(worker.pid);
      const task = this.store.getTask(taskId);
      if (task && !isTerminal(task.status)) {
        this.store.updateTask(taskId, { status: "failed", result: reason, pid: undefined });
        this.store.addMessage({ taskId, from: "hub", kind: "system", text: reason, meta: { hubStopped: true } });
        stopped.push(taskId);
      }
    }
    this.running.clear();
    this.lingering.clear();
    this.runKeys.clear();
    this.queue.length = 0;
    return stopped;
  }

  /** Snapshot for the API: who holds a slot, who is waiting, who is just winding down. */
  status(): { running: RunningWorker[]; queued: string[]; lingering: RunningWorker[] } {
    return {
      running: [...this.running.values()],
      queued: this.queue.map((t) => t.id),
      lingering: [...this.lingering.values()],
    };
  }

  /**
   * Stop a task and everything delegated from it. Kills the worker's process
   * group when one is running, drops queued descendants, and marks each
   * affected task `cancelled`. Already-finished tasks are left alone.
   */
  cancel(taskId: string, by: string, reason?: string): string[] {
    const cancelled: string[] = [];
    const visit = (id: string): void => {
      const task = this.store.getTask(id);
      if (!task) return;
      // Children first so a parent never reports done while a child is still alive.
      for (const child of this.store.listTasks()) if (child.parentId === id) visit(child.id);
      if (isTerminal(task.status)) return;

      const qi = this.queue.findIndex((t) => t.id === id);
      if (qi >= 0) this.queue.splice(qi, 1);

      const worker = this.running.get(id) ?? this.lingering.get(id);
      if (worker) {
        this.running.delete(id);
        this.lingering.delete(id);
        killTree(worker.pid);
      }
      this.runKeys.delete(id);
      const result = this.words().cancelledBy(by, reason);
      this.store.updateTask(id, { status: "cancelled", result, pid: undefined });
      this.store.addMessage({ taskId: id, from: by, kind: "system", text: `${task.title}: ${result}`, meta: { cancelled: true } });
      cancelled.push(id);
    };
    visit(taskId);
    this.drainSoon();
    return cancelled;
  }
}

/** One line for the "what is it doing" view: the tool name plus its most telling argument. */
function summarizeToolInput(name: string, input: unknown): string {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick =
    obj.command ?? obj.file_path ?? obj.path ?? obj.pattern ?? obj.query ?? obj.url ?? obj.task_id ?? obj.key ?? obj.prompt ?? obj.text;
  const detail = typeof pick === "string" ? pick : pick !== undefined ? JSON.stringify(pick) : "";
  return `${name}${detail ? `  ${detail.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
}

/** SIGTERM the process group (the worker was spawned detached), falling back to the pid. */
function killTree(pid: number): void {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}
