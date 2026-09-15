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
        // A task that handed work out is waiting, not wedged: while any of its
        // delegated tasks is still alive, the clock is theirs, not its own.
        if (this.hasLiveDescendant(task.id)) continue;
        const idle = (now - Date.parse(this.lastActivity(task.id, task.updatedAt))) / 1000;
        if (idle > cfg.claimedTtlSeconds) {
          this.fail(task.id, task.to, `claimed but no result within ${cfg.claimedTtlSeconds}s`);
        }
      }
    }
  }

  private hasLiveDescendant(taskId: string): boolean {
    const all = this.store.listTasks();
    const stack = [taskId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const t of all) {
        if (t.parentId !== id) continue;
        if (t.status === "pending" || t.status === "claimed") return true;
        stack.push(t.id);
      }
    }
    return false;
  }

  /** Latest sign of life: its own update, anything it said or did, or when its last hand-off finished. */
  private lastActivity(taskId: string, own: string): string {
    // A run that keeps calling tools or talking is working, not wedged: its
    // stream updates messages, not the task itself.
    let latest = own;
    const said = this.store.lastActivityOf(taskId);
    if (said && said > latest) latest = said;
    for (const t of this.store.listTasks()) {
      if (t.parentId === taskId && t.updatedAt > latest) latest = t.updatedAt;
    }
    return latest;
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
