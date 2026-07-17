/**
 * The `/ui` dashboard — a single self-contained HTML page served by the hub.
 *
 * Deliberately dependency-free (no build step, no framework): the page fetches
 * `/api/state`, re-renders on every `/api/events` SSE message, and posts to
 * `/api/delegate` / `/api/context`. Client JS avoids template literals so this
 * file can hold the page in one TS template string.
 */
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agent-bridge</title>
<style>
:root{--bg:#f6f6f4;--card:#ffffff;--border:#e4e3de;--text:#1c1c1a;--muted:#6d6c66;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;}
@media (prefers-color-scheme:dark){:root{--bg:#161619;--card:#1f1f24;--border:#33333b;--text:#e9e8e3;--muted:#9d9c94;}}
*{box-sizing:border-box;margin:0;}
body{background:var(--bg);color:var(--text);font:14px/1.6 system-ui,-apple-system,sans-serif;padding:20px;}
.wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
h1{font-size:18px;font-weight:600;}
h2{font-size:14px;font-weight:600;}
code,pre{font-family:var(--mono);font-size:12px;}
.endpoint{color:var(--muted);margin-left:10px;}
.chips{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--muted);}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;background:#22c55e;}
.dot.off{background:var(--border);}
.pill{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted);}
.pill.live{color:#15803d;border-color:#15803d55;}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;}
.metric{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px;}
.metric .n{font-size:22px;font-weight:600;}
.metric .l{font-size:12px;color:var(--muted);}
.cols{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;align-items:start;}
@media (max-width:800px){.cols{grid-template-columns:minmax(0,1fr);}}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.card-h{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);}
.card-h .hint{color:var(--muted);font-size:12px;margin-left:auto;}
.side{display:flex;flex-direction:column;gap:16px;}
.task{border-bottom:1px solid var(--border);}
.task:last-child{border-bottom:none;}
.t-row{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;flex-wrap:wrap;}
.t-row:hover{background:color-mix(in srgb,var(--border) 30%,transparent);}
.t-title{font-weight:500;}
.t-meta{color:var(--muted);font-size:12px;margin-left:auto;white-space:nowrap;}
.t-body{padding:4px 16px 14px;display:flex;flex-direction:column;gap:8px;}
.t-body pre{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;}
.t-body .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.badge{font-size:11px;padding:2px 9px;border-radius:999px;font-weight:600;}
.b-pending{color:#b45309;background:rgba(217,119,6,.14);}
.b-claimed{color:#1d4ed8;background:rgba(59,130,246,.14);}
.b-done{color:#15803d;background:rgba(34,197,94,.14);}
.b-failed{color:#b91c1c;background:rgba(239,68,68,.14);}
@media (prefers-color-scheme:dark){.b-pending{color:#fbbf24;}.b-claimed{color:#93c5fd;}.b-done{color:#4ade80;}.b-failed{color:#f87171;}}
.kv{display:flex;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:12px;align-items:baseline;}
.kv .k{color:#1d4ed8;}
@media (prefers-color-scheme:dark){.kv .k{color:#93c5fd;}}
.kv .v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
.kv .m{color:var(--muted);white-space:nowrap;font-family:system-ui;}
.empty{padding:14px 16px;color:var(--muted);font-size:13px;}
form{padding:12px 16px;display:flex;gap:8px;}
form.stack{flex-direction:column;}
input,select,textarea,button{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:7px 10px;}
textarea{resize:vertical;}
button{cursor:pointer;background:var(--card);}
button:hover{border-color:var(--muted);}
.agent-row{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:6px;}
.agent-row:last-child{border-bottom:none;}
.agent-row .top{display:flex;align-items:baseline;gap:8px;}
.agent-row .top .nm{font-weight:600;}
.agent-row .top .ad{color:var(--muted);font-size:12px;}
.agent-row .top label{margin-left:auto;font-size:12px;color:var(--muted);display:flex;gap:5px;align-items:center;}
.agent-row .ctl{display:flex;gap:6px;}
.agent-row .ctl input{flex:1;font-family:var(--mono);font-size:12px;padding:5px 8px;}
.agent-row .ctl select,.agent-row .ctl button{font-size:12px;padding:5px 8px;}
.artifacts{display:flex;gap:6px;flex-wrap:wrap;}
.artifact{font-size:12px;border:1px solid var(--border);border-radius:999px;padding:2px 10px;color:var(--muted);}
.actions{display:flex;gap:8px;}
.actions button{font-size:12px;padding:4px 10px;}
#log{margin:0;padding:12px 16px;max-height:320px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--muted);}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div><h1 style="display:inline">agent-bridge · <span id="project"></span></h1><code class="endpoint" id="endpoint"></code></div>
  <div class="chips" id="agents"></div>
  <span class="pill" id="conn">connecting</span>
</header>
<section class="metrics" id="metrics"></section>
<main class="cols">
  <section class="card">
    <div class="card-h"><h2>Tasks</h2><span class="hint" id="task-count"></span></div>
    <div id="tasks"></div>
  </section>
  <div class="side">
    <section class="card">
      <div class="card-h"><h2>Agents</h2><span class="hint">applies to the next spawn</span></div>
      <div id="agent-cfg"></div>
    </section>
    <datalist id="models-claude"></datalist>
    <datalist id="models-antigravity"></datalist>
    <section class="card">
      <div class="card-h"><h2>Blackboard</h2></div>
      <div id="context"></div>
      <form id="ctx-form">
        <input id="ctx-key" placeholder="key" required style="width:34%">
        <input id="ctx-value" placeholder="value (JSON or text)" required style="flex:1">
        <button>Set</button>
      </form>
    </section>
    <section class="card">
      <div class="card-h"><h2>New task</h2></div>
      <form id="d-form" class="stack">
        <select id="d-to"></select>
        <input id="d-title" placeholder="title (optional)">
        <textarea id="d-prompt" rows="3" placeholder="What should this agent do?" required></textarea>
        <button style="align-self:flex-end">Delegate</button>
      </form>
    </section>
  </div>
</main>
<section class="card" id="log-card" hidden>
  <div class="card-h"><h2>Log</h2><code id="log-task"></code><span class="hint"><button id="log-refresh" style="font-size:12px;padding:3px 10px">Refresh</button></span></div>
  <pre id="log"></pre>
</section>
</div>
<script>
var state = null, expanded = null, logTask = null, agentsSig = null;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function ago(iso){ var s = Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if (s<60) return Math.floor(s)+'s ago'; if (s<3600) return Math.floor(s/60)+'m ago';
  if (s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }
function load(){ fetch('/api/state').then(function(r){ return r.json(); }).then(function(st){ state = st; render(); }); }
function render(){
  if (!state) return;
  $('project').textContent = state.project;
  $('endpoint').textContent = state.hubUrl;
  var counts = { pending:0, claimed:0, done:0, failed:0 };
  state.tasks.forEach(function(t){ if (counts[t.status] !== undefined) counts[t.status]++; });
  $('metrics').innerHTML = ['pending','claimed','done','failed'].map(function(k){
    return '<div class="metric"><div class="l">' + k + '</div><div class="n">' + counts[k] + '</div></div>';
  }).join('');
  $('agents').innerHTML = state.agents.map(function(a){
    return '<span><span class="dot' + (a.spawnable ? '' : ' off') + '"></span>' + esc(a.name) +
      ' <span style="opacity:.6">(' + esc(a.adapter) + (a.spawnable ? '' : ', polls') + ')</span></span>';
  }).join('');
  var sel = $('d-to');
  if (sel.options.length !== state.agents.length) {
    sel.innerHTML = state.agents.map(function(a){ return '<option>' + esc(a.name) + '</option>'; }).join('');
  }
  var sig = JSON.stringify(state.agents);
  if (sig !== agentsSig) {
    agentsSig = sig;
    $('agent-cfg').innerHTML = state.agents.map(function(a){
      var effort = a.adapter === 'claude'
        ? '<select data-f="effort">' + ['', 'low', 'medium', 'high', 'xhigh', 'max'].map(function(o){
            return '<option value="' + o + '"' + ((a.effort || '') === o ? ' selected' : '') + '>' + (o || 'effort') + '</option>';
          }).join('') + '</select>'
        : '';
      return '<div class="agent-row" data-name="' + esc(a.name) + '">' +
        '<div class="top"><span class="nm">' + esc(a.name) + '</span><span class="ad">' + esc(a.adapter) + '</span>' +
        '<label><input type="checkbox" data-f="spawnable"' + (a.spawnable ? ' checked' : '') + '> auto-spawn</label></div>' +
        '<div class="ctl"><input data-f="model" list="models-' + esc(a.adapter) + '" placeholder="model (adapter default)" value="' + esc(a.model || '') + '">' +
        effort + '<button class="save-agent">Save</button></div></div>';
    }).join('');
  }
  var tasks = state.tasks.slice().sort(function(a,b){ return b.createdAt.localeCompare(a.createdAt); }).slice(0,50);
  $('task-count').textContent = state.tasks.length + ' total';
  $('tasks').innerHTML = tasks.length ? tasks.map(function(t){
    var html = '<div class="task"><div class="t-row" onclick="toggle(\\'' + t.id + '\\')">' +
      '<span class="badge b-' + t.status + '">' + t.status + '</span>' +
      '<span class="t-title">' + esc(t.title) + '</span>' +
      '<span class="t-meta">' + esc(t.from) + ' → ' + esc(t.to) + ' · <span class="ago" data-iso="' + t.updatedAt + '">' + ago(t.updatedAt) + '</span></span></div>';
    if (expanded === t.id) {
      html += '<div class="t-body"><span class="lbl">prompt</span><pre>' + esc(t.prompt) + '</pre>';
      if (t.result) html += '<span class="lbl">result</span><pre>' + esc(t.result) + '</pre>';
      if (t.artifacts && t.artifacts.length) html += '<span class="lbl">artifacts</span><div class="artifacts">' +
        t.artifacts.map(function(a, i){ return '<button class="artifact" data-t="' + t.id + '" data-i="' + i + '">' + esc(a.kind) + (a.label ? ': ' + esc(a.label) : '') + '</button>'; }).join('') + '</div>';
      html += '<div class="actions"><button onclick="showLog(\\'' + t.id + '\\')">View log</button></div></div>';
    }
    return html + '</div>';
  }).join('') : '<div class="empty">No tasks yet — delegate one from the form on the right.</div>';
  var ctx = state.context.slice().sort(function(a,b){ return b.updatedAt.localeCompare(a.updatedAt); });
  $('context').innerHTML = ctx.length ? ctx.map(function(c){
    return '<div class="kv"><span class="k">' + esc(c.key) + '</span><span class="v">' + esc(JSON.stringify(c.value)) +
      '</span><span class="m">' + esc(c.updatedBy) + ' · <span class="ago" data-iso="' + c.updatedAt + '">' + ago(c.updatedAt) + '</span></span></div>';
  }).join('') : '<div class="empty">Empty blackboard.</div>';
}
function toggle(id){ expanded = (expanded === id) ? null : id; render(); }
function showLog(id){ logTask = id; $('log-card').hidden = false; $('log-task').textContent = id; loadLog();
  $('log-card').scrollIntoView({ behavior:'smooth', block:'nearest' }); }
function loadLog(){ if (!logTask) return;
  fetch('/api/logs/' + logTask).then(function(r){ return r.ok ? r.text() : 'No log file for this task (the hub did not spawn it, or nothing was written yet).'; })
    .then(function(text){ $('log').textContent = text || '(empty)'; }); }
$('log-refresh').addEventListener('click', loadLog);
$('tasks').addEventListener('click', function(e){
  var b = e.target.closest('.artifact');
  if (!b || !state) return;
  e.stopPropagation();
  var t = state.tasks.filter(function(x){ return x.id === b.getAttribute('data-t'); })[0];
  var a = t && t.artifacts ? t.artifacts[parseInt(b.getAttribute('data-i'), 10)] : null;
  if (!a) return;
  logTask = null;
  $('log-card').hidden = false;
  $('log-task').textContent = 'artifact · ' + a.kind + (a.label ? ' · ' + a.label : '');
  $('log').textContent = a.value;
  $('log-card').scrollIntoView({ behavior:'smooth', block:'nearest' });
});
$('d-form').addEventListener('submit', function(e){ e.preventDefault();
  var body = { to: $('d-to').value, prompt: $('d-prompt').value };
  if ($('d-title').value) body.title = $('d-title').value;
  fetch('/api/delegate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(){ $('d-prompt').value = ''; $('d-title').value = ''; });
});
$('ctx-form').addEventListener('submit', function(e){ e.preventDefault();
  var raw = $('ctx-value').value, value;
  try { value = JSON.parse(raw); } catch (err) { value = raw; }
  fetch('/api/context', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: $('ctx-key').value, value: value }) })
    .then(function(){ $('ctx-key').value = ''; $('ctx-value').value = ''; });
});
$('agent-cfg').addEventListener('click', function(e){
  if (!e.target.classList.contains('save-agent')) return;
  var row = e.target.closest('.agent-row');
  var body = { name: row.getAttribute('data-name') };
  row.querySelectorAll('[data-f]').forEach(function(el){
    var f = el.getAttribute('data-f');
    body[f] = f === 'spawnable' ? el.checked : el.value;
  });
  var btn = e.target;
  fetch('/api/config/agent', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      btn.textContent = d.error ? 'error' : 'Saved ✓';
      if (d.error) alert(d.error);
      setTimeout(function(){ btn.textContent = 'Save'; }, 1500);
    });
});
fetch('/api/models').then(function(r){ return r.json(); }).then(function(m){
  $('models-claude').innerHTML = (m.claude || []).map(function(x){ return '<option value="' + esc(x) + '">'; }).join('');
  $('models-antigravity').innerHTML = (m.antigravity || []).map(function(x){ return '<option value="' + esc(x) + '">'; }).join('');
});
var es = new EventSource('/api/events');
es.onopen = function(){ var c = $('conn'); c.textContent = 'live'; c.className = 'pill live'; load(); };
es.onerror = function(){ var c = $('conn'); c.textContent = 'reconnecting'; c.className = 'pill'; };
es.onmessage = function(ev){ load();
  try { var d = JSON.parse(ev.data); if (logTask && d.kind === 'task' && d.id === logTask) loadLog(); } catch (err) {} };
load();
setInterval(function(){
  document.querySelectorAll('.ago').forEach(function(el){ el.textContent = ago(el.getAttribute('data-iso')); });
}, 30000);
</script>
</body>
</html>`;
}
