/**
 * ekip protocol — vendor-neutral contract shared by every agent.
 *
 * Nothing here knows about Claude, Antigravity, or any specific project.
 * A "task" is a unit of delegated work addressed from one agent to another;
 * "context" is a shared key/value blackboard both sides can read and write.
 */

export type TaskStatus =
  | "pending" // created, waiting for the target agent to pick up
  | "claimed" // target agent acknowledged it
  | "done" // finished successfully
  | "failed"; // finished with an error

export interface Artifact {
  /** standard kinds: "file", "diff", "url", "log", "note" (others pass through) */
  kind: string;
  /** human label */
  label?: string;
  /** inline text, path, or URL depending on kind */
  value: string;
}

export interface Task {
  id: string;
  /** agent name that created the task */
  from: string;
  /** agent name the task is addressed to */
  to: string;
  title: string;
  /** the actual instruction the target agent should carry out */
  prompt: string;
  /** optional structured context handed along with the task */
  context?: Record<string, unknown>;
  status: TaskStatus;
  result?: string;
  artifacts?: Artifact[];
  /** delegation chain depth, used as a loop guard */
  depth: number;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextEntry {
  key: string;
  value: unknown;
  /** agent name that last wrote this key */
  updatedBy: string;
  updatedAt: string;
}

/** Persisted, serializable shape of the whole hub state. */
export interface BridgeState {
  tasks: Task[];
  context: ContextEntry[];
}

export const PROTOCOL_VERSION = "0.2.0";

/** Maximum delegation depth before the dispatcher refuses to spawn again. */
export const DEFAULT_MAX_DEPTH = 6;
