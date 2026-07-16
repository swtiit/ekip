# Mini pipeline: plan → code → review (conductor pattern)

Field-tested 3-stage pipeline run entirely over the bridge: a `conductor`
agent (Claude) drives `planner` (Claude) → `agy` (Antigravity) → `reviewer`
(Claude) via `bridge_delegate` + `bridge_wait`, with all hand-off state on the
blackboard. Hub-and-spoke keeps delegation depth at 2 regardless of stage
count.

First run of this pipeline failed in instructive ways. The rules below are
scar tissue — keep them in any conductor prompt:

## Iron rules (learned the hard way)

1. **A `bridge_wait` timeout is not a failure.** The wait returns the task's
   current state; `pending`/`claimed` means *still working* — wait again (cap
   the retries, e.g. 4 × 240 s). Only `status=failed` is failure. Our first
   conductor treated one timeout as failure and aborted a stage that was 30
   seconds from finishing.
2. **The conductor must not investigate outside the bridge.** Given implicit
   read access, a small model wandered into `.agent-bridge/logs/`, found
   *stale* failures from previous runs, and invented a causal story (even
   claiming it had edited config files it cannot touch). Bridge tool outputs
   are the single source of truth.
3. **A permission soft-denial kills the whole headless agy run** — not just
   that one tool call, and it dies *before* posting any result. Grants must
   cover the agent's full expected toolset (e.g. `command(python3)` so a
   coder can self-verify tests), or the prompt must forbid the tool class.
4. **Tell workers their final action MUST be `bridge_post_result`.** agy
   finished the actual work, then died on a side quest before reporting;
   pinning the report as the mandatory last step makes runs conclude.

## Conductor task prompt (template)

```text
You are the CONDUCTOR of a 3-stage pipeline. Your own task id is in your
bootstrap instructions — call it CONDUCTOR_ID.

IRON RULES:
- Use ONLY agent-bridge MCP tools. NEVER read files or logs to diagnose
  anything; the bridge tool outputs are your single source of truth.
- bridge_wait returns the task state when it finishes OR when the wait times
  out. A task still pending/claimed after a wait has NOT failed — call
  bridge_wait again on the same task_id, up to 4 total waits of
  timeout_seconds=240 each. Only status=failed means the stage failed. If a
  stage fails or exhausts all waits, bridge_post_result on CONDUCTOR_ID with
  status=failed and the reported reason, then STOP.

STAGE 1 — PLAN. bridge_delegate from='conductor', to='planner',
parent_task_id=CONDUCTOR_ID, prompt='…design a short plan… store it via
bridge_context_set key=plan.v2 by=planner. Post result: one-line summary.'
Then wait per the iron rules.

STAGE 2 — CODE. bridge_delegate to='agy', prompt='bridge_context_get
key=plan.v2, implement EXACTLY that plan with write_to_file… You may run
python3 to verify (the ONLY command allowed). IMPORTANT: your final action
MUST be bridge_post_result on your bootstrap task id.' Then wait.

STAGE 3 — REVIEW. bridge_delegate to='reviewer', prompt='bridge_context_get
key=plan.v2, read the created files, review against the plan. Store the full
review via bridge_context_set key=review.v2.round1 by=reviewer; value MUST
start with APPROVE or REVISE. Post result: verdict + one line.' Then wait.

FINALLY: bridge_post_result on CONDUCTOR_ID status=done
result: plan=<summary> | code=<agy result> | review=<verdict>.
```

## Result of the reference run

- planner (haiku): plan stored as `plan.v2`, e.g. sqrt-optimized `is_prime`
  plus assert-based tests.
- agy (Gemini 3.5 Flash High): wrote `mathx.py` + `test_mathx.py`, ran
  `python3 test_mathx.py` itself → "ALL TESTS PASSED", posted done.
- reviewer (haiku): line-by-line review on the blackboard, verdict APPROVE.
- conductor (haiku): single summary result. Total: 5 tasks, depth ≤ 2,
  ~6 minutes, fully unattended.
