import { readFileSync } from "node:fs";
import type { Task } from "../protocol/index.js";
import { DEFAULT_MAX_DEPTH, isTerminal } from "../protocol/index.js";
import { getAdapter } from "../adapters/index.js";
import type { WorkerEvent, WorkerExit } from "../adapters/index.js";
import type { AgentConfig, BridgeConfig } from "./config.js";
import { DEFAULT_MAX_CONCURRENT, hubUrl, resolveRoleFile } from "./config.js";
import { spawnLogHint } from "./logs.js";
import type { Store } from "./store.js";

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

  private buildBootstrap(task: Task, role?: string): string {
    const header = role
      ? [`[Standing role instructions for "${task.to}"]`, role, "", "---", ""]
      : [];
    return [
      ...header,
      `You are the agent "${task.to}" in an ekip session.`,
      `A task has been delegated to you by "${task.from}".`,
      ``,
      `1. Call the MCP tool \`bridge_claim\` with { as: "${task.to}", task_id: "${task.id}" } to acknowledge it.`,
      `2. Carry out the task in this repository.`,
      `3. When finished, call \`bridge_post_result\` with { task_id: "${task.id}", status: "done", result: "<summary>" }. Use status "failed" if you could not complete it.`,
      `You may read/write shared context with \`bridge_context_get\` / \`bridge_context_set\`, and delegate sub-tasks with \`bridge_delegate\`.`,
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
  private refuse(task: Task, reason: string): DispatchOutcome {
    this.store.updateTask(task.id, { status: "failed", result: `dispatch refused: ${reason}` });
    this.store.addMessage({ taskId: task.id, from: "hub", kind: "system", text: `dispatch refused: ${reason}` });
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
    } else if (event.kind === "usage") {
      this.store.updateTask(taskId, { usage: event.usage }, { touch: false });
    }
  }

  private runningFor(agent: string): number {
    let n = 0;
    for (const w of this.running.values()) if (w.agent === agent) n++;
    return n;
  }

  private hasSlot(agent: AgentConfig): boolean {
    const hubCap = this.config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    if (this.running.size >= hubCap) return false;
    if (agent.maxConcurrent !== undefined && this.runningFor(agent.name) >= agent.maxConcurrent) return false;
    return true;
  }

  async dispatch(task: Task): Promise<DispatchOutcome> {
    const maxDepth = this.config.maxDepth ?? DEFAULT_MAX_DEPTH;
    if (task.depth > maxDepth) {
      return this.refuse(task, `max delegation depth ${maxDepth} exceeded (loop guard)`);
    }

    const agent = this.config.agents.find((a) => a.name === task.to);
    if (!agent) return this.refuse(task, `unknown agent "${task.to}"`);
    if (agent.spawnable === false) {
      return {
        spawned: false,
        reason: `agent "${task.to}" is not spawnable; it must poll for tasks`,
      };
    }
    if (!getAdapter(agent.adapter)) {
      return this.refuse(task, `no adapter "${agent.adapter}" registered for agent "${task.to}"`);
    }

    if (!this.hasSlot(agent)) {
      this.queue.push(task);
      this.store.addMessage({
        taskId: task.id,
        from: "hub",
        kind: "system",
        text: `queued for ${agent.name} (${this.running.size} worker(s) running, position ${this.queue.length})`,
      });
      return {
        spawned: false,
        queued: true,
        reason: `queued: ${this.running.size} worker(s) running (position ${this.queue.length})`,
      };
    }
    return this.launch(task, agent);
  }

  private async launch(task: Task, agent: AgentConfig): Promise<DispatchOutcome> {
    const adapter = getAdapter(agent.adapter)!;
    const result = await adapter.spawn({
      agentName: agent.name,
      prompt: this.buildBootstrap(task, this.rolePrompt(agent)),
      cwd: agent.cwd ?? this.config.projectRoot,
      taskId: task.id,
      hubUrl: hubUrl(this.config),
      depth: task.depth,
      extraArgs: agent.args,
      command: agent.command,
      onExit: (exit) => this.onWorkerExit(task.id, agent.name, exit),
      onEvent: (event) => this.onWorkerEvent(task.id, agent.name, event),
    });

    if (!result.launched) {
      return this.refuse(task, result.detail ?? "adapter did not launch the worker");
    }
    if (result.pid !== undefined) {
      this.running.set(task.id, { taskId: task.id, agent: agent.name, pid: result.pid });
    }
    this.store.updateTask(task.id, { dispatchedAt: new Date().toISOString(), pid: result.pid }, { touch: false });
    return { spawned: true, detail: result.detail };
  }

  /**
   * The task reported in — give its slot back now, even though the process
   * may take a while to actually exit.
   */
  release(taskId: string): void {
    const worker = this.running.get(taskId);
    if (!worker) return;
    this.running.delete(taskId);
    this.lingering.set(taskId, worker);
    void this.drain();
  }

  private onWorkerExit(taskId: string, agent: string, exit: WorkerExit): void {
    this.running.delete(taskId);
    this.lingering.delete(taskId);
    // A slot opened — launch the next queued task for which there is room.
    void this.drain();

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
        const how = exit.error
          ? `worker failed to start: ${exit.error}`
          : `worker exited (${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}) ${
              task.status === "pending" ? "without claiming the task" : "before posting a result"
            }`;
        const hint = spawnLogHint(this.config.projectRoot, agent, taskId);
        patch.status = "failed";
        patch.result = `${how}${hint ? ` — spawn log hints: ${hint}` : ""}`;
        this.store.addMessage({ taskId, from: "hub", kind: "system", text: patch.result });
      }
      this.store.updateTask(taskId, patch);
    };
    // The post_result HTTP call completes before the CLI exits, but give a
    // moment for the transport to settle before declaring the task dead.
    if (exit.error) finish();
    else setTimeout(finish, EXIT_GRACE_MS).unref();
  }

  private async drain(): Promise<void> {
    for (let i = 0; i < this.queue.length; ) {
      const task = this.queue[i];
      const current = this.store.getTask(task.id);
      if (!current || isTerminal(current.status)) {
        this.queue.splice(i, 1);
        continue;
      }
      const agent = this.config.agents.find((a) => a.name === task.to);
      if (!agent || !this.hasSlot(agent)) {
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
    void this.drain();
    return true;
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
      const result = `cancelled by ${by}${reason ? `: ${reason}` : ""}`;
      this.store.updateTask(id, { status: "cancelled", result, pid: undefined });
      this.store.addMessage({ taskId: id, from: by, kind: "system", text: `${task.title}: ${result}` });
      cancelled.push(id);
    };
    visit(taskId);
    void this.drain();
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
