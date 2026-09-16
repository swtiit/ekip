# ekip protocol (v0.7.0)

Vendor-neutral contract for coordinating multiple coding agents over MCP. No
part of it names a specific agent or project — Claude Code and Antigravity are
just the first two adapters.

## Model

- **Task** — a unit of work addressed *from* one agent *to* another. It carries
  a `prompt` (the instruction), optional structured `context`, and moves through
  `pending → claimed → done | failed | cancelled`.
- **Context** — a key/value blackboard agents read and write, one per folder:
  a run sees the blackboard of the folder its task works in (the task it
  claimed or delegates from, or an explicit `task_id`). Used
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

Stopping the hub kills the workers it launched and fails their tasks with the
reason. On start the hub launches again tasks that were queued (pending,
never launched, for a member it launches) and fails a flow root still running
(its runner was in the old process), cancelling its unstarted stages. An MCP
request carrying an unknown session id gets `404`, which tells the client to
initialize a new session. The state file is replaced atomically; an
unreadable one is renamed `state.json.corrupt-<time>`. State and spawn logs
live in `~/.ekip/projects/<project>-<hash of its path>/`, outside the project
a hub serves; a pre-0.7 layout inside the project is moved there on start. The watchdog's idle
clock counts messages a run produces (tool calls, notes), not only task
updates.

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

`maxConcurrent` caps simultaneously running workers per folder (default 4)
and optionally per agent within a folder; `maxConcurrentTotal` caps them
across all folders (default 8). A delegation past a cap is accepted but
**queued** (`dispatch.queued: true`); it launches, FIFO, when a slot frees.

## Budgets

A **request** is a task a person made (`from: "human"`), a flow root, or a
task with no parent. Every task below it spends from its budget, except a
nested request (a person's follow-up starts its own). The budget counts
worker **runs** launched, **output tokens** reported, and **minutes** since the
first run for the request was launched (time queued, or waiting for a person
or a polling agent, is not counted); limits come from the request's `budget`, then the hub's
`budget`, then the defaults (20 runs, no token cap, 120 minutes), and `0`
means no limit.

- Before launching a worker the dispatcher counts runs already launched and
  queued in the request; at a limit the task fails with
  `dispatch refused: budget …` and a `system` message with `meta.budget =
  { kind, used, limit }`.
- A flow checks its budget before each stage and stops with the latest
  stage result.
- On the watchdog's beat, a live request past its minutes is cancelled —
  its running workers are killed — with the same `meta.budget` message.
- `GET /api/thread/:taskId` returns `budgets`: `{ root, used, limit, live }`
  for each request in the conversation.

## Folders

A task works in a folder (`cwd`, inherited by everything delegated from it;
the project root when unset). Each folder has its own blackboard. With
`folderGuard` on (the default) every run is told its folder, and adapters that
support it enforce the boundary — Claude runs get a PreToolUse hook that
blocks file, search and shell access outside the folder, and the hub records
each block as a `system` message with `meta.guard`.

## Flows

A flow is an ordered list of steps the hub runs itself. Starting one
(`POST /api/flows/run {flow, input, cwd?}`) creates a root task addressed to
`flow:<name>`, marked `claimed` while it runs. Each step becomes a child task
for the step's agent, dispatched like any delegation; the hub waits for it,
then checks its `gate` against the result:

- `{ "pattern": "<regex with one capture group>", "min": N }` — passes when
  the captured number is ≥ N;
- `{ "startsWith": ["APPROVE", …] }` — passes when the result opens with one
  of the words (case-insensitive).

A miss with `onFail: { goto, maxRounds }` runs from step `goto` again, with
the result available to prompts as `{{feedback}}`, until `goto` has run
`maxRounds` times; after that — or on a miss with no `onFail`, or a step that
ends `failed`/`cancelled` — the root task fails with the reason. When every
step passes the root is `done`, and its result lists each step's verdict
followed by the last step's result. Gate verdicts are `system` messages on
the root with `meta.gate` = `pass` | `retry` | `stop`. Cancelling the root
cancels the running step and ends the flow.

## Ownership

When the dispatcher launches a worker it issues a **run key** for that task —
a random secret passed only to that worker (bootstrap prompt, `EKIP_RUN_KEY`,
and for Claude an `x-ekip-run` MCP header). `bridge_claim` with a `task_id`
the hub launched a worker for must present the key (`run_key`, or the session
header). A task queued for a member the hub launches can't be claimed before
its run starts, and a claim without `task_id` never returns such tasks —
polling is for members with `spawnable: false`. Keys are forgotten when the
task reports, its worker exits, or it is cancelled.

A run that claims a task owns it. While that session is connected,
`bridge_post_result` for the task from any other session is refused. A `done`
result is final; a `failed` one can be replaced only by the run that claimed
it (a late report after the watchdog gave up).

For a session that claimed with a valid run key, `bridge_delegate` defaults
`parent_task_id` to that task and refuses a parent that isn't the task or one
of its descendants. An unknown `parent_task_id` is an error.

## Editors

A member that edits files (`writer`, or inferred from its adapter and
permissions) holds its folder's editor slot while it runs; with
`writersPerFolder` (default 1) reached, another editor for the same folder
queues. On macOS, agents with `sandbox` (default for Antigravity) run under
`sandbox-exec`, confined to their folder at the OS level.

## Access

State-changing requests to `/api/*` and `/mcp` must carry
`Content-Type: application/json` and, if an `Origin` is sent, match the Host.
The Host must be one of the hub's addresses. A hub has two credentials (generated on first use, in `~/.ekip/auth.json`):
the operator's `token`, required on every `/api/*` and `/mcp` request, and the
`agentToken` handed to spawned runs, accepted on `/mcp` only. Either is
presented as `Authorization: Bearer <token>`, `x-ekip-token`, or the
`ekip_token` cookie; otherwise the hub answers `401`. `openAccess: true`
disables both.

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
| `bridge_claim` | Claim a `pending` task addressed to you: a specific `task_id` (with the `run_key` the hub issued, for launched runs), or the oldest one (polling members only); marks it `claimed`. |
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
Standard kinds (consumers — the web app, CLI — render these; other kinds pass
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

## HTTP API

Every `/api/*` route and `/mcp` follow the access rules above. Bodies are JSON.

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness; says only `{ ok, auth }` without a valid token on a token hub |
| `POST /api/login` | `{ token }` → sets the `ekip_token` cookie |
| `GET /api/state` | Tasks, agents, blackboard, workers |
| `GET /api/events` | Server-sent change events |
| `GET /api/threads` | Conversations with counts and folder |
| `GET /api/thread/:taskId` | One conversation: tasks, messages, `budgets` |
| `POST /api/threads/delete` | `{ id, stop? }` delete a conversation (409 while running unless `stop`) |
| `POST /api/delegate` | `{ to, prompt, title?, from?, parent_task_id?, cwd?, budget? }` |
| `POST /api/cancel` | `{ task_id, by?, reason? }` cancel a task and its descendants |
| `POST /api/context` | `{ key, value, by?, folder? }` write the blackboard |
| `GET /api/logs/:taskId` | Last 32 KB of a run's spawn log |
| `GET /api/flows` · `POST /api/flows/run` | List flows (with problems) · `{ flow, input, cwd?, from? }` start one |
| `GET /api/folders` · `POST /api/folders` | Recent folders · remember one |
| `GET /api/browse?path=` | Sub-folders of a folder, for the folder picker |
| `GET /api/models` | Model lists per adapter |
| `GET /api/limits` | Effective limits: concurrency, guard, budget, watchdog, retention, language |
| `GET /api/billing` | How `claude` bills: subscription or API key |
| `GET /api/role/:agent` | A member's role file |
| `POST /api/config/agent` | Edit a member (label, description, model, effort, parallelism, auto-launch) |
| `POST /api/config/hub` | `{ language?, budget? }` hub settings |
| `GET /chat`, `/board`, `/guide`, `/settings` | The web app (`/ui` redirects to `/board`) |

