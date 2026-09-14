/**
 * The `/chat` page — the conversation view of the hub, in the spirit of a
 * Claude Code transcript: one thread per delegation tree, every agent's words
 * and tool calls in order, a composer at the bottom to talk to the crew.
 *
 * Dependency-free like the board (`/ui`): plain HTML + a little JS that reads
 * `/api/threads`, `/api/thread/:id`, and re-fetches on `/api/events`. Client
 * JS avoids template literals so the page can live in one TS template string.
 */
export function chatHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ekip · chat</title>
<style>
:root{--bg:#fbfbfa;--panel:#f2f1ee;--border:#dedcd6;--text:#1c1c1a;--muted:#6f6d67;--accent:#0e7c6b;--human:#8a4b00;--tool:#5b5750;--ok:#1f7a3f;--bad:#b3362b;--warn:#a06400;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1d1d1b;--border:#2e2e2b;--text:#e8e6e1;--muted:#8f8c84;--accent:#4cc2ac;--human:#e0a45c;--tool:#a29d93;--ok:#5fc07f;--bad:#f07a6f;--warn:#e2b04a;}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;display:grid;grid-template-columns:250px 1fr;grid-template-rows:100vh;}
a{color:var(--accent);text-decoration:none}
aside{border-right:1px solid var(--border);background:var(--panel);display:flex;flex-direction:column;min-height:0}
aside .hd{padding:14px 14px 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)}
aside .hd b{font-size:15px}
aside .hd .pill{margin-left:auto;font-size:11px;color:var(--muted)}
aside .hd .pill.live{color:var(--ok)}
aside button.new{margin:10px 14px 4px;padding:7px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:6px;cursor:pointer;text-align:left;font:inherit}
aside button.new:hover{border-color:var(--accent)}
.threads{overflow:auto;flex:1;padding:6px 0}
.th{padding:8px 14px;cursor:pointer;border-left:3px solid transparent}
.th:hover{background:color-mix(in srgb,var(--border) 45%,transparent)}
.th.sel{border-left-color:var(--accent);background:color-mix(in srgb,var(--border) 60%,transparent)}
.th .t{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.th .m{font-size:11px;color:var(--muted);display:flex;gap:6px;margin-top:2px}
aside .ft{padding:10px 14px;border-top:1px solid var(--border);font-size:12px;color:var(--muted);display:flex;gap:10px}
main{display:flex;flex-direction:column;min-height:0}
.top{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:12px;min-height:44px}
.top .title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .sub{font-size:12px;color:var(--muted);white-space:nowrap}
.top .sp{flex:1}
.top button{font:inherit;font-size:12px;padding:3px 9px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:5px;cursor:pointer}
.log{flex:1;overflow:auto;padding:18px 0 10px;scroll-behavior:smooth}
.wrap{max-width:860px;margin:0 auto;padding:0 20px}
.msg{padding:6px 0;display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start}
.msg .g{font-family:var(--mono);color:var(--muted);text-align:center;line-height:1.5;user-select:none}
.msg .who{font-size:12px;font-weight:600;margin-bottom:1px;display:flex;gap:8px;align-items:baseline}
.msg .who .t{font-weight:400;color:var(--muted);font-size:11px}
.msg > div:last-child{min-width:0}
.msg .body{white-space:pre-wrap;overflow-wrap:anywhere}
.msg .body pre{background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:8px 10px;overflow:auto;font-family:var(--mono);font-size:12.5px;margin:6px 0}
.msg .body code{font-family:var(--mono);font-size:12.5px;background:var(--panel);padding:1px 4px;border-radius:3px}
.h .g{color:var(--human)} .h .who .n{color:var(--human)}
.a .g{color:var(--accent)}
.tool{padding:2px 0;grid-template-columns:22px 1fr}
.tool .line{font-family:var(--mono);font-size:12px;color:var(--tool);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tool .line b{font-weight:600;color:var(--text);opacity:.8}
.tool pre{display:none;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--mono);font-size:12px;overflow:auto;margin:4px 0 6px;white-space:pre-wrap}
.tool.open pre{display:block}
.sys{padding:4px 0;grid-template-columns:22px 1fr}
.sys .body{font-size:12px;color:var(--muted);font-style:italic}
.deleg .who .arrow{color:var(--muted);font-weight:400}
.deleg details{margin-top:2px}
.deleg summary{font-size:12px;color:var(--muted);cursor:pointer}
.badge{font-size:11px;padding:1px 7px;border-radius:999px;font-weight:600}
.b-done{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
.b-failed{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.b-cancelled{color:var(--muted);background:color-mix(in srgb,var(--muted) 18%,transparent)}
.b-claimed{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.b-pending{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
.empty{color:var(--muted);text-align:center;padding:80px 20px}
.empty b{display:block;font-size:16px;color:var(--text);margin-bottom:6px}
.compose{border-top:1px solid var(--border);padding:12px 20px 14px;background:var(--panel)}
.compose .row{max-width:860px;margin:0 auto;display:flex;gap:8px;align-items:flex-end}
.compose .box{flex:1;border:1px solid var(--border);border-radius:8px;background:var(--bg);display:flex;flex-direction:column}
.compose textarea{border:0;background:transparent;color:var(--text);font:inherit;padding:10px 12px;resize:none;min-height:42px;max-height:200px;outline:none}
.compose .bar{display:flex;align-items:center;gap:8px;padding:4px 8px 6px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
.compose select{font:inherit;font-size:12px;background:transparent;color:var(--text);border:1px solid var(--border);border-radius:5px;padding:2px 6px}
.compose .hint{margin-left:auto}
.compose button.send{font:inherit;padding:9px 14px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font-weight:600}
.compose button.send:disabled{opacity:.5;cursor:default}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--muted);margin-right:5px;vertical-align:middle}
.dot.run{background:var(--accent);animation:pulse 1.2s infinite}
@keyframes pulse{50%{opacity:.35}}
@media (max-width:760px){body{grid-template-columns:1fr}aside{display:none}}
</style>
</head>
<body>
<aside>
  <div class="hd"><b>ekip</b><span id="project" style="color:var(--muted)"></span><span class="pill" id="conn">connecting</span></div>
  <button class="new" id="new">+ New conversation</button>
  <div class="threads" id="threads"></div>
  <div class="ft"><a href="/ui">board</a><span id="agents-ft"></span></div>
</aside>
<main>
  <div class="top"><span class="title" id="title">Pick a conversation, or start one below</span><span class="sub" id="sub"></span><span class="sp"></span><button id="cancel" hidden>Cancel</button></div>
  <div class="log" id="log"><div class="wrap" id="lines"><div class="empty"><b>Nothing here yet</b>Type a request below — it goes to the agent you pick, and every reply, hand-off and tool call shows up here as it happens.</div></div></div>
  <div class="compose"><div class="row">
    <div class="box">
      <textarea id="text" rows="1" placeholder="Ask the crew… (Enter to send, Shift+Enter for a new line)"></textarea>
      <div class="bar">to <select id="to"></select><span id="mode"></span><span class="hint" id="hint"></span></div>
    </div>
    <button class="send" id="send">Send</button>
  </div></div>
</main>
<script>
var threads = [], current = null, thread = null, agents = [], project = '';
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function hhmm(iso){ var d = new Date(iso); return d.toTimeString().slice(0,8); }
function ago(iso){ var s = Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if (s<60) return Math.floor(s)+'s'; if (s<3600) return Math.floor(s/60)+'m'; if (s<86400) return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d'; }
var PALETTE = ['#0e7c6b','#1d4ed8','#7c3aed','#b45309','#be185d','#0f766e','#4d7c0f','#9f1239'];
function color(name){ var h = 0; for (var i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
function md(s){
  var parts = String(s).split(/(\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60)/g);
  return parts.map(function(p){
    if (p.indexOf('\\x60\\x60\\x60') === 0) { var body = p.slice(3, -3).replace(/^[a-zA-Z0-9_-]*\\n/, ''); return '<pre>' + esc(body) + '</pre>'; }
    return esc(p).replace(/\\x60([^\\x60\\n]+)\\x60/g, '<code>$1</code>');
  }).join('');
}
function isTerminal(s){ return s === 'done' || s === 'failed' || s === 'cancelled'; }
function fmtUsage(u){ if (!u) return ''; var bits = [];
  var tok = (u.inputTokens||0) + (u.outputTokens||0); if (tok) bits.push(tok >= 1000 ? (tok/1000).toFixed(1)+'k tok' : tok+' tok');
  if (typeof u.costUsd === 'number') bits.push('$' + u.costUsd.toFixed(u.costUsd < 0.1 ? 3 : 2));
  if (u.durationMs) bits.push(Math.round(u.durationMs/1000)+'s'); return bits.join(' · '); }

function loadThreads(){ return fetch('/api/threads').then(function(r){ return r.json(); }).then(function(d){ threads = d.threads; renderThreads(); }); }
function loadState(){ return fetch('/api/state').then(function(r){ return r.json(); }).then(function(st){
  agents = st.agents; project = st.project; $('project').textContent = '· ' + project;
  var sel = $('to'); if (sel.options.length !== agents.length) {
    sel.innerHTML = agents.map(function(a){ return '<option value="' + esc(a.name) + '">' + esc(a.name) + (a.spawnable ? '' : ' (polls)') + '</option>'; }).join('');
    var pref = agents.filter(function(a){ return a.name === 'conductor'; })[0] || agents.filter(function(a){ return a.spawnable; })[0];
    if (pref) sel.value = pref.name;
  }
  var running = (st.workers && st.workers.running || []).length, queued = (st.workers && st.workers.queued || []).length;
  $('agents-ft').textContent = agents.length + ' agents · ' + running + ' running' + (queued ? ' · ' + queued + ' queued' : '');
}); }
function loadThread(){ if (!current) { thread = null; render(); return Promise.resolve(); }
  return fetch('/api/thread/' + current).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){ thread = d; render(); }); }

function renderThreads(){
  $('threads').innerHTML = threads.length ? threads.map(function(t){
    return '<div class="th' + (t.id === current ? ' sel' : '') + '" data-id="' + t.id + '">' +
      '<div class="t"><span class="dot' + (isTerminal(t.status) ? '' : ' run') + '"></span>' + esc(t.title) + '</div>' +
      '<div class="m"><span>' + esc(t.from) + ' → ' + esc(t.to) + '</span><span>·</span><span>' + t.messages + ' lines</span><span>·</span><span>' + ago(t.lastAt) + '</span></div></div>';
  }).join('') : '<div class="empty" style="padding:30px 14px;font-size:12px">No conversations yet.</div>';
}
function render(){
  var cancelBtn = $('cancel');
  if (!thread) { $('title').textContent = 'Pick a conversation, or start one below'; $('sub').textContent = ''; cancelBtn.hidden = true; $('mode').textContent = 'starts a new conversation';
    $('lines').innerHTML = '<div class="empty"><b>Nothing here yet</b>Type a request below — it goes to the agent you pick, and every reply, hand-off and tool call shows up here as it happens.</div>'; return; }
  var root = thread.tasks.filter(function(t){ return t.id === thread.thread; })[0] || thread.tasks[0];
  var live = thread.tasks.filter(function(t){ return !isTerminal(t.status); }).length;
  var cost = 0, tok = 0; thread.tasks.forEach(function(t){ if (t.usage) { cost += t.usage.costUsd || 0; tok += (t.usage.inputTokens||0) + (t.usage.outputTokens||0); } });
  $('title').textContent = root.title;
  $('sub').textContent = thread.tasks.length + ' task' + (thread.tasks.length > 1 ? 's' : '') + (live ? ' · ' + live + ' running' : ' · finished') + (tok ? ' · ' + (tok >= 1000 ? (tok/1000).toFixed(1)+'k tok' : tok+' tok') : '') + (cost ? ' · $' + cost.toFixed(cost < 0.1 ? 3 : 2) : '');
  cancelBtn.hidden = !live;
  $('mode').textContent = 'replies in this conversation';
  var taskById = {}; thread.tasks.forEach(function(t){ taskById[t.id] = t; });
  var html = thread.messages.map(function(m){
    var t = taskById[m.taskId] || {};
    if (m.kind === 'human') return '<div class="msg h"><div class="g">›</div><div><div class="who"><span class="n">' + esc(m.from) + '</span><span class="t">→ ' + esc(m.to || t.to || '') + ' · ' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div></div>';
    if (m.kind === 'system') return '<div class="msg sys"><div class="g">·</div><div class="body">' + esc(m.text) + ' <span style="opacity:.7">' + hhmm(m.at) + '</span></div></div>';
    if (m.kind === 'tool') return '<div class="msg tool" onclick="this.classList.toggle(\\'open\\')"><div class="g">⚙</div><div><div class="line"><b>' + esc(m.meta && m.meta.tool || 'tool') + '</b> ' + esc(m.text.slice((m.meta && m.meta.tool || '').length)) + '</div><pre>' + esc(JSON.stringify(m.meta && m.meta.input, null, 2)) + '</pre></div></div>';
    var c = color(m.from), who = '<span class="n" style="color:' + c + '">' + esc(m.from) + '</span>';
    if (m.meta && m.meta.delegation) {
      return '<div class="msg a deleg"><div class="g" style="color:' + c + '">↳</div><div><div class="who">' + who + '<span class="arrow">→ ' + esc(m.to) + '</span><span class="t">delegates · ' + esc(m.meta.title || '') + ' · ' + hhmm(m.at) + '</span></div>' +
        '<details><summary>instruction (' + m.text.length + ' chars)</summary><div class="body">' + md(m.text) + '</div></details></div></div>';
    }
    if (m.meta && m.meta.result) {
      var u = t.usage ? fmtUsage(t.usage) : '';
      return '<div class="msg a"><div class="g" style="color:' + c + '">●</div><div><div class="who">' + who + '<span class="badge b-' + esc(m.meta.result) + '">' + esc(m.meta.result) + '</span><span class="t">' + esc(t.title || '') + (u ? ' · ' + u : '') + ' · ' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div></div>';
    }
    return '<div class="msg a"><div class="g" style="color:' + c + '">●</div><div><div class="who">' + who + (m.to ? '<span class="t">→ ' + esc(m.to) + '</span>' : '') + '<span class="t">' + hhmm(m.at) + '</span></div><div class="body">' + md(m.text) + '</div></div></div>';
  }).join('');
  thread.tasks.forEach(function(t){ if (t.status === 'pending' || t.status === 'claimed') {
    html += '<div class="msg sys"><div class="g"><span class="dot run"></span></div><div class="body">' + esc(t.to) + ' ' + (t.status === 'claimed' ? 'is working on' : (t.pid ? 'is starting' : (t.dispatchedAt ? 'lost its worker (hub restarted) on' : 'is queued for'))) + ' “' + esc(t.title) + '”…</div></div>'; } });
  var log = $('log'), stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
  $('lines').innerHTML = html;
  if (stick) log.scrollTop = log.scrollHeight;
}
function select(id){ current = id; renderThreads(); loadThread().then(function(){ $('log').scrollTop = $('log').scrollHeight; }); }
$('threads').addEventListener('click', function(e){ var el = e.target.closest('.th'); if (el) select(el.getAttribute('data-id')); });
$('new').addEventListener('click', function(){ current = null; thread = null; renderThreads(); render(); $('text').focus(); });
$('cancel').addEventListener('click', function(){ if (!thread || !confirm('Cancel this conversation and everything running in it?')) return;
  fetch('/api/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task_id: thread.thread, by: 'human' }) }); });
function send(){
  var text = $('text').value.trim(); if (!text) return;
  var body = { to: $('to').value, prompt: text, from: 'human' };
  if (current) body.parent_task_id = current;
  $('send').disabled = true;
  fetch('/api/delegate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){ $('send').disabled = false; if (d.error) { $('hint').textContent = d.error; return; }
      $('text').value = ''; $('hint').textContent = ''; autosize();
      if (!current) { current = d.task.id; }
      loadThreads(); loadThread().then(function(){ $('log').scrollTop = $('log').scrollHeight; }); })
    .catch(function(){ $('send').disabled = false; });
}
$('send').addEventListener('click', send);
$('text').addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === 'Return' || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
function autosize(){ var t = $('text'); t.style.height = 'auto'; t.style.height = Math.min(200, t.scrollHeight) + 'px'; }
$('text').addEventListener('input', autosize);
var pending = false;
function refresh(){ if (pending) return; pending = true; setTimeout(function(){ pending = false; loadThreads(); loadThread(); loadState(); }, 120); }
var es = new EventSource('/api/events');
es.onopen = function(){ var c = $('conn'); c.textContent = 'live'; c.className = 'pill live'; refresh(); };
es.onerror = function(){ var c = $('conn'); c.textContent = 'reconnecting'; c.className = 'pill'; };
es.onmessage = function(){ refresh(); };
loadState(); loadThreads();
if (location.hash.length > 1) select(location.hash.slice(1));
setInterval(function(){ renderThreads(); }, 30000);
</script>
</body>
</html>`;
}
