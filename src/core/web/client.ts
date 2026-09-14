/**
 * Client-side script for the hub's web app. A String.raw template, so regexes
 * and escapes arrive in the browser exactly as written here. The one rule:
 * no backticks and no dollar-brace sequences inside (they would end or
 * interpolate the template) — plain string concatenation throughout.
 */
export const CLIENT = String.raw`
(function(){
'use strict';

/* ================= basics ================= */
var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function post(path, body){ return fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(function(r){ return r.json(); }); }
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
    limits:'Hub limits', limitsS:'Edit these in ekip.config.json.', lWorkers:'workers at once', lDepth:'delegation depth', lWait:'max wait to be picked up', lKeep:'days finished tasks are kept',
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
    limits:'Giới hạn hub', limitsS:'Sửa trong ekip.config.json.', lWorkers:'worker cùng lúc', lDepth:'tầng giao việc', lWait:'chờ nhận việc tối đa', lKeep:'ngày lưu task đã xong',
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
function dn(name){
  if (name === 'human') return LANG === 'vi' ? 'bạn' : 'you';
  var a = agentByName(name);
  return (a && a.label) || name;
}
var ADAPTER_MARK = { claude:'C', antigravity:'G', command:'›' };
function avatar(name, opts){
  opts = opts || {};
  if (name === 'human' || name === 'you') return '<span class="av you' + (opts.size ? ' ' + opts.size : '') + '">' + (LANG === 'vi' ? 'B' : 'Y') + '</span>';
  var a = agentByName(name);
  var mark = a ? (ADAPTER_MARK[a.adapter] || '') : '';
  return '<span class="av' + (opts.size ? ' ' + opts.size : '') + (opts.live ? ' live' : '') + '" style="--h:' + hashHue(name) + '" title="' + esc(dn(name) + (dn(name) !== name ? ' · @' + name : '')) + '">' +
    esc(initials(dn(name))) + (mark && opts.size !== 'sm' ? '<span class="ad">' + mark + '</span>' : '') + '</span>';
}

/* ================= state ================= */
var S = { billing:null, folders:[], folder:null, collapsed:{}, browsePath:null, state:null, threads:[], thread:null, current:null, notFound:false, catalogs:null, limits:null,
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
function getJSON(p){ return fetch(p).then(function(r){ return r.ok ? r.json() : null; }); }
function loadCatalogs(){ return getJSON('/api/models').then(function(c){ S.catalogs = c; S.sig.settings = ''; if (S.view === 'settings') renderSettings(); }); }
var busy = false, again = false;
function refresh(){
  if (busy) { again = true; return; }
  busy = true;
  var jobs = [getJSON('/api/state').then(function(s){ if (s) S.state = s; })];
  if (S.view === 'chat' || S.view === 'board') jobs.push(getJSON('/api/folders').then(function(d){ if (d) { S.folders = d.folders; S.home = d.home; } }));
  if (S.view === 'chat') {
    jobs.push(getJSON('/api/threads').then(function(d){ if (d) S.threads = d.threads; }));
    if (S.current) {
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
  var sig = JSON.stringify([S.current, q, LANG, S.collapsed, S.folder, list.map(function(t){ return [t.id, t.status, t.messages, t.lastAt.slice(0, 16), t.cwd]; })]);
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
    return '<div class="fgroup' + (open ? ' open' : '') + '"><div class="fhead" data-toggle-folder="' + esc(k) + '" title="' + esc(k) + '">' +
      icon('chev', 'sm chev') + icon('folder', 'sm') + '<span class="fname">' + esc(folderName(k)) + '</span>' +
      (g.live ? '<span class="flive">' + g.live + '</span>' : '<span class="fcount">' + g.items.length + '</span>') +
      '<button class="btn ghost sm icon fadd" data-new-in="' + esc(k) + '" title="' + esc(T('newIn')) + '">' + icon('plus', 'sm') + '</button></div>' +
      '<div class="fitems">' + (g.items.length ? g.items.map(function(t){
        var st = isDone(t.status) ? (t.status === 'done' ? '' : '<span class="state ' + t.status + '">' + esc(T(t.status)) + ' ·</span>') : '<span class="state working">' + esc(T('working')) + ' ·</span>';
        return '<div class="th' + (t.id === S.current ? ' sel' : '') + '" data-id="' + t.id + '">' +
          avatar(t.to, { live: !isDone(t.status) }) +
          '<div class="body"><div class="t">' + esc(t.title) + '</div><div class="m">' + st + '<span>' + esc(dn(t.to)) + '</span></div></div>' +
          '<span class="when">' + esc(ago(t.lastAt).replace(' ' + T('ago'), '')) + '</span>' +
          '<button class="btn ghost sm icon th-del" data-del="' + t.id + '" title="' + esc(T('deleteChat')) + '">' + icon('trash', 'sm') + '</button></div>';
      }).join('') : '<div class="fempty">' + esc(T('noChatsHere')) + '</div>') + '</div></div>';
  }).join('');
  $('threads').innerHTML = html || '<div class="group-label" style="text-transform:none;letter-spacing:0">' + esc(q ? T('noResults') : T('none')) + '</div>';
}
$('threads').addEventListener('click', function(e){
  var del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); deleteThread(del.getAttribute('data-del')); return; }
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
  var sig = JSON.stringify([S.current, S.notFound, LANG, S.folder, S.folders.length, th ? [th.messages.length, th.tasks.map(function(t){ return [t.status, t.usage && t.usage.costUsd, !!t.pid, awaitingTally(t.id)]; })] : null, S.state.agents.length, !!S.billing && S.billing.claude]);
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
  var cost = 0, tk = 0, missing = 0;
  th.tasks.forEach(function(t){
    if (t.usage && typeof t.usage.costUsd === 'number') { cost += t.usage.costUsd; tk += outTok(t.usage); }
    else if (isDone(t.status) && !awaitingTally(t.id)) missing++;
  });
  top.innerHTML = '<span class="title">' + esc(root.title) + '</span>' +
    '<span class="chip folder-tag" title="' + esc(root.cwd || S.home || '') + '">' + icon('folder', 'sm') + esc(folderName(root.cwd || S.home || '')) + '</span>' +
    '<span class="facts">' + (live.length ? '<span class="pill working">' + esc(live.length === 1 ? dn(live[0].to) + ' ' + T('working') : T('nWorking', { n: live.length })) + '</span>' : '<span class="pill ' + root.status + '">' + esc(T(root.status)) + '</span>') +
    '<span class="num">' + th.tasks.length + ' task</span>' + (tk ? '<span class="dotsep">·</span><span class="num" title="' + esc(T('outTokTitle')) + '">' + toks(tk) + ' ' + esc(T('tokOut')) + '</span>' : '') +
    (cost ? '<span class="dotsep">·</span><span class="num cost" title="' + esc(costTitle()) + '">≈ ' + money(cost) + '</span>' : '') +
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
    if (typeof u.costUsd === 'number') meta += '<span class="cost" title="' + esc(costTitle()) + '">≈ ' + money(u.costUsd) + '</span>';
    else if (!liveT && t.status === 'done') meta += awaitingTally(t.id)
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

    msgs.forEach(function(m, idx){
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
        var bad = /fail|refused|exited|error|cancel/i.test(m.text);
        body += '<div class="notice' + (bad ? ' bad' : /queued/i.test(m.text) ? ' warn' : '') + '">' + icon(bad ? 'alert' : 'clock', 'sm') + '<span>' + esc(m.text) + '</span></div>';
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
function deleteThread(id){
  var map = tasksById(), t = map[id];
  var th = S.threads.filter(function(x){ return x.id === id; })[0];
  var root = t ? rootOf(t, map) : null;
  var rootId = root ? root.id : id;
  var title = (root && root.title) || (th && th.title) || shortId(id);
  var family = (S.state ? S.state.tasks : []).filter(function(x){ return rootOf(x, map) && rootOf(x, map).id === rootId; });
  var running = family.filter(function(x){ return !isDone(x.status); }).length;
  var msg = T('confirmDelete', { t: title, n: family.length || 1 }) + (running ? '\n\n' + T('confirmDeleteLive', { n: running }) : '');
  if (!confirm(msg)) return;
  post('/api/threads/delete', { id: rootId, stop: running > 0 }).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    toast(T('deleted'));
    if (S.selectedTask && family.some(function(x){ return x.id === S.selectedTask; })) closeDrawer();
    S.sig = {};
    if (S.current === rootId) go('/chat'); else refresh();
  });
}
function stopTask(id){
  if (!confirm(T('confirmStop'))) return;
  post('/api/cancel', { task_id: id, by: 'human' }).then(function(d){ toast(d.error ? d.error : T('stopped'), !!d.error); soon(); });
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
  }).join('') : '<div class="opt">' + esc(T('noResults')) + '</div>');
  el.hidden = false;
  el.style.left = '8px'; el.style.bottom = 'calc(100% + 8px)';
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
  var body = { to: S.target, prompt: text, from: 'human' };
  if (S.current && !S.notFound) body.parent_task_id = S.current;
  else if (currentFolder()) body.cwd = currentFolder();
  $('send').disabled = true;
  post('/api/delegate', body).then(function(d){
    if (d.error) { $('dock-hint').textContent = d.error; $('dock-hint').className = 'hint err'; $('send').disabled = false; return; }
    ta.value = ''; autosize(); $('dock-hint').className = 'hint';
    if (!S.current || S.notFound) { S.current = d.task.id; S.notFound = false; history.replaceState({}, '', '/chat/' + d.task.id); }
    S.sig.stage = ''; refresh();
    setTimeout(function(){ var sc = $('scroller'); sc.scrollTop = sc.scrollHeight; }, 250);
  }).catch(function(){ $('dock-hint').textContent = T('offline'); $('dock-hint').className = 'hint err'; $('send').disabled = false; });
}

/* ================= chat: crew panel ================= */
function renderCrew(){
  var st = S.state, map = tasksById();
  var startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  var sig = JSON.stringify([LANG, st.agents, st.tasks.map(function(t){ return [t.id, t.status, !!t.pid, t.usage && t.usage.costUsd]; })]);
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
    if (spent) sub.push(money(spent));
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
    '<div class="stat cost" title="' + esc(costTitle()) + '"><div class="n">≈ ' + (cost ? money(cost) : '$0') + '</div><div class="l">' + esc(S.billing && S.billing.claude === 'subscription' ? T('costRef') : T('cost')) + '</div></div>' +
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
  var sig = JSON.stringify([LANG, q, who, where, S.selectedTask, st.agents.map(function(a){ return a.name; }), st.tasks.map(function(t){ return [t.id, t.status, !!t.pid, t.usage && t.usage.costUsd]; }), st.context.length]);
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
          (typeof u.costUsd === 'number' ? '<span class="num cost" title="' + esc(costTitle()) + '">≈ ' + money(u.costUsd) + '</span>' : '') +
          (live ? '<span class="num" data-since="' + esc(t.dispatchedAt || t.createdAt) + '">' + elapsed(t.dispatchedAt || t.createdAt) + '</span>' : '<span>' + esc(ago(t.updatedAt).replace(' ' + T('ago'), '')) + '</span>') + '</div>' +
          (t.status === 'failed' && t.result ? '<div class="reason">' + esc(t.result) + '</div>' : '') + '</div>';
      }).join('') : '<div class="none">' + esc(T('none')) + '</div>') + '</div></div>';
  }).join('');
  var ctx = st.context.slice().sort(function(a, b){ return b.updatedAt.localeCompare(a.updatedAt); });
  $('bb-count').textContent = ctx.length;
  $('bb-items').innerHTML = ctx.length ? ctx.map(function(c){
    return '<div class="kv" data-key="' + esc(c.key) + '"><div class="k">' + esc(c.key) + '<span class="by">' + esc(c.updatedBy) + '</span></div><div class="v">' + esc(typeof c.value === 'string' ? c.value : JSON.stringify(c.value)) + '</div></div>';
  }).join('') : '<div class="kv" style="cursor:default"><div class="v">' + esc(T('emptyBB')) + '</div></div>';
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
  var entry = S.state.context.filter(function(c){ return c.key === k.getAttribute('data-key'); })[0];
  if (entry) { $('bb-key').value = entry.key; $('bb-value').value = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2); $('bb-value').focus(); }
});
$('bb-form').addEventListener('submit', function(e){
  e.preventDefault();
  var raw = $('bb-value').value, value;
  try { value = JSON.parse(raw); } catch (err) { value = raw; }
  post('/api/context', { key: $('bb-key').value, value: value, by: 'human' }).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    $('bb-key').value = ''; $('bb-value').value = ''; toast(T('saved').split(' · ')[0]); soon();
  });
});
$('bb-toggle').addEventListener('click', function(){
  var body = $('board-body'); body.classList.toggle('no-bb'); store('ekip.bb', body.classList.contains('no-bb') ? 'hidden' : null);
});
if (store('ekip.bb') === 'hidden') $('board-body').classList.add('no-bb');

/* ================= guide ================= */
function renderGuide(){
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
    '<div class="fact" title="' + esc(costTitle()) + '"><div class="l">' + esc(T('cost')) + '</div><div class="v">' + (typeof u.costUsd === 'number' ? '≈ ' + money(u.costUsd) : '<span class="nodata">' + esc(T('noData')) + '</span>') + '</div></div>' +
    '<div class="fact"><div class="l">' + esc(T('modelUsed')) + '</div><div class="v" title="' + esc(u.model || '') + '">' + esc(shortModel(u.model) || (agentByName(t.to) || {}).model || '—') + '</div></div>' +
    '<div class="fact"><div class="l">' + esc(T('tokOutL')) + '</div><div class="v">' + (u.outputTokens ? toks(u.outputTokens) : '—') + '</div></div>' +
    '<div class="fact wide"><div class="l">' + esc(T('folder')) + '</div><div class="v mono" title="' + esc((rootOf(t, map) || t).cwd || S.home || '') + '">' + esc(shortPath((rootOf(t, map) || t).cwd || S.home || '')) + '</div></div></div>' +
    (u.inputTokens && u.cacheReadTokens !== undefined ? '<div class="tokbar" title="' + esc(T('tokBarTitle')) + '">' + tokenBar(u) + '</div>' : '') +
    (isDone(t.status) ? '<p class="costnote">' + icon('alert', 'sm') + '<span>' + esc(typeof u.costUsd === 'number' ? costTitle() : awaitingTally(t.id) ? T('awaitingTitle') : T('missingTitle')) + '</span></p>' : '');
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

/* ================= settings ================= */
var EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
function renderSettings(){
  var st = S.state, l = S.limits;
  var sig = JSON.stringify([LANG, st.agents, !!S.catalogs, l]);
  if (sig === S.sig.settings) return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#settings-root input, #settings-root textarea')) return;
  S.sig.settings = sig;
  $('set-lead').textContent = T('setLead', { p: st.project });
  var lang = l ? (l.language || '') : '';
  var langs = [['', T('langDef')], ['Vietnamese', 'Tiếng Việt'], ['English', 'English'], ['Japanese', '日本語'], ['Korean', '한국어'], ['Chinese', '中文']];
  if (lang && !langs.some(function(o){ return o[0] === lang; })) langs.push([lang, lang]);
  $('lang-select').innerHTML = langs.map(function(o){
    return '<option value="' + esc(o[0]) + '"' + (o[0] === lang ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
  }).join('') + '<option value="__other">' + esc(T('other')) + '</option>';
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
      '<label>' + esc(T('model')) + '</label><select class="field" data-f="model"' + (S.catalogs ? '' : ' disabled') + '>' + opts + '</select>' +
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
    $('tiles').innerHTML = [[l.maxConcurrent, T('lWorkers')], [l.maxDepth, T('lDepth')], [Math.round(l.watchdog.pendingTtlSeconds / 60) + (LANG === 'vi' ? ' phút' : ' min'), T('lWait')], [l.retention.days, T('lKeep')]].map(function(x){
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
  if (v === '__custom') { v = prompt(T('custom')) || ''; if (!v) { S.sig.settings = ''; renderSettings(); return; } }
  saveAgent(name, { model: v });
});
$('roster').addEventListener('click', function(e){
  var card = e.target.closest('[data-agent]'); if (!card) return;
  var name = card.getAttribute('data-agent');
  var sw = e.target.closest('[data-f="spawnable"]');
  if (sw) { saveAgent(name, { spawnable: !sw.classList.contains('on') }); }
});
$('lang-select').addEventListener('change', function(e){
  var v = e.target.value;
  if (v === '__other') { v = prompt(T('lang')) || ''; if (!v) { S.sig.settings = ''; renderSettings(); return; } }
  post('/api/config/hub', { language: v }).then(function(d){
    if (d.error) { toast(d.error, true); return; }
    toast(T('saved')); S.sig = {}; refresh();
  });
});
$('copy-endpoint').addEventListener('click', function(){ copyText($('endpoint').textContent); });

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
})();
`;
