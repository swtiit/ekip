import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { BridgeConfig } from "./config.js";
import { hubUrl, stateFilePath } from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { buildHub } from "./hub.js";
import { Store } from "./store.js";
import { dashboardHtml } from "./ui.js";
import { Watchdog } from "./watchdog.js";

export interface RunningHub {
  store: Store;
  close: () => Promise<void>;
}

/**
 * Boots the Streamable HTTP MCP endpoint. All agent sessions share one Store
 * and Dispatcher (so delegation and context are common), but each MCP session
 * gets its own server+transport pair as the SDK requires.
 */
export function startServer(config: BridgeConfig): Promise<RunningHub> {
  const store = new Store(stateFilePath(config));
  const dispatcher = new Dispatcher(config);
  const watchdog = new Watchdog(config, store);
  watchdog.start();

  const app = express();
  app.use(express.json({ limit: "8mb" }));

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      if (sessionId || !isInitializeRequest(req.body)) {
        res.status(400).json({
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

    await transport.handleRequest(req, res, req.body);
  });

  // GET (SSE stream) and DELETE (session teardown) reuse the same transport.
  const bySession = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) {
      res.status(400).send("Unknown or missing session id");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", bySession);
  app.delete("/mcp", bySession);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, project: config.project, sessions: Object.keys(transports).length });
  });

  // ---- Dashboard + observation API (same-process view onto the store) ----

  app.get("/", (_req, res) => res.redirect("/ui"));
  app.get("/ui", (_req, res) => {
    res.type("html").send(dashboardHtml());
  });

  app.get("/api/state", (_req, res) => {
    res.json({
      project: config.project,
      hubUrl: hubUrl(config),
      agents: config.agents.map((a) => ({
        name: a.name,
        adapter: a.adapter,
        spawnable: a.spawnable !== false,
      })),
      tasks: store.listTasks(),
      context: store.listContext(),
    });
  });

  // SSE change feed: one `data:` line per store mutation, plus keep-alives.
  const sseClients = new Set<express.Response>();
  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write("retry: 2000\n\n");
    const onChange = (event: unknown) => {
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
  });

  // Human-in-the-loop endpoints: the dashboard user acts as one more peer
  // ("human" by default), going through the exact same store + dispatcher
  // path as bridge_delegate / bridge_context_set.
  app.post("/api/delegate", async (req, res) => {
    const { to, prompt, title, from } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof to !== "string" || !to || typeof prompt !== "string" || !prompt) {
      res.status(400).json({ error: "`to` and `prompt` are required" });
      return;
    }
    if (!config.agents.some((a) => a.name === to)) {
      res.status(400).json({
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
    res.json({ task: store.getTask(task.id), dispatch: outcome });
  });

  app.post("/api/context", (req, res) => {
    const { key, value, by } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof key !== "string" || !key) {
      res.status(400).json({ error: "`key` is required" });
      return;
    }
    res.json({ entry: store.setContext(key, value, typeof by === "string" && by ? by : "human") });
  });

  app.get("/api/logs/:taskId", (req, res) => {
    const { taskId } = req.params;
    if (!/^[A-Za-z0-9-]{1,64}$/.test(taskId)) {
      res.status(400).type("text/plain").send("Invalid task id.");
      return;
    }
    const dir = join(config.projectRoot, ".agent-bridge", "logs");
    const file = existsSync(dir)
      ? readdirSync(dir).find((f) => f.endsWith(`-${taskId}.log`))
      : undefined;
    if (!file) {
      res.status(404).type("text/plain").send("No log for this task.");
      return;
    }
    const buf = readFileSync(join(dir, file));
    const tail = buf.length > 32_768 ? buf.subarray(buf.length - 32_768) : buf;
    res.type("text/plain").send(tail.toString("utf8"));
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(config.port, config.host, () => {
      resolve({
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
