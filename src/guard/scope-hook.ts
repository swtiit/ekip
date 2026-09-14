#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook that keeps a run inside its conversation's
 * folder. ekip passes it to each spawned `claude -p` via --settings, with the
 * folder in EKIP_SCOPE. Exit code 2 blocks the tool call and hands the message
 * on stderr back to the model, so it can adjust instead of failing silently.
 */
import { checkToolCall } from "./scope.js";

const scope = process.env.EKIP_SCOPE;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  if (!scope) process.exit(0);
  let event: { tool_name?: string; tool_input?: unknown; cwd?: string };
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const verdict = checkToolCall(scope, event.cwd ?? scope, event.tool_name ?? "", event.tool_input);
  if (verdict.ok) process.exit(0);
  process.stderr.write(
    `ekip blocked this: ${verdict.path} is outside this conversation's folder (${scope}). ` +
      `Work only inside that folder. If the task truly needs something outside it, stop and say so in bridge_post_result.`,
  );
  process.exit(2);
});
