/**
 * The Settings view: billing, reporting language, members (name, job, model, effort, parallelism, auto-launch, role brief), hub limits.
 *
 * Part of the web client (see ../client.ts): a String.raw template sharing one
 * function scope with the other parts. No backticks or dollar-brace inside.
 */
export const SETTINGS = String.raw`
/* ================= settings ================= */
var EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
function renderSettings(){
  if (!S.state) return; // the model list can arrive before the hub's state
  var st = S.state, l = S.limits;
  var sig = JSON.stringify([LANG, st.agents, !!S.catalogs, l, S.billing, showMoney()]);
  if (sig === S.sig.settings) return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#settings-root input, #settings-root textarea')) return;
  S.sig.settings = sig;
  $('set-lead').textContent = T('setLead', { p: st.project });
  var b = S.billing || { claude: 'unknown' };
  $('billing-panel').innerHTML = b.claude === 'api'
    ? '<div class="bill api">' + icon('alert') + '<div><b>' + esc(T(b.apiKeyInEnv ? 'billApiKey' : 'billApi')) + '</b><span>' + esc(T('billApiS')) + '</span></div></div>'
    : '<div class="bill sub">' + icon('check') + '<div><b>' + esc(b.claude === 'subscription' ? T('billSub', { plan: (b.plan || '').toUpperCase() || 'Claude' }) : T('billUnknown')) + '</b><span>' + esc(T('billSubS')) + '</span></div>' +
      '<label class="chk-row"><button class="switch' + (showMoney() ? ' on' : '') + '" id="toggle-money" role="switch" aria-checked="' + showMoney() + '"></button><span>' + esc(T('showRef')) + '</span></label></div>';
  var lang = l ? (l.language || '') : '';
  var langs = [['', T('langDef')], ['Vietnamese', 'Tiếng Việt'], ['English', 'English'], ['Japanese', '日本語'], ['Korean', '한국어'], ['Chinese', '中文']];
  if (lang && !langs.some(function(o){ return o[0] === lang; })) langs.push([lang, lang]);
  $('lang-select').innerHTML = langs.map(function(o){
    return '<option value="' + esc(o[0]) + '"' + (o[0] === lang ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
  }).join('') + '<option value="__other">' + esc(T('other')) + '</option>';
  var bud = (l && l.budget) || { runs: 20, outputTokens: 0, minutes: 120 };
  [['budget-runs', 'runs', [5, 10, 20, 40, 80, 0], String], ['budget-tokens', 'outputTokens', [10000, 30000, 60000, 120000, 300000, 0], toks], ['budget-minutes', 'minutes', [15, 30, 60, 120, 240, 0], String]].forEach(function(x){
    var cur = bud[x[1]] || 0, opts = x[2].indexOf(cur) < 0 ? x[2].concat([cur]) : x[2];
    $(x[0]).innerHTML = opts.map(function(n){ return '<option value="' + n + '"' + (n === cur ? ' selected' : '') + '>' + esc(n ? x[3](n) : T('noLimit')) + '</option>'; }).join('');
  });
  $('roles-explain').innerHTML = '<div class="explain-grid">' + [
    ['users', T('exRole'), T('exRoleS')],
    ['at', T('exId'), T('exIdS')],
    ['note', T('exJob'), T('exJobS')],
    ['file', T('exBrief'), T('exBriefS')]
  ].map(function(x){ return '<div class="ex">' + icon(x[0]) + '<div><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div></div>'; }).join('') + '</div>';

  $('roster').innerHTML = st.agents.map(function(a){
    var cat = (S.catalogs && S.catalogs[a.adapter] && S.catalogs[a.adapter].models) || [];
    var groups = { seen: [], account: [], cli: [], builtin: [] };
    cat.forEach(function(m){ (groups[m.source] || groups.builtin).push(m); });
    var labelFor = { seen: LANG === 'vi' ? 'Đã chạy ở đây' : 'Seen running here', account: LANG === 'vi' ? 'Tài khoản của bạn' : 'Your account', cli: LANG === 'vi' ? 'Danh sách trực tiếp' : 'Live list', builtin: LANG === 'vi' ? 'Bí danh' : 'Aliases' };
    var inList = cat.some(function(m){ return m.value === a.model; });
    var opts = '<option value="">' + esc(T('adapterDef')) + '</option>' +
      (a.model && !inList ? '<option value="' + esc(a.model) + '" selected>' + esc(a.model) + '</option>' : '') +
      ['seen', 'account', 'cli', 'builtin'].map(function(k){
        if (!groups[k].length) return '';
        return '<optgroup label="' + esc(labelFor[k]) + '">' + groups[k].map(function(m){ return '<option value="' + esc(m.value) + '"' + (m.value === a.model ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '<option value="__custom">' + esc(T('custom')) + '</option>';
    var busy = liveWorkForAgent(a.name).length;
    return '<div class="panel agent-card" data-agent="' + esc(a.name) + '"><div class="ah">' + avatar(a.name, { size:'lg', live: busy > 0 }) +
      '<div class="who"><b>' + esc(dn(a.name)) + '</b><span>@' + esc(a.name) + ' · ' + esc(a.adapter) + (a.promptFile ? ' · ' + esc(a.promptFile) : '') + '</span></div><span class="saved">' + icon('check', 'sm') + ' ' + esc(T('saved').split(' · ')[0]) + '</span></div>' +
      '<div class="ctl"><label>' + esc(T('displayName')) + '</label><input class="field" data-f="label" maxlength="40" placeholder="' + esc(a.name) + '" value="' + esc(a.label || '') + '">' +
      '<label class="top-align">' + esc(T('describe')) + '</label><textarea class="field" data-f="description" rows="3" maxlength="240" placeholder="' + esc(T('describePh')) + '">' + esc(a.description || '') + '</textarea>' +
      '<label>' + esc(T('model')) + '</label><div class="model-row"><select class="field" data-f="model"' + (S.catalogs ? '' : ' disabled') + '>' + opts + '</select>' +
      (a.adapter === 'claude' ? '<button class="btn ghost sm" data-check-model="' + esc(a.name) + '" title="' + esc(T('checkModelTip')) + '">' + esc(T('checkModel')) + '</button>' : '') +
      '</div>' + (a.adapter === 'claude' && a.model && aliasOf(a.model) ? '<span></span><span class="muted alias-note">' + esc(a.model) + ' → ' + esc(aliasOf(a.model)) + '</span>' : '') +
      (a.adapter === 'claude' ? '<label>' + esc(T('effort')) + '</label><select class="field" data-f="effort">' + [''].concat(EFFORTS).map(function(e){
        return '<option value="' + e + '"' + ((a.effort || '') === e ? ' selected' : '') + '>' + esc(T('eff_' + (e || 'def'))) + '</option>';
      }).join('') + '</select>' : '') +
      '<label>' + esc(T('parallel')) + '</label><select class="field" data-f="maxConcurrent">' + [''].concat([1, 2, 3, 4, 6, 8]).concat(a.maxConcurrent != null && [1, 2, 3, 4, 6, 8].indexOf(a.maxConcurrent) < 0 ? [a.maxConcurrent] : []).map(function(n){
        return '<option value="' + n + '"' + (String(a.maxConcurrent == null ? '' : a.maxConcurrent) === String(n) ? ' selected' : '') + '>' + esc(n === '' ? T('parDef') : T('parN', { n: n })) + '</option>';
      }).join('') + '</select>' +
      '<label>' + esc(T('auto')) + '</label><div class="auto-row"><button class="switch' + (a.spawnable ? ' on' : '') + '" data-f="spawnable" role="switch" aria-checked="' + !!a.spawnable + '"></button><span>' + esc(a.spawnable ? T('autoOn') : T('autoOff')) + '</span></div>' +
      '</div>' +
      (a.promptFile ? '<details class="role-brief" data-role="' + esc(a.name) + '"><summary>' + icon('file', 'sm') + esc(T('seeBrief')) + ' <code>' + esc(a.promptFile) + '</code></summary><pre class="role-text">…</pre></details>' : '<p class="muted no-brief">' + esc(T('noBrief')) + '</p>') +
      '</div>';
  }).join('');

  if (l) {
    $('tiles').innerHTML = [[l.maxConcurrent, T('lWorkers')], [l.maxConcurrentTotal, T('lWorkersTotal')], [l.folderGuard ? T('on') : T('off'), T('lGuard')], [l.maxDepth, T('lDepth')], [Math.round(l.watchdog.pendingTtlSeconds / 60) + (LANG === 'vi' ? ' phút' : ' min'), T('lWait')], [l.retention.days, T('lKeep')]].map(function(x){
      return '<div class="panel tile"><div class="n">' + esc(x[0]) + '</div><div class="l">' + esc(x[1]) + '</div></div>';
    }).join('');
  }
  $('sources').innerHTML = S.catalogs ? Object.keys(S.catalogs).map(function(k){
    var c = S.catalogs[k];
    return '<div class="note"><b>' + esc(k) + '</b><span>' + (c.live ? c.models.length + ' model · ' : '') + esc(c.note || '') + '</span></div>';
  }).join('') : '<div class="note">…</div>';
  $('endpoint').textContent = JSON.stringify({ mcpServers: { ekip: { type: 'http', url: st.hubUrl } } }, null, 2);
}
function saveAgent(name, patch){
  var card = document.querySelector('.agent-card[data-agent="' + name + '"]');
  post('/api/config/agent', Object.assign({ name: name }, patch)).then(function(d){
    if (d.error) { toast(d.error, true); S.sig.settings = ''; refresh(); return; }
    var sv = card && card.querySelector('.saved'); if (sv) { sv.classList.add('on'); setTimeout(function(){ sv.classList.remove('on'); }, 1600); }
    S.sig.settings = ''; getJSON('/api/state').then(function(s){ if (s) { S.state = s; render(); } });
  });
}
$('roster').addEventListener('toggle', function(e){
  var d = e.target.closest && e.target.closest('details[data-role]');
  if (!d || !d.open || d.getAttribute('data-loaded')) return;
  getJSON('/api/role/' + encodeURIComponent(d.getAttribute('data-role'))).then(function(r){
    d.setAttribute('data-loaded', '1');
    d.querySelector('.role-text').textContent = r && r.text ? r.text : T('noBriefFile');
  });
}, true);
$('roster').addEventListener('change', function(e){
  var pick = e.target.closest('select[data-f="effort"], select[data-f="maxConcurrent"]');
  if (pick) { var p2 = {}; p2[pick.getAttribute('data-f')] = pick.value; saveAgent(pick.closest('[data-agent]').getAttribute('data-agent'), p2); return; }
  var txt = e.target.closest('input[data-f="label"], textarea[data-f="description"]');
  if (txt) { var patch = {}; patch[txt.getAttribute('data-f')] = txt.value; saveAgent(txt.closest('[data-agent]').getAttribute('data-agent'), patch); return; }
  var sel = e.target.closest('select[data-f="model"]'); if (!sel) return;
  var name = sel.closest('[data-agent]').getAttribute('data-agent');
  var v = sel.value;
  if (v === '__custom') {
    dialog({ title: T('custom'), input: true, placeholder: 'claude-sonnet-5', ok: T('save') }).then(function(typed){
      if (!typed) { S.sig.settings = ''; renderSettings(); return; }
      saveAgent(name, { model: typed });
    });
    return;
  }
  saveAgent(name, { model: v });
});
/* What an alias last resolved to here, e.g. opus → claude-opus-5. */
function aliasOf(model){
  var cat = S.catalogs && S.catalogs.claude;
  return (cat && cat.aliases && cat.aliases[model]) || '';
}
/* Claude can't list its models, so checking one means running a tiny task with it. */
function checkModel(name){
  var card = document.querySelector('.agent-card[data-agent="' + name + '"]');
  var sel = card && card.querySelector('select[data-f="model"]');
  var model = sel && sel.value && sel.value !== '__custom' ? sel.value : '';
  if (!model) { toast(T('checkPickFirst'), true); return; }
  dialog({ title: T('checkModel'), icon: 'plug', ok: T('checkRun'), html: '<p><b>' + esc(model) + '</b></p><p>' + esc(T('checkBody')) + '</p>' }).then(function(yes){
    if (!yes) return;
    var btn = card.querySelector('[data-check-model]');
    if (btn) { btn.disabled = true; btn.textContent = T('checking'); }
    post('/api/models/probe', { model: model, adapter: 'claude' }).then(function(d){
      if (btn) { btn.disabled = false; btn.textContent = T('checkModel'); }
      if (!d) return;
      if (d.ok) toast(T('checkOk', { m: d.resolved, c: typeof d.costUsd === 'number' && showMoney() ? ' · ' + money(d.costUsd) : '' }));
      else toast(T('checkNo', { e: d.error || '' }), true);
      S.catalogs = null; S.sig.settings = ''; loadCatalogs();
    });
  });
}
$('roster').addEventListener('click', function(e){
  var check = e.target.closest('[data-check-model]');
  if (check) { checkModel(check.getAttribute('data-check-model')); return; }
  var card = e.target.closest('[data-agent]'); if (!card) return;
  var name = card.getAttribute('data-agent');
  var sw = e.target.closest('[data-f="spawnable"]');
  if (sw) { saveAgent(name, { spawnable: !sw.classList.contains('on') }); }
});
$('lang-select').addEventListener('change', function(e){
  var v = e.target.value;
  var saveLang = function(lang){
    post('/api/config/hub', { language: lang }).then(function(d){
      if (d.error) { toast(d.error, true); return; }
      toast(T('saved')); S.sig = {}; refresh();
    });
  };
  if (v === '__other') {
    dialog({ title: T('lang'), input: true, placeholder: 'Français', ok: T('save') }).then(function(typed){
      if (!typed) { S.sig.settings = ''; renderSettings(); return; }
      saveLang(typed);
    });
    return;
  }
  saveLang(v);
});
document.querySelectorAll('[data-budget]').forEach(function(sel){
  sel.addEventListener('change', function(){
    var patch = {}; patch[sel.getAttribute('data-budget')] = Number(sel.value);
    post('/api/config/hub', { budget: patch }).then(function(d){
      if (d.error) { toast(d.error, true); return; }
      toast(T('saved')); S.sig = {}; refresh();
    });
  });
});
$('billing-panel').addEventListener('click', function(e){
  if (!e.target.closest('#toggle-money')) return;
  store('ekip.showCost', showMoney() ? null : '1');
  S.sig = {}; render();
});
$('copy-endpoint').addEventListener('click', function(){ copyText($('endpoint').textContent); });

`;
