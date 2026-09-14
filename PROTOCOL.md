# ekip protocol (v0.5.0)

Vendor-neutral contract for coordinating multiple coding agents over MCP. No
part of it names a specific agent or project — Claude Code and Antigravity are
just the first two adapters.

## Model

- **Task** — a unit of work addressed *from* one agent *to* another. It carries
  a `prompt` (the instruction), optional structured `context`, and moves through
  `pending → claimed → done | failed | cancelled`.
- **Context** — a shared key/value blackboard both agents read and write. Used
  for hand-off state that isn't a discrete task (plans, decisions, file notes).
- **Message** — one line of conversation, attached to a task and grouped
  into a **thread** by the root of the delegation tree. Kinds: `human`
  (typed by a person), `agent` (an agent speaking — `bridge_say`, streamed
  assistant text, or its posted result), `tool` (a tool call the agent made),
  `system` (hub narration: started, queued, failed, cancelled).
- **Hub** — a single MCP server (Streamable HTTP) both agents connect to. It
  holds the task queue + blackboard and, via the **dispatcher**, launches the
  target agent's headless CLI when a task is delegated.

Two agents never talk directly. Everything flows through the hub, which makes
the relationship symmetric: either side can delegate to the other.

## Task lifecycle

```
 agent A                    hub                     agent B
   │  bridge_delegate(to=B) │                          │
   ├───────────────────────▶│  create task (pending)   │
   │                         ├── dispatcher spawns B ──▶│  (headless run)
   │                         │       bridge_claim(as=B) │
   │                         │◀─────────────────────────┤  → claimed
   │                         │   …B does the work…      │
   │                         │  bridge_post_result      │
   │                         │◀─────────────────────────┤  → done
   │  bridge_wait(task_id)   │                          │
   │◀───────────────────────┤  final task state        │
```

`bridge_wait` polls the in-memory store and returns as soon as the task is
terminal (`done`, `failed`, or `cancelled`), or when its timeout elapses.

## Worker tracking

When the dispatcher launches a worker it records `dispatchedAt` and the
worker's `pid` on the task, and keeps the process handle. If the process
ends while the task is still `pending`/`claimed`, the task becomes `failed`
within seconds, with `exitCode` recorded and the reason — including any
quota/permission signature found in the spawn log — in `result`. Spawned
agents die silently often enough (quota exhaustion, permission denials,
missing binaries) that this is what keeps long delegation chains from
wedging.

A **watchdog** remains as the safety net for workers that are alive but
wedged, or for tasks a restarted hub can no longer track: `pending` past its
TTL (measured from `dispatchedAt`, so queued and polling-agent tasks are
exempt) or `claimed` with no result past its TTL becomes `failed`, and the
worker is killed.

Dispatch that can never succeed — unknown agent, missing adapter, loop-guard
depth exceeded, adapter failed to launch — fails the task immediately with
`dispatch refused: <reason>` rather than leaving it `pending`.

## Concurrency

`maxConcurrent` caps simultaneously running workers, hub-wide (default 4)
and optionally per agent. A delegation past the cap is accepted but
**queued** (`dispatch.queued: true`); it launches, FIFO, when a slot frees.

## Cancellation

`bridge_cancel` stops a task and everything delegated from it (children
first): running workers get `SIGTERM` on their whole process group, queued
tasks leave the queue, and each affected task becomes `cancelled` with
`cancelled by <agent>[: reason]` in `result`. Finished tasks are untouched. A
`bridge_post_result` arriving for a cancelled task is rejected.

## Tools

| Tool | Purpose |
| --- | --- |
| `bridge_delegate` | Create a task for a peer; the hub launches (or the peer polls for) it. |
| `bridge_claim` | Claim a `pending` task addressed to you (a specific `task_id`, or the oldest one); marks it `claimed`. |
| `bridge_post_result` | Finish a task (`done`/`failed`) with a result + artifacts. |
| `bridge_wait` | Block until a task finishes (or is cancelled) or times out. |
| `bridge_cancel` | Cancel a task and its descendants; kills running workers. |
| `bridge_say` | Post a note to a task's conversation (optionally addressed to a peer). |
| `bridge_thread` | Read a task's conversation, oldest first. |
| `bridge_task_get` | Fetch one task by id. |
| `bridge_list_tasks` | List tasks, optionally filtered by target/status. |
| `bridge_context_set` | Write a shared-context key. |
| `bridge_context_get` | Read one key, or list the whole blackboard. |

Also exposed: resource `bridge://context`, a read-only JSON mirror of the
blackboard.

## Conversation

The hub narrates every task into its thread: the delegating prompt, the
claim, tool calls and assistant text decoded from the worker's output
(Claude's `stream-json`; agy's final stdout), the posted result, and any
failure or cancellation. Agents add their own lines with `bridge_say`. The
`/chat` page and `GET /api/thread/:taskId` render a thread; a delegation
made with `parent_task_id` joins its parent's thread, so a follow-up from a
human continues the same conversation.

When the adapter can tell, the task also records `usage` (tokens, cost,
duration, turns) from the worker's result event.

## Artifacts

`bridge_post_result` accepts a list of artifacts: `{ kind, label?, value }`.
Standard kinds (consumers — dashboard, CLI — render these; other kinds pass
through untouched):

| kind | value |
| --- | --- |
| `file` | repo-relative path of a file created/changed |
| `diff` | unified diff text |
| `url` | a link |
| `log` | free-form text output (test runs, command output) |
| `note` | anything human-readable that fits nowhere else |

## Agent identity

The hub does not infer who is calling; each agent passes its own name (`from`,
`as`, `by`). An agent learns its name from the bootstrap prompt (spawned runs)
or from you telling it (interactive runs). Keep names stable per project — they
are the routing addresses.

## Loop guard

Every task has a `depth`; delegating from within a task increments it. The
dispatcher refuses to spawn past `maxDepth` (default 6), so a delegate-back
cycle terminates instead of forking agents forever.
