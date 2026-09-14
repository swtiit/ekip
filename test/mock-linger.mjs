// Like mock-agent, but the process hangs around after posting its result —
// the way a real `claude -p` lingers on session hooks. Used to prove the
// concurrency slot is freed at post_result, not at process exit.
await import("./mock-agent.mjs");
await new Promise((r) => setTimeout(r, 5000));
