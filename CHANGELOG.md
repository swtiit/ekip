# Changelog

## 0.7.0

Two changes affect how an existing hub behaves; both take care of themselves
on the next `ekip serve`.

**A hub now has a token, and agents get a weaker one.** Two credentials are
generated on first use and kept in `~/.ekip/auth.json` (`ekip token` prints
them). Yours opens the HTTP API and MCP — `ekip ui` and the CLI use it
automatically, the web app asks once and remembers it. The agent token,
handed to every spawned run, is accepted on `/mcp` only, so a run that a file
talks into something cannot call the API to start work in another folder. An
agent you drive yourself needs `EKIP_AGENT_TOKEN`; `ekip init` writes that
header into `.mcp.json`. `"openAccess": true` runs without tokens.

**The hub's records moved out of the project** to
`~/.ekip/projects/<project>-<hash>/` — tasks, conversations, the blackboard,
spawn logs. A run working in the project that hosts the hub could otherwise
read every conversation of every folder that hub has served. An older layout
is moved on the next start. `.ekip/roles` and `.ekip/flows` stay with the
project.

### Also

- **`ekip start` runs the hub and opens the web app, from any folder.** A hub
  no longer needs a project config to start: without one you get your own hub
  — the crew saved in `~/.ekip` — and each conversation picks its folder in
  the app (work with no folder chosen happens in `~/ekip`). A project that
  wants its own crew still uses `ekip init` and gets its own hub, as before.

- **Each run proves who it is.** Every launched worker gets a secret run key;
  only that key claims its task, queued work can't be claimed ahead of its
  run, and a run's `bridge_delegate` is linked to its own task.
- **Check a model id** from Settings or `ekip models --check <id>`: it runs
  one tiny task and reports what the id really resolves to
  (`sonnet → claude-sonnet-5`). `ekip models --refresh` does the four aliases.
- **Interface language** is its own setting (English, Vietnamese, per
  browser), separate from the reporting language.
- **Tighter Gemini sandbox**: writes in your home are an allowlist, and
  credentials, shell history, browser profiles and `~/.ekip` are unreadable.
- **No crash paths**: a malformed cookie, a failed launch, a torn state file
  and a leaked file descriptor each used to be able to take the hub down or
  strand a task.
- **Stopping and restarting**: stopping the hub stops its workers; on start,
  queued work runs again and a flow left mid-run is failed with the reason.
- **Budget minutes** start when the first run launches, so queueing or waiting
  for a person is free. **Retention** removes whole conversations only.
- The hub writes its own notices in the reporting language.
- Requires Node 22+.

## 0.6.0

Budgets per request (runs, output tokens, minutes), flows the hub runs itself
with gates and capped loops, one editor per folder, the macOS sandbox for
Antigravity runs, and the browser test suite.
