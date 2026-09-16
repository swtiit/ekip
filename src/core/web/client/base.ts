/**
 * Foundations every view uses: helpers, icons, the EN/VI dictionary, formatting, app state, the router, data loading and the render shell.
 *
 * Part of the web client (see ../client.ts): a String.raw template sharing one
 * function scope with the other parts. No backticks or dollar-brace inside.
 */
export const BASE = String.raw`
/* ================= basics ================= */
var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function post(path, body){ return fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(function(r){ if (r.status === 401) askToken(); return r.json(); }); }
/* A hub with a token answers 401 until this browser signs in once; the cookie it
   sets then covers every request, including the live event stream. */
var asking = false;
function askToken(){
  if (asking || typeof dialog !== 'function') return;
  asking = true;
  // Not signed in yet, so /api/state says nothing: /health still tells us which
  // language to ask in. Settle that before the dialog goes up.
  if (!S.state && !S.askedLang) {
    S.askedLang = true;
    fetch('/health').then(function(r){ return r.json(); }).then(function(h){
      var lang = pickLang(h && h.language);
      if (lang !== LANG) { LANG = lang; applyStaticText(); }
    }).catch(function(){}).then(function(){ asking = false; askToken(); });
    return;
  }
  dialog({ title: T('tokenTitle'), message: T('tokenBody'), input: true, placeholder: 'EKIP_TOKEN', ok: T('signIn'), icon: 'plug' }).then(function(tok){
    if (!tok) { asking = false; return; }
    fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token: tok }) }).then(function(r){
      asking = false;
      if (r.ok) location.reload(); else { toast(T('tokenWrong'), true); askToken(); }
    });
  });
}
function isEnter(e){ return e.key === 'Enter' || e.key === 'Return' || e.keyCode === 13; }
function isDone(s){ return s === 'done' || s === 'failed' || s === 'cancelled'; }
function shortId(id){ return String(id || '').slice(0, 8); }
function base(p){ var s = String(p || '').split('?')[0].replace(/\/+$/, ''); return s.slice(s.lastIndexOf('/') + 1) || s; }
function hashHue(name){ var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return (h % 12) * 30 + 8; }

var ICONS = {
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  settings:'<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  send:'<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  pencil:'<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  terminal:'<path d="M4 17l6-5-6-5M12 19h8"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  handoff:'<path d="M4 12h15M13 6l6 6-6 6"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  alert:'<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  chev:'<path d="M9 6l6 6-6 6"/>',
  down:'<path d="M6 9l6 6 6-6"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.5"/>',
  log:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  open:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  blackboard:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  at:'<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
  panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  plug:'<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>',
  gauge:'<path d="M12 14l4-4M4.5 18a9 9 0 1 1 15 0"/>',
  note:'<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 13h5"/>',
  refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'
};
function icon(name, cls){ return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.tool) + '</svg>'; }

/* ================= language ================= */
var DICT = {
  en: {
    checkModel:'Check', checkModelTip:'Claude has no list of models — checking one means running a tiny task with it', checkBody:'Claude Code cannot list its models, so ekip runs one very small task with this id. It costs a fraction of a run (more on Opus). You will see the id it really resolves to.', checkRun:'Run the check', checking:'Checking…', checkPickFirst:'Pick a model first', checkOk:'Works → {m}{c}', checkNo:'No: {e}',
    runsN:'{n} runs', bRunsU:'runs', bMinU:'min', budgetTitle:'Budget for this request: the hub stops it when a limit is reached', budget:'Budget per request', budgetS:'Each message you send, flow you run, or top-level delegation may spend at most this much. When a limit is reached the hub starts nothing more for it; a time limit also stops work in flight. 0 = no limit.', bRuns:'Worker runs', bTokens:'Output tokens', bMinutes:'Minutes', noLimit:'No limit',
    flows:'Flows', flowCantRun:'can’t run here', gatePass:'Gate passed: {s} — {d}', gateRetry:'Not yet: {s} — {d}. Back to {g} (round {r}/{n})', gateStop:'Stopped at {s} — {d}. No rounds left.',
    tokenTitle:'This hub needs a token', tokenBody:'Run "ekip token" where the hub runs and paste the first one (yours). "ekip ui" opens the app already signed in. This browser remembers it.', signIn:'Sign in', tokenWrong:'That token is not right',
    billing:'How Claude is billed', runTime:'run time today', runTimeTitle:'Total time agents spent running today.', turnsL:'Turns',
    billSub:'Claude {plan} subscription — not billed per token', billUnknown:'Could not tell how Claude is signed in', billSubS:'Runs use your plan’s usage limits. Heavier models (Opus) use them up faster than lighter ones (Sonnet, Haiku).',
    billApi:'Claude is billed through an API key — real money per token', billApiKey:'An API key is set in the hub’s environment — every run is billed per token', billApiS:'Spawned agents use the key instead of your subscription. Costs are shown everywhere.',
    showRef:'Show API-price reference (USD) to compare how heavy runs are',
    ok:'OK', save:'Save', delete:'Delete', deleteTitle:'Delete this conversation?', deleteBody:'Its {n} task(s), transcript and logs will be removed for good. This cannot be undone.', stopAndDelete:'Stop and delete', stopTitle:'Stop this work?',
    showMore:'Show {n} more', showLess:'Show less', allFolders:'All folders', bbWritesTo:'Writes to the {f} blackboard',
    lWorkersTotal:'workers across all folders', lGuard:'keep agents inside their folder', on:'On', off:'Off',
    guardBlocked:'Blocked — outside this conversation’s folder:',
    tokOut:'tokens out', tokOutL:'Tokens written', tokRead:'read from cache', tokWrite:'written to cache', tokFresh:'fresh input', costRef:'at API prices',
    outTokTitle:'Tokens the model wrote. Input — mostly cache reads — is broken down per task in Board.',
    tokBarTitle:'Where this run’s tokens went. Cache reads cost a tenth of fresh input; cache writes cost more than fresh input.',
    costNote:'Claude Code’s own figure, at Anthropic’s API list prices for the tokens this run used.',
    costNoteSub:'Claude Code’s own figure at API list prices. You are signed in with a Claude subscription, so this is a reference value: runs count against your plan’s usage limits instead of being billed per token.',
    missingTitle:'No cost data: Gemini (Antigravity) does not report usage, and a run that was stopped or crashed never sends its final tally.',
    missingN:'{n} without data', noData:'no data', awaiting:'tallying…', awaitingTitle:'The work is done; Claude Code sends the final token and cost tally when its process exits, usually within two minutes.',
    deleteChat:'Delete conversation', confirmDelete:'Delete “{t}”?\n\nIts {n} task(s), transcript and logs go for good.', confirmDeleteLive:'{n} of them are still running and will be stopped first.', deleted:'Conversation deleted',
    folder:'Folder', newIn:'New conversation in this folder', noChatsHere:'No conversations here yet', workIn:'Work in', workingIn:'Working in', browseOther:'Choose another folder…', browseOtherS:'Browse your disk', pickFolder:'Choose a folder to work in', useFolder:'Use this folder', projectBadge:'project', noSubfolders:'No sub-folders here', folderSet:'Now working in {f}', folderLocked:'a conversation keeps its folder', allFolders:'All folders', startIn:'Start in',
    chat:'Chat', board:'Board', guide:'Guide', noJob:'No job description yet — add one in Settings.', guideLink:'New here? Read the guide', settings:'Settings', search:'Search chats, agents, actions', newChat:'New conversation', filter:'Filter conversations',
    live:'Running', today:'Today', earlier:'Earlier', working:'working', queued:'queued', idle:'idle', done:'done', failed:'failed', cancelled:'stopped', pending:'queued', claimed:'working',
    stop:'Stop', message:'Message', crew:'Crew', helloT:'Put your crew to work', helloS:'Pick who gets it and say what you need. You will see what each agent says, the tools it runs, who it hands work to, and what it costs.',
    ph:'Ask the crew…  (@ to pick who)', hintEnter:'Enter to send · Shift+Enter for a new line', hintReply:'Replying in this conversation', to:'To',
    steps:'steps', step:'step', result:'Result', failedT:'Failed', brief:'Brief from', hands:'hands to', isWorking:'is working', starting:'is starting', waitingSlot:'is waiting for a free slot', lost:'lost its worker (the hub restarted)',
    jump:'Jump to latest', nfT:'Conversation not found', nfS:'It may have been pruned by retention, or the link belongs to another project’s hub.',
    runs:'runs', runsToday:'runs today', cost:'cost', tokens:'tokens', laneQ:'Queued', laneW:'Working', laneD:'Done', laneF:'Failed & stopped', newTask:'New task', blackboard:'Blackboard', none:'Nothing here',
    openChat:'Open conversation', viewLog:'View log', prompt:'Request', copyId:'Copy id', title:'Title', optional:'optional', whatToDo:'What should this agent do?', cancel:'Cancel', send:'Send', setKey:'Set key',
    key:'key, e.g. plan.v1', value:'value (JSON or text)', emptyBB:'Nothing on the blackboard yet.', setLead:'The crew for {p}. Changes save themselves and apply from the next task.',
    lang:'Reporting language', langS:'Agents write notes, hand-offs and results in this language. Code and commands stay as they are.', def:'Default', other:'Other…',
    roster:'Members', rosterS:'Name, job, model, effort and parallelism per role. The @handle is what agents address.', displayName:'Name', describe:'Job', describePh:'What this member is for — the crew reads this',
    langDef:'Each agent’s own default', parDef:'Up to the hub limit', parN:'At most {n} at once', autoOn:'Starts on its own when work arrives', autoOff:'Waits to be run by hand',
    eff_def:'Model default', eff_low:'Low — quick and cheap', eff_medium:'Medium', eff_high:'High — thinks it through', eff_xhigh:'Extra high', eff_max:'Max — slowest, most thorough',
    seeBrief:'Read the role brief', noBrief:'No role brief — this member only follows the task it is given.', noBriefFile:'The role file is missing.',
    exRole:'A member is a role', exRoleS:'One job on the crew: plan, code, review… Several can share a model.',
    exId:'@id — the address', exIdS:'What agents write to hand each other work. Keep it short; changing it breaks old hand-offs.',
    exJob:'Name and job — the meaning', exJobS:'Shown to you here, and told to every agent so each one knows whom to ask for what.',
    exBrief:'Role brief — the standing orders', exBriefS:'A markdown file loaded at the start of every run: rules, checklists, what “done” means.', model:'Model', effort:'Effort', parallel:'Parallel', auto:'Auto-launch', hubLimit:'hub limit', adapterDef:'adapter default', custom:'Type another id…',
    limits:'Hub limits', limitsS:'Edit these in ekip.config.json.', lWorkers:'workers at once per folder', lDepth:'delegation depth', lWait:'max wait to be picked up', lKeep:'days finished tasks are kept',
    sources:'Where model lists come from', connect:'Connect another agent', connectS:'Point any MCP-speaking agent at this endpoint.', copied:'Copied', saved:'Saved · applies from the next task', stopped:'Stopped',
    confirmStop:'Stop this and everything handed out from it?', online:'live', offline:'offline', nobody:'All quiet', nWorking:'{n} working', delegated:'Sent to {a}',
    goTo:'Go to', chats:'Conversations', msgTo:'Message', actions:'Actions', theme:'Toggle light / dark', toggleCrew:'Show / hide crew panel', nav:'navigate', openK:'open', closeK:'close', noResults:'No results',
    ago:'ago', now:'just now', s:'s', m:'m', h:'h', d:'d', status:'Status', duration:'Duration', route:'Route', modelUsed:'Model', artifacts:'Receipts', details:'Details', usage:'Tokens', started:'Created',
    s1k:'Build', s1v:'Add input validation to the user creation handler and cover it with tests',
    s2k:'Review', s2v:'Read the latest changes and point out anything that could break',
    s3k:'Explain', s3v:'Summarise this repository’s architecture in ten lines',
    s4k:'Pipeline', s4v:'Plan it, hand the code to a coder, then review — report each stage',
    t_claim:'picked up the task', t_post:'reported back', t_say:'left a note', t_hand:'handed {t} to {a}', t_wait:'waiting on {id}', t_thread:'read the conversation', t_cset:'wrote {k} to the blackboard', t_cget:'read {k}', t_cancel:'stopped {id}', t_tasks:'checked tasks',
    t_write:'wrote {f}', t_edit:'edited {f}', t_read:'read {f}', t_run:'ran {c}', t_search:'searched {q}', t_tools:'loaded its tools', t_todo:'updated its checklist', blackboardW:'the blackboard'
  },
  vi: {
    checkModel:'Kiểm tra', checkModelTip:'Claude không có danh sách model — kiểm tra nghĩa là chạy thử một việc rất nhỏ', checkBody:'Claude Code không liệt kê được model, nên ekip chạy thử một việc rất nhỏ với id này. Tốn một phần nhỏ của lượt chạy (Opus tốn hơn). Bạn sẽ thấy id thật mà nó dùng.', checkRun:'Chạy kiểm tra', checking:'Đang kiểm tra…', checkPickFirst:'Chọn model trước đã', checkOk:'Dùng được → {m}{c}', checkNo:'Không: {e}',
    runsN:'{n} lượt chạy', bRunsU:'lượt', bMinU:'phút', budgetTitle:'Ngân sách của yêu cầu này: hub dừng khi chạm giới hạn', budget:'Ngân sách mỗi yêu cầu', budgetS:'Mỗi tin bạn gửi, mỗi lần chạy quy trình hay mỗi việc giao trực tiếp chỉ được tiêu tối đa chừng này. Chạm giới hạn thì hub không bật thêm lượt nào; giới hạn thời gian còn dừng cả việc đang chạy. 0 = không giới hạn.', bRuns:'Lượt chạy', bTokens:'Token ra', bMinutes:'Phút', noLimit:'Không giới hạn',
    flows:'Quy trình', flowCantRun:'không chạy được ở đây', gatePass:'Qua cổng: {s} — {d}', gateRetry:'Chưa đạt: {s} — {d}. Quay lại {g} (vòng {r}/{n})', gateStop:'Dừng ở {s} — {d}. Đã hết số vòng.',
    tokenTitle:'Hub này cần token', tokenBody:'Chạy "ekip token" ở máy đang chạy hub rồi dán dòng đầu (token của bạn). Dùng "ekip ui" thì vào thẳng khỏi cần dán. Trình duyệt sẽ nhớ.', signIn:'Đăng nhập', tokenWrong:'Token không đúng',
    billing:'Cách Claude tính phí', runTime:'thời gian chạy hôm nay', runTimeTitle:'Tổng thời gian các agent chạy trong hôm nay.', turnsL:'Số lượt model',
    billSub:'Gói Claude {plan} — không bị tính tiền theo token', billUnknown:'Không xác định được Claude đăng nhập bằng gì', billSubS:'Lượt chạy trừ vào hạn mức của gói. Model nặng (Opus) dùng hết hạn mức nhanh hơn model nhẹ (Sonnet, Haiku).',
    billApi:'Claude đang tính tiền qua API key — mỗi token là tiền thật', billApiKey:'Môi trường của hub có API key — mọi lượt chạy bị tính tiền theo token', billApiS:'Agent được bật sẽ dùng key thay cho gói thuê bao. Chi phí được hiện ở mọi nơi.',
    showRef:'Hiện giá tham chiếu theo API (USD) để so lượt nào nặng hơn',
    ok:'Đồng ý', save:'Lưu', delete:'Xoá', deleteTitle:'Xoá hội thoại này?', deleteBody:'{n} việc, toàn bộ transcript và log sẽ bị xoá hẳn. Không thể hoàn tác.', stopAndDelete:'Dừng và xoá', stopTitle:'Dừng việc này?',
    showMore:'Xem thêm {n} hội thoại', showLess:'Thu gọn', allFolders:'Tất cả folder', bbWritesTo:'Ghi vào bảng đen của {f}',
    lWorkersTotal:'worker cùng lúc trên mọi folder', lGuard:'giữ agent trong folder của nó', on:'Bật', off:'Tắt',
    guardBlocked:'Đã chặn — nằm ngoài folder của hội thoại:',
    tokOut:'token ra', tokOutL:'Token model viết', tokRead:'đọc từ cache', tokWrite:'ghi vào cache', tokFresh:'đầu vào mới', costRef:'theo giá API',
    outTokTitle:'Số token model viết ra. Token đầu vào — phần lớn là đọc cache — xem chi tiết từng việc trong Bảng việc.',
    tokBarTitle:'Token của lượt chạy này đi đâu. Đọc cache chỉ tốn 1/10 giá đầu vào; ghi cache tốn hơn giá đầu vào.',
    costNote:'Số do chính Claude Code báo, tính theo bảng giá API niêm yết của Anthropic cho đúng số token lượt chạy đã dùng.',
    costNoteSub:'Số do chính Claude Code báo, tính theo giá API niêm yết. Bạn đăng nhập bằng gói Claude nên đây là giá trị tham chiếu: lượt chạy trừ vào hạn mức của gói, không bị tính tiền theo token.',
    missingTitle:'Không có số liệu: Gemini (Antigravity) không báo token, và lượt bị dừng hoặc lỗi giữa chừng không kịp gửi tổng kết.',
    missingN:'{n} lượt thiếu số liệu', noData:'không có số liệu', awaiting:'đang chờ số liệu…', awaitingTitle:'Việc đã xong; Claude Code gửi tổng kết token và chi phí khi tiến trình thoát hẳn, thường trong vòng hai phút.',
    deleteChat:'Xoá hội thoại', confirmDelete:'Xoá “{t}”?\n\n{n} việc, toàn bộ transcript và log sẽ mất hẳn.', confirmDeleteLive:'{n} việc trong đó đang chạy và sẽ bị dừng trước.', deleted:'Đã xoá hội thoại',
    folder:'Folder', newIn:'Hội thoại mới trong folder này', noChatsHere:'Chưa có hội thoại nào ở đây', workIn:'Làm việc trong', workingIn:'Làm việc trong', browseOther:'Chọn folder khác…', browseOtherS:'Duyệt thư mục trên máy', pickFolder:'Chọn folder để làm việc', useFolder:'Dùng folder này', projectBadge:'dự án', noSubfolders:'Không có thư mục con', folderSet:'Đã chuyển sang {f}', folderLocked:'hội thoại giữ nguyên folder của nó', allFolders:'Tất cả folder', startIn:'Bắt đầu trong',
    chat:'Trò chuyện', board:'Bảng việc', guide:'Hướng dẫn', noJob:'Chưa có mô tả việc — thêm trong Cài đặt.', guideLink:'Lần đầu dùng? Xem hướng dẫn', settings:'Cài đặt', search:'Tìm hội thoại, agent, thao tác', newChat:'Hội thoại mới', filter:'Lọc hội thoại',
    live:'Đang chạy', today:'Hôm nay', earlier:'Trước đó', working:'đang làm', queued:'đang chờ', idle:'rảnh', done:'xong', failed:'lỗi', cancelled:'đã dừng', pending:'đang chờ', claimed:'đang làm',
    stop:'Dừng', message:'Nhắn', crew:'Ê-kíp', helloT:'Giao việc cho ê-kíp', helloS:'Chọn người nhận rồi nói bạn cần gì. Bạn sẽ thấy từng agent nói gì, chạy công cụ nào, giao việc cho ai, và tốn bao nhiêu.',
    ph:'Nhờ ê-kíp làm gì đó…  (gõ @ để chọn người)', hintEnter:'Enter để gửi · Shift+Enter xuống dòng', hintReply:'Đang trả lời trong hội thoại này', to:'Gửi',
    steps:'bước', step:'bước', result:'Kết quả', failedT:'Thất bại', brief:'Chỉ dẫn từ', hands:'giao cho', isWorking:'đang làm', starting:'đang khởi động', waitingSlot:'đang chờ slot trống', lost:'mất worker (hub vừa khởi động lại)',
    jump:'Xuống mới nhất', nfT:'Không tìm thấy hội thoại', nfS:'Có thể đã bị dọn theo cài đặt lưu trữ, hoặc link thuộc hub của dự án khác.',
    runs:'lượt chạy', runsToday:'lượt hôm nay', cost:'chi phí', tokens:'token', laneQ:'Đang chờ', laneW:'Đang làm', laneD:'Xong', laneF:'Lỗi & đã dừng', newTask:'Giao việc', blackboard:'Bảng đen', none:'Trống',
    openChat:'Mở hội thoại', viewLog:'Xem log', prompt:'Yêu cầu', copyId:'Sao chép id', title:'Tiêu đề', optional:'không bắt buộc', whatToDo:'Agent này cần làm gì?', cancel:'Huỷ', send:'Gửi', setKey:'Ghi khoá',
    key:'khoá, vd plan.v1', value:'giá trị (JSON hoặc chữ)', emptyBB:'Bảng đen đang trống.', setLead:'Ê-kíp của dự án {p}. Thay đổi tự lưu và áp dụng từ task tiếp theo.',
    lang:'Ngôn ngữ báo cáo', langS:'Agent viết ghi chú, bàn giao và kết quả bằng ngôn ngữ này. Code và câu lệnh giữ nguyên.', def:'Mặc định', other:'Khác…',
    roster:'Thành viên', rosterS:'Tên, việc, model, mức suy nghĩ và số việc song song cho từng vai. @id là địa chỉ để agent gọi nhau.', displayName:'Tên', describe:'Việc', describePh:'Vai này làm gì — cả ê-kíp sẽ đọc dòng này',
    langDef:'Để mỗi agent tự chọn', parDef:'Theo giới hạn chung của hub', parN:'Tối đa {n} việc cùng lúc', autoOn:'Tự chạy khi có việc giao tới', autoOff:'Chờ bạn chạy tay',
    eff_def:'Mặc định của model', eff_low:'Thấp — nhanh, rẻ', eff_medium:'Vừa', eff_high:'Cao — suy nghĩ kỹ', eff_xhigh:'Rất cao', eff_max:'Tối đa — chậm nhất, kỹ nhất',
    seeBrief:'Xem chỉ dẫn vai', noBrief:'Chưa có chỉ dẫn vai — thành viên này chỉ làm theo đúng việc được giao.', noBriefFile:'Không tìm thấy file chỉ dẫn.',
    exRole:'Mỗi thành viên là một vai', exRoleS:'Một việc trong ê-kíp: lên kế hoạch, viết code, review… Nhiều vai có thể dùng chung một model.',
    exId:'@id — địa chỉ', exIdS:'Tên agent dùng để giao việc cho nhau. Nên ngắn gọn; đổi id sẽ làm lệch các lần bàn giao cũ.',
    exJob:'Tên và việc — ý nghĩa', exJobS:'Hiện cho bạn đọc ở đây, và được báo cho mọi agent để biết nên nhờ ai làm gì.',
    exBrief:'Chỉ dẫn vai — quy tắc thường trực', exBriefS:'File markdown nạp vào đầu mỗi lần chạy: quy tắc, checklist, thế nào là xong việc.', model:'Model', effort:'Suy nghĩ', parallel:'Song song', auto:'Tự khởi chạy', hubLimit:'theo hub', adapterDef:'mặc định adapter', custom:'Nhập id khác…',
    limits:'Giới hạn hub', limitsS:'Sửa trong ekip.config.json.', lWorkers:'worker cùng lúc mỗi folder', lDepth:'tầng giao việc', lWait:'chờ nhận việc tối đa', lKeep:'ngày lưu task đã xong',
    sources:'Danh sách model lấy từ đâu', connect:'Kết nối agent khác', connectS:'Trỏ agent biết MCP vào địa chỉ này.', copied:'Đã sao chép', saved:'Đã lưu · áp dụng từ task sau', stopped:'Đã dừng',
    confirmStop:'Dừng việc này và mọi việc đã giao tiếp từ nó?', online:'trực tuyến', offline:'mất kết nối', nobody:'Không ai đang làm', nWorking:'{n} đang làm', delegated:'Đã gửi cho {a}',
    goTo:'Đi tới', chats:'Hội thoại', msgTo:'Nhắn cho', actions:'Thao tác', theme:'Đổi sáng / tối', toggleCrew:'Ẩn / hiện ê-kíp', nav:'di chuyển', openK:'mở', closeK:'đóng', noResults:'Không có kết quả',
    ago:'trước', now:'vừa xong', s:' giây', m:' phút', h:' giờ', d:' ngày', status:'Trạng thái', duration:'Thời lượng', route:'Luồng', modelUsed:'Model', artifacts:'Biên nhận', details:'Chi tiết', usage:'Token', started:'Tạo lúc',
    s1k:'Viết code', s1v:'Thêm validate đầu vào cho hàm tạo user và viết test đi kèm',
    s2k:'Review', s2v:'Đọc thay đổi gần nhất và chỉ ra chỗ có thể gây lỗi',
    s3k:'Giải thích', s3v:'Tóm tắt kiến trúc của repo này trong mười dòng',
    s4k:'Quy trình', s4v:'Lên plan, giao code cho coder, rồi review — báo cáo từng chặng',
    t_claim:'nhận việc', t_post:'báo kết quả', t_say:'để lại ghi chú', t_hand:'giao {t} cho {a}', t_wait:'chờ {id}', t_thread:'đọc hội thoại', t_cset:'ghi {k} lên bảng đen', t_cget:'đọc {k}', t_cancel:'dừng {id}', t_tasks:'xem danh sách task',
    t_write:'ghi {f}', t_edit:'sửa {f}', t_read:'đọc {f}', t_run:'chạy {c}', t_search:'tìm {q}', t_tools:'nạp công cụ', t_todo:'cập nhật checklist', blackboardW:'bảng đen'
  }
};
var LANG = 'en';
function pickLang(language){
  var l = String(language || '').toLowerCase();
  if (l) return (l.indexOf('viet') >= 0 || l.indexOf('việt') >= 0 || l === 'vi') ? 'vi' : 'en';
  return (navigator.language || '').toLowerCase().indexOf('vi') === 0 ? 'vi' : 'en';
}
function T(k, vars){
  var s = (DICT[LANG] && DICT[LANG][k]) || DICT.en[k] || k;
  if (vars) Object.keys(vars).forEach(function(v){ s = s.split('{' + v + '}').join(vars[v]); });
  return s;
}

/* ================= formatting ================= */
function ago(iso){
  var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return T('now');
  var n, u;
  if (s < 3600) { n = Math.round(s / 60); u = T('m'); }
  else if (s < 86400) { n = Math.round(s / 3600); u = T('h'); }
  else { n = Math.round(s / 86400); u = T('d'); }
  return n + u + ' ' + T('ago');
}
function clock(iso){ var d = new Date(iso); return d.toTimeString().slice(0, 5); }
function elapsed(fromIso, toIso){
  var s = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000));
  var m = Math.floor(s / 60), r = s % 60;
  if (m >= 60) return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  return m + ':' + String(r).padStart(2, '0');
}
function dur(ms){ var s = Math.round(ms / 1000); return s < 90 ? s + 's' : Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0'); }
/* Cost is Claude Code's own figure at API list prices (verified against the
   price list); token counts separate what the model wrote from what it read,
   most of which is cheap cache reads. */
function awaitingTally(taskId){
  var w = S.state && S.state.workers;
  return !!(w && (w.lingering || []).some(function(x){ return x.taskId === taskId; }));
}
function outTok(u){ return (u && u.outputTokens) || 0; }
function costTitle(){ return T(S.billing && S.billing.claude === 'subscription' ? 'costNoteSub' : 'costNote'); }
function tokenBar(u){
  var read = u.cacheReadTokens || 0, write = u.cacheWriteTokens || 0, total = u.inputTokens || 0;
  var fresh = Math.max(0, total - read - write), out = u.outputTokens || 0;
  var seg = function(n, cls){ return n ? '<span class="seg-' + cls + '" style="flex:' + n + '"></span>' : ''; };
  var row = function(n, cls, label){ return '<span class="k"><i class="sw ' + cls + '"></i>' + esc(label) + ' <b class="num">' + toks(n) + '</b></span>'; };
  return '<div class="bar">' + seg(read, 'read') + seg(write, 'write') + seg(fresh, 'fresh') + seg(out, 'out') + '</div>' +
    '<div class="keys">' + row(read, 'read', T('tokRead')) + row(write, 'write', T('tokWrite')) + row(fresh, 'fresh', T('tokFresh')) + row(out, 'out', T('tokOut')) + '</div>';
}
/* On a subscription nothing is billed per token, so dollars stay hidden unless
   asked for (Settings). With an API key they are real money and always shown. */
function showMoney(){
  if (S.billing && S.billing.claude === 'api') return true;
  return store('ekip.showCost') === '1';
}
function money(n){ return '$' + (n < 0.01 ? n.toFixed(3) : n.toFixed(2)); }
function toks(n){ return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
function shortModel(m){
  if (!m) return '';
  return String(m).replace(/^claude-/, '').replace(/-\d{8}$/, '');
}
function md(text){
  var FENCE = '\x60\x60\x60';
  var parts = String(text == null ? '' : text).split(/(\x60\x60\x60[\s\S]*?\x60\x60\x60)/g);
  return parts.map(function(p){
    if (p.indexOf(FENCE) === 0) return '<pre>' + esc(p.slice(3, -3).replace(/^[\w-]*\n/, '')) + '</pre>';
    return esc(p)
      .replace(/\x60([^\x60\n]+)\x60/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }).join('');
}
function initials(name){
  // First letter of the first and last word: "Lập trình · Gemini" → LG, "Điều phối" → ĐP.
  var parts = String(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length > 1) return parts[0][0] + parts[parts.length - 1][0];
  return String(name).slice(0, 2);
}
function fold(s){ return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }
function flowByName(name){ return (S.flows || []).filter(function(f){ return 'flow:' + f.name === name; })[0]; }
function dn(name){
  if (name === 'human') return LANG === 'vi' ? 'bạn' : 'you';
  if (String(name).indexOf('flow:') === 0) { var f = flowByName(name); return (f && f.label) || String(name).slice(5); }
  var a = agentByName(name);
  return (a && a.label) || name;
}
var ADAPTER_MARK = { claude:'C', antigravity:'G', command:'›' };
function avatar(name, opts){
  opts = opts || {};
  if (name === 'human' || name === 'you') return '<span class="av you' + (opts.size ? ' ' + opts.size : '') + '">' + (LANG === 'vi' ? 'B' : 'Y') + '</span>';
  if (String(name).indexOf('flow:') === 0) return '<span class="av flow' + (opts.size ? ' ' + opts.size : '') + (opts.live ? ' live' : '') + '" title="' + esc(dn(name)) + '">' + icon('handoff', opts.size === 'lg' ? '' : 'sm') + '</span>';
  var a = agentByName(name);
  var mark = a ? (ADAPTER_MARK[a.adapter] || '') : '';
  return '<span class="av' + (opts.size ? ' ' + opts.size : '') + (opts.live ? ' live' : '') + '" style="--h:' + hashHue(name) + '" title="' + esc(dn(name) + (dn(name) !== name ? ' · @' + name : '')) + '">' +
    esc(initials(dn(name))) + (mark && opts.size !== 'sm' ? '<span class="ad">' + mark + '</span>' : '') + '</span>';
}

/* ================= state ================= */
var SIDEBAR_LIMIT = 10;
var S = { gone:{}, askedLang:false, expandedFolders:{}, billing:null, folders:[], folder:null, collapsed:{}, browsePath:null, state:null, threads:[], thread:null, current:null, notFound:false, catalogs:null, limits:null,
  view:'chat', filter:'', boardFilter:'', boardAgent:'', target:null, selectedTask:null,
  openGroups:{}, openSteps:{}, sig:{} };
function agentByName(n){ return S.state ? S.state.agents.filter(function(a){ return a.name === n; })[0] : null; }
function tasksById(){ var m = {}; (S.state ? S.state.tasks : []).forEach(function(t){ m[t.id] = t; }); return m; }
function rootOf(task, map){ var t = task, guard = 0; while (t && t.parentId && map[t.parentId] && guard++ < 50) t = map[t.parentId]; return t; }
function liveWorkForAgent(name){
  return (S.state ? S.state.tasks : []).filter(function(t){ return t.to === name && !isDone(t.status); })
    .sort(function(a, b){ return a.createdAt.localeCompare(b.createdAt); });
}

/* ================= router ================= */
function go(path, push){
  var m = /^\/(chat|board|guide|settings)(?:\/([A-Za-z0-9-]+))?/.exec(path) || [];
  S.view = m[1] || 'chat';
  if (S.view === 'chat') { var next = m[2] || null; if (next !== S.current) { S.current = next; S.thread = null; S.notFound = false; S.sig.thread = ''; } }
  if (push !== false && location.pathname !== path) history.pushState({}, '', path);
  ['chat', 'board', 'guide', 'settings'].forEach(function(v){ $('v-' + v).classList.toggle('on', v === S.view); });
  document.querySelectorAll('nav.tabs a').forEach(function(a){ a.classList.toggle('on', a.getAttribute('data-view') === S.view); });
  if (S.view === 'settings' && !S.catalogs) loadCatalogs();
  S.sig = {};
  refresh();
}
window.addEventListener('popstate', function(){ go(location.pathname, false); });
document.querySelectorAll('nav.tabs a').forEach(function(a){
  a.addEventListener('click', function(e){ e.preventDefault(); go(a.getAttribute('href')); });
});

/* ================= data ================= */
function getJSON(p){ return fetch(p).then(function(r){ if (r.status === 401) { askToken(); return null; } return r.ok ? r.json() : null; }); }
function loadCatalogs(){ return getJSON('/api/models').then(function(c){ S.catalogs = c; S.sig.settings = ''; if (S.view === 'settings') renderSettings(); }); }
var busy = false, again = false;
function refresh(){
  if (busy) { again = true; return; }
  busy = true;
  var jobs = [getJSON('/api/state').then(function(s){ if (s) S.state = s; })];
  if (S.view === 'chat' || S.view === 'board') jobs.push(getJSON('/api/folders').then(function(d){ if (d) { S.folders = d.folders; S.home = d.home; } }));
  if (!S.flows) { S.flows = []; getJSON('/api/flows').then(function(d){ if (d) { S.flows = d.flows; S.sig = {}; render(); } }); }
  if (S.view === 'chat') {
    jobs.push(getJSON('/api/threads').then(function(d){ if (d) S.threads = d.threads; }));
    if (S.current && !S.gone[S.current]) {
      var want = S.current;
      jobs.push(getJSON('/api/thread/' + want).then(function(d){ if (want !== S.current) return; S.thread = d; S.notFound = !d; }));
    }
  }
  if (S.view === 'settings') jobs.push(getJSON('/api/limits').then(function(l){ if (l) S.limits = l; }));
  if (!S.billing) { S.billing = { claude: 'unknown' }; getJSON('/api/billing').then(function(b){ if (b) { S.billing = b; S.sig = {}; render(); } }); }
  Promise.all(jobs).then(render).catch(function(){}).then(function(){
    busy = false;
    if (again) { again = false; setTimeout(refresh, 60); }
  });
}
var queued = null;
function soon(){ if (queued) return; queued = setTimeout(function(){ queued = null; refresh(); }, 140); }

/* ================= render: shell ================= */
function render(){
  if (!S.state) return;
  var lang = pickLang(S.state.language);
  if (lang !== LANG) { LANG = lang; S.sig = {}; applyStaticText(); }
  document.title = 'ekip · ' + S.state.project;
  if (!S.home) S.home = S.state.projectRoot;
  if (!S.folder) S.folder = store('ekip.folder') || S.home;
  $('proj').textContent = S.state.project;
  var working = S.state.tasks.filter(function(t){ return t.status === 'claimed' || (t.status === 'pending' && t.pid); }).length;
  var chip = $('live-chip');
  chip.className = 'live-chip' + (online ? (working ? ' on' : '') : ' off');
  $('live-text').textContent = !online ? T('offline') : working ? T('nWorking', { n: working }) : T('nobody');
  var badge = $('board-count');
  badge.textContent = working; badge.classList.toggle('show', working > 0);
  if (S.view === 'chat') { renderSide(); renderStage(); renderCrew(); }
  else if (S.view === 'board') renderBoard();
  else if (S.view === 'guide') renderGuide();
  else renderSettings();
  if (S.selectedTask) renderDrawer();
}
function applyStaticText(){
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-t]').forEach(function(el){ el.textContent = T(el.getAttribute('data-t')); });
  document.querySelectorAll('[data-tp]').forEach(function(el){ el.setAttribute('placeholder', T(el.getAttribute('data-tp'))); });
  document.querySelectorAll('[data-tt]').forEach(function(el){ el.setAttribute('title', T(el.getAttribute('data-tt'))); });
}

`;
