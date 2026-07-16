import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, SpawnRequest, SpawnResult } from "./index.js";

/**
 * Generic command adapter — plugs any headless CLI into the bridge without
 * writing an adapter file. The agent's config supplies the executable and an
 * argument template:
 *
 *   { "name": "codex", "adapter": "command",
 *     "command": "codex", "args": ["exec", "{prompt}"] }
 *
 * Placeholders substituted in every arg: `{prompt}`, `{hubUrl}`, `{taskId}`,
 * `{agent}`, `{depth}`. If no arg mentions `{prompt}`, the bootstrap prompt is
 * appended as the final argument. The same values are also exported as
 * AGENT_BRIDGE_* env vars for tools that prefer reading the environment.
 */
export const commandAdapter: Adapter = {
  id: "command",
  description: "Generic headless CLI (configure `command` + `args` template)",

  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    if (!req.command) {
      return {
        launched: false,
        detail: 'the "command" adapter needs `command` set on the agent config',
      };
    }

    const logDir = join(req.cwd, ".agent-bridge", "logs");
    mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, `${req.agentName}-${req.taskId}.log`);
    const fd = openSync(logFile, "a");

    const substitute = (arg: string): string =>
      arg
        .replaceAll("{prompt}", req.prompt)
        .replaceAll("{hubUrl}", req.hubUrl)
        .replaceAll("{taskId}", req.taskId)
        .replaceAll("{agent}", req.agentName)
        .replaceAll("{depth}", String(req.depth));

    const template = req.extraArgs ?? [];
    const args = template.map(substitute);
    if (!template.some((a) => a.includes("{prompt}"))) args.push(req.prompt);

    const child = spawn(req.command, args, {
      cwd: req.cwd,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        AGENT_BRIDGE_URL: req.hubUrl,
        AGENT_BRIDGE_AGENT: req.agentName,
        AGENT_BRIDGE_TASK: req.taskId,
        AGENT_BRIDGE_DEPTH: String(req.depth),
      },
    });
    child.unref();

    return {
      launched: true,
      pid: child.pid,
      detail: `${req.command} (log: ${logFile})`,
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
    return "your tool's MCP config — the exact schema varies, see its docs";
  },
};
