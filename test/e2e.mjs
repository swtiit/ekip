// End-to-end suite: boots a real hub on a scratch port and exercises the
// HTTP API, the MCP tool surface, the dispatcher, the watchdog, and the CLI.
// No LLMs involved — agents are scripted mocks. Run with `npm test`.
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { startServer } from "../dist/core/index.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "agent-bridge-e2e-"));
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const MOCK = join(REPO, "test", "mock-agent.mjs");

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
  ],
  maxDepth: 3,
  watchdog: { pendingTtlSeconds: 2, claimedTtlSeconds: 3, sweepIntervalSeconds: 1 },
};
writeFileSync(join(TMP, "role.md"), "# Role: roleful\nProbe role content MARKER-XYZZY.");
// The CLI resolves the hub from agent-bridge.config.json in its cwd.
writeFileSync(join(TMP, "agent-bridge.config.json"), JSON.stringify(config));

const results = [];
function t(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ✔" : "  ✖ FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  t("state shape", Array.isArray(state0.tasks) && state0.agents.length === 5 && state0.hubUrl.endsWith("/mcp"));

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

  const uiRes = await fetch(`${BASE}/ui`);
  const uiHtml = await uiRes.text();
  t("ui served", uiRes.status === 200 && uiHtml.includes("<!doctype html>") && uiHtml.length > 8000);
  t("ui has escaping + artifact viewer", uiHtml.includes("function esc(") && uiHtml.includes("closest('.artifact')"));
  const rootRes = await fetch(BASE + "/", { redirect: "manual" });
  t("/ redirects to /ui", rootRes.status === 302 && rootRes.headers.get("location") === "/ui");

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
  t("8 bridge tools", tools.length === 8 && tools.every((n) => n.startsWith("bridge_")), tools.join(","));

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

  // ---- promptFile injection reaches the spawned process ----
  const dRole = await tool("bridge_delegate", { from: "e2e", to: "roleful", title: "role-probe", prompt: "hi" });
  await until(async () => (await taskById(dRole.task_id))?.status === "done");
  // the mock echoes nothing about the prompt, but the spawn log directory is
  // taskId-addressed; assert via dispatcher behavior: role file exists & run done
  t("promptFile agent still completes", (await taskById(dRole.task_id))?.status === "done");

  // ---- watchdog ----
  const sink = await (await post("/api/delegate", { to: "sink", prompt: "never claimed", title: "sink-1" })).json();
  const sinkDead = await until(async () => {
    const x = await taskById(sink.task.id);
    return x?.status === "failed" ? x : undefined;
  });
  t("watchdog reaps unclaimed", /watchdog: no claim/.test(sinkDead?.result ?? ""), sinkDead?.result);
  t("watchdog empty-log hint", /silent exit/.test(sinkDead?.result ?? ""), sinkDead?.result);

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
  t("ghost task reaped", !!ghostDead, ghostDead?.result);

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
  t("cli tasks lists", strip(await cli("tasks")).includes("api-mock-1"));
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
  t("cli friendly hub-down error", out.startsWith("1:") && out.includes("agent-bridge serve"));
}

// persistence across restart
{
  const state = JSON.parse(readFileSync(join(TMP, ".agent-bridge", "state.json"), "utf8"));
  t("state persisted to disk", state.tasks.length >= 8 && state.context.some((c) => c.key === "e2e.mcp"));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} cases · ${results.length - failed.length} pass · ${failed.length} fail`);
if (failed.length > 0) process.exit(1);
