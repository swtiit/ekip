/**
 * Public entrypoint for embedding ekip programmatically.
 */
import { antigravityAdapter } from "../adapters/antigravity.js";
import { claudeAdapter } from "../adapters/claude.js";
import { commandAdapter } from "../adapters/command.js";
import { registerAdapter } from "../adapters/index.js";

// Register the built-in adapters on import.
registerAdapter(claudeAdapter);
registerAdapter(antigravityAdapter);
registerAdapter(commandAdapter);

export * from "./config.js";
export * from "./server.js";
export { Store } from "./store.js";
export { Dispatcher } from "./dispatcher.js";
export { buildHub } from "./hub.js";
export { removeSpawnLog, spawnLogHint, spawnLogPath } from "./logs.js";
export { FlowRunner, checkGate, loadFlows, validateFlow } from "./flows.js";
export type { Flow, FlowGate, FlowStep } from "./flows.js";
export { agyCatalog, catalogFor, claudeCatalog, listSeenModels, recordSeenModel } from "./models.js";
export {
  registerAdapter,
  getAdapter,
  listAdapters,
} from "../adapters/index.js";
export type { Adapter, SpawnRequest, SpawnResult, WorkerEvent, WorkerExit } from "../adapters/index.js";
export { launchDetached, bridgeEnv } from "../adapters/spawn.js";
export { parseClaudeStreamLine } from "../adapters/claude.js";
export { BUDGET_DEFAULTS, budgetReport, budgetRoot, budgetUsage, checkBudget, describeBreach, parseBudget } from "./budget.js";
export type { BudgetBreach, BudgetReport, BudgetUsage } from "./budget.js";
