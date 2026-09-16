// Browser suite: boots a real hub with scripted agents and drives the web app
// in headless Chrome — the recipient picker, sending, the transcript, a flow
// with its gate, the in-app delete dialog, Settings and the palette.
// Uses the Chrome already installed (playwright-core downloads no browser).
// Run with `npm run test:ui`. Set UI_REQUIRED=1 to fail when Chrome is missing.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { chromium } from "playwright-core";
import { startServer } from "../dist/core/index.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "ekip-ui-"));
process.env.EKIP_HOME = join(TMP, "machine-home");
const MOCK = join(REPO, "test", "mock-agent.mjs");
const PORT = await new Promise((res) => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1", () => {
    const p = probe.address().port;
    probe.close(() => res(p));
  });
});
const BASE = `http://127.0.0.1:${PORT}`;

const config = {
  project: "ui",
  host: "127.0.0.1",
  port: PORT,
  projectRoot: TMP,
  agents: [
    { name: "mock", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}"], label: "Mock helper", description: "Answers right away." },
    { name: "grader", adapter: "command", spawnable: true, command: process.execPath, args: [MOCK, "{taskId}", "--script=REVISE: tighten it|APPROVE: good"], label: "Grader" },
  ],
  watchdog: { pendingTtlSeconds: 20, claimedTtlSeconds: 20, sweepIntervalSeconds: 1 },
};
writeFileSync(join(TMP, "ekip.config.json"), JSON.stringify(config));
mkdirSync(join(TMP, ".ekip", "flows"), { recursive: true });
writeFileSync(join(TMP, ".ekip", "flows", "check.json"), JSON.stringify({
  name: "check", label: "Make and check",
  steps: [
    { id: "make", agent: "mock", title: "Make", prompt: "{{input}} {{feedback}}" },
    { id: "check", agent: "grader", title: "Check", prompt: "check {{prev.make}}", gate: { startsWith: ["APPROVE"] }, onFail: { goto: "make", maxRounds: 3 } },
  ],
}));

const results = [];
function t(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  ✔" : "  ✖ FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch (err) {
  const msg = `Chrome not available (${String(err.message).split("\n")[0]})`;
  if (process.env.UI_REQUIRED) {
    console.error(msg);
    process.exit(1);
  }
  console.log(`skipped: ${msg}`);
  process.exit(0);
}

const hub = await startServer(config);
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`${e.message} @ ${page.url()} ${(e.stack ?? "").split("\n").slice(1, 3).join(" ")}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`${m.text()} ${m.location()?.url ?? ""}`); });
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; void d.dismiss(); });

try {
  // ---- chat: pick a recipient, send, read the result ----
  await page.goto(`${BASE}/chat`);
  await page.waitForSelector("#text");
  t("chat loads without script errors", errors.length === 0, errors.join(" | "));

  await page.click("#text");
  await page.keyboard.type("@");
  await page.waitForSelector("#agent-pop:not([hidden]) [data-pick]");
  const picks = await page.$$eval("#agent-pop [data-pick]", (els) => els.map((e) => e.getAttribute("data-pick")));
  t("recipient picker lists the crew", picks.includes("mock") && picks.includes("grader"), picks.join(","));
  t("recipient picker lists flows", picks.includes("flow:check"), picks.join(","));

  await page.click('#agent-pop [data-pick="mock"]');
  await page.fill("#text", "say hello from the browser");
  await page.click("#send");
  await page.waitForURL(/\/chat\/[0-9a-f-]+$/, { timeout: 8000 });
  const firstId = page.url().split("/").pop();
  await page.waitForSelector(".answer", { timeout: 10000 });
  const outcome = await page.textContent(".answer");
  t("sending shows the agent's answer in the transcript", /mock done/.test(outcome ?? ""), outcome ?? "");
  t("the request appears as your bubble", (await page.textContent(".you .text"))?.includes("say hello from the browser"));
  t("the conversation is listed in the sidebar", (await page.$$(`[data-del="${firstId}"]`)).length > 0);

  // ---- a flow: stages, a gate that loops once, then passes ----
  await page.goto(`${BASE}/chat`);
  await page.waitForSelector("#text");
  await page.click("#text");
  await page.keyboard.type("@");
  await page.waitForSelector('#agent-pop [data-pick="flow:check"]');
  await page.click('#agent-pop [data-pick="flow:check"]');
  await page.fill("#text", "build the widget");
  await page.click("#send");
  await page.waitForURL(/\/chat\/[0-9a-f-]+$/, { timeout: 8000 });
  await page.waitForSelector(".notice.gate.pass", { timeout: 20000 });
  t("flow shows its stage map", (await page.$$(".flowmap .fs")).length === 2);
  t("flow shows the retry, then the pass", (await page.$$(".notice.gate.retry")).length === 1 && (await page.$$(".notice.gate.pass")).length === 1);
  await page.waitForSelector(".answer", { timeout: 10000 });
  await page.waitForFunction(() => /all stages passed/.test(document.querySelector(".answer")?.textContent ?? ""), null, { timeout: 10000 }).catch(() => {});
  t("flow ends with its answer", /all stages passed/.test((await page.textContent(".answer")) ?? ""), (await page.textContent(".answer"))?.slice(0, 200));
  const folded = await page.$$eval(".outcome.nested", (els) => els.map((e) => ({ open: e.open, peek: e.querySelector(".peek")?.textContent ?? "" })));
  t("each stage's report is folded to one line", folded.length >= 2 && folded.every((f) => !f.open && f.peek.length > 0), JSON.stringify(folded).slice(0, 200));
  await page.click(".outcome.nested > summary");
  t("a folded report opens on click", await page.$eval(".outcome.nested", (e) => e.open));
  t("header counts the runs", /4 runs/.test((await page.textContent("#chat-top, .chat-top, header")) ?? "") || /4 runs/.test(await page.content()));

  // ---- delete through the in-app dialog, never the browser's ----
  await page.goto(`${BASE}/chat/${firstId}`);
  await page.waitForSelector(`[data-del-current="${firstId}"]`);
  await page.click(`[data-del-current="${firstId}"]`);
  await page.waitForSelector("#dialog.on", { timeout: 4000 });
  t("delete asks in an in-app dialog", nativeDialogs === 0 && (await page.isVisible("#dlg-ok")));
  await page.click("#dlg-ok");
  await page.waitForFunction((id) => !document.querySelector(`[data-del="${id}"]`), firstId, { timeout: 6000 });
  const gone = await (await fetch(`${BASE}/api/thread/${firstId}`)).status;
  t("confirming deletes the conversation", gone === 404, String(gone));

  // ---- settings: a budget change saves ----
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("#budget-runs option", { state: "attached" });
  await page.selectOption("#budget-runs", "10");
  let saved;
  for (let i = 0; i < 30 && saved !== 10; i++) {
    saved = (await (await fetch(`${BASE}/api/limits`)).json()).budget.runs;
    if (saved !== 10) await new Promise((r) => setTimeout(r, 150));
  }
  t("settings saves the budget", saved === 10, String(saved));

  // ---- interface language ----
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("#ui-lang-select option", { state: "attached" });
  await page.selectOption("#ui-lang-select", "vi");
  await page.waitForFunction(() => /Trò chuyện/.test(document.querySelector("nav, header, body").textContent), null, { timeout: 4000 }).catch(() => {});
  t("interface can be switched to Vietnamese", /Trò chuyện/.test(await page.content()) && /Ngôn ngữ giao diện/.test(await page.content()));
  const reportStill = await page.$eval("#lang-select", (el) => el.value);
  t("switching the interface leaves the reporting language alone", reportStill === "", reportStill);
  await page.reload();
  await page.waitForSelector("#ui-lang-select option", { state: "attached" });
  t("the choice sticks across a reload", (await page.$eval("#ui-lang-select", (el) => el.value)) === "vi" && /Trò chuyện/.test(await page.content()));
  await page.selectOption("#ui-lang-select", "en");
  await page.waitForFunction(() => /Reporting language/.test(document.body.textContent), null, { timeout: 4000 }).catch(() => {});
  t("and back to English", /Reporting language/.test(await page.content()));

  // ---- guide and palette ----
  await page.goto(`${BASE}/guide`);
  await page.waitForSelector(".gsec svg.dg", { state: "attached" });
  t("guide renders its diagrams", (await page.$$(".gsec svg.dg")).length >= 5);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.waitForSelector("#palette.on", { timeout: 3000 });
  await page.keyboard.type("Make and check");
  t("palette finds a flow", /Make and check/.test((await page.textContent("#pal-results")) ?? ""));
  await page.keyboard.press("Escape");

  t("no script errors across the session", errors.length === 0, errors.join(" | "));
  t("no browser-native dialogs were used", nativeDialogs === 0);
} catch (err) {
  t(`suite crashed: ${err.message.split("\n")[0]}`, false);
  await page.screenshot({ path: join(TMP, "ui-failure.png") }).catch(() => {});
  console.log(`screenshot: ${join(TMP, "ui-failure.png")}`);
} finally {
  await browser.close();
  await hub.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} cases · ${results.length - failed.length} pass · ${failed.length} fail`);
// Keep the scratch folder only when something failed (the screenshot is in it).
if (failed.length || process.env.KEEP_TMP) console.log(`scratch kept: ${TMP}`);
else rmSync(TMP, { recursive: true, force: true });
if (failed.length) process.exit(1);
process.exit(0);
