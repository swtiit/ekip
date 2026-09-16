import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { statSync } from "node:fs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { BridgeConfig } from "./config.js";
import {
  CONFIG_FILENAME,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_MAX_CONCURRENT_TOTAL,
  RETENTION_DEFAULTS,
  WATCHDOG_DEFAULTS,
  getAgentFlag,
  hubUrl,
  resolveRoleFile,
  setAgentFlag,
  stateFilePath,
  migrateHubData,
} from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { buildHub, type HubSessions } from "./hub.js";
import { removeSpawnLog, logsDir } from "./logs.js";
import { FlowRunner, loadFlows, validateFlow } from "./flows.js";
import { assertSafeBinding, checkAccess, hubToken, presentedToken, tokenMatches } from "./access.js";
import { isTerminal, type Task } from "../protocol/index.js";
import { catalogFor, probeClaudeModel } from "./models.js";
import { claudeBilling } from "./billing.js";
import { Store } from "./store.js";
import { appHtml } from "./app.js";
import { Watchdog } from "./watchdog.js";
import { BUDGET_DEFAULTS, budgetReport, parseBudget, startsRequest } from "./budget.js";
import { isVietnamese } from "./words.js";

export interface RunningHub {
  store: Store;
  close: () => Promise<void>;
}

const BODY_LIMIT = 8 * 1024 * 1024;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolvePromise(undefined);
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function sendText(res: ServerResponse, status: number, body: string, type = "text/plain"): void {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
  res.end(body);
}

/**
 * Boots the Streamable HTTP MCP endpoint plus the dashboard/observation API
 * on plain node:http — no web framework. All agent sessions share one Store
 * and Dispatcher (so delegation and context are common), but each MCP session
 * gets its own server+transport pair as the SDK requires.
 */
export function startServer(config: BridgeConfig): Promise<RunningHub> {
  try {
    assertSafeBinding(config);
  } catch (err) {
    return Promise.reject(err);
  }
  const movedData = migrateHubData(config);
  if (movedData) console.log(`ekip: moved this hub's records out of the project to ${movedData}`);
  const store = new Store(stateFilePath(config));
  const dispatcher = new Dispatcher(config, store);
  const watchdog = new Watchdog(config, store, (taskId) => dispatcher.kill(taskId));
  const flowRunner = new FlowRunner(config, store, dispatcher);
  watchdog.start();

  // A hub restart loses process handles: whatever was running is unknowable
  // now. Drop stale pids so the web app doesn't show ghosts (without touching
  // the idle clock); the watchdog still reaps those tasks by TTL if their
  // workers never report back.
  for (const t of store.listTasks()) if (t.pid !== undefined) store.updateTask(t.id, { pid: undefined }, { touch: false });
  const relaunch = recoverAfterRestart(config, store);

  // Retention: finished tasks older than N days go, with their spawn logs.
  const retentionDays = config.retention?.days ?? RETENTION_DEFAULTS.days;
  const prune = (): void => {
    if (!retentionDays || retentionDays <= 0) return;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    for (const t of store.prune(cutoff)) removeSpawnLog(config, t.to, t.id);
  };
  prune();
  const pruneTimer = setInterval(prune, 3_600_000);
  pruneTimer.unref();

  // Budgets measured in minutes run out mid-flight; check them on the watchdog's beat.
  const budgetTimer = setInterval(
    () => dispatcher.enforceTimeBudgets(),
    ({ ...WATCHDOG_DEFAULTS, ...config.watchdog }).sweepIntervalSeconds * 1000,
  );
  budgetTimer.unref();

  const transports: Record<string, StreamableHTTPServerTransport> = {};
  // When each session was last used, so abandoned ones can be closed.
  const lastSeen = new Map<string, number>();
  const maxSessions = Math.max(1, config.mcpSessions?.max ?? 256);
  const idleMs = Math.max(1, config.mcpSessions?.idleMinutes ?? 30) * 60_000;
  const MAX_EVENT_STREAMS = 64;
  const closeSession = (sid: string): void => {
    const t = transports[sid];
    lastSeen.delete(sid);
    if (!t) return;
    delete transports[sid];
    void t.close().catch(() => {});
  };
  const sessionSweep = setInterval(() => {
    const now = Date.now();
    for (const [sid, at] of lastSeen) if (now - at > idleMs) closeSession(sid);
  }, Math.min(idleMs, 60_000));
  sessionSweep.unref();
  const sessions: HubSessions = { claims: new Map(), live: new Set() };
  const sseClients = new Set<ServerResponse>();

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports[sessionId] : undefined;
    if (transport && sessionId) lastSeen.set(sessionId, Date.now());

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (!transport) {
        if (sessionId) {
          // Unknown session (e.g. the hub restarted): per the MCP transport spec a 404
          // tells the client to start a new session instead of failing for good.
          sendJson(res, 404, {
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found; send a new initialize request." },
            id: null,
          });
          return;
        }
        if (!isInitializeRequest(body)) {
          sendJson(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "No valid session; send an initialize request first." },
            id: null,
          });
          return;
        }
        // Make room: close the least recently used session when at the cap.
        while (Object.keys(transports).length >= maxSessions) {
          const oldest = [...lastSeen.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? Object.keys(transports)[0];
          if (!oldest) break;
          closeSession(oldest);
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport!;
            lastSeen.set(sid, Date.now());
          },
        });
        const run = randomUUID();
        sessions.live.add(run);
        const opened = transport;
        opened.onclose = () => {
          sessions.live.delete(run);
          if (opened.sessionId) {
            delete transports[opened.sessionId];
            lastSeen.delete(opened.sessionId);
          }
        };
        const runHeader = req.headers["x-ekip-run"];
        const server = buildHub(config, store, dispatcher, {
          id: run,
          registry: sessions,
          runKey: typeof runHeader === "string" && runHeader ? runHeader : undefined,
        });
        await server.connect(transport);
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET (SSE stream) and DELETE (session teardown) reuse the same transport.
    if (!transport) {
      sendText(res, 400, "Unknown or missing session id");
      return;
    }
    await transport.handleRequest(req, res);
  }

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 2000\n\n");
    const onChange = (event: unknown): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    store.on("change", onChange);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    // Keep the number of live-update streams bounded: drop the oldest tab's stream.
    if (sseClients.size >= MAX_EVENT_STREAMS) {
      const oldest = sseClients.values().next().value;
      if (oldest) {
        sseClients.delete(oldest);
        oldest.end();
      }
    }
    sseClients.add(res);
    req.on("close", () => {
      clearInterval(ping);
      store.off("change", onChange);
      sseClients.delete(res);
    });
  }

  async function handleDelegate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    const { to, prompt, title, from, parent_task_id } = body;
    if (typeof to !== "string" || !to || typeof prompt !== "string" || !prompt) {
      sendJson(res, 400, { error: "`to` and `prompt` are required" });
      return;
    }
    if (!config.agents.some((a) => a.name === to)) {
      sendJson(res, 400, {
        error: `unknown agent "${to}" — configured agents: ${config.agents.map((a) => a.name).join(", ")}`,
      });
      return;
    }
    const parent = typeof parent_task_id === "string" ? store.getTask(parent_task_id) : undefined;
    if (typeof parent_task_id === "string" && parent_task_id && !parent) {
      sendJson(res, 404, { error: `unknown parent task ${parent_task_id}` });
      return;
    }
    const sender = typeof from === "string" && from ? from : "human";
    const budget = parseBudget(body.budget);
    if (typeof budget === "string") {
      sendJson(res, 400, { error: budget });
      return;
    }
    // A reply stays in its conversation's folder; a new conversation may pick one.
    let cwd: string | undefined = parent?.cwd;
    if (!parent && typeof body.cwd === "string" && body.cwd.trim()) {
      const checked = checkFolder(body.cwd);
      if (typeof checked !== "string") {
        sendJson(res, 400, { error: checked.error });
        return;
      }
      cwd = checked === config.projectRoot ? undefined : checked;
      store.touchFolder(checked);
    }
    const task = store.createTask({
      from: sender,
      to,
      title: typeof title === "string" && title ? title : prompt.slice(0, 60),
      prompt,
      depth: (parent?.depth ?? 0) + 1,
      parentId: parent?.id,
      cwd,
      budget,
    });
    store.addMessage({ taskId: task.id, from: sender, to, kind: "human", text: prompt });
    const outcome = await dispatcher.dispatch(task);
    sendJson(res, 200, { task: store.getTask(task.id), dispatch: outcome });
  }

  async function handleCancel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { task_id, by, reason } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if (typeof task_id !== "string" || !task_id) {
      sendJson(res, 400, { error: "`task_id` is required" });
      return;
    }
    if (!store.getTask(task_id)) {
      sendJson(res, 404, { error: `unknown task ${task_id}` });
      return;
    }
    const cancelled = dispatcher.cancel(
      task_id,
      typeof by === "string" && by ? by : "human",
      typeof reason === "string" ? reason : undefined,
    );
    sendJson(res, 200, { cancelled, task: store.getTask(task_id) });
  }

  async function handleContext(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { key, value, by, folder } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if (typeof key !== "string" || !key) {
      sendJson(res, 400, { error: "`key` is required" });
      return;
    }
    let scope: string | undefined;
    if (typeof folder === "string" && folder && folder !== config.projectRoot) {
      const checked = checkFolder(folder);
      if (typeof checked !== "string") {
        sendJson(res, 400, { error: checked.error });
        return;
      }
      scope = checked === config.projectRoot ? undefined : checked;
    }
    sendJson(res, 200, {
      entry: store.setContext(key, value, typeof by === "string" && by ? by : "human", scope),
    });
  }

  /**
   * Model catalogs per adapter — see core/models.ts for where each list
   * comes from and why neither vendor simply hands one over.
   */
  async function handleModels(res: ServerResponse): Promise<void> {
    const adapters = [...new Set(config.agents.map((a) => a.adapter))];
    const entries = await Promise.all(adapters.map(async (a) => [a, await catalogFor(a)] as const));
    sendJson(res, 200, Object.fromEntries(entries));
  }

  /**
   * Update one agent's model/effort/spawnable: patches the in-memory config
   * (the dispatcher reads it at spawn time, so changes apply to the next
   * task with no restart) and persists the same change to the config file.
   */
  async function handleConfigAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    const { name } = body;
    const agent = config.agents.find((a) => a.name === name);
    if (!agent) {
      sendJson(res, 400, {
        error: `unknown agent "${String(name)}" — configured agents: ${config.agents.map((a) => a.name).join(", ")}`,
      });
      return;
    }
    if ("model" in body) {
      if (typeof body.model !== "string") {
        sendJson(res, 400, { error: "`model` must be a string (empty to unset)" });
        return;
      }
      setAgentFlag(agent, "--model", body.model);
    }
    if ("effort" in body) {
      const effort = body.effort;
      if (effort !== "" && !["low", "medium", "high", "xhigh", "max"].includes(effort as string)) {
        sendJson(res, 400, { error: "`effort` must be low|medium|high|xhigh|max, or empty to unset" });
        return;
      }
      setAgentFlag(agent, "--effort", effort as string);
    }
    if ("spawnable" in body) agent.spawnable = body.spawnable !== false;
    for (const [field, max] of [["label", 40], ["description", 240]] as const) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (typeof raw !== "string" || raw.length > max) {
        sendJson(res, 400, { error: `\`${field}\` must be a string of at most ${max} characters (empty to unset)` });
        return;
      }
      const value = raw.trim();
      if (value) agent[field] = value;
      else delete agent[field];
    }
    if ("maxConcurrent" in body) {
      const raw = body.maxConcurrent;
      const n = raw === "" || raw === null ? undefined : Number(raw);
      if (n !== undefined && (!Number.isInteger(n) || n < 1)) {
        sendJson(res, 400, { error: "`maxConcurrent` must be a whole number ≥ 1, or empty to unset" });
        return;
      }
      agent.maxConcurrent = n;
    }

    // Persist to the project's config file, touching only this agent's entry.
    try {
      const path = join(config.projectRoot, CONFIG_FILENAME);
      const raw = JSON.parse(readFileSync(path, "utf8")) as { agents?: Array<Record<string, unknown>> };
      const entry = raw.agents?.find((a) => a.name === agent.name);
      if (entry) {
        entry.args = agent.args;
        entry.spawnable = agent.spawnable;
        if (agent.maxConcurrent === undefined) delete entry.maxConcurrent;
        else entry.maxConcurrent = agent.maxConcurrent;
        for (const field of ["label", "description"] as const) {
          if (agent[field] === undefined) delete entry[field];
          else entry[field] = agent[field];
        }
        writeFileSync(path, JSON.stringify(raw, null, 2) + "\n");
      }
    } catch {
      // In-memory config still applied; a missing/hand-broken file shouldn't 500.
    }
    store.emit("change", { kind: "config", agent: agent.name });
    sendJson(res, 200, { agent: describeAgent(agent) });
  }

  /**
   * Is a model id real? Claude Code can't list models, so we run one tiny
   * task with it — that also pins down what an alias resolves to.
   */
  async function handleProbeModel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { model, adapter } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if (typeof model !== "string" || !model.trim()) {
      sendJson(res, 400, { error: "`model` is required" });
      return;
    }
    if (adapter !== undefined && adapter !== "claude") {
      sendJson(res, 400, { error: `only Claude models are checked by running one; ${String(adapter)} lists its models directly` });
      return;
    }
    const probe = await probeClaudeModel(model.trim());
    store.emit("change", { kind: "config", models: true });
    sendJson(res, 200, { model: model.trim(), ...probe });
  }

  /** Hub-wide settings the UI can change: language for now. */
  async function handleConfigHub(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if ("budget" in body) {
      const budget = parseBudget(body.budget);
      if (typeof budget === "string") {
        sendJson(res, 400, { error: budget });
        return;
      }
      config.budget = budget && Object.keys(budget).length ? { ...config.budget, ...budget } : undefined;
      try {
        const path = join(config.projectRoot, CONFIG_FILENAME);
        const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        if (config.budget) raw.budget = config.budget;
        else delete raw.budget;
        writeFileSync(path, JSON.stringify(raw, null, 2) + "\n");
      } catch {
        // In-memory setting still applies; a missing file shouldn't 500.
      }
      store.emit("change", { kind: "config", hub: true });
    }
    if ("language" in body) {
      if (typeof body.language !== "string") {
        sendJson(res, 400, { error: "`language` must be a string (empty to unset)" });
        return;
      }
      const value = body.language.trim();
      if (value.length > 40) {
        sendJson(res, 400, { error: "`language` is too long" });
        return;
      }
      config.language = value || undefined;
      try {
        const path = join(config.projectRoot, CONFIG_FILENAME);
        const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        if (value) raw.language = value;
        else delete raw.language;
        writeFileSync(path, JSON.stringify(raw, null, 2) + "\n");
      } catch {
        // In-memory setting still applies; a missing file shouldn't 500.
      }
      store.emit("change", { kind: "config", hub: true });
    }
    sendJson(res, 200, { language: config.language ?? null, budget: hubBudget() });
  }

  /** The budget a request gets when it doesn't bring its own. */
  function hubBudget() {
    const pick = (key: "runs" | "outputTokens" | "minutes") => {
      const v = config.budget?.[key] ?? BUDGET_DEFAULTS[key];
      return typeof v === "number" && v > 0 ? v : 0;
    };
    return { runs: pick("runs"), outputTokens: pick("outputTokens"), minutes: pick("minutes") };
  }

  const describeAgent = (a: BridgeConfig["agents"][number]) => ({
    name: a.name,
    adapter: a.adapter,
    spawnable: a.spawnable !== false,
    model: getAgentFlag(a, "--model") ?? null,
    effort: getAgentFlag(a, "--effort") ?? null,
    promptFile: a.promptFile ?? null,
    label: a.label ?? null,
    description: a.description ?? null,
    maxConcurrent: a.maxConcurrent ?? null,
    args: a.args ?? [],
  });

  /**
   * Delete a conversation (the thread a task belongs to). Live work must be
   * stopped first — pass `stop: true` to cancel it as part of the delete.
   */
  async function handleDeleteThread(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { id, stop } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !store.getTask(id)) {
      sendJson(res, 404, { error: "unknown conversation" });
      return;
    }
    const root = store.threadOf(id);
    const family = store.listTasks().filter((t) => store.threadOf(t.id) === root);
    const live = family.filter((t) => !isTerminal(t.status));
    if (live.length > 0) {
      if (stop !== true) {
        sendJson(res, 409, { error: `${live.length} task(s) still running — stop them first`, running: live.length });
        return;
      }
      dispatcher.cancel(root, "human", "conversation deleted");
    }
    const removed = store.deleteThread(root);
    for (const t of removed) removeSpawnLog(config, t.to, t.id);
    sendJson(res, 200, { deleted: removed.length, thread: root });
  }

  function handleFlows(res: ServerResponse): void {
    sendJson(res, 200, {
      flows: loadFlows(config).map((f) => ({
        name: f.name,
        label: f.label ?? f.name,
        description: f.description ?? "",
        source: f.source,
        steps: f.steps.map((s) => ({ id: s.id, agent: s.agent, title: s.title ?? s.id, gate: s.gate ?? null, onFail: s.onFail ?? null })),
        budget: f.budget ?? null,
        problems: validateFlow(f, config),
      })),
    });
  }

  async function handleRunFlow(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { flow: name, input, cwd, from } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    const flow = loadFlows(config).find((f) => f.name === name);
    if (!flow) {
      sendJson(res, 404, { error: `unknown flow "${String(name)}"` });
      return;
    }
    if (typeof input !== "string" || !input.trim()) {
      sendJson(res, 400, { error: "`input` is required — what should the flow build?" });
      return;
    }
    const problems = validateFlow(flow, config);
    if (problems.length) {
      sendJson(res, 400, { error: `flow "${flow.name}" can't run here: ${problems.join("; ")}`, problems });
      return;
    }
    let folder: string | undefined;
    if (typeof cwd === "string" && cwd.trim()) {
      const checked = checkFolder(cwd);
      if (typeof checked !== "string") {
        sendJson(res, 400, { error: checked.error });
        return;
      }
      folder = checked === config.projectRoot ? undefined : checked;
      store.touchFolder(checked);
    }
    const task = flowRunner.start(flow, input, { cwd: folder, from: typeof from === "string" && from ? from : "human" });
    sendJson(res, 200, { task });
  }

  /** An absolute, existing directory — or the reason it is not one. */
  function checkFolder(raw: string): string | { error: string } {
    const expanded = raw.trim().replace(/^~(?=$|\/)/, homedir());
    if (!isAbsolute(expanded)) return { error: `folder must be an absolute path: ${raw}` };
    const path = resolvePath(expanded);
    try {
      if (!statSync(path).isDirectory()) return { error: `not a folder: ${path}` };
    } catch {
      return { error: `folder does not exist: ${path}` };
    }
    return path;
  }

  /** Folders to offer: the hub's own project, then recent picks, then any seen on tasks. */
  function handleFolders(res: ServerResponse): void {
    const stats = new Map<string, { tasks: number; lastAt: string }>();
    for (const t of store.listTasks()) {
      if (t.parentId && store.getTask(t.parentId)) continue;
      const f = t.cwd ?? config.projectRoot;
      const cur = stats.get(f) ?? { tasks: 0, lastAt: "" };
      cur.tasks++;
      if (t.updatedAt > cur.lastAt) cur.lastAt = t.updatedAt;
      stats.set(f, cur);
    }
    const order = [config.projectRoot, ...store.listFolders(), ...stats.keys()];
    const seen = new Set<string>();
    const folders = order
      .filter((f) => (seen.has(f) ? false : (seen.add(f), true)))
      .map((path) => {
        let exists = true;
        try {
          exists = statSync(path).isDirectory();
        } catch {
          exists = false;
        }
        return { path, name: basename(path) || path, home: path === config.projectRoot, exists, ...(stats.get(path) ?? { tasks: 0, lastAt: null }) };
      });
    sendJson(res, 200, { home: config.projectRoot, folders });
  }

  async function handleAddFolder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { path, remove } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if (typeof path !== "string" || !path) {
      sendJson(res, 400, { error: "`path` is required" });
      return;
    }
    if (remove === true) {
      store.forgetFolder(path);
      sendJson(res, 200, { ok: true });
      return;
    }
    const checked = checkFolder(path);
    if (typeof checked !== "string") {
      sendJson(res, 400, { error: checked.error });
      return;
    }
    store.touchFolder(checked);
    sendJson(res, 200, { path: checked, name: basename(checked) });
  }

  /**
   * Directory listing for the folder picker: sub-folders only, no file
   * contents. A browser page cannot learn absolute paths from a native
   * picker, so the hub browses on its behalf.
   */
  function handleBrowse(res: ServerResponse, raw: string | null): void {
    const checked = checkFolder(raw && raw.trim() ? raw : homedir());
    if (typeof checked !== "string") {
      sendJson(res, 400, { error: checked.error });
      return;
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(checked);
    } catch {
      sendJson(res, 403, { error: `cannot read ${checked}` });
      return;
    }
    const markers = [".git", "package.json", "ekip.config.json", "pyproject.toml", "go.mod", "Cargo.toml", "CLAUDE.md", "AGENTS.md"];
    const dirs = entries
      .filter((name) => !name.startsWith(".") && name !== "node_modules")
      .map((name) => join(checked, name))
      .filter((p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      })
      .map((p) => ({ name: basename(p), path: p, project: markers.some((m) => existsSync(join(p, m))) }))
      .sort((a, b) => Number(b.project) - Number(a.project) || a.name.localeCompare(b.name))
      .slice(0, 400);
    const parent = dirname(checked);
    sendJson(res, 200, {
      path: checked,
      name: basename(checked) || checked,
      parent: parent === checked ? null : parent,
      home: homedir(),
      project: markers.some((m) => existsSync(join(checked, m))),
      dirs,
    });
  }

  function handleThreads(res: ServerResponse): void {
    sendJson(res, 200, {
      threads: store.listThreads().map(({ task, messages, lastAt }) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        cwd: task.cwd ?? config.projectRoot,
        from: task.from,
        to: task.to,
        createdAt: task.createdAt,
        lastAt,
        messages,
      })),
    });
  }

  function handleThread(res: ServerResponse, taskId: string): void {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(taskId) || !store.getTask(taskId)) {
      sendJson(res, 404, { error: "unknown task" });
      return;
    }
    const threadId = store.threadOf(taskId);
    const family = store.listTasks().filter((t) => store.threadOf(t.id) === threadId);
    const budgets = family.filter(startsRequest).map((t) => budgetReport(config, store, t.id)).filter(Boolean);
    sendJson(res, 200, { thread: threadId, tasks: family, messages: store.listMessages(threadId), budgets });
  }

  function handleLogs(res: ServerResponse, taskId: string): void {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(taskId)) {
      sendText(res, 400, "Invalid task id.");
      return;
    }
    const dir = logsDir(config);
    const file = existsSync(dir)
      ? readdirSync(dir).find((f) => f.endsWith(`-${taskId}.log`))
      : undefined;
    if (!file) {
      sendText(res, 404, "No log for this task.");
      return;
    }
    const buf = readFileSync(join(dir, file));
    const tail = buf.length > 32_768 ? buf.subarray(buf.length - 32_768) : buf;
    sendText(res, 200, tail.toString("utf8"));
  }

  const httpServer = createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (err) {
      // A request must never take the hub (and every running task's bookkeeping) down.
      if (!res.headersSent) sendJson(res, 400, { error: (err as Error).message });
      else res.end();
    }
  });

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const path = (req.url ?? "/").split("?")[0];
    const route = `${req.method} ${path}`;

    const denied = checkAccess(config, req, path);
    if (denied) {
      sendJson(res, denied.status, { error: denied.error, auth: denied.status === 401 });
      return;
    }
    const cookie = (value: string, maxAge: number) =>
      `ekip_token=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

    // A page opened as /chat?token=… signs the browser in and drops the token from the URL.
    if (req.method === "GET" && !path.startsWith("/api/") && path !== "/mcp" && hubToken(config)) {
      const t = new URL(req.url ?? "/", "http://x").searchParams.get("token");
      if (t !== null) {
        if (tokenMatches(config, t)) {
          res.writeHead(302, { Location: path, "Set-Cookie": cookie(t, 60 * 60 * 24 * 30) });
        } else {
          res.writeHead(302, { Location: path });
        }
        res.end();
        return;
      }
    }

    const routed = (async (): Promise<void> => {
      if (path === "/mcp") return handleMcp(req, res);
      switch (route) {
        case "GET /health":
          // Before sign-in we say only that a token is needed, and in which language to ask.
          if (hubToken(config) && !tokenMatches(config, presentedToken(req))) {
            return sendJson(res, 200, { ok: true, auth: true, language: config.language ?? null });
          }
          return sendJson(res, 200, {
            ok: true,
            project: config.project,
            sessions: Object.keys(transports).length,
          });
        case "POST /api/login": {
          const { token } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
          if (typeof token !== "string" || !hubToken(config) || !tokenMatches(config, token)) {
            return sendJson(res, 401, { error: "wrong token" });
          }
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": cookie(token, 60 * 60 * 24 * 30) });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        case "GET /favicon.ico": // the app ships its icon inline; answer other clients quietly
          res.writeHead(204);
          res.end();
          return;
        case "GET /":
        case "GET /ui": // the board's old address
          res.writeHead(302, { Location: path === "/ui" ? "/board" : "/chat" });
          res.end();
          return;
        case "GET /chat":
        case "GET /board":
        case "GET /guide":
        case "GET /settings":
          return sendText(res, 200, appHtml(), "text/html");
        case "GET /api/threads":
          return handleThreads(res);
        case "GET /api/state":
          return sendJson(res, 200, {
            project: config.project,
            hubUrl: hubUrl(config),
            projectRoot: config.projectRoot,
            language: config.language ?? null,
            agents: config.agents.map(describeAgent),
            tasks: store.listTasks(),
            context: store.listContext("*"),
            workers: dispatcher.status(),
          });
        case "GET /api/events":
          return handleEvents(req, res);
        case "GET /api/models":
          return handleModels(res);
        case "POST /api/models/probe":
          return handleProbeModel(req, res);
        case "POST /api/config/hub":
          return handleConfigHub(req, res);
        case "GET /api/billing":
          return claudeBilling().then((b) => sendJson(res, 200, { claude: b.value, plan: b.plan ?? null, apiKeyInEnv: b.apiKeyInEnv === true }));
        case "GET /api/limits":
          return sendJson(res, 200, {
            language: config.language ?? null,
            maxConcurrent: config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
            maxConcurrentTotal: config.maxConcurrentTotal ?? DEFAULT_MAX_CONCURRENT_TOTAL,
            folderGuard: config.folderGuard !== false,
            budget: hubBudget(),
            maxDepth: config.maxDepth ?? 6,
            watchdog: { ...WATCHDOG_DEFAULTS, ...config.watchdog },
            retention: { days: retentionDays },
          });
        case "POST /api/delegate":
          return handleDelegate(req, res);
        case "POST /api/context":
          return handleContext(req, res);
        case "POST /api/cancel":
          return handleCancel(req, res);
        case "GET /api/flows":
          return handleFlows(res);
        case "POST /api/flows/run":
          return handleRunFlow(req, res);
        case "POST /api/threads/delete":
          return handleDeleteThread(req, res);
        case "GET /api/folders":
          return handleFolders(res);
        case "POST /api/folders":
          return handleAddFolder(req, res);
        case "GET /api/browse":
          return handleBrowse(res, new URL(req.url ?? "/", "http://x").searchParams.get("path"));
        case "POST /api/config/agent":
          return handleConfigAgent(req, res);
        default:
          if (req.method === "GET" && path.startsWith("/api/logs/")) {
            return handleLogs(res, decodeURIComponent(path.slice("/api/logs/".length)));
          }
          // Deep links into a conversation (/chat/<task-id>) are client-side
          // routes; serve the app and let it read the path.
          if (req.method === "GET" && /^\/chat\/[A-Za-z0-9-]+$/.test(path)) {
            return sendText(res, 200, appHtml(), "text/html");
          }
          if (req.method === "GET" && path.startsWith("/api/role/")) {
            const who = config.agents.find((a) => a.name === decodeURIComponent(path.slice("/api/role/".length)));
            if (!who) return sendJson(res, 404, { error: "unknown agent" });
            const file = who.promptFile ? resolveRoleFile(config.projectRoot, who.promptFile) : undefined;
            if (!file) return sendJson(res, 200, { file: who.promptFile ?? null, text: null });
            return sendJson(res, 200, { file: who.promptFile, text: readFileSync(file, "utf8").slice(0, 20000) });
          }
          if (req.method === "GET" && path.startsWith("/api/thread/")) {
            return handleThread(res, decodeURIComponent(path.slice("/api/thread/".length)));
          }
          return sendText(res, 404, "Not found");
      }
    })();

    routed.catch((err: Error) => {
      if (!res.headersSent) {
        sendJson(res, err.message === "invalid JSON body" || err.message === "body too large" ? 400 : 500, {
          error: err.message,
        });
      } else {
        res.end();
      }
    });
  }

  return new Promise((resolvePromise) => {
    httpServer.listen(config.port, config.host, () => {
      // Work that was waiting in the old hub's queue launches now that we can take calls.
      for (const task of relaunch) void dispatcher.dispatch(task);
      resolvePromise({
        store,
        close: () =>
          new Promise<void>((done) => {
            watchdog.stop();
            dispatcher.shutdown();
            clearInterval(pruneTimer);
            clearInterval(budgetTimer);
            clearInterval(sessionSweep);
            for (const sid of Object.keys(transports)) closeSession(sid);
            for (const res of sseClients) res.end();
            sseClients.clear();
            httpServer.close(() => done());
            httpServer.closeAllConnections?.();
          }),
      });
    });
  });
}

/**
 * What a restart leaves behind, and what to do with it:
 * - a flow's runner lived in the old process, so a flow still "running" can
 *   never advance — fail it (and stop its unfinished stages) with the reason;
 * - tasks that were queued (pending, never launched) come back as a list to
 *   dispatch again once the hub listens — otherwise nobody would ever run them.
 * Work that had a worker is left to the watchdog: that worker may still report.
 */
export function recoverAfterRestart(config: BridgeConfig, store: Store): Task[] {
  const relaunch: Task[] = [];
  const reason = isVietnamese(config.language)
    ? "hub đã khởi động lại khi quy trình này đang chạy; hãy chạy lại"
    : "the hub restarted while this flow was running; run it again";
  for (const t of store.listTasks()) {
    if (isTerminal(t.status)) continue;
    if (t.to.startsWith("flow:")) {
      for (const child of store.listTasks()) {
        if (child.parentId === t.id && !isTerminal(child.status) && !child.dispatchedAt) {
          store.updateTask(child.id, { status: "cancelled", result: reason });
        }
      }
      store.updateTask(t.id, { status: "failed", result: reason });
      store.addMessage({ taskId: t.id, from: "hub", kind: "system", text: reason, meta: { hubRestarted: true } });
      continue;
    }
    const agent = config.agents.find((a) => a.name === t.to);
    if (t.status === "pending" && !t.dispatchedAt && agent && agent.spawnable !== false) relaunch.push(t);
  }
  return relaunch;
}

