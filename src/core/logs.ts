import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { hubDataDir } from "./config.js";

/** Spawn logs live with the hub's other records, outside the project. */
export interface HubId {
  project: string;
  projectRoot: string;
}

export function logsDir(hub: HubId): string {
  return join(hubDataDir(hub), "logs");
}

export function spawnLogPath(hub: HubId, agent: string, taskId: string): string {
  return join(logsDir(hub), `${agent}-${taskId}.log`);
}

/**
 * Pull the most telling line (quota / permission failure) from a spawn log.
 * Spawned agents die silently often enough that the *reason* is worth more
 * than the funeral — this is what turns "no result" into "session limit hit".
 */
export function spawnLogHint(hub: HubId, agent: string, taskId: string): string | undefined {
  const file = spawnLogPath(hub, agent, taskId);
  if (!existsSync(file)) return "no spawn log found (agent may never have started)";
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  if (!text.trim()) return "spawn log is empty (silent exit — often quota exhaustion)";
  const signature =
    /(session limit|rate.?limit|quota|429|resource.?exhausted|auto-denied|permission|spawn error|ENOENT|authenticat|OAuth|not logged in)/i;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // Claude's stream-json: the run's own error result is the clearest reason
  // ("Failed to authenticate…"). Its init line merely mentions permissionMode.
  for (const line of [...lines].reverse()) {
    if (!line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line) as { type?: string; is_error?: boolean; result?: unknown };
      if (event.type === "result" && event.is_error && typeof event.result === "string") {
        return JSON.stringify(event.result.trim().slice(0, 200));
      }
    } catch {
      // not an event line
    }
  }
  const match = lines.find((l) => !l.startsWith("{") && signature.test(l));
  if (match) return JSON.stringify(match.slice(0, 200));
  // No known signature — the last thing the worker said is still the best
  // clue we have (e.g. agy's "invalid --model ... is not recognized").
  const plain = lines.filter((l) => !l.startsWith("{"));
  const last = plain[plain.length - 1];
  return last ? JSON.stringify(last.trim().slice(0, 200)) : undefined;
}

export function removeSpawnLog(hub: HubId, agent: string, taskId: string): void {
  try {
    rmSync(spawnLogPath(hub, agent, taskId), { force: true });
  } catch {
    // best-effort housekeeping
  }
}
