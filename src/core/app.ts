/**
 * The hub's web app — one page, three views (Chat, Board, Settings) behind a
 * shared nav, served at `/chat`, `/board` and `/settings`.
 *
 * Dependency-free on purpose: no build step, no framework. One `/api/state`
 * fetch feeds every view, an `/api/events` SSE stream triggers re-renders,
 * and navigation is History API with a tiny router. Client JS avoids template
 * literals so the whole page can live in one TS template string.
 */
export function appHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ekip</title>
<style>
:root{--bg:#fbfbfa;--panel:#f2f1ee;--sunk:#eceae5;--border:#dedcd6;--text:#1c1c1a;--muted:#6f6d67;--accent:#0e7c6b;--human:#8a4b00;--tool:#5b5750;--ok:#1f7a3f;--bad:#b3362b;--warn:#a06400;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1d1d1b;--sunk:#191918;--border:#2e2e2b;--text:#e8e6e1;--muted:#8f8c84;--accent:#4cc2ac;--human:#e0a45c;--tool:#a29d93;--ok:#5fc07f;--bad:#f07a6f;--warn:#e2b04a;}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;display:flex;flex-direction:column;height:100vh;overflow:hidden}
a{color:var(--accent);text-decoration:none}
button{font:inherit}
/* ---- nav ---- */
header{display:flex;align-items:center;gap:16px;padding:0 16px;height:48px;border-bottom:1px solid var(--border);background:var(--panel);flex-shrink:0}
header .brand{font-weight:700;letter-spacing:-.01em}
header .brand span{font-weight:400;color:var(--muted)}
nav{display:flex;gap:2px}
nav a{padding:5px 12px;border-radius:6px;color:var(--muted);font-weight:500}
nav a:hover{background:var(--sunk);color:var(--text)}
nav a.on{background:var(--bg);color:var(--text);box-shadow:inset 0 0 0 1px var(--border)}
header .right{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:12px;color:var(--muted)}
header code{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.pill{font-size:11px}
.pill.live{color:var(--ok)}
/* ---- shared ---- */
main{flex:1;min-height:0;display:flex}
.view{flex:1;min-height:0;display:none;flex-direction:column}
.view.on{display:flex}
.scroll{overflow:auto;flex:1;min-height:0}
.wrap{max-width:880px;margin:0 auto;padding:0 20px;width:100%}
h2{font-size:15px;font-weight:600;margin:24px 0 10px}
h2:first-child{margin-top:20px}
.lede{color:var(--muted);font-size:12.5px;margin:0 0 14px}
.empty{color:var(--muted);text-align:center;padding:70px 20px}
.empty b{display:block;font-size:16px;color:var(--text);margin-bottom:6px}
.badge{font-size:11px;padding:1px 7px;border-radius:999px;font-weight:600;white-space:nowrap}
.b-done{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
.b-failed{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.b-cancelled{color:var(--muted);background:color-mix(in srgb,var(--muted) 18%,transparent)}
.b-claimed{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.b-pending{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--muted);margin-right:5px;vertical-align:middle}
.dot.run{background:var(--accent);animation:pulse 1.2s infinite}
@keyframes pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.dot.run{animation:none}}
pre{background:var(--sunk);border:1px solid var(--border);border-radius:6px;padding:8px 10px;overflow:auto;font-family:var(--mono);font-size:12.5px;margin:6px 0;white-space:pre-wrap;word-break:break-word}
code{font-family:var(--mono);font-size:12.5px;background:var(--sunk);padding:1px 4px;border-radius:3px}
input,select,textarea{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 8px;min-width:0}
input:focus,select:focus,textarea:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:-1px}
.btn{padding:6px 12px;border:0;border-radius:6px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer}
.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--border);font-weight:500}
.btn:disabled{opacity:.5;cursor:default}
/* ---- chat ---- */
.chat{display:grid;grid-template-columns:248px 1fr;flex:1;min-height:0}
.threads{border-right:1px solid var(--border);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.threads .hd{padding:10px 12px;border-bottom:1px solid var(--border)}
.threads .hd button{width:100%;text-align:left}
.threads .list{overflow:auto;flex:1;padding:6px 0}
.th{padding:8px 12px;cursor:pointer;border-left:3px solid transparent}
.th:hover{background:var(--sunk)}
.th.sel{border-left-color:var(--accent);background:var(--sunk)}
.th .t{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.th .m{font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane{display:flex;flex-direction:column;min-height:0}
.pane .top{padding:9px 20px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:12px;min-height:42px}
.pane .top .title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane .top .sub{font-size:12px;color:var(--muted);white-space:nowrap}
.pane .top .sp{flex:1}
.log{padding:16px 0 10px}
.msg{padding:6px 0;display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start}
.msg > div:last-child{min-width:0}
.msg .g{font-family:var(--mono);color:var(--muted);text-align:center;user-select:none}
.msg .who{font-size:12px;font-weight:600;margin-bottom:1px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.msg .who .t{font-weight:400;color:var(--muted);font-size:11px}
.msg .body{white-space:pre-wrap;overflow-wrap:anywhere}
.h .g{color:var(--human)} .h .who .n{color:var(--human)}
.tool{padding:2px 0}
.tool .line{font-family:var(--mono);font-size:12px;color:var(--tool);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tool .line b{font-weight:600;color:var(--text);opacity:.8}
.tool pre{display:none}
.tool.open pre{display:block}
.sys{padding:4px 0}
.sys .body{font-size:12px;color:var(--muted);font-style:italic}
.deleg summary{font-size:12px;color:var(--muted);cursor:pointer}
.deleg .arrow{color:var(--muted);font-weight:400}
.compose{border-top:1px solid var(--border);padding:12px 20px 14px;background:var(--panel)}
.compose .row{max-width:880px;margin:0 auto;display:flex;gap:8px;align-items:flex-end}
.compose .box{flex:1;border:1px solid var(--border);border-radius:8px;background:var(--bg);display:flex;flex-direction:column}
.compose textarea{border:0;background:transparent;padding:10px 12px;resize:none;min-height:42px;max-height:180px}
.compose .bar{display:flex;align-items:center;gap:8px;padding:4px 8px 6px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
.compose select{font-size:12px;padding:2px 6px}
.compose .hint{margin-left:auto}
/* ---- board ---- */
.board{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;padding:18px 20px;align-items:start}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;margin-bottom:14px}
.metric{border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--panel)}
.metric .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.metric .n{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.card{border:1px solid var(--border);border-radius:8px;background:var(--panel);overflow:hidden;margin-bottom:14px}
.card .ch{padding:8px 14px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:8px;font-weight:600;font-size:13px}
.card .ch .hint{margin-left:auto;font-weight:400;font-size:11.5px;color:var(--muted)}
.card .cb{padding:12px 14px}
.task{border-bottom:1px solid var(--border)}
.task:last-child{border-bottom:none}
.t-row{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;flex-wrap:wrap}
.t-row:hover{background:var(--sunk)}
.t-meta{color:var(--muted);font-size:12px;margin-left:auto;white-space:nowrap}
.t-body{padding:2px 14px 12px;display:flex;flex-direction:column;gap:6px}
.t-body .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.t-body pre{max-height:220px;margin:0}
.acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:11.5px;padding:3px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-family:var(--mono)}
.kv{display:flex;gap:10px;padding:7px 14px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:12px;align-items:baseline}
.kv:last-child{border-bottom:none}
.kv .k{color:var(--accent)}
.kv .v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.kv .m{color:var(--muted);font-size:11px;white-space:nowrap}
.form{display:flex;flex-direction:column;gap:8px}
.form textarea{min-height:74px;resize:vertical}
@media (max-width:900px){.board{grid-template-columns:1fr}}
/* ---- settings ---- */
.agent{border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px;background:var(--panel)}
.agent .hd{display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.agent .nm{font-weight:600}
.agent .ad{font-size:12px;color:var(--muted);font-family:var(--mono)}
.agent .role{font-size:11px;color:var(--muted);font-family:var(--mono);margin-left:auto}
.agent .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
.agent label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted)}
.agent label.chk{flex-direction:row;align-items:center;gap:6px;font-size:12px;color:var(--text)}
.agent .act{display:flex;gap:10px;align-items:center;margin-top:10px}
.agent .said{font-size:12px;color:var(--muted)}
.note{font-size:12px;color:var(--muted);border-left:2px solid var(--border);padding:2px 0 2px 10px;margin-bottom:10px}
.note b{color:var(--text);font-weight:600}
@media (max-width:760px){.chat{grid-template-columns:1fr}.threads{display:none}header .right code{display:none}}
</style>
</head>
<body>
<header>
  <span class="brand">ekip <span id="project"></span></span>
  <nav>
    <a href="/chat" data-view="chat">Chat</a>
    <a href="/board" data-view="board">Board</a>
    <a href="/settings" data-view="settings">Settings</a>
  </nav>
  <div class="right"><span id="workers"></span><code id="endpoint"></code><span class="pill" id="conn">connecting</span></div>
</header>
<main>
  <!-- CHAT -->
  <section class="view" id="v-chat"><div class="chat">
    <div class="threads">
      <div class="hd"><button class="btn ghost" id="new">+ New conversation</button></div>
      <div class="list" id="thread-list"></div>
    </div>
    <div class="pane">
      <div class="top"><span class="title" id="c-title">Pick a conversation, or start one below</span><span class="sub" id="c-sub"></span><span class="sp"></span><button class="btn ghost" id="c-cancel" hidden>Cancel</button></div>
      <div class="scroll" id="c-scroll"><div class="wrap log" id="c-log"></div></div>
      <div class="compose"><div class="row">
        <div class="box">
          <textarea id="c-text" rows="1" placeholder="Ask the crew… (Enter to send, Shift+Enter for a new line)"></textarea>
          <div class="bar">to <select id="c-to"></select><span id="c-mode"></span><span class="hint" id="c-hint"></span></div>
        </div>
        <button class="btn" id="c-send">Send</button>
      </div></div>
    </div>
  </div></section>

  <!-- BOARD -->
  <section class="view" id="v-board"><div class="scroll"><div class="board">
    <div>
      <div class="metrics" id="metrics"></div>
      <div class="card"><div class="ch">Tasks<span class="hint" id="task-count"></span></div><div id="tasks"></div></div>
      <div class="card" id="log-card" hidden><div class="ch"><span id="log-title">log</span><span class="hint"><button class="btn ghost" id="log-refresh">Refresh</button></span></div><div class="cb"><pre id="log-body" style="max-height:360px"></pre></div></div>
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

  <!-- SETTINGS -->
  <section class="view" id="v-settings"><div class="scroll"><div class="wrap">
    <h2>Agents</h2>
    <p class="lede" id="limits">…</p>
    <div id="agent-cards"></div>
    <h2>Where these model lists come from</h2>
    <div id="catalog-notes"></div>
    <h2>Connect an agent</h2>
    <p class="lede">Point any MCP-speaking agent at <code id="endpoint2"></code>. Run <code>ekip init</code> in the project to print the exact snippet per tool.</p>
  </div></div></section>
</main>
<script>
var state = null, threads = [], thread = null, current = null, catalogs = null;
var view = 'chat', expanded = null, logTask = null, logArtifact = null;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function hhmm(iso){ return new Date(iso).toTimeString().slice(0,8); }
function ago(iso){ var s = Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if (s<60) return Math.floor(s)+'s'; if (s<3600) return Math.floor(s/60)+'m'; if (s<86400) return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d'; }
function isDone(s){ return s === 'done' || s === 'failed' || s === 'cancelled'; }
var PALETTE = ['#0e7c6b','#1d4ed8','#7c3aed','#b45309','#be185d','#0f766e','#4d7c0f','#9f1239'];
function color(n){ var h=0; for (var i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; }
function md(s){
  return String(s).split(/(\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60)/g).map(function(p){
    if (p.indexOf('\\x60\\x60\\x60') === 0) return '<pre>' + esc(p.slice(3,-3).replace(/^[a-zA-Z0-9_-]*\\n/,'')) + '</pre>';
    return esc(p).replace(/\\x60([^\\x60\\n]+)\\x60/g, '<code>$1</code>');
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

/* ---------- router ---------- */
function go(path, push){
  var m = /^\\/(chat|board|settings)(?:\\/([A-Za-z0-9-]+))?/.exec(path) || [];
  view = m[1] || 'chat';
  if (view === 'chat' && m[2]) current = m[2];
  if (push !== false && location.pathname !== path) history.pushState({}, '', path);
  ['chat','board','settings'].forEach(function(v){ $('v-'+v).classList.toggle('on', v === view); });
  document.querySelectorAll('nav a').forEach(function(a){ a.classList.toggle('on', a.getAttribute('data-view') === view); });
  if (view === 'settings' && !catalogs) loadCatalogs();
  refresh(true);
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
  return fetch('/api/thread/' + current).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){ thread = d; });
}
function loadCatalogs(){ return fetch('/api/models').then(function(r){ return r.json(); }).then(function(c){ catalogs = c; renderSettings(); }); }
var busy = false, again = false;
function refresh(now){
  if (busy) { again = true; return; }
  busy = true;
  var work = [loadState()];
  if (view === 'chat') work.push(loadThreads(), loadThread());
  Promise.all(work).then(function(){ render(); }).finally(function(){
    busy = false; if (again) { again = false; setTimeout(refresh, 60); }
  });
}

/* ---------- render ---------- */
function render(){
  if (!state) return;
  $('project').textContent = '· ' + state.project;
  $('endpoint').textContent = state.hubUrl;
  if ($('endpoint2')) $('endpoint2').textContent = state.hubUrl;
  var w = state.workers || { running: [], queued: [], lingering: [] };
  $('workers').textContent = w.running.length + ' running' + (w.queued.length ? ' · ' + w.queued.length + ' queued' : '');
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
function renderChat(){
  $('thread-list').innerHTML = threads.length ? threads.map(function(t){
    return '<div class="th' + (t.id === current ? ' sel' : '') + '" data-id="' + t.id + '">' +
      '<div class="t"><span class="dot' + (isDone(t.status) ? '' : ' run') + '"></span>' + esc(t.title) + '</div>' +
      '<div class="m">' + esc(t.from) + ' → ' + esc(t.to) + ' · ' + t.messages + ' lines · ' + ago(t.lastAt) + '</div></div>';
  }).join('') : '<div class="empty" style="padding:26px 12px;font-size:12px">No conversations yet.</div>';

  if (!thread) {
    $('c-title').textContent = 'Pick a conversation, or start one below';
    $('c-sub').textContent = ''; $('c-cancel').hidden = true; $('c-mode').textContent = 'starts a new conversation';
    $('c-log').innerHTML = '<div class="empty"><b>Nothing here yet</b>Type a request below — it goes to the agent you pick, and every reply, hand-off and tool call shows up here as it happens.</div>';
    return;
  }
  var byId = {}; thread.tasks.forEach(function(t){ byId[t.id] = t; });
  var root = byId[thread.thread] || thread.tasks[0];
  var live = thread.tasks.filter(function(t){ return !isDone(t.status); }).length;
  var cost = 0, tok = 0;
  thread.tasks.forEach(function(t){ if (t.usage) { cost += t.usage.costUsd || 0; tok += (t.usage.inputTokens||0)+(t.usage.outputTokens||0); } });
  $('c-title').textContent = root.title;
  $('c-sub').textContent = thread.tasks.length + ' task' + (thread.tasks.length>1?'s':'') + (live ? ' · ' + live + ' running' : ' · finished') + (tok ? ' · ' + tokens(tok) : '') + (cost ? ' · ' + money(cost) : '');
  $('c-cancel').hidden = !live;
  $('c-mode').textContent = 'replies in this conversation';

  var html = thread.messages.map(function(m){
    var t = byId[m.taskId] || {};
    if (m.kind === 'human') return '<div class="msg h"><div class="g">›</div><div><div class="who"><span class="n">' + esc(m.from) + '</span><span class="t">→ ' + esc(m.to || t.to || '') + ' · ' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div></div>';
    if (m.kind === 'system') return '<div class="msg sys"><div class="g">·</div><div class="body">' + esc(m.text) + ' <span style="opacity:.7">' + hhmm(m.at) + '</span></div></div>';
    if (m.kind === 'tool') { var tn = (m.meta && m.meta.tool) || 'tool';
      return '<div class="msg tool" onclick="this.classList.toggle(\\'open\\')"><div class="g">⚙</div><div><div class="line"><b>' + esc(tn.replace('mcp__ekip__','')) + '</b> ' + esc(m.text.slice(tn.length)) + '</div><pre>' + esc(JSON.stringify(m.meta && m.meta.input, null, 2)) + '</pre></div></div>'; }
    var c = color(m.from), who = '<span class="n" style="color:' + c + '">' + esc(m.from) + '</span>';
    if (m.meta && m.meta.delegation) return '<div class="msg deleg"><div class="g" style="color:' + c + '">↳</div><div><div class="who">' + who + '<span class="arrow">→ ' + esc(m.to) + '</span><span class="t">delegates · ' + esc(m.meta.title || '') + ' · ' + hhmm(m.at) + '</span></div><details><summary>instruction (' + m.text.length + ' chars)</summary><div class="body">' + md(m.text) + '</div></details></div></div>';
    if (m.meta && m.meta.result) { var u = usageLine(t.usage);
      return '<div class="msg"><div class="g" style="color:' + c + '">●</div><div><div class="who">' + who + '<span class="badge b-' + esc(m.meta.result) + '">' + esc(m.meta.result) + '</span><span class="t">' + esc(t.title || '') + (u ? ' · ' + u : '') + ' · ' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div></div>'; }
    return '<div class="msg"><div class="g" style="color:' + c + '">●</div><div><div class="who">' + who + (m.to ? '<span class="t">→ ' + esc(m.to) + '</span>' : '') + '<span class="t">' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div></div>';
  }).join('');
  thread.tasks.forEach(function(t){
    if (isDone(t.status)) return;
    var what = t.status === 'claimed' ? 'is working on' : (t.pid ? 'is starting' : (t.dispatchedAt ? 'lost its worker (hub restarted) on' : 'is queued for'));
    html += '<div class="msg sys"><div class="g"><span class="dot run"></span></div><div class="body">' + esc(t.to) + ' ' + what + ' “' + esc(t.title) + '”…</div></div>';
  });
  var sc = $('c-scroll'), stick = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 40;
  $('c-log').innerHTML = html;
  if (stick) sc.scrollTop = sc.scrollHeight;
}
$('thread-list').addEventListener('click', function(e){
  var el = e.target.closest('.th'); if (!el) return;
  current = el.getAttribute('data-id'); go('/chat/' + current);
  setTimeout(function(){ $('c-scroll').scrollTop = $('c-scroll').scrollHeight; }, 200);
});
$('new').addEventListener('click', function(){ current = null; thread = null; go('/chat'); $('c-text').focus(); });
$('c-cancel').addEventListener('click', function(){
  if (!thread || !confirm('Cancel this conversation and everything running in it?')) return;
  fetch('/api/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task_id: thread.thread, by: 'human' }) });
});
function send(){
  var text = $('c-text').value.trim(); if (!text) return;
  var body = { to: $('c-to').value, prompt: text, from: 'human' };
  if (current) body.parent_task_id = current;
  $('c-send').disabled = true;
  fetch('/api/delegate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      $('c-send').disabled = false;
      if (d.error) { $('c-hint').textContent = d.error; return; }
      $('c-text').value = ''; $('c-hint').textContent = ''; autosize();
      if (!current) { current = d.task.id; history.replaceState({}, '', '/chat/' + current); }
      refresh();
      setTimeout(function(){ $('c-scroll').scrollTop = $('c-scroll').scrollHeight; }, 250);
    })
    .catch(function(){ $('c-send').disabled = false; });
}
$('c-send').addEventListener('click', send);
$('c-text').addEventListener('keydown', function(e){
  if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
function autosize(){ var t = $('c-text'); t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight) + 'px'; }
$('c-text').addEventListener('input', autosize);

/* --- board --- */
function renderBoard(){
  var counts = { pending:0, claimed:0, done:0, failed:0, cancelled:0 };
  state.tasks.forEach(function(t){ if (counts[t.status] !== undefined) counts[t.status]++; });
  $('metrics').innerHTML = Object.keys(counts).map(function(k){
    return '<div class="metric"><div class="l">' + k + '</div><div class="n">' + counts[k] + '</div></div>';
  }).join('');
  var tasks = state.tasks.slice().sort(function(a,b){ return b.createdAt.localeCompare(a.createdAt); }).slice(0,60);
  $('task-count').textContent = state.tasks.length + ' total';
  $('tasks').innerHTML = tasks.length ? tasks.map(function(t){
    var h = '<div class="task"><div class="t-row" data-id="' + t.id + '">' +
      '<span class="badge b-' + t.status + '">' + t.status + '</span><span>' + esc(t.title) + '</span>' +
      '<span class="t-meta">' + esc(t.from) + ' → ' + esc(t.to) + ' · ' + ago(t.updatedAt) + '</span></div>';
    if (expanded === t.id) {
      h += '<div class="t-body"><span class="lbl">prompt</span><pre>' + esc(t.prompt) + '</pre>';
      if (t.result) h += '<span class="lbl">result</span><pre>' + esc(t.result) + '</pre>';
      if (t.usage) h += '<span class="lbl">run</span><div style="font-size:12px;color:var(--muted)">' + esc(usageLine(t.usage)) + '</div>';
      if (t.artifacts && t.artifacts.length) h += '<span class="lbl">artifacts</span><div class="chips">' + t.artifacts.map(function(a,i){
        return '<button class="chip" data-art="' + t.id + ':' + i + '">' + esc(a.kind) + (a.label ? ': ' + esc(a.label) : '') + '</button>'; }).join('') + '</div>';
      h += '<div class="acts"><button class="btn ghost" data-log="' + t.id + '">View log</button>' +
        (isDone(t.status) ? '' : '<button class="btn ghost" data-cancel="' + t.id + '">Cancel</button>') +
        '<a href="/chat/' + (t.parentId || t.id) + '" data-thread="1">open conversation</a>' +
        (t.pid ? '<span style="font-size:12px;color:var(--muted)">pid ' + t.pid + '</span>' : '') + '</div></div>';
    }
    return h + '</div>';
  }).join('') : '<div class="empty" style="padding:30px"><b>No tasks yet</b>Delegate one with the form on the right.</div>';

  var ctx = state.context.slice().sort(function(a,b){ return b.updatedAt.localeCompare(a.updatedAt); });
  $('ctx-count').textContent = ctx.length + ' keys';
  $('context').innerHTML = ctx.length ? ctx.map(function(c){
    return '<div class="kv"><span class="k">' + esc(c.key) + '</span><span class="v">' + esc(JSON.stringify(c.value)) + '</span><span class="m">' + esc(c.updatedBy) + ' · ' + ago(c.updatedAt) + '</span></div>';
  }).join('') : '<div class="cb" style="color:var(--muted);font-size:12.5px">Empty blackboard.</div>';
}
$('tasks').addEventListener('click', function(e){
  var art = e.target.closest('[data-art]'), lg = e.target.closest('[data-log]'), cx = e.target.closest('[data-cancel]'), th = e.target.closest('[data-thread]');
  if (th) { e.preventDefault(); go(th.getAttribute('href')); return; }
  if (art) { var parts = art.getAttribute('data-art').split(':');
    var task = state.tasks.filter(function(x){ return x.id === parts[0]; })[0];
    var a = task && task.artifacts ? task.artifacts[+parts[1]] : null; if (!a) return;
    logTask = null; logArtifact = a; $('log-card').hidden = false;
    $('log-title').textContent = 'artifact · ' + a.kind + (a.label ? ' · ' + a.label : '');
    $('log-body').textContent = a.value; return; }
  if (lg) { logArtifact = null; logTask = lg.getAttribute('data-log'); $('log-card').hidden = false; $('log-title').textContent = 'log · ' + logTask.slice(0,8); loadLog(); return; }
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
    $('limits').textContent = 'Hub limits: up to ' + l.maxConcurrent + ' workers at once, delegation depth ' + l.maxDepth +
      ', watchdog fails a task after ' + l.watchdog.pendingTtlSeconds + 's unclaimed / ' + l.watchdog.claimedTtlSeconds + 's without a result, finished tasks kept ' + l.retention.days + ' days. Change these in ekip.config.json.';
  });
  $('agent-cards').innerHTML = state.agents.map(function(a){
    var cat = (catalogs && catalogs[a.adapter] && catalogs[a.adapter].models) || [];
    var known = cat.some(function(m){ return m.value === a.model; });
    var opts = cat.map(function(m){
      var tag = m.source === 'seen' ? ' · seen here' : m.source === 'account' ? ' · your account' : '';
      return '<option value="' + esc(m.value) + '"' + (m.value === a.model ? ' selected' : '') + '>' + esc(m.label) + tag + '</option>';
    }).join('');
    return '<div class="agent" data-name="' + esc(a.name) + '">' +
      '<div class="hd"><span class="nm">' + esc(a.name) + '</span><span class="ad">' + esc(a.adapter) + '</span>' +
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
go(location.pathname, false);
setInterval(function(){ if (view === 'chat') renderChat(); }, 30000);
</script>
</body>
</html>`;
}
