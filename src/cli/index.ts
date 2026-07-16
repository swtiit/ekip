#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONFIG_FILENAME,
  defaultConfig,
  hubUrl,
  loadConfig,
  startServer,
} from "../core/index.js";
import { getAdapter } from "../adapters/index.js";
import type { BridgeConfig } from "../core/config.js";
import {
  C,
  HubDownError,
  apiDelegate,
  apiState,
  followTask,
  printTaskDetail,
  printTaskTable,
  readPromptArg,
  resolveTaskId,
} from "./commands.js";

const cwd = process.cwd();

function apiBase(): string {
  return hubUrl(loadConfig(cwd)).replace(/\/mcp$/, "");
}

/** `run <agent> <prompt|@file>` — delegate and live-follow until it finishes. */
async function cmdRun(follow: boolean): Promise<void> {
  const [agent, promptArg, ...rest] = process.argv.slice(3);
  if (!agent || !promptArg) {
    console.error(`Usage: agent-bridge ${follow ? "run" : "delegate"} <agent> <prompt|@file> [title]`);
    process.exit(1);
  }
  const base = apiBase();
  const prompt = readPromptArg(promptArg, cwd);
  const task = await apiDelegate(base, {
    to: agent,
    prompt,
    title: rest.join(" ") || undefined,
  });
  console.log(`${C.dim}task${C.reset} ${task.id}  ${C.dim}→${C.reset} ${agent}  ${C.dim}· dashboard: ${base}/ui${C.reset}\n`);
  if (!follow) return;
  process.exit(await followTask(base, task.id));
}

async function cmdFollow(): Promise<void> {
  const idArg = process.argv[3];
  if (!idArg) {
    console.error("Usage: agent-bridge follow <task-id|prefix>");
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

async function cmdTasks(): Promise<void> {
  const status = process.argv[3];
  const state = await apiState(apiBase());
  printTaskTable(status ? state.tasks.filter((t) => t.status === status) : state.tasks);
}

async function cmdTask(): Promise<void> {
  const idArg = process.argv[3];
  if (!idArg) {
    console.error("Usage: agent-bridge task <task-id|prefix>");
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
    console.error("Usage: agent-bridge logs <task-id|prefix>");
    process.exit(1);
  }
  const base = apiBase();
  const task = resolveTaskId(await apiState(base), idArg);
  if (!task) {
    console.error(`${C.red}No task matching "${idArg}"${C.reset}`);
    process.exit(1);
  }
  const res = await fetch(`${base}/api/logs/${task.id}`);
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
    await fetch(`${base}/api/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, by: "human" }),
    });
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

function cmdInit(): void {
  const path = resolve(cwd, CONFIG_FILENAME);
  if (existsSync(path)) {
    console.log(`${CONFIG_FILENAME} already exists — leaving it untouched.`);
  } else {
    const cfg = defaultConfig(cwd);
    cfg.project = resolve(cwd).split("/").pop() ?? "my-project";
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    console.log(`Created ${CONFIG_FILENAME}`);
  }

  const config = loadConfig(cwd);
  const url = hubUrl(config);
  console.log(`\nHub endpoint: ${url}\n`);
  console.log("Paste these MCP snippets into each agent:\n");
  for (const agent of config.agents) {
    const adapter = getAdapter(agent.adapter);
    if (!adapter) {
      console.log(`  ! agent "${agent.name}": no adapter "${agent.adapter}"`);
      continue;
    }
    console.log(`# ${agent.name} → ${adapter.mcpConfigLocation()}`);
    console.log(
      JSON.stringify({ mcpServers: adapter.mcpConfigSnippet(url) }, null, 2),
    );
    console.log("");
  }
  console.log("Then run: agent-bridge serve");
}

async function cmdServe(): Promise<void> {
  const config = loadConfig(cwd);
  const hub = await startServer(config);
  const url = hubUrl(config);
  console.log(`agent-bridge serving "${config.project}" at ${url}`);
  console.log(`Dashboard: ${url.replace(/\/mcp$/, "/ui")}`);
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
  const stateFile = resolve(cwd, ".agent-bridge", "state.json");
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
  clear: "\x1b[2J\x1b[H",
};

const STATUS_COLOR: Record<string, string> = {
  pending: ANSI.yellow,
  claimed: ANSI.blue,
  done: ANSI.green,
  failed: ANSI.red,
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
  const stateFile = resolve(cwd, ".agent-bridge", "state.json");

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
    let source = `hub · ${apiBase}/ui`;
    try {
      const res = await fetch(`${apiBase}/api/state`, { signal: AbortSignal.timeout(900) });
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

    const counts: Record<string, number> = { pending: 0, claimed: 0, done: 0, failed: 0 };
    for (const t of state.tasks ?? []) {
      if (counts[t.status] !== undefined) counts[t.status]++;
    }
    const width = process.stdout.columns ?? 100;
    const lines: string[] = [];
    lines.push(`${ANSI.bold}agent-bridge · ${config.project}${ANSI.reset} ${ANSI.dim}(${source})${ANSI.reset}`);
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
      const status = `${STATUS_COLOR[t.status] ?? ""}${t.status.padEnd(7)}${ANSI.reset}`;
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
      cmdInit();
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
      const url = `${apiBase()}/ui`;
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
          "agent-bridge — multi-agent coordination hub over MCP",
          "",
          "Project:",
          "  init                        scaffold config + print MCP snippets",
          "  serve                       start the hub (MCP + dashboard at /ui)",
          "  status                      show config and task/context counts",
          "",
          "Work:",
          "  run <agent> <prompt|@file>  delegate and live-follow the task tree",
          "  delegate <agent> <prompt>   delegate without following",
          "  follow <task-id>            attach to a running task (and children)",
          "",
          "Inspect:",
          "  watch                       full-screen live view, refreshes every second",
          "  tasks [status]              list recent tasks (pending|claimed|done|failed)",
          "  task <task-id>              show one task: prompt, result, artifacts",
          "  logs <task-id>              print the spawned agent's log",
          "  context [key] [value]       read the blackboard, or set a key",
          "  ui                          open the dashboard in the browser",
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
