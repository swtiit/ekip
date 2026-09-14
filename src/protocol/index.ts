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
  | "failed" // finished with an error
  | "cancelled"; // stopped on request before it finished

/** Statuses a task never leaves. */
export const TERMINAL_STATUSES: readonly TaskStatus[] = ["done", "failed", "cancelled"];
export const isTerminal = (status: TaskStatus): boolean => TERMINAL_STATUSES.includes(status);

export interface Artifact {
  /** standard kinds: "file", "diff", "url", "log", "note" (others pass through) */
  kind: string;
  /** human label */
  label?: string;
  /** inline text, path, or URL depending on kind */
  value: string;
}

/**
 * Spending cap for one request (see the hub's budget rules). A field left out
 * falls back to the hub's setting; 0 turns that limit off.
 */
export interface TaskBudget {
  /** worker runs launched for the request */
  runs?: number;
  /** output tokens reported by those runs */
  outputTokens?: number;
  /** wall-clock minutes since the request was made */
  minutes?: number;
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
  /**
   * Absolute folder the work happens in. A conversation picks one; everything
   * handed out inside it inherits it. Absent means the hub's own project root.
   */
  cwd?: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  /** when the hub actually launched a worker for it (absent while queued) */
  dispatchedAt?: string;
  /** OS pid of the spawned worker, while the hub tracks it */
  pid?: number;
  /** exit code of the spawned worker once it ended (null = killed by signal) */
  exitCode?: number | null;
  /** what the run cost, when the adapter can tell (Claude's stream-json result) */
  usage?: TaskUsage;
  /** a spending cap set when the request was made (flows carry their own) */
  budget?: TaskBudget;
}

export interface TaskUsage {
  /** the model the worker actually ran with, when it reports one */
  model?: string;
  /** all input: fresh + written to cache + read from cache */
  inputTokens?: number;
  /** input read back from the prompt cache (billed at a tenth of the input price) */
  cacheReadTokens?: number;
  /** input written to the prompt cache (billed above the input price) */
  cacheWriteTokens?: number;
  /**
   * What `costUsd` is priced at, as the CLI reports it — "list" means API
   * list prices. On a subscription login that is a reference figure, not a
   * charge.
   */
  costBasis?: string;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
}

/**
 * One line of the conversation. Threads are keyed by the root task of a
 * delegation tree, so everything a pipeline says — the human's ask, each
 * agent's words, tool calls, hand-offs — reads as one transcript.
 */
export type MessageKind =
  | "human" // typed by a person (dashboard / CLI)
  | "agent" // an agent speaking: bridge_say, streamed assistant text, or its result
  | "tool" // a tool call the agent made (name + short input), for the "what is it doing" view
  | "system"; // hub narration: delegated, started, done, failed, cancelled, queued

export interface Message {
  id: string;
  /** root task id of the delegation tree this belongs to */
  threadId: string;
  /** the specific task the line belongs to */
  taskId: string;
  from: string;
  to?: string;
  kind: MessageKind;
  text: string;
  /** free-form extras: tool name/input, result status, usage */
  meta?: Record<string, unknown>;
  at: string;
}

export interface ContextEntry {
  key: string;
  /**
   * Folder this entry belongs to. Each conversation's folder has its own
   * blackboard, so the same key in two projects never collides. Absent means
   * the hub's own project folder.
   */
  folder?: string;
  value: unknown;
  /** agent name that last wrote this key */
  updatedBy: string;
  updatedAt: string;
}

/** Persisted, serializable shape of the whole hub state. */
export interface BridgeState {
  tasks: Task[];
  context: ContextEntry[];
  messages?: Message[];
  /** folders people have chosen to work in, most recent first */
  folders?: string[];
}

export const PROTOCOL_VERSION = "0.6.0";

/** Maximum delegation depth before the dispatcher refuses to spawn again. */
export const DEFAULT_MAX_DEPTH = 6;
