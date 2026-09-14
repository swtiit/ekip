/**
 * The Guide view: fills the live crew section of the in-app user guide.
 *
 * Part of the web client (see ../client.ts): a String.raw template sharing one
 * function scope with the other parts. No backticks or dollar-brace inside.
 */
export const GUIDE = String.raw`
/* ================= guide ================= */
function renderGuide(){
  if (!S.state) return;
  var st = S.state;
  var sig = JSON.stringify([LANG, st.agents]);
  if (sig === S.sig.guide) return;
  S.sig.guide = sig;
  var html = '<div class="gcrew">' + st.agents.map(function(a){
    return '<div class="gmember">' + avatar(a.name, { size:'lg', live: liveWorkForAgent(a.name).length > 0 }) +
      '<div class="gm-body"><div class="gm-top"><b>' + esc(dn(a.name)) + '</b><span class="handle">@' + esc(a.name) + '</span></div>' +
      '<p>' + esc(a.description || T('noJob')) + '</p>' +
      '<div class="gm-meta"><span class="chip">' + esc(shortModel(a.model) || a.adapter) + '</span>' + (a.effort ? '<span class="chip">' + esc(a.effort) + '</span>' : '') + (a.spawnable ? '' : '<span class="chip">' + esc(T('autoOff')) + '</span>') + '</div></div></div>';
  }).join('') + '</div>';
  document.querySelectorAll('.guide-crew').forEach(function(el){ el.innerHTML = html; });
}
$('guide-root').addEventListener('click', function(e){
  var anchor = e.target.closest('[data-anchor]');
  if (anchor) { e.preventDefault(); var target = document.getElementById(anchor.getAttribute('data-anchor')); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  var goLink = e.target.closest('[data-go]');
  if (goLink) { e.preventDefault(); go(goLink.getAttribute('data-go')); return; }
  var cp = e.target.closest('[data-copy-text]');
  if (cp) copyText(cp.getAttribute('data-copy-text'));
});

`;
