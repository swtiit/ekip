import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROTOCOL_VERSION } from "../protocol/index.js";
import type { TaskStatus } from "../protocol/index.js";
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
export function buildHub(
  config: BridgeConfig,
  store: Store,
  dispatcher: Dispatcher,
): McpServer {
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
          .describe("id of the task this one descends from, for loop-guarding"),
      },
    },
    async ({ from, to, title, prompt, context, parent_task_id }) => {
      const parent = parent_task_id ? store.getTask(parent_task_id) : undefined;
      const task = store.createTask({
        from,
        to,
        title,
        prompt,
        context,
        depth: (parent?.depth ?? 0) + 1,
        parentId: parent_task_id,
      });
      const outcome = await dispatcher.dispatch(task);
      return jsonText({ task_id: task.id, status: task.status, dispatch: outcome });
    },
  );

  server.registerTool(
    "bridge_claim",
    {
      title: "Claim a task addressed to you",
      description:
        "Claims a pending task addressed to `as` and returns it, or null if none. Pass `task_id` to claim a specific task (spawned runs should claim the id from their bootstrap prompt); omit it to take the oldest pending one.",
      inputSchema: {
        as: z.string().describe("your own agent name"),
        task_id: z
          .string()
          .optional()
          .describe("specific task to claim; omit to take the oldest pending"),
      },
    },
    async ({ as, task_id }) => {
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
        task = candidate;
      } else {
        task = store.nextPending(as);
      }
      if (!task) return jsonText({ task: null });
      store.updateTask(task.id, { status: "claimed" });
      return jsonText({ task: store.getTask(task.id) });
    },
  );

  server.registerTool(
    "bridge_post_result",
    {
      title: "Report the result of a task",
      description: "Marks a task done or failed and stores its result/artifacts.",
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
      const updated = store.updateTask(task_id, {
        status: status as TaskStatus,
        result,
        artifacts,
      });
      if (!updated) return jsonText({ error: `unknown task ${task_id}` });
      return jsonText({ ok: true, task: updated });
    },
  );

  server.registerTool(
    "bridge_wait",
    {
      title: "Wait for a task to finish",
      description:
        "Polls until the task is done/failed or the timeout elapses. Returns the final task state.",
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
        if (task.status === "done" || task.status === "failed") {
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
        status: z.enum(["pending", "claimed", "done", "failed"]).optional(),
      },
    },
    async ({ to, status }) =>
      jsonText({ tasks: store.listTasks({ to, status: status as TaskStatus }) }),
  );

  server.registerTool(
    "bridge_context_set",
    {
      title: "Write shared context",
      description: "Store a value on the shared blackboard both agents can read.",
      inputSchema: {
        key: z.string(),
        value: z.unknown(),
        by: z.string().describe("your own agent name"),
      },
    },
    async ({ key, value, by }) => jsonText({ entry: store.setContext(key, value, by) }),
  );

  server.registerTool(
    "bridge_context_get",
    {
      title: "Read shared context",
      description: "Read one key, or omit `key` to list all shared context.",
      inputSchema: { key: z.string().optional() },
    },
    async ({ key }) => {
      if (key) return jsonText({ entry: store.getContext(key) ?? null });
      return jsonText({ context: store.listContext() });
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
          text: JSON.stringify(store.listContext(), null, 2),
        },
      ],
    }),
  );

  return server;
}
