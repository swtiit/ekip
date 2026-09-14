import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export function logsDir(projectRoot: string): string {
  return join(projectRoot, ".ekip", "logs");
}

export function spawnLogPath(projectRoot: string, agent: string, taskId: string): string {
  return join(logsDir(projectRoot), `${agent}-${taskId}.log`);
}

/**
 * Pull the most telling line (quota / permission failure) from a spawn log.
 * Spawned agents die silently often enough that the *reason* is worth more
 * than the funeral — this is what turns "no result" into "session limit hit".
 */
export function spawnLogHint(projectRoot: string, agent: string, taskId: string): string | undefined {
  const file = spawnLogPath(projectRoot, agent, taskId);
  if (!existsSync(file)) return "no spawn log found (agent may never have started)";
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  if (!text.trim()) return "spawn log is empty (silent exit — often quota exhaustion)";
  const signature =
    /^.*(session limit|rate.?limit|quota|429|resource.?exhausted|auto-denied|permission|spawn error|ENOENT|authenticat|OAuth|not logged in).*$/im;
  const match = text.match(signature);
  if (match) return JSON.stringify(match[0].trim().slice(0, 200));
  // No known signature — the last thing the worker said is still the best
  // clue we have (e.g. agy's "invalid --model ... is not recognized").
  const lines = text.trim().split("\n").filter((l) => l.trim() && !l.startsWith("{"));
  const last = lines[lines.length - 1];
  return last ? JSON.stringify(last.trim().slice(0, 200)) : undefined;
}

export function removeSpawnLog(projectRoot: string, agent: string, taskId: string): void {
  try {
    rmSync(spawnLogPath(projectRoot, agent, taskId), { force: true });
  } catch {
    // best-effort housekeeping
  }
}
