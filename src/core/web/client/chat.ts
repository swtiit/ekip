/**
 * The Chat view: conversations grouped by folder, the transcript, the folder picker and browser, the composer with @mentions, and the Crew panel.
 *
 * Part of the web client (see ../client.ts): a String.raw template sharing one
 * function scope with the other parts. No backticks or dollar-brace inside.
 */
export const CHAT = String.raw`
/* ================= chat: sidebar ================= */
function folderName(path){ var f = S.folders.filter(function(x){ return x.path === path; })[0]; return f ? f.name : base(path); }
function shortPath(path){
  var home = (S.state && S.state.home) || '';
  var p = String(path || '');
  var m = /^\/(Users|home)\/[^\/]+/.exec(p);
  return m ? '~' + p.slice(m[0].length) : p;
}
function renderSide(){
  var q = fold(S.filter);
  var list = S.threads.filter(function(t){ return !q || fold(t.title + ' ' + t.to + ' ' + dn(t.to) + ' ' + base(t.cwd)).indexOf(q) >= 0; });
  var sig = JSON.stringify([S.current, q, LANG, S.collapsed, S.expandedFolders, S.folder, list.map(function(t){ return [t.id, t.status, t.messages, t.lastAt.slice(0, 16), t.cwd]; })]);
  if (sig === S.sig.side) return;
  S.sig.side = sig;
  var groups = {}, order = [];
  list.forEach(function(t){
    var k = t.cwd || S.home || '';
    if (!groups[k]) { groups[k] = { path: k, items: [], live: 0, lastAt: '' }; order.push(k); }
    var g = groups[k];
    g.items.push(t);
    if (!isDone(t.status)) g.live++;
    if (t.lastAt > g.lastAt) g.lastAt = t.lastAt;
  });
  // The folder you are about to start in shows up even before it has a conversation.
  if (!q && S.folder && !groups[S.folder]) { groups[S.folder] = { path: S.folder, items: [], live: 0, lastAt: '' }; order.push(S.folder); }
  order.sort(function(a, b){ return (groups[b].live - groups[a].live) || groups[b].lastAt.localeCompare(groups[a].lastAt); });
  var html = order.map(function(k){
    var g = groups[k];
    var open = !S.collapsed[k] || !!q;
    g.items.sort(function(a, b){ return (isDone(a.status) - isDone(b.status)) || b.lastAt.localeCompare(a.lastAt); });
    var selIdx = g.items.findIndex(function(t){ return t.id === S.current; });
    if (selIdx >= SIDEBAR_LIMIT && !S.expandedFolders[k]) { var sel = g.items.splice(selIdx, 1)[0]; g.items.splice(SIDEBAR_LIMIT - 1, 0, sel); }
    return '<div class="fgroup' + (open ? ' open' : '') + '"><div class="fhead" data-toggle-folder="' + esc(k) + '" title="' + esc(k) + '">' +
      icon('chev', 'sm chev') + icon('folder', 'sm') + '<span class="fname">' + esc(folderName(k)) + '</span>' +
      (g.live ? '<span class="flive">' + g.live + '</span>' : '<span class="fcount">' + g.items.length + '</span>') +
      '<button class="btn ghost sm icon fadd" data-new-in="' + esc(k) + '" title="' + esc(T('newIn')) + '">' + icon('plus', 'sm') + '</button></div>' +
      '<div class="fitems">' + (g.items.length ? g.items.slice(0, (S.expandedFolders[k] || q) ? g.items.length : SIDEBAR_LIMIT).map(function(t){
        var st = isDone(t.status) ? (t.status === 'done' ? '' : '<span class="state ' + t.status + '">' + esc(T(t.status)) + ' ·</span>') : '<span class="state working">' + esc(T('working')) + ' ·</span>';
        return '<div class="th' + (t.id === S.current ? ' sel' : '') + '" data-id="' + t.id + '">' +
          avatar(t.to, { live: !isDone(t.status) }) +
          '<div class="body"><div class="t">' + esc(t.title) + '</div><div class="m">' + st + '<span>' + esc(dn(t.to)) + '</span></div></div>' +
          '<span class="when">' + esc(ago(t.lastAt).replace(' ' + T('ago'), '')) + '</span>' +
          '<button class="btn ghost sm icon th-del" data-del="' + t.id + '" title="' + esc(T('deleteChat')) + '">' + icon('trash', 'sm') + '</button></div>';
      }).join('') + (!q && g.items.length > SIDEBAR_LIMIT
        ? '<button class="more" data-more="' + esc(k) + '">' + (S.expandedFolders[k] ? icon('chev', 'sm up') + esc(T('showLess')) : icon('down', 'sm') + esc(T('showMore', { n: g.items.length - SIDEBAR_LIMIT }))) + '</button>'
        : '') : '<div class="fempty">' + esc(T('noChatsHere')) + '</div>') + '</div></div>';
  }).join('');
  $('threads').innerHTML = html || '<div class="group-label" style="text-transform:none;letter-spacing:0">' + esc(q ? T('noResults') : T('none')) + '</div>';
}
$('threads').addEventListener('click', function(e){
  var del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); deleteThread(del.getAttribute('data-del')); return; }
  var more = e.target.closest('[data-more]');
  if (more) { var mk = more.getAttribute('data-more'); S.expandedFolders[mk] = !S.expandedFolders[mk]; S.sig.side = ''; renderSide(); return; }
  var add = e.target.closest('[data-new-in]');
  if (add) { e.stopPropagation(); setFolder(add.getAttribute('data-new-in')); go('/chat'); setTimeout(function(){ $('text').focus(); }, 40); return; }
  var tog = e.target.closest('[data-toggle-folder]');
  if (tog) { var k = tog.getAttribute('data-toggle-folder'); S.collapsed[k] = !S.collapsed[k]; store('ekip.collapsed', JSON.stringify(S.collapsed)); S.sig.side = ''; renderSide(); return; }
  var el = e.target.closest('.th'); if (!el) return;
  go('/chat/' + el.getAttribute('data-id'));
});
$('filter').addEventListener('input', function(e){ S.filter = e.target.value.trim().toLowerCase(); renderSide(); });
try { S.collapsed = JSON.parse(store('ekip.collapsed') || '{}') || {}; } catch (err) { S.collapsed = {}; }
$('new-chat').addEventListener('click', function(){ go('/chat'); setTimeout(function(){ $('text').focus(); }, 30); });

/* ================= chat: stage ================= */
function describeTool(name, input){
  var n = String(name || 'tool').replace('mcp__ekip__', '');
  var a = (input && typeof input === 'object') ? input : {};
  var c = function(v){ return '<code>' + esc(v) + '</code>'; };
  var r = { icon:'tool', quiet:false, label:'', plain:'' };
  function set(ic, key, vars, quiet){ r.icon = ic; r.quiet = !!quiet; r.label = T(key, vars); r.plain = r.label.replace(/<[^>]+>/g, ''); }
  if (n === 'bridge_claim') set('check', 't_claim', null, true);
  else if (n === 'bridge_post_result') set('send', 't_post', null, true);
  else if (n === 'bridge_say') set('note', 't_say', null, true);
  else if (n === 'bridge_delegate') set('handoff', 't_hand', { t: '<b>' + esc(a.title || '') + '</b>', a: '<b>' + esc(a.to ? dn(a.to) : '') + '</b>' });
  else if (n === 'bridge_wait') set('clock', 't_wait', { id: c(shortId(a.task_id)) }, true);
  else if (n === 'bridge_thread') set('chat', 't_thread', null, true);
  else if (n === 'bridge_context_set') set('blackboard', 't_cset', { k: c(a.key || '') });
  else if (n === 'bridge_context_get') set('blackboard', 't_cget', { k: a.key ? c(a.key) : T('blackboardW') }, true);
  else if (n === 'bridge_cancel') set('stop', 't_cancel', { id: c(shortId(a.task_id)) });
  else if (n === 'bridge_list_tasks' || n === 'bridge_task_get') set('board', 't_tasks', null, true);
  else if (/^(Write|write_file|create_file)$/.test(n)) set('pencil', 't_write', { f: c(base(a.file_path || a.path || a.absolute_path || '')) });
  else if (/^(Edit|MultiEdit|edit_file|replace)$/.test(n)) set('pencil', 't_edit', { f: c(base(a.file_path || a.path || '')) });
  else if (/^(Read|read_file|view_file)$/.test(n)) set('eye', 't_read', { f: c(base(a.file_path || a.path || '')) }, true);
  else if (/^(Bash|run_command|command|shell)$/.test(n)) set('terminal', 't_run', { c: c(String(a.command || '').slice(0, 110)) });
  else if (/^(Grep|Glob|search|find_files)$/.test(n)) set('search', 't_search', { q: c(a.pattern || a.query || '') }, true);
  else if (n === 'ToolSearch') set('tool', 't_tools', null, true);
  else if (n === 'TodoWrite') set('log', 't_todo', null, true);
  else {
    var hint = a.command || a.file_path || a.path || a.key || a.query || a.pattern || '';
    r.label = '<b>' + esc(n) + '</b>' + (hint ? ' ' + c(String(hint).slice(0, 80)) : '');
    r.plain = n;
  }
  return r;
}
function samey(a, b){
  if (!a || !b) return false;
  var norm = function(s){ return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
  var x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true;
  var xs = x.split(' '), ys = new Set(y.split(' ')), hit = 0;
  xs.forEach(function(w){ if (w.length > 2 && ys.has(w)) hit++; });
  return xs.length > 4 && hit / xs.length > 0.6;
}

function renderStage(){
  var th = S.thread;
  paintFolderChip();
  var sig = JSON.stringify([S.current, S.notFound, LANG, S.folder, S.folders.length, th ? [th.messages.length, th.tasks.map(function(t){ return [t.status, t.usage && t.usage.costUsd, !!t.pid, awaitingTally(t.id)]; })] : null, S.state.agents.length, !!S.billing && S.billing.claude, showMoney()]);
  var top = $('stage-top'), log = $('transcript');
  if (sig === S.sig.stage) { updateTicks(); return; }
  S.sig.stage = sig;

  if (S.notFound || !th) {
    $('jump').hidden = true;
    top.innerHTML = '<span class="title">' + esc(S.notFound ? T('nfT') : T('newChat')) + '</span><span class="sp"></span>' + crewToggle();
    $('dock-hint').textContent = T('hintEnter');
    if (S.notFound) {
      log.innerHTML = '<div class="hello"><h1>' + esc(T('nfT')) + '</h1><p>' + esc(T('nfS')) + '</p></div>';
    } else {
      var spawnable = S.state.agents.filter(function(a){ return a.spawnable; });
      log.innerHTML = '<div class="hello"><div class="crew-row">' + spawnable.slice(0, 6).map(function(a){ return avatar(a.name, { size:'lg' }); }).join('') + '</div>' +
        '<h1>' + esc(T('helloT')) + '</h1><p>' + esc(T('helloS')) + ' <a href="/guide" data-go-guide="1">' + esc(T('guideLink')) + ' →</a></p>' +
        (currentFolder() ? '<button class="where" id="hello-folder" title="' + esc(currentFolder()) + '">' + icon('folder', 'sm') + '<span>' + esc(T('workingIn')) + '</span><b>' + esc(folderName(currentFolder())) + '</b><span class="path">' + esc(shortPath(currentFolder())) + '</span>' + icon('down', 'sm') + '</button>' : '') +
        '<div class="starters">' +
        [['s1', 'pencil'], ['s2', 'eye'], ['s3', 'sparkle'], ['s4', 'handoff']].map(function(s){
          return '<div class="starter" data-starter="' + s[0] + '"><div class="k">' + icon(s[1], 'sm') + esc(T(s[0] + 'k')) + '</div><div class="v">' + esc(T(s[0] + 'v')) + '</div></div>';
        }).join('') + '</div></div>';
    }
    if (!S.target) setTarget(defaultTarget());
    return;
  }

  var map = {}, kids = {};
  th.tasks.forEach(function(t){ map[t.id] = t; });
  th.tasks.forEach(function(t){ if (t.parentId && map[t.parentId]) (kids[t.parentId] = kids[t.parentId] || []).push(t); });
  var root = map[th.thread] || th.tasks[0];
  var live = th.tasks.filter(function(t){ return !isDone(t.status); });
  var cost = 0, tk = 0, missing = 0, runs = 0;
  th.tasks.forEach(function(t){
    if (t.dispatchedAt) runs++;
    if (t.usage && typeof t.usage.costUsd === 'number') { cost += t.usage.costUsd; tk += outTok(t.usage); }
    else if (t.dispatchedAt && isDone(t.status) && !awaitingTally(t.id)) missing++;
  });
  top.innerHTML = '<span class="title">' + esc(root.title) + '</span>' +
    '<span class="chip folder-tag" title="' + esc(root.cwd || S.home || '') + '">' + icon('folder', 'sm') + esc(folderName(root.cwd || S.home || '')) + '</span>' +
    '<span class="facts">' + (live.length ? '<span class="pill working">' + esc(live.length === 1 ? dn(live[0].to) + ' ' + T('working') : T('nWorking', { n: live.length })) + '</span>' : '<span class="pill ' + root.status + '">' + esc(T(root.status)) + '</span>') +
    '<span class="num">' + esc(T('runsN', { n: runs })) + '</span>' + budgetPill(th.budgets) + (tk ? '<span class="dotsep">·</span><span class="num" title="' + esc(T('outTokTitle')) + '">' + toks(tk) + ' ' + esc(T('tokOut')) + '</span>' : '') +
    (cost && showMoney() ? '<span class="dotsep">·</span><span class="num cost" title="' + esc(costTitle()) + '">≈ ' + money(cost) + '</span>' : '') +
    (missing ? '<span class="dotsep">·</span><span class="num nodata" title="' + esc(T('missingTitle')) + '">' + esc(T('missingN', { n: missing })) + '</span>' : '') + '</span><span class="sp"></span>' +
    (live.length ? '<button class="btn danger sm" data-stop="' + root.id + '">' + icon('stop', 'sm') + esc(T('stop')) + '</button>' : '') +
    '<button class="btn ghost sm icon" data-del-current="' + root.id + '" title="' + esc(T('deleteChat')) + '">' + icon('trash', 'sm') + '</button>' + crewToggle();
  $('dock-hint').textContent = T('hintReply');

  var byTask = {};
  th.messages.forEach(function(m){ (byTask[m.taskId] = byTask[m.taskId] || []).push(m); });

  function turn(t, depth){
    var msgs = byTask[t.id] || [];
    var out = '';
    msgs.forEach(function(m){
      if (m.kind !== 'human') return;
      out += '<div class="you-row"><div class="you"><div class="to">' + esc(T('to')) + ' ' + avatar(m.to || t.to, { size:'sm' }) + '<b>' + esc(dn(m.to || t.to)) + '</b> · ' + clock(m.at) + '</div><div class="text">' + md(m.text) + '</div></div></div>';
    });
    var liveT = !isDone(t.status);
    var u = t.usage || {};
    var metaBits = [];
    if (u.model) metaBits.push('<span class="chip" title="' + esc(u.model) + '">' + esc(shortModel(u.model)) + '</span>');
    var meta = '';
    if (liveT) meta += '<span data-since="' + esc(t.dispatchedAt || t.createdAt) + '">' + elapsed(t.dispatchedAt || t.createdAt) + '</span>';
    else if (u.durationMs) meta += '<span>' + dur(u.durationMs) + '</span>';
    else meta += '<span>' + elapsed(t.createdAt, t.updatedAt) + '</span>';
    if (typeof u.costUsd === 'number') { if (showMoney()) meta += '<span class="cost" title="' + esc(costTitle()) + '">≈ ' + money(u.costUsd) + '</span>'; }
    else if (!liveT && t.status === 'done' && showMoney()) meta += awaitingTally(t.id)
      ? '<span class="nodata" title="' + esc(T('awaitingTitle')) + '">' + esc(T('awaiting')) + '</span>'
      : '<span class="nodata" title="' + esc(T('missingTitle')) + '">' + esc(T('noData')) + '</span>';
    meta += '<span>' + clock(t.createdAt) + '</span>';

    var body = '';
    var group = [];
    var pending = (kids[t.id] || []).slice();
    var reported = false;
    function flush(forceOpen){
      if (!group.length) return;
      var key = group[0].id;
      var described = group.map(function(m){ return { m: m, d: describeTool(m.meta && m.meta.tool, m.meta && m.meta.input) }; });
      var loud = described.filter(function(x){ return !x.d.quiet; });
      var labels = (loud.length ? loud : described).slice(-2).map(function(x){ return x.d.label; }).join(' <span style="color:var(--faint)">·</span> ');
      if (!loud.length && !forceOpen) {
        body += '<div class="trail">' + described.map(function(x){ return '<span class="t" title="' + esc(x.d.plain) + '">' + icon(x.d.icon, 'sm') + x.d.label + '</span>'; }).join('') + '</div>';
        group = [];
        return;
      }
      var isOpen = S.openGroups[key] !== undefined ? S.openGroups[key] : !!forceOpen;
      body += '<div class="activity' + (isOpen ? ' open' : '') + '" data-group="' + key + '"><button class="sum">' + icon('chev', 'sm chev') +
        '<b class="num">' + group.length + ' ' + esc(group.length === 1 ? T('step') : T('steps')) + '</b><span class="labels">' + labels + '</span></button><div class="steps">' +
        described.map(function(x, i){
          var now = forceOpen && i === described.length - 1;
          return '<div class="step' + (x.d.quiet ? ' quiet' : '') + (now ? ' now' : '') + (S.openSteps[x.m.id] ? ' open' : '') + '" data-step="' + x.m.id + '">' + icon(x.d.icon, 'sm') +
            '<span class="lbl' + (now ? ' shimmer' : '') + '">' + x.d.label + '</span></div><div class="step-json">' + esc(JSON.stringify(x.m.meta && x.m.meta.input, null, 2)) + '</div>';
        }).join('') + '</div></div>';
      group = [];
    }
    function placeChild(title){
      var i = title ? pending.findIndex(function(k){ return k.title === title; }) : -1;
      if (i < 0) i = 0;
      var k = pending.splice(i, 1)[0];
      if (!k) return '';
      return '<div class="handoff">' + avatar(t.to, { size:'sm' }) + '<span class="baton">' + icon('handoff', 'sm') + '</span>' + avatar(k.to, { size:'sm' }) +
        '<span><b>' + esc(dn(t.to)) + '</b> ' + esc(T('hands')) + ' <b>' + esc(dn(k.to)) + '</b></span></div>' +
        '<div class="nested">' + turn(k, depth + 1) + '</div>';
    }

    var byTime = String(t.to).indexOf('flow:') === 0;
    msgs.forEach(function(m, idx){
      if (byTime) {
        while (pending.length && pending[0].createdAt <= m.at && m.kind !== 'human') {
          flush(false);
          body += placeChild(pending[0].title);
        }
      }
      if (m.kind === 'human') return;
      if (m.kind === 'tool') {
        var toolName = String((m.meta && m.meta.tool) || '');
        group.push(m);
        if (toolName.indexOf('bridge_delegate') >= 0) { flush(false); body += placeChild(m.meta.input && m.meta.input.title); }
        return;
      }
      flush(false);
      if (m.kind === 'system') {
        if (/^\S+ started: /.test(m.text)) return;
        if (m.meta && m.meta.gate) {
          var g = m.meta.gate, gi = g === 'pass' ? 'check' : g === 'retry' ? 'refresh' : 'stop';
          var gd = m.meta.detail;
          var gt = g === 'pass' ? T('gatePass', { s: m.meta.stepTitle, d: gd })
            : g === 'retry' ? T('gateRetry', { s: m.meta.stepTitle, d: gd, g: m.meta.goto, r: m.meta.round, n: m.meta.max })
            : T('gateStop', { s: m.meta.stepTitle, d: gd });
          body += '<div class="notice gate ' + g + '">' + icon(gi, 'sm') + '<span>' + esc(gt) + '</span></div>';
          return;
        }
        if (m.meta && m.meta.budget) {
          body += '<div class="notice bad budget">' + icon('alert', 'sm') + '<span>' + esc(String(m.text).replace(/^(dispatch refused|không chạy được): /, '')) + '</span></div>';
          return;
        }
        if (m.meta && m.meta.flow && m.meta.steps) {
          body += '<div class="flowmap">' + m.meta.steps.map(function(st, i){ return '<span class="fs">' + avatar(st.agent, { size:'sm' }) + esc(st.title || st.id) + '</span>' + (i < m.meta.steps.length - 1 ? icon('chev', 'sm') : ''); }).join('') + '</div>';
          return;
        }
        var mm = m.meta || {};
        var bad = !!(mm.refused || mm.workerExit || mm.cancelled || mm.hubStopped || mm.hubRestarted) || /fail|refused|exited|error|cancel|blocked/i.test(m.text);
        if (m.meta && m.meta.guard) {
          body += '<div class="notice guard">' + icon('alert', 'sm') + '<span>' + esc(T('guardBlocked')) + ' <code>' + esc(shortPath(m.meta.path)) + '</code></span></div>';
          return;
        }
        body += '<div class="notice' + (bad ? ' bad' : (mm.queued || /queued/i.test(m.text)) ? ' warn' : '') + '">' + icon(bad ? 'alert' : 'clock', 'sm') + '<span>' + esc(m.text) + '</span></div>';
        return;
      }
      if (m.meta && m.meta.delegation) {
        body += '<details class="brief"><summary>' + icon('note', 'sm') + esc(T('brief')) + ' <b>' + esc(dn(m.from)) + '</b></summary><div class="text">' + md(m.text) + '</div></details>';
        return;
      }
      if (m.meta && m.meta.result) {
        reported = true;
        var failed = m.meta.result === 'failed';
        body += '<div class="outcome' + (failed ? ' failed' : '') + '"><div class="oh">' + icon(failed ? 'x' : 'check', 'sm') + esc(failed ? T('failedT') : T('result')) +
          '<span class="sp"></span><button class="btn ghost sm icon" data-copy="' + esc(m.id) + '" title="copy">' + icon('copy', 'sm') + '</button></div><div class="ob" data-text="' + esc(m.id) + '">' + md(m.text) + '</div>' +
          (t.artifacts && t.artifacts.length ? '<div class="receipts">' + t.artifacts.map(function(a, ai){
            return '<button class="receipt" data-art="' + t.id + ':' + ai + '">' + icon(a.kind === 'file' ? 'file' : a.kind === 'log' ? 'log' : a.kind === 'url' ? 'open' : 'note', 'sm') +
              '<span class="k">' + esc(a.kind) + '</span>' + esc(a.label || base(a.value)) + '</button>';
          }).join('') + '</div>' : '') + '</div>';
        return;
      }
      if (idx >= msgs.length - 2 && samey(m.text, t.result)) return;
      body += '<div class="prose' + (reported ? ' after' : '') + '">' + md(m.text) + '</div>';
    });
    flush(liveT);
    while (pending.length) body += placeChild(pending[0].title);
    if (liveT) {
      var what = t.status === 'claimed' ? T('isWorking') : t.pid ? T('starting') : t.dispatchedAt ? T('lost') : T('waitingSlot');
      body += '<div class="working-row">' + avatar(t.to, { size:'sm', live:true }) + '<span class="shimmer"><b>' + esc(dn(t.to)) + '</b> ' + esc(what) + '…</span>' +
        '<span class="since" data-since="' + esc(t.dispatchedAt || t.createdAt) + '">' + elapsed(t.dispatchedAt || t.createdAt) + '</span></div>';
    }

    return out + '<div class="turn"><div class="gutter">' + avatar(t.to, { live: liveT }) + '<div class="rail"></div></div><div>' +
      '<div class="turn-hd"><span class="name" style="color:hsl(' + hashHue(t.to) + ' 55% 45%)">' + esc(dn(t.to)) + '</span>' + (dn(t.to) !== t.to ? '<span class="handle">@' + esc(t.to) + '</span>' : '') + metaBits.join('') +
      (depth > 0 || t.status !== 'done' ? '<span class="pill ' + (liveT ? (t.status === 'claimed' || t.pid ? 'working' : 'queued') : t.status) + '">' + esc(T(liveT ? (t.status === 'claimed' || t.pid ? 'working' : 'queued') : t.status)) + '</span>' : '') +
      '<span class="meta">' + meta + (liveT ? '<button class="btn ghost sm stop live" data-stop="' + t.id + '" title="' + esc(T('stop')) + '">' + icon('stop', 'sm') + '</button>' : '') + '</span></div>' +
      '<div class="turn-body">' + body + '</div></div></div>';
  }

  var sc = $('scroller');
  var opened = S.renderedThread !== S.current;
  var stick = opened || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 80;
  log.innerHTML = turn(root, 0);
  S.renderedThread = S.current;
  if (stick) sc.scrollTop = sc.scrollHeight;
  $('jump').hidden = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 200;
  if (!S.target) setTarget(root.to);
}
function crewToggle(){ return '<button class="btn ghost sm icon" id="crew-toggle" title="' + esc(T('toggleCrew')) + '">' + icon('panel', 'sm') + '</button>'; }
function updateTicks(){
  document.querySelectorAll('[data-since]').forEach(function(el){ el.textContent = elapsed(el.getAttribute('data-since')); });
}
setInterval(updateTicks, 1000);

$('scroller').addEventListener('scroll', function(){
  var sc = $('scroller');
  $('jump').hidden = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 200;
});
$('jump').addEventListener('click', function(){ var sc = $('scroller'); sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); });
document.addEventListener('click', function(e){
  var g = e.target.closest('.activity > .sum');
  if (g) { var box = g.parentNode, k = box.getAttribute('data-group'); box.classList.toggle('open'); S.openGroups[k] = box.classList.contains('open'); return; }
  var st = e.target.closest('[data-step]');
  if (st) { var id = st.getAttribute('data-step'); st.classList.toggle('open'); S.openSteps[id] = st.classList.contains('open'); return; }
  var dc = e.target.closest('[data-del-current]');
  if (dc) { deleteThread(dc.getAttribute('data-del-current')); return; }
  var stop = e.target.closest('[data-stop]');
  if (stop) { stopTask(stop.getAttribute('data-stop')); return; }
  var cp = e.target.closest('[data-copy]');
  if (cp) { var node = document.querySelector('[data-text="' + cp.getAttribute('data-copy') + '"]'); copyText(node ? node.innerText : ''); return; }
  var art = e.target.closest('[data-art]');
  if (art) { var parts = art.getAttribute('data-art').split(':'); openArtifact(parts[0], +parts[1]); return; }
  if (e.target.closest('#hello-folder')) { e.stopPropagation(); hidePopover(); showFolderPopover(); return; }
  var gl = e.target.closest('[data-go-guide]');
  if (gl) { e.preventDefault(); go('/guide'); return; }
  var starter = e.target.closest('[data-starter]');
  if (starter) { var ta = $('text'); ta.value = T(starter.getAttribute('data-starter') + 'v'); autosize(); ta.focus(); return; }
  if (e.target.closest('#crew-toggle')) { toggleCrew(); return; }
});
/* In-app dialog in place of the browser's confirm()/prompt(): same look as the
   rest of the app, keyboard-friendly (Enter confirms, Esc cancels), and it
   can say what is at stake. Resolves true/false, or the typed text / null. */
var dlg = null;
function dialog(opts){
  return new Promise(function(resolve){
    if (dlg) dlg.finish(opts.input ? null : false);
    var box = $('dialog'), input = $('dlg-input');
    $('dlg-title').textContent = opts.title || '';
    $('dlg-msg').innerHTML = opts.html || esc(opts.message || '');
    $('dlg-icon').innerHTML = icon(opts.danger ? 'trash' : opts.icon || (opts.input ? 'pencil' : 'alert'));
    $('dlg-icon').className = 'dlg-icon' + (opts.danger ? ' danger' : '');
    $('dlg-ok').textContent = opts.ok || T('ok');
    $('dlg-ok').className = 'btn ' + (opts.danger ? 'danger-solid' : 'primary');
    $('dlg-cancel').textContent = opts.cancel || T('cancel');
    input.hidden = !opts.input;
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    var prevFocus = document.activeElement;
    var finish = function(result){
      if (!dlg) return;
      dlg = null;
      box.classList.remove('on');
      if (!$('drawer').classList.contains('on') && !$('palette').classList.contains('on') && !$('modal').classList.contains('on') && !$('browse').classList.contains('on')) $('scrim').classList.remove('on');
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
      resolve(result);
    };
    var onKey = function(e){
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(opts.input ? null : false); }
      else if (isEnter(e) && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); finish(opts.input ? (input.value.trim() || null) : true); }
    };
    dlg = { finish: finish };
    $('dlg-ok').onclick = function(){ finish(opts.input ? (input.value.trim() || null) : true); };
    $('dlg-cancel').onclick = function(){ finish(opts.input ? null : false); };
    document.addEventListener('keydown', onKey, true);
    $('scrim').classList.add('on'); box.classList.add('on');
    setTimeout(function(){ (opts.input ? input : (opts.danger ? $('dlg-cancel') : $('dlg-ok'))).focus(); }, 30);
  });
}
function deleteThread(id){
  var map = tasksById(), t = map[id];
  var th = S.threads.filter(function(x){ return x.id === id; })[0];
  var root = t ? rootOf(t, map) : null;
  var rootId = root ? root.id : id;
  var title = (root && root.title) || (th && th.title) || shortId(id);
  var family = (S.state ? S.state.tasks : []).filter(function(x){ return rootOf(x, map) && rootOf(x, map).id === rootId; });
  var running = family.filter(function(x){ return !isDone(x.status); }).length;
  dialog({
    title: T('deleteTitle'), danger: true, ok: running ? T('stopAndDelete') : T('delete'),
    html: '<p><b>' + esc(title) + '</b></p><p>' + esc(T('deleteBody', { n: family.length || 1 })) + '</p>' +
      (running ? '<p class="dlg-warn">' + icon('alert', 'sm') + esc(T('confirmDeleteLive', { n: running })) + '</p>' : '')
  }).then(function(yes){ if (yes) doDelete(); });
  function doDelete(){ post('/api/threads/delete', { id: rootId, stop: running > 0 }).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    toast(T('deleted'));
    if (S.selectedTask && family.some(function(x){ return x.id === S.selectedTask; })) closeDrawer();
    S.sig = {};
    if (S.current === rootId) go('/chat'); else refresh();
  }); }
}
function stopTask(id){
  var t = tasksById()[id];
  dialog({ title: T('stopTitle'), danger: false, icon: 'stop', ok: T('stop'), html: (t ? '<p><b>' + esc(t.title) + '</b></p>' : '') + '<p>' + esc(T('confirmStop')) + '</p>' })
    .then(function(yes){ if (!yes) return; post('/api/cancel', { task_id: id, by: 'human' }).then(function(d){ toast(d.error ? d.error : T('stopped'), !!d.error); soon(); }); });
}
function copyText(s){
  (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function(){ toast(T('copied')); }, function(){
    var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(T('copied')); } catch (err) {} ta.remove();
  });
}
function openArtifact(taskId, idx){
  var t = (S.thread && S.thread.tasks.filter(function(x){ return x.id === taskId; })[0]) || tasksById()[taskId];
  var a = t && t.artifacts ? t.artifacts[idx] : null;
  if (!a) return;
  if (a.kind === 'url' && /^https?:/.test(a.value)) { window.open(a.value, '_blank', 'noopener'); return; }
  S.selectedTask = taskId; S.drawerArtifact = idx; openDrawer();
}

/* ================= folders ================= */
function setFolder(path){
  S.folder = path || S.home || null;
  if (S.folder) store('ekip.folder', S.folder);
  paintFolderChip();
}
function currentFolder(){
  if (S.thread && !S.notFound) { var map = {}; S.thread.tasks.forEach(function(t){ map[t.id] = t; }); var r = map[S.thread.thread]; return (r && r.cwd) || S.home; }
  return S.folder || S.home;
}
function paintFolderChip(){
  var inThread = !!(S.thread && !S.notFound);
  var f = currentFolder();
  var chip = $('folder');
  if (!f) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.disabled = inThread;
  chip.title = f + (inThread ? ' · ' + T('folderLocked') : '');
  chip.innerHTML = icon('folder', 'sm') + '<b>' + esc(folderName(f)) + '</b>' + (inThread ? '' : icon('down', 'sm'));
}
function showFolderPopover(){
  var el = $('folder-pop');
  var items = S.folders.filter(function(f){ return f.exists; });
  el.innerHTML = '<div class="ttl">' + esc(T('workIn')) + '</div>' + items.map(function(f){
    return '<div class="opt' + (f.path === currentFolder() ? ' hi' : '') + '" data-folder="' + esc(f.path) + '">' + icon(f.home ? 'home' : 'folder') +
      '<span class="who"><b>' + esc(f.name) + '</b><span>' + esc(shortPath(f.path)) + '</span></span><span class="sub">' + (f.tasks ? f.tasks + ' ' + esc(T('chats').toLowerCase()) : '') + '</span></div>';
  }).join('') + '<div class="opt" data-browse="1">' + icon('folderPlus') + '<span class="who"><b>' + esc(T('browseOther')) + '</b><span>' + esc(T('browseOtherS')) + '</span></span></div>';
  el.hidden = false; el.style.left = '8px'; el.style.bottom = 'calc(100% + 8px)';
}
function hideFolderPopover(){ $('folder-pop').hidden = true; }
$('folder').addEventListener('click', function(e){ e.stopPropagation(); if ($('folder-pop').hidden) { hidePopover(); showFolderPopover(); } else hideFolderPopover(); });
$('folder-pop').addEventListener('click', function(e){
  var f = e.target.closest('[data-folder]');
  if (f) { setFolder(f.getAttribute('data-folder')); hideFolderPopover(); S.sig.side = ''; renderSide(); S.sig.stage = ''; renderStage(); $('text').focus(); return; }
  if (e.target.closest('[data-browse]')) { hideFolderPopover(); openBrowse(currentFolder()); }
});
document.addEventListener('click', function(e){ if (!$('folder-pop').hidden && !e.target.closest('#folder-pop') && !e.target.closest('#folder')) hideFolderPopover(); });

function openBrowse(start){
  $('scrim').classList.add('on'); $('browse').classList.add('on');
  browse(start);
}
function closeBrowse(){ $('browse').classList.remove('on'); if (!$('drawer').classList.contains('on') && !$('palette').classList.contains('on') && !$('modal').classList.contains('on')) $('scrim').classList.remove('on'); }
function browse(path){
  $('browse-list').innerHTML = '<div class="bempty">…</div>';
  getJSON('/api/browse' + (path ? '?path=' + encodeURIComponent(path) : '')).then(function(d){
    if (!d || d.error) { $('browse-list').innerHTML = '<div class="bempty err">' + esc((d && d.error) || T('offline')) + '</div>'; return; }
    S.browsePath = d.path; S.browseParent = d.parent; S.browseHome = d.home;
    $('browse-path').value = d.path;
    $('browse-up').disabled = !d.parent;
    $('browse-here').innerHTML = icon('folder', 'sm') + '<b>' + esc(d.name) + '</b>' + (d.project ? '<span class="pbadge">' + esc(T('projectBadge')) + '</span>' : '');
    $('browse-list').innerHTML = d.dirs.length ? d.dirs.map(function(x){
      return '<div class="bitem" data-dir="' + esc(x.path) + '">' + icon('folder', 'sm') + '<span>' + esc(x.name) + '</span>' + (x.project ? '<span class="pbadge">' + esc(T('projectBadge')) + '</span>' : '') + icon('chev', 'sm') + '</div>';
    }).join('') : '<div class="bempty">' + esc(T('noSubfolders')) + '</div>';
  });
}
$('browse-list').addEventListener('click', function(e){ var d = e.target.closest('[data-dir]'); if (d) browse(d.getAttribute('data-dir')); });
$('browse-up').addEventListener('click', function(){ if (S.browseParent) browse(S.browseParent); });
$('browse-home').addEventListener('click', function(){ browse(S.browseHome || ''); });
$('browse-path').addEventListener('keydown', function(e){ if (isEnter(e)) { e.preventDefault(); browse($('browse-path').value); } });
$('browse-cancel').addEventListener('click', closeBrowse);
$('browse-pick').addEventListener('click', function(){
  var path = S.browsePath; if (!path) return;
  post('/api/folders', { path: path }).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    closeBrowse(); setFolder(d.path);
    getJSON('/api/folders').then(function(f){ if (f) { S.folders = f.folders; S.home = f.home; } paintFolderChip(); S.sig.side = ''; renderSide(); S.sig.stage = ''; renderStage(); });
    toast(T('folderSet', { f: d.name }));
    if (S.view !== 'chat' || S.current) go('/chat');
    setTimeout(function(){ $('text').focus(); }, 60);
  });
});

/* ================= chat: composer ================= */
function defaultTarget(){
  if (!S.state) return null;
  var a = S.state.agents;
  var pref = a.filter(function(x){ return x.name === 'conductor'; })[0] || a.filter(function(x){ return x.spawnable; })[0] || a[0];
  return pref ? pref.name : null;
}
function setTarget(name){
  S.target = name;
  $('target').innerHTML = name ? avatar(name, { size:'sm' }) + '<b>' + esc(dn(name)) + '</b>' + icon('down', 'sm') : '';
}
function autosize(){ var ta = $('text'); ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight) + 'px'; $('send').disabled = !ta.value.trim(); }
var pop = { open:false, items:[], hi:0, mode:'' };
function showAgentPopover(query, mode){
  var q = fold(query);
  var items = S.state.agents.filter(function(a){ return !q || fold(a.name + ' ' + (a.label || '') + ' ' + (a.description || '')).indexOf(q) >= 0; });
  pop = { open:true, items:items, hi:0, mode:mode };
  var el = $('agent-pop');
  el.innerHTML = '<div class="ttl">' + esc(T('to')) + '</div>' + (items.length ? items.map(function(a, i){
    var busy = liveWorkForAgent(a.name).length;
    return '<div class="opt' + (i === 0 ? ' hi' : '') + '" data-pick="' + esc(a.name) + '">' + avatar(a.name, { size:'sm', live: busy > 0 }) + '<span class="who"><b>' + esc(dn(a.name)) + '</b><span>' + esc(a.description || ('@' + a.name)) + '</span></span><span class="sub">' +
      esc(busy ? T('working') : '@' + a.name) + '</span></div>';
  }).join('') : '<div class="opt">' + esc(T('noResults')) + '</div>') + flowOptions(q);
  el.hidden = false;
  el.style.left = '8px'; el.style.bottom = 'calc(100% + 8px)';
}
/* The budget of the request that is still running, as "used/limit" for each limit that is on. */
function budgetPill(budgets){
  var b = (budgets || []).filter(function(x){ return x.live; }).pop();
  if (!b) return '';
  var parts = [], hot = false;
  function add(used, limit, fmt, unit){
    if (!limit) return;
    if (used / limit >= 0.8) hot = true;
    parts.push(fmt(used) + '/' + fmt(limit) + ' ' + unit);
  }
  add(b.used.runs, b.limit.runs, String, T('bRunsU'));
  add(b.used.outputTokens, b.limit.outputTokens, toks, T('tokOut'));
  add(Math.floor(b.used.minutes), b.limit.minutes, String, T('bMinU'));
  if (!parts.length) return '';
  return '<span class="dotsep">·</span><span class="pill budget' + (hot ? ' hot' : '') + '" title="' + esc(T('budgetTitle')) + '">' + icon('clock', 'sm') + esc(parts.join(' · ')) + '</span>';
}
/* Flows are started, not replied to: offer them only for a new conversation. */
function flowOptions(q){
  if ((S.current && !S.notFound) || !(S.flows || []).length) return '';
  var list = S.flows.filter(function(f){ return !q || fold(f.name + ' ' + f.label + ' ' + f.description).indexOf(q) >= 0; });
  if (!list.length) return '';
  return '<div class="ttl">' + esc(T('flows')) + '</div>' + list.map(function(f){
    var broken = f.problems && f.problems.length;
    return '<div class="opt' + (broken ? ' off' : '') + '"' + (broken ? ' title="' + esc(f.problems.join('; ')) + '"' : ' data-pick="flow:' + esc(f.name) + '"') + '>' + avatar('flow:' + f.name, { size:'sm' }) +
      '<span class="who"><b>' + esc(f.label) + '</b><span>' + esc(broken ? T('flowCantRun') + ': ' + f.problems[0] : f.steps.map(function(s){ return s.title; }).join(' → ')) + '</span></span></div>';
  }).join('');
}
function hidePopover(){ pop.open = false; $('agent-pop').hidden = true; }
function pickAgent(name){
  if (pop.mode === 'mention') {
    var ta = $('text'); var caret = ta.selectionStart;
    var before = ta.value.slice(0, caret).replace(/@[\p{L}\p{N}._-]*$/u, ''); ta.value = before + ta.value.slice(caret);
    ta.selectionStart = ta.selectionEnd = before.length; autosize();
  }
  setTarget(name); hidePopover(); $('text').focus();
}
$('target').addEventListener('click', function(e){ e.stopPropagation(); if (pop.open) hidePopover(); else showAgentPopover('', 'pick'); });
$('agent-pop').addEventListener('click', function(e){ var o = e.target.closest('[data-pick]'); if (o) pickAgent(o.getAttribute('data-pick')); });
document.addEventListener('click', function(e){ if (pop.open && !e.target.closest('#agent-pop') && !e.target.closest('#target')) hidePopover(); });
$('text').addEventListener('input', function(){
  autosize();
  var ta = $('text'); var m = /@([\p{L}\p{N}._-]*)$/u.exec(ta.value.slice(0, ta.selectionStart));
  if (m) showAgentPopover(m[1], 'mention'); else if (pop.mode === 'mention') hidePopover();
});
$('text').addEventListener('keydown', function(e){
  if (pop.open) {
    var opts = $('agent-pop').querySelectorAll('[data-pick]');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pop.hi = (pop.hi + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % Math.max(1, opts.length); opts.forEach(function(o, i){ o.classList.toggle('hi', i === pop.hi); }); return; }
    if ((isEnter(e) || e.key === 'Tab') && opts[pop.hi]) { e.preventDefault(); pickAgent(opts[pop.hi].getAttribute('data-pick')); return; }
    if (e.key === 'Escape') { hidePopover(); return; }
  }
  if (isEnter(e) && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
$('send').addEventListener('click', send);
function send(){
  var ta = $('text'), text = ta.value.trim();
  if (!text || !S.target) return;
  var isFlow = S.target.indexOf('flow:') === 0;
  var body = isFlow ? { flow: S.target.slice(5), input: text, from: 'human' } : { to: S.target, prompt: text, from: 'human' };
  if (isFlow) { if (currentFolder()) body.cwd = currentFolder(); S.current = null; S.notFound = false; S.thread = null; }
  else if (S.current && !S.notFound) body.parent_task_id = S.current;
  else if (currentFolder()) body.cwd = currentFolder();
  $('send').disabled = true;
  post(isFlow ? '/api/flows/run' : '/api/delegate', body).then(function(d){
    if (d.error) { $('dock-hint').textContent = d.error; $('dock-hint').className = 'hint err'; $('send').disabled = false; return; }
    ta.value = ''; autosize(); $('dock-hint').className = 'hint';
    if (!S.current || S.notFound) { S.current = d.task.id; S.notFound = false; history.replaceState({}, '', '/chat/' + d.task.id); }
    if (isFlow) setTarget(defaultTarget());
    S.sig.stage = ''; refresh();
    setTimeout(function(){ var sc = $('scroller'); sc.scrollTop = sc.scrollHeight; }, 250);
  }).catch(function(){ $('dock-hint').textContent = T('offline'); $('dock-hint').className = 'hint err'; $('send').disabled = false; });
}

/* ================= chat: crew panel ================= */
function renderCrew(){
  var st = S.state, map = tasksById();
  var startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  var sig = JSON.stringify([LANG, st.agents, showMoney(), st.tasks.map(function(t){ return [t.id, t.status, !!t.pid, t.usage && t.usage.costUsd]; })]);
  if (sig === S.sig.crew) return;
  S.sig.crew = sig;
  var todays = st.tasks.filter(function(t){ return Date.parse(t.createdAt) >= startOfDay.getTime(); });
  var cost = 0, tk = 0;
  todays.forEach(function(t){ if (t.usage) { cost += t.usage.costUsd || 0; tk += outTok(t.usage); } });
  var working = st.agents.filter(function(a){ return liveWorkForAgent(a.name).length; }).length;
  $('crew-sub').textContent = working ? T('nWorking', { n: working }) : T('nobody');
  $('members').innerHTML = st.agents.map(function(a){
    var live = liveWorkForAgent(a.name);
    var active = live.filter(function(t){ return t.status === 'claimed' || t.pid; });
    var waiting = live.length - active.length;
    var state = active.length ? 'working' : waiting ? 'queued' : 'idle';
    var doing = active[0] || live[0];
    var runs = todays.filter(function(t){ return t.to === a.name; });
    var spent = runs.reduce(function(n, t){ return n + ((t.usage && t.usage.costUsd) || 0); }, 0);
    var sub = [shortModel(a.model) || a.adapter];
    if (runs.length) sub.push(runs.length + ' ' + T('runs'));
    if (spent && showMoney()) sub.push(money(spent));
    return '<div class="member ' + state + '"><div class="top">' + avatar(a.name, { live: state === 'working' }) +
      '<div class="who"><b>' + esc(dn(a.name)) + '</b><span>' + esc(sub.join(' · ')) + '</span></div>' +
      '<span class="pill ' + state + '">' + esc(T(state)) + (waiting && active.length ? ' +' + waiting : '') + '</span></div>' +
      (a.description && !doing ? '<div class="desc">' + esc(a.description) + '</div>' : '') +
      (doing ? '<div class="doing">' + icon(state === 'working' ? 'terminal' : 'clock', 'sm') + '<span class="t" data-open-task="' + doing.id + '">' + esc(doing.title) + '</span><span class="since" data-since="' + esc(doing.dispatchedAt || doing.createdAt) + '">' + elapsed(doing.dispatchedAt || doing.createdAt) + '</span></div>' : '') +
      '<div class="acts"><button class="btn quiet sm" data-message="' + esc(a.name) + '">' + icon('at', 'sm') + esc(T('message')) + '</button>' +
      (doing ? '<button class="btn danger sm" data-stop="' + doing.id + '">' + icon('stop', 'sm') + esc(T('stop')) + '</button>' : '') + '</div></div>';
  }).join('');
  $('crew-foot').innerHTML =
    '<div class="stat"><div class="n">' + todays.length + '</div><div class="l">' + esc(T('runsToday')) + '</div></div>' +
    (showMoney()
      ? '<div class="stat cost" title="' + esc(costTitle()) + '"><div class="n">≈ ' + (cost ? money(cost) : '$0') + '</div><div class="l">' + esc(S.billing && S.billing.claude === 'subscription' ? T('costRef') : T('cost')) + '</div></div>'
      : '<div class="stat" title="' + esc(T('runTimeTitle')) + '"><div class="n">' + dur(todays.reduce(function(n, t){ return n + ((t.usage && t.usage.durationMs) || 0); }, 0)) + '</div><div class="l">' + esc(T('runTime')) + '</div></div>') +
    '<div class="stat" title="' + esc(T('outTokTitle')) + '"><div class="n">' + toks(tk) + '</div><div class="l">' + esc(T('tokOut')) + '</div></div>';
}
$('members').addEventListener('click', function(e){
  var m = e.target.closest('[data-message]');
  if (m) { setTarget(m.getAttribute('data-message')); $('text').focus(); return; }
  var o = e.target.closest('[data-open-task]');
  if (o) { var map = tasksById(), t = map[o.getAttribute('data-open-task')]; if (t) go('/chat/' + rootOf(t, map).id); }
});
function toggleCrew(){
  var on = !$('chat-grid').classList.contains('no-crew');
  $('chat-grid').classList.toggle('no-crew', on);
  store('ekip.crew', on ? 'hidden' : null);
}
if (store('ekip.crew') === 'hidden') $('chat-grid').classList.add('no-crew');

`;
