import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import type { SpawnResult } from "./index.js";

export interface LaunchOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logFile: string;
  /** human label for SpawnResult.detail, e.g. "claude -p" */
  label: string;
}

/**
 * Fire-and-forget process launch shared by all adapters.
 *
 * The `error` handler is load-bearing: a missing binary emits an async
 * `error` event on the child, and with no listener that exception kills the
 * whole hub. We log it instead — the task stays pending and the watchdog
 * reaps it with the "spawn error" hint from this log.
 */
export function launchDetached(opts: LaunchOptions): SpawnResult {
  mkdirSync(dirname(opts.logFile), { recursive: true });
  const fd = openSync(opts.logFile, "a");
  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: opts.env,
  });
  child.on("error", (err) => {
    try {
      appendFileSync(opts.logFile, `spawn error: ${err.message}\n`);
    } catch {
      // nothing left to report to
    }
  });
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
