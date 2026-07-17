// Test mock agent: speaks raw MCP Streamable HTTP, claims the exact task id
// it was spawned for (argv[2], substituted from {taskId}), posts a result.
const url = process.env.EKIP_URL;
const agent = process.env.EKIP_AGENT;
const taskId = process.argv[2];

async function rpc(method, params, id, session) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const sid = res.headers.get("mcp-session-id") ?? session;
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  let msg;
  if (ct.includes("text/event-stream")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:"));
    msg = JSON.parse(data[data.length - 1].slice(5).trim());
  } else if (text) {
    msg = JSON.parse(text);
  }
  return { sid, msg };
}

const init = await rpc(
  "initialize",
  { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "mock", version: "0" } },
  1,
);
const sid = init.sid;
await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-session-id": sid,
  },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});

const claim = await rpc(
  "tools/call",
  { name: "bridge_claim", arguments: { as: agent, task_id: taskId } },
  2,
  sid,
);
const payload = JSON.parse(claim.msg.result.content[0].text);
if (!payload.task) {
  console.log("claim refused:", payload.error ?? "no task");
  process.exit(0);
}
console.log("claimed", payload.task.id);
await rpc(
  "tools/call",
  {
    name: "bridge_post_result",
    arguments: {
      task_id: payload.task.id,
      status: "done",
      result: `mock done: ${payload.task.title}`,
      artifacts: [
        { kind: "note", label: "who", value: agent },
        { kind: "log", label: "run", value: "claimed and posted over raw MCP" },
      ],
    },
  },
  3,
  sid,
);
console.log("posted", payload.task.id);
