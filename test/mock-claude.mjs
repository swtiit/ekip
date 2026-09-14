// Pretends to be `claude -p --output-format stream-json`: prints the event
// envelope the real CLI emits (init, assistant text, tool_use, result), then
// behaves like mock-agent (claims its task over MCP and posts a result).
const line = (o) => process.stdout.write(JSON.stringify(o) + "\n");
line({ type: "system", subtype: "init", session_id: "fake", tools: ["Bash"] });
line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Let me look at the task first." }] } });
line({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", input: { command: "echo probe-ok", description: "probe" } }] } });
line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "probe-ok" }] } });
line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Done — the probe printed `probe-ok`." }] } });
line({ type: "result", subtype: "success", is_error: false, result: "ok", total_cost_usd: 0.0123, duration_ms: 1234, num_turns: 3, usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 50 } });
process.stdout.write("not json: hook chatter\n");
await import("./mock-agent.mjs");
