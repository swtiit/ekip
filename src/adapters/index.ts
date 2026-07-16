/**
 * Adapter layer — the seam that keeps the hub vendor-neutral.
 *
 * The core never references "claude" or "antigravity" directly; it only knows
 * how to ask an Adapter to (a) spawn a headless run and (b) print the MCP
 * config snippet a user must paste into that tool. Adding a new agent = adding
 * one file here, nothing in core.
 */

export interface SpawnRequest {
  /** the bridge agent name this run acts as (e.g. "antigravity") */
  agentName: string;
  /** bootstrap instruction handed to the agent's headless CLI */
  prompt: string;
  /** working directory to run in */
  cwd: string;
  /** the task that triggered this spawn */
  taskId: string;
  /** MCP endpoint the spawned agent should call back into */
  hubUrl: string;
  /** current delegation depth, forwarded via env for loop-guarding */
  depth: number;
  /** extra CLI flags from config */
  extraArgs?: string[];
  /** executable from config, used by the generic "command" adapter */
  command?: string;
}

export interface SpawnResult {
  /** true if the process was launched (not whether the task succeeded) */
  launched: boolean;
  pid?: number;
  detail?: string;
}

export interface Adapter {
  /** adapter type id referenced by config.agents[].adapter */
  readonly id: string;
  /** one-line human description */
  readonly description: string;
  /**
   * Launch a headless run of this agent. Should resolve as soon as the process
   * is spawned (fire-and-forget); the agent reports back via bridge MCP tools.
   */
  spawn(req: SpawnRequest): Promise<SpawnResult>;
  /**
   * The JSON snippet a user pastes into this tool's MCP config so it can reach
   * the hub. Returned as a plain object keyed by server name.
   */
  mcpConfigSnippet(hubUrl: string): Record<string, unknown>;
  /** where that snippet belongs, shown during `init` */
  mcpConfigLocation(): string;
}

const registry = new Map<string, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.id, adapter);
}

export function getAdapter(id: string): Adapter | undefined {
  return registry.get(id);
}

export function listAdapters(): Adapter[] {
  return [...registry.values()];
}
