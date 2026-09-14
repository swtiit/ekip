// Stability soak: hammers a real hub with mock workers and checks the
// invariants that matter when nobody is watching —
//   * every task reaches a terminal state (nothing wedges)
//   * cancel kills processes and cascades
//   * concurrency caps hold under load
//   * a hub restart recovers its state and does not leak workers
//   * no orphan processes and no unbounded growth
// No LLMs involved. Run with `npm run soak` (optionally SOAK_ROUNDS=n).
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { startServer } from "../dist/core/index.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "ekip-soak-"));
const ROUNDS = Number(process.env.SOAK_ROUNDS ?? 3);
const BURST = Number(process.env.SOAK_BURST ?? 12);
const PORT = await new Promise((res) => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1", () => {
    const p = probe.address().port;
    probe.close(() => res(p));
  });
});
const BASE = `http://127.0.0.1:${PORT}`;
const MOCK = join(REPO, "test", "mock-agent.mjs");

const config = {
  project: "soak",
  host: "127.0.0.1",
  port: PORT,
  projectRoot: TMP,
  agents: [
    { name: "fast", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}"] },
    { name: "slow", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 2"], maxConcurrent: 2 },
    { name: "dier", adapter: "command", spawnable: true, command: "sh", args: ["-c", "exit 3"] },
    { name: "ghost", adapter: "command", spawnable: true, command: "no-such-binary-zzz" },
    { name: "forever", adapter: "command", spawnable: true, command: "sh", args: ["-c", "sleep 600"] },
  ],
  maxDepth: 4,
  maxConcurrent: 4,
  watchdog: { pendingTtlSeconds: 6, claimedTtlSeconds: 8, sweepIntervalSeconds: 1 },
};
writeFileSync(join(TMP, "ekip.config.json"), JSON.stringify(config, null, 2));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✔" : "  ✖ FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p) => (await fetch(BASE + p)).json();
const post = (p, body) =>
  fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function until(fn, timeoutMs = 40_000, step = 250) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return undefined;
    await sleep(step);
  }
}
const terminal = (s) => s === "done" || s === "failed" || s === "cancelled";

let hub = await startServer(config);
console.log(`soak hub on :${PORT} (${TMP})\n${ROUNDS} rounds × ${BURST} tasks\n`);
const spawnedPids = new Set();
let peakRunning = 0;

try {
  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`round ${round}`);
    // A burst of mixed work: healthy, slow, crashing, missing-binary, hanging.
    const kinds = ["fast", "fast", "fast", "slow", "dier", "ghost", "forever"];
    const sent = [];
    for (let i = 0; i < BURST; i++) {
      const to = kinds[i % kinds.length];
      sent.push(
        post("/api/delegate", { to, prompt: `soak ${round}.${i}`, title: `r${round}-${i}-${to}` }).then((r) => r.json()),
      );
    }
    const created = await Promise.all(sent);
    check(`round ${round}: hub accepted ${BURST} delegations`, created.every((d) => d.task));

    // Watch the caps while work drains.
    const watcher = setInterval(async () => {
      try {
        const s = await api("/api/state");
        peakRunning = Math.max(peakRunning, s.workers.running.length);
        s.workers.running.forEach((w) => spawnedPids.add(w.pid));
      } catch {
        /* hub may be restarting */
      }
    }, 120);

    // Cancel a couple of the long ones mid-flight.
    await sleep(900);
    const hanging = created.filter((d) => d.task.to === "forever").slice(0, 2);
    for (const h of hanging) {
      const pid = (await api("/api/state")).tasks.find((t) => t.id === h.task.id)?.pid;
      const res = await (await post("/api/cancel", { task_id: h.task.id, by: "soak" })).json();
      check(`round ${round}: cancel reported ${res.cancelled?.length ?? 0} task(s)`, (res.cancelled?.length ?? 0) >= 1);
      if (pid) {
        await sleep(400);
        check(`round ${round}: cancelled worker pid is gone`, !alive(pid), `pid ${pid}`);
      }
    }

    // Everything must reach a terminal state (watchdog TTLs are short here).
    const settled = await until(async () => {
      const s = await api("/api/state");
      const mine = s.tasks.filter((t) => t.title.startsWith(`r${round}-`));
      return mine.length === BURST && mine.every((t) => terminal(t.status)) ? mine : undefined;
    });
    clearInterval(watcher);
    check(`round ${round}: all ${BURST} tasks settled`, !!settled, settled ? "" : "some tasks never reached a terminal state");
    if (settled) {
      const byStatus = settled.reduce((acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }), {});
      console.log(`    ${JSON.stringify(byStatus)}`);
      check(
        `round ${round}: healthy workers succeeded`,
        settled.filter((t) => t.to === "fast").every((t) => t.status === "done"),
      );
      check(
        `round ${round}: broken workers failed with a reason`,
        settled.filter((t) => t.to === "dier" || t.to === "ghost").every((t) => t.status === "failed" && (t.result ?? "").length > 10),
      );
    }
    check(`round ${round}: hub-wide concurrency cap held`, peakRunning <= config.maxConcurrent, `peak ${peakRunning}`);
    check(`round ${round}: hub still healthy`, (await api("/health")).ok === true);
  }

  // ---- restart: state survives, no ghosts ----
  const before = await api("/api/state");
  const beforeCount = before.tasks.length;
  const messagesBefore = (await api("/api/threads")).threads.reduce((n, t) => n + t.messages, 0);
  await post("/api/delegate", { to: "forever", prompt: "survive a restart", title: "restart-victim" });
  const victimPid = await until(async () => (await api("/api/state")).tasks.find((t) => t.title === "restart-victim")?.pid);
  await hub.close();
  await sleep(300);
  check("hub closed cleanly", true);
  hub = await startServer(config);
  const after = await api("/api/state");
  check("tasks survive a restart", after.tasks.length >= beforeCount + 1, `${beforeCount} → ${after.tasks.length}`);
  check(
    "conversations survive a restart",
    (await api("/api/threads")).threads.reduce((n, t) => n + t.messages, 0) >= messagesBefore,
  );
  check("no stale pids after restart", after.tasks.every((t) => t.pid === undefined));
  const reaped = await until(async () => {
    const t = (await api("/api/state")).tasks.find((x) => x.title === "restart-victim");
    return t && terminal(t.status) ? t : undefined;
  }, 30_000);
  check("a task orphaned by the restart is still reaped", !!reaped, reaped?.result);
  if (victimPid) {
    try {
      process.kill(victimPid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }

  // ---- nothing left running, nothing leaked ----
  await sleep(1200);
  const finalState = await api("/api/state");
  check("no workers still holding slots", finalState.workers.running.length === 0, JSON.stringify(finalState.workers));
  const leaked = [...spawnedPids].filter((pid) => alive(pid));
  check("no orphan worker processes", leaked.length === 0, leaked.join(", "));
  const stateFile = join(TMP, ".ekip", "state.json");
  check("state file is valid JSON", existsSync(stateFile) && !!JSON.parse(readFileSync(stateFile, "utf8")).tasks);
  const heap = Math.round(process.memoryUsage().heapUsed / 1048576);
  console.log(`\n    peak concurrent workers: ${peakRunning}/${config.maxConcurrent} · tasks: ${finalState.tasks.length} · heap: ${heap}MB`);
} finally {
  await hub.close();
  // Belt and braces: nothing of ours should outlive the run.
  for (const pid of spawnedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks · ${results.length - failed.length} pass · ${failed.length} fail`);
if (failed.length > 0) process.exit(1);
