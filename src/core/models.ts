import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export interface ModelOption {
  /** what goes after `--model` */
  value: string;
  /** human label for pickers */
  label: string;
  description?: string;
  /** where this entry came from, so the UI can say how fresh it is */
  source: "cli" | "account" | "seen" | "builtin";
}

export interface ModelCatalog {
  models: ModelOption[];
  /** what each alias resolved to when it last ran here, e.g. opus → claude-opus-5 */
  aliases?: Record<string, string>;
  /** true when the list came from the installed CLI or the account cache */
  live: boolean;
  note?: string;
  fetchedAt: string;
}

const TEN_MINUTES = 600_000;

/**
 * Model discovery, per adapter.
 *
 * Neither vendor gives a clean "list models" API to a headless caller, so we
 * assemble the best list available:
 *
 * - **Antigravity** does have `agy models` (id + display name, tab separated).
 *   It prints the list and then *hangs* instead of exiting, so we read stdout
 *   until it goes quiet and kill the process ourselves.
 * - **Claude Code** has no listing command (`claude models` is just a prompt,
 *   and an unknown `--model` returns `unrecognized_model` with no list). We
 *   union three sources: the aliases the CLI always accepts, the account's
 *   own `additionalModelOptionsCache` in `~/.claude.json` (what the app last
 *   offered this user), and models the hub has actually seen a spawned run
 *   report in its stream — the only list that is proven to work here.
 */

/** Aliases the claude CLI accepts regardless of account. */
const CLAUDE_ALIASES: ModelOption[] = [
  { value: "fable", label: "fable", description: "alias — newest Claude 5 family", source: "builtin" },
  { value: "opus", label: "opus", description: "alias — most capable Opus", source: "builtin" },
  { value: "sonnet", label: "sonnet", description: "alias — balanced", source: "builtin" },
  { value: "haiku", label: "haiku", description: "alias — fastest, cheapest", source: "builtin" },
];

/**
 * Models the hub watched a spawned run actually use, oldest first. Kept in
 * `~/.ekip/seen-models.json` so the list survives a hub restart — a model
 * that ran on this machine works on this machine, whichever project it was.
 */
const seenModels = new Map<string, string>();
let seenLoaded = false;
const SEEN_MAX = 30;

function seenFile(): string {
  return join(process.env.EKIP_HOME ?? join(homedir(), ".ekip"), "seen-models.json");
}

function loadSeen(): void {
  if (seenLoaded) return;
  seenLoaded = true;
  try {
    const rows = JSON.parse(readFileSync(seenFile(), "utf8")) as Array<{ model?: string; at?: string }>;
    for (const r of rows) if (typeof r?.model === "string") seenModels.set(r.model, r.at ?? "");
  } catch {
    // no file yet, or a broken one: start fresh
  }
}

export function recordSeenModel(model: string): void {
  if (!model || model === "<synthetic>") return;
  loadSeen();
  const known = seenModels.has(model);
  seenModels.delete(model);
  seenModels.set(model, new Date().toISOString());
  while (seenModels.size > SEEN_MAX) seenModels.delete(seenModels.keys().next().value!);
  if (known) return; // order changed, nothing new worth a write
  try {
    mkdirSync(join(seenFile(), ".."), { recursive: true });
    writeFileSync(seenFile(), JSON.stringify([...seenModels].map(([m, at]) => ({ model: m, at })), null, 2) + "\n");
  } catch {
    // the in-memory list still works for this run
  }
}

export function listSeenModels(): string[] {
  loadSeen();
  return [...seenModels.keys()].reverse();
}

/** The account's extra model options, as the Claude app last cached them. */
function claudeAccountModels(): ModelOption[] {
  const path = join(homedir(), ".claude.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      additionalModelOptionsCache?: Array<{ value?: string; label?: string; description?: string }>;
    };
    return (raw.additionalModelOptionsCache ?? [])
      .filter((m): m is { value: string; label?: string; description?: string } => typeof m?.value === "string")
      .map((m) => ({
        // The cache marks the 1-hour cache tier with a "[1m]" suffix; the bare
        // id is what belongs on a --model flag.
        value: m.value.replace(/\[1m\]$/, ""),
        label: m.label ?? m.value,
        description: m.description,
        source: "account" as const,
      }));
  } catch {
    return [];
  }
}

export function claudeCatalog(): ModelCatalog {
  const seen: ModelOption[] = listSeenModels().map((value) => ({
    value,
    label: value,
    description: "seen running in this project",
    source: "seen" as const,
  }));
  const account = claudeAccountModels();
  const models: ModelOption[] = [];
  const taken = new Set<string>();
  for (const m of [...seen, ...account, ...CLAUDE_ALIASES]) {
    if (taken.has(m.value)) continue;
    taken.add(m.value);
    models.push(m);
  }
  const aliases = listAliases();
  for (const m of models) if (aliases[m.value]) m.description = `${m.description ?? "alias"} → ${aliases[m.value]}`;
  return {
    models,
    aliases,
    live: account.length > 0 || seen.length > 0,
    note:
      "Claude Code has no list-models command; this mixes the always-valid aliases, your account's cached options, and models seen running here. Any id the CLI accepts can be typed in.",
    fetchedAt: new Date().toISOString(),
  };
}

let agyCache: ModelCatalog | undefined;

/**
 * `agy models` — prints `id<TAB>Display Name` lines after a "Fetching…"
 * header, then never exits. Read until the output goes quiet, then kill it.
 */
export function agyCatalog(timeoutMs = 20_000): Promise<ModelCatalog> {
  if (agyCache && Date.now() - Date.parse(agyCache.fetchedAt) < TEN_MINUTES) {
    return Promise.resolve(agyCache);
  }
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    let quiet: NodeJS.Timeout | undefined;

    const child = spawn("agy", ["models"], { stdio: ["ignore", "pipe", "pipe"] });

    const finish = (note?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      if (quiet) clearTimeout(quiet);
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
      const models: ModelOption[] = [];
      for (const line of out.split("\n")) {
        const [value, label] = line.split("\t");
        if (!value?.trim() || !label?.trim()) continue;
        models.push({ value: label.trim(), label: label.trim(), description: value.trim(), source: "cli" });
      }
      const catalog: ModelCatalog = {
        models,
        live: models.length > 0,
        note:
          models.length > 0
            ? "Live from `agy models`. Antigravity expects the display name after --model; names change between releases."
            : note ?? "Could not read `agy models` — is the agy CLI installed and logged in?",
        fetchedAt: new Date().toISOString(),
      };
      if (models.length > 0) agyCache = catalog;
      resolve(catalog);
    };

    const hard = setTimeout(() => finish("`agy models` timed out"), timeoutMs);
    hard.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      // The command hangs after printing; treat a pause as the end of the list.
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(() => finish(), 1200);
      quiet.unref?.();
    });
    child.on("error", (err) => finish(`could not run agy: ${err.message}`));
    child.on("exit", () => finish());
  });
}

export async function catalogFor(adapter: string): Promise<ModelCatalog> {
  if (adapter === "claude") return claudeCatalog();
  if (adapter === "antigravity") return agyCatalog();
  return {
    models: [],
    live: false,
    note: `The "${adapter}" adapter has no model list — set flags in the agent's args.`,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Is this model id real, and which model does it actually resolve to?
 *
 * Claude Code has no way to list models, so the only honest check is to run
 * one: `claude -p` with the id and a one-word prompt. The run reports the
 * model it really used (an alias like `opus` comes back as the concrete id),
 * which is also how an alias gets pinned down. It costs a small run — on
 * Opus, about a quarter of a dollar at list prices, because every run writes
 * its opening context to cache — so the UI asks before probing.
 */
export interface ModelProbe {
  ok: boolean;
  /** the id the run reported using, when it worked */
  resolved?: string;
  costUsd?: number;
  durationMs?: number;
  /** why it didn't work */
  error?: string;
}

export function probeClaudeModel(model: string, timeoutMs = 180_000): Promise<ModelProbe> {
  return new Promise((resolve) => {
    const empty = join(tmpdir(), `ekip-probe-${randomBytes(6).toString("hex")}.json`);
    try {
      writeFileSync(empty, JSON.stringify({ mcpServers: {} }));
    } catch {
      // fall through: claude will complain and we report that
    }
    const done = (probe: ModelProbe): void => {
      rmSync(empty, { force: true });
      resolve(probe);
    };
    const child = spawn(
      "claude",
      ["-p", "ok", "--model", model, "--output-format", "json", "--mcp-config", empty, "--strict-mcp-config"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (err += b.toString("utf8")));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ ok: false, error: `no answer within ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    timer.unref();
    child.on("error", (e) => {
      clearTimeout(timer);
      done({ ok: false, error: e.message });
    });
    child.on("close", () => {
      clearTimeout(timer);
      let event: { is_error?: boolean; result?: unknown; total_cost_usd?: number; duration_ms?: number; modelUsage?: Record<string, unknown> } | undefined;
      try {
        event = JSON.parse(out.trim()) as typeof event;
      } catch {
        // not JSON: the CLI refused before the run started
      }
      if (!event || event.is_error) {
        // Hooks and plugins chatter on the same streams; keep the line that
        // actually explains the refusal.
        const lines = `${err}\n${out}`.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !/hook|CLAUDE_PLUGIN_ROOT/i.test(l));
        const said = typeof event?.result === "string" ? event.result : undefined;
        const line =
          said ??
          [...lines].reverse().find((l) => /model|unrecognized|not recognized|invalid|error/i.test(l)) ??
          lines[lines.length - 1] ??
          "the run produced no output";
        return done({ ok: false, error: line.slice(0, 200) });
      }
      const resolved = Object.keys(event.modelUsage ?? {})[0] ?? model;
      recordSeenModel(resolved);
      if (resolved !== model) rememberAlias(model, resolved);
      done({ ok: true, resolved, costUsd: event.total_cost_usd, durationMs: event.duration_ms });
    });
  });
}

/** What an alias resolved to last time it ran, e.g. opus → claude-opus-5. */
const aliasFile = (): string => join(process.env.EKIP_HOME ?? join(homedir(), ".ekip"), "model-aliases.json");

export function rememberAlias(alias: string, model: string): void {
  const all = { ...listAliases(), [alias]: model };
  try {
    mkdirSync(join(aliasFile(), ".."), { recursive: true });
    writeFileSync(aliasFile(), JSON.stringify(all, null, 2) + "\n");
  } catch {
    // best-effort
  }
}

export function listAliases(): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(aliasFile(), "utf8")) as Record<string, string>;
    return typeof raw === "object" && raw ? raw : {};
  } catch {
    return {};
  }
}
