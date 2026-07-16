# agent-bridge protocol (v0.2.0)

Vendor-neutral contract for coordinating multiple coding agents over MCP. No
part of it names a specific agent or project — Claude Code and Antigravity are
just the first two adapters.

## Model

- **Task** — a unit of work addressed *from* one agent *to* another. It carries
  a `prompt` (the instruction), optional structured `context`, and moves through
  `pending → claimed → done | failed`.
- **Context** — a shared key/value blackboard both agents read and write. Used
  for hand-off state that isn't a discrete task (plans, decisions, file notes).
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
`done`/`failed`, or when its timeout elapses.

A **watchdog** in the hub sweeps orphaned tasks: `pending` past its TTL
(spawnable targets only — polling agents may legitimately wait) or `claimed`
with no result past its TTL becomes `failed`, with the reason — including any
quota/permission signature found in the spawn log — recorded in `result`.
Spawned agents die silently often enough (quota exhaustion, permission
denials) that this is what keeps long delegation chains from wedging.

## Tools

| Tool | Purpose |
| --- | --- |
| `bridge_delegate` | Create a task for a peer; the hub launches (or the peer polls for) it. |
| `bridge_claim` | Claim a `pending` task addressed to you (a specific `task_id`, or the oldest one); marks it `claimed`. |
| `bridge_post_result` | Finish a task (`done`/`failed`) with a result + artifacts. |
| `bridge_wait` | Block until a task finishes or times out. |
| `bridge_task_get` | Fetch one task by id. |
| `bridge_list_tasks` | List tasks, optionally filtered by target/status. |
| `bridge_context_set` | Write a shared-context key. |
| `bridge_context_get` | Read one key, or list the whole blackboard. |

Also exposed: resource `bridge://context`, a read-only JSON mirror of the
blackboard.

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
