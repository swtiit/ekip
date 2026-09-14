import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "../protocol/index.js";
import { isTerminal } from "../protocol/index.js";
import type { BridgeConfig } from "./config.js";
import { globalDir } from "./config.js";
import type { Dispatcher } from "./dispatcher.js";
import type { Store } from "./store.js";

/**
 * Flows: multi-stage pipelines the hub runs itself.
 *
 * A conductor agent could run the same script, but then "the critic must score
 * 90", "at most three rounds" and "stop on HOLD" are only words in a prompt —
 * and the conductor is a full model run of its own (measured: about as costly
 * as the coder it hands work to). Here the hub hands out each stage, checks
 * each gate against the real result, loops back with the feedback, and stops
 * when a cap is reached. Deterministic, and one run cheaper.
 *
 * A flow is a JSON file: `.ekip/flows/<name>.json` in the project,
 * `~/.ekip/flows/`, or the built-ins shipped in `examples/flows/`.
 */

export interface FlowGate {
  /** regex whose first capture group is a number, e.g. "SCORE:\\s*(\\d+)" */
  pattern?: string;
  /** minimum value of that number */
  min?: number;
  /** the result must start with one of these (case-insensitive, after trimming) */
  startsWith?: string[];
}

export interface FlowStep {
  id: string;
  agent: string;
  title?: string;
  /**
   * Prompt template. Placeholders: {{input}}, {{run}} (short run id, for
   * blackboard keys), {{round}}, {{feedback}} (the result that sent the flow
   * back here, empty otherwise), {{prev.<stepId>}} (that step's last result).
   */
  prompt: string;
  gate?: FlowGate;
  /** when the gate fails: go back to `goto`, at most `maxRounds` times in total */
  onFail?: { goto: string; maxRounds: number };
}

export interface Flow {
  name: string;
  label?: string;
  description?: string;
  steps: FlowStep[];
  /** where it was loaded from */
  source?: "project" | "machine" | "built-in";
}

const BUILT_IN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples", "flows");

/**
 * Flow files may give any label, description or step title per language —
 * `"label": { "en": "Code, then review", "vi": "Code rồi review" }` — and the
 * hub picks the one matching its `language` (English when there is no match).
 */
function langKey(language: string | undefined): string {
  const l = (language ?? "").trim().toLowerCase();
  if (!l) return "en";
  if (l.startsWith("vi") || l.includes("việt")) return "vi";
  return l.slice(0, 2);
}

function pickText(value: unknown, lang: string): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const table = value as Record<string, unknown>;
  const hit = table[lang] ?? table.en ?? Object.values(table)[0];
  return typeof hit === "string" ? hit : undefined;
}

function localize(flow: Flow, lang: string): Flow {
  flow.label = pickText(flow.label, lang);
  flow.description = pickText(flow.description, lang);
  if (Array.isArray(flow.steps)) for (const step of flow.steps) step.title = pickText(step.title, lang);
  return flow;
}

function readFlowDir(dir: string, source: Flow["source"], lang: string): Flow[] {
  if (!existsSync(dir)) return [];
  const out: Flow[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const flow = JSON.parse(readFileSync(join(dir, file), "utf8")) as Flow;
      flow.name = flow.name || basename(file, ".json");
      flow.source = source;
      out.push(localize(flow, lang));
    } catch {
      // a broken file shouldn't hide the others
    }
  }
  return out;
}

/** Project flows win over machine flows, which win over the built-ins. */
export function loadFlows(config: BridgeConfig): Flow[] {
  const byName = new Map<string, Flow>();
  const lang = langKey(config.language);
  for (const flow of [
    ...readFlowDir(BUILT_IN_DIR, "built-in", lang),
    ...readFlowDir(join(globalDir(), "flows"), "machine", lang),
    ...readFlowDir(join(config.projectRoot, ".ekip", "flows"), "project", lang),
  ]) {
    byName.set(flow.name, flow);
  }
  return [...byName.values()];
}

/** Problems that would stop a flow before it starts: unknown agents, bad jumps. */
export function validateFlow(flow: Flow, config: BridgeConfig): string[] {
  const problems: string[] = [];
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) return ["the flow has no steps"];
  const ids = new Set(flow.steps.map((s) => s.id));
  const agents = new Set(config.agents.map((a) => a.name));
  for (const step of flow.steps) {
    if (!step.id || !step.agent || !step.prompt) problems.push(`step ${step.id ?? "?"} needs id, agent and prompt`);
    if (step.agent && !agents.has(step.agent)) problems.push(`step "${step.id}" uses agent "${step.agent}", which is not in this crew`);
    if (step.onFail && !ids.has(step.onFail.goto)) problems.push(`step "${step.id}" goes back to unknown step "${step.onFail.goto}"`);
    if (step.gate?.pattern) {
      try {
        new RegExp(step.gate.pattern);
      } catch {
        problems.push(`step "${step.id}" has an invalid gate pattern`);
      }
    }
  }
  return problems;
}

export interface GateVerdict {
  passed: boolean;
  /** human-readable, e.g. "SCORE 93 ≥ 90" or "starts with REVISE" */
  detail: string;
}

export function checkGate(gate: FlowGate | undefined, result: string): GateVerdict {
  if (!gate) return { passed: true, detail: "" };
  const text = (result ?? "").trim();
  if (gate.pattern) {
    const m = new RegExp(gate.pattern, "i").exec(text);
    const value = m && m[1] !== undefined ? Number(m[1]) : NaN;
    if (Number.isNaN(value)) return { passed: false, detail: `no score found (expected /${gate.pattern}/)` };
    if (gate.min !== undefined && value < gate.min) return { passed: false, detail: `score ${value} < ${gate.min}` };
    return { passed: true, detail: `score ${value}${gate.min !== undefined ? ` ≥ ${gate.min}` : ""}` };
  }
  if (gate.startsWith?.length) {
    const head = text.toUpperCase();
    const hit = gate.startsWith.find((w) => head.startsWith(w.toUpperCase()));
    const first = text.split(/\s+/)[0] ?? "";
    return hit ? { passed: true, detail: `starts with ${hit}` } : { passed: false, detail: `starts with "${first.slice(0, 24)}", expected ${gate.startsWith.join(" or ")}` };
  }
  return { passed: true, detail: "" };
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Runs flows. One runner per hub; each run lives as a root task (addressed to
 * `flow:<name>`) with every stage as a child task in the same conversation.
 */
export class FlowRunner {
  constructor(
    private readonly config: BridgeConfig,
    private readonly store: Store,
    private readonly dispatcher: Dispatcher,
  ) {}

  /** The run summary is read by the human, so it follows the hub's language. */
  private words() {
    return langKey(this.config.language) === "vi"
      ? { allPassed: "mọi chặng đã đạt", stoppedAt: "dừng ở", round: "vòng", after: "sau", rounds: "vòng", noResult: "không có kết quả" }
      : { allPassed: "all stages passed", stoppedAt: "stopped at", round: "round", after: "after", rounds: "rounds", noResult: "no result" };
  }

  start(flow: Flow, input: string, opts: { cwd?: string; from?: string } = {}): Task {
    const root = this.store.createTask({
      from: opts.from ?? "human",
      to: `flow:${flow.name}`,
      title: `${flow.label ?? flow.name}: ${input.replace(/\s+/g, " ").slice(0, 60)}`,
      prompt: input,
      depth: 0,
      cwd: opts.cwd,
    });
    this.store.updateTask(root.id, { status: "claimed" });
    this.store.addMessage({ taskId: root.id, from: opts.from ?? "human", to: `flow:${flow.name}`, kind: "human", text: input });
    this.store.addMessage({
      taskId: root.id,
      from: "hub",
      kind: "system",
      text: `flow ${flow.name}: ${flow.steps.map((s) => `${s.title ?? s.id} (${s.agent})`).join(" → ")}`,
      meta: { flow: flow.name, steps: flow.steps.map((s) => ({ id: s.id, agent: s.agent, title: s.title })) },
    });
    void this.run(flow, root.id, input).catch((err: Error) => {
      const current = this.store.getTask(root.id);
      if (current && !isTerminal(current.status)) {
        this.store.updateTask(root.id, { status: "failed", result: `flow error: ${err.message}` });
      }
    });
    return this.store.getTask(root.id)!;
  }

  private waitFor(taskId: string): Promise<Task> {
    return new Promise((resolve) => {
      const check = (): boolean => {
        const t = this.store.getTask(taskId);
        if (!t) {
          // The conversation was deleted mid-flow: treat the stage as cancelled.
          this.store.off("change", onChange);
          resolve({ id: taskId, status: "cancelled" } as Task);
          return true;
        }
        if (isTerminal(t.status)) {
          this.store.off("change", onChange);
          resolve(t);
          return true;
        }
        return false;
      };
      const onChange = (): void => {
        check();
      };
      this.store.on("change", onChange);
      check();
    });
  }

  private async run(flow: Flow, rootId: string, input: string): Promise<void> {
    const runKey = `${flow.name}-${rootId.slice(0, 6)}`;
    const results: Record<string, string> = {};
    const rounds: Record<string, number> = {};
    const log: string[] = [];
    let feedback = "";
    let index = 0;
    const root = () => this.store.getTask(rootId);
    const w = this.words();
    const say = (text: string, meta?: Record<string, unknown>) =>
      this.store.addMessage({ taskId: rootId, from: "hub", kind: "system", text, meta: { flow: flow.name, ...meta } });

    while (index < flow.steps.length) {
      if (!root() || isTerminal(root()!.status)) return; // stopped from outside
      const step = flow.steps[index];
      const round = (rounds[step.id] ?? 0) + 1;
      const vars: Record<string, string> = { input, run: runKey, round: String(round), feedback };
      for (const [id, value] of Object.entries(results)) vars[`prev.${id}`] = value;
      const child = this.store.createTask({
        from: `flow:${flow.name}`,
        to: step.agent,
        title: `${step.title ?? step.id}${round > 1 ? ` (round ${round})` : ""}`,
        prompt: render(step.prompt, vars),
        depth: 1,
        parentId: rootId,
        cwd: root()?.cwd,
      });
      this.store.addMessage({
        taskId: child.id,
        from: `flow:${flow.name}`,
        to: step.agent,
        kind: "agent",
        text: child.prompt,
        meta: { delegation: true, title: child.title, flowStep: step.id, stage: `${index + 1}/${flow.steps.length}` },
      });
      rounds[step.id] = round;
      await this.dispatcher.dispatch(child);
      const done = await this.waitFor(child.id);

      if (!root() || isTerminal(root()!.status)) return;
      if (done.status !== "done") {
        const why = `${w.stoppedAt} "${step.title ?? step.id}" — ${done.status}: ${done.result ?? w.noResult}`;
        log.push(`✗ ${step.title ?? step.id} (${step.agent}) — ${done.status}`);
        this.finish(rootId, "failed", why, log);
        return;
      }
      results[step.id] = done.result ?? "";
      const verdict = checkGate(step.gate, done.result ?? "");
      if (verdict.passed) {
        log.push(`✓ ${step.title ?? step.id} (${step.agent})${verdict.detail ? ` — ${verdict.detail}` : ""}${round > 1 ? `, ${w.round} ${round}` : ""}`);
        if (step.gate) say(`gate passed: ${step.title ?? step.id} — ${verdict.detail}`, { gate: "pass", step: step.id, stepTitle: step.title ?? step.id, detail: verdict.detail });
        feedback = "";
        index++;
        continue;
      }
      // Gate failed: loop back with the feedback, or stop when the cap is reached.
      const back = step.onFail;
      const used = back ? rounds[back.goto] ?? 0 : 0;
      if (back && used < back.maxRounds) {
        const gotoStep = flow.steps.find((s) => s.id === back.goto);
        say(`gate not met: ${step.title ?? step.id} — ${verdict.detail}; back to "${back.goto}" (round ${used + 1}/${back.maxRounds})`, {
          gate: "retry", step: step.id, stepTitle: step.title ?? step.id, detail: verdict.detail, goto: gotoStep?.title ?? back.goto, round: used + 1, max: back.maxRounds,
        });
        log.push(`↺ ${step.title ?? step.id} (${step.agent}) — ${verdict.detail}`);
        feedback = done.result ?? "";
        index = flow.steps.findIndex((s) => s.id === back.goto);
        continue;
      }
      say(`gate not met: ${step.title ?? step.id} — ${verdict.detail}; no rounds left, stopping`, { gate: "stop", step: step.id, stepTitle: step.title ?? step.id, detail: verdict.detail });
      log.push(`■ ${step.title ?? step.id} (${step.agent}) — ${verdict.detail}${back ? `, ${w.after} ${used} ${w.rounds}` : ""}`);
      this.finish(rootId, "failed", `${w.stoppedAt} "${step.title ?? step.id}": ${verdict.detail}`, log, done.result);
      return;
    }
    this.finish(rootId, "done", w.allPassed, log, results[flow.steps[flow.steps.length - 1].id]);
  }

  private finish(rootId: string, status: "done" | "failed", headline: string, log: string[], last?: string): void {
    const current = this.store.getTask(rootId);
    if (!current || isTerminal(current.status)) return;
    const result = [headline, "", ...log, ...(last ? ["", last] : [])].join("\n");
    this.store.updateTask(rootId, { status, result });
    this.store.addMessage({ taskId: rootId, from: current.to, to: current.from, kind: "agent", text: result, meta: { result: status } });
  }
}
