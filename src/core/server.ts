import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { BridgeConfig } from "./config.js";
import { CONFIG_FILENAME, getAgentFlag, hubUrl, setAgentFlag, stateFilePath } from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { buildHub } from "./hub.js";
import { Store } from "./store.js";
import { dashboardHtml } from "./ui.js";
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
  const dispatcher = new Dispatcher(config);
  const watchdog = new Watchdog(config, store);
  watchdog.start();

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
    const { to, prompt, title, from } = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
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
    const task = store.createTask({
      from: typeof from === "string" && from ? from : "human",
      to,
      title: typeof title === "string" && title ? title : prompt.slice(0, 60),
      prompt,
      depth: 1,
    });
    const outcome = await dispatcher.dispatch(task);
    sendJson(res, 200, { task: store.getTask(task.id), dispatch: outcome });
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

  // Known Claude model names plus live `agy models` output, cached briefly.
  const CLAUDE_MODELS = [
    "fable",
    "opus",
    "sonnet",
    "haiku",
    "claude-fable-5",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
  ];
  let agyModelsCache: { at: number; models: string[] } | undefined;
  function agyModels(): Promise<string[]> {
    if (agyModelsCache && Date.now() - agyModelsCache.at < 600_000) {
      return Promise.resolve(agyModelsCache.models);
    }
    return new Promise((resolveModels) => {
      execFile("agy", ["models"], { timeout: 10_000 }, (err, stdout) => {
        const models = err
          ? []
          : stdout
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
        agyModelsCache = { at: Date.now(), models };
        resolveModels(models);
      });
    });
  }

  async function handleModels(res: ServerResponse): Promise<void> {
    sendJson(res, 200, { claude: CLAUDE_MODELS, antigravity: await agyModels() });
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

    // Persist to the project's config file, touching only this agent's entry.
    try {
      const path = join(config.projectRoot, CONFIG_FILENAME);
      const raw = JSON.parse(readFileSync(path, "utf8")) as { agents?: Array<Record<string, unknown>> };
      const entry = raw.agents?.find((a) => a.name === agent.name);
      if (entry) {
        entry.args = agent.args;
        entry.spawnable = agent.spawnable;
        writeFileSync(path, JSON.stringify(raw, null, 2) + "\n");
      }
    } catch {
      // In-memory config still applied; a missing/hand-broken file shouldn't 500.
    }
    store.emit("change", { kind: "config", agent: agent.name });
    sendJson(res, 200, { agent: describeAgent(agent) });
  }

  const describeAgent = (a: BridgeConfig["agents"][number]) => ({
    name: a.name,
    adapter: a.adapter,
    spawnable: a.spawnable !== false,
    model: getAgentFlag(a, "--model") ?? null,
    effort: getAgentFlag(a, "--effort") ?? null,
    promptFile: a.promptFile ?? null,
  });

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
          res.writeHead(302, { Location: "/ui" });
          res.end();
          return;
        case "GET /ui":
          return sendText(res, 200, dashboardHtml(), "text/html");
        case "GET /api/state":
          return sendJson(res, 200, {
            project: config.project,
            hubUrl: hubUrl(config),
            agents: config.agents.map(describeAgent),
            tasks: store.listTasks(),
            context: store.listContext(),
          });
        case "GET /api/events":
          return handleEvents(req, res);
        case "GET /api/models":
          return handleModels(res);
        case "POST /api/delegate":
          return handleDelegate(req, res);
        case "POST /api/context":
          return handleContext(req, res);
        case "POST /api/config/agent":
          return handleConfigAgent(req, res);
        default:
          if (req.method === "GET" && path.startsWith("/api/logs/")) {
            return handleLogs(res, decodeURIComponent(path.slice("/api/logs/".length)));
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
            for (const res of sseClients) res.end();
            sseClients.clear();
            httpServer.close(() => done());
            httpServer.closeAllConnections?.();
          }),
      });
    });
  });
}
