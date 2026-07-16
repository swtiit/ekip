# agent-bridge

A small, vendor-neutral **coordination hub** that lets multiple coding agents —
[Claude Code](https://docs.claude.com) and [Google Antigravity](https://antigravity.google)
today, others via adapters — **delegate tasks to each other and share context**,
using each tool's own supported feature set (MCP + headless CLI). Droppable into
any project.

> It uses only documented, sanctioned surfaces: Streamable HTTP MCP servers and
> the `claude -p` / `agy -p` headless CLIs. It does not scrape, automate around
> rate limits, or use one model's output to train another.

## How it works

Both agents connect as MCP clients to one hub. The hub keeps a **task queue** +
a **shared-context blackboard**, and a **dispatcher** that launches the target
agent's headless CLI when work is delegated. Because everything flows through
the hub, the relationship is symmetric — either agent can delegate to the other.

```
                 ┌──────────────────────────┐
                 │        agent-bridge      │
                 │  MCP server (HTTP/SSE)   │
                 │  task queue + blackboard │
                 │  + dispatcher            │
                 └──────────────────────────┘
        MCP ▲            │ spawns headless        ▲ MCP
            │            ▼                        │
   ┌────────┴───────┐  claude -p / agy -p  ┌──────┴─────────┐
   │  Claude Code   │◀────────────────────▶│  Antigravity   │
   └────────────────┘                      └────────────────┘
```

Layers stay decoupled: **protocol** (agent-agnostic contract) → **core** (hub) →
**adapters** (one file per agent). See [PROTOCOL.md](PROTOCOL.md).

## Quickstart

```bash
# Not on npm yet — from a clone:
npm install && npm run build && npm link   # gives you the `agent-bridge` command

cd /any/project
agent-bridge init                # writes config + prints MCP snippets to paste
agent-bridge serve               # starts the hub (MCP + dashboard) for this project
agent-bridge watch               # live terminal view of tasks and context
```

`serve` also hosts a zero-dependency **web dashboard** at `/ui` (e.g.
`http://127.0.0.1:4319/ui`): live task board (SSE), the context blackboard,
per-task logs, and a form to delegate work yourself — the human is just one
more peer on the bridge. The same data is available programmatically at
`GET /api/state`, `GET /api/events` (SSE), `POST /api/delegate`,
`POST /api/context`, and `GET /api/logs/:taskId`.

`init` prints the exact JSON to paste into each agent:

- **Claude Code** → the project's `.mcp.json` (or `claude mcp add`)
- **Antigravity** → `.agents/mcp_config.json` in the workspace, or
  `~/.gemini/config/mcp_config.json` globally. Note: Antigravity's schema
  requires `serverUrl` for remote servers (`url`/`httpUrl` are rejected).

Once both agents see the `agent-bridge` MCP server, tell one of them who it is
and hand off work, e.g. to Claude Code:

> You are the `claude` agent on the bridge. Delegate the CSS refactor to
> `antigravity` with `bridge_delegate`, then `bridge_wait` for the result.

## Configuration (`agent-bridge.config.json`)

```json
{
  "project": "my-project",
  "host": "127.0.0.1",
  "port": 4319,
  "agents": [
    { "name": "claude", "adapter": "claude", "spawnable": true },
    { "name": "antigravity", "adapter": "antigravity", "spawnable": true }
  ],
  "maxDepth": 6
}
```

- `spawnable: false` registers an agent that must **poll** (`bridge_claim`)
  instead of being auto-launched — useful for an agent you drive interactively.
- `cwd` / `args` per agent override the working dir and pass extra CLI flags
  (e.g. permission flags for headless Claude Code).
- `promptFile` points at a markdown file (relative to the project root) that
  is prepended to every bootstrap prompt for that agent — its standing "role
  skill" (persona, checklists, output contracts). Ready-made roles for a
  plan/debate/code/review/audit pipeline live in
  [examples/roles/](examples/roles/); the full flow that uses them is
  [examples/feature-pipeline.md](examples/feature-pipeline.md). Project-level
  knowledge (conventions, lint, CI) belongs in each tool's native files
  instead — CLAUDE.md / `.claude/skills/` and AGENTS.md — which spawned runs
  pick up automatically.

## Letting spawned agents edit files

Out of the box a spawned run can only talk to the bridge — real coding work
needs each tool's own permission surface opened up (all field-tested):

- **Claude Code**: add `"--permission-mode", "acceptEdits"` to the agent's
  `args` (file edits auto-accepted; shell commands still gated — allowlist
  specific ones via `--allowedTools "Bash(npm test:*)"` etc.).
- **Antigravity**: headless agy ignores `--mode accept-edits` and soft-denies
  any tool needing confirmation; grants live in
  `~/.gemini/config/config.json` under
  `userSettings.globalPermissionGrants.allow`. Minimum for a coder role:
  `"write_file(*)"` (scope the pattern tighter if you prefer), plus
  `"command(<cmd>)"` entries for whatever it must run (tests, linters).
  The adapter always passes `--add-dir <cwd>` — without it a headless run in
  an untrusted folder writes files into agy's own scratch directory instead
  of the project.

## Watchdog

Spawned agents die silently often enough (quota exhaustion, permission
denials) that the hub sweeps orphaned tasks: `pending` past its TTL
(spawnable targets only) or `claimed` without progress becomes `failed`,
and the reason — including any quota/permission signature found in the spawn
log (e.g. Claude's "session limit", agy's "auto-denied") — lands in the
task's `result`. Tune via config:

```json
"watchdog": { "pendingTtlSeconds": 600, "claimedTtlSeconds": 3600 }
```

Neither vendor exposes remaining-quota programmatically today (Claude has
interactive `/usage`, Antigravity shows credits in its IDE), so the bridge
surfaces quota problems *post-mortem* via these failure reasons.

## Adding another agent

For most CLIs you don't need code — use the generic **`command` adapter** and
describe the invocation in config. `{prompt}`, `{hubUrl}`, `{taskId}`,
`{agent}`, and `{depth}` are substituted into the args (if no arg mentions
`{prompt}`, it is appended last), and the same values are exported as
`AGENT_BRIDGE_*` env vars:

```json
{
  "name": "codex",
  "adapter": "command",
  "command": "codex",
  "args": ["exec", "{prompt}"]
}
```

For agents that need bespoke behavior, implement the `Adapter` interface
(`id`, `spawn`, `mcpConfigSnippet`, `mcpConfigLocation`) in `src/adapters/`,
register it in `src/core/index.ts`, and reference its `id` from config. The
core never changes.

## Status

v0.2 — everything in v0.1 plus the `/ui` web dashboard (single-file, SSE, no
new dependencies), `agent-bridge watch`, the observation/delegation HTTP API,
and the generic `command` adapter (verified end-to-end with a scripted mock
agent driving the full claim → post_result loop over MCP).

**Antigravity verified end-to-end** against the real `agy` 1.1.3 binary
(`brew install antigravity-cli` — the npm package of that name is an
unrelated squatter): the hub spawned `agy -p` on Gemini 3.5 Flash, which
claimed the task, read the blackboard, and posted its result over MCP.
Headless agy setup has two sharp edges, both documented in
`src/adapters/antigravity.ts`: register the hub in the **global**
`~/.gemini/config/mcp_config.json` (workspace `.agents/` config is ignored
until the folder is trusted interactively), and allow the bridge tools with
`"mcp(agent-bridge/*)"` under `userSettings.globalPermissionGrants.allow` in
`~/.gemini/config/config.json`.

v0.1 — hub, dispatcher, Claude + Antigravity adapters, and the full task/context
tool surface are implemented. Verified end-to-end **with real Claude Code
processes on both sides**: a headless `claude -p` caller delegated through the
hub, the dispatcher spawned a second headless Claude, and the task round-tripped
`pending → claimed → done` (context blackboard included) in ~12 s.

Field notes from that run, baked into the Claude adapter:

- Spawned runs get the bridge server via an **inline `--mcp-config` +
  `--strict-mcp-config`**, so they don't depend on the project's `.mcp.json`
  and don't load the user's global MCP servers (which added minutes of startup
  and kept processes alive). Extra `--mcp-config` entries in the agent's
  `args` compose on top.
- User-level plugin hooks (e.g. SessionEnd hooks) still run in spawned
  sessions and can keep the process alive until Claude's hook timeout. Harmless
  to the bridge — results arrive via `bridge_post_result` long before — but
  worth knowing when you see lingering `claude` processes.

Not yet exercised against the real `agy` binary; see the field notes in
`src/adapters/antigravity.ts` for known agy headless gotchas (429 → silent
empty exit, no caller-chosen session ids). Richer artifacts and a task-watchdog
for orphaned `pending` tasks are the next steps.

## Prior art & positioning

One-way bridges that expose agy as a *tool inside* Claude Code already exist
([agy-bridge](https://github.com/sshahzaiib/agy-bridge),
[claude-to-agy](https://github.com/rauls-kjarners/claude-to-agy)), and
[AWS Labs CAO](https://github.com/awslabs/cli-agent-orchestrator) orchestrates
many CLIs under a tmux supervisor–worker hierarchy. agent-bridge occupies the
gap between them: **symmetric peer delegation + a shared context blackboard**,
per-project, npm-light, no tmux/Python stack.

## License

MIT
