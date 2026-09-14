/**
 * App-wide pieces wired last: the command palette, theme and toasts, and the live event stream that starts everything.
 *
 * Part of the web client (see ../client.ts): a String.raw template sharing one
 * function scope with the other parts. No backticks or dollar-brace inside.
 */
export const SHELL = String.raw`
/* ================= command palette ================= */
var pal = { items:[], hi:0 };
function openPalette(){
  $('scrim').classList.add('on'); $('palette').classList.add('on');
  $('pal-input').value = ''; buildPalette(''); setTimeout(function(){ $('pal-input').focus(); }, 30);
}
function closePalette(){ $('palette').classList.remove('on'); if (!$('drawer').classList.contains('on') && !$('modal').classList.contains('on')) $('scrim').classList.remove('on'); }
function buildPalette(q){
  q = q.toLowerCase();
  var items = [];
  items.push({ g:T('goTo'), icon:'chat', label:T('chat'), run:function(){ go('/chat'); } });
  items.push({ g:T('goTo'), icon:'board', label:T('board'), run:function(){ go('/board'); } });
  items.push({ g:T('goTo'), icon:'note', label:T('guide'), run:function(){ go('/guide'); } });
  items.push({ g:T('goTo'), icon:'settings', label:T('settings'), run:function(){ go('/settings'); } });
  items.push({ g:T('actions'), icon:'plus', label:T('newChat'), run:function(){ go('/chat'); setTimeout(function(){ $('text').focus(); }, 40); } });
  items.push({ g:T('actions'), icon:'board', label:T('newTask'), run:function(){ go('/board'); setTimeout(openModal, 60); } });
  items.push({ g:T('actions'), icon:'moon', label:T('theme'), run:toggleTheme });
  items.push({ g:T('actions'), icon:'panel', label:T('toggleCrew'), run:function(){ if (S.view !== 'chat') go('/chat'); toggleCrew(); } });
  (S.state ? S.state.agents : []).forEach(function(a){
    items.push({ g:T('msgTo'), avatar:a.name, label:dn(a.name), sub:'@' + a.name + (a.description ? ' · ' + a.description : ''), run:function(){ go('/chat'); setTarget(a.name); setTimeout(function(){ $('text').focus(); }, 40); } });
  });
  S.folders.filter(function(f){ return f.exists; }).forEach(function(f){
    items.push({ g:T('startIn'), icon:f.home ? 'home' : 'folder', label:f.name, sub:shortPath(f.path), run:function(){ setFolder(f.path); go('/chat'); setTimeout(function(){ $('text').focus(); }, 40); } });
  });
  items.push({ g:T('startIn'), icon:'folderPlus', label:T('browseOther'), run:function(){ openBrowse(currentFolder()); } });
  S.threads.slice(0, 40).forEach(function(t){
    items.push({ g:T('chats'), avatar:t.to, label:t.title, sub:ago(t.lastAt), run:function(){ go('/chat/' + t.id); } });
  });
  var shown = items.filter(function(i){ return !q || (i.label + ' ' + (i.sub || '') + ' ' + i.g).toLowerCase().indexOf(q) >= 0; }).slice(0, 60);
  pal = { items: shown, hi: 0 };
  var html = '', lastG = '';
  shown.forEach(function(i, idx){
    if (i.g !== lastG) { html += '<div class="ttl" style="font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;padding:8px 10px 4px;font-weight:600">' + esc(i.g) + '</div>'; lastG = i.g; }
    html += '<div class="opt' + (idx === 0 ? ' hi' : '') + '" data-idx="' + idx + '">' + (i.avatar ? avatar(i.avatar, { size:'sm' }) : icon(i.icon)) + '<span>' + esc(i.label) + '</span>' + (i.sub ? '<span class="sub">' + esc(i.sub) + '</span>' : '') + '</div>';
  });
  $('pal-results').innerHTML = html || '<div class="opt">' + esc(T('noResults')) + '</div>';
}
$('pal-input').addEventListener('input', function(e){ buildPalette(e.target.value); });
$('pal-input').addEventListener('keydown', function(e){
  var opts = $('pal-results').querySelectorAll('[data-idx]');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    pal.hi = (pal.hi + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % Math.max(1, opts.length);
    opts.forEach(function(o, i){ o.classList.toggle('hi', i === pal.hi); });
    if (opts[pal.hi]) opts[pal.hi].scrollIntoView({ block:'nearest' });
  } else if (isEnter(e)) {
    e.preventDefault(); var it = pal.items[pal.hi]; closePalette(); if (it) it.run();
  } else if (e.key === 'Escape') closePalette();
});
$('pal-results').addEventListener('click', function(e){ var o = e.target.closest('[data-idx]'); if (!o) return; var it = pal.items[+o.getAttribute('data-idx')]; closePalette(); if (it) it.run(); });
$('open-palette').addEventListener('click', openPalette);
document.addEventListener('keydown', function(e){
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('palette').classList.contains('on')) closePalette(); else openPalette(); return; }
  if (e.key === 'Escape' && $('browse').classList.contains('on')) { closeBrowse(); return; }
  if (e.key === 'Escape') { if ($('palette').classList.contains('on')) closePalette(); else if ($('modal').classList.contains('on')) closeModal(); else if ($('drawer').classList.contains('on')) closeDrawer(); }
});

/* ================= theme & toasts ================= */
function effectiveDark(){ var t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
function toggleTheme(){
  var next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next); store('ekip.theme', next); paintThemeButton();
}
function paintThemeButton(){ $('theme').innerHTML = icon(effectiveDark() ? 'sun' : 'moon'); }
(function(){ var t = store('ekip.theme'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); })();
$('theme').addEventListener('click', toggleTheme);
paintThemeButton();
function toast(msg, bad){
  var el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : '');
  el.innerHTML = icon(bad ? 'alert' : 'check', 'sm') + '<span>' + esc(msg) + '</span>';
  $('toasts').appendChild(el); setTimeout(function(){ el.remove(); }, 2600);
}

/* ================= live ================= */
var online = false;
var es = new EventSource('/api/events');
es.onopen = function(){ online = true; S.sig = {}; refresh(); };
es.onerror = function(){ online = false; render(); };
es.onmessage = function(){ soon(); };
setInterval(function(){ if (S.view === 'chat') { S.sig.side = ''; renderSide(); } }, 60000);

LANG = pickLang('');
applyStaticText();
autosize();
go(location.pathname, false);
`;
