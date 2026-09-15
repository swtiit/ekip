#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CONFIG_FILENAME,
  defaultConfig,
  globalDir,
  hubUrl,
  loadConfig,
  loadGlobalDefaults,
  startServer,
} from "../core/index.js";
import { getAdapter } from "../adapters/index.js";
import type { BridgeConfig } from "../core/config.js";
import {
  C,
  HubDownError,
  apiCancel,
  apiDelegate,
  authHeaders,
  apiState,
  followTask,
  printTaskDetail,
  printTaskTable,
  readPromptArg,
  resolveTaskId,
} from "./commands.js";
import { ask, select } from "./interactive.js";

interface AgentInfo {
  name: string;
  adapter: string;
  spawnable: boolean;
  model: string | null;
  effort: string | null;
}

const cwd = process.cwd();

function apiBase(): string {
  return hubUrl(loadConfig(cwd)).replace(/\/mcp$/, "");
}

/** `run <agent> <prompt|@file>` — delegate and live-follow until it finishes. */
async function cmdRun(follow: boolean): Promise<void> {
  const [agent, promptArg, ...rest] = process.argv.slice(3);
  if (!agent || !promptArg) {
    console.error(`Usage: ekip ${follow ? "run" : "delegate"} <agent> <prompt|@file> [title]`);
    process.exit(1);
  }
  const base = apiBase();
  const prompt = readPromptArg(promptArg, cwd);
  const task = await apiDelegate(base, {
    to: agent,
    prompt,
    title: rest.join(" ") || undefined,
  });
  console.log(`${C.dim}task${C.reset} ${task.id}  ${C.dim}→${C.reset} ${agent}  ${C.dim}· chat: ${base}/chat/${task.id}${C.reset}\n`);
  if (!follow) return;
  process.exit(await followTask(base, task.id));
}

async function cmdFollow(): Promise<void> {
  const idArg = process.argv[3];
  if (!idArg) {
    console.error("Usage: ekip follow <task-id|prefix>");
    process.exit(1);
  }
  const base = apiBase();
  const task = resolveTaskId(await apiState(base), idArg);
  if (!task) {
    console.error(`${C.red}No task matching "${idArg}"${C.reset}`);
    process.exit(1);
  }
  process.exit(await followTask(base, task.id));
}

async function cmdCancel(): Promise<void> {
  const [idArg, ...reasonParts] = process.argv.slice(3);
  if (!idArg) {
    console.error("Usage: ekip cancel <task-id|prefix> [reason]");
    process.exit(1);
  }
  const base = apiBase();
  const task = resolveTaskId(await apiState(base), idArg);
  if (!task) {
    console.error(`${C.red}No task matching "${idArg}"${C.reset}`);
    process.exit(1);
  }
  const { cancelled } = await apiCancel(base, task.id, reasonParts.join(" ") || undefined);
  if (cancelled.length === 0) {
    console.log(`${C.dim}Nothing to cancel — task is already ${task.status}.${C.reset}`);
    return;
  }
  console.log(`${C.magenta}cancelled${C.reset} ${cancelled.length} task(s): ${cancelled.map((id) => id.slice(0, 8)).join(", ")}`);
}

/** `flow` lists flows; `flow <name> <input|@file>` runs one and follows it. */
async function cmdFlow(): Promise<void> {
  const [name, inputArg] = process.argv.slice(3);
  const base = apiBase();
  const res = await fetch(`${base}/api/flows`, { headers: authHeaders() }).catch(() => undefined);
  if (!res) throw new HubDownError(`Cannot reach the hub at ${base} — is \`ekip serve\` running in this project?`);
  const { flows } = (await res.json()) as { flows: Array<{ name: string; label: string; description: string; steps: Array<{ agent: string; title: string }>; problems: string[] }> };
  if (!name) {
    for (const f of flows) {
      console.log(`${C.bold}${f.name.padEnd(14)}${C.reset} ${f.label}`);
      console.log(`${" ".repeat(15)}${C.dim}${f.steps.map((s) => `${s.title} (${s.agent})`).join(" → ")}${C.reset}`);
      if (f.problems.length) console.log(`${" ".repeat(15)}${C.yellow}can't run here: ${f.problems.join("; ")}${C.reset}`);
    }
    console.log(`\n${C.dim}Run one: ekip flow <name> "<what to build>"  (or @file)${C.reset}`);
    return;
  }
  if (!inputArg) {
    console.error('Usage: ekip flow <name> "<what to build>"');
    process.exit(1);
  }
  const started = await fetch(`${base}/api/flows/run`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ flow: name, input: readPromptArg(inputArg, cwd), cwd }),
  });
  const data = (await started.json()) as { task?: { id: string }; error?: string };
  if (!data.task) {
    console.error(`${C.red}${data.error ?? "could not start the flow"}${C.reset}`);
    process.exit(1);
  }
  console.log(`${C.dim}flow${C.reset} ${name}  ${C.dim}task ${data.task.id} · ${base}/chat/${data.task.id}${C.reset}\n`);
  process.exit(await followTask(base, data.task.id));
}

async function cmdAgents(): Promise<void> {
  const state = await apiState(apiBase());
  for (const a of state.agents as Array<Record<string, unknown>>) {
    const model = (a.model as string) ?? `${C.dim}(adapter default)${C.reset}`;
    const effort = a.effort ? `  effort:${a.effort}` : "";
    const spawn = a.spawnable ? "" : `  ${C.yellow}polls${C.reset}`;
    console.log(
      `${C.bold}${String(a.name).padEnd(12)}${C.reset} ${C.dim}${String(a.adapter).padEnd(12)}${C.reset} ${model}${effort}${spawn}`,
    );
  }
}

async function saveAgentConfig(base: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${base}/api/config/agent`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { agent?: Record<string, unknown>; error?: string };
  if (data.error) {
    console.error(`${C.red}${data.error}${C.reset}`);
    process.exit(1);
  }
  console.log(
    `${C.green}saved${C.reset} ${String(body.name)} → ${data.agent?.model ?? "(adapter default)"}${data.agent?.effort ? `  effort:${data.agent.effort}` : ""}  ${C.dim}(applies to the next spawn)${C.reset}`,
  );
}

const isInteractive = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Interactive model/effort picker for one agent — Claude Code /model style. */
async function pickForAgent(base: string, name: string): Promise<void> {
  const agent = (await apiState(base)).agents.find((x) => x.name === name) as unknown as
    | AgentInfo
    | undefined;
  if (!agent) {
    console.error(`${C.red}Unknown agent "${name}"${C.reset}`);
    return;
  }
  interface Catalog { models: Array<{ value: string; label: string; description?: string; source: string }>; note?: string }
  const catalogs = (await (await fetch(`${base}/api/models`, { headers: authHeaders() })).json()) as Record<string, Catalog>;
  const known = catalogs[agent.adapter]?.models ?? [];
  let model = await select<string>(`Model for ${name} (${agent.adapter})`, [
    ...known.map((m) => ({
      label: m.label,
      value: m.value,
      hint: m.value === agent.model ? "● current" : m.source === "seen" ? "seen here" : m.source === "account" ? "your account" : m.description ?? "",
    })),
    { label: "(adapter default)", value: "", hint: agent.model ? "" : "● current" },
    { label: "custom…", value: "\u0000custom" },
  ]);
  if (model === undefined) return;
  if (model === "\u0000custom") {
    model = await ask("Model name:");
    if (!model) return;
  }
  const body: Record<string, unknown> = { name, model };
  if (agent.adapter === "claude") {
    const effort = await select<string>(`Effort for ${name}`, [
      { label: "(model default)", value: "", hint: agent.effort ? "" : "● current" },
      ...["low", "medium", "high", "xhigh", "max"].map((e) => ({
        label: e,
        value: e,
        hint: agent.effort === e ? "● current" : "",
      })),
    ]);
    if (effort === undefined) return;
    body.effort = effort;
  }
  await saveAgentConfig(base, body);
}

/** `config` — interactive settings hub: pick an agent, pick its model. */
async function cmdConfig(): Promise<void> {
  const base = apiBase();
  if (!isInteractive()) {
    await cmdAgents();
    console.log(`${C.dim}(non-interactive terminal — use: ekip model <agent> <model> [effort])${C.reset}`);
    return;
  }
  for (;;) {
    const agents = (await apiState(base)).agents as unknown as AgentInfo[];
    const pick = await select<string>(
      "Agents",
      agents.map((a) => ({
        label: a.name.padEnd(12),
        value: a.name,
        hint: `${a.adapter} · ${a.model ?? "(default)"}${a.effort ? ` · effort:${a.effort}` : ""}${a.spawnable ? "" : " · polls"}`,
      })),
    );
    if (pick === undefined) return;
    await pickForAgent(base, pick);
  }
}

/** `model <agent> [model] [effort]` — show, set, or interactively pick. */
async function cmdModel(): Promise<void> {
  const [agent, model, effort] = process.argv.slice(3);
  if (!agent) {
    console.error("Usage: ekip model <agent> [model] [effort]");
    process.exit(1);
  }
  const base = apiBase();
  if (model === undefined) {
    if (isInteractive()) {
      await pickForAgent(base, agent);
      return;
    }
    const a = (await apiState(base)).agents.find((x) => x.name === agent) as
      | Record<string, unknown>
      | undefined;
    if (!a) {
      console.error(`${C.red}Unknown agent "${agent}"${C.reset}`);
      process.exit(1);
    }
    console.log(`${a.model ?? "(adapter default)"}${a.effort ? `  effort:${a.effort}` : ""}`);
    return;
  }
  const body: Record<string, unknown> = { name: agent, model };
  if (effort !== undefined) body.effort = effort;
  await saveAgentConfig(base, body);
}

async function cmdTasks(): Promise<void> {
  const status = process.argv[3];
  const state = await apiState(apiBase());
  printTaskTable(status ? state.tasks.filter((t) => t.status === status) : state.tasks);
}

async function cmdTask(): Promise<void> {
  const idArg = process.argv[3];
  if (!idArg) {
    console.error("Usage: ekip task <task-id|prefix>");
    process.exit(1);
  }
  const task = resolveTaskId(await apiState(apiBase()), idArg);
  if (!task) {
    console.error(`${C.red}No task matching "${idArg}"${C.reset}`);
    process.exit(1);
  }
  printTaskDetail(task);
}

async function cmdLogs(): Promise<void> {
  const idArg = process.argv[3];
  if (!idArg) {
    console.error("Usage: ekip logs <task-id|prefix>");
    process.exit(1);
  }
  const base = apiBase();
  const task = resolveTaskId(await apiState(base), idArg);
  if (!task) {
    console.error(`${C.red}No task matching "${idArg}"${C.reset}`);
    process.exit(1);
  }
  const res = await fetch(`${base}/api/logs/${task.id}`, { headers: authHeaders() });
  console.log(await res.text());
}

async function cmdContext(): Promise<void> {
  const [key, ...valueParts] = process.argv.slice(3);
  const base = apiBase();
  if (key && valueParts.length > 0) {
    const raw = valueParts.join(" ");
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // keep as plain string
    }
    const res = await fetch(`${base}/api/context`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ key, value, by: "human" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`could not set ${key}: ${body.error ?? res.status}`);
    }
    console.log(`${C.green}set${C.reset} ${key}`);
    return;
  }
  const state = await apiState(base);
  const entries = key ? state.context.filter((c) => c.key === key) : state.context;
  if (entries.length === 0) {
    console.log(`${C.dim}${key ? `No context key "${key}".` : "Empty blackboard."}${C.reset}`);
    return;
  }
  for (const c of entries) {
    console.log(`${C.cyan}${c.key}${C.reset}  ${C.dim}(${c.updatedBy})${C.reset}`);
    console.log(typeof c.value === "string" ? c.value : JSON.stringify(c.value, null, 2));
    console.log("");
  }
}

/** `init --global`: save this project's agents/roles as the machine defaults. */
function cmdInitGlobal(): void {
  const config = loadConfig(cwd);
  const dir = globalDir();
  mkdirSync(join(dir, "roles"), { recursive: true });
  // Everything a new project should inherit — not this project's identity,
  // and never the token (a secret belongs to one hub, not to every project).
  const { project: _project, projectRoot: _root, token: _token, ...defaults } = config;
  writeFileSync(join(dir, "config.json"), JSON.stringify(defaults, null, 2) + "\n");
  let copied = 0;
  const rolesDir = resolve(cwd, ".ekip", "roles");
  if (existsSync(rolesDir)) {
    for (const f of readdirSync(rolesDir).filter((x) => x.endsWith(".md"))) {
      copyFileSync(join(rolesDir, f), join(dir, "roles", f));
      copied++;
    }
  }
  console.log(`Saved machine defaults to ${dir}`);
  console.log(`  agents: ${config.agents.map((a) => a.name).join(", ")}`);
  console.log(`  roles copied: ${copied}`);
  console.log("New projects now need only: ekip init && ekip serve");
}

/** Add the bridge server to the project's .mcp.json, creating or merging. */
function wireMcpJson(url: string, withToken = false): void {
  const path = resolve(cwd, ".mcp.json");
  // Claude Code expands \${EKIP_TOKEN}, so the secret itself never lands in the repo.
  const entry = { type: "http", url, ...(withToken ? { headers: { Authorization: "Bearer ${EKIP_TOKEN}" } } : {}) };
  let doc: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      console.log("  ! .mcp.json exists but is not valid JSON — paste the snippet manually.");
      return;
    }
    if (doc.mcpServers?.["ekip"]) {
      console.log("  .mcp.json already has ekip — left untouched.");
      return;
    }
  }
  doc.mcpServers = { ...doc.mcpServers, "ekip": entry };
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  console.log(`  wired ekip into .mcp.json`);
}

function cmdInit(): void {
  const path = resolve(cwd, CONFIG_FILENAME);
  if (existsSync(path)) {
    console.log(`${CONFIG_FILENAME} already exists — leaving it untouched.`);
  } else {
    const globals = loadGlobalDefaults();
    const cfg = { ...defaultConfig(cwd), ...globals };
    cfg.project = resolve(cwd).split("/").pop() ?? "my-project";
    delete (cfg as Partial<BridgeConfig>).projectRoot;
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    console.log(
      `Created ${CONFIG_FILENAME}${globals ? ` from your machine defaults (${cfg.agents.map((a) => a.name).join(", ")})` : ""}`,
    );
  }

  const config = loadConfig(cwd);
  const url = hubUrl(config);
  console.log(`\nHub endpoint: ${url}`);
  const needsToken = Boolean(process.env.EKIP_TOKEN || config.token);
  wireMcpJson(url, needsToken);
  console.log("\nMCP snippets per agent (Claude Code is already wired via .mcp.json):\n");
  for (const agent of config.agents) {
    const adapter = getAdapter(agent.adapter);
    if (!adapter) {
      console.log(`  ! agent "${agent.name}": no adapter "${agent.adapter}"`);
      continue;
    }
    console.log(`# ${agent.name} → ${adapter.mcpConfigLocation()}`);
    console.log(
      JSON.stringify({ mcpServers: adapter.mcpConfigSnippet(url, needsToken ? { tokenEnv: "EKIP_TOKEN" } : undefined) }, null, 2),
    );
    console.log("");
  }
  console.log("Then run: ekip serve");
}

async function cmdServe(): Promise<void> {
  const config = loadConfig(cwd);
  const hub = await startServer(config);
  const url = hubUrl(config);
  console.log(`ekip serving "${config.project}" at ${url}`);
  console.log(`Web app:   ${url.replace(/\/mcp$/, "/chat")}  (Chat · Board · Guide · Settings)`);
  console.log(`Agents: ${config.agents.map((a) => a.name).join(", ")}`);
  console.log("Press Ctrl+C to stop.");
  const shutdown = async () => {
    await hub.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function cmdStatus(): void {
  let config: BridgeConfig;
  try {
    config = loadConfig(cwd);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const stateFile = resolve(cwd, ".ekip", "state.json");
  console.log(`Project: ${config.project}`);
  console.log(`Endpoint: ${hubUrl(config)}`);
  console.log(`Agents: ${config.agents.map((a) => `${a.name}(${a.adapter})`).join(", ")}`);
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    console.log(`Tasks: ${state.tasks?.length ?? 0}, context keys: ${state.context?.length ?? 0}`);
  } else {
    console.log("No state yet (hub has not run).");
  }
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  clear: "\x1b[2J\x1b[H",
};

const STATUS_COLOR: Record<string, string> = {
  pending: ANSI.yellow,
  claimed: ANSI.blue,
  done: ANSI.green,
  failed: ANSI.red,
  cancelled: ANSI.magenta,
};

function agoShort(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** Live terminal view of the hub — polls /api/state, falls back to state.json. */
async function cmdWatch(): Promise<void> {
  const config = loadConfig(cwd);
  const apiBase = hubUrl(config).replace(/\/mcp$/, "");
  const stateFile = resolve(cwd, ".ekip", "state.json");

  interface WatchState {
    tasks: Array<{
      id: string;
      status: string;
      from: string;
      to: string;
      title: string;
      updatedAt: string;
    }>;
    context: Array<{ key: string }>;
  }

  const tick = async (): Promise<void> => {
    let state: WatchState = { tasks: [], context: [] };
    let source = `hub · ${apiBase}/chat`;
    try {
      const res = await fetch(`${apiBase}/api/state`, { signal: AbortSignal.timeout(900), headers: authHeaders() });
      state = (await res.json()) as WatchState;
    } catch {
      source = "hub offline — reading state.json";
      if (existsSync(stateFile)) {
        try {
          state = JSON.parse(readFileSync(stateFile, "utf8")) as WatchState;
        } catch {
          // keep the empty state
        }
      }
    }

    const counts: Record<string, number> = { pending: 0, claimed: 0, done: 0, failed: 0, cancelled: 0 };
    for (const t of state.tasks ?? []) {
      if (counts[t.status] !== undefined) counts[t.status]++;
    }
    const width = process.stdout.columns ?? 100;
    const lines: string[] = [];
    lines.push(`${ANSI.bold}ekip · ${config.project}${ANSI.reset} ${ANSI.dim}(${source})${ANSI.reset}`);
    lines.push(
      Object.entries(counts)
        .map(([k, n]) => `${STATUS_COLOR[k]}${k} ${n}${ANSI.reset}`)
        .join("  ") + `  ${ANSI.dim}context keys ${(state.context ?? []).length}${ANSI.reset}`,
    );
    lines.push("");
    const rows = (state.tasks ?? [])
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 15);
    if (rows.length === 0) {
      lines.push(`${ANSI.dim}No tasks yet.${ANSI.reset}`);
    }
    for (const t of rows) {
      const status = `${STATUS_COLOR[t.status] ?? ""}${t.status.padEnd(9)}${ANSI.reset}`;
      const route = `${t.from} → ${t.to}`.padEnd(24).slice(0, 24);
      const age = agoShort(t.updatedAt).padStart(4);
      const title = t.title.slice(0, Math.max(10, width - 48));
      lines.push(`${status} ${ANSI.dim}${t.id.slice(0, 8)}${ANSI.reset} ${route} ${age}  ${title}`);
    }
    lines.push("");
    lines.push(`${ANSI.dim}Refreshes every second · Ctrl+C to quit${ANSI.reset}`);
    process.stdout.write(ANSI.clear + lines.join("\n") + "\n");
  };

  await tick();
  setInterval(() => void tick(), 1000);
}

const command = process.argv[2];
try {
  switch (command) {
    case "init":
      if (process.argv[3] === "--global") cmdInitGlobal();
      else cmdInit();
      break;
    case "serve":
      await cmdServe();
      break;
    case "status":
      cmdStatus();
      break;
    case "watch":
      await cmdWatch();
      break;
    case "run":
      await cmdRun(true);
      break;
    case "delegate":
      await cmdRun(false);
      break;
    case "follow":
      await cmdFollow();
      break;
    case "cancel":
      await cmdCancel();
      break;
    case "flow":
      await cmdFlow();
      break;
    case "config":
      await cmdConfig();
      break;
    case "agents":
      await cmdAgents();
      break;
    case "model":
      await cmdModel();
      break;
    case "tasks":
      await cmdTasks();
      break;
    case "task":
      await cmdTask();
      break;
    case "logs":
      await cmdLogs();
      break;
    case "context":
      await cmdContext();
      break;
    case "ui": {
      const token = authHeaders().Authorization?.replace(/^Bearer /, "");
      const url = `${apiBase()}/chat${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      console.log(url);
      const { spawn } = await import("node:child_process");
      spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
        detached: true,
        stdio: "ignore",
      }).unref();
      break;
    }
    default:
      console.log(
        [
          "ekip — multi-agent coordination hub over MCP",
          "",
          "Project:",
          "  init                        scaffold config (+ .mcp.json) from your machine defaults",
          "  init --global               save THIS project's agents + roles as machine defaults",
          "  serve                       start the hub (MCP + web app at /chat)",
          "  status                      show config and task/context counts",
          "",
          "Work:",
          "  run <agent> <prompt|@file>  delegate and live-follow the task tree",
          "  delegate <agent> <prompt>   delegate without following",
          "  follow <task-id>            attach to a running task (and children)",
          "  cancel <task-id> [reason]   stop a task and everything delegated from it",
          "  flow [name] [input|@file]   list flows, or run one (the hub runs every stage and gate)",
          "",
          "Configure:",
          "  config                      interactive picker: agents → model → effort",
          "  agents                      list agents with their models",
          "  model <agent> [model] [effort]  pick (no args) or hot-set an agent's model",
          "",
          "Inspect:",
          "  watch                       full-screen live view, refreshes every second",
          "  tasks [status]              list recent tasks (pending|claimed|done|failed|cancelled)",
          "  task <task-id>              show one task: prompt, result, artifacts",
          "  logs <task-id>              print the spawned agent's log",
          "  context [key] [value]       read the blackboard, or set a key",
          "  ui                          open the web app in the browser",
          "",
          "Task ids may be unique prefixes (e.g. 54d00e94).",
        ].join("\n"),
      );
  }
} catch (err) {
  if (err instanceof HubDownError) {
    console.error(`${C.red}${err.message}${C.reset}`);
  } else {
    console.error(`${C.red}${(err as Error).message}${C.reset}`);
  }
  process.exit(1);
}
