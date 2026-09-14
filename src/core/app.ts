/**
 * The hub's web app — one page, three views (Chat, Board, Settings) behind a
 * shared nav, served at `/chat`, `/board` and `/settings`.
 *
 * Dependency-free on purpose: no build step, no framework. One `/api/state`
 * fetch feeds every view, an `/api/events` SSE stream triggers re-renders,
 * and navigation is History API with a tiny router. Client JS avoids template
 * literals so the whole page can live in one TS template string.
 *
 * The transcript follows the conventions a coding-agent transcript has taught
 * people to read: one block per task, an agent's prose as prose, its tool
 * calls as compact one-liners you can open, and delegated work nested under
 * the agent that handed it out — so "who asked whom to do what" is visible
 * without reading every line.
 */
export function appHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ekip</title>
<style>
:root{
  --bg:#faf9f7;--panel:#f2f1ed;--sunk:#ebe9e4;--border:#deddd6;--border-soft:#e8e6e0;
  --text:#1d1c1a;--text-2:#4a4843;--muted:#78756e;--faint:#9b978f;
  --accent:#0e7c6b;--accent-soft:#dcefe9;--human:#8a4b00;--human-soft:#f6ecdd;
  --ok:#1f7a3f;--bad:#b3362b;--warn:#9a6100;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  --radius:10px;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#151513;--panel:#1c1c1a;--sunk:#212120;--border:#302f2c;--border-soft:#272725;
  --text:#eae8e3;--text-2:#c3c0b9;--muted:#928e86;--faint:#75716a;
  --accent:#4cc2ac;--accent-soft:#17332e;--human:#e0a45c;--human-soft:#2b2318;
  --ok:#5fc07f;--bad:#f07a6f;--warn:#dfab54;
}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.6;display:flex;flex-direction:column;height:100vh;overflow:hidden;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
button{font:inherit}
::selection{background:var(--accent-soft)}

/* ---------- nav ---------- */
header{display:flex;align-items:center;gap:18px;padding:0 14px;height:46px;border-bottom:1px solid var(--border);background:var(--panel);flex-shrink:0}
.brand{font-weight:650;letter-spacing:-.01em;display:flex;align-items:baseline;gap:6px}
.brand em{font-style:normal;font-weight:400;color:var(--muted);font-size:13px}
nav{display:flex;gap:1px}
nav a{padding:4px 11px;border-radius:7px;color:var(--muted);font-weight:500;font-size:13.5px}
nav a:hover{background:var(--sunk);color:var(--text)}
nav a.on{background:var(--bg);color:var(--text);box-shadow:inset 0 0 0 1px var(--border)}
header .right{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted)}
header code{font-family:var(--mono);font-size:11px;color:var(--faint)}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px}
.pill:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--faint)}
.pill.live:before{background:var(--ok)}

main{flex:1;min-height:0;display:flex}
.view{flex:1;min-height:0;display:none;flex-direction:column}
.view.on{display:flex}
.scroll{overflow:auto;flex:1;min-height:0}
.wrap{max-width:820px;margin:0 auto;padding:0 24px;width:100%}
h2{font-size:14.5px;font-weight:650;margin:26px 0 10px;letter-spacing:-.01em}
h2:first-child{margin-top:22px}
.lede{color:var(--muted);font-size:12.5px;margin:0 0 14px;line-height:1.55}
.empty{color:var(--muted);text-align:center;padding:64px 24px;max-width:430px;margin:0 auto}
.empty b{display:block;font-size:15px;color:var(--text);margin-bottom:6px;font-weight:600}
.badge{font-size:10.5px;padding:1px 7px;border-radius:5px;font-weight:600;letter-spacing:.02em;white-space:nowrap;text-transform:lowercase}
.b-done{color:var(--ok);background:color-mix(in srgb,var(--ok) 13%,transparent)}
.b-failed{color:var(--bad);background:color-mix(in srgb,var(--bad) 13%,transparent)}
.b-cancelled{color:var(--muted);background:color-mix(in srgb,var(--muted) 16%,transparent)}
.b-claimed{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.b-pending{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--faint);flex-shrink:0}
.dot.run{background:var(--accent);animation:pulse 1.4s ease-in-out infinite}
.dot.ok{background:var(--ok)} .dot.bad{background:var(--bad)}
@keyframes pulse{50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.dot.run{animation:none}}
pre{background:var(--sunk);border:1px solid var(--border-soft);border-radius:8px;padding:9px 11px;overflow:auto;font-family:var(--mono);font-size:12.5px;line-height:1.5;margin:8px 0;white-space:pre-wrap;word-break:break-word}
code{font-family:var(--mono);font-size:.92em;background:var(--sunk);padding:1px 5px;border-radius:4px}
input,select,textarea{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:6px 9px;min-width:0}
input:focus,select:focus,textarea:focus{outline:2px solid color-mix(in srgb,var(--accent) 40%,transparent);outline-offset:-1px}
.btn{padding:6px 13px;border:0;border-radius:7px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer;font-size:13px}
.btn.ghost{background:transparent;color:var(--text-2);border:1px solid var(--border);font-weight:500}
.btn.ghost:hover{background:var(--sunk);color:var(--text)}
.btn:disabled{opacity:.45;cursor:default}

/* ---------- chat ---------- */
.chat{display:grid;grid-template-columns:252px minmax(0,1fr);flex:1;min-height:0}
.threads{border-right:1px solid var(--border);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.threads .hd{padding:10px 10px 8px;display:flex;flex-direction:column;gap:7px}
.threads .hd .btn{width:100%;text-align:left}
.threads .hd input{font-size:12.5px;padding:5px 8px;background:var(--bg)}
.threads .list{overflow:auto;flex:1;padding:2px 6px 10px}
.th{padding:8px 9px;cursor:pointer;border-radius:8px;margin-bottom:1px}
.th:hover{background:var(--sunk)}
.th.sel{background:var(--bg);box-shadow:inset 0 0 0 1px var(--border)}
.th .t{display:flex;align-items:center;gap:7px;font-weight:500;font-size:13px;line-height:1.35}
.th .t span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.th .m{font-size:11px;color:var(--muted);margin-top:3px;padding-left:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane{display:flex;flex-direction:column;min-height:0;position:relative}
.pane .top{padding:0 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;height:46px;flex-shrink:0}
.pane .top .title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane .top .sub{font-size:12px;color:var(--muted);white-space:nowrap;display:flex;align-items:center;gap:8px}
.pane .top .sp{flex:1}
.log{padding:20px 0 24px}

/* one block per task */
.turn{margin:0 0 4px}
.turn.nested{margin-left:15px;padding-left:17px;border-left:2px solid var(--border);margin-top:6px}
.ask{background:var(--human-soft);border:1px solid color-mix(in srgb,var(--human) 22%,transparent);border-radius:var(--radius);padding:10px 13px;margin:6px 0 14px}
.ask .who{font-size:11.5px;color:var(--human);font-weight:650;margin-bottom:2px;display:flex;gap:8px;align-items:baseline}
.ask .who .t{font-weight:400;color:var(--muted)}
.ask .body{white-space:pre-wrap;overflow-wrap:anywhere}
.run-hd{display:flex;align-items:center;gap:8px;padding:7px 0 4px;font-size:12.5px;flex-wrap:wrap}
.run-hd .agent{font-weight:650;font-size:13px}
.run-hd .arrow{color:var(--faint)}
.run-hd .task{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%}
.run-hd .meta{margin-left:auto;color:var(--faint);font-size:11.5px;white-space:nowrap;font-variant-numeric:tabular-nums;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;min-width:0}
.run-hd .task{flex:0 1 auto;min-width:0}
.say{padding:1px 0 5px;overflow-wrap:anywhere;white-space:pre-wrap;color:var(--text)}
.say p{margin:0 0 8px}
.step{display:flex;gap:8px;align-items:baseline;padding:2px 0;font-size:12.5px;color:var(--muted);cursor:pointer}
.step:hover{color:var(--text-2)}
.step .ico{color:var(--faint);flex-shrink:0;font-family:var(--mono);font-size:11px}
.step .what{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.step .what b{font-weight:600;color:var(--text-2)}
.step .what code{background:transparent;padding:0;color:var(--muted)}
.step.quiet{font-size:12px;color:var(--faint)}
.step-detail{display:none}
.step.open + .step-detail{display:block}
.outcome{display:flex;gap:8px;align-items:flex-start;padding:4px 0 2px;overflow-wrap:anywhere}
.outcome .body{white-space:pre-wrap;flex:1;min-width:0}
.outcome.failed .body{color:var(--bad)}
.brief{margin:2px 0 6px}
.brief summary{font-size:12px;color:var(--faint);cursor:pointer;list-style:none}
.brief summary::-webkit-details-marker{display:none}
.brief summary:before{content:"▸ ";font-family:var(--mono)}
.brief[open] summary:before{content:"▾ "}
.note-line{font-size:12px;color:var(--faint);font-style:italic;padding:2px 0}
.working{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);padding:5px 0}
.artifacts{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px}
.artifact{font-size:11.5px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--panel);cursor:pointer;font-family:var(--mono);color:var(--text-2)}
.artifact:hover{border-color:var(--accent)}
.jump{position:absolute;left:50%;transform:translateX(-50%);bottom:104px;z-index:5;box-shadow:0 3px 14px rgba(0,0,0,.16)}
.compose{border-top:1px solid var(--border);padding:12px 24px 16px;background:var(--panel);flex-shrink:0}
.compose .row{max-width:820px;margin:0 auto;display:flex;gap:8px;align-items:flex-end}
.compose .box{flex:1;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);display:flex;flex-direction:column;transition:border-color .12s}
.compose .box:focus-within{border-color:color-mix(in srgb,var(--accent) 55%,var(--border))}
.compose textarea{border:0;background:transparent;padding:10px 12px 6px;resize:none;min-height:40px;max-height:190px;line-height:1.55}
.compose .bar{display:flex;align-items:center;gap:8px;padding:2px 10px 7px;font-size:11.5px;color:var(--muted)}
.compose .bar select{font-size:11.5px;padding:1px 5px;border-radius:5px;background:var(--panel)}
.compose .hint{margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.compose .hint.err{color:var(--bad)}

/* ---------- board ---------- */
.board{display:grid;grid-template-columns:minmax(0,1fr) 312px;gap:18px;padding:18px 22px;align-items:start}
.metrics{display:flex;gap:16px;padding:2px 2px 14px;flex-wrap:wrap}
.metric{display:flex;align-items:baseline;gap:6px}
.metric .n{font-size:18px;font-weight:650;font-variant-numeric:tabular-nums}
.metric .l{font-size:12px;color:var(--muted)}
.card{border:1px solid var(--border);border-radius:var(--radius);background:var(--panel);overflow:hidden;margin-bottom:14px}
.card .ch{padding:8px 13px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-weight:600;font-size:12.5px}
.card .ch .hint{margin-left:auto;font-weight:400;font-size:11.5px;color:var(--muted)}
.card .cb{padding:11px 13px}
.task{border-bottom:1px solid var(--border-soft)}
.task:last-child{border-bottom:none}
.t-row{display:flex;align-items:center;gap:9px;padding:8px 13px;cursor:pointer}
.t-row:hover{background:var(--sunk)}
.t-row .tt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.t-meta{color:var(--muted);font-size:11.5px;margin-left:auto;white-space:nowrap}
.t-body{padding:0 13px 12px;display:flex;flex-direction:column;gap:5px}
.t-body .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);margin-top:4px}
.t-body pre{max-height:210px;margin:2px 0}
.acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}
.kv{display:flex;gap:10px;padding:7px 13px;border-bottom:1px solid var(--border-soft);font-size:12px;align-items:baseline}
.kv:last-child{border-bottom:none}
.kv .k{color:var(--accent);font-family:var(--mono);font-size:11.5px}
.kv .v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:var(--text-2)}
.kv .m{color:var(--faint);font-size:11px;white-space:nowrap}
.form{display:flex;flex-direction:column;gap:8px}
.form textarea{min-height:72px;resize:vertical}
@media (max-width:900px){.board{grid-template-columns:1fr}}

/* ---------- settings ---------- */
.agent{border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;background:var(--panel)}
.agent .hd{display:flex;align-items:baseline;gap:9px;margin-bottom:11px;flex-wrap:wrap}
.agent .nm{font-weight:650}
.agent .ad{font-size:11.5px;color:var(--muted);font-family:var(--mono)}
.agent .role{font-size:11px;color:var(--faint);font-family:var(--mono);margin-left:auto}
.agent .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;align-items:end}
.agent label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted)}
.agent label.chk{flex-direction:row;align-items:center;gap:6px;font-size:12.5px;color:var(--text-2)}
.agent .act{display:flex;gap:10px;align-items:center;margin-top:11px}
.agent .said{font-size:12px;color:var(--muted)}
.note{font-size:12px;color:var(--muted);border-left:2px solid var(--border);padding:2px 0 2px 11px;margin-bottom:11px;line-height:1.55}
.note b{color:var(--text);font-weight:600}
@media (max-width:780px){.chat{grid-template-columns:1fr}.threads{display:none}header code{display:none}}
</style>
</head>
<body>
<header>
  <span class="brand">ekip <em id="project"></em></span>
  <nav>
    <a href="/chat" data-view="chat">Chat</a>
    <a href="/board" data-view="board">Board</a>
    <a href="/settings" data-view="settings">Settings</a>
  </nav>
  <div class="right"><span id="workers"></span><code id="endpoint"></code><span class="pill" id="conn">connecting</span></div>
</header>
<main>
  <section class="view" id="v-chat"><div class="chat">
    <div class="threads">
      <div class="hd"><button class="btn ghost" id="new">＋ New conversation</button><input id="th-search" placeholder="Filter conversations"></div>
      <div class="list" id="thread-list"></div>
    </div>
    <div class="pane">
      <div class="top"><span class="title" id="c-title">New conversation</span><span class="sub" id="c-sub"></span><span class="sp"></span><button class="btn ghost" id="c-cancel" hidden>Stop</button></div>
      <div class="scroll" id="c-scroll"><div class="wrap log" id="c-log"></div></div>
      <button class="btn jump" id="c-jump" hidden>↓ Jump to latest</button>
      <div class="compose"><div class="row">
        <div class="box">
          <textarea id="c-text" rows="1" placeholder="Ask the crew…"></textarea>
          <div class="bar">to <select id="c-to"></select><span id="c-mode"></span><span class="hint" id="c-hint">Enter to send · Shift+Enter for a new line</span></div>
        </div>
        <button class="btn" id="c-send">Send</button>
      </div></div>
    </div>
  </div></section>

  <section class="view" id="v-board"><div class="scroll"><div class="board">
    <div>
      <div class="metrics" id="metrics"></div>
      <div class="card"><div class="ch">Tasks<span class="hint" id="task-count"></span></div><div id="tasks"></div></div>
      <div class="card" id="log-card" hidden><div class="ch"><span id="log-title">log</span><span class="hint"><button class="btn ghost" id="log-refresh">Refresh</button></span></div><div class="cb"><pre id="log-body" style="max-height:340px;margin:0"></pre></div></div>
    </div>
    <div>
      <div class="card"><div class="ch">Delegate</div><div class="cb"><form class="form" id="d-form">
        <select id="d-to"></select>
        <input id="d-title" placeholder="title (optional)">
        <textarea id="d-prompt" placeholder="What should this agent do?" required></textarea>
        <button class="btn" type="submit">Delegate</button>
      </form></div></div>
      <div class="card"><div class="ch">Blackboard<span class="hint" id="ctx-count"></span></div>
        <div id="context"></div>
        <div class="cb"><form class="form" id="ctx-form">
          <input id="ctx-key" placeholder="key, e.g. plan.v1" required>
          <textarea id="ctx-value" placeholder="value (JSON or text)" required></textarea>
          <button class="btn ghost" type="submit">Set key</button>
        </form></div>
      </div>
    </div>
  </div></div></section>

  <section class="view" id="v-settings"><div class="scroll"><div class="wrap">
    <h2>How the crew reports</h2>
    <p class="lede">Agents write their notes, hand-offs and results in this language. Code, file names and commands are untouched.</p>
    <div class="agent"><div class="grid" style="grid-template-columns:220px auto;align-items:end">
      <label>language<select id="hub-language">
        <option value="">(each agent's default)</option>
        <option value="Vietnamese">Tiếng Việt</option>
        <option value="English">English</option>
        <option value="Japanese">日本語</option>
        <option value="__custom">another language…</option>
      </select></label>
      <span class="said" id="lang-said"></span>
    </div></div>
    <h2>Agents</h2>
    <p class="lede" id="limits">…</p>
    <div id="agent-cards"></div>
    <h2>Where these model lists come from</h2>
    <div id="catalog-notes"></div>
    <h2>Connect an agent</h2>
    <p class="lede">Point any MCP-speaking agent at <code id="endpoint2"></code>. Run <code>ekip init</code> in the project to print the exact snippet for each tool.</p>
  </div></div></section>
</main>
<script>
var state = null, threads = [], thread = null, current = null, catalogs = null, notFound = false;
var view = 'chat', expanded = null, logTask = null, filter = '', opened = {};
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function hhmm(iso){ return new Date(iso).toTimeString().slice(0,5); }
function ago(iso){ var s = Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if (s<60) return Math.floor(s)+'s ago'; if (s<3600) return Math.floor(s/60)+'m ago'; if (s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }
function isDone(s){ return s === 'done' || s === 'failed' || s === 'cancelled'; }
var PALETTE = ['#0e7c6b','#2563eb','#7c3aed','#b45309','#be185d','#0f766e','#4d7c0f','#9f1239'];
var PALETTE_DARK = ['#4cc2ac','#7aa5f7','#b794f6','#e0a45c','#f08fb0','#5fc0b0','#a3c952','#f0899a'];
var dark = matchMedia('(prefers-color-scheme: dark)');
function color(n){ var h=0; for (var i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0;
  return (dark.matches ? PALETTE_DARK : PALETTE)[h % PALETTE.length]; }
function md(s){
  return String(s).split(/(\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60)/g).map(function(p){
    if (p.indexOf('\\x60\\x60\\x60') === 0) return '<pre>' + esc(p.slice(3,-3).replace(/^[a-zA-Z0-9_-]*\\n/,'')) + '</pre>';
    return esc(p)
      .replace(/\\x60([^\\x60\\n]+)\\x60/g, '<code>$1</code>')
      .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
  }).join('');
}
function money(n){ return '$' + (n < 0.1 ? n.toFixed(3) : n.toFixed(2)); }
function tokens(n){ return n >= 1000 ? (n/1000).toFixed(1)+'k tok' : n+' tok'; }
function usageLine(u){ if (!u) return ''; var b = [];
  if (u.model) b.push(u.model);
  var t = (u.inputTokens||0)+(u.outputTokens||0); if (t) b.push(tokens(t));
  if (typeof u.costUsd === 'number' && u.costUsd) b.push(money(u.costUsd));
  if (u.durationMs) b.push(Math.round(u.durationMs/1000)+'s');
  return b.join(' · '); }
function shortId(id){ return String(id).slice(0,8); }
function base(p){ var s = String(p).split('?')[0].replace(/\\/+$/,''); return s.slice(s.lastIndexOf('/')+1) || s; }

/* Turn a raw tool call into something a person can read at a glance. */
function describeTool(name, input){
  var n = String(name || 'tool').replace('mcp__ekip__','');
  var a = (input && typeof input === 'object') ? input : {};
  var quiet = false, what;
  if (n === 'bridge_claim') { what = '<b>picked up</b> the task'; quiet = true; }
  else if (n === 'bridge_post_result') { what = '<b>reported back</b>'; quiet = true; }
  else if (n === 'bridge_say') { what = '<b>said</b> something in this thread'; quiet = true; }
  else if (n === 'bridge_delegate') { what = '<b>handed</b> ' + esc(a.title || 'work') + ' <b>to</b> ' + esc(a.to || 'a peer'); }
  else if (n === 'bridge_wait') { what = '<b>waiting for</b> <code>' + esc(shortId(a.task_id)) + '</code>'; quiet = true; }
  else if (n === 'bridge_thread') { what = '<b>read</b> the conversation'; quiet = true; }
  else if (n === 'bridge_context_set') { what = '<b>wrote</b> <code>' + esc(a.key) + '</code> on the blackboard'; }
  else if (n === 'bridge_context_get') { what = '<b>read</b> <code>' + esc(a.key || 'the blackboard') + '</code>'; quiet = true; }
  else if (n === 'bridge_cancel') { what = '<b>cancelled</b> <code>' + esc(shortId(a.task_id)) + '</code>'; }
  else if (n === 'bridge_list_tasks' || n === 'bridge_task_get') { what = '<b>checked</b> tasks'; quiet = true; }
  else if (n === 'Write' || n === 'write_file') { what = '<b>wrote</b> <code>' + esc(base(a.file_path || a.path || a.absolute_path || '')) + '</code>'; }
  else if (n === 'Edit' || n === 'edit_file') { what = '<b>edited</b> <code>' + esc(base(a.file_path || a.path || '')) + '</code>'; }
  else if (n === 'Read' || n === 'read_file') { what = '<b>read</b> <code>' + esc(base(a.file_path || a.path || '')) + '</code>'; quiet = true; }
  else if (n === 'Bash' || n === 'run_command' || n === 'command') { what = '<b>ran</b> <code>' + esc(String(a.command || '').slice(0,90)) + '</code>'; }
  else if (n === 'Grep' || n === 'Glob' || n === 'search') { what = '<b>searched</b> <code>' + esc(a.pattern || a.query || '') + '</code>'; quiet = true; }
  else if (n === 'ToolSearch') { what = '<b>loaded</b> its tools'; quiet = true; }
  else if (n === 'TodoWrite') { what = '<b>updated</b> its checklist'; quiet = true; }
  else { var hint = a.command || a.file_path || a.path || a.key || a.query || a.pattern || '';
    what = '<b>' + esc(n) + '</b>' + (hint ? ' <code>' + esc(String(hint).slice(0,70)) + '</code>' : ''); }
  return { html: what, quiet: quiet };
}
/* The final "here's what I did" often repeats the posted result — show it once. */
function samey(a, b){
  if (!a || !b) return false;
  var norm = function(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); };
  var x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true;
  var xs = x.split(' '), ys = new Set(y.split(' ')), hit = 0;
  xs.forEach(function(w){ if (w.length > 3 && ys.has(w)) hit++; });
  return xs.length > 4 && hit / xs.length > 0.65;
}

/* ---------- router ---------- */
function go(path, push){
  var m = /^\\/(chat|board|settings)(?:\\/([A-Za-z0-9-]+))?/.exec(path) || [];
  view = m[1] || 'chat';
  if (view === 'chat') { current = m[2] || null; notFound = false; thread = null; }
  if (push !== false && location.pathname !== path) history.pushState({}, '', path);
  ['chat','board','settings'].forEach(function(v){ $('v-'+v).classList.toggle('on', v === view); });
  document.querySelectorAll('nav a').forEach(function(a){ a.classList.toggle('on', a.getAttribute('data-view') === view); });
  if (view === 'settings' && !catalogs) loadCatalogs();
  refresh();
}
document.querySelectorAll('nav a').forEach(function(a){
  a.addEventListener('click', function(e){ e.preventDefault(); go(a.getAttribute('href')); });
});
window.addEventListener('popstate', function(){ go(location.pathname, false); });

/* ---------- data ---------- */
function loadState(){ return fetch('/api/state').then(function(r){ return r.json(); }).then(function(s){ state = s; }); }
function loadThreads(){ return fetch('/api/threads').then(function(r){ return r.json(); }).then(function(d){ threads = d.threads; }); }
function loadThread(){
  if (!current) { thread = null; return Promise.resolve(); }
  var want = current;
  return fetch('/api/thread/' + want).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
    if (want !== current) return;
    thread = d; notFound = !d;
  });
}
function loadCatalogs(){ return fetch('/api/models').then(function(r){ return r.json(); }).then(function(c){ catalogs = c; renderSettings(); }); }
var busy = false, again = false;
function refresh(){
  if (busy) { again = true; return; }
  busy = true;
  var work = [loadState()];
  if (view === 'chat') work.push(loadThreads(), loadThread());
  Promise.all(work).then(render).finally(function(){
    busy = false; if (again) { again = false; setTimeout(refresh, 80); }
  });
}

/* ---------- render ---------- */
function render(){
  if (!state) return;
  $('project').textContent = '· ' + state.project;
  $('endpoint').textContent = state.hubUrl;
  if ($('endpoint2')) $('endpoint2').textContent = state.hubUrl;
  var w = state.workers || { running: [], queued: [], lingering: [] };
  $('workers').textContent = w.running.length ? w.running.length + ' running' + (w.queued.length ? ' · ' + w.queued.length + ' queued' : '') : 'idle';
  fillAgents($('c-to')); fillAgents($('d-to'));
  if (view === 'chat') renderChat();
  else if (view === 'board') renderBoard();
  else renderSettings();
}
function fillAgents(sel){
  if (!sel || sel.options.length === state.agents.length) return;
  var prev = sel.value;
  sel.innerHTML = state.agents.map(function(a){ return '<option value="' + esc(a.name) + '">' + esc(a.name) + (a.spawnable ? '' : ' (polls)') + '</option>'; }).join('');
  var pref = state.agents.filter(function(a){ return a.name === 'conductor'; })[0] || state.agents.filter(function(a){ return a.spawnable; })[0];
  sel.value = prev || (pref ? pref.name : '');
}

/* --- chat --- */
function statusDot(s){ return '<span class="dot' + (isDone(s) ? (s === 'done' ? ' ok' : s === 'failed' ? ' bad' : '') : ' run') + '"></span>'; }
function renderThreadList(){
  var list = threads.filter(function(t){
    return !filter || (t.title + ' ' + t.to + ' ' + t.from).toLowerCase().indexOf(filter) >= 0;
  });
  $('thread-list').innerHTML = list.length ? list.map(function(t){
    return '<div class="th' + (t.id === current ? ' sel' : '') + '" data-id="' + t.id + '">' +
      '<div class="t">' + statusDot(t.status) + '<span>' + esc(t.title) + '</span></div>' +
      '<div class="m">' + esc(t.to) + ' · ' + t.messages + ' lines · ' + ago(t.lastAt) + '</div></div>';
  }).join('') : '<div class="empty" style="padding:22px 10px;font-size:12px">' + (filter ? 'Nothing matches.' : 'No conversations yet.') + '</div>';
}
function renderChat(){
  renderThreadList();
  if (notFound) {
    $('c-title').textContent = 'Conversation not found';
    $('c-sub').textContent = ''; $('c-cancel').hidden = true; $('c-mode').textContent = 'starts a new conversation';
    $('c-log').innerHTML = '<div class="empty"><b>That conversation is gone</b>It may have been pruned by the retention setting, or the link points at another project\\'s hub. Pick one on the left, or start a new one below.</div>';
    return;
  }
  if (!thread) {
    $('c-title').textContent = 'New conversation';
    $('c-sub').textContent = ''; $('c-cancel').hidden = true; $('c-mode').textContent = 'starts a new conversation';
    $('c-log').innerHTML = '<div class="empty"><b>Ask the crew for something</b>Pick who gets it, type the request, and this becomes a transcript: what each agent says, the tools it runs, work it hands to another agent, and what it cost.</div>';
    return;
  }
  var byId = {}, kids = {};
  thread.tasks.forEach(function(t){ byId[t.id] = t; });
  thread.tasks.forEach(function(t){ if (t.parentId && byId[t.parentId]) { (kids[t.parentId] = kids[t.parentId] || []).push(t); } });
  var root = byId[thread.thread] || thread.tasks[0];
  var live = thread.tasks.filter(function(t){ return !isDone(t.status); });
  var cost = 0, tok = 0;
  thread.tasks.forEach(function(t){ if (t.usage) { cost += t.usage.costUsd || 0; tok += (t.usage.inputTokens||0)+(t.usage.outputTokens||0); } });
  $('c-title').textContent = root.title;
  $('c-sub').innerHTML = (live.length ? '<span class="dot run"></span>' + esc(live[0].to) + ' working' : '<span class="dot ok"></span>finished') +
    ' <span style="color:var(--faint)">· ' + thread.tasks.length + ' task' + (thread.tasks.length>1?'s':'') + (tok ? ' · ' + tokens(tok) : '') + (cost ? ' · ' + money(cost) : '') + '</span>';
  $('c-cancel').hidden = !live.length;
  $('c-mode').textContent = 'replies in this conversation';

  // Messages belong to a task; render task by task, nesting delegated work.
  var byTask = {};
  thread.messages.forEach(function(m){ (byTask[m.taskId] = byTask[m.taskId] || []).push(m); });

  function renderTask(t, depth){
    var msgs = byTask[t.id] || [];
    var html = '';
    // The human's ask opens the thread; a delegation is introduced by its parent.
    msgs.forEach(function(m){
      if (m.kind !== 'human') return;
      html += '<div class="ask"><div class="who">you<span class="t">→ ' + esc(m.to || t.to) + ' · ' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div>';
    });
    var c = color(t.to);
    html += '<div class="run-hd"><span class="dot' + (isDone(t.status) ? (t.status === 'done' ? ' ok' : t.status === 'failed' ? ' bad' : '') : ' run') + '"></span>' +
      '<span class="agent" style="color:' + c + '">' + esc(t.to) + '</span>' +
      '<span class="badge b-' + t.status + '">' + t.status + '</span>' +
      '<span class="task">' + esc(t.title) + '</span>' +
      '<span class="meta">' + (usageLine(t.usage) ? esc(usageLine(t.usage)) + ' · ' : '') + hhmm(t.createdAt) + '</span></div>';

    var resultText = t.result || '';
    var body = '';
    var pending = (kids[t.id] || []).slice();   // children not yet placed
    var placeChild = function(title){
      // A delegation line is followed by the child's own block, in the order
      // the work was actually handed out.
      var i = title ? pending.findIndex(function(k){ return k.title === title; }) : -1;
      if (i < 0) i = 0;
      var k = pending.splice(i, 1)[0];
      return k ? '<div class="turn nested">' + renderTask(k, depth + 1) + '</div>' : '';
    };
    msgs.forEach(function(m, i){
      if (m.kind === 'human') return;
      if (m.kind === 'system') {
        // "<agent> started: <title>" is what the run header already says.
        if (/^\\S+ started: /.test(m.text)) return;
        body += '<div class="note-line">' + esc(m.text) + '</div>';
        return;
      }
      if (m.kind === 'tool') {
        var tool = m.meta && m.meta.tool, input = (m.meta && m.meta.input) || {};
        var d = describeTool(tool, input);
        var key = m.id;
        body += '<div class="step' + (d.quiet ? ' quiet' : '') + (opened[key] ? ' open' : '') + '" data-step="' + key + '">' +
          '<span class="ico">▸</span><span class="what">' + d.html + '</span></div>' +
          '<div class="step-detail"><pre>' + esc(JSON.stringify(input, null, 2)) + '</pre></div>';
        // The work handed out here belongs right here, not at the end.
        if (String(tool || '').indexOf('bridge_delegate') >= 0) body += placeChild(input.title);
        return;
      }
      // The instruction that created this task: its brief, not a reply.
      if (m.meta && m.meta.delegation) {
        body += '<details class="brief"><summary>brief from ' + esc(m.from) + ' · ' + m.text.length + ' chars</summary><div class="say">' + md(m.text) + '</div></details>';
        return;
      }
      if (m.meta && m.meta.result) {
        body += '<div class="outcome' + (m.meta.result === 'failed' ? ' failed' : '') + '"><div class="body">' + md(m.text) + '</div></div>';
        if (t.artifacts && t.artifacts.length) {
          body += '<div class="artifacts">' + t.artifacts.map(function(a, ai){
            return '<button class="artifact" data-art="' + t.id + ':' + ai + '">' + esc(a.kind) + (a.label ? ' · ' + esc(a.label) : '') + '</button>';
          }).join('') + '</div>';
        }
        return;
      }
      // trailing summary that just repeats the result
      var isLast = i >= msgs.length - 2;
      if (isLast && samey(m.text, resultText)) return;
      body += '<div class="say">' + md(m.text) + '</div>';
    });
    // anything the hub knows about but no delegation line introduced
    while (pending.length) body += '<div class="turn nested">' + renderTask(pending.shift(), depth + 1) + '</div>';
    if (!isDone(t.status)) {
      var what = t.status === 'claimed' ? 'working…' : (t.pid ? 'starting…' : (t.dispatchedAt ? 'lost its worker (the hub restarted)' : 'queued for a free slot…'));
      body += '<div class="working"><span class="dot run"></span>' + esc(t.to) + ' ' + what + '</div>';
    }
    return html + body;
  }

  var sc = $('c-scroll'), stick = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 60;
  $('c-log').innerHTML = '<div class="turn">' + renderTask(root, 0) + '</div>';
  if (stick) { sc.scrollTop = sc.scrollHeight; $('c-jump').hidden = true; }
}
$('c-scroll').addEventListener('scroll', function(){
  var sc = $('c-scroll');
  $('c-jump').hidden = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 180;
});
$('c-jump').addEventListener('click', function(){ var sc = $('c-scroll'); sc.scrollTop = sc.scrollHeight; $('c-jump').hidden = true; });
$('c-log').addEventListener('click', function(e){
  var step = e.target.closest('[data-step]');
  if (step) { var k = step.getAttribute('data-step'); opened[k] = !opened[k]; step.classList.toggle('open'); return; }
  var art = e.target.closest('[data-art]');
  if (!art) return;
  var parts = art.getAttribute('data-art').split(':');
  var task = thread.tasks.filter(function(x){ return x.id === parts[0]; })[0];
  var a = task && task.artifacts ? task.artifacts[+parts[1]] : null;
  if (a) alert(a.kind + (a.label ? ' · ' + a.label : '') + '\\n\\n' + a.value);
});
$('th-search').addEventListener('input', function(e){ filter = e.target.value.trim().toLowerCase(); renderThreadList(); });
$('thread-list').addEventListener('click', function(e){
  var el = e.target.closest('.th'); if (!el) return;
  go('/chat/' + el.getAttribute('data-id'));
  setTimeout(function(){ $('c-scroll').scrollTop = $('c-scroll').scrollHeight; }, 250);
});
$('new').addEventListener('click', function(){ go('/chat'); $('c-text').focus(); });
$('c-cancel').addEventListener('click', function(){
  if (!thread || !confirm('Stop this conversation and everything running in it?')) return;
  fetch('/api/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task_id: thread.thread, by: 'human' }) });
});
function send(){
  var text = $('c-text').value.trim(); if (!text) return;
  var body = { to: $('c-to').value, prompt: text, from: 'human' };
  if (current && !notFound) body.parent_task_id = current;
  $('c-send').disabled = true; $('c-hint').textContent = 'sending…'; $('c-hint').className = 'hint';
  fetch('/api/delegate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      $('c-send').disabled = false;
      if (d.error) { $('c-hint').textContent = d.error; $('c-hint').className = 'hint err'; return; }
      $('c-text').value = ''; autosize();
      $('c-hint').textContent = 'Enter to send · Shift+Enter for a new line';
      if (!current || notFound) { current = d.task.id; notFound = false; history.replaceState({}, '', '/chat/' + current); }
      refresh();
      setTimeout(function(){ $('c-scroll').scrollTop = $('c-scroll').scrollHeight; }, 300);
    })
    .catch(function(){ $('c-send').disabled = false; $('c-hint').textContent = 'could not reach the hub'; $('c-hint').className = 'hint err'; });
}
$('c-send').addEventListener('click', send);
$('c-text').addEventListener('keydown', function(e){
  if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
function autosize(){ var t = $('c-text'); t.style.height = 'auto'; t.style.height = Math.min(190, t.scrollHeight) + 'px'; }
$('c-text').addEventListener('input', autosize);

/* --- board --- */
function renderBoard(){
  var counts = { pending:0, claimed:0, done:0, failed:0, cancelled:0 };
  state.tasks.forEach(function(t){ if (counts[t.status] !== undefined) counts[t.status]++; });
  $('metrics').innerHTML = Object.keys(counts).map(function(k){
    return '<div class="metric"><span class="n">' + counts[k] + '</span><span class="l">' + k + '</span></div>';
  }).join('');
  var tasks = state.tasks.slice().sort(function(a,b){ return b.createdAt.localeCompare(a.createdAt); }).slice(0,60);
  $('task-count').textContent = state.tasks.length + ' total';
  $('tasks').innerHTML = tasks.length ? tasks.map(function(t){
    var h = '<div class="task"><div class="t-row" data-id="' + t.id + '">' +
      '<span class="badge b-' + t.status + '">' + t.status + '</span><span class="tt">' + esc(t.title) + '</span>' +
      '<span class="t-meta">' + esc(t.from) + ' → ' + esc(t.to) + ' · ' + ago(t.updatedAt) + '</span></div>';
    if (expanded === t.id) {
      h += '<div class="t-body"><span class="lbl">prompt</span><pre>' + esc(t.prompt) + '</pre>';
      if (t.result) h += '<span class="lbl">result</span><pre>' + esc(t.result) + '</pre>';
      if (t.usage) h += '<span class="lbl">run</span><div style="font-size:12px;color:var(--muted)">' + esc(usageLine(t.usage)) + '</div>';
      if (t.artifacts && t.artifacts.length) h += '<span class="lbl">artifacts</span><div class="artifacts">' + t.artifacts.map(function(a,i){
        return '<button class="artifact" data-art="' + t.id + ':' + i + '">' + esc(a.kind) + (a.label ? ' · ' + esc(a.label) : '') + '</button>'; }).join('') + '</div>';
      h += '<div class="acts"><button class="btn ghost" data-log="' + t.id + '">View log</button>' +
        (isDone(t.status) ? '' : '<button class="btn ghost" data-cancel="' + t.id + '">Cancel</button>') +
        '<a href="/chat/' + (t.parentId || t.id) + '" data-thread="1">open conversation →</a>' +
        (t.pid ? '<span style="font-size:11.5px;color:var(--faint)">pid ' + t.pid + '</span>' : '') + '</div></div>';
    }
    return h + '</div>';
  }).join('') : '<div class="empty" style="padding:28px"><b>No tasks yet</b>Delegate one with the form on the right, or talk to the crew in Chat.</div>';

  var ctx = state.context.slice().sort(function(a,b){ return b.updatedAt.localeCompare(a.updatedAt); });
  $('ctx-count').textContent = ctx.length + ' keys';
  $('context').innerHTML = ctx.length ? ctx.map(function(c){
    return '<div class="kv"><span class="k">' + esc(c.key) + '</span><span class="v">' + esc(JSON.stringify(c.value)) + '</span><span class="m">' + esc(c.updatedBy) + '</span></div>';
  }).join('') : '<div class="cb" style="color:var(--muted);font-size:12.5px">Empty blackboard.</div>';
}
$('tasks').addEventListener('click', function(e){
  var art = e.target.closest('[data-art]'), lg = e.target.closest('[data-log]'), cx = e.target.closest('[data-cancel]'), th = e.target.closest('[data-thread]');
  if (th) { e.preventDefault(); go(th.getAttribute('href')); return; }
  if (art) { var parts = art.getAttribute('data-art').split(':');
    var task = state.tasks.filter(function(x){ return x.id === parts[0]; })[0];
    var a = task && task.artifacts ? task.artifacts[+parts[1]] : null; if (!a) return;
    logTask = null; $('log-card').hidden = false;
    $('log-title').textContent = 'artifact · ' + a.kind + (a.label ? ' · ' + a.label : '');
    $('log-body').textContent = a.value; return; }
  if (lg) { logTask = lg.getAttribute('data-log'); $('log-card').hidden = false; $('log-title').textContent = 'log · ' + shortId(logTask); loadLog(); return; }
  if (cx) { if (confirm('Cancel this task and everything delegated from it?'))
    fetch('/api/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task_id: cx.getAttribute('data-cancel'), by: 'human' }) });
    return; }
  var row = e.target.closest('.t-row'); if (!row) return;
  var id = row.getAttribute('data-id'); expanded = expanded === id ? null : id; renderBoard();
});
function loadLog(){ if (!logTask) return;
  fetch('/api/logs/' + logTask).then(function(r){ return r.ok ? r.text() : 'No log file for this task (the hub did not spawn it, or nothing was written yet).'; })
    .then(function(txt){ $('log-body').textContent = txt || '(empty)'; }); }
$('log-refresh').addEventListener('click', loadLog);
$('d-form').addEventListener('submit', function(e){ e.preventDefault();
  var body = { to: $('d-to').value, prompt: $('d-prompt').value };
  if ($('d-title').value) body.title = $('d-title').value;
  fetch('/api/delegate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d.error) { alert(d.error); return; } $('d-prompt').value = ''; $('d-title').value = ''; refresh(); });
});
$('ctx-form').addEventListener('submit', function(e){ e.preventDefault();
  var raw = $('ctx-value').value, value;
  try { value = JSON.parse(raw); } catch (err) { value = raw; }
  fetch('/api/context', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: $('ctx-key').value, value: value }) })
    .then(function(){ $('ctx-key').value = ''; $('ctx-value').value = ''; refresh(); });
});

/* --- settings --- */
function renderSettings(){
  if (view !== 'settings' || !state) return;
  fetch('/api/limits').then(function(r){ return r.json(); }).then(function(l){
    var sel = $('hub-language');
    if (document.activeElement !== sel) {
      var has = [].some.call(sel.options, function(o){ return o.value === (l.language || ''); });
      if (!has && l.language) { var o = document.createElement('option'); o.value = l.language; o.textContent = l.language; sel.insertBefore(o, sel.lastElementChild); }
      sel.value = l.language || '';
    }
    $('limits').textContent = 'Up to ' + l.maxConcurrent + ' workers at once, delegation depth ' + l.maxDepth +
      '. A task fails if nobody claims it within ' + l.watchdog.pendingTtlSeconds + 's, or reports nothing for ' + l.watchdog.claimedTtlSeconds + 's. Finished tasks are kept ' + l.retention.days + ' days. These live in ekip.config.json.';
  });
  $('agent-cards').innerHTML = state.agents.map(function(a){
    var cat = (catalogs && catalogs[a.adapter] && catalogs[a.adapter].models) || [];
    var known = cat.some(function(m){ return m.value === a.model; });
    var opts = cat.map(function(m){
      var tag = m.source === 'seen' ? ' · seen here' : m.source === 'account' ? ' · your account' : '';
      return '<option value="' + esc(m.value) + '"' + (m.value === a.model ? ' selected' : '') + '>' + esc(m.label) + tag + '</option>';
    }).join('');
    return '<div class="agent" data-name="' + esc(a.name) + '">' +
      '<div class="hd"><span class="nm" style="color:' + color(a.name) + '">' + esc(a.name) + '</span><span class="ad">' + esc(a.adapter) + '</span>' +
      (a.promptFile ? '<span class="role">role: ' + esc(a.promptFile) + '</span>' : '') + '</div><div class="grid">' +
      '<label>model<select data-f="model"><option value=""' + (a.model ? '' : ' selected') + '>(adapter default)</option>' + opts +
        (a.model && !known ? '<option value="' + esc(a.model) + '" selected>' + esc(a.model) + ' · current</option>' : '') +
        '<option value="__custom">type a custom id…</option></select></label>' +
      (a.adapter === 'claude' ? '<label>effort<select data-f="effort">' + ['','low','medium','high','xhigh','max'].map(function(o){
        return '<option value="' + o + '"' + ((a.effort||'') === o ? ' selected' : '') + '>' + (o || '(model default)') + '</option>'; }).join('') + '</select></label>' : '') +
      '<label>max parallel<input data-f="maxConcurrent" type="number" min="1" placeholder="hub limit" value="' + (a.maxConcurrent == null ? '' : a.maxConcurrent) + '"></label>' +
      '<label class="chk"><input data-f="spawnable" type="checkbox"' + (a.spawnable ? ' checked' : '') + '> hub may launch it</label>' +
      '</div><div class="act"><button class="btn save">Save</button><span class="said"></span></div></div>';
  }).join('');
  $('catalog-notes').innerHTML = catalogs ? Object.keys(catalogs).map(function(k){
    var c = catalogs[k];
    return '<div class="note"><b>' + esc(k) + '</b> — ' + (c.live ? c.models.length + ' models, read live' : 'no live list') + '. ' + esc(c.note || '') + '</div>';
  }).join('') : '<div class="note">Loading…</div>';
}
$('hub-language').addEventListener('change', function(e){
  var v = e.target.value;
  if (v === '__custom') {
    v = prompt('Language for the crew to write in:') || '';
    if (!v) { e.target.value = ''; return; }
    var o = document.createElement('option'); o.value = v; o.textContent = v;
    e.target.insertBefore(o, e.target.lastElementChild); e.target.value = v;
  }
  $('lang-said').textContent = 'saving…';
  fetch('/api/config/hub', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ language: v }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ $('lang-said').textContent = d.error ? d.error : (d.language ? 'agents will write in ' + d.language : 'agents use their own default') + ' — from the next task'; });
});
$('agent-cards').addEventListener('change', function(e){
  if (e.target.getAttribute('data-f') !== 'model' || e.target.value !== '__custom') return;
  var typed = prompt('Model id to pass after --model:');
  if (!typed) { e.target.value = ''; return; }
  var opt = document.createElement('option'); opt.value = typed; opt.textContent = typed + ' · custom';
  e.target.insertBefore(opt, e.target.lastElementChild); e.target.value = typed;
});
$('agent-cards').addEventListener('click', function(e){
  if (!e.target.classList.contains('save')) return;
  var card = e.target.closest('.agent'), body = { name: card.getAttribute('data-name') }, said = card.querySelector('.said');
  card.querySelectorAll('[data-f]').forEach(function(el){ var f = el.getAttribute('data-f'); body[f] = f === 'spawnable' ? el.checked : el.value; });
  if (body.model === '__custom') { said.textContent = 'pick or type a model first'; return; }
  said.textContent = 'saving…';
  fetch('/api/config/agent', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){ said.textContent = d.error ? d.error : 'saved — applies to the next task'; loadState().then(render); });
});

/* ---------- live ---------- */
var es = new EventSource('/api/events');
es.onopen = function(){ var c = $('conn'); c.textContent = 'live'; c.className = 'pill live'; refresh(); };
es.onerror = function(){ var c = $('conn'); c.textContent = 'reconnecting'; c.className = 'pill'; };
es.onmessage = function(ev){ refresh();
  try { var d = JSON.parse(ev.data); if (logTask && d.kind === 'task' && d.id === logTask) loadLog(); } catch (err) {} };
dark.addEventListener('change', function(){ render(); });
go(location.pathname, false);
setInterval(function(){ if (view === 'chat') renderThreadList(); }, 30000);
</script>
</body>
</html>`;
}
