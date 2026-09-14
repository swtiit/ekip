import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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

/** Models the hub watched a spawned run actually use, newest first. */
const seenModels = new Map<string, string>();

export function recordSeenModel(model: string): void {
  if (!model || model === "<synthetic>") return;
  seenModels.delete(model);
  seenModels.set(model, new Date().toISOString());
}

export function listSeenModels(): string[] {
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
  return {
    models,
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
