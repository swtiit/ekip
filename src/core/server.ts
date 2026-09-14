import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { BridgeConfig } from "./config.js";
import {
  CONFIG_FILENAME,
  DEFAULT_MAX_CONCURRENT,
  RETENTION_DEFAULTS,
  WATCHDOG_DEFAULTS,
  getAgentFlag,
  hubUrl,
  resolveRoleFile,
  setAgentFlag,
  stateFilePath,
} from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { buildHub } from "./hub.js";
import { removeSpawnLog } from "./logs.js";
import { catalogFor } from "./models.js";
import { Store } from "./store.js";
import { appHtml } from "./app.js";
import { Watchdog } from "./watchdog.js";

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
  const store = new Store(stateFilePath(config));
  const dispatcher = new Dispatcher(config, store);
  const watchdog = new Watchdog(config, store, (taskId) => dispatcher.kill(taskId));
  watchdog.start();

  // A hub restart loses process handles: whatever was running is unknowable
  // now. Drop stale pids so the dashboard doesn't show ghosts; the watchdog
  // still reaps those tasks by TTL if their workers never report back.
  for (const t of store.listTasks()) if (t.pid !== undefined) store.updateTask(t.id, { pid: undefined });

  // Retention: finished tasks older than N days go, with their spawn logs.
  const retentionDays = config.retention?.days ?? RETENTION_DEFAULTS.days;
  const prune = (): void => {
    if (!retentionDays || retentionDays <= 0) return;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    for (const t of store.prune(cutoff)) removeSpawnLog(config.projectRoot, t.to, t.id);
  };
  prune();
  const pruneTimer = setInterval(prune, 3_600_000);
  pruneTimer.unref();

  const transports: Record<string, StreamableHTTPServerTransport> = {};
  const sseClients = new Set<ServerResponse>();

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports[sessionId] : undefined;

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (!transport) {
        if (sessionId || !isInitializeRequest(body)) {
          sendJson(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "No valid session; send an initialize request first." },
            id: null,
          });
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport!;
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) delete transports[transport!.sessionId];
        };
        const server = buildHub(config, store, dispatcher);
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
    sseClients.add(res);
    req.on("close", () => {
      clearInterval(ping);
      store.off("change", onChange);
      sseClients.delete(res);
    });
  }

  async function handleDelegate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { to, prompt, title, from, parent_task_id } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
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
    const task = store.createTask({
      from: sender,
      to,
      title: typeof title === "string" && title ? title : prompt.slice(0, 60),
      prompt,
      depth: (parent?.depth ?? 0) + 1,
      parentId: parent?.id,
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
    const { key, value, by } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
    if (typeof key !== "string" || !key) {
      sendJson(res, 400, { error: "`key` is required" });
      return;
    }
    sendJson(res, 200, {
      entry: store.setContext(key, value, typeof by === "string" && by ? by : "human"),
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

  /** Hub-wide settings the UI can change: language for now. */
  async function handleConfigHub(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
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
    sendJson(res, 200, { language: config.language ?? null });
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

  function handleThreads(res: ServerResponse): void {
    sendJson(res, 200, {
      threads: store.listThreads().map(({ task, messages, lastAt }) => ({
        id: task.id,
        title: task.title,
        status: task.status,
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
    sendJson(res, 200, { thread: threadId, tasks: family, messages: store.listMessages(threadId) });
  }

  function handleLogs(res: ServerResponse, taskId: string): void {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(taskId)) {
      sendText(res, 400, "Invalid task id.");
      return;
    }
    const dir = join(config.projectRoot, ".ekip", "logs");
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
    const path = (req.url ?? "/").split("?")[0];
    const route = `${req.method} ${path}`;

    const routed = (async (): Promise<void> => {
      if (path === "/mcp") return handleMcp(req, res);
      switch (route) {
        case "GET /health":
          return sendJson(res, 200, {
            ok: true,
            project: config.project,
            sessions: Object.keys(transports).length,
          });
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
            language: config.language ?? null,
            agents: config.agents.map(describeAgent),
            tasks: store.listTasks(),
            context: store.listContext(),
            workers: dispatcher.status(),
          });
        case "GET /api/events":
          return handleEvents(req, res);
        case "GET /api/models":
          return handleModels(res);
        case "POST /api/config/hub":
          return handleConfigHub(req, res);
        case "GET /api/limits":
          return sendJson(res, 200, {
            language: config.language ?? null,
            maxConcurrent: config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
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
  });

  return new Promise((resolvePromise) => {
    httpServer.listen(config.port, config.host, () => {
      resolvePromise({
        store,
        close: () =>
          new Promise<void>((done) => {
            watchdog.stop();
            clearInterval(pruneTimer);
            for (const res of sseClients) res.end();
            sseClients.clear();
            httpServer.close(() => done());
            httpServer.closeAllConnections?.();
          }),
      });
    });
  });
}
