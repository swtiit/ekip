import { readFileSync } from "node:fs";
import type { Task } from "../protocol/index.js";
import { DEFAULT_MAX_DEPTH } from "../protocol/index.js";
import { getAdapter } from "../adapters/index.js";
import type { AgentConfig, BridgeConfig } from "./config.js";
import { hubUrl, resolveRoleFile } from "./config.js";

export interface DispatchOutcome {
  spawned: boolean;
  reason?: string;
  detail?: string;
}

/**
 * Turns a freshly-created task into a running headless agent.
 *
 * Looks up the target agent in config, finds its adapter, and spawns it with a
 * bootstrap prompt telling it to claim the task, do the work, and post a
 * result. Fire-and-forget: the agent reports back through the bridge MCP tools.
 */
export class Dispatcher {
  constructor(private readonly config: BridgeConfig) {}

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
      `You are the agent "${task.to}" in an agent-bridge session.`,
      `A task has been delegated to you by "${task.from}".`,
      ``,
      `1. Call the MCP tool \`bridge_claim\` with { as: "${task.to}", task_id: "${task.id}" } to acknowledge it.`,
      `2. Carry out the task in this repository.`,
      `3. When finished, call \`bridge_post_result\` with { task_id: "${task.id}", status: "done", result: "<summary>" }. Use status "failed" if you could not complete it.`,
      `You may read/write shared context with \`bridge_context_get\` / \`bridge_context_set\`, and delegate sub-tasks with \`bridge_delegate\`.`,
      ``,
      `Task (id ${task.id}): ${task.title}`,
      ``,
      task.prompt,
      ...(task.context && Object.keys(task.context).length > 0
        ? ["", "Attached context from the delegating agent:", JSON.stringify(task.context, null, 2)]
        : []),
    ].join("\n");
  }

  async dispatch(task: Task): Promise<DispatchOutcome> {
    const maxDepth = this.config.maxDepth ?? DEFAULT_MAX_DEPTH;
    if (task.depth > maxDepth) {
      return {
        spawned: false,
        reason: `max delegation depth ${maxDepth} exceeded (loop guard)`,
      };
    }

    const agent = this.config.agents.find((a) => a.name === task.to);
    if (!agent) {
      return { spawned: false, reason: `unknown agent "${task.to}"` };
    }
    if (agent.spawnable === false) {
      return {
        spawned: false,
        reason: `agent "${task.to}" is not spawnable; it must poll for tasks`,
      };
    }

    const adapter = getAdapter(agent.adapter);
    if (!adapter) {
      return {
        spawned: false,
        reason: `no adapter "${agent.adapter}" registered for agent "${task.to}"`,
      };
    }

    const result = await adapter.spawn({
      agentName: agent.name,
      prompt: this.buildBootstrap(task, this.rolePrompt(agent)),
      cwd: agent.cwd ?? this.config.projectRoot,
      taskId: task.id,
      hubUrl: hubUrl(this.config),
      depth: task.depth,
      extraArgs: agent.args,
      command: agent.command,
    });

    return { spawned: result.launched, detail: result.detail };
  }
}
