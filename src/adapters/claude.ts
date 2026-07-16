import { join } from "node:path";
import type { Adapter, SpawnRequest, SpawnResult } from "./index.js";
import { bridgeEnv, launchDetached } from "./spawn.js";

/**
 * Claude Code adapter — drives the `claude` CLI in headless (`-p`) mode.
 *
 * The spawned run inherits the project's MCP config, so the bridge tools are
 * already available to it; the bootstrap prompt tells it which task to claim.
 */
export const claudeAdapter: Adapter = {
  id: "claude",
  description: "Anthropic Claude Code (headless `claude -p`)",

  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const logFile = join(req.cwd, ".agent-bridge", "logs", `${req.agentName}-${req.taskId}.log`);

    // Pre-approve the bridge's own MCP tools so the headless run can claim
    // tasks and post results without stalling on permission prompts. Broader
    // permissions (Edit, Bash, …) are the user's policy — pass them via the
    // agent's `args` in agent-bridge.config.json.
    //
    // The bridge server is injected inline and --strict-mcp-config keeps the
    // run from loading the user's global MCP servers (field-tested: those can
    // add minutes of startup and keep the process alive after the task is
    // posted). Extra --mcp-config entries in `args` still compose on top.
    const bridgeMcpConfig = JSON.stringify({
      mcpServers: { "agent-bridge": { type: "http", url: req.hubUrl } },
    });
    const args = [
      "-p",
      req.prompt,
      "--allowedTools",
      "mcp__agent-bridge",
      "--mcp-config",
      bridgeMcpConfig,
      "--strict-mcp-config",
      ...(req.extraArgs ?? []),
    ];
    return launchDetached({
      command: "claude",
      args,
      cwd: req.cwd,
      env: bridgeEnv(req),
      logFile,
      label: "claude -p",
    });
  },

  mcpConfigSnippet(hubUrl: string) {
    return {
      "agent-bridge": {
        type: "http",
        url: hubUrl,
      },
    };
  },

  mcpConfigLocation() {
    return "the project's .mcp.json (or `claude mcp add`)";
  },
};
