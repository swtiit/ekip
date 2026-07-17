import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BridgeConfig, WatchdogConfig } from "./config.js";
import { WATCHDOG_DEFAULTS } from "./config.js";
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
 * Pending-TTL only applies to tasks addressed to spawnable agents: a task for
 * a polling agent (`spawnable: false`, e.g. a human) may legitimately wait
 * hours before being claimed.
 */
export class Watchdog {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: BridgeConfig,
    private readonly store: Store,
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
    const spawnable = new Set(
      this.config.agents.filter((a) => a.spawnable !== false).map((a) => a.name),
    );
    for (const task of this.store.listTasks()) {
      if (task.status === "pending" && spawnable.has(task.to)) {
        const age = (now - Date.parse(task.createdAt)) / 1000;
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
    const hint = this.logHint(taskId, agent);
    this.store.updateTask(taskId, {
      status: "failed",
      result: `watchdog: ${reason}${hint ? ` — spawn log hints: ${hint}` : ""}`,
    });
  }

  /** Pull the most telling line (quota / permission failure) from the spawn log. */
  private logHint(taskId: string, agent: string): string | undefined {
    const dir = join(this.config.projectRoot, ".ekip", "logs");
    if (!existsSync(dir)) return undefined;
    const file = readdirSync(dir).find((f) => f === `${agent}-${taskId}.log`);
    if (!file) return "no spawn log found (agent may never have started)";
    let text: string;
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch {
      return undefined;
    }
    if (!text.trim()) return "spawn log is empty (silent exit — often quota exhaustion)";
    const signature =
      /^.*(session limit|rate.?limit|quota|429|resource.?exhausted|auto-denied|permission|spawn error|ENOENT).*$/im;
    const match = text.match(signature);
    if (match) return JSON.stringify(match[0].trim().slice(0, 200));
    return undefined;
  }
}
