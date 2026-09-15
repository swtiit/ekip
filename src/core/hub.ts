import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROTOCOL_VERSION } from "../protocol/index.js";
import type { TaskStatus } from "../protocol/index.js";
import { isTerminal } from "../protocol/index.js";
import type { BridgeConfig } from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { Store } from "./store.js";

const jsonText = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

/**
 * Builds the MCP server that both agents connect to. Every tool is prefixed
 * `bridge_` to stay clear of the host agent's own tool namespace.
 */
/**
 * Who claimed what. Each MCP session is one agent run; a task claimed by one
 * run can only be reported by that run while it is still connected, so a
 * stray or hostile session can't overwrite another agent's result.
 */
export interface HubSessions {
  claims: Map<string, string>;
  live: Set<string>;
}

export function buildHub(
  config: BridgeConfig,
  store: Store,
  dispatcher: Dispatcher,
  session?: { id: string; registry: HubSessions; runKey?: string },
): McpServer {
  /**
   * For a run the hub started (it proved it with its run key): the task it is
   * working on. Work it hands out hangs off that task, so it stays in the same
   * folder, thread, budget and depth count. Sessions the hub didn't start —
   * you in Claude Code, a polling agent — keep choosing their own parent.
   */
  let sessionTask: string | undefined = dispatcher.taskForRunKey(session?.runKey);
  const runTask = (): string | undefined => {
    const t = sessionTask ? store.getTask(sessionTask) : undefined;
    return t && t.status !== "done" && t.status !== "failed" && t.status !== "cancelled" ? t.id : undefined;
  };
  const isDescendant = (taskId: string, ancestorId: string): boolean => {
    let cur = store.getTask(taskId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      if (cur.id === ancestorId) return true;
      seen.add(cur.id);
      cur = cur.parentId ? store.getTask(cur.parentId) : undefined;
    }
    return false;
  };
  /**
   * One MCP session serves one agent run, so the folder of the task it claims
   * (or delegates from) tells us which folder's blackboard it should see.
   */
  let sessionFolder: string | undefined;
  let sessionKnown = false;
  const folderKeyOf = (taskId?: string): string | undefined => {
    const t = taskId ? store.getTask(taskId) : undefined;
    return t?.cwd && t.cwd !== config.projectRoot ? t.cwd : undefined;
  };
  const remember = (taskId?: string) => {
    if (!taskId || !store.getTask(taskId)) return;
    sessionFolder = folderKeyOf(taskId);
    sessionKnown = true;
  };
  /** A `task_id` argument wins; otherwise the session's own task; otherwise the agent's single running task. */
  const scopeFor = (taskId?: string, agent?: string): string | undefined => {
    if (taskId && store.getTask(taskId)) return folderKeyOf(taskId);
    if (sessionKnown) return sessionFolder;
    if (agent) {
      const mine = store.listTasks({ to: agent, status: "claimed" });
      const folders = new Set(mine.map((t) => folderKeyOf(t.id) ?? ""));
      if (folders.size === 1) return [...folders][0] || undefined;
    }
    return undefined;
  };

  const server = new McpServer({
    name: "ekip",
    version: PROTOCOL_VERSION,
  });

  server.registerTool(
    "bridge_delegate",
    {
      title: "Delegate a task to a peer agent",
      description:
        "Hand a unit of work to another agent. Returns a task id; the target agent is launched (or must poll) to complete it. Use bridge_wait to block on the result.",
      inputSchema: {
        from: z.string().describe("your own agent name"),
        to: z.string().describe("the peer agent name to delegate to"),
        title: z.string().describe("short task title"),
        prompt: z.string().describe("full instruction for the peer agent"),
        context: z
          .record(z.unknown())
          .optional()
          .describe("optional structured context handed along"),
        parent_task_id: z
          .string()
          .optional()
          .describe("the task this one is part of — defaults to the task you claimed, so leave it out when working on a delegated task"),
      },
    },
    async ({ from, to, title, prompt, context, parent_task_id }) => {
      const own = runTask();
      const parentId = parent_task_id ?? own;
      const parent = parentId ? store.getTask(parentId) : undefined;
      if (parentId && !parent) return jsonText({ error: `unknown parent task ${parentId}` });
      if (own && parent && !isDescendant(parent.id, own)) {
        return jsonText({
          error: `a run can only hand out work from its own task (${own}); leave parent_task_id out`,
        });
      }
      const task = store.createTask({
        from,
        to,
        title,
        prompt,
        context,
        depth: (parent?.depth ?? 0) + 1,
        parentId: parent?.id,
        // Work handed out inside a conversation stays in its folder.
        cwd: parent?.cwd,
      });
      if (parent) remember(parent.id);
      store.addMessage({ taskId: task.id, from, to, kind: "agent", text: prompt, meta: { delegation: true, title } });
      const outcome = await dispatcher.dispatch(task);
      return jsonText({ task_id: task.id, status: task.status, dispatch: outcome });
    },
  );

  server.registerTool(
    "bridge_claim",
    {
      title: "Claim a task addressed to you",
      description:
        "Claims a pending task addressed to `as` and returns it, or null if none. A run the hub started claims its own task with the `task_id` and `run_key` from its instructions. Agents that poll (not launched by the hub) omit `task_id` to take the oldest pending one.",
      inputSchema: {
        as: z.string().describe("your own agent name"),
        task_id: z
          .string()
          .optional()
          .describe("specific task to claim; omit to take the oldest pending"),
        run_key: z
          .string()
          .optional()
          .describe("the run key from your instructions, when the hub started you for this task"),
      },
    },
    async ({ as, task_id, run_key }) => {
      const hubLaunches = (name: string) => config.agents.some((a) => a.name === name && a.spawnable !== false);
      let task;
      if (task_id) {
        const candidate = store.getTask(task_id);
        if (!candidate) return jsonText({ task: null, error: `unknown task ${task_id}` });
        if (candidate.to !== as || candidate.status !== "pending") {
          return jsonText({
            task: null,
            error: `task ${task_id} is not pending for "${as}" (status: ${candidate.status}, to: ${candidate.to})`,
          });
        }
        const keyed = dispatcher.runKeyMatches(candidate.id, run_key ?? session?.runKey);
        if (keyed === false) {
          return jsonText({
            task: null,
            error: `task ${task_id} was started for a specific run; claim it with the run_key from your instructions`,
          });
        }
        if (keyed === undefined && hubLaunches(candidate.to) && !candidate.dispatchedAt) {
          return jsonText({ task: null, error: `task ${task_id} is waiting for the run the hub will start for it` });
        }
        task = candidate;
      } else {
        // Tasks for members the hub launches belong to those runs, not to whoever polls first.
        if (hubLaunches(as)) {
          return jsonText({ task: null, note: `the hub starts a run for each task addressed to "${as}"; that run claims it by task_id` });
        }
        task = store.nextPending(as);
      }
      if (!task) return jsonText({ task: null });
      store.updateTask(task.id, { status: "claimed" });
      session?.registry.claims.set(task.id, session.id);
      if (task_id && dispatcher.runKeyMatches(task.id, run_key ?? session?.runKey) === true) sessionTask = task.id;
      remember(task.id);
      store.addMessage({ taskId: task.id, from: as, kind: "system", text: `${as} started: ${task.title}` });
      return jsonText({ task: store.getTask(task.id) });
    },
  );

  server.registerTool(
    "bridge_post_result",
    {
      title: "Report the result of a task",
      description:
        "Marks a task done or failed and stores its result/artifacts. Only the run that claimed the task can report it, and a reported result is final.",
      inputSchema: {
        task_id: z.string(),
        status: z.enum(["done", "failed"]).default("done"),
        result: z.string().describe("summary of what happened"),
        artifacts: z
          .array(
            z.object({
              kind: z.string(),
              label: z.string().optional(),
              value: z.string(),
            }),
          )
          .optional(),
      },
    },
    async ({ task_id, status, result, artifacts }) => {
      const existing = store.getTask(task_id);
      if (!existing) return jsonText({ error: `unknown task ${task_id}` });
      if (existing.status === "cancelled") {
        return jsonText({ error: `task ${task_id} was cancelled; result discarded` });
      }
      // A reported result stands. The one exception: the hub itself failed the
      // task (watchdog, lost worker) and the run that claimed it reports late.
      const lateOwner = session && session.registry.claims.get(task_id) === session.id;
      if (existing.status === "done" || (existing.status === "failed" && !lateOwner)) {
        return jsonText({ error: `task ${task_id} already reported ${existing.status}; a result can't be replaced` });
      }
      if (session) {
        const owner = session.registry.claims.get(task_id);
        if (owner && owner !== session.id && session.registry.live.has(owner)) {
          return jsonText({ error: `task ${task_id} was claimed by another run; only that run can report its result` });
        }
        if (!owner && existing.status === "pending" && existing.pid !== undefined) {
          return jsonText({ error: `task ${task_id} is waiting for the run the hub started for it; claim a task before reporting on it` });
        }
        if (status === "done" || status === "failed") session.registry.claims.delete(task_id);
      }
      const updated = store.updateTask(task_id, {
        status: status as TaskStatus,
        result,
        artifacts,
      });
      // The work is reported; free its concurrency slot even though the
      // process may linger (Claude's session hooks keep it alive for a while).
      dispatcher.release(task_id);
      store.addMessage({
        taskId: task_id,
        from: existing.to,
        to: existing.from,
        kind: "agent",
        text: result,
        meta: { result: status, artifacts: artifacts?.length ?? 0 },
      });
      return jsonText({ ok: true, task: updated });
    },
  );

  server.registerTool(
    "bridge_wait",
    {
      title: "Wait for a task to finish",
      description:
        "Waits until the task is done, failed or cancelled, or the timeout elapses. Returns the task's state at that point.",
      inputSchema: {
        task_id: z.string(),
        timeout_seconds: z.number().min(1).max(600).default(120),
      },
    },
    async ({ task_id, timeout_seconds }) => {
      const deadline = Date.now() + timeout_seconds * 1000;
      // Poll the in-memory store; results arrive via bridge_post_result.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const task = store.getTask(task_id);
        if (!task) return jsonText({ error: `unknown task ${task_id}` });
        if (isTerminal(task.status)) {
          return jsonText({ task });
        }
        if (Date.now() >= deadline) {
          return jsonText({ timed_out: true, task });
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    },
  );

  server.registerTool(
    "bridge_task_get",
    {
      title: "Get a task by id",
      description: "Returns one task — status, result, artifacts, usage — or null if the id is unknown.",
      inputSchema: { task_id: z.string() },
    },
    async ({ task_id }) => jsonText({ task: store.getTask(task_id) ?? null }),
  );

  server.registerTool(
    "bridge_list_tasks",
    {
      title: "List tasks",
      description: "Optionally filter by target agent and/or status.",
      inputSchema: {
        to: z.string().optional(),
        status: z.enum(["pending", "claimed", "done", "failed", "cancelled"]).optional(),
      },
    },
    async ({ to, status }) =>
      jsonText({ tasks: store.listTasks({ to, status: status as TaskStatus }) }),
  );

  server.registerTool(
    "bridge_cancel",
    {
      title: "Cancel a task and everything delegated from it",
      description:
        "Stops a pending/claimed task: kills its worker process if the hub launched one, drops queued descendants, and marks each affected task `cancelled`. Finished tasks are untouched.",
      inputSchema: {
        task_id: z.string(),
        by: z.string().describe("your own agent name"),
        reason: z.string().optional(),
      },
    },
    async ({ task_id, by, reason }) => {
      if (!store.getTask(task_id)) return jsonText({ error: `unknown task ${task_id}` });
      const cancelled = dispatcher.cancel(task_id, by, reason);
      return jsonText({ cancelled, task: store.getTask(task_id) });
    },
  );

  server.registerTool(
    "bridge_say",
    {
      title: "Say something in the task's conversation",
      description:
        "Post a message to the thread of a task — a progress note, a question for a peer, a decision. Everyone watching the thread (agents via bridge_task_get/thread, humans in /chat) sees it. Not a substitute for bridge_post_result.",
      inputSchema: {
        task_id: z.string().describe("the task you are working on (or replying about)"),
        from: z.string().describe("your own agent name"),
        text: z.string(),
        to: z.string().optional().describe("peer agent name, when addressing someone specific"),
      },
    },
    async ({ task_id, from, text, to }) => {
      if (!store.getTask(task_id)) return jsonText({ error: `unknown task ${task_id}` });
      const message = store.addMessage({ taskId: task_id, from, to, kind: "agent", text });
      return jsonText({ ok: true, message });
    },
  );

  server.registerTool(
    "bridge_thread",
    {
      title: "Read a task's conversation",
      description: "Everything said in the delegation tree the task belongs to, oldest first.",
      inputSchema: { task_id: z.string(), limit: z.number().min(1).max(500).default(100) },
    },
    async ({ task_id, limit }) => {
      if (!store.getTask(task_id)) return jsonText({ error: `unknown task ${task_id}` });
      const all = store.listMessages(store.threadOf(task_id));
      return jsonText({ thread_id: store.threadOf(task_id), messages: all.slice(-limit) });
    },
  );

  server.registerTool(
    "bridge_context_set",
    {
      title: "Write shared context",
      description: "Store a value on the blackboard of the folder you are working in. Other runs in the same folder can read it; other folders cannot.",
      inputSchema: {
        key: z.string(),
        value: z.unknown(),
        by: z.string().describe("your own agent name"),
        task_id: z.string().optional().describe("the task you are working on — picks its folder's blackboard"),
      },
    },
    async ({ key, value, by, task_id }) => jsonText({ entry: store.setContext(key, value, by, scopeFor(task_id, by)) }),
  );

  server.registerTool(
    "bridge_context_get",
    {
      title: "Read shared context",
      description: "Read one key from the blackboard of the folder you are working in, or omit `key` to list that blackboard.",
      inputSchema: {
        key: z.string().optional(),
        task_id: z.string().optional().describe("the task you are working on — picks its folder's blackboard"),
      },
    },
    async ({ key, task_id }) => {
      const folder = scopeFor(task_id);
      if (key) return jsonText({ entry: store.getContext(key, folder) ?? null });
      return jsonText({ context: store.listContext(folder) });
    },
  );

  // Read-only resource mirror of the blackboard for clients that prefer it.
  server.registerResource(
    "shared-context",
    "bridge://context",
    { title: "Shared context blackboard", mimeType: "application/json" },
    async () => ({
      contents: [
        {
          uri: "bridge://context",
          mimeType: "application/json",
          text: JSON.stringify(store.listContext(scopeFor()), null, 2),
        },
      ],
    }),
  );

  return server;
}
