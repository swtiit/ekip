/**
 * Styles for the hub's web app. Kept as a String.raw template so nothing in
 * here is ever re-escaped on the way to the browser.
 *
 * Identity: an ê-kíp is a film crew. Agents are the crew; one that is working
 * lights its tally — the red lamp a camera shows while it is recording. Each
 * agent carries its own hue (derived from its name) everywhere it appears,
 * so "who" reads before "what".
 */
export const STYLES = String.raw`
:root{
  --ground:#f2f3f6;--surface:#ffffff;--raised:#fafbfc;--sunk:#eceef2;--hover:#f0f2f5;
  --line:#e0e3e9;--line-soft:#eaecf0;
  --ink:#12151b;--ink-2:#3a404c;--muted:#687080;--faint:#9aa1ad;
  --accent:#3056d3;--accent-ink:#ffffff;--accent-soft:#e7ecfb;
  --tally:#ef4b4f;--ok:#1c9a68;--ok-soft:#e2f4ec;--warn:#b87d0c;--warn-soft:#faefd6;--bad:#d2433b;--bad-soft:#fbe6e4;
  --you:#e9eefc;--you-line:#d5def8;
  --shadow-sm:0 1px 2px rgba(16,20,28,.06);
  --shadow:0 4px 18px rgba(16,20,28,.07),0 1px 3px rgba(16,20,28,.05);
  --shadow-lg:0 22px 60px rgba(16,20,28,.18),0 3px 10px rgba(16,20,28,.07);
  --r-sm:6px;--r:10px;--r-lg:14px;
  --av-l:93%;--av-s:72%;--av-ink-l:32%;--av-ink-s:55%;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0b0d11;--surface:#12151b;--raised:#171b22;--sunk:#0e1115;--hover:#1a1e26;
  --line:#232833;--line-soft:#1b2029;
  --ink:#e8ebf0;--ink-2:#c1c7d1;--muted:#8a92a0;--faint:#5f6775;
  --accent:#7f9bff;--accent-ink:#0b0d11;--accent-soft:#1a2340;
  --tally:#ff5c61;--ok:#3cc48b;--ok-soft:#10271d;--warn:#e2a83a;--warn-soft:#291f10;--bad:#f06a61;--bad-soft:#2d1615;
  --you:#18223d;--you-line:#243258;
  --shadow-sm:0 1px 2px rgba(0,0,0,.4);
  --shadow:0 6px 22px rgba(0,0,0,.35),0 1px 3px rgba(0,0,0,.3);
  --shadow-lg:0 24px 70px rgba(0,0,0,.55),0 3px 12px rgba(0,0,0,.35);
  --av-l:22%;--av-s:38%;--av-ink-l:78%;--av-ink-s:80%;
  color-scheme:dark;
}}
:root[data-theme="dark"]{
  --ground:#0b0d11;--surface:#12151b;--raised:#171b22;--sunk:#0e1115;--hover:#1a1e26;
  --line:#232833;--line-soft:#1b2029;
  --ink:#e8ebf0;--ink-2:#c1c7d1;--muted:#8a92a0;--faint:#5f6775;
  --accent:#7f9bff;--accent-ink:#0b0d11;--accent-soft:#1a2340;
  --tally:#ff5c61;--ok:#3cc48b;--ok-soft:#10271d;--warn:#e2a83a;--warn-soft:#291f10;--bad:#f06a61;--bad-soft:#2d1615;
  --you:#18223d;--you-line:#243258;
  --shadow-sm:0 1px 2px rgba(0,0,0,.4);
  --shadow:0 6px 22px rgba(0,0,0,.35),0 1px 3px rgba(0,0,0,.3);
  --shadow-lg:0 24px 70px rgba(0,0,0,.55),0 3px 12px rgba(0,0,0,.35);
  --av-l:22%;--av-s:38%;--av-ink-l:78%;--av-ink-s:80%;
  color-scheme:dark;
}

*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%;margin:0}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;display:flex;flex-direction:column;height:100vh;overflow:hidden;-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss01"}
a{color:var(--accent);text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
input,select,textarea{font:inherit;color:var(--ink)}
::selection{background:var(--accent-soft)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.ico{width:16px;height:16px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-3px}
.ico.sm{width:14px;height:14px}
.ico.lg{width:20px;height:20px}
.mono{font-family:var(--mono)}
.num{font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}

/* ---------- buttons & controls ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:550;white-space:nowrap;transition:background .12s,border-color .12s,color .12s,box-shadow .12s}
.btn.primary{background:var(--ink);color:var(--surface)}
.btn.primary:hover{background:var(--ink-2)}
.btn.accent{background:var(--accent);color:var(--accent-ink)}
.btn.quiet{color:var(--ink-2);border:1px solid var(--line);background:var(--surface)}
.btn.quiet:hover{background:var(--hover);border-color:var(--faint)}
.btn.ghost{color:var(--muted)}
.btn.ghost:hover{background:var(--hover);color:var(--ink)}
.btn.danger{color:var(--bad);border:1px solid color-mix(in srgb,var(--bad) 35%,var(--line));background:var(--surface)}
.btn.danger:hover{background:var(--bad-soft)}
.btn.sm{height:26px;padding:0 9px;font-size:12px;border-radius:7px}
.btn.icon{width:32px;padding:0}
.btn.icon.sm{width:26px}
.btn:disabled{opacity:.45;cursor:default}
.field{width:100%;height:34px;border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:0 10px;transition:border-color .12s,box-shadow .12s}
.field:hover{border-color:color-mix(in srgb,var(--faint) 70%,var(--line))}
.field:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
textarea.field{height:auto;padding:9px 10px;resize:vertical;line-height:1.5}
select.field{appearance:none;padding-right:28px;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 15px) 15px,calc(100% - 10px) 15px;background-size:5px 5px;background-repeat:no-repeat}
.seg{display:inline-flex;flex-wrap:wrap;background:var(--sunk);border-radius:9px;padding:3px;gap:2px}
.agent-card .seg button{padding:0 8px;font-size:12px}
.seg button{height:28px;padding:0 11px;border-radius:7px;font-size:12.5px;color:var(--muted);font-weight:500}
.seg button:hover{color:var(--ink)}
.seg button.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow-sm)}
.switch{position:relative;width:34px;height:20px;border-radius:999px;background:var(--line);transition:background .15s;flex-shrink:0}
.switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--surface);box-shadow:var(--shadow-sm);transition:transform .15s}
.switch.on{background:var(--ok)}
.switch.on:after{transform:translateX(14px)}
.stepper{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:8px;background:var(--surface);height:32px}
.stepper button{width:30px;height:100%;color:var(--muted)}
.stepper button:hover{color:var(--ink);background:var(--hover)}
.stepper span{min-width:44px;text-align:center;font-size:13px;font-variant-numeric:tabular-nums}
kbd{font-family:var(--mono);font-size:10.5px;padding:1px 5px;border-radius:4px;border:1px solid var(--line);border-bottom-width:2px;color:var(--muted);background:var(--surface)}

/* ---------- avatar & status ---------- */
.av{--h:220;position:relative;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;flex-shrink:0;background:hsl(var(--h) var(--av-s) var(--av-l));color:hsl(var(--h) var(--av-ink-s) var(--av-ink-l));font-size:11px;font-weight:700;letter-spacing:.01em;text-transform:uppercase;user-select:none}
.av.sm{width:22px;height:22px;border-radius:6px;font-size:9.5px}
.av.lg{width:40px;height:40px;border-radius:11px;font-size:14px}
.av.you{background:var(--ink);color:var(--surface)}
.av .ad{position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:4px;background:var(--surface);color:var(--muted);font-size:8px;display:grid;place-items:center;box-shadow:0 0 0 1.5px var(--surface);font-weight:700}
.av.lg .ad{width:16px;height:16px;font-size:9.5px;border-radius:5px}
.av.live:after{content:"";position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:var(--tally);box-shadow:0 0 0 2px var(--surface),0 0 10px var(--tally);animation:tally 1.6s ease-in-out infinite}
@keyframes tally{50%{box-shadow:0 0 0 2px var(--surface),0 0 2px var(--tally);opacity:.75}}
.pill{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.pill:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.pill.working{color:var(--tally);background:color-mix(in srgb,var(--tally) 12%,transparent)}
.pill.working:before{animation:tally 1.6s ease-in-out infinite;box-shadow:0 0 6px var(--tally)}
.pill.queued{color:var(--warn);background:var(--warn-soft)}
.pill.done{color:var(--ok);background:var(--ok-soft)}
.pill.failed{color:var(--bad);background:var(--bad-soft)}
.pill.cancelled{color:var(--muted);background:var(--sunk)}
.pill.idle{color:var(--muted);background:var(--sunk)}
.pill.idle:before{opacity:.5}
.shimmer{background:linear-gradient(90deg,var(--muted) 0%,var(--ink) 45%,var(--muted) 90%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shim 2.2s linear infinite}
@keyframes shim{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.av.live:after,.pill.working:before,.shimmer{animation:none}.shimmer{color:var(--ink-2);background:none}}

/* ---------- app shell ---------- */
header.bar{display:flex;align-items:center;gap:14px;height:52px;padding:0 14px 0 16px;background:var(--surface);border-bottom:1px solid var(--line);flex-shrink:0;position:relative;z-index:5}
.brand{display:flex;align-items:center;gap:9px;min-width:0}
.logo{width:26px;height:26px;border-radius:7px;background:var(--ink);color:var(--surface);display:grid;place-items:center;font-weight:800;font-size:13px;letter-spacing:-.04em}
.brand b{font-size:14.5px;letter-spacing:-.015em}
.brand .proj{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.brand .sep{color:var(--faint)}
nav.tabs{display:flex;gap:2px;margin-left:10px;background:var(--sunk);padding:3px;border-radius:10px}
nav.tabs a{display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;color:var(--muted);font-weight:550;font-size:13px}
nav.tabs a:hover{color:var(--ink)}
nav.tabs a.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow-sm)}
nav.tabs a .count{font-size:10.5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:var(--tally);color:#fff;display:none;place-items:center;font-weight:700}
nav.tabs a .count.show{display:grid}
.bar .right{margin-left:auto;display:flex;align-items:center;gap:6px}
.live-chip{display:flex;align-items:center;gap:7px;height:30px;padding:0 10px;border-radius:8px;font-size:12.5px;color:var(--muted)}
.live-chip .lamp{width:8px;height:8px;border-radius:50%;background:var(--faint)}
.live-chip.on{color:var(--ink)}
.live-chip.on .lamp{background:var(--tally);box-shadow:0 0 8px var(--tally);animation:tally 1.6s ease-in-out infinite}
.live-chip.off .lamp{background:var(--bad)}
.cmdk{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px 0 10px;border:1px solid var(--line);border-radius:8px;color:var(--muted);font-size:12.5px;background:var(--raised);min-width:190px}
.cmdk:hover{border-color:var(--faint);color:var(--ink)}
.cmdk span{flex:1;text-align:left}
main{flex:1;min-height:0;display:flex}
.view{flex:1;min-height:0;display:none}
.view.on{display:flex}

/* ---------- chat ---------- */
.chat{display:grid;grid-template-columns:272px minmax(0,1fr) 296px;flex:1;min-height:0}
.chat.no-crew{grid-template-columns:272px minmax(0,1fr) 0}
.side{background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.side .hd{padding:12px 12px 8px;display:flex;flex-direction:column;gap:8px}
.search{position:relative}
.search .ico{position:absolute;left:10px;top:9px;color:var(--faint)}
.search input{padding-left:32px;height:32px;font-size:13px;background:var(--raised)}
.list{overflow:auto;flex:1;padding:4px 8px 12px}
.group-label{font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;padding:12px 8px 5px}
.fgroup{margin-bottom:2px}
.fhead{display:flex;align-items:center;gap:6px;padding:7px 6px 7px 4px;border-radius:8px;cursor:pointer;color:var(--ink-2);font-size:12.5px;font-weight:600;user-select:none}
.fhead:hover{background:var(--hover)}
.fhead .chev{color:var(--faint);transition:transform .15s}
.fgroup.open .fhead .chev{transform:rotate(90deg)}
.fhead .fname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fhead .fcount{font-size:11px;color:var(--faint);font-weight:500}
.fhead .flive{font-size:10.5px;min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:var(--tally);color:#fff;display:grid;place-items:center}
.fhead .fadd{opacity:0;width:22px;height:22px}
.fhead:hover .fadd{opacity:1}
.fitems{display:none;padding-left:8px}
.fgroup.open .fitems{display:block}
.fempty{font-size:12px;color:var(--faint);padding:6px 10px 10px 22px}
.th{display:flex;gap:10px;padding:9px 8px;border-radius:9px;cursor:pointer;align-items:flex-start;position:relative}
.th:hover{background:var(--hover)}
.th.sel{background:var(--accent-soft)}
.th .body{min-width:0;flex:1}
.th .t{font-weight:550;font-size:13px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.th .m{font-size:11.5px;color:var(--muted);margin-top:2px;display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden}
.th .m .state{flex-shrink:0}
.th .m .state.working{color:var(--tally);font-weight:600}
.th .m .state.failed{color:var(--bad);font-weight:600}
.th .av .ad{display:none}
.th .th-del{display:none;margin-left:-4px;color:var(--faint)}
.th:hover .th-del{display:inline-flex}
.th:hover .when{display:none}
.th .th-del:hover{color:var(--bad);background:var(--bad-soft)}
.th .when{font-size:11px;color:var(--faint);white-space:nowrap;padding-top:1px}

.stage{display:flex;flex-direction:column;min-height:0;min-width:0;position:relative;background:var(--ground)}
.stage-top{display:flex;align-items:center;gap:12px;height:52px;padding:0 20px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface) 70%,var(--ground));flex-shrink:0}
.stage-top .title{font-weight:650;font-size:14.5px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stage-top .facts{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);white-space:nowrap}
.stage-top .facts .dotsep{color:var(--faint)}
.stage-top .sp{flex:1}
.scroller{flex:1;overflow:auto;min-height:0}
.transcript{max-width:780px;margin:0 auto;padding:26px 28px 40px}

/* you */
.you-row{display:flex;justify-content:flex-end;margin:4px 0 22px}
.you{max-width:82%;background:var(--you);border:1px solid var(--you-line);border-radius:16px 16px 4px 16px;padding:10px 14px;box-shadow:var(--shadow-sm)}
.you .to{font-size:11.5px;color:var(--muted);margin-bottom:3px;display:flex;align-items:center;gap:6px}
.you .text{white-space:pre-wrap;overflow-wrap:anywhere}

/* an agent's turn */
.turn{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;margin:0 0 20px}
.turn .gutter{display:flex;flex-direction:column;align-items:center}
.turn .gutter .rail{flex:1;width:2px;background:var(--line-soft);margin-top:6px;border-radius:2px}
.turn-hd{display:flex;align-items:center;gap:8px;min-height:28px;flex-wrap:wrap}
.turn-hd .name{font-weight:650;font-size:13.5px}
.turn-hd .handle{font-family:var(--mono);font-size:11px;color:var(--faint)}
.chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:6px;background:var(--sunk);color:var(--muted);font-size:11px;font-family:var(--mono);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.turn-hd .meta{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--faint);white-space:nowrap;font-variant-numeric:tabular-nums}
.turn-hd .stop{opacity:0;transition:opacity .12s}
.turn:hover .turn-hd .stop,.turn-hd .stop.live{opacity:1}
.turn-body{margin-top:4px}
.brief{margin:2px 0 8px}
.brief summary{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;list-style:none;padding:3px 8px 3px 6px;border-radius:6px;background:var(--sunk)}
.brief summary::-webkit-details-marker{display:none}
.brief summary:hover{color:var(--ink)}
.brief .text{margin-top:8px;padding:10px 12px;border-left:2px solid var(--line);color:var(--ink-2);white-space:pre-wrap;font-size:13.5px}
.prose{white-space:pre-wrap;overflow-wrap:anywhere;margin:2px 0 10px;color:var(--ink)}
.prose code,.outcome code,.you code,.brief code{font-family:var(--mono);font-size:.88em;background:var(--sunk);padding:1px 5px;border-radius:5px}
.prose pre,.outcome pre{background:var(--sunk);border:1px solid var(--line-soft);border-radius:9px;padding:10px 12px;overflow:auto;font-family:var(--mono);font-size:12.5px;line-height:1.5;margin:8px 0;white-space:pre}

/* activity: grouped tool calls */
.trail{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 10px;font-size:12px;color:var(--faint)}
.trail .t{display:inline-flex;align-items:center;gap:5px;cursor:default}
.trail .t code{font-family:var(--mono);font-size:11.5px;background:none;padding:0;color:var(--muted)}
.prose.after{color:var(--muted);font-size:13px;border-left:2px solid var(--line-soft);padding-left:11px}
.activity{margin:2px 0 12px;border:1px solid var(--line-soft);border-radius:var(--r);background:var(--surface);overflow:hidden}
.activity > .sum{display:flex;align-items:center;gap:8px;width:100%;padding:8px 11px;font-size:12.5px;color:var(--muted);text-align:left}
.activity > .sum:hover{background:var(--hover);color:var(--ink)}
.activity > .sum .chev{transition:transform .15s;color:var(--faint)}
.activity.open > .sum .chev{transform:rotate(90deg)}
.activity > .sum b{color:var(--ink-2);font-weight:600}
.activity > .sum .labels{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.activity .steps{display:none;border-top:1px solid var(--line-soft);padding:4px 0}
.activity.open .steps{display:block}
.step{display:flex;align-items:center;gap:9px;padding:5px 12px;font-size:12.5px;color:var(--ink-2);cursor:pointer;min-width:0}
.step:hover{background:var(--hover)}
.step .ico{color:var(--muted)}
.step .lbl{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.step .lbl code{font-family:var(--mono);font-size:12px;color:var(--muted);background:none;padding:0}
.step.quiet{color:var(--muted)}
.step.quiet .ico{color:var(--faint)}
.step.now .lbl{font-weight:550}
.step-json{display:none;margin:0 12px 6px 37px;background:var(--sunk);border-radius:8px;padding:8px 10px;font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink-2);max-height:220px;overflow:auto}
.step.open + .step-json{display:block}

/* hand-off */
.handoff{display:flex;align-items:center;gap:8px;margin:4px 0 10px;font-size:12.5px;color:var(--muted)}
.handoff .baton{display:flex;align-items:center;gap:4px;color:var(--faint)}
.handoff b{color:var(--ink-2);font-weight:600}
.nested{position:relative;margin:0 0 14px;padding:14px 14px 2px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--shadow-sm)}
.nested .turn{margin-bottom:12px}
.nested .nested{background:var(--raised)}

/* notices, outcome, working */
.notice{display:flex;align-items:flex-start;gap:8px;margin:2px 0 10px;padding:8px 11px;border-radius:9px;font-size:12.5px;background:var(--sunk);color:var(--ink-2)}
.notice.bad{background:var(--bad-soft);color:var(--bad)}
.notice.warn{background:var(--warn-soft);color:var(--warn)}
.outcome{margin:4px 0 8px;border-radius:var(--r);border:1px solid color-mix(in srgb,var(--ok) 28%,var(--line));background:color-mix(in srgb,var(--ok-soft) 55%,var(--surface));overflow:hidden}
.outcome.failed{border-color:color-mix(in srgb,var(--bad) 30%,var(--line));background:color-mix(in srgb,var(--bad-soft) 60%,var(--surface))}
.outcome .oh{display:flex;align-items:center;gap:7px;padding:8px 12px 0;font-size:11.5px;font-weight:650;color:var(--ok);text-transform:uppercase;letter-spacing:.05em}
.outcome.failed .oh{color:var(--bad)}
.outcome .oh .sp{flex:1}
.outcome .ob{padding:4px 12px 10px;white-space:pre-wrap;overflow-wrap:anywhere}
.receipts{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 11px}
.receipt{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:7px;background:var(--surface);border:1px solid var(--line);font-size:12px;color:var(--ink-2)}
.receipt:hover{border-color:var(--accent);color:var(--accent)}
.receipt .k{font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em}
.working-row{display:flex;align-items:center;gap:10px;margin:2px 0 8px;font-size:13px;padding:8px 11px;border-radius:9px;background:var(--surface);border:1px dashed var(--line)}
.working-row .since{margin-left:auto;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}

.jump{position:absolute;left:50%;bottom:132px;transform:translateX(-50%);z-index:4;box-shadow:var(--shadow)}

/* composer */
.dock{padding:0 28px 18px;flex-shrink:0}
.composer{max-width:780px;margin:0 auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);transition:border-color .12s,box-shadow .12s;position:relative}
.composer:focus-within{border-color:color-mix(in srgb,var(--accent) 60%,var(--line));box-shadow:var(--shadow),0 0 0 4px var(--accent-soft)}
.composer textarea{display:block;width:100%;border:0;background:transparent;resize:none;padding:13px 16px 4px;min-height:48px;max-height:220px;line-height:1.55;font-size:14.5px;outline:none}
.composer .row{display:flex;align-items:center;gap:8px;padding:6px 8px 8px 10px}
.target{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 8px 0 4px;border-radius:9px;border:1px solid var(--line);font-size:12.5px;color:var(--ink-2);background:var(--raised)}
.target:hover{border-color:var(--faint)}
.target .ico{color:var(--faint)}
.composer .hint{font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.composer .hint.err{color:var(--bad)}
.composer .sp{flex:1}
.folder-chip b{max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.folder-chip:disabled{cursor:default;opacity:.85}
.folder-chip:disabled:hover{border-color:var(--line)}
.folder-pop{min-width:360px}
.folder-pop .opt .who span{max-width:280px}
.folder-tag{font-family:var(--sans);gap:5px;color:var(--ink-2)}
.where{display:inline-flex;align-items:center;gap:7px;margin:-10px auto 22px;padding:6px 10px;border-radius:9px;border:1px solid var(--line);background:var(--surface);font-size:12.5px;color:var(--muted);max-width:100%}
.where:hover{border-color:var(--faint);color:var(--ink)}
.where b{color:var(--ink)}
.where .path{font-family:var(--mono);font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.send{width:34px;height:34px;border-radius:10px;background:var(--ink);color:var(--surface);display:grid;place-items:center;transition:opacity .12s,transform .08s}
.send:hover{opacity:.88}
.send:active{transform:scale(.96)}
.send:disabled{opacity:.3;cursor:default}
.popover{position:absolute;z-index:30;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;min-width:250px}
.popover .opt{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:13px}
.popover .opt:hover,.popover .opt.hi{background:var(--hover)}
.popover .opt .who{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.popover .opt .who b{font-weight:600;font-size:13px}
.popover .opt .who span{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.popover{min-width:320px}
.popover .opt .sub{font-size:11.5px;color:var(--muted);margin-left:auto;white-space:nowrap}
.popover .ttl{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;padding:6px 8px 4px;font-weight:600}

/* empty stage */
.hello{max-width:620px;margin:0 auto;padding:9vh 28px 20px;text-align:center}
.hello .crew-row{display:flex;justify-content:center;margin-bottom:18px}
.hello .crew-row .av{margin:0 -4px;box-shadow:0 0 0 3px var(--ground)}
.hello h1{font-size:25px;letter-spacing:-.025em;margin:0 0 8px;font-weight:700;text-wrap:balance}
.hello p{color:var(--muted);margin:0 auto 26px;max-width:470px;text-wrap:balance}
.starters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;text-align:left}
.starter{padding:12px 13px;border-radius:12px;border:1px solid var(--line);background:var(--surface);cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s}
.starter:hover{border-color:var(--faint);box-shadow:var(--shadow);transform:translateY(-1px)}
.starter .k{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin-bottom:5px}
.starter .v{font-size:13px;color:var(--ink-2);line-height:1.45}

/* crew panel */
.crew{background:var(--surface);border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0;overflow:hidden}
.crew .hd{display:flex;align-items:center;gap:8px;height:52px;padding:0 12px 0 16px;border-bottom:1px solid var(--line);flex-shrink:0}
.crew .hd b{font-size:13.5px}
.crew .hd .sub{font-size:12px;color:var(--muted)}
.crew .members{overflow:auto;flex:1;padding:10px}
.member{padding:10px;border-radius:12px;border:1px solid transparent;margin-bottom:4px;transition:background .12s,border-color .12s}
.member:hover{background:var(--hover)}
.member.working{border-color:color-mix(in srgb,var(--tally) 25%,var(--line));background:color-mix(in srgb,var(--tally) 4%,var(--surface))}
.member .top{display:flex;align-items:center;gap:10px;min-width:0}
.member .top .pill{flex-shrink:0}
.crew .members{overflow-x:hidden}
.member .who{min-width:0;flex:1}
.member .who b{display:block;font-size:13px;line-height:1.3}
.member .who span{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.member .desc{margin:6px 0 0 38px;font-size:12px;color:var(--muted);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.member .doing{margin:8px 0 0 38px;font-size:12px;color:var(--ink-2);display:flex;align-items:center;gap:6px;min-width:0}
.member .doing .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;cursor:pointer}
.member .doing .t:hover{color:var(--accent)}
.member .doing .since{color:var(--muted);font-variant-numeric:tabular-nums}
.member .acts{display:flex;gap:4px;margin:8px 0 0 38px}
.crew .foot{border-top:1px solid var(--line);padding:12px 16px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat .n{font-size:15px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.stat .l{font-size:11px;color:var(--muted)}

/* ---------- board ---------- */
.board{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.board-top{display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap}
.board-top .search{width:240px}
.filters{display:flex;gap:6px;flex-wrap:wrap}
.filter{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 4px;border-radius:9px;border:1px solid var(--line);font-size:12.5px;color:var(--ink-2);background:var(--surface)}
.filter:hover{border-color:var(--faint)}
.filter.on{border-color:var(--ink);background:var(--ink);color:var(--surface)}
.filter.on .av{box-shadow:0 0 0 1.5px var(--surface)}
.board-top .sp{flex:1}
.board-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;flex:1;min-height:0}
.board-body.no-bb{grid-template-columns:minmax(0,1fr) 0}
.lanes{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:14px;padding:16px 20px;overflow:auto;min-height:0;align-items:start}
.lane{display:flex;flex-direction:column;min-height:0;background:color-mix(in srgb,var(--sunk) 55%,var(--ground));border-radius:var(--r-lg);padding:8px}
.lane-hd{display:flex;align-items:center;gap:8px;padding:4px 6px 10px;font-size:12.5px;font-weight:650;color:var(--ink-2)}
.lane-hd .n{font-size:11px;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--surface);display:grid;place-items:center;color:var(--muted);font-weight:600}
.lane-hd .lamp{width:8px;height:8px;border-radius:50%}
.lane .cards{display:flex;flex-direction:column;gap:8px}
.card{background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--r);padding:10px 11px;cursor:pointer;box-shadow:var(--shadow-sm);transition:border-color .12s,box-shadow .12s,transform .12s}
.card:hover{border-color:var(--line);box-shadow:var(--shadow);transform:translateY(-1px)}
.card.sel{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.card .ct{font-size:13px;font-weight:550;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:8px}
.card .cm{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);white-space:nowrap}
.card .cm .route{overflow:hidden;text-overflow:ellipsis;min-width:0}
.card .cm .sp{flex:1}
.card .ftag{display:inline-flex;align-items:center;gap:3px;color:var(--faint);max-width:110px;overflow:hidden;text-overflow:ellipsis}
.folder-filter{width:auto;max-width:220px;height:30px}
.card .reason{margin-top:7px;font-size:11.5px;color:var(--bad);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lane .none{font-size:12px;color:var(--faint);text-align:center;padding:18px 6px;border:1px dashed var(--line);border-radius:var(--r)}
.bb{border-left:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;min-height:0;overflow:hidden}
.bb .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}
.bb .hd b{font-size:13px}
.bb .items{overflow:auto;flex:1;padding:6px}
.kv{padding:8px 9px;border-radius:9px;cursor:pointer}
.kv:hover{background:var(--hover)}
.kv .k{font-family:var(--mono);font-size:12px;color:var(--accent);display:flex;gap:6px;align-items:center}
.kv .k .by{margin-left:auto;font-family:var(--sans);font-size:11px;color:var(--faint)}
.kv .v{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.bb form{border-top:1px solid var(--line);padding:10px;display:flex;flex-direction:column;gap:7px}

/* drawer & modal */
.scrim{position:fixed;inset:0;background:rgba(10,12,16,.28);z-index:40;opacity:0;pointer-events:none;transition:opacity .15s}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,94vw);background:var(--surface);border-left:1px solid var(--line);box-shadow:var(--shadow-lg);z-index:41;display:flex;flex-direction:column;transform:translateX(102%);transition:transform .2s ease}
.drawer.on{transform:none}
.drawer .dh{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}
.drawer .dh .ttl{font-weight:650;font-size:15px;line-height:1.35;letter-spacing:-.01em}
.drawer .dh .sub{font-size:12px;color:var(--muted);margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.drawer .db{overflow:auto;flex:1;padding:16px 18px}
.drawer .df{border-top:1px solid var(--line);padding:12px 18px;display:flex;gap:8px;flex-wrap:wrap}
.dl{font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 6px}
.dl:first-child{margin-top:0}
.dbox{background:var(--raised);border:1px solid var(--line-soft);border-radius:var(--r);padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;max-height:260px;overflow:auto}
.dbox.mono{font-family:var(--mono);font-size:12px;background:var(--sunk)}
.facts-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.fact{background:var(--raised);border:1px solid var(--line-soft);border-radius:9px;padding:8px 10px}
.fact.wide{grid-column:1 / -1}
.cost{cursor:help;text-decoration:underline dotted color-mix(in srgb,var(--faint) 70%,transparent);text-underline-offset:3px}
.stat.cost{text-decoration:none}
.nodata{color:var(--faint);cursor:help}
.tokbar{margin-top:10px;background:var(--raised);border:1px solid var(--line-soft);border-radius:9px;padding:10px 12px}
.tokbar .bar{display:flex;height:8px;border-radius:4px;overflow:hidden;gap:2px;background:var(--sunk)}
.tokbar .bar span{min-width:3px}
.seg-read,.sw.read{background:color-mix(in srgb,var(--accent) 35%,var(--sunk))}
.seg-write,.sw.write{background:var(--warn)}
.seg-fresh,.sw.fresh{background:var(--accent)}
.seg-out,.sw.out{background:var(--ok)}
.tokbar .keys{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:11.5px;color:var(--muted)}
.tokbar .k{display:inline-flex;align-items:center;gap:5px}
.tokbar .k b{color:var(--ink);font-weight:600}
.sw{display:inline-block;width:8px;height:8px;border-radius:2px}
.costnote{display:flex;gap:7px;align-items:flex-start;margin:10px 0 0;font-size:12px;color:var(--muted);line-height:1.5}
.costnote .ico{color:var(--faint);margin-top:2px;flex-shrink:0}
.fact .l{font-size:11px;color:var(--muted)}
.fact .v{font-size:13px;font-weight:550;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.modal{position:fixed;left:50%;top:14vh;transform:translate(-50%,-8px) scale(.98);width:min(560px,94vw);background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-lg);z-index:42;opacity:0;pointer-events:none;transition:opacity .14s,transform .14s}
.modal.on{opacity:1;pointer-events:auto;transform:translate(-50%,0) scale(1)}
.modal .mh{padding:16px 18px 4px;font-weight:650;font-size:15px}
.modal .mb{padding:10px 18px;display:flex;flex-direction:column;gap:10px}
.modal .mf{padding:10px 18px 16px;display:flex;justify-content:flex-end;gap:8px}
.dialog{top:22vh;width:min(460px,92vw)}
.dlg-body{display:flex;gap:14px;padding:20px 20px 8px}
.dlg-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex-shrink:0}
.dlg-icon.danger{background:var(--bad-soft);color:var(--bad)}
.dlg-text{min-width:0;flex:1}
.dlg-title{font-weight:650;font-size:15.5px;letter-spacing:-.01em;margin:6px 0 6px}
.dlg-msg{font-size:13.5px;color:var(--ink-2);line-height:1.55}
.dlg-msg p{margin:0 0 6px;overflow-wrap:anywhere}
.dlg-warn{display:flex;gap:6px;align-items:flex-start;color:var(--warn);font-size:13px}
.dlg-warn .ico{margin-top:2px}
.dialog #dlg-input{margin-top:10px}
.btn.danger-solid{background:var(--bad);color:#fff}
.btn.danger-solid:hover{filter:brightness(1.07)}
.more{display:flex;align-items:center;gap:6px;width:calc(100% - 8px);margin:2px 0 8px 4px;padding:6px 10px;border-radius:8px;font-size:12px;color:var(--muted);text-align:left}
.more:hover{background:var(--hover);color:var(--ink)}
.more .up{transform:rotate(-90deg)}
.bb-scope{margin-left:auto;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--muted);max-width:140px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.kv .kf{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--faint);margin-top:2px}
.bb-form-folder{font-size:11.5px;color:var(--muted)}
.pill.budget{display:inline-flex;align-items:center;gap:5px;background:var(--surface-2,transparent);border:1px solid var(--line);color:var(--ink-2)}
.pill.budget.hot{border-color:var(--warn);color:var(--warn);background:var(--warn-soft)}
.model-row{display:flex;gap:8px;align-items:center;min-width:0}
.model-row select{flex:1;min-width:0}
.alias-note{font-size:12px;font-family:var(--mono);opacity:.8}
.budget-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 16px}
.bfield{display:flex;flex-direction:column;gap:6px;min-width:0}
.bfield label{font-size:12px;color:var(--ink-2)}
.budget-note{margin:12px 0 0;font-size:12.5px}
@media (max-width:600px){.budget-row{grid-template-columns:minmax(0,1fr)}}
.av.flow{background:var(--ink);color:var(--surface)}
.av.flow .ico{stroke:var(--surface)}
.popover .opt.off{opacity:.5;cursor:not-allowed}
.notice.gate.pass{background:var(--ok-soft);color:var(--ok)}
.notice.gate.retry{background:var(--warn-soft);color:var(--warn)}
.notice.gate.stop{background:var(--bad-soft);color:var(--bad)}
.flowmap{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:4px 0 12px;padding:8px 10px;border:1px dashed var(--line);border-radius:10px;font-size:12px;color:var(--ink-2)}
.flowmap .fs{display:inline-flex;align-items:center;gap:5px}
.flowmap > .ico{color:var(--faint)}
.notice.guard{background:var(--warn-soft);color:var(--warn)}
.notice.guard code{font-family:var(--mono);font-size:11.5px;background:none;padding:0;overflow-wrap:anywhere}
.tiles{grid-template-columns:repeat(3,1fr)!important}
.browse{top:10vh;width:min(640px,94vw);display:flex;flex-direction:column;max-height:78vh}
.browse-bar{display:flex;gap:6px;padding:6px 18px 10px}
.browse-bar .field{height:32px;font-size:12.5px}
.browse-list{overflow:auto;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px;min-height:220px;flex:1}
.bitem{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;cursor:pointer;font-size:13px}
.bitem:hover{background:var(--hover)}
.bitem span:first-of-type{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bitem .ico{color:var(--muted)}
.bitem .ico:last-child{color:var(--faint)}
.pbadge{font-size:10.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:1px 7px;border-radius:999px;flex:0 0 auto!important}
.bempty{padding:30px;text-align:center;color:var(--muted);font-size:12.5px}
.bempty.err{color:var(--bad)}
.browse .mf{align-items:center}
.browse-here{display:flex;align-items:center;gap:6px;margin-right:auto;font-size:12.5px;color:var(--muted);min-width:0}
.browse-here b{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.palette{top:12vh;width:min(600px,94vw);overflow:hidden}
.palette input{width:100%;border:0;border-bottom:1px solid var(--line);background:transparent;height:52px;padding:0 18px;font-size:15px;outline:none}
.palette .results{max-height:52vh;overflow:auto;padding:6px}
.palette .opt{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:13.5px}
.palette .opt.hi{background:var(--hover)}
.palette .opt .sub{margin-left:auto;font-size:12px;color:var(--muted);white-space:nowrap}
.palette .foot{display:flex;gap:14px;padding:9px 14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}

/* toast */
.toasts{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.toast{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:10px;background:var(--ink);color:var(--surface);font-size:13px;box-shadow:var(--shadow-lg);animation:rise .18s ease}
.toast.bad{background:var(--bad);color:#fff}
@keyframes rise{from{opacity:0;transform:translateY(6px)}}

/* ---------- guide ---------- */
.guide{flex:1;overflow:auto;min-height:0;scroll-behavior:smooth}
html[lang="vi"] .guide-doc[data-lang="en"],html:not([lang="vi"]) .guide-doc[data-lang="vi"]{display:none}
.guide-doc{display:grid;grid-template-columns:220px minmax(0,1fr);gap:40px;max-width:1180px;margin:0 auto;padding:34px 32px 80px}
.gtoc{position:sticky;top:24px;align-self:start;display:flex;flex-direction:column;gap:2px;font-size:13px}
.gtoc-title{font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px 10px}
.gtoc a{color:var(--muted);padding:6px 10px;border-radius:7px;border-left:2px solid transparent}
.gtoc a:hover{color:var(--ink);background:var(--hover)}
.garticle{max-width:860px;min-width:0}
.ghead{margin-bottom:10px}
.eyebrow{font-size:11.5px;font-weight:650;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.ghead h1{font-size:30px;letter-spacing:-.03em;line-height:1.15;margin:0 0 10px;text-wrap:balance}
.glead{font-size:15.5px;color:var(--muted);margin:0;max-width:62ch}
.gsec{padding:34px 0 6px;border-top:1px solid var(--line-soft);margin-top:30px;scroll-margin-top:16px}
.gsec h2{font-size:20px;letter-spacing:-.02em;margin:0 0 12px}
.gsec p{max-width:68ch;margin:0 0 12px;line-height:1.65;color:var(--ink-2)}
.gsec p code,.gsec li code,.gsec td code{font-family:var(--mono);font-size:.86em;background:var(--sunk);padding:1px 5px;border-radius:5px}
.gsec figure{margin:18px 0 18px;padding:18px 18px 14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);overflow-x:auto}
.gsec figcaption{font-size:13px;color:var(--muted);margin-top:12px;max-width:72ch;line-height:1.55}
.gsec ul,.gsec ol{padding-left:0;list-style:none;margin:12px 0;display:flex;flex-direction:column;gap:9px;max-width:72ch}
.gsec li{line-height:1.55;color:var(--ink-2)}
.facts li{padding-left:16px;position:relative}
.facts li:before{content:"";position:absolute;left:2px;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--faint)}
.states li{display:flex;gap:10px;align-items:baseline}
.states .pill{flex-shrink:0;min-width:84px;justify-content:center}
.legend{counter-reset:leg}
.legend li{counter-increment:leg;padding-left:34px;position:relative}
.legend li:before{content:counter(leg);position:absolute;left:0;top:0;width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700;display:grid;place-items:center}
.steps{counter-reset:st}
.steps li{counter-increment:st;padding-left:40px;position:relative}
.steps li:before{content:counter(st);position:absolute;left:0;top:-1px;width:26px;height:26px;border-radius:8px;background:var(--ink);color:var(--surface);font-size:13px;font-weight:700;display:grid;place-items:center}
.cmd{display:flex;align-items:center;gap:8px;margin:8px 0 2px;background:var(--sunk);border-radius:9px;padding:6px 6px 6px 12px;max-width:520px}
.cmd code{flex:1;font-family:var(--mono);font-size:13px;background:none!important;padding:0!important;color:var(--ink)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface)}
.gtable{border-collapse:collapse;width:100%;font-size:13px}
.gtable th{text-align:left;font-size:11.5px;font-weight:650;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--raised)}
.gtable td{padding:10px 14px;border-bottom:1px solid var(--line-soft);vertical-align:top;color:var(--ink-2);line-height:1.5}
.gtable tr:last-child td{border-bottom:0}
.gtable td:first-child{color:var(--ink);font-weight:550}
.gcrew{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin-top:14px}
.gmember{display:flex;gap:12px;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg)}
.gm-body{min-width:0}
.gm-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.gm-top b{font-size:14px}
.gm-top .handle{font-family:var(--mono);font-size:11.5px;color:var(--faint)}
.gmember p{font-size:12.5px;color:var(--muted);margin:4px 0 8px;line-height:1.5}
.gm-meta{display:flex;gap:5px;flex-wrap:wrap}
/* diagrams: theme colours through the app's variables */
.dg{display:block;width:100%;min-width:640px;height:auto;font-family:var(--sans)}
.dg .box{fill:var(--surface);stroke:var(--line);stroke-width:1.3}
.dg .hubbox{fill:var(--raised);stroke:var(--ink-2);stroke-width:1.4}
.dg .inner{fill:var(--sunk);stroke:var(--line-soft)}
.dg .livebox{stroke:var(--tally);stroke-width:1.6}
.dg .okbox{fill:var(--ok-soft);stroke:color-mix(in srgb,var(--ok) 35%,var(--line))}
.dg .bubble{fill:var(--you);stroke:var(--you-line)}
.dg .skel{fill:color-mix(in srgb,var(--muted) 38%,transparent)}
.dg .skel.soft{fill:color-mix(in srgb,var(--muted) 20%,transparent)}
.dg .sep{stroke:var(--line);stroke-width:1}
.dg .t{fill:var(--ink);font-size:13.5px;font-weight:600}
.dg .t.lg{font-size:15px;font-weight:700}
.dg .s{fill:var(--muted);font-size:11.5px}
.dg .s.strong{fill:var(--ink-2);font-size:12.5px;font-weight:550}
.dg .lbl{fill:var(--muted);font-size:11.5px}
.dg .lbl.acc{fill:var(--accent);font-weight:600}
.dg .ln{stroke:var(--muted);stroke-width:1.5;fill:none}
.dg .ln.acc{stroke:var(--accent)}
.dg .ln.ok{stroke:var(--ok)}
.dg .ln.bad{stroke:var(--bad)}
.dg .ln.dash{stroke-dasharray:5 4}
.dg .life{stroke:var(--line);stroke-width:1.2;stroke-dasharray:4 4}
.dg .act{fill:var(--accent-soft);stroke:var(--accent)}
.dg .mk{fill:var(--muted)}
.dg .mk.acc{fill:var(--accent)}
.dg .mk.ok{fill:var(--ok)}
.dg .mk.bad{fill:var(--bad)}
.dg .pillbox{stroke-width:1.4}
.dg .pillbox.neutral{fill:var(--surface);stroke:var(--line)}
.dg .pillbox.warn{fill:var(--warn-soft);stroke:var(--warn)}
.dg .pillbox.live{fill:color-mix(in srgb,var(--tally) 10%,var(--surface));stroke:var(--tally)}
.dg .pillbox.ok{fill:var(--ok-soft);stroke:var(--ok)}
.dg .pillbox.bad{fill:var(--bad-soft);stroke:var(--bad)}
.dg .pillbox.muted{fill:var(--sunk);stroke:var(--faint)}
.dg .callout{fill:var(--accent)}
.dg .callnum{fill:var(--accent-ink);font-size:12px;font-weight:700}
@media (max-width:980px){.guide-doc{grid-template-columns:1fr;gap:10px;padding:22px 18px 60px}.gtoc{position:static;flex-direction:row;flex-wrap:wrap}}

/* ---------- settings ---------- */
.settings{flex:1;overflow:auto;min-height:0}
.settings .inner{max-width:920px;margin:0 auto;padding:28px 28px 60px}
.settings h1{font-size:22px;letter-spacing:-.02em;margin:0 0 4px}
.settings .lead{color:var(--muted);margin:0 0 26px}
.section{margin:0 0 30px}
.section-hd{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.section-hd h2{font-size:15px;margin:0;letter-spacing:-.01em}
.section-hd p{margin:0;color:var(--muted);font-size:12.5px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-sm)}
.panel.pad{padding:16px 18px}
.roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:12px}
.agent-card{padding:16px 18px;display:flex;flex-direction:column;gap:14px}
.agent-card .ah{display:flex;align-items:center;gap:12px}
.agent-card .ah .who{min-width:0;flex:1}
.agent-card .ah b{font-size:15px;letter-spacing:-.01em}
.agent-card .ah .who span{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.agent-card .ctl{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px 12px;align-items:center}
.agent-card .ctl label{font-size:12.5px;color:var(--muted)}
.agent-card .saved{font-size:11.5px;color:var(--ok);opacity:0;transition:opacity .2s}
.agent-card .saved.on{opacity:1}
.bill{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.bill > .ico{margin-top:2px}
.bill.sub > .ico{color:var(--ok)}
.bill.api > .ico{color:var(--bad)}
.bill > div{flex:1;min-width:240px}
.bill b{display:block;font-size:13.5px;font-weight:600}
.bill span{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;line-height:1.5}
.bill.api b{color:var(--bad)}
.chk-row{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2);flex-basis:100%;margin-top:6px;cursor:pointer}
.setting-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.setting-row p{margin:0;font-size:12.5px;flex:1;min-width:240px}
.explain{margin-bottom:12px}
.explain-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 20px}
@media (max-width:1100px){.explain-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.agent-card .ctl label.top-align{align-self:start;padding-top:8px}
.agent-card textarea.field{resize:vertical;min-height:62px;font-size:13px}
.ex{display:flex;gap:10px;align-items:flex-start}
.ex .ico{color:var(--accent);margin-top:2px}
.ex b{display:block;font-size:13px;font-weight:600;margin-bottom:2px}
.ex span{display:block;font-size:12px;color:var(--muted);line-height:1.5}
.auto-row{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)}
.role-brief{border-top:1px solid var(--line-soft);padding-top:10px}
.role-brief summary{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink-2);cursor:pointer;list-style:none}
.role-brief summary::-webkit-details-marker{display:none}
.role-brief summary:hover{color:var(--accent)}
.role-brief summary code{font-family:var(--mono);font-size:11px;color:var(--faint);margin-left:auto}
.role-text{margin:10px 0 0;background:var(--sunk);border-radius:9px;padding:10px 12px;font-family:var(--mono);font-size:12px;white-space:pre-wrap;color:var(--ink-2);max-height:280px;overflow:auto}
.no-brief{margin:0;font-size:12px;border-top:1px solid var(--line-soft);padding-top:10px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.tile{padding:13px 14px}
.tile .n{font-size:20px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile .l{font-size:12px;color:var(--muted);margin-top:2px}
.note{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line-soft);font-size:12.5px;color:var(--muted)}
.note:first-child{border-top:0;padding-top:0}
.note b{color:var(--ink);font-weight:600;min-width:92px}
.snippet{position:relative;background:var(--sunk);border-radius:var(--r);padding:12px 14px;font-family:var(--mono);font-size:12px;white-space:pre;overflow:auto;color:var(--ink-2)}
.snippet .btn{position:absolute;top:8px;right:8px}

/* ---------- responsive ---------- */
@media (max-width:1180px){.chat{grid-template-columns:260px minmax(0,1fr) 0}.crew{display:none}.board-body{grid-template-columns:minmax(0,1fr) 0}.bb{display:none}}
@media (max-width:860px){.chat{grid-template-columns:minmax(0,1fr)}.side{display:none}.cmdk span,.cmdk kbd{display:none}.cmdk{min-width:0}.lanes{grid-template-columns:repeat(4,260px)}.tiles{grid-template-columns:repeat(2,1fr)}.roster{grid-template-columns:1fr}.brand .proj,.brand .sep{display:none}}
`;
