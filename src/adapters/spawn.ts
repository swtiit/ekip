import { spawn } from "node:child_process";
import { appendFileSync, createWriteStream, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import type { SpawnResult, WorkerExit } from "./index.js";

export interface LaunchOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logFile: string;
  /** human label for SpawnResult.detail, e.g. "claude -p" */
  label: string;
  /** fires exactly once when the process ends or fails to start */
  onExit?: (exit: WorkerExit) => void;
  /** every line the worker writes to stdout (it is also appended to the log) */
  onLine?: (line: string) => void;
}

/**
 * Fire-and-forget process launch shared by all adapters.
 *
 * The `error` handler is load-bearing: a missing binary emits an async
 * `error` event on the child, and with no listener that exception kills the
 * whole hub. We log it and report it through `onExit` so the dispatcher can
 * fail the task right away instead of waiting for the watchdog.
 *
 * The child runs in its own process group (`detached`), which is what lets
 * `cancel` take the whole tree down with one signal to `-pid`.
 */
export function launchDetached(opts: LaunchOptions): SpawnResult {
  mkdirSync(dirname(opts.logFile), { recursive: true });
  const fd = openSync(opts.logFile, "a");
  // stdout comes through us (so adapters can decode it live); stderr goes
  // straight to the log file.
  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    detached: true,
    stdio: ["ignore", opts.onLine ? "pipe" : fd, fd],
    env: opts.env,
  });
  if (child.stdout) {
    const log = createWriteStream(opts.logFile, { flags: "a" });
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      log.write(chunk);
      buf += chunk.toString("utf8");
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) opts.onLine?.(line);
        nl = buf.indexOf("\n");
      }
    });
    child.stdout.on("end", () => {
      if (buf.trim()) opts.onLine?.(buf);
      log.end();
    });
  }
  let settled = false;
  const settle = (exit: WorkerExit): void => {
    if (settled) return;
    settled = true;
    opts.onExit?.(exit);
  };
  child.on("error", (err) => {
    try {
      appendFileSync(opts.logFile, `spawn error: ${err.message}\n`);
    } catch {
      // nothing left to report to
    }
    settle({ code: null, signal: null, error: err.message });
  });
  child.on("exit", (code, signal) => settle({ code, signal }));
  child.unref();
  return {
    launched: true,
    pid: child.pid,
    detail: `${opts.label} (log: ${opts.logFile})`,
  };
}

export function bridgeEnv(req: {
  hubUrl: string;
  agentName: string;
  taskId: string;
  depth: number;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    EKIP_URL: req.hubUrl,
    EKIP_AGENT: req.agentName,
    EKIP_TASK: req.taskId,
    EKIP_DEPTH: String(req.depth),
  };
}
