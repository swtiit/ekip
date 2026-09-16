import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve, join } from "node:path";

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
  /**
   * Confine this agent's process to the conversation's folder with the OS
   * sandbox (macOS). Default: on for Antigravity, which has no tool hook;
   * off for others (Claude runs are guarded by a hook instead).
   */
  sandbox?: boolean;
  /**
   * Whether this agent edits files. Two editors never run in the same folder
   * at once (see `writersPerFolder`), so they can't overwrite each other.
   * Default: inferred — Antigravity, or Claude with acceptEdits /
   * bypassPermissions.
   */
  writer?: boolean;
  /** set false to register the agent without letting the hub spawn it */
  spawnable?: boolean;
  /**
   * Human-friendly name shown in the app, e.g. "Điều phối". `name` stays the
   * address other agents delegate to, so it can remain short and stable.
   */
  label?: string;
  /**
   * One line on what this member is for. Shown in the app, and told to every
   * spawned agent so it knows whom to hand which work to.
   */
  description?: string;
  /** cap on simultaneous workers for this agent (within the hub-wide cap) */
  maxConcurrent?: number;
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

export interface RetentionConfig {
  /** drop finished tasks (and their spawn logs) older than this; 0 keeps forever */
  days?: number;
}

/** Cap on simultaneously running workers per folder. */
export const DEFAULT_MAX_CONCURRENT = 4;
/** Ceiling across all folders. */
export const DEFAULT_MAX_CONCURRENT_TOTAL = 8;
export const RETENTION_DEFAULTS: Required<RetentionConfig> = { days: 14 };

export interface BridgeConfig {
  /** human label for the project this hub serves */
  project: string;
  host: string;
  port: number;
  /** absolute path used to resolve cwds and the state file */
  projectRoot: string;
  agents: AgentConfig[];
  maxDepth?: number;
  /**
   * Shared secret for the hub's API and MCP endpoint (EKIP_TOKEN overrides it).
   * Optional on 127.0.0.1; required to listen on any other address.
   */
  token?: string;
  /**
   * The credential spawned agents get. It opens `/mcp` only — never the HTTP
   * API — so a run that is talked into something by a file it reads still
   * can't start work outside its own task. Filled in automatically.
   */
  agentToken?: string;
  /**
   * Run without any token: anything on this machine (including an agent) can
   * drive the hub. Only on a machine where you trust every process.
   */
  openAccess?: boolean;
  /**
   * Language agents should speak in — appended to every bootstrap prompt, e.g.
   * "Vietnamese". Affects what they say and write, not the code they produce.
   */
  language?: string;
  /** cap on simultaneously running workers per folder (default 4); extra tasks queue */
  maxConcurrent?: number;
  /** ceiling across all folders together (default 8) — the quota guard */
  maxConcurrentTotal?: number;
  /**
   * Keep each run inside its conversation's folder (default true): agents are
   * told the folder, and Claude runs get a hook that blocks file and shell
   * access outside it.
   */
  folderGuard?: boolean;
  /**
   * MCP sessions the hub keeps (each agent run opens one): at most `max`
   * (default 256; the least recently used is closed to make room), and a
   * session silent for `idleMinutes` (default 30) is closed. A closed
   * session's client gets 404 and simply opens a new one.
   */
  mcpSessions?: { max?: number; idleMinutes?: number };
  /** how many file-editing agents may run in one folder at once (default 1; 0 = no limit) */
  writersPerFolder?: number;
  /**
   * Spending cap per request — a message you send, a flow run, or a top-level
   * delegation — counted in worker runs, output tokens and minutes. Defaults:
   * 20 runs, no token cap, 120 minutes; 0 turns a limit off.
   */
  budget?: import("../protocol/index.js").TaskBudget;
  watchdog?: WatchdogConfig;
  retention?: RetentionConfig;
}

export const CONFIG_FILENAME = "ekip.config.json";

export function defaultConfig(projectRoot: string): BridgeConfig {
  return {
    project: "my-project",
    host: "127.0.0.1",
    port: 4319,
    projectRoot,
    agents: [
      {
        name: "claude",
        adapter: "claude",
        spawnable: true,
        label: "Claude",
        description: "Claude Code, headless: reads, writes and runs code in this repository.",
      },
      {
        name: "antigravity",
        adapter: "antigravity",
        spawnable: true,
        label: "Antigravity",
        description: "Google Antigravity (Gemini), headless: writes code and files in this repository.",
      },
    ],
  };
}

/** Machine-wide defaults directory (override with EKIP_HOME for tests). */
export function globalDir(): string {
  return process.env.EKIP_HOME ?? join(homedir(), ".ekip");
}

/**
 * Machine-wide default config (`~/.ekip/config.json`), if present.
 * Identity fields (`project`, `projectRoot`) never come from here.
 */
export function loadGlobalDefaults(): Partial<BridgeConfig> | undefined {
  const path = join(globalDir(), "config.json");
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<BridgeConfig>;
    delete raw.project;
    delete raw.projectRoot;
    return raw;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a role promptFile: the project's own file wins; otherwise fall back
 * to `~/.ekip/roles/<basename>` so one machine-wide role library
 * serves every project.
 */
export function resolveRoleFile(projectRoot: string, promptFile: string): string | undefined {
  const local = resolve(projectRoot, promptFile);
  if (existsSync(local)) return local;
  const global = join(globalDir(), "roles", basename(promptFile));
  return existsSync(global) ? global : undefined;
}

/**
 * The hub's two credentials, kept in `~/.ekip/auth.json` (readable only by
 * you) and shared by every project's hub on this machine:
 *
 * - `token` is yours: the web app, the CLI, anything that drives the hub.
 * - `agentToken` is what spawned runs get. It is accepted on `/mcp` and
 *   nowhere else, so a run can use the bridge tools but cannot call the HTTP
 *   API to start work outside its own task.
 *
 * Generated on first use. Delete the file to roll both.
 */
export function machineAuth(): { token: string; agentToken: string } {
  const path = join(globalDir(), "auth.json");
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { token?: string; agentToken?: string };
    if (typeof raw.token === "string" && typeof raw.agentToken === "string" && raw.token && raw.agentToken) {
      return { token: raw.token, agentToken: raw.agentToken };
    }
  } catch {
    // no file yet, or unreadable — make a fresh pair
  }
  const made = { token: randomBytes(24).toString("base64url"), agentToken: randomBytes(24).toString("base64url") };
  try {
    mkdirSync(globalDir(), { recursive: true });
    writeFileSync(path, JSON.stringify(made, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // can't persist (read-only home?): the pair still works for this hub's life
  }
  return made;
}

/** Fill in the credentials a hub runs with, unless it was told to run open. */
export function resolveAuth(config: BridgeConfig): BridgeConfig {
  if (config.openAccess) return config;
  const machine = machineAuth();
  config.token = process.env.EKIP_TOKEN?.trim() || config.token || machine.token;
  config.agentToken = process.env.EKIP_AGENT_TOKEN?.trim() || config.agentToken || machine.agentToken;
  return config;
}

export function loadConfig(projectRoot = process.cwd()): BridgeConfig {
  const path = resolve(projectRoot, CONFIG_FILENAME);
  if (!existsSync(path)) {
    throw new Error(
      `No ${CONFIG_FILENAME} found in ${projectRoot}. Run \`ekip init\` first.`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<BridgeConfig>;
  // Field-level precedence: project file > machine-wide defaults > built-ins.
  const merged = { ...defaultConfig(projectRoot), ...loadGlobalDefaults(), ...raw };
  // projectRoot always reflects where the config actually lives.
  merged.projectRoot = projectRoot;
  return resolveAuth(merged as BridgeConfig);
}

/** Read the value following a CLI flag in an agent's args (e.g. "--model"). */
export function getAgentFlag(agent: AgentConfig, flag: string): string | undefined {
  const args = agent.args ?? [];
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

/** Set, replace, or (with undefined) remove a `flag value` pair in agent args. */
export function setAgentFlag(agent: AgentConfig, flag: string, value: string | undefined): void {
  const args = agent.args ?? [];
  const i = args.indexOf(flag);
  if (i >= 0) args.splice(i, 2);
  if (value !== undefined && value !== "") args.push(flag, value);
  agent.args = args;
}

export function hubUrl(config: BridgeConfig): string {
  return `http://${config.host}:${config.port}/mcp`;
}

export function stateFilePath(config: BridgeConfig): string {
  return join(config.projectRoot, ".ekip", "state.json");
}
