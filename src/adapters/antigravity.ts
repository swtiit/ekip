import { join } from "node:path";
import type { Adapter, SpawnRequest, SpawnResult } from "./index.js";
import { bridgeEnv, launchDetached } from "./spawn.js";

/**
 * Antigravity adapter — drives the `agy` CLI in headless (`-p`) mode.
 *
 * Antigravity supports remote MCP servers over Streamable HTTP, so it reaches
 * the hub through the same endpoint Claude Code uses. Verified end-to-end
 * against agy 1.1.3 (brew cask `antigravity-cli`; the npm package of that
 * name is an unrelated squatter — do not install it).
 *
 * Field notes (verified against the real binary):
 * - Install via `brew install antigravity-cli`; `agy models` lists model
 *   names for `--model` (e.g. "Gemini 3.5 Flash (Low)").
 * - Headless runs do NOT load the workspace `.agents/mcp_config.json` unless
 *   the folder has been trusted interactively first — register the hub in
 *   the global `~/.gemini/config/mcp_config.json` instead (schema requires
 *   `serverUrl`; `url`/`httpUrl` are rejected).
 * - Headless soft-denies any tool needing a permission prompt (agy >= 1.1.3
 *   prints the needed rule class to the log). The allow-rule for bridge
 *   tools is `mcp(agent-bridge/*)`, and the location that actually works is
 *   `~/.gemini/config/config.json` under
 *   `userSettings.globalPermissionGrants.allow` — the error text points at
 *   settings.json, but rules in `~/.gemini/settings.json` had no effect.
 * - agy < 1.0.15 wrote `-p` answers to the controlling terminal, not stdout.
 *   We are unaffected: results flow back via bridge_post_result, never stdout.
 * - On 429 quota exhaustion agy silently retries until its print-timeout and
 *   then exits 0 with empty output — the run dies WITHOUT claiming its task.
 *   The task then sits `pending`; callers must rely on bridge_wait timeouts.
 * - Headless session resume is unreliable (`--conversation` can't create
 *   caller-chosen ids; `-c` cross-contaminates concurrent runs), so every
 *   spawn here is a fresh one-shot conversation.
 */
export const antigravityAdapter: Adapter = {
  id: "antigravity",
  description: "Google Antigravity (headless `agy -p`)",

  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const logFile = join(req.cwd, ".agent-bridge", "logs", `${req.agentName}-${req.taskId}.log`);

    // --add-dir registers the project as a workspace directory: without it a
    // headless run in an untrusted folder ignores cwd and writes files into
    // agy's own scratch directory (field-tested).
    const args = ["-p", req.prompt, "--add-dir", req.cwd, ...(req.extraArgs ?? [])];
    return launchDetached({
      command: "agy",
      args,
      cwd: req.cwd,
      env: bridgeEnv(req),
      logFile,
      label: "agy -p",
    });
  },

  mcpConfigSnippet(hubUrl: string) {
    // Antigravity's schema is strict: remote Streamable HTTP servers use
    // `serverUrl`. Legacy `url` / `httpUrl` keys are NOT supported.
    return {
      "agent-bridge": {
        serverUrl: hubUrl,
      },
    };
  },

  mcpConfigLocation() {
    return [
      "~/.gemini/config/mcp_config.json (global — workspace .agents/mcp_config.json is ignored by headless runs until the folder is trusted).",
      'Also add "mcp(agent-bridge/*)" to userSettings.globalPermissionGrants.allow in ~/.gemini/config/config.json so headless runs may call the bridge tools.',
    ].join("\n  ");
  },
};
