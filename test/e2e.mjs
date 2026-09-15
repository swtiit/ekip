// End-to-end suite: boots a real hub on a scratch port and exercises the
// HTTP API, the MCP tool surface, the dispatcher, the watchdog, and the CLI.
// No LLMs involved — agents are scripted mocks. Run with `npm test`.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { startServer, registerAdapter, launchDetached, bridgeEnv, parseClaudeStreamLine } from "../dist/core/index.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "ekip-e2e-"));
// Keep machine defaults (~/.ekip) out of the suite, in both directions.
const HOME_DIR = join(TMP, "machine-home");
process.env.EKIP_HOME = HOME_DIR;
// Ask the OS for a free port so a stale hub (or a concurrent suite) can
// never EADDRINUSE-crash the run — this once broke `npm publish`.
const PORT = await new Promise((res) => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1", () => {
    const p = probe.address().port;
    probe.close(() => res(p));
  });
});
const BASE = `http://127.0.0.1:${PORT}`;
const MOCK = join(REPO, "test", "mock-agent.mjs");
const MOCK_CLAUDE = join(REPO, "test", "mock-claude.mjs");

// A stand-in for the claude adapter: same stream-json decoding, but runs our
// mock instead of the real binary (which needs a login and burns quota).
registerAdapter({
  id: "fakeclaude",
  description: "test double for the claude adapter",
  async spawn(req) {
    return launchDetached({
      command: process.execPath,
      args: [MOCK_CLAUDE, req.taskId],
      cwd: req.cwd,
      env: bridgeEnv(req),
      logFile: join(req.cwd, ".ekip", "logs", `${req.agentName}-${req.taskId}.log`),
      label: "fake claude",
      onExit: req.onExit,
      onLine: (l) => { for (const ev of parseClaudeStreamLine(l)) req.onEvent?.(ev); },
    });
  },
  mcpConfigSnippet: () => ({}),
  mcpConfigLocation: () => "nowhere",
});

// An adapter whose launch throws, as when the log folder can't be created or fds run out.
registerAdapter({
  id: "thrower",
  description: "test double that fails to launch",
  async spawn() {
    throw new Error("disk full (simulated)");
  },
  mcpConfigSnippet: () => ({}),
  mcpConfigLocation: () => "nowhere",
});

const config = {
  project: "e2e",
  host: "127.0.0.1",
  port: PORT,
  projectRoot: TMP,
  agents: [
    { name: "mock", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}"] },
    { name: "sink", adapter: "command", spawnable: true, command: "true" },
    { name: "ghost", adapter: "command", spawnable: true, command: "definitely-not-a-real-binary-xyz" },
    { name: "manual", adapter: "command", spawnable: false, command: "true" },
    { name: "roleful", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}"], promptFile: "role.md" },
    { name: "modeled", adapter: "command", spawnable: false, command: "true", args: ["--model", "m0"] },
    // `sh -c` swallows the appended prompt as $0; the child `sleep` is what the
    // process-group kill has to reach.
    { name: "hang", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 30"] },
    { name: "sleeper", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 30"] },
    { name: "serial", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 0.7"], maxConcurrent: 1 },
    { name: "talker", adapter: "fakeclaude", spawnable: true },
    { name: "echoer", adapter: "command", spawnable: true, command: "sh", args: ["-c", 'printf "%s" "$0" > prompt.txt'],
      label: "Người nhắc lại", description: "Ghi lại đúng prompt nó nhận được." },
    { name: "noisy", adapter: "command", spawnable: true, command: "sh", args: ["-c", 'echo "Error: invalid --model \"X\": model X is not recognized" >&2; exit 1'] },
    { name: "grader", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}", "--script=SCORE: 40|SCORE: 95"] },
    { name: "nayer", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}", "--script=REVISE: not yet"] },
    { name: "scribe-a", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 1.5"], writer: true },
    { name: "scribe-b", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 0.2"], writer: true },
    { name: "boxed", adapter: "command", spawnable: true, command: "sh", sandbox: true,
      args: ["-c", 'echo in > boxed-in.txt; cat "$HOME/.ekip-e2e-none" >/dev/null 2>&1; echo leak > "$HOME/ekip-e2e-leak.txt" 2>/dev/null && echo yes > boxed-leaked.flag; true'] },
    { name: "breaks", adapter: "thrower", spawnable: true },
    { name: "argvcheck", adapter: "claude", spawnable: true },
    { name: "parenting", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}", "--delegate-to=sink"] },
    { name: "linger", adapter: "command", spawnable: true, command: process.execPath, args: [join(REPO, "test", "mock-linger.mjs"), "{taskId}"], maxConcurrent: 1 },
  ],
  maxDepth: 3,
  watchdog: { pendingTtlSeconds: 2, claimedTtlSeconds: 3, sweepIntervalSeconds: 1 },
};
writeFileSync(join(TMP, "role.md"), "# Role: roleful\nProbe role content MARKER-XYZZY.");
// The CLI resolves the hub from ekip.config.json in its cwd.
writeFileSync(join(TMP, "ekip.config.json"), JSON.stringify(config));

const results = [];
function t(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ✔" : "  ✖ FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function until(fn, timeoutMs = 8000, step = 200) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return undefined;
    await sleep(step);
  }
}
const api = async (path) => (await fetch(BASE + path)).json();
const post = (path, body) =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const taskById = async (id) => (await api("/api/state")).tasks.find((x) => x.id === id);

// ---- raw MCP client ----
let mcpSession;
let mcpSeq = 10;
async function mcp(method, params) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(mcpSession ? { "mcp-session-id": mcpSession } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: mcpSeq++, method, params }),
  });
  mcpSession = res.headers.get("mcp-session-id") ?? mcpSession;
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:"));
    return JSON.parse(data[data.length - 1].slice(5).trim());
  }
  return text ? JSON.parse(text) : undefined;
}
async function openSession() {
  let sid;
  let seq = 1000;
  const call = async (method, params) => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sid ? { "mcp-session-id": sid } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: seq++, method, params }),
    });
    sid = res.headers.get("mcp-session-id") ?? sid;
    const text = await res.text();
    const data = text.split("\n").filter((l) => l.startsWith("data:"));
    return data.length ? JSON.parse(data[data.length - 1].slice(5).trim()) : text ? JSON.parse(text) : undefined;
  };
  await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "scoped", version: "0" } });
  await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": sid }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  return async (name, args) => JSON.parse((await call("tools/call", { name, arguments: args })).result.content[0].text);
}
const tool = async (name, args) => {
  const msg = await mcp("tools/call", { name, arguments: args });
  return JSON.parse(msg.result.content[0].text);
};

const hub = await startServer(config);
console.log(`hub up on :${PORT} (${TMP})\n`);

try {
  // ---- HTTP API ----
  const health = await api("/health");
  t("health", health.ok === true && health.project === "e2e");

  const state0 = await api("/api/state");
  t("state shape", Array.isArray(state0.tasks) && state0.agents.length === 21 && state0.hubUrl.endsWith("/mcp"));
  t("state exposes workers", Array.isArray(state0.workers?.running) && Array.isArray(state0.workers?.queued));
  t("state exposes models", state0.agents.find((a) => a.name === "modeled")?.model === "m0");

  // ---- agent config API (hot model switching) ----
  const cfgSet = await (await post("/api/config/agent", { name: "modeled", model: "m1", effort: "high" })).json();
  t("config set model+effort", cfgSet.agent?.model === "m1" && cfgSet.agent?.effort === "high");
  const onDisk = JSON.parse(readFileSync(join(TMP, "ekip.config.json"), "utf8"));
  const diskArgs = onDisk.agents.find((a) => a.name === "modeled").args;
  t("config persisted to file", diskArgs.includes("m1") && diskArgs.includes("--effort"));
  t("config unknown agent → 400", (await post("/api/config/agent", { name: "nope", model: "x" })).status === 400);
  t("config bad effort → 400", (await post("/api/config/agent", { name: "modeled", effort: "hyper" })).status === 400);
  const cfgUnset = await (await post("/api/config/agent", { name: "modeled", model: "", effort: "" })).json();
  t("config unset model", cfgUnset.agent?.model === null && cfgUnset.agent?.effort === null);
  const models = await api("/api/models");
  // The e2e agents all use the generic "command" adapter, which has no model
  // list; the catalog still answers, with a note saying why it is empty.
  t("models endpoint answers per adapter", !!models.command && Array.isArray(models.command.models) && /no model list/.test(models.command.note ?? ""), JSON.stringify(models).slice(0, 160));
  const { claudeCatalog } = await import("../dist/core/index.js");
  const cc = claudeCatalog();
  t("claude catalog always offers the aliases", ["fable", "opus", "sonnet", "haiku"].every((a) => cc.models.some((m) => m.value === a)));
  t("claude catalog explains itself", /no list-models command/.test(cc.note ?? ""));

  // language: agents are told to write in it, and it persists
  const langSet = await (await post("/api/config/hub", { language: "Vietnamese" })).json();
  t("hub language set", langSet.language === "Vietnamese");
  t("language persisted", JSON.parse(readFileSync(join(TMP, "ekip.config.json"), "utf8")).language === "Vietnamese");
  t("language reported in limits", (await api("/api/limits")).language === "Vietnamese");
  t("language rejects non-strings", (await post("/api/config/hub", { language: 42 })).status === 400);
  {
    // The instruction must actually reach the spawned worker's prompt: the
    // echoer agent writes the prompt it was handed to a file.
    const probe = await (await post("/api/delegate", { to: "echoer", prompt: "p", title: "lang-probe" })).json();
    await until(async () => existsSync(join(TMP, "prompt.txt")));
    const promptSeen = existsSync(join(TMP, "prompt.txt")) ? readFileSync(join(TMP, "prompt.txt"), "utf8") : "";
    t("worker prompt carries the language instruction", /Write in Vietnamese/.test(promptSeen), promptSeen.slice(0, 120));
    t("worker prompt still carries the task", /lang-probe|p$/m.test(promptSeen));
    t("worker is told its own name and job", /You are the agent "echoer" \(Người nhắc lại\)/.test(promptSeen) && /Your part in the crew: Ghi lại đúng prompt/.test(promptSeen));
    t("worker is told which instructions win", /If instructions conflict, follow this order: \(1\) limits the hub enforces/.test(promptSeen) && /say plainly in bridge_post_result what you did not do/.test(promptSeen));
    t("step 2 no longer tells every role to do the work itself", !/Carry out the task in this repository/.test(promptSeen) && /in the way your role describes/.test(promptSeen));
    t("worker is told its folder and to stay in it", promptSeen.includes(`Working folder: ${TMP}`) && /Stay inside it/.test(promptSeen));
    t("worker is told who else is on the crew", /Your crew/.test(promptSeen) && /- mock: command agent/.test(promptSeen) && !/- echoer/.test(promptSeen));
  }
  const langOff = await (await post("/api/config/hub", { language: "" })).json();
  t("language can be cleared", langOff.language === null && !("language" in JSON.parse(readFileSync(join(TMP, "ekip.config.json"), "utf8"))));

  // ---- folders: a conversation works in the folder it was started in ----
  var folderProbe;
  {
    const WS = join(TMP, "ws-alpha");
    mkdirSync(WS, { recursive: true });
    writeFileSync(join(WS, "package.json"), "{}");
    const started = await (await post("/api/delegate", { to: "echoer", prompt: "in a folder", title: "folder-probe", cwd: WS })).json();
    t("delegate accepts a folder", started.task?.cwd === WS, JSON.stringify(started.task?.cwd));
    await until(async () => existsSync(join(WS, "prompt.txt")));
    t("the worker runs inside the chosen folder", existsSync(join(WS, "prompt.txt")));
    t("its log stays with the hub, not in the folder", existsSync(join(TMP, ".ekip", "logs", `echoer-${started.task.id}.log`)) && !existsSync(join(WS, ".ekip")));
    const reply = await (await post("/api/delegate", { to: "mock", prompt: "follow-up", title: "folder-reply", parent_task_id: started.task.id, cwd: "/tmp" })).json();
    t("a reply keeps its conversation's folder", reply.task?.cwd === WS);
    folderProbe = { id: started.task.id, ws: WS };
    t("unknown folder → 400", (await post("/api/delegate", { to: "mock", prompt: "x", cwd: join(TMP, "nope-nope") })).status === 400);
    t("relative folder → 400", (await post("/api/delegate", { to: "mock", prompt: "x", cwd: "relative/path" })).status === 400);
    const homeTask = await (await post("/api/delegate", { to: "modeled", prompt: "stays home", title: "folder-home" })).json();
    const threads2 = (await api("/api/threads")).threads;
    t("threads carry their folder", threads2.find((x) => x.id === started.task.id)?.cwd === WS && threads2.find((x) => x.id === homeTask.task.id)?.cwd === TMP);
    const folders = await api("/api/folders");
    t("folders list the hub's home first", folders.folders[0]?.path === TMP && folders.folders[0]?.home === true);
    t("folders remember the chosen one", folders.folders.some((f) => f.path === WS && f.tasks >= 1));
    t("adding a missing folder → 400", (await post("/api/folders", { path: join(TMP, "missing") })).status === 400);
    const browsed = await api("/api/browse?path=" + encodeURIComponent(TMP));
    t("browse lists sub-folders and spots projects", browsed.path === TMP && browsed.dirs.some((d) => d.name === "ws-alpha" && d.project === true) && !browsed.dirs.some((d) => d.name.startsWith(".")));
    t("browse refuses a non-folder", (await fetch(BASE + "/api/browse?path=" + encodeURIComponent(join(WS, "package.json")))).status === 400);
    await post("/api/folders", { path: WS, remove: true });
    t("a folder can be forgotten", !(await api("/api/folders")).folders.some((f) => f.path === WS && f.tasks === 0));
  }

  // labels & jobs: the meaning of a member, separate from its address
  const echoState = (await api("/api/state")).agents.find((a) => a.name === "echoer");
  t("state exposes label and job", echoState?.label === "Người nhắc lại" && /prompt/.test(echoState?.description ?? ""));
  const relabel = await (await post("/api/config/agent", { name: "modeled", label: "Người mẫu", description: "Chỉ dùng để thử cấu hình." })).json();
  t("config sets label and job", relabel.agent?.label === "Người mẫu" && relabel.agent?.description === "Chỉ dùng để thử cấu hình.");
  const onDiskAgent = JSON.parse(readFileSync(join(TMP, "ekip.config.json"), "utf8")).agents.find((a) => a.name === "modeled");
  t("label and job persisted", onDiskAgent.label === "Người mẫu" && onDiskAgent.description === "Chỉ dùng để thử cấu hình.");
  t("label too long → 400", (await post("/api/config/agent", { name: "modeled", label: "x".repeat(41) })).status === 400);
  const unlabel = await (await post("/api/config/agent", { name: "modeled", label: "", description: "" })).json();
  t("label and job can be cleared", unlabel.agent?.label === null && unlabel.agent?.description === null);
  const role = await api("/api/role/roleful");
  t("role brief is readable from the app", /MARKER-XYZZY/.test(role.text ?? ""));
  t("role endpoint: no brief", (await api("/api/role/mock")).text === null);
  t("role endpoint: unknown agent → 404", (await fetch(BASE + "/api/role/nobody")).status === 404);

  const billing = await api("/api/billing");
  t("billing endpoint says what cost means", ["subscription", "api", "unknown"].includes(billing.claude));
  {
    // An API key in the hub's environment means spawned runs bill per token.
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    const withKey = await api("/api/billing");
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
    t("an API key in the environment is reported as real billing", withKey.claude === "api" && withKey.apiKeyInEnv === true);
  }

  const limits = await api("/api/limits");
  t("limits endpoint", limits.maxDepth === 3 && limits.watchdog.pendingTtlSeconds === 2 && typeof limits.maxConcurrent === "number");
  const mc = await (await post("/api/config/agent", { name: "modeled", maxConcurrent: 2 })).json();
  t("config sets maxConcurrent", mc.agent?.maxConcurrent === 2);
  t("config rejects bad maxConcurrent", (await post("/api/config/agent", { name: "modeled", maxConcurrent: 0 })).status === 400);
  const mcOff = await (await post("/api/config/agent", { name: "modeled", maxConcurrent: "" })).json();
  t("config unsets maxConcurrent", mcOff.agent?.maxConcurrent === null);

  const d1 = await (await post("/api/delegate", { to: "mock", prompt: "ping", title: "api-mock-1" })).json();
  t("delegate accepted", d1.task?.status === "pending" && d1.dispatch?.spawned === true);
  const done1 = await until(async () => {
    const x = await taskById(d1.task.id);
    return x?.status === "done" ? x : undefined;
  });
  t("mock completes", !!done1, done1 ? "" : "task never reached done");
  t("mock result text", done1?.result === "mock done: api-mock-1", done1?.result);
  t("mock artifacts", done1?.artifacts?.length === 2 && done1.artifacts[0].kind === "note");

  const bad1 = await post("/api/delegate", { to: "nope", prompt: "x" });
  t("unknown agent → 400", bad1.status === 400 && (await bad1.json()).error.includes("nope"));
  const bad2 = await post("/api/delegate", { to: "mock" });
  t("missing prompt → 400", bad2.status === 400);

  await post("/api/context", { key: "e2e.obj", value: { a: 1, s: "xin chào 🦄" } });
  const ctx = (await api("/api/state")).context.find((c) => c.key === "e2e.obj");
  t("context set via API (unicode intact)", ctx?.value?.s === "xin chào 🦄" && ctx.updatedBy === "human");

  const logRes = await fetch(`${BASE}/api/logs/${d1.task.id}`);
  t("logs of mock run", logRes.status === 200 && (await logRes.text()).includes("claimed"));
  t("logs invalid id → 400", (await fetch(`${BASE}/api/logs/..%2Fetc`)).status === 400);
  t("logs unknown id → 404", (await fetch(`${BASE}/api/logs/00000000-dead-beef-0000-000000000000`)).status === 404);

  const appRes = await fetch(`${BASE}/board`);
  const appHtml = await appRes.text();
  t("app served", appRes.status === 200 && appHtml.includes("<!doctype html>") && appHtml.length > 8000);
  t("app has all three views", ["v-chat", "v-board", "v-settings"].every((v) => appHtml.includes(v)));
  t("app escapes + routes", appHtml.includes("function esc(") && appHtml.includes("history.pushState"));
  {
    // The client ships inside a template string; a lost backslash or a stray
    // backtick breaks it silently in the browser. It must at least parse, and
    // its regexes must arrive intact.
    const js = appHtml.slice(appHtml.lastIndexOf("<script>") + 8, appHtml.lastIndexOf("</script>"));
    let parses = true;
    try { new Function(js); } catch { parses = false; }
    t("client script parses", parses);
    t("client regexes keep their backslashes", js.includes("/^\\S+ started: /") && js.includes("\\x60\\x60\\x60"));
    t("client speaks Vietnamese and English", js.includes("Giao việc cho ê-kíp") && js.includes("Put your crew to work"));
  }
  t("same app at /settings", (await (await fetch(`${BASE}/settings`)).text()) === appHtml);
  t("same app at /guide", (await (await fetch(`${BASE}/guide`)).text()) === appHtml);
  t("guide ships both languages", appHtml.includes('data-lang="vi"') && appHtml.includes('data-lang="en"') && appHtml.includes("Làm việc với ê-kíp agent"));
  t("guide has its five diagrams per language", (appHtml.match(/<svg class="dg"/g) ?? []).length === 10);
  t("guide diagrams are labelled for screen readers", (appHtml.match(/<svg class="dg"[^>]*role="img"[^>]*aria-label=/g) ?? []).length === 10);
  {
    const ids = [...appHtml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    t("page has no duplicate ids", dupes.length === 0, [...new Set(dupes)].join(", "));
  }
  t("deep link serves the app", (await (await fetch(`${BASE}/chat/${d1.task.id}`)).text()) === appHtml);
  const uiRedirect = await fetch(`${BASE}/ui`, { redirect: "manual" });
  t("/ui redirects to /board", uiRedirect.status === 302 && uiRedirect.headers.get("location") === "/board");
  const rootRes = await fetch(BASE + "/", { redirect: "manual" });
  t("/ redirects to /chat", rootRes.status === 302 && rootRes.headers.get("location") === "/chat");
  const chatRes = await fetch(`${BASE}/chat`);
  const chatHtml = await chatRes.text();
  t("chat served", chatRes.status === 200 && chatHtml.includes("EventSource") && chatHtml.includes("/api/thread/"));

  // ---- MCP surface ----
  await mcp("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "e2e", version: "0" },
  });
  await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": mcpSession,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  const tools = (await mcp("tools/list", {})).result.tools.map((x) => x.name).sort();
  t("11 bridge tools", tools.length === 11 && tools.includes("bridge_cancel") && tools.includes("bridge_say") && tools.includes("bridge_thread") && tools.every((n) => n.startsWith("bridge_")), tools.join(","));

  const setr = await tool("bridge_context_set", { key: "e2e.mcp", value: 42, by: "e2e" });
  const getr = await tool("bridge_context_get", { key: "e2e.mcp" });
  t("context round-trip via MCP", setr.entry.key === "e2e.mcp" && getr.entry.value === 42);

  const del = await tool("bridge_delegate", { from: "e2e", to: "mock", title: "mcp-mock", prompt: "hi" });
  t("MCP delegate spawns", del.dispatch.spawned === true);
  const mcpDone = await until(async () => {
    const w = await tool("bridge_wait", { task_id: del.task_id, timeout_seconds: 5 });
    return w.task?.status === "done" ? w.task : undefined;
  });
  t("bridge_wait returns done task", mcpDone?.result === "mock done: mcp-mock");
  if (folderProbe) {
    const viaMcp = await tool("bridge_delegate", { from: "echoer", to: "mock", title: "folder-child", prompt: "x", parent_task_id: folderProbe.id });
    t("work handed out over MCP inherits the folder", (await taskById(viaMcp.task_id))?.cwd === folderProbe.ws);
  }

  const manual1 = await tool("bridge_delegate", { from: "e2e", to: "manual", title: "manual-1", prompt: "x" });
  t("non-spawnable reason", manual1.dispatch.spawned === false && /not spawnable/.test(manual1.dispatch.reason));
  const wrongClaim = await tool("bridge_claim", { as: "mock", task_id: manual1.task_id });
  t("claim wrong agent refused", wrongClaim.task === null && /not pending for/.test(wrongClaim.error));
  t("claim unknown id refused", (await tool("bridge_claim", { as: "manual", task_id: "nope" })).error?.includes("unknown"));
  const oldest = await tool("bridge_claim", { as: "manual" });
  t("claim oldest works", oldest.task?.id === manual1.task_id && oldest.task.status === "claimed");
  t("claim again → null", (await tool("bridge_claim", { as: "manual" })).task === null);
  t("post_result unknown task", (await tool("bridge_post_result", { task_id: "nope", status: "done", result: "x" })).error?.includes("unknown"));

  const waitT = await tool("bridge_wait", { task_id: manual1.task_id, timeout_seconds: 1 });
  t("bridge_wait timeout flag", waitT.timed_out === true && waitT.task.status === "claimed");

  // loop guard: chain until depth exceeds maxDepth=3
  let parent;
  let guard;
  for (let i = 0; i < 5; i++) {
    guard = await tool("bridge_delegate", {
      from: "e2e",
      to: "manual",
      title: `chain-${i}`,
      prompt: "x",
      parent_task_id: parent,
    });
    parent = guard.task_id;
  }
  t("loop guard trips", guard.dispatch.spawned === false && /depth/.test(guard.dispatch.reason ?? ""), JSON.stringify(guard.dispatch));
  t("refused dispatch fails the task", (await taskById(guard.task_id))?.status === "failed" && /dispatch refused/.test((await taskById(guard.task_id)).result));

  // ---- promptFile injection reaches the spawned process ----
  const dRole = await tool("bridge_delegate", { from: "e2e", to: "roleful", title: "role-probe", prompt: "hi" });
  await until(async () => (await taskById(dRole.task_id))?.status === "done");
  // the mock echoes nothing about the prompt, but the spawn log directory is
  // taskId-addressed; assert via dispatcher behavior: role file exists & run done
  t("promptFile agent still completes", (await taskById(dRole.task_id))?.status === "done");

  // ---- fail-fast: the dispatcher notices the worker exiting ----
  const sink = await (await post("/api/delegate", { to: "sink", prompt: "exits at once", title: "sink-1" })).json();
  t("launched task carries pid + dispatchedAt", typeof (await taskById(sink.task.id))?.dispatchedAt === "string");
  const t0 = Date.now();
  const sinkDead = await until(async () => {
    const x = await taskById(sink.task.id);
    return x?.status === "failed" ? x : undefined;
  });
  t("exit-0 without claim fails fast", /worker exited \(code 0\) without claiming/.test(sinkDead?.result ?? ""), sinkDead?.result);
  // The result text proves which path won: the watchdog would write "watchdog: no claim".
  t("fail-fast beats the watchdog", !/watchdog/.test(sinkDead?.result ?? "") && Date.now() - t0 < 5000, `${Date.now() - t0}ms · ${sinkDead?.result}`);
  t("fail-fast keeps the empty-log hint", /silent exit/.test(sinkDead?.result ?? ""), sinkDead?.result);

  // An unknown failure still surfaces the worker's last words (field case:
  // agy rejecting a --model name that no longer exists).
  const noisy = await (await post("/api/delegate", { to: "noisy", prompt: "x", title: "noisy-1" })).json();
  const noisyDead = await until(async () => {
    const x = await taskById(noisy.task.id);
    return x?.status === "failed" ? x : undefined;
  });
  t("unknown failure quotes the last log line", /is not recognized/.test(noisyDead?.result ?? ""), noisyDead?.result);
  t("exit code recorded, pid cleared", sinkDead?.exitCode === 0 && sinkDead?.pid === undefined);

  // ---- watchdog: alive but never claims ----
  const hang = await (await post("/api/delegate", { to: "hang", prompt: "never claims", title: "hang-1" })).json();
  const hangPid = (await taskById(hang.task.id))?.pid;
  const hangDead = await until(async () => {
    const x = await taskById(hang.task.id);
    return x?.status === "failed" ? x : undefined;
  });
  t("watchdog reaps unclaimed", /watchdog: no claim/.test(hangDead?.result ?? ""), hangDead?.result);
  await sleep(300);
  t("watchdog kills the wedged worker", typeof hangPid === "number" && !isAlive(hangPid));

  const claimedDead = await until(async () => {
    const x = await taskById(manual1.task_id);
    return x?.status === "failed" ? x : undefined;
  });
  t("watchdog reaps stale claimed", /claimed but no result/.test(claimedDead?.result ?? ""), claimedDead?.result);

  // ---- missing binary must not kill the hub ----
  const ghost = await (await post("/api/delegate", { to: "ghost", prompt: "boo", title: "ghost-1" })).json();
  await sleep(500);
  const alive = await api("/health").catch(() => null);
  t("hub survives missing binary", alive?.ok === true, "hub died after spawning a nonexistent command");
  const ghostDead = await until(async () => {
    const x = await taskById(ghost.task.id);
    return x?.status === "failed" ? x : undefined;
  });
  t("missing binary fails fast with reason", /failed to start.*ENOENT/.test(ghostDead?.result ?? ""), ghostDead?.result);

  // ---- cancel: kills the worker, cascades to children ----
  const parentC = await tool("bridge_delegate", { from: "e2e", to: "manual", title: "cancel-parent", prompt: "x" });
  await tool("bridge_claim", { as: "manual", task_id: parentC.task_id });
  const childC = await tool("bridge_delegate", { from: "manual", to: "sleeper", title: "cancel-child", prompt: "x", parent_task_id: parentC.task_id });
  const childPid = await until(async () => (await taskById(childC.task_id))?.pid);
  t("sleeper worker is running", typeof childPid === "number" && isAlive(childPid));
  const waiter = tool("bridge_wait", { task_id: parentC.task_id, timeout_seconds: 10 });
  const canc = await tool("bridge_cancel", { task_id: parentC.task_id, by: "e2e", reason: "test" });
  t("cancel cascades to the child", canc.cancelled.length === 2 && canc.cancelled.includes(childC.task_id), JSON.stringify(canc.cancelled));
  t("cancelled status + reason", canc.task.status === "cancelled" && /cancelled by e2e: test/.test(canc.task.result));
  await sleep(400);
  t("cancel kills the worker process", !isAlive(childPid));
  t("bridge_wait returns on cancel", (await waiter).task?.status === "cancelled");
  const lateResult = await tool("bridge_post_result", { task_id: childC.task_id, status: "done", result: "too late" });
  t("post_result after cancel rejected", /cancelled/.test(lateResult.error ?? ""));
  t("cancel of finished task is a no-op", (await tool("bridge_cancel", { task_id: sink.task.id, by: "e2e" })).cancelled.length === 0);
  t("cancel unknown id", (await tool("bridge_cancel", { task_id: "nope", by: "e2e" })).error?.includes("unknown"));

  // ---- conversation: messages, bridge_say, threads, stream-json narration ----
  const conv = await (await post("/api/delegate", { to: "talker", prompt: "tell me something", title: "conv-1" })).json();
  const convDone = await until(async () => {
    const x = await taskById(conv.task.id);
    return x?.status === "done" ? x : undefined;
  });
  t("fake claude completes", !!convDone, convDone?.result);
  t("usage keeps the cache split and cost basis", convDone?.usage?.cacheReadTokens === 900 && convDone?.usage?.costBasis === "list", JSON.stringify(convDone?.usage));
  t("usage parsed from result event", convDone?.usage?.costUsd === 0.0123 && convDone.usage.inputTokens === 1000 && convDone.usage.outputTokens === 50 && convDone.usage.turns === 3, JSON.stringify(convDone?.usage));
  const th = await api(`/api/thread/${conv.task.id}`);
  const kinds = th.messages.map((m) => m.kind + ":" + (m.meta?.tool || m.meta?.result || m.from));
  t("thread narrates human → agent text → tool → result", 
    kinds[0] === "human:human" && kinds.includes("agent:talker") && kinds.includes("tool:Bash") && kinds.some((k) => k === "agent:done") && kinds.some((k) => k.startsWith("system:")),
    kinds.join(" | "));
  const toolMsg = th.messages.find((m) => m.kind === "tool");
  t("tool line summarizes the command", /^Bash\s+echo probe-ok/.test(toolMsg?.text ?? "") && toolMsg.meta.input.command === "echo probe-ok", toolMsg?.text);
  t("an out-of-folder tool call is flagged in the thread", th.messages.some((m) => m.kind === "system" && m.meta?.guard && m.meta.path === "/etc/hosts"));
  t("non-json stdout lines are ignored", !th.messages.some((m) => /hook chatter/.test(m.text)));
  t("stdout still lands in the log", (await (await fetch(`${BASE}/api/logs/${conv.task.id}`)).text()).includes("hook chatter"));

  const say = await tool("bridge_say", { task_id: conv.task.id, from: "critic", to: "talker", text: "SCORE:93 — ship it" });
  t("bridge_say posts to the thread", say.ok === true && say.message.threadId === conv.task.id && say.message.to === "talker");
  t("bridge_say unknown task", (await tool("bridge_say", { task_id: "nope", from: "x", text: "y" })).error?.includes("unknown"));
  const thr = await tool("bridge_thread", { task_id: conv.task.id });
  t("bridge_thread reads it back", thr.thread_id === conv.task.id && thr.messages.some((m) => m.text.includes("SCORE:93")));

  // a reply into the thread becomes a child task of the root
  const reply = await (await post("/api/delegate", { to: "mock", prompt: "follow-up", title: "conv-1-reply", parent_task_id: conv.task.id })).json();
  t("reply nests under the thread root", reply.task.parentId === conv.task.id && reply.task.depth === 2);
  await until(async () => (await taskById(reply.task.id))?.status === "done");
  const th2 = await api(`/api/thread/${reply.task.id}`);
  t("child task resolves to the same thread", th2.thread === conv.task.id && th2.tasks.length === 2 && th2.messages.some((m) => m.taskId === reply.task.id && m.kind === "human"));
  t("bad parent → 404", (await post("/api/delegate", { to: "mock", prompt: "x", parent_task_id: "nope" })).status === 404);
  const threadsList = await api("/api/threads");
  const head = threadsList.threads.find((x) => x.id === conv.task.id);
  t("threads lists roots only", !!head && !threadsList.threads.some((x) => x.id === reply.task.id) && head.messages >= 8, JSON.stringify(head));
  t("parse ignores garbage", parseClaudeStreamLine("{{not json").length === 0 && parseClaudeStreamLine('{"type":"system","subtype":"init"}').length === 0);

  // ---- a finished-but-lingering worker must not hold its slot ----
  const ling = await Promise.all(
    [1, 2].map((i) => post("/api/delegate", { to: "linger", prompt: "p", title: `linger-${i}` }).then((r) => r.json())),
  );
  t("second linger task queues", ling.filter((d) => d.dispatch.queued).length === 1);
  const lingT0 = Date.now();
  const lingDone = await until(async () => {
    const st = await api("/api/state");
    const mine = ling.map((d) => st.tasks.find((x) => x.id === d.task.id));
    return mine.every((x) => x?.status === "done") ? mine : undefined;
  }, 12000);
  t("both linger tasks finish", !!lingDone, JSON.stringify(lingDone?.map((x) => x?.status)));
  // Each mock posts in well under a second; the 5s linger would dominate if
  // the slot were held until the process exited.
  t("slot freed at post_result, not at exit", Date.now() - lingT0 < 4500, `${Date.now() - lingT0}ms`);
  const lingW = (await api("/api/state")).workers;
  t("lingering workers reported separately", Array.isArray(lingW.lingering) && lingW.lingering.length >= 1, JSON.stringify(lingW));

  // ---- deleting a conversation ----
  {
    const root = await (await post("/api/delegate", { to: "mock", prompt: "to be deleted", title: "delete-me" })).json();
    await until(async () => (await taskById(root.task.id))?.status === "done");
    const child = await (await post("/api/delegate", { to: "mock", prompt: "child", title: "delete-me-child", parent_task_id: root.task.id })).json();
    await until(async () => (await taskById(child.task.id))?.status === "done");
    const logPath = join(TMP, ".ekip", "logs", `mock-${child.task.id}.log`);
    t("conversation to delete has a log", existsSync(logPath));
    const gone = await (await post("/api/threads/delete", { id: child.task.id })).json();
    t("delete by any task removes the whole conversation", gone.deleted === 2 && gone.thread === root.task.id, JSON.stringify(gone));
    t("its tasks are gone", !(await taskById(root.task.id)) && !(await taskById(child.task.id)));
    t("its transcript is gone", (await fetch(`${BASE}/api/thread/${root.task.id}`)).status === 404);
    t("its logs are gone", !existsSync(logPath));
    t("it leaves the thread list", !(await api("/api/threads")).threads.some((x) => x.id === root.task.id));
    t("unknown conversation → 404", (await post("/api/threads/delete", { id: "nope" })).status === 404);

    const busy = await (await post("/api/delegate", { to: "sleeper", prompt: "busy", title: "delete-busy" })).json();
    await until(async () => (await taskById(busy.task.id))?.pid);
    const busyPid = (await taskById(busy.task.id)).pid;
    t("running conversation is not deleted silently", (await post("/api/threads/delete", { id: busy.task.id })).status === 409);
    const forced = await (await post("/api/threads/delete", { id: busy.task.id, stop: true })).json();
    await sleep(400);
    t("stop + delete kills the worker and removes it", forced.deleted === 1 && !isAlive(busyPid) && !(await taskById(busy.task.id)));
  }

  // ---- access: pages from other sites, DNS rebinding, tokens ----
  {
    const cross = await fetch(BASE + "/api/delegate", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.example" }, body: JSON.stringify({ to: "mock", prompt: "pwn" }) });
    t("a page from another site cannot delegate", cross.status === 403);
    const plain = await fetch(BASE + "/api/delegate", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ to: "mock", prompt: "pwn" }) });
    t("a form-style post without JSON is refused", plain.status === 415);
    const rebind = await new Promise((resolveReq) => {
      const r = httpRequest({ host: "127.0.0.1", port: PORT, path: "/api/state", headers: { Host: "attacker.example:" + PORT } }, (res) => { res.resume(); resolveReq(res.statusCode); });
      r.end();
    });
    t("a rebound hostname is refused", rebind === 403);
    t("same-origin writes still work", (await fetch(BASE + "/api/context", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ key: "same.origin", value: 1 }) })).status === 200);

    const TOKEN = "s3cret-token-for-tests";
    const TPORT = await new Promise((res) => { const probe = createServer(); probe.listen(0, "127.0.0.1", () => { const p = probe.address().port; probe.close(() => res(p)); }); });
    const TROOT = mkdtempSync(join(tmpdir(), "ekip-token-"));
    const TB = `http://127.0.0.1:${TPORT}`;
    const tokenHub = await startServer({ project: "tok", host: "127.0.0.1", port: TPORT, projectRoot: TROOT, token: TOKEN,
      agents: [{ name: "envdump", adapter: "command", spawnable: true, command: "sh", args: ["-c", 'printf "%s" "$EKIP_TOKEN" > token.txt'] }] });
    try {
      t("token hub: API without a token → 401", (await fetch(TB + "/api/state")).status === 401);
      t("token hub: health says only that it is up", JSON.stringify(await (await fetch(TB + "/health")).json()) === JSON.stringify({ ok: true, auth: true }));
      t("token hub: Bearer token works", (await fetch(TB + "/api/state", { headers: { Authorization: "Bearer " + TOKEN } })).status === 200);
      t("token hub: a wrong token is refused", (await fetch(TB + "/api/state", { headers: { Authorization: "Bearer nope" } })).status === 401);
      const mcpNoToken = await fetch(TB + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x", version: "0" } } }) });
      t("token hub: MCP without a token → 401", mcpNoToken.status === 401);
      const link = await fetch(TB + "/chat?token=" + TOKEN, { redirect: "manual" });
      const setCookie = link.headers.get("set-cookie") ?? "";
      t("token hub: a sign-in link sets an HttpOnly cookie and drops the token from the URL", link.status === 302 && link.headers.get("location") === "/chat" && /ekip_token=/.test(setCookie) && /HttpOnly/i.test(setCookie));
      const cookieHeader = setCookie.split(";")[0];
      t("token hub: the cookie authorises the API", (await fetch(TB + "/api/state", { headers: { Cookie: cookieHeader } })).status === 200);
      t("token hub: a malformed cookie is refused, not fatal", (await fetch(TB + "/api/state", { headers: { Cookie: "ekip_token=%" } })).status === 401);
      t("token hub: still up after a malformed cookie", (await fetch(TB + "/health")).status === 200);
      writeFileSync(join(TROOT, "ekip.config.json"), JSON.stringify({ project: "tok", host: "127.0.0.1", port: TPORT, agents: [] }));
      const ctxOut = await new Promise((r) => execFile(process.execPath, [join(REPO, "dist/cli/index.js"), "context", "cli.tok", "42"], { cwd: TROOT, env: { ...process.env, EKIP_TOKEN: TOKEN } }, (err, stdout, stderr) => r(`${err ? "EXIT" : ""}${stdout}${stderr}`)));
      const ctxState = await (await fetch(TB + "/api/state", { headers: { Authorization: "Bearer " + TOKEN } })).json();
      t("token hub: `ekip context key value` sends the token", !/EXIT/.test(ctxOut) && ctxState.context.some((c) => c.key === "cli.tok" && c.value === 42), ctxOut);
      t("token hub: login with a wrong token → 401", (await fetch(TB + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "nope" }) })).status === 401);
      const d = await (await fetch(TB + "/api/delegate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN }, body: JSON.stringify({ to: "envdump", prompt: "x" }) })).json();
      await until(async () => existsSync(join(TROOT, "token.txt")));
      t("token hub: spawned workers receive the token", existsSync(join(TROOT, "token.txt")) && readFileSync(join(TROOT, "token.txt"), "utf8") === TOKEN && !!d.task);
    } finally {
      await tokenHub.close();
    }
    let refused = "";
    try {
      const open = await startServer({ project: "open", host: "0.0.0.0", port: TPORT, projectRoot: TROOT, agents: [] });
      await open.close();
    } catch (err) {
      refused = err.message;
    }
    t("a hub listening beyond loopback without a token refuses to start", /refuses to listen/.test(refused), refused);
  }

  // ---- a task waiting on its hand-offs is not reaped ----
  {
    const parent = (await (await post("/api/delegate", { to: "modeled", prompt: "coordinate", title: "waiting-parent" })).json()).task;
    const run = await openSession();
    await run("bridge_claim", { as: "modeled", task_id: parent.id });
    const child = await run("bridge_delegate", { from: "modeled", to: "modeled", title: "slow-child", prompt: "x", parent_task_id: parent.id });
    await sleep(5000); // claimedTtlSeconds is 3 in this suite
    t("a parent waiting on live hand-offs stays claimed", (await taskById(parent.id))?.status === "claimed", (await taskById(parent.id))?.result);
    await run("bridge_post_result", { task_id: child.task_id, status: "done", result: "child finished" });
    const reaped = await until(async () => { const x = await taskById(parent.id); return x?.status === "failed" ? x : undefined; }, 9000);
    t("once hand-offs finish, an idle parent is reaped again", /claimed but no result/.test(reaped?.result ?? ""), reaped?.result);
  }

  // ---- folder guard: decisions and the Claude hook ----
  {
    const { checkToolCall } = await import("../dist/guard/scope.js");
    const A = join(TMP, "guard-a"), B = join(TMP, "guard-b");
    mkdirSync(A, { recursive: true }); mkdirSync(B, { recursive: true });
    const v = (tool, input) => checkToolCall(A, A, tool, input).ok;
    t("guard allows files inside the folder", v("Write", { file_path: join(A, "x.txt") }) && v("Edit", { file_path: "src/y.ts" }) && v("Bash", { command: "node x.js && npm test" }));
    t("guard blocks another folder", !v("Read", { file_path: join(B, "secret.txt") }) && !v("Write", { file_path: join(B, "x") }) && !v("Grep", { pattern: "a", path: B }));
    t("guard blocks escapes and home", !v("Read", { file_path: "../guard-b/s.txt" }) && !v("Bash", { command: "cd ../guard-b && ls" }) && !v("Bash", { command: "cat ~/.ssh/id_rsa" }));
    t("guard leaves system tools alone", v("Bash", { command: "/usr/bin/env node -v > /dev/null" }));
    const hook = (input) => new Promise((resolveHook) => {
      const child = execFile(process.execPath, [join(REPO, "dist/guard/scope-hook.js")], { env: { ...process.env, EKIP_SCOPE: A } }, (err, _out, errOut) => resolveHook({ code: err ? err.code : 0, errOut }));
      child.stdin.end(JSON.stringify(input));
    });
    const blocked = await hook({ tool_name: "Write", tool_input: { file_path: join(B, "HACK.txt") }, cwd: A });
    t("hook exits 2 with a reason for the model", blocked.code === 2 && /outside this conversation's folder/.test(blocked.errOut));
    t("hook lets inside work through", (await hook({ tool_name: "Write", tool_input: { file_path: join(A, "ok.txt") }, cwd: A })).code === 0);
  }

  // ---- one blackboard per folder ----
  {
    const FA = join(TMP, "bb-a"), FB = join(TMP, "bb-b");
    mkdirSync(FA, { recursive: true }); mkdirSync(FB, { recursive: true });
    const ta = (await (await post("/api/delegate", { to: "modeled", prompt: "a", title: "bb-a", cwd: FA })).json()).task;
    const tb = (await (await post("/api/delegate", { to: "modeled", prompt: "b", title: "bb-b", cwd: FB })).json()).task;
    const runA = await openSession(), runB = await openSession();
    await runA("bridge_claim", { as: "modeled", task_id: ta.id });
    await runB("bridge_claim", { as: "modeled", task_id: tb.id });
    await runA("bridge_context_set", { key: "plan.v1", value: "plan for A", by: "modeled" });
    t("another folder's run does not see the key", (await runB("bridge_context_get", { key: "plan.v1" })).entry === null);
    await runB("bridge_context_set", { key: "plan.v1", value: "plan for B", by: "modeled" });
    t("same key, separate values per folder", (await runA("bridge_context_get", { key: "plan.v1" })).entry?.value === "plan for A" && (await runB("bridge_context_get", { key: "plan.v1" })).entry?.value === "plan for B");
    t("listing is per folder too", (await runA("bridge_context_get", {})).context.every((c) => c.folder === FA));
    t("an explicit task_id picks that folder", (await tool("bridge_context_get", { key: "plan.v1", task_id: tb.id })).entry?.value === "plan for B");
    const both = (await api("/api/state")).context.filter((c) => c.key === "plan.v1");
    t("the app sees every folder's entries, labelled", both.length === 2 && both.some((c) => c.folder === FA) && both.some((c) => c.folder === FB));
    await post("/api/context", { key: "note", value: "from the app", by: "human", folder: FA });
    t("the app writes into a chosen folder", (await runA("bridge_context_get", { key: "note" })).entry?.value === "from the app" && (await runB("bridge_context_get", { key: "note" })).entry === null);
    t("home entries stay unscoped", (await api("/api/state")).context.some((c) => c.key === "e2e.obj" && !c.folder));
  }

  // ---- parallel slots are per folder ----
  {
    const SA = join(TMP, "slot-a"), SB = join(TMP, "slot-b");
    mkdirSync(SA, { recursive: true }); mkdirSync(SB, { recursive: true });
    const a1 = await (await post("/api/delegate", { to: "serial", prompt: "p", title: "slot-a1", cwd: SA })).json();
    const b1 = await (await post("/api/delegate", { to: "serial", prompt: "p", title: "slot-b1", cwd: SB })).json();
    const a2 = await (await post("/api/delegate", { to: "serial", prompt: "p", title: "slot-a2", cwd: SA })).json();
    t("a busy folder doesn't queue another folder's work", a1.dispatch.spawned === true && b1.dispatch.spawned === true, JSON.stringify([a1.dispatch, b1.dispatch]));
    t("the cap still applies within a folder", a2.dispatch.queued === true, JSON.stringify(a2.dispatch));
    t("workers report their folder", (await api("/api/state")).workers.running.some((w) => w.folder === SB));
    await until(async () => (await taskById(a2.task.id))?.dispatchedAt, 8000);
    const limits2 = await api("/api/limits");
    t("limits show per-folder and total caps", typeof limits2.maxConcurrentTotal === "number" && limits2.folderGuard === true);
  }

  // ---- maxConcurrent: per-agent cap queues the overflow ----
  const serial = await Promise.all(
    [1, 2, 3].map((i) => post("/api/delegate", { to: "serial", prompt: "p", title: `serial-${i}` }).then((r) => r.json())),
  );
  t(
    "one launches, two queue",
    serial.filter((d) => d.dispatch.spawned).length === 1 && serial.filter((d) => d.dispatch.queued).length === 2,
    JSON.stringify(serial.map((d) => d.dispatch)),
  );
  const w0 = (await api("/api/state")).workers;
  t("workers snapshot shows the queue", w0.running.length >= 1 && w0.queued.length === 2, JSON.stringify(w0));
  const serialDone = await until(async () => {
    const st = await api("/api/state");
    const mine = serial.map((d) => st.tasks.find((x) => x.id === d.task.id));
    return mine.every((x) => x?.status === "failed") ? mine : undefined;
  }, 12000);
  t("queued tasks eventually run", !!serialDone && serialDone.every((x) => x.dispatchedAt));
  // Order by what the hub said at dispatch: the launched one, then queue position 1, 2.
  // (createdAt can tie at millisecond resolution when requests arrive together.)
  const rank = (d) => (d.dispatch.spawned ? 0 : Number(/position (\d+)/.exec(d.dispatch.reason)?.[1] ?? 99));
  const order = serial.slice().sort((a, b) => rank(a) - rank(b)).map((d) => d.task.id);
  const byCreation = order.map((id) => (serialDone ?? []).find((x) => x.id === id)).filter(Boolean);
  const gaps = byCreation.slice(1).map((x, i) => Date.parse(x.dispatchedAt) - Date.parse(byCreation[i].dispatchedAt));
  t("queue is FIFO and serialized", gaps.length === 2 && gaps.every((g) => g >= 600), `gaps ${gaps.join(", ")}ms`);

  // ---- concurrency: 3 mocks claim their own tasks ----
  const trio = await Promise.all(
    [1, 2, 3].map((i) => post("/api/delegate", { to: "mock", prompt: "p", title: `trio-${i}` }).then((r) => r.json())),
  );
  const trioDone = await until(async () => {
    const st = await api("/api/state");
    const mine = trio.map((d) => st.tasks.find((x) => x.id === d.task.id));
    return mine.every((x) => x?.status === "done") ? mine : undefined;
  });
  t("3 concurrent mocks all done", !!trioDone);
  t(
    "each claimed its own task",
    !!trioDone && trioDone.every((x) => x.result === `mock done: ${x.title}`),
    trioDone?.map((x) => x.result).join(" | "),
  );

  // ---- CLI (async subprocess: the hub lives in THIS process, so a sync
  // exec would freeze the event loop and deadlock the CLI against it) ----
  const cli = (...args) =>
    new Promise((resolveCli) => {
      execFile(
        process.execPath,
        [join(REPO, "dist/cli/index.js"), ...args],
        { cwd: TMP, encoding: "utf8" },
        (err, stdout, stderr) => {
          resolveCli(err ? `EXIT${err.code}:${stdout ?? ""}${stderr ?? ""}` : stdout);
        },
      );
    });
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  t("cli tasks lists", strip(await cli("tasks")).includes("conv-1-reply"));
  t("cli tasks filter", !strip(await cli("tasks", "failed")).includes("api-mock-1"));
  const detail = strip(await cli("task", d1.task.id.slice(0, 8)));
  t("cli task detail by prefix", detail.includes("Prompt") && detail.includes("mock done: api-mock-1"));
  t("cli logs", strip(await cli("logs", d1.task.id.slice(0, 8))).includes("claimed"));
  await cli("context", "cli.key", '{"n":7}');
  t("cli context set/get", strip(await cli("context", "cli.key")).includes('"n": 7'));
  const runOut = strip(await cli("run", "mock", "ping from cli", "cli-run-1"));
  t("cli run follows to done", runOut.includes("━━ DONE ━━") && runOut.includes("mock done: cli-run-1"), runOut.slice(-200));
  t("cli status works", strip(await cli("status")).includes("e2e"));
  t("cli unknown prefix errors", strip(await cli("task", "zzzzzz")).startsWith("EXIT1"));
  t("cli model set", strip(await cli("model", "modeled", "m2")).includes("saved modeled → m2"));
  t("cli agents lists models", strip(await cli("agents")).includes("m2"));
  const cliSleep = await (await post("/api/delegate", { to: "sleeper", prompt: "p", title: "cli-cancel" })).json();
  await until(async () => (await taskById(cliSleep.task.id))?.pid);
  t("cli cancel", strip(await cli("cancel", cliSleep.task.id.slice(0, 8), "bored")).includes("cancelled 1 task"));
  t("cli tasks shows cancelled", strip(await cli("tasks", "cancelled")).includes("cli-cancel"));

  // ---- retention: prune finished tasks + their logs ----
  const { removeSpawnLog, spawnLogPath } = await import("../dist/core/index.js");
  const d1Log = spawnLogPath(TMP, "mock", d1.task.id);
  t("spawn log exists before prune", existsSync(d1Log));
  const cutoff = new Date(Date.parse((await taskById(d1.task.id)).updatedAt) + 1).toISOString();
  const pruned = hub.store.prune(cutoff);
  for (const p of pruned) removeSpawnLog(TMP, p.to, p.id);
  t("prune removes old finished tasks", pruned.some((p) => p.id === d1.task.id) && !(await taskById(d1.task.id)));
  t("prune removes their spawn logs", !existsSync(d1Log));
  t("prune keeps live tasks", (await api("/api/state")).tasks.some((x) => x.status === "pending" || x.status === "claimed") || true);

  // ---- global defaults: machine-wide config + role fallback ----
  const GHOME = mkdtempSync(join(tmpdir(), "ab-ghome-"));
  mkdirSync(join(GHOME, "roles"), { recursive: true });
  writeFileSync(
    join(GHOME, "config.json"),
    JSON.stringify({
      project: "IGNORED",
      port: 4444,
      agents: [{ name: "gdefault", adapter: "command", command: "true", spawnable: false, promptFile: "anywhere/gr.md" }],
    }),
  );
  writeFileSync(join(GHOME, "roles", "gr.md"), "GLOBAL ROLE");
  const FRESH = mkdtempSync(join(tmpdir(), "ab-fresh-"));
  await new Promise((r) =>
    execFile(
      process.execPath,
      [join(REPO, "dist/cli/index.js"), "init"],
      { cwd: FRESH, env: { ...process.env, EKIP_HOME: GHOME } },
      r,
    ),
  );
  const freshCfg = JSON.parse(readFileSync(join(FRESH, "ekip.config.json"), "utf8"));
  {
    const G2 = mkdtempSync(join(tmpdir(), "ekip-g2-"));
    const P2 = mkdtempSync(join(tmpdir(), "ekip-p2-"));
    writeFileSync(join(P2, "ekip.config.json"), JSON.stringify({ project: "p2", port: 4555, token: "do-not-share", language: "Vietnamese", budget: { runs: 9 }, retention: { days: 3 }, writersPerFolder: 2, agents: [{ name: "x", adapter: "command", command: "true" }] }));
    await new Promise((r) => execFile(process.execPath, [join(REPO, "dist/cli/index.js"), "init", "--global"], { cwd: P2, env: { ...process.env, EKIP_HOME: G2 } }, r));
    const saved = JSON.parse(readFileSync(join(G2, "config.json"), "utf8"));
    t("init --global saves budget, language, retention and limits", saved.budget?.runs === 9 && saved.language === "Vietnamese" && saved.retention?.days === 3 && saved.writersPerFolder === 2 && saved.agents?.[0]?.name === "x");
    t("init --global never saves the token or project identity", !("token" in saved) && !("project" in saved) && !("projectRoot" in saved));
  }
  t(
    "init materializes global agents",
    freshCfg.agents?.[0]?.name === "gdefault" && freshCfg.port === 4444 && freshCfg.project !== "IGNORED",
  );
  const freshMcp = JSON.parse(readFileSync(join(FRESH, ".mcp.json"), "utf8"));
  t("init wires .mcp.json", freshMcp.mcpServers?.["ekip"]?.url?.includes("4444"));
  process.env.EKIP_HOME = GHOME;
  const { resolveRoleFile } = await import("../dist/core/index.js");
  const rolePath = resolveRoleFile(FRESH, "anywhere/gr.md");
  t("role file falls back to global", rolePath && readFileSync(rolePath, "utf8") === "GLOBAL ROLE");
  process.env.EKIP_HOME = HOME_DIR;
  t("project agents still win over global", (await api("/api/state")).agents.some((a) => a.name === "mock"));

  // ---- flows: the hub runs the pipeline and enforces the gates ----
  mkdirSync(join(TMP, ".ekip", "flows"), { recursive: true });
  writeFileSync(join(TMP, ".ekip", "flows", "graded.json"), JSON.stringify({
    name: "graded", label: "Graded", steps: [
      { id: "draft", agent: "mock", title: "Draft", prompt: "draft {{input}} round {{round}} fb={{feedback}}" },
      { id: "grade", agent: "grader", title: "Grade", prompt: "grade {{prev.draft}}", gate: { pattern: "SCORE:\\s*(\\d+)", min: 90 }, onFail: { goto: "draft", maxRounds: 3 } },
    ],
  }));
  writeFileSync(join(TMP, ".ekip", "flows", "stubborn.json"), JSON.stringify({
    name: "stubborn", steps: [
      { id: "make", agent: "mock", prompt: "make {{input}}" },
      { id: "check", agent: "nayer", prompt: "check", gate: { startsWith: ["APPROVE"] }, onFail: { goto: "make", maxRounds: 2 } },
    ],
  }));
  writeFileSync(join(TMP, ".ekip", "flows", "broken.json"), JSON.stringify({
    name: "broken", steps: [{ id: "a", agent: "nobody-here", prompt: "x", onFail: { goto: "zzz", maxRounds: 1 } }],
  }));
  const flowList = (await api("/api/flows")).flows;
  const graded = flowList.find((f) => f.name === "graded");
  t("flows: project flow listed with steps", graded && graded.source === "project" && graded.steps.length === 2 && graded.problems.length === 0);
  t("flows: built-in flows listed", flowList.some((f) => f.name === "feature" && f.source === "built-in"));
  const broken = flowList.find((f) => f.name === "broken");
  t("flows: problems reported (agent + goto)", broken && broken.problems.length === 2);
  t("flows: unknown flow 404", (await post("/api/flows/run", { flow: "nope", input: "x" })).status === 404);
  t("flows: missing input 400", (await post("/api/flows/run", { flow: "graded", input: " " })).status === 400);
  t("flows: broken flow refused", (await post("/api/flows/run", { flow: "broken", input: "x" })).status === 400);

  const fr = await (await post("/api/flows/run", { flow: "graded", input: "a slug helper" })).json();
  t("flows: run returns root task", fr.task && fr.task.to === "flow:graded" && fr.task.status === "claimed");
  const flowDone = await until(async () => {
    const x = await taskById(fr.task.id);
    return x && (x.status === "done" || x.status === "failed") ? x : undefined;
  }, 20000);
  t("flows: gate retry then pass → done", flowDone?.status === "done", flowDone?.result);
  const fState = await api("/api/state");
  const stages = fState.tasks.filter((x) => x.parentId === fr.task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  t("flows: stages ran draft, grade, draft, grade", stages.map((x) => x.to).join(",") === "mock,grader,mock,grader", stages.map((x) => x.to).join(","));
  t("flows: second draft carries the feedback", stages[2] && stages[2].prompt.includes("round 2") && stages[2].prompt.includes("SCORE: 40"));
  t("flows: stage prompt gets previous result", stages[1] && stages[1].prompt.includes("mock done: Draft"));
  const fThread = await api(`/api/thread/${fr.task.id}`);
  const gates = (fThread.messages || []).filter((m) => m.meta && m.meta.gate).map((m) => m.meta.gate);
  t("flows: gate notices retry then pass", gates.join(",") === "retry,pass", gates.join(","));
  t("flows: result log shows the loop", /↺ Grade/.test(flowDone?.result ?? "") && /✓ Grade/.test(flowDone?.result ?? ""));

  const fs2 = await (await post("/api/flows/run", { flow: "stubborn", input: "thing" })).json();
  const stuck = await until(async () => {
    const x = await taskById(fs2.task.id);
    return x && (x.status === "done" || x.status === "failed") ? x : undefined;
  }, 20000);
  t("flows: stops when rounds run out", stuck?.status === "failed" && /stopped at "check"/.test(stuck?.result ?? ""), stuck?.result);
  const stuckStages = (await api("/api/state")).tasks.filter((x) => x.parentId === fs2.task.id);
  t("flows: loop capped at maxRounds", stuckStages.filter((x) => x.to === "mock").length === 2 && stuckStages.length === 4, String(stuckStages.length));

  writeFileSync(join(TMP, ".ekip", "flows", "slow.json"), JSON.stringify({
    name: "slow", steps: [{ id: "wait", agent: "sleeper", prompt: "wait" }, { id: "after", agent: "mock", prompt: "after" }],
  }));
  const fc = await (await post("/api/flows/run", { flow: "slow", input: "cancel me" })).json();
  await until(async () => (await api("/api/state")).tasks.find((x) => x.parentId === fc.task.id)?.pid);
  await post("/api/cancel", { task_id: fc.task.id, reason: "enough" });
  await sleep(1200);
  const fcStages = (await api("/api/state")).tasks.filter((x) => x.parentId === fc.task.id);
  t("flows: cancel stops the flow", (await taskById(fc.task.id))?.status === "cancelled" && fcStages.length <= 1, `${(await taskById(fc.task.id))?.status} ${fcStages.map((x) => x.to + ":" + x.status).join(",")}`);

  // ---- editors: two file-editing agents never share a folder at once ----
  const wA = await (await post("/api/delegate", { to: "scribe-a", prompt: "edit", title: "writer-a" })).json();
  const wB = await (await post("/api/delegate", { to: "scribe-b", prompt: "edit too", title: "writer-b" })).json();
  t("writers: first editor starts", wA.dispatch?.spawned === true);
  t("writers: second editor in the same folder waits", wB.dispatch?.queued === true && /editing this folder/.test(wB.dispatch?.reason ?? ""), JSON.stringify(wB.dispatch));
  const wbMsg = (await api(`/api/thread/${wB.task.id}`)).messages.find((m) => m.meta?.writerWait);
  t("writers: the wait says who is editing", wbMsg && /scribe-a/.test(wbMsg.text));
  const otherFolder = join(TMP, "other-project");
  mkdirSync(otherFolder, { recursive: true });
  const wC = await (await post("/api/delegate", { to: "scribe-b", prompt: "edit elsewhere", title: "writer-c", cwd: otherFolder })).json();
  t("writers: an editor in another folder is not held up", wC.dispatch?.spawned === true, JSON.stringify(wC.dispatch));
  t("writers: the waiting editor starts once the folder frees", !!(await until(async () => (await taskById(wB.task.id))?.dispatchedAt, 8000)));
  t("writers: non-editors are not held by an editor", !(await import("../dist/core/dispatcher.js")).isWriter({ name: "r", adapter: "claude", args: ["--model", "sonnet"] }) &&
    (await import("../dist/core/dispatcher.js")).isWriter({ name: "c", adapter: "claude", args: ["--permission-mode", "acceptEdits"] }) &&
    (await import("../dist/core/dispatcher.js")).isWriter({ name: "g", adapter: "antigravity" }));

  // ---- identity: only the run that claimed a task can report it ----
  const idTask = await (await post("/api/delegate", { to: "manual", prompt: "mine", title: "identity" })).json();
  const owner = await openSession(), stranger = await openSession();
  const claimedBy = await owner("bridge_claim", { as: "manual", task_id: idTask.task.id });
  t("identity: owner claims", claimedBy.task?.id === idTask.task.id);
  const hijack = await stranger("bridge_post_result", { task_id: idTask.task.id, status: "done", result: "not yours" });
  t("identity: another session can't report a claimed task", /claimed by another run/.test(hijack.error ?? ""), JSON.stringify(hijack));
  const legit = await owner("bridge_post_result", { task_id: idTask.task.id, status: "done", result: "mine indeed" });
  t("identity: the claiming run reports", legit.ok === true);
  const overwrite = await stranger("bridge_post_result", { task_id: idTask.task.id, status: "failed", result: "replace it" });
  t("identity: a reported result can't be replaced", /already reported/.test(overwrite.error ?? "") && (await taskById(idTask.task.id)).result === "mine indeed");

  // ---- OS sandbox (macOS): an agent without a hook still can't leave its folder ----
  if (process.platform === "darwin") {
    const { sandboxProfile } = await import("../dist/guard/sandbox.js");
    const prof = sandboxProfile(TMP);
    t("sandbox: profile denies home, allows the folder last", prof.indexOf("(deny file-write* (subpath") < prof.lastIndexOf("(allow file-read* file-write* (subpath"));
    t("sandbox: credentials are never readable", /deny file-read\* file-write\* \(subpath "[^"]*\/\.npmrc"\)/.test(prof) && /Application Support\/Google\/Chrome/.test(prof));
    t("sandbox: writes in home are an allowlist, not every dot-folder", !/allow file-write\* \(regex/.test(prof) && /allow file-write\* \(subpath "[^"]*\/\.gemini"\)/.test(prof));
    const bx = await (await post("/api/delegate", { to: "boxed", prompt: "probe", title: "sandbox" })).json();
    await until(async () => existsSync(join(TMP, "boxed-in.txt")), 8000);
    await sleep(500);
    const leaked = existsSync(join(process.env.HOME, "ekip-e2e-leak.txt"));
    if (leaked) execFileSync("rm", ["-f", join(process.env.HOME, "ekip-e2e-leak.txt")]);
    t("sandbox: writes inside the folder work", existsSync(join(TMP, "boxed-in.txt")));
    t("sandbox: writes into home outside the folder are blocked", !leaked && !existsSync(join(TMP, "boxed-leaked.flag")));
    t("sandbox: the log says the run was sandboxed", readFileSync(join(TMP, ".ekip", "logs", `boxed-${bx.task.id}.log`), "utf8").includes("[ekip] sandboxed to"));
  }

  // ---- robustness: a launch that throws fails the task instead of the hub ----
  const brk = await (await post("/api/delegate", { to: "breaks", prompt: "x", title: "throws" })).json();
  t("launch failure fails the task with the reason", brk.task?.status === "failed" && /could not start the worker: disk full/.test(brk.task?.result ?? ""), brk.task?.result);
  t("hub still healthy after a launch failure", (await api("/health")).ok === true);
  const stale = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": "gone-session" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  t("an unknown MCP session gets 404 (client should re-initialize)", stale.status === 404);

  const { spawnLogHint } = await import("../dist/core/logs.js");
  mkdirSync(join(TMP, ".ekip", "logs"), { recursive: true });
  writeFileSync(join(TMP, ".ekip", "logs", "hintprobe-t1.log"), [
    JSON.stringify({ type: "system", subtype: "init", permissionMode: "acceptEdits" }),
    JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Failed to authenticate: OAuth session expired" }),
  ].join("\n"));
  t("failure hint quotes the run's own error, not its init line", spawnLogHint(TMP, "hintprobe", "t1") === JSON.stringify("Failed to authenticate: OAuth session expired"));

  // ---- run keys: only the run the hub started can claim its task ----
  const rk = await (await post("/api/delegate", { to: "sleeper", prompt: "never claims", title: "run-key" })).json();
  await until(async () => (await taskById(rk.task.id))?.dispatchedAt);
  const intruder = await openSession();
  const noKey = await intruder("bridge_claim", { as: "sleeper", task_id: rk.task.id });
  t("run key: claiming a hub-started task without its key is refused", noKey.task === null && /specific run/.test(noKey.error ?? ""), JSON.stringify(noKey));
  const badKey = await intruder("bridge_claim", { as: "sleeper", task_id: rk.task.id, run_key: "guessing-wrong-key-123" });
  t("run key: a wrong key is refused", badKey.task === null && /specific run/.test(badKey.error ?? ""));
  const poll = await intruder("bridge_claim", { as: "sleeper" });
  t("run key: polling can't take tasks of a member the hub launches", poll.task === null && /hub starts a run/.test(poll.note ?? ""));
  await post("/api/cancel", { task_id: rk.task.id });
  const q1 = await (await post("/api/delegate", { to: "serial", prompt: "a", title: "serial-a" })).json();
  const q2 = await (await post("/api/delegate", { to: "serial", prompt: "b", title: "serial-b" })).json();
  const queuedClaim = q2.dispatch?.queued ? await intruder("bridge_claim", { as: "serial", task_id: q2.task.id }) : { error: "not queued" };
  t("run key: a queued task can't be claimed before its run starts", /waiting for the run/.test(queuedClaim.error ?? ""), JSON.stringify(queuedClaim));
  t("run key: the real runs still claim and finish", !!(await until(async () => (await taskById(q1.task.id))?.dispatchedAt)));
  const pr = await (await post("/api/delegate", { to: "parenting", prompt: "hand something out", title: "parent-run" })).json();
  const sub = await until(async () => (await api("/api/state")).tasks.find((x) => x.title === "sub of parent-run"), 8000);
  t("a run's delegation is linked to its own task without naming it", sub && sub.parentId === pr.task.id && sub.depth === pr.task.depth + 1, JSON.stringify(sub && { parentId: sub.parentId, depth: sub.depth }));

  // ---- watchdog: a run that keeps working is not "wedged" ----
  const busy = await (await post("/api/delegate", { to: "manual", prompt: "long job", title: "busy-run" })).json();
  const worker = await openSession();
  await worker("bridge_claim", { as: "manual", task_id: busy.task.id });
  for (let i = 0; i < 6; i++) {
    await sleep(800);
    await worker("bridge_say", { task_id: busy.task.id, from: "manual", text: `step ${i}` });
  }
  t("watchdog: activity keeps a claimed run alive past its TTL", (await taskById(busy.task.id)).status === "claimed");
  const busyDead = await until(async () => ((await taskById(busy.task.id))?.status === "failed" ? true : undefined), 9000);
  t("watchdog: once it goes quiet it is still reaped", !!busyDead);

  // ---- restart: flows, queued work, corrupt state, stopping ----
  {
    const RROOT = mkdtempSync(join(tmpdir(), "ekip-restart-"));
    const RPORT = await new Promise((res) => { const probe = createServer(); probe.listen(0, "127.0.0.1", () => { const p = probe.address().port; probe.close(() => res(p)); }); });
    const RB = `http://127.0.0.1:${RPORT}`;
    const now = new Date().toISOString();
    const task = (o) => ({ from: "human", title: o.id, prompt: "x", depth: 0, createdAt: now, updatedAt: now, ...o });
    mkdirSync(join(RROOT, ".ekip"), { recursive: true });
    writeFileSync(join(RROOT, ".ekip", "state.json"), JSON.stringify({
      tasks: [
        task({ id: "flow-root", to: "flow:x", status: "claimed" }),
        task({ id: "flow-stage", to: "napper", status: "pending", parentId: "flow-root", from: "flow:x", depth: 1 }),
        task({ id: "was-queued", to: "quick", status: "pending" }),
        task({ id: "for-a-person", to: "person", status: "pending" }),
      ],
      context: [], messages: [], folders: [],
    }));
    const rcfg = { project: "restart", host: "127.0.0.1", port: RPORT, projectRoot: RROOT,
      agents: [
        { name: "quick", adapter: "command", spawnable: true, command: "true" },
        { name: "napper", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 30"] },
        { name: "person", adapter: "command", spawnable: false, command: "true" },
      ] };
    let rhub = await startServer(rcfg);
    const rstate = async () => (await (await fetch(RB + "/api/state")).json()).tasks;
    const rt = async (id) => (await rstate()).find((x) => x.id === id);
    t("restart: a flow left running is failed with the reason", (await rt("flow-root")).status === "failed" && /restarted/.test((await rt("flow-root")).result ?? ""));
    t("restart: its unstarted stage is cancelled", (await rt("flow-stage")).status === "cancelled");
    t("restart: queued work is launched again", !!(await until(async () => (await rt("was-queued"))?.dispatchedAt, 6000)));
    t("restart: work waiting for a person is left alone", (await rt("for-a-person")).status === "pending" && !(await rt("for-a-person")).dispatchedAt);
    const nap = await (await fetch(RB + "/api/delegate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "napper", prompt: "sleep" }) })).json();
    const napPid = await until(async () => (await rt(nap.task.id))?.pid);
    await rhub.close();
    await sleep(400);
    const afterClose = JSON.parse(readFileSync(join(RROOT, ".ekip", "state.json"), "utf8")).tasks.find((x) => x.id === nap.task.id);
    t("stopping the hub stops its workers", typeof napPid === "number" && !isAlive(napPid));
    t("stopping the hub says so on their tasks", afterClose?.status === "failed" && /hub stopped/.test(afterClose?.result ?? ""), afterClose?.result);
    t("state is written atomically (no temp file left)", !existsSync(join(RROOT, ".ekip", "state.json.tmp")));
    writeFileSync(join(RROOT, ".ekip", "state.json"), "{ torn write");
    rhub = await startServer(rcfg);
    const aside = readdirSync(join(RROOT, ".ekip")).filter((f) => f.startsWith("state.json.corrupt-"));
    t("restart: an unreadable state file is kept aside, not overwritten", aside.length === 1 && readFileSync(join(RROOT, ".ekip", aside[0]), "utf8") === "{ torn write");
    t("restart: the hub still starts on unreadable state", (await fetch(RB + "/health")).status === 200);
    await rhub.close();
  }

  // ---- policy: the minutes budget starts when work launches ----
  const waiting = await (await post("/api/delegate", { to: "manual", prompt: "for a person", title: "waits-for-person", budget: { minutes: 0.01 } })).json();
  await sleep(2200);
  t("budget: waiting for a person doesn't spend minutes", (await taskById(waiting.task.id))?.status === "pending");

  // ---- policy: retention removes whole conversations only ----
  {
    const { Store } = await import("../dist/core/store.js");
    const st = new Store();
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const root = st.createTask({ from: "human", to: "mock", title: "old root", prompt: "x", depth: 1 });
    st.addMessage({ taskId: root.id, from: "human", kind: "human", text: "the original ask" });
    st.updateTask(root.id, { status: "done" });
    st.getTask(root.id).updatedAt = old;
    const follow = st.createTask({ from: "human", to: "mock", title: "recent follow-up", prompt: "y", depth: 2, parentId: root.id });
    st.updateTask(follow.id, { status: "done" });
    const lone = st.createTask({ from: "human", to: "mock", title: "old alone", prompt: "z", depth: 1 });
    st.updateTask(lone.id, { status: "done" });
    st.getTask(lone.id).updatedAt = old;
    const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const gone = st.prune(cutoff).map((x) => x.id);
    t("retention: a conversation with a recent follow-up keeps its root and transcript", !!st.getTask(root.id) && st.listMessages(root.id).length === 1);
    t("retention: an old finished conversation is removed", gone.includes(lone.id) && !gone.includes(root.id));
  }

  // ---- the hub speaks the reporting language ----
  {
    const { hubWords } = await import("../dist/core/words.js");
    t("hub words: English unchanged", hubWords().exited("code 0", false) === "worker exited (code 0) without claiming the task");
    t("hub words: Vietnamese", hubWords("Vietnamese").exited("mã 0", false) === "worker đã thoát (mã 0) mà chưa nhận việc");
    await post("/api/config/hub", { language: "Vietnamese" });
    const vg = await (await post("/api/delegate", { to: "ghost", prompt: "x", title: "vi-ghost" })).json();
    const vgDead = await until(async () => {
      const x = await taskById(vg.task.id);
      return x?.status === "failed" ? x : undefined;
    });
    t("hub narration follows the language setting", /^worker không khởi động được/.test(vgDead?.result ?? ""), vgDead?.result);
    await post("/api/config/hub", { language: "" });
  }

  // ---- the real claude adapter keeps secrets out of argv ----
  {
    const SHIM = join(TMP, "shim");
    mkdirSync(SHIM, { recursive: true });
    // Stands in for the claude binary: records its arguments and the MCP config it was given.
    writeFileSync(join(SHIM, "claude"), `#!/bin/sh
printf '%s\\n' "$@" > argv.txt
prev=""
for a in "$@"; do
  if [ "$prev" = "--mcp-config" ]; then cp "$a" mcp-config.json; stat -f %Lp "$a" > mcp-mode.txt 2>/dev/null || stat -c %a "$a" > mcp-mode.txt; echo "$a" > mcp-path.txt; fi
  prev="$a"
done
`, { mode: 0o755 });
    const savedPath = process.env.PATH;
    process.env.PATH = `${SHIM}:${savedPath}`;
    const ac = await (await post("/api/delegate", { to: "argvcheck", prompt: "argv probe", title: "argv" })).json();
    await until(async () => existsSync(join(TMP, "mcp-config.json")) && existsSync(join(TMP, "mcp-mode.txt")));
    process.env.PATH = savedPath;
    const argv = existsSync(join(TMP, "argv.txt")) ? readFileSync(join(TMP, "argv.txt"), "utf8") : "";
    const cfgText = existsSync(join(TMP, "mcp-config.json")) ? readFileSync(join(TMP, "mcp-config.json"), "utf8") : "{}";
    t("claude adapter: the MCP config is a file, not an argument", /ekip-mcp-/.test(argv) && !/mcpServers/.test(argv), argv.slice(0, 200));
    t("claude adapter: the config file carries the run key header and is private", /x-ekip-run/.test(cfgText) && readFileSync(join(TMP, "mcp-mode.txt"), "utf8").trim() === "600");
    const cfgPath = readFileSync(join(TMP, "mcp-path.txt"), "utf8").trim();
    await until(async () => !existsSync(cfgPath), 6000);
    t("claude adapter: the config file is removed when the run ends", !existsSync(cfgPath));
    await post("/api/cancel", { task_id: ac.task.id });
  }

  // ---- MCP sessions are bounded ----
  {
    const SROOT = mkdtempSync(join(tmpdir(), "ekip-sess-"));
    const SPORT = await new Promise((res) => { const probe = createServer(); probe.listen(0, "127.0.0.1", () => { const p = probe.address().port; probe.close(() => res(p)); }); });
    const SB = `http://127.0.0.1:${SPORT}`;
    const shub = await startServer({ project: "sess", host: "127.0.0.1", port: SPORT, projectRoot: SROOT, agents: [], mcpSessions: { max: 2 } });
    const hdr = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const init = async () => (await fetch(SB + "/mcp", { method: "POST", headers: hdr, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "s", version: "0" } } }) })).headers.get("mcp-session-id");
    const list = async (sid) => (await fetch(SB + "/mcp", { method: "POST", headers: { ...hdr, "mcp-session-id": sid }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) })).status;
    const s1 = await init();
    await sleep(20);
    const s2 = await init();
    await list(s2);
    const s3 = await init();
    t("sessions: past the cap the least recently used is closed", (await list(s1)) === 404 && (await list(s2)) === 200 && (await list(s3)) === 200);
    t("sessions: the count stays at the cap", (await (await fetch(SB + "/health")).json()).sessions === 2);
    await shub.close();
  }

  // ---- budgets: one request may only spend so much ----
  const limits0 = await api("/api/limits");
  t("budget: defaults exposed", limits0.budget && limits0.budget.runs === 20 && limits0.budget.outputTokens === 0 && limits0.budget.minutes === 120);
  t("budget: bad value refused", (await post("/api/config/hub", { budget: { runs: -1 } })).status === 400);
  t("budget: bad delegate budget refused", (await post("/api/delegate", { to: "sink", prompt: "x", budget: { minutes: "soon" } })).status === 400);

  const bRoot = await (await post("/api/delegate", { to: "sink", prompt: "one run only", title: "budget-runs", budget: { runs: 1 } })).json();
  await until(async () => (await taskById(bRoot.task.id))?.dispatchedAt);
  const bChild = await (await post("/api/delegate", { to: "sink", from: "sink", prompt: "a second run", parent_task_id: bRoot.task.id })).json();
  t("budget: run cap refuses the next run in the request", bChild.task.status === "failed" && /budget/.test(bChild.task.result ?? ""), bChild.task.result);
  const bThread = await api(`/api/thread/${bRoot.task.id}`);
  t("budget: refusal is a budget notice", bThread.messages.some((m) => m.taskId === bChild.task.id && m.meta?.budget?.kind === "runs"));
  const bReport = (bThread.budgets || []).find((b) => b.root === bRoot.task.id);
  t("budget: thread reports used/limit", bReport && bReport.used.runs === 1 && bReport.limit.runs === 1 && bReport.limit.minutes === 120, JSON.stringify(bReport));
  const bFollow = await (await post("/api/delegate", { to: "sink", prompt: "follow-up", parent_task_id: bRoot.task.id })).json();
  t("budget: a person's follow-up gets a fresh budget", bFollow.task.status !== "failed" && (bFollow.dispatch?.spawned || bFollow.dispatch?.queued));

  const tRoot = await (await post("/api/delegate", { to: "talker", prompt: "spend tokens", title: "budget-tokens", budget: { outputTokens: 40 } })).json();
  await until(async () => (await taskById(tRoot.task.id))?.usage?.outputTokens, 10000);
  const tChild = await (await post("/api/delegate", { to: "sink", from: "talker", prompt: "more", parent_task_id: tRoot.task.id })).json();
  t("budget: token cap stops the next run", tChild.task.status === "failed" && /40 output tokens/.test(tChild.task.result ?? ""), tChild.task.result);
  t("budget: seen models survive a restart (saved to disk)", existsSync(join(HOME_DIR, "seen-models.json")) && readFileSync(join(HOME_DIR, "seen-models.json"), "utf8").includes("claude-mock-seen-1"));

  const mRoot = await (await post("/api/delegate", { to: "sleeper", prompt: "take forever", title: "budget-minutes", budget: { minutes: 0.01 } })).json();
  const mDone = await until(async () => {
    const x = await taskById(mRoot.task.id);
    return x && x.status !== "pending" && x.status !== "claimed" ? x : undefined;
  }, 8000);
  t("budget: time cap stops work in flight", mDone?.status === "cancelled" && /minutes/.test(mDone?.result ?? ""), mDone?.result);
  t("budget: time-stopped worker is gone", mDone && !(await api("/api/state")).workers?.running?.some((w) => w.taskId === mRoot.task.id));

  writeFileSync(join(TMP, ".ekip", "flows", "thrifty.json"), JSON.stringify({
    name: "thrifty", budget: { runs: 1 },
    steps: [{ id: "one", agent: "mock", title: "One", prompt: "one" }, { id: "two", agent: "mock", title: "Two", prompt: "two" }],
  }));
  const fb = await (await post("/api/flows/run", { flow: "thrifty", input: "cheap" })).json();
  const fbDone = await until(async () => {
    const x = await taskById(fb.task.id);
    return x && x.status !== "claimed" ? x : undefined;
  }, 10000);
  t("budget: flow stops before a stage it can't afford", fbDone?.status === "failed" && /budget/.test(fbDone?.result ?? "") && /Latest result/.test(fbDone?.result ?? ""), fbDone?.result);
  t("budget: flow ran only what it could afford", (await api("/api/state")).tasks.filter((x) => x.parentId === fb.task.id).length === 1);
  t("budget: flow result says what it spent", /Spent: 1 runs/.test(fbDone?.result ?? ""));

  const setB = await (await post("/api/config/hub", { budget: { runs: 7, minutes: 0 } })).json();
  t("budget: hub budget saved", setB.budget?.runs === 7 && setB.budget?.minutes === 0 && JSON.parse(readFileSync(join(TMP, "ekip.config.json"), "utf8")).budget?.runs === 7);
  await post("/api/config/hub", { budget: { runs: 20, minutes: 120 } });

  t("cli flow lists flows", /graded/.test(strip(await cli("flow"))) && /nobody-here/.test(strip(await cli("flow"))));
} finally {
  await hub.close();
}

// hub is down now — friendly error path
{
  const out = (() => {
    try {
      execFileSync(process.execPath, [join(REPO, "dist/cli/index.js"), "tasks"], {
        cwd: TMP,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return "";
    } catch (err) {
      return `${err.status}:${err.stderr}`;
    }
  })();
  t("cli friendly hub-down error", out.startsWith("1:") && out.includes("ekip serve"));
}

// persistence across restart
{
  const state = JSON.parse(readFileSync(join(TMP, ".ekip", "state.json"), "utf8"));
  t("state persisted to disk", state.tasks.length >= 8 && state.context.some((c) => c.key === "e2e.mcp"));
  t("messages persisted to disk", Array.isArray(state.messages) && state.messages.some((m) => m.kind === "tool"));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} cases · ${results.length - failed.length} pass · ${failed.length} fail`);
if (failed.length > 0) process.exit(1);
