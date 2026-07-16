import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, SpawnRequest, SpawnResult } from "./index.js";

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
    const logDir = join(req.cwd, ".agent-bridge", "logs");
    mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, `${req.agentName}-${req.taskId}.log`);
    const fd = openSync(logFile, "a");

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
    const child = spawn("claude", args, {
      cwd: req.cwd,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        AGENT_BRIDGE_URL: req.hubUrl,
        AGENT_BRIDGE_AGENT: req.agentName,
        AGENT_BRIDGE_DEPTH: String(req.depth),
      },
    });
    child.unref();

    return {
      launched: true,
      pid: child.pid,
      detail: `claude -p (log: ${logFile})`,
    };
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
