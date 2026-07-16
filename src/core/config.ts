import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export interface AgentConfig {
  /** unique agent name within this project, e.g. "claude" or "antigravity" */
  name: string;
  /** which adapter drives it: "claude" | "antigravity" | "command" | custom */
  adapter: string;
  /** working directory the agent runs in (defaults to the project root) */
  cwd?: string;
  /** extra flags passed through to the adapter's CLI */
  args?: string[];
  /** executable for the generic "command" adapter (its `args` become the template) */
  command?: string;
  /**
   * Markdown file (relative to the project root) prepended to every bootstrap
   * prompt for this agent — its standing "role skill" (persona, checklists,
   * conventions). See examples/roles/.
   */
  promptFile?: string;
  /** set false to register the agent without letting the hub spawn it */
  spawnable?: boolean;
}

export interface WatchdogConfig {
  /** fail a task still `pending` after this many seconds (spawnable targets only) */
  pendingTtlSeconds?: number;
  /** fail a task still `claimed` after this many seconds without an update */
  claimedTtlSeconds?: number;
  /** how often the sweep runs */
  sweepIntervalSeconds?: number;
  /** set false to disable the watchdog entirely */
  enabled?: boolean;
}

export const WATCHDOG_DEFAULTS: Required<WatchdogConfig> = {
  pendingTtlSeconds: 600,
  claimedTtlSeconds: 3600,
  sweepIntervalSeconds: 30,
  enabled: true,
};

export interface BridgeConfig {
  /** human label for the project this hub serves */
  project: string;
  host: string;
  port: number;
  /** absolute path used to resolve cwds and the state file */
  projectRoot: string;
  agents: AgentConfig[];
  maxDepth?: number;
  watchdog?: WatchdogConfig;
}

export const CONFIG_FILENAME = "agent-bridge.config.json";

export function defaultConfig(projectRoot: string): BridgeConfig {
  return {
    project: "my-project",
    host: "127.0.0.1",
    port: 4319,
    projectRoot,
    agents: [
      { name: "claude", adapter: "claude", spawnable: true },
      { name: "antigravity", adapter: "antigravity", spawnable: true },
    ],
  };
}

export function loadConfig(projectRoot = process.cwd()): BridgeConfig {
  const path = resolve(projectRoot, CONFIG_FILENAME);
  if (!existsSync(path)) {
    throw new Error(
      `No ${CONFIG_FILENAME} found in ${projectRoot}. Run \`agent-bridge init\` first.`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<BridgeConfig>;
  const merged = { ...defaultConfig(projectRoot), ...raw };
  // projectRoot always reflects where the config actually lives.
  merged.projectRoot = projectRoot;
  return merged as BridgeConfig;
}

export function hubUrl(config: BridgeConfig): string {
  return `http://${config.host}:${config.port}/mcp`;
}

export function stateFilePath(config: BridgeConfig): string {
  return join(config.projectRoot, ".agent-bridge", "state.json");
}
