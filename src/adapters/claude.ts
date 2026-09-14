import { join } from "node:path";
import type { Adapter, SpawnRequest, SpawnResult, WorkerEvent } from "./index.js";
import { bridgeEnv, launchDetached } from "./spawn.js";

/**
 * Claude Code adapter — drives the `claude` CLI in headless (`-p`) mode.
 *
 * The spawned run inherits the project's MCP config, so the bridge tools are
 * already available to it; the bootstrap prompt tells it which task to claim.
 *
 * Output is requested as `stream-json` so the hub can narrate the run live:
 * every assistant text block becomes an agent message, every tool_use a
 * tool line, and the final `result` event carries cost/usage for the task.
 */
export const claudeAdapter: Adapter = {
  id: "claude",
  description: "Anthropic Claude Code (headless `claude -p`)",

  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const logFile = join(req.cwd, ".ekip", "logs", `${req.agentName}-${req.taskId}.log`);

    // Pre-approve the bridge's own MCP tools so the headless run can claim
    // tasks and post results without stalling on permission prompts. Broader
    // permissions (Edit, Bash, …) are the user's policy — pass them via the
    // agent's `args` in ekip.config.json.
    //
    // The bridge server is injected inline and --strict-mcp-config keeps the
    // run from loading the user's global MCP servers (field-tested: those can
    // add minutes of startup and keep the process alive after the task is
    // posted). Extra --mcp-config entries in `args` still compose on top.
    const bridgeMcpConfig = JSON.stringify({
      mcpServers: { "ekip": { type: "http", url: req.hubUrl } },
    });
    const args = [
      "-p",
      req.prompt,
      "--allowedTools",
      "mcp__ekip",
      "--mcp-config",
      bridgeMcpConfig,
      "--strict-mcp-config",
      // stream-json needs --verbose in print mode; user args come after so
      // they can override either.
      "--output-format",
      "stream-json",
      "--verbose",
      ...(req.extraArgs ?? []),
    ];
    return launchDetached({
      command: "claude",
      args,
      cwd: req.cwd,
      env: bridgeEnv(req),
      logFile,
      label: "claude -p",
      onExit: req.onExit,
      onLine: req.onEvent
        ? (line) => {
            for (const ev of parseClaudeStreamLine(line)) req.onEvent!(ev);
          }
        : undefined,
    });
  },

  mcpConfigSnippet(hubUrl: string) {
    return {
      "ekip": {
        type: "http",
        url: hubUrl,
      },
    };
  },

  mcpConfigLocation() {
    return "the project's .mcp.json (or `claude mcp add`)";
  },
};

interface StreamBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

/**
 * Decode one line of `claude -p --output-format stream-json` into worker
 * events. Unknown or non-JSON lines (hook chatter, warnings) yield nothing.
 */
export function parseClaudeStreamLine(line: string): WorkerEvent[] {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: WorkerEvent[] = [];
  if (msg.type === "assistant") {
    const message = msg.message as { content?: StreamBlock[]; model?: string } | undefined;
    if (message?.model) out.push({ kind: "model", model: message.model });
    const content = message?.content ?? [];
    for (const block of content) {
      if (block.type === "text" && block.text?.trim()) out.push({ kind: "text", text: block.text.trim() });
      else if (block.type === "tool_use" && block.name) out.push({ kind: "tool", name: block.name, input: block.input });
    }
  } else if (msg.type === "result") {
    const usage = (msg.usage as Record<string, number> | undefined) ?? {};
    out.push({
      kind: "usage",
      isError: msg.is_error === true,
      usage: {
        inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
        costUsd: typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : undefined,
        durationMs: typeof msg.duration_ms === "number" ? msg.duration_ms : undefined,
        turns: typeof msg.num_turns === "number" ? msg.num_turns : undefined,
      },
    });
  }
  return out;
}
