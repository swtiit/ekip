# Feature pipeline: plan → debate → code → review → audit

The full 7-stage flow, generalized from the field-tested
[mini-pipeline](mini-pipeline.md). One conductor drives everything
hub-and-spoke (delegation depth stays ≤ 2), all hand-off state lives on the
blackboard, every loop has a hard cap.

## Cast (agent-bridge.config.json)

| agent | adapter | model (suggested) | promptFile |
|---|---|---|---|
| conductor | claude | sonnet | examples/roles/conductor.md |
| planner | claude | opus | examples/roles/planner.md |
| critic | claude | sonnet (opus for hard problems) | examples/roles/critic.md |
| coder | antigravity | Gemini flash/pro | examples/roles/coder.md |
| reviewer | claude | sonnet | examples/roles/reviewer.md |
| auditor | claude | opus | examples/roles/auditor.md |

Copy `examples/roles/` into the project (e.g. `.agent-bridge/roles/`) and
point each agent's `promptFile` at its role.

**Cost estimate before you run**: best case 6 spawns (2 opus, 3 sonnet-class,
1 coder); worst case with all loop caps hit ≈ 12 spawns. Neither vendor
exposes remaining quota programmatically — budget accordingly and let the
watchdog surface quota deaths.

**Permissions**: coder needs file-write plus the project's test command (see
README "Letting spawned agents edit files"); reviewer/auditor read-only;
planner/critic/conductor need nothing beyond the bridge.

## Stage 0 — onboard (once per project, separate task)

Delegate to `planner` when the bridge first lands in a repo:

> Research this repository (language, frameworks, lint/CI setup, test
> commands, conventions). Propose and write the agent equipment files:
> CLAUDE.md and .claude/skills/* for Claude agents, AGENTS.md for
> Antigravity — each capturing THIS repo's conventions, best practices, and
> the exact build/test/lint commands. Do not restate what a config file
> already says — point to it. Store a summary under context key
> `onboard.summary`, post result: the file list you wrote.

Review what it wrote before trusting it — this is the one stage whose output
steers every later agent.

## Conductor task prompt (template)

Fill `{REQUIREMENT}` and `{TEST_CMD}`, then delegate this to `conductor`:

```text
You run a 5-stage pipeline for this requirement:
{REQUIREMENT}

Follow your standing role rules (wait-loop semantics, no investigation,
parent_task_id on every delegate). Blackboard keys for this run use the
prefix given here as KEYPREFIX=feat1.

STAGE 1 — PLAN. Delegate to 'planner': research the repo and write a plan
for the requirement; store it as <KEYPREFIX>.plan.v1; result = one-line
summary. Wait.

STAGE 2 — DEBATE (max 3 rounds). For N = 1..3:
  Delegate to 'critic': read <KEYPREFIX>.plan.vN, critique it, store
  <KEYPREFIX>.critique.vN starting with SCORE:<0-100>; result = the SCORE
  line. Wait.
  If SCORE >= 90: proceed to STAGE 3.
  Else delegate to 'planner': read <KEYPREFIX>.critique.vN, revise into
  <KEYPREFIX>.plan.v(N+1); result = one-line summary. Wait.
After 3 rounds without SCORE >= 90: post your own result as failed with
"debate deadlock" plus the last SCORE line, and STOP.

STAGE 3 — CODE. Delegate to 'coder': read the final plan key, implement it
exactly (code AND tests the plan calls for), self-verify with {TEST_CMD}
(the only command allowed), final action bridge_post_result with files +
test outcome. Wait.

STAGE 4 — REVIEW LOOP (max 3 rounds). For N = 1..3:
  Delegate to 'reviewer': review the changes against the final plan; store
  <KEYPREFIX>.review.roundN starting with APPROVE or REVISE; result = the
  verdict + one line. Wait.
  If APPROVE: proceed to STAGE 5.
  Else delegate to 'coder': read <KEYPREFIX>.review.roundN, fix ONLY the
  listed issues, re-verify with {TEST_CMD}, post result. Wait.
After 3 rounds without APPROVE: post failed with "review deadlock" plus the
last verdict, and STOP.

STAGE 5 — AUDIT. Delegate to 'auditor': audit the whole result against the
original requirement above; store <KEYPREFIX>.audit.final starting with
SHIP or HOLD; result = the human-readable final report. Wait.

FINALLY post done on your own task:
result = the auditor's report verbatim, prefixed with one line per stage:
plan rounds used, review rounds used, final verdicts.
```

QA/QC note: unit + e2e tests ride inside STAGE 3/4 (the plan must call for
them, the coder writes and runs them, the reviewer judges them) — a separate
test-only pipeline is this same template with a testing requirement.

## Known sharp edges

- Consensus scores and APPROVE verdicts are model judgment — the caps are
  what protect your quota, not the models' politeness.
- A permission soft-denial kills an agy run before it can report; the
  watchdog will fail the stage with the log hint. Widen grants, then re-run.
- Stage runtimes vary wildly with model choice; the conductor's 4×240 s
  wait budget per stage accommodates opus-class planning and flash-class
  coding comfortably.
