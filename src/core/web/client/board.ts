/**
 * The Board view: kanban lanes, per-folder blackboard, the task drawer and the new-task modal.
 *
 * Part of the web client (see ../client.ts): a String.raw template sharing one
 * function scope with the other parts. No backticks or dollar-brace inside.
 */
export const BOARD = String.raw`
/* ================= board ================= */
function laneOf(t){
  if (t.status === 'done') return 2;
  if (t.status === 'failed' || t.status === 'cancelled') return 3;
  if (t.status === 'claimed' || t.pid) return 1;
  return 0;
}
function renderBoard(){
  var st = S.state;
  var q = S.boardFilter, who = S.boardAgent, where = S.boardFolder || '';
  var map0 = tasksById();
  var folderOf = function(t){ var r = rootOf(t, map0); return (r && r.cwd) || S.home || ''; };
  var used = {}; st.tasks.forEach(function(t){ used[folderOf(t)] = true; });
  var folderKeys = Object.keys(used);
  var fsel = $('board-folder');
  fsel.hidden = folderKeys.length < 2;
  var fsig = JSON.stringify([LANG, folderKeys, where]);
  if (fsel.getAttribute('data-sig') !== fsig) {
    fsel.setAttribute('data-sig', fsig);
    fsel.innerHTML = '<option value="">' + esc(T('allFolders')) + '</option>' + folderKeys.map(function(k){ return '<option value="' + esc(k) + '"' + (k === where ? ' selected' : '') + '>' + esc(folderName(k)) + '</option>'; }).join('');
  }
  var sig = JSON.stringify([LANG, q, who, where, S.selectedTask, st.agents.map(function(a){ return a.name; }), st.tasks.map(function(t){ return [t.id, t.status, !!t.pid, t.usage && t.usage.costUsd]; }), st.context.map(function(c){ return [c.folder, c.key, c.updatedAt]; })]);
  if (sig === S.sig.board) { updateTicks(); return; }
  S.sig.board = sig;
  $('agent-filters').innerHTML = st.agents.map(function(a){
    return '<button class="filter' + (who === a.name ? ' on' : '') + '" data-filter="' + esc(a.name) + '">' + avatar(a.name, { size:'sm', live: liveWorkForAgent(a.name).length > 0 }) + esc(dn(a.name)) + '</button>';
  }).join('');
  var tasks = st.tasks.filter(function(t){
    return (!who || t.to === who) && (!where || folderOf(t) === where) && (!q || fold(t.title + ' ' + t.prompt + ' ' + t.to + ' ' + dn(t.to)).indexOf(fold(q)) >= 0);
  }).sort(function(a, b){ return b.updatedAt.localeCompare(a.updatedAt); });
  var lanes = [[T('laneQ'), 'var(--warn)', []], [T('laneW'), 'var(--tally)', []], [T('laneD'), 'var(--ok)', []], [T('laneF'), 'var(--bad)', []]];
  tasks.forEach(function(t){ lanes[laneOf(t)][2].push(t); });
  $('lanes').innerHTML = lanes.map(function(l, li){
    var cards = l[2].slice(0, li >= 2 ? 40 : 200);
    return '<div class="lane"><div class="lane-hd"><span class="lamp" style="background:' + l[1] + (li === 1 && l[2].length ? ';box-shadow:0 0 8px ' + l[1] : '') + '"></span>' + esc(l[0]) + '<span class="n">' + l[2].length + '</span></div><div class="cards">' +
      (cards.length ? cards.map(function(t){
        var live = !isDone(t.status), u = t.usage || {};
        return '<div class="card' + (S.selectedTask === t.id ? ' sel' : '') + '" data-task="' + t.id + '"><div class="ct">' + esc(t.title) + '</div><div class="cm">' + avatar(t.to, { size:'sm', live: live && li === 1 }) +
          '<span class="route">' + esc(dn(t.from)) + ' → ' + esc(dn(t.to)) + '</span><span class="sp"></span>' +
          (folderKeys.length > 1 ? '<span class="ftag" title="' + esc(folderOf(t)) + '">' + icon('folder', 'sm') + esc(folderName(folderOf(t))) + '</span>' : '') +
          (typeof u.costUsd === 'number' && showMoney() ? '<span class="num cost" title="' + esc(costTitle()) + '">≈ ' + money(u.costUsd) + '</span>' : '') +
          (live ? '<span class="num" data-since="' + esc(t.dispatchedAt || t.createdAt) + '">' + elapsed(t.dispatchedAt || t.createdAt) + '</span>' : '<span>' + esc(ago(t.updatedAt).replace(' ' + T('ago'), '')) + '</span>') + '</div>' +
          (t.status === 'failed' && t.result ? '<div class="reason">' + esc(t.result) + '</div>' : '') + '</div>';
      }).join('') : '<div class="none">' + esc(T('none')) + '</div>') + '</div></div>';
  }).join('');
  // Each folder has its own blackboard: show the filtered folder's, or all of them labelled.
  var bbFolder = function(c){ return c.folder || S.home || ''; };
  var ctx = st.context.filter(function(c){ return !where || bbFolder(c) === where; }).sort(function(a, b){ return b.updatedAt.localeCompare(a.updatedAt); });
  $('bb-count').textContent = ctx.length;
  $('bb-scope').innerHTML = icon('folder', 'sm') + esc(where ? folderName(where) : T('allFolders'));
  $('bb-items').innerHTML = ctx.length ? ctx.map(function(c){
    return '<div class="kv" data-key="' + esc(c.key) + '" data-kfolder="' + esc(bbFolder(c)) + '"><div class="k">' + esc(c.key) + '<span class="by">' + esc(c.updatedBy) + '</span></div>' +
      (!where ? '<div class="kf">' + icon('folder', 'sm') + esc(folderName(bbFolder(c))) + '</div>' : '') +
      '<div class="v">' + esc(typeof c.value === 'string' ? c.value : JSON.stringify(c.value)) + '</div></div>';
  }).join('') : '<div class="kv" style="cursor:default"><div class="v">' + esc(T('emptyBB')) + '</div></div>';
  $('bb-form-folder').textContent = T('bbWritesTo', { f: folderName(where || S.bbTarget || S.home || '') });
}
$('agent-filters').addEventListener('click', function(e){
  var f = e.target.closest('[data-filter]'); if (!f) return;
  var n = f.getAttribute('data-filter'); S.boardAgent = S.boardAgent === n ? '' : n; renderBoard();
});
$('board-folder').addEventListener('change', function(e){ S.boardFolder = e.target.value; renderBoard(); });
$('board-search').addEventListener('input', function(e){ S.boardFilter = e.target.value.trim().toLowerCase(); renderBoard(); });
$('lanes').addEventListener('click', function(e){
  var c = e.target.closest('[data-task]'); if (!c) return;
  S.selectedTask = c.getAttribute('data-task'); S.drawerArtifact = null; openDrawer();
});
$('bb-items').addEventListener('click', function(e){
  var k = e.target.closest('[data-key]'); if (!k) return;
  var kf = k.getAttribute('data-kfolder');
  var entry = S.state.context.filter(function(c){ return c.key === k.getAttribute('data-key') && (c.folder || S.home || '') === kf; })[0];
  S.bbTarget = kf; $('bb-form-folder').textContent = T('bbWritesTo', { f: folderName(kf) });
  if (entry) { $('bb-key').value = entry.key; $('bb-value').value = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2); $('bb-value').focus(); }
});
$('bb-form').addEventListener('submit', function(e){
  e.preventDefault();
  var raw = $('bb-value').value, value;
  try { value = JSON.parse(raw); } catch (err) { value = raw; }
  post('/api/context', { key: $('bb-key').value, value: value, by: 'human', folder: S.boardFolder || S.bbTarget || S.home }).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    $('bb-key').value = ''; $('bb-value').value = ''; toast(T('saved').split(' · ')[0]); soon();
  });
});
$('bb-toggle').addEventListener('click', function(){
  var body = $('board-body'); body.classList.toggle('no-bb'); store('ekip.bb', body.classList.contains('no-bb') ? 'hidden' : null);
});
if (store('ekip.bb') === 'hidden') $('board-body').classList.add('no-bb');

/* ================= drawer ================= */
function openDrawer(){ renderDrawer(); $('scrim').classList.add('on'); $('drawer').classList.add('on'); }
function closeDrawer(){ S.selectedTask = null; $('scrim').classList.remove('on'); $('drawer').classList.remove('on'); S.sig.board = ''; if (S.view === 'board') renderBoard(); }
function renderDrawer(){
  var map = tasksById(), t = map[S.selectedTask];
  if (!t && S.thread) t = S.thread.tasks.filter(function(x){ return x.id === S.selectedTask; })[0];
  if (!t) return;
  var u = t.usage || {}, live = !isDone(t.status);
  var state = live ? (t.status === 'claimed' || t.pid ? 'working' : 'queued') : t.status;
  $('d-head').innerHTML = avatar(t.to, { size:'lg', live: state === 'working' }) + '<div style="min-width:0;flex:1"><div class="ttl">' + esc(t.title) + '</div><div class="sub"><span class="pill ' + state + '">' + esc(T(state)) + '</span>' +
    '<span>' + esc(dn(t.from)) + ' → ' + esc(dn(t.to)) + '</span><span class="mono">' + shortId(t.id) + '</span></div></div>' +
    '<button class="btn ghost icon" data-close="1" title="' + esc(T('closeK')) + '">' + icon('x') + '</button>';
  var html = '';
  if (S.drawerArtifact != null && t.artifacts && t.artifacts[S.drawerArtifact]) {
    var a = t.artifacts[S.drawerArtifact];
    html += '<div class="dl">' + esc(T('artifacts')) + ' · ' + esc(a.kind) + (a.label ? ' · ' + esc(a.label) : '') + '</div><div class="dbox mono" style="max-height:60vh">' + esc(a.value) + '</div>';
  }
  html += '<div class="dl">' + esc(T('details')) + '</div><div class="facts-grid">' +
    '<div class="fact"><div class="l">' + esc(T('duration')) + '</div><div class="v">' + (live ? '<span data-since="' + esc(t.dispatchedAt || t.createdAt) + '">' + elapsed(t.dispatchedAt || t.createdAt) + '</span>' : u.durationMs ? dur(u.durationMs) : elapsed(t.createdAt, t.updatedAt)) + '</div></div>' +
    (showMoney()
      ? '<div class="fact" title="' + esc(costTitle()) + '"><div class="l">' + esc(T('cost')) + '</div><div class="v">' + (typeof u.costUsd === 'number' ? '≈ ' + money(u.costUsd) : '<span class="nodata">' + esc(T('noData')) + '</span>') + '</div></div>'
      : '<div class="fact"><div class="l">' + esc(T('turnsL')) + '</div><div class="v">' + (u.turns || '—') + '</div></div>') +
    '<div class="fact"><div class="l">' + esc(T('modelUsed')) + '</div><div class="v" title="' + esc(u.model || '') + '">' + esc(shortModel(u.model) || (agentByName(t.to) || {}).model || '—') + '</div></div>' +
    '<div class="fact"><div class="l">' + esc(T('tokOutL')) + '</div><div class="v">' + (u.outputTokens ? toks(u.outputTokens) : '—') + '</div></div>' +
    '<div class="fact wide"><div class="l">' + esc(T('folder')) + '</div><div class="v mono" title="' + esc((rootOf(t, map) || t).cwd || S.home || '') + '">' + esc(shortPath((rootOf(t, map) || t).cwd || S.home || '')) + '</div></div></div>' +
    (u.inputTokens && u.cacheReadTokens !== undefined ? '<div class="tokbar" title="' + esc(T('tokBarTitle')) + '">' + tokenBar(u) + '</div>' : '') +
    (isDone(t.status) && showMoney() ? '<p class="costnote">' + icon('alert', 'sm') + '<span>' + esc(typeof u.costUsd === 'number' ? costTitle() : awaitingTally(t.id) ? T('awaitingTitle') : T('missingTitle')) + '</span></p>' : '');
  html += '<div class="dl">' + esc(T('prompt')) + '</div><div class="dbox">' + md(t.prompt) + '</div>';
  if (t.result) html += '<div class="dl">' + esc(T('result')) + '</div><div class="dbox">' + md(t.result) + '</div>';
  if (t.artifacts && t.artifacts.length && S.drawerArtifact == null) html += '<div class="dl">' + esc(T('artifacts')) + '</div><div class="receipts" style="padding:0">' + t.artifacts.map(function(a, ai){
    return '<button class="receipt" data-art="' + t.id + ':' + ai + '">' + icon(a.kind === 'file' ? 'file' : 'note', 'sm') + '<span class="k">' + esc(a.kind) + '</span>' + esc(a.label || base(a.value)) + '</button>';
  }).join('') + '</div>';
  html += '<div id="d-log"></div>';
  $('d-body').innerHTML = html;
  $('d-foot').innerHTML = '<button class="btn primary sm" data-open-root="' + t.id + '">' + icon('chat', 'sm') + esc(T('openChat')) + '</button>' +
    '<button class="btn quiet sm" data-log="' + t.id + '">' + icon('log', 'sm') + esc(T('viewLog')) + '</button>' +
    '<button class="btn quiet sm" data-copy-id="' + t.id + '">' + icon('copy', 'sm') + esc(T('copyId')) + '</button>' +
    (live ? '<button class="btn danger sm" data-stop="' + t.id + '" style="margin-left:auto">' + icon('stop', 'sm') + esc(T('stop')) + '</button>' : '') +
    '<button class="btn danger sm" data-del-task="' + t.id + '"' + (live ? '' : ' style="margin-left:auto"') + '>' + icon('trash', 'sm') + esc(T('deleteChat')) + '</button>';
}
$('drawer').addEventListener('click', function(e){
  if (e.target.closest('[data-close]')) { closeDrawer(); return; }
  var o = e.target.closest('[data-open-root]');
  if (o) { var map = tasksById(), t = map[o.getAttribute('data-open-root')]; closeDrawer(); if (t) go('/chat/' + rootOf(t, map).id); return; }
  var l = e.target.closest('[data-log]');
  if (l) { fetch('/api/logs/' + l.getAttribute('data-log')).then(function(r){ return r.ok ? r.text() : '(no log)'; }).then(function(txt){ $('d-log').innerHTML = '<div class="dl">log</div><div class="dbox mono" style="max-height:48vh">' + esc(txt.slice(-20000)) + '</div>'; }); return; }
  var dt = e.target.closest('[data-del-task]');
  if (dt) { deleteThread(dt.getAttribute('data-del-task')); return; }
  var c = e.target.closest('[data-copy-id]');
  if (c) { copyText(c.getAttribute('data-copy-id')); }
});
$('scrim').addEventListener('click', function(){ closeDrawer(); closeModal(); closePalette(); closeBrowse(); });

/* ================= new task modal ================= */
function openModal(){
  $('m-to').innerHTML = S.state.agents.map(function(a){ return '<option value="' + esc(a.name) + '">' + esc(dn(a.name)) + (dn(a.name) !== a.name ? ' (@' + esc(a.name) + ')' : '') + '</option>'; }).join('');
  $('m-to').value = S.boardAgent || defaultTarget();
  $('scrim').classList.add('on'); $('modal').classList.add('on'); setTimeout(function(){ $('m-prompt').focus(); }, 40);
}
function closeModal(){ $('modal').classList.remove('on'); if (!$('drawer').classList.contains('on') && !$('palette').classList.contains('on')) $('scrim').classList.remove('on'); }
$('new-task').addEventListener('click', openModal);
$('m-cancel').addEventListener('click', closeModal);
$('m-form').addEventListener('submit', function(e){
  e.preventDefault();
  var body = { to: $('m-to').value, prompt: $('m-prompt').value, from: 'human' };
  if ($('m-title').value) body.title = $('m-title').value;
  post('/api/delegate', body).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    $('m-prompt').value = ''; $('m-title').value = ''; closeModal(); toast(T('delegated', { a: body.to })); soon();
  });
});
$('m-prompt').addEventListener('keydown', function(e){ if (isEnter(e) && (e.metaKey || e.ctrlKey)) $('m-form').requestSubmit(); });

`;
