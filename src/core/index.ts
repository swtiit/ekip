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
export {
  registerAdapter,
  getAdapter,
  listAdapters,
} from "../adapters/index.js";
export type { Adapter, SpawnRequest, SpawnResult } from "../adapters/index.js";
