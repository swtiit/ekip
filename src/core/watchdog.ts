import type { BridgeConfig, WatchdogConfig } from "./config.js";
import { WATCHDOG_DEFAULTS } from "./config.js";
import { spawnLogHint } from "./logs.js";
import type { Store } from "./store.js";

/**
 * Sweeps orphaned tasks so a dead agent can't wedge the queue forever.
 *
 * A spawned CLI can die without ever touching the bridge — quota exhaustion
 * (Claude "session limit", agy's silent 429 exit-0), permission soft-denials,
 * crashes. The task then sits `pending`/`claimed` with nobody coming back for
 * it. The watchdog fails such tasks after a TTL and, because the *reason*
 * matters more than the funeral, greps the spawn log for known quota/permission
 * signatures and puts what it finds in the failure result.
 *
 * Pending-TTL only applies to tasks the dispatcher actually launched: a task
 * for a polling agent (`spawnable: false`, e.g. a human) may legitimately wait
 * hours before being claimed, and a queued task hasn't had its turn yet.
 *
 * Since 0.5 the dispatcher fails a task the moment its worker process exits,
 * so this sweep is the safety net for the remaining cases: a worker that is
 * alive but wedged, or a hub restart that lost its process handles.
 */
export class Watchdog {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: BridgeConfig,
    private readonly store: Store,
    /** called after a task is failed, so the owner can kill its worker */
    private readonly onFail?: (taskId: string) => void,
  ) {}

  start(): void {
    const cfg = { ...WATCHDOG_DEFAULTS, ...this.config.watchdog };
    if (!cfg.enabled) return;
    this.timer = setInterval(() => this.sweep(cfg), cfg.sweepIntervalSeconds * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private sweep(cfg: Required<WatchdogConfig>): void {
    const now = Date.now();
    for (const task of this.store.listTasks()) {
      if (task.status === "pending" && task.dispatchedAt) {
        const age = (now - Date.parse(task.dispatchedAt)) / 1000;
        if (age > cfg.pendingTtlSeconds) {
          this.fail(task.id, task.to, `no claim within ${cfg.pendingTtlSeconds}s of delegation`);
        }
      } else if (task.status === "claimed") {
        const idle = (now - Date.parse(task.updatedAt)) / 1000;
        if (idle > cfg.claimedTtlSeconds) {
          this.fail(task.id, task.to, `claimed but no result within ${cfg.claimedTtlSeconds}s`);
        }
      }
    }
  }

  private fail(taskId: string, agent: string, reason: string): void {
    const hint = spawnLogHint(this.config.projectRoot, agent, taskId);
    this.store.updateTask(taskId, {
      status: "failed",
      result: `watchdog: ${reason}${hint ? ` — spawn log hints: ${hint}` : ""}`,
      pid: undefined,
    });
    this.onFail?.(taskId);
  }

}
