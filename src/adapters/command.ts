import { join } from "node:path";
import type { Adapter, SpawnRequest, SpawnResult } from "./index.js";
import { bridgeEnv, launchDetached } from "./spawn.js";

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

    const logFile = join(req.cwd, ".ekip", "logs", `${req.agentName}-${req.taskId}.log`);

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

    return launchDetached({
      command: req.command,
      args,
      cwd: req.cwd,
      env: bridgeEnv(req),
      logFile,
      label: req.command,
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
    return "your tool's MCP config — the exact schema varies, see its docs";
  },
};
