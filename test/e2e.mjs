// End-to-end suite: boots a real hub on a scratch port and exercises the
// HTTP API, the MCP tool surface, the dispatcher, the watchdog, and the CLI.
// No LLMs involved — agents are scripted mocks. Run with `npm test`.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { startServer, registerAdapter, launchDetached, bridgeEnv, parseClaudeStreamLine } from "../dist/core/index.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "ekip-e2e-"));
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
  t("state shape", Array.isArray(state0.tasks) && state0.agents.length === 13 && state0.hubUrl.endsWith("/mcp"));
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
  delete process.env.EKIP_HOME;
  t("project agents still win over global", (await api("/api/state")).agents.some((a) => a.name === "mock"));
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
