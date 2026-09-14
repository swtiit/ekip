/**
 * The in-app user guide, in Vietnamese and English. Both are rendered into the
 * page; CSS shows the one matching <html lang>, which the client sets from the
 * hub's reporting language.
 *
 * Every diagram draws a mechanism the reader would otherwise have to assemble
 * from prose: who talks to whom and in which direction, the states a task
 * moves through and what moves it, the order of a hand-off, the pipeline's
 * loops and their caps, and where things sit on the screen. Strokes and text
 * take theme colours from the app's CSS variables, so they read in light and
 * dark alike.
 */

type Lang = "vi" | "en";

const L = {
  vi: {
    you: "Bạn", youSub: "Web app · CLI", hub: "Hub · ekip serve",
    queue: "Hàng đợi việc", queueSub: "chờ → làm → xong",
    board: "Bảng đen chung", boardSub: "kế hoạch, ghi chú, kết luận",
    guard: "Điều phối + canh gác", guardSub: "bật agent, bắt lỗi, giới hạn song song",
    claude: "Claude", gemini: "Gemini", other: "CLI khác", otherSub: "codex, gemini-cli…",
    give: "giao việc", watch: "xem trực tiếp", launch: "tự khởi chạy", report: "báo kết quả · MCP",
    sGive: "Giao việc", sWait: "Đang chờ", sWork: "Đang làm", sDone: "Xong", sFail: "Lỗi", sStop: "Đã dừng",
    eQueued: "có slot trống", eClaim: "agent nhận việc", eReport: "báo kết quả",
    eNoClaim: "không ai nhận trong hạn", eExit: "agent thoát giữa chừng", eStop: "bạn bấm Dừng",
    lead: "Điều phối", coder: "Lập trình",
    m1: "① yêu cầu", m2: "② giao việc · bridge_delegate", m3: "③ tự khởi chạy", m4: "④ báo kết quả · bridge_post_result",
    m5: "⑤ kết quả về · bridge_wait", m6: "⑥ báo cáo tổng hợp", working: "đang làm",
    pPlan: "Lên kế hoạch", pCritic: "Phản biện", pCriticSub: "chấm ≥ 90 điểm", pCode: "Lập trình", pReview: "Review code", pAudit: "Kiểm định cuối", pAuditSub: "SHIP hoặc HOLD",
    pConductor: "Hub — chạy từng chặng, chấm cổng, quay vòng khi chưa đạt, dừng khi hết vòng",
    pLoop1: "chưa ≥ 90 → sửa kế hoạch · tối đa 3 vòng", pLoop2: "chưa DUYỆT → sửa code · tối đa 3 vòng",
    pBoard: "kế hoạch nằm trên bảng đen (&lt;lần chạy&gt;.plan); nhận xét của cổng được gửi kèm vào vòng sau",
    l1: "Hội thoại", l2: "Transcript", l3: "Các bước làm", l4: "Kết quả + biên nhận", l5: "Ê-kíp", l6: "Ô soạn",
  },
  en: {
    you: "You", youSub: "Web app · CLI", hub: "Hub · ekip serve",
    queue: "Task queue", queueSub: "queued → working → done",
    board: "Shared blackboard", boardSub: "plans, notes, verdicts",
    guard: "Dispatcher + watchdog", guardSub: "launches agents, catches failures, caps parallel runs",
    claude: "Claude", gemini: "Gemini", other: "Other CLIs", otherSub: "codex, gemini-cli…",
    give: "hand out work", watch: "watch live", launch: "launches", report: "reports back · MCP",
    sGive: "Handed out", sWait: "Queued", sWork: "Working", sDone: "Done", sFail: "Failed", sStop: "Stopped",
    eQueued: "a slot frees up", eClaim: "agent picks it up", eReport: "reports back",
    eNoClaim: "nobody picks it up in time", eExit: "agent exits mid-way", eStop: "you press Stop",
    lead: "Conductor", coder: "Coder",
    m1: "① request", m2: "② hand out · bridge_delegate", m3: "③ launches", m4: "④ reports back · bridge_post_result",
    m5: "⑤ result returns · bridge_wait", m6: "⑥ summary report", working: "working",
    pPlan: "Plan", pCritic: "Critic", pCriticSub: "scores ≥ 90", pCode: "Code", pReview: "Review", pAudit: "Audit", pAuditSub: "SHIP or HOLD",
    pConductor: "Hub — runs each stage, checks the gate, loops back on a miss, stops when rounds run out",
    pLoop1: "under 90 → revise the plan · at most 3 rounds", pLoop2: "not APPROVE → fix the code · at most 3 rounds",
    pBoard: "the plan lives on the blackboard (&lt;run&gt;.plan); a gate's feedback is passed into the next round",
    l1: "Conversations", l2: "Transcript", l3: "Steps", l4: "Result + receipts", l5: "Crew", l6: "Composer",
  },
} satisfies Record<Lang, Record<string, string>>;

function marker(id: string, cls: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="${cls}"/></marker>`;
}

function arch(t: (typeof L)["vi"], lang: Lang): string {
  const a = `arch-${lang}`;
  const row = (y: number, title: string, sub: string) =>
    `<rect class="inner" x="285" y="${y}" width="250" height="50" rx="8"/><text class="t" x="301" y="${y + 21}">${title}</text><text class="s" x="301" y="${y + 39}">${sub}</text>`;
  const agent = (y: number, title: string, sub: string, live = false) =>
    `<rect class="box${live ? " livebox" : ""}" x="690" y="${y}" width="170" height="62" rx="10"/><text class="t" x="775" y="${y + 27}" text-anchor="middle">${title}</text><text class="s" x="775" y="${y + 46}" text-anchor="middle">${sub}</text>`;
  const pair = (cy: number) =>
    `<line class="ln" x1="560" y1="${cy - 9}" x2="686" y2="${cy - 9}" marker-end="url(#${a}-m)"/><line class="ln acc" x1="688" y1="${cy + 9}" x2="564" y2="${cy + 9}" marker-end="url(#${a}-ma)"/>`;
  return `<svg class="dg" viewBox="0 0 880 320" role="img" aria-label="${t.you} → ${t.hub} → ${t.claude}, ${t.gemini}, ${t.other}">
<defs>${marker(`${a}-m`, "mk")}${marker(`${a}-ma`, "mk acc")}</defs>
<rect class="box" x="20" y="115" width="150" height="90" rx="12"/><text class="t lg" x="95" y="152" text-anchor="middle">${t.you}</text><text class="s" x="95" y="174" text-anchor="middle">${t.youSub}</text>
<line class="ln" x1="170" y1="146" x2="256" y2="146" marker-end="url(#${a}-m)"/><text class="lbl" x="213" y="137" text-anchor="middle">${t.give}</text>
<line class="ln dash" x1="258" y1="176" x2="174" y2="176" marker-end="url(#${a}-m)"/><text class="lbl" x="213" y="195" text-anchor="middle">${t.watch}</text>
<rect class="hubbox" x="260" y="30" width="300" height="262" rx="14"/><text class="t lg" x="410" y="60" text-anchor="middle">${t.hub}</text>
${row(80, t.queue, t.queueSub)}${row(144, t.board, t.boardSub)}${row(208, t.guard, t.guardSub)}
${agent(45, t.claude, "claude -p", true)}${agent(129, t.gemini, "agy -p")}${agent(213, t.other, t.otherSub)}
${pair(76)}${pair(160)}${pair(244)}
<text class="lbl" x="624" y="60" text-anchor="middle">${t.launch}</text><text class="lbl acc" x="624" y="104" text-anchor="middle">${t.report}</text>
</svg>`;
}

function lifecycle(t: (typeof L)["vi"], lang: Lang): string {
  const a = `life-${lang}`;
  const pill = (x: number, y: number, label: string, cls: string) =>
    `<rect class="pillbox ${cls}" x="${x}" y="${y}" width="160" height="42" rx="21"/><text class="t" x="${x + 80}" y="${y + 26}" text-anchor="middle">${label}</text>`;
  return `<svg class="dg" viewBox="0 0 880 250" role="img" aria-label="${t.sGive} → ${t.sWait} → ${t.sWork} → ${t.sDone}; ${t.sFail}; ${t.sStop}">
<defs>${marker(`${a}-m`, "mk")}${marker(`${a}-mb`, "mk bad")}${marker(`${a}-mo`, "mk ok")}</defs>
${pill(20, 40, t.sGive, "neutral")}${pill(240, 40, t.sWait, "warn")}${pill(460, 40, t.sWork, "live")}${pill(680, 40, t.sDone, "ok")}
<line class="ln" x1="180" y1="61" x2="236" y2="61" marker-end="url(#${a}-m)"/>
<line class="ln" x1="400" y1="61" x2="456" y2="61" marker-end="url(#${a}-m)"/><text class="lbl" x="428" y="30" text-anchor="middle">${t.eClaim}</text>
<line class="ln ok" x1="620" y1="61" x2="676" y2="61" marker-end="url(#${a}-mo)"/><text class="lbl" x="648" y="30" text-anchor="middle">${t.eReport}</text>
${pill(460, 180, t.sFail, "bad")}${pill(680, 180, t.sStop, "muted")}
<path class="ln bad" d="M320 82 V201 H456" marker-end="url(#${a}-mb)"/><text class="lbl" x="388" y="224" text-anchor="middle">${t.eNoClaim}</text>
<line class="ln bad" x1="540" y1="84" x2="540" y2="176" marker-end="url(#${a}-mb)"/><text class="lbl" x="548" y="152">${t.eExit}</text>
<path class="ln" d="M600 82 Q700 120 740 176" marker-end="url(#${a}-m)"/><text class="lbl" x="712" y="128">${t.eStop}</text>
</svg>`;
}

function sequence(t: (typeof L)["vi"], lang: Lang): string {
  const a = `seq-${lang}`;
  const lanes: Array<[number, string, string]> = [[90, t.you, "you"], [320, t.lead, "lead"], [560, "Hub", "hub"], [790, t.coder, "coder"]];
  const head = lanes
    .map(([x, label, cls]) => `<rect class="box ${cls === "hub" ? "hubbox" : ""}" x="${x - 75}" y="16" width="150" height="40" rx="10"/><text class="t" x="${x}" y="41" text-anchor="middle">${label}</text><line class="life" x1="${x}" y1="56" x2="${x}" y2="340"/>`)
    .join("");
  const msg = (y: number, from: number, to: number, label: string, acc = false) => {
    const dir = to > from ? 1 : -1;
    return `<line class="ln${acc ? " acc" : ""}" x1="${from + dir * 4}" y1="${y}" x2="${to - dir * 6}" y2="${y}" marker-end="url(#${a}-${acc ? "ma" : "m"})"/><text class="lbl${acc ? " acc" : ""}" x="${(from + to) / 2}" y="${y - 8}" text-anchor="middle">${label}</text>`;
  };
  return `<svg class="dg" viewBox="0 0 880 350" role="img" aria-label="${t.m1}, ${t.m2}, ${t.m3}, ${t.m4}, ${t.m5}, ${t.m6}">
<defs>${marker(`${a}-m`, "mk")}${marker(`${a}-ma`, "mk acc")}</defs>
${head}
<rect class="act" x="783" y="188" width="14" height="62" rx="4"/><text class="lbl" x="804" y="214">${t.working}</text>
${msg(92, 90, 320, t.m1)}${msg(136, 320, 560, t.m2)}${msg(180, 560, 790, t.m3)}${msg(236, 790, 560, t.m4, true)}${msg(280, 560, 320, t.m5, true)}${msg(324, 320, 90, t.m6)}
</svg>`;
}

function pipeline(t: (typeof L)["vi"], lang: Lang): string {
  const a = `pipe-${lang}`;
  const xs = [20, 196, 372, 548, 724];
  const stage = (x: number, title: string, sub = "") =>
    `<rect class="box" x="${x}" y="104" width="136" height="${sub ? 64 : 56}" rx="10"/><text class="t" x="${x + 68}" y="${sub ? 130 : 137}" text-anchor="middle">${title}</text>${sub ? `<text class="s" x="${x + 68}" y="150" text-anchor="middle">${sub}</text>` : ""}`;
  return `<svg class="dg" viewBox="0 0 880 290" role="img" aria-label="${t.pPlan} → ${t.pCritic} → ${t.pCode} → ${t.pReview} → ${t.pAudit}">
<defs>${marker(`${a}-m`, "mk")}${marker(`${a}-ma`, "mk acc")}</defs>
<rect class="hubbox" x="20" y="16" width="840" height="38" rx="10"/><text class="s strong" x="440" y="40" text-anchor="middle">${t.pConductor}</text>
${xs.map((x) => `<line class="life" x1="${x + 68}" y1="54" x2="${x + 68}" y2="102"/>`).join("")}
${stage(xs[0], t.pPlan)}${stage(xs[1], t.pCritic, t.pCriticSub)}${stage(xs[2], t.pCode)}${stage(xs[3], t.pReview)}${stage(xs[4], t.pAudit, t.pAuditSub)}
${xs.slice(0, 4).map((x) => `<line class="ln" x1="${x + 136}" y1="134" x2="${x + 174}" y2="134" marker-end="url(#${a}-m)"/>`).join("")}
<path class="ln acc" d="M264 168 V200 H88 V162" marker-end="url(#${a}-ma)"/><text class="lbl acc" x="176" y="218" text-anchor="middle">${t.pLoop1}</text>
<path class="ln acc" d="M616 162 V200 H440 V162" marker-end="url(#${a}-ma)"/><text class="lbl acc" x="528" y="218" text-anchor="middle">${t.pLoop2}</text>
<rect class="box" x="20" y="240" width="840" height="36" rx="10"/><text class="s" x="440" y="263" text-anchor="middle">${t.pBoard}</text>
</svg>`;
}

function screenMap(t: (typeof L)["vi"]): string {
  const dot = (x: number, y: number, n: string) =>
    `<circle class="callout" cx="${x}" cy="${y}" r="12"/><text class="callnum" x="${x}" y="${y + 4.5}" text-anchor="middle">${n}</text>`;
  return `<svg class="dg" viewBox="0 0 880 330" role="img" aria-label="${t.l1}, ${t.l2}, ${t.l3}, ${t.l4}, ${t.l5}, ${t.l6}">
<rect class="box" x="10" y="10" width="860" height="310" rx="14"/>
<line class="sep" x1="10" y1="40" x2="870" y2="40"/>
<rect class="skel" x="26" y="20" width="60" height="10" rx="5"/><rect class="skel" x="110" y="20" width="160" height="12" rx="6"/>
<line class="sep" x1="200" y1="40" x2="200" y2="320"/><line class="sep" x1="680" y1="40" x2="680" y2="320"/>
${[60, 100, 140, 180, 220].map((y) => `<rect class="skel" x="26" y="${y}" width="16" height="16" rx="4"/><rect class="skel" x="50" y="${y + 2}" width="${100 + (y % 3) * 12}" height="8" rx="4"/><rect class="skel soft" x="50" y="${y + 14}" width="70" height="6" rx="3"/>`).join("")}
<rect class="bubble" x="470" y="58" width="190" height="34" rx="12"/>
<rect class="skel" x="222" y="108" width="18" height="18" rx="5"/><rect class="skel" x="248" y="112" width="90" height="9" rx="4"/>
<rect class="skel soft" x="248" y="134" width="360" height="8" rx="4"/><rect class="skel soft" x="248" y="148" width="300" height="8" rx="4"/>
<rect class="inner" x="248" y="164" width="400" height="26" rx="7"/><rect class="skel soft" x="262" y="173" width="200" height="8" rx="4"/>
<rect class="okbox" x="248" y="200" width="400" height="46" rx="9"/><rect class="skel soft" x="262" y="214" width="260" height="8" rx="4"/><rect class="skel" x="262" y="228" width="70" height="10" rx="4"/>
<rect class="inner" x="252" y="268" width="392" height="40" rx="12"/>
${[60, 124, 188].map((y) => `<rect class="skel" x="696" y="${y}" width="22" height="22" rx="6"/><rect class="skel" x="726" y="${y + 2}" width="80" height="9" rx="4"/><rect class="skel soft" x="726" y="${y + 16}" width="120" height="6" rx="3"/><rect class="inner" x="726" y="${y + 30}" width="54" height="16" rx="5"/>`).join("")}
${dot(186, 58, "1")}${dot(222, 88, "2")}${dot(662, 177, "3")}${dot(662, 223, "4")}${dot(856, 58, "5")}${dot(662, 288, "6")}
</svg>`;
}

function crewSlot(): string {
  return `<div class="guide-crew"></div>`;
}

function copyBlock(cmd: string): string {
  return `<div class="cmd"><code>${cmd}</code><button class="btn ghost sm icon" data-copy-text="${cmd}" title="copy"><svg class="ico sm" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button></div>`;
}

function doc(lang: Lang): string {
  const t = L[lang];
  const vi = lang === "vi";
  const sec = (id: string, title: string, body: string) => `<section class="gsec" id="g-${id}-${lang}"><h2>${title}</h2>${body}</section>`;
  const toc: Array<[string, string]> = vi
    ? [["how", "Cách ekip hoạt động"], ["folders", "Làm việc theo folder"], ["life", "Vòng đời một việc"], ["handoff", "Khi agent giao việc cho nhau"], ["crew", "Ê-kíp của bạn"], ["pipeline", "Quy trình"], ["screens", "Dùng các trang"], ["cost", "Chi phí và token"], ["start", "Bắt đầu dự án mới"], ["trouble", "Khi có gì đó sai"]]
    : [["how", "How ekip works"], ["folders", "Working by folder"], ["life", "The life of a task"], ["handoff", "When agents hand work to each other"], ["crew", "Your crew"], ["pipeline", "Flows"], ["screens", "Using the screens"], ["cost", "Cost and tokens"], ["start", "Start a new project"], ["trouble", "When something goes wrong"]];

  const body = vi
    ? [
        sec("how", "Cách ekip hoạt động", `
<p>ekip là phòng điều phối cho các coding agent. Bạn giao việc bằng lời; hub tự bật đúng agent, các agent có thể giao việc cho nhau, và mọi kết quả đổ về một chỗ.</p>
<figure>${arch(t, lang)}<figcaption>Bạn chỉ nói chuyện với hub. Khi có việc, hub bật agent ở chế độ chạy nền; agent làm xong thì báo kết quả ngược về qua MCP rồi tự tắt — không cần mở app của bên nhận. Agent đang làm sáng đèn đỏ.</figcaption></figure>
<ul class="facts">
<li><b>Hub</b> chạy trong thư mục dự án (<code>ekip serve</code>), mỗi dự án một hub.</li>
<li><b>Hàng đợi việc</b> giữ từng việc và trạng thái của nó; <b>bảng đen</b> giữ những thứ cần truyền qua nhiều lượt chạy như kế hoạch hay kết luận review.</li>
<li><b>Canh gác</b> phát hiện agent chết im (hết quota, thiếu quyền, sai tên model) và báo lỗi kèm lý do trong vài giây.</li>
</ul>`),
        sec("folders", "Làm việc theo folder", `
<p>Mỗi hội thoại gắn với một folder dự án. Agent chạy ngay trong folder đó, nên tự đọc <code>CLAUDE.md</code>, <code>AGENTS.md</code> và cấu hình riêng của dự án.</p>
<ul class="facts">
<li><b>Chọn folder trước khi gửi.</b> Ở hội thoại mới, bấm nút folder cạnh người nhận: chọn folder gần đây, hoặc <b>Chọn folder khác…</b> để duyệt thư mục trên máy. Folder có <code>.git</code>, <code>package.json</code>… được đánh dấu "dự án".</li>
<li><b>Hội thoại giữ nguyên folder.</b> Trả lời tiếp, hay việc agent giao cho nhau bên trong, đều làm trong folder đó.</li>
<li><b>Sidebar gom theo folder.</b> Folder có việc đang chạy nổi lên đầu; nút <kbd>+</kbd> trên mỗi nhóm mở hội thoại mới ngay trong folder đó; bấm tên nhóm để thu gọn.</li>
<li><b>Agent chỉ làm trong folder đó.</b> Mỗi lượt chạy được dặn rõ folder làm việc. Với Claude, ekip gắn thêm một hàng rào: mọi lần đọc, ghi, tìm file hay chạy lệnh chạm tới folder khác đều bị chặn và báo lại cho agent, transcript hiện dòng cảnh báo. Với Gemini, Antigravity không có cơ chế chặn tương tự nên chỉ dựa vào lời dặn.</li>
<li><b>Mỗi folder một bảng đen riêng.</b> Khoá <code>plan.v1</code> ở dự án A và dự án B là hai giá trị khác nhau, không lẫn vào nhau. Bảng việc hiển thị bảng đen của folder đang lọc.</li>
<li><b>Giới hạn song song tính theo từng folder</b>, nên một dự án bận không bắt dự án khác phải xếp hàng; vẫn có một trần chung cho cả hub để giữ quota.</li>
<li><b>Ê-kíp, log và lịch sử vẫn ở hub</b> — không rải file vào dự án. Bảng việc lọc được theo folder.</li>
</ul>`),
        sec("life", "Vòng đời một việc", `
<p>Mỗi việc đi qua các trạng thái dưới đây. Màu trong sơ đồ trùng với nhãn bạn thấy trên Trò chuyện và Bảng việc.</p>
<figure>${lifecycle(t, lang)}<figcaption>Việc thường đi thẳng hàng trên. Hai nhánh dưới là hai cách một việc kết thúc mà không xong: tự lỗi, hoặc bạn chủ động dừng.</figcaption></figure>
<ul class="states">
<li><span class="pill queued">đang chờ</span> Hub đã nhận việc; nếu các slot song song đang bận thì xếp hàng.</li>
<li><span class="pill working">đang làm</span> Agent đã nhận việc và đang chạy — có đồng hồ đếm và nút Dừng.</li>
<li><span class="pill done">xong</span> Agent đã báo kết quả, kèm file và log làm biên nhận.</li>
<li><span class="pill failed">lỗi</span> Có lý do cụ thể đi kèm, ví dụ "model không được nhận diện" hay "hết quota".</li>
<li><span class="pill cancelled">đã dừng</span> Bạn bấm Dừng; mọi việc đã giao tiếp từ nó cũng dừng theo.</li>
</ul>`),
        sec("handoff", "Khi agent giao việc cho nhau", `
<p>Một agent có thể chia việc và giao cho thành viên khác, rồi chờ kết quả. Thứ tự các bước:</p>
<figure>${sequence(t, lang)}<figcaption>Điều phối không tự viết code: nó giao cho Lập trình qua hub, chờ, rồi tổng hợp. Mũi tên màu là kết quả đi ngược về.</figcaption></figure>
<p>Trong Trò chuyện, việc được giao hiện thành một khối lồng ngay dưới dòng "giao cho…", nên bạn đọc được ai nhờ ai làm gì. Agent chọn người nhận dựa vào <b>mô tả việc</b> của từng thành viên — mô tả càng rõ, chọn càng đúng.</p>`),
        sec("crew", "Ê-kíp của bạn", `
<p>Đây là các thành viên đang có trong dự án này. Mỗi người có <b>@id</b> để agent gọi nhau, <b>tên</b> để bạn đọc, và <b>việc</b> để cả ê-kíp biết nên nhờ ai. Sửa trong <a href="/settings" data-go="/settings">Cài đặt</a>.</p>
${crewSlot()}`),
        sec("pipeline", "Quy trình", `
<p>Quy trình là chuỗi chặng cố định mà <b>hub tự chạy</b>: mỗi chặng giao cho một vai, kết quả được chấm qua <b>cổng</b>, chưa đạt thì hub tự quay lại chặng trước kèm nhận xét, và dừng hẳn khi hết số vòng. Luật nằm trong code của hub, không phụ thuộc agent có nhớ lời dặn hay không.</p>
<figure>${pipeline(t, lang)}<figcaption>Quy trình "Tính năng lớn": kế hoạch phải qua phản biện (≥ 90 điểm) mới được code; code phải qua review (mở đầu bằng APPROVE hoặc DUYỆT) mới đến kiểm định cuối (SHIP). Mỗi vòng sửa tối đa 3 lần.</figcaption></figure>
<ul class="facts">
<li><b>Chạy thế nào:</b> ở hội thoại mới, bấm vào người nhận (hoặc gõ @) rồi chọn trong mục <b>Quy trình</b>; hoặc <code>ekip flow code-review "mô tả việc"</code> ở terminal.</li>
<li><b>Có sẵn:</b> "Code rồi review" (Lập trình · Claude → Review, 2 vòng) và "Tính năng lớn" (cần đủ các vai Lên kế hoạch, Phản biện, Kiểm định). Quy trình thiếu vai sẽ bị làm mờ kèm lý do.</li>
<li><b>Tự viết:</b> thêm file JSON vào <code>.ekip/flows/</code> của dự án (hoặc <code>~/.ekip/flows/</code> cho cả máy). Mỗi chặng có <code>agent</code>, <code>prompt</code> (dùng được <code>{{input}}</code>, <code>{{feedback}}</code>, <code>{{prev.&lt;chặng&gt;}}</code>), tuỳ chọn <code>gate</code> và <code>onFail</code>.</li>
<li><b>Khi nào dùng:</b> việc nhỏ gửi thẳng Lập trình · Claude là rẻ nhất (đo thực tế: 1 lượt chạy). Dùng quy trình khi cần review bắt buộc; Điều phối hợp với việc mơ hồ cần chia nhỏ.</li>
</ul>`),
        sec("screens", "Dùng các trang", `
<figure>${screenMap(t)}<figcaption>Trang Trò chuyện, các số khớp với danh sách bên dưới.</figcaption></figure>
<ol class="legend">
<li><b>Hội thoại</b> — nhóm theo Đang chạy, Hôm nay, Trước đó. Ô lọc tìm được cả khi gõ không dấu.</li>
<li><b>Transcript</b> — yêu cầu của bạn, lời agent, và các khối việc được giao lồng bên dưới.</li>
<li><b>Các bước làm</b> — tự mở khi agent đang làm, tự gập khi xong. Bấm từng bước để xem chi tiết.</li>
<li><b>Kết quả</b> — thẻ xanh (hoặc đỏ nếu lỗi) kèm biên nhận: file đã đổi, log kiểm tra, nút sao chép.</li>
<li><b>Ê-kíp</b> — ai đang làm gì, được bao lâu, hôm nay tốn bao nhiêu. Nút Nhắn chọn người nhận, nút Dừng dừng việc.</li>
<li><b>Ô soạn</b> — gõ <kbd>@</kbd> để chọn người nhận, <kbd>Enter</kbd> để gửi, <kbd>Shift</kbd>+<kbd>Enter</kbd> xuống dòng.</li>
</ol>
<ul class="facts">
<li><b>Bảng việc</b> — các cột Đang chờ, Đang làm, Xong, Lỗi. Lọc theo thành viên; bấm thẻ để xem chi tiết, log, chi phí và dừng.</li>
<li><b>Cài đặt</b> — ngôn ngữ báo cáo, và cho từng vai: tên, việc, model, mức suy nghĩ, số việc song song, xem chỉ dẫn vai. Đổi là tự lưu, áp dụng từ việc tiếp theo.</li>
<li><kbd>⌘</kbd>+<kbd>K</kbd> mở bảng lệnh để nhảy tới trang, hội thoại hoặc nhắn cho một thành viên. <kbd>Esc</kbd> đóng mọi bảng.</li>
</ul>`),
        sec("cost", "Chi phí và token", `
<p>Số liệu lấy từ tổng kết cuối mỗi lượt chạy mà chính Claude Code gửi ra, không phải ekip tự đoán. Nên đọc như sau:</p>
<ul class="facts">
<li><b>Chi phí (≈ $)</b> là giá API niêm yết của Anthropic cho đúng số token lượt đó dùng — đối chiếu tay theo bảng giá khớp đến phần triệu đô. Nếu bạn đăng nhập bằng <b>gói Claude</b>, đây là <b>giá trị tham chiếu</b>: bạn không bị tính tiền theo token, lượt chạy trừ vào hạn mức của gói.</li>
<li><b>Token ra</b> là phần model thật sự viết. <b>Token vào</b> phần lớn là <b>đọc lại từ cache</b> (hướng dẫn hệ thống, công cụ, ngữ cảnh) — rất nhiều về số lượng nhưng chỉ tốn 1/10 giá. Bấm một thẻ trong Bảng việc để xem thanh phân bổ.</li>
<li>Mỗi lượt chạy mới phải <b>ghi cache</b> phần khởi đầu, nên việc nhỏ vẫn có giá sàn: đo thực tế khoảng 0,10–0,28 đô với Sonnet, 0,04–0,11 đô với Haiku, trên 0,5 đô với Opus.</li>
<li>Số liệu đến <b>chậm khoảng hai phút</b> sau khi việc xong ("đang chờ số liệu…"), vì tiến trình Claude còn chạy nốt bước kết thúc.</li>
<li><b>Không có số liệu</b> cho Gemini (Antigravity không báo token) và cho lượt bị dừng hoặc lỗi giữa chừng; tổng của hội thoại ghi rõ bao nhiêu lượt bị thiếu.</li>
<li><b>Ngân sách mỗi yêu cầu</b> (Cài đặt): mỗi tin bạn gửi — cùng mọi việc agent giao tiếp từ nó — mỗi lần chạy quy trình, được tối đa bao nhiêu <b>lượt chạy</b>, <b>token ra</b> và <b>phút</b> (mặc định 20 lượt, 120 phút). Chạm giới hạn thì hub không bật thêm lượt nào và ghi lý do vào hội thoại; hết giờ thì dừng cả việc đang chạy. Token chỉ biết sau khi lượt chạy báo về, nên giới hạn token chặn từ lượt kế tiếp. Tin nhắn tiếp theo của bạn trong cùng hội thoại có ngân sách mới. Đầu hội thoại hiện <b>đã dùng/giới hạn</b>, chuyển màu cam khi quá 80%.</li>
</ul>`),
        sec("start", "Bắt đầu dự án mới", `
<ol class="steps">
<li><b>Cài một lần cho máy.</b>${copyBlock("npm install -g @swtiit/ekip")}</li>
<li><b>Vào thư mục dự án và khởi tạo.</b> Lệnh tạo <code>ekip.config.json</code> từ ê-kíp mặc định của máy và nối sẵn <code>.mcp.json</code> cho Claude Code.${copyBlock("ekip init")}</li>
<li><b>Bật hub</b>, giữ cửa sổ terminal mở, rồi mở web app.${copyBlock("ekip serve")}</li>
<li><b>Nếu dùng Gemini</b>, thêm hub vào <code>~/.gemini/config/mcp_config.json</code> và cấp quyền <code>mcp(ekip/*)</code>, <code>write_file(*)</code> trong <code>~/.gemini/config/config.json</code>. <code>ekip init</code> in sẵn đoạn cần dán.</li>
<li><b>Giao việc đầu tiên</b> trong Trò chuyện — thử một việc nhỏ trước để xem cả vòng chạy.</li>
</ol>`),
        sec("trouble", "Khi có gì đó sai", `
<div class="tablewrap"><table class="gtable">
<thead><tr><th>Bạn thấy</th><th>Thường là do</th><th>Làm gì</th></tr></thead>
<tbody>
<tr><td>Lỗi "not recognized as a known model"</td><td>Tên model đã đổi theo bản cập nhật</td><td>Chọn lại model trong Cài đặt — danh sách Gemini đọc trực tiếp</td></tr>
<tr><td>Lỗi có "session limit", "quota", "429"</td><td>Hết quota gói</td><td>Chờ reset, hoặc giao cho vai dùng model rẻ hơn</td></tr>
<tr><td>Gemini lỗi "auto-denied"</td><td>Thiếu quyền cho thao tác đó</td><td>Thêm quyền tương ứng trong <code>~/.gemini/config/config.json</code></td></tr>
<tr><td>Việc nằm "đang chờ" rất lâu</td><td>Hết slot song song</td><td>Tăng "Song song" trong Cài đặt, hoặc dừng bớt việc</td></tr>
<tr><td>Agent trả lời tiếng Anh</td><td>Chưa đặt ngôn ngữ báo cáo</td><td>Cài đặt → Ngôn ngữ báo cáo → Tiếng Việt</td></tr>
<tr><td>Không mở được web app</td><td>Hub chưa chạy</td><td>Chạy <code>ekip serve</code> trong thư mục dự án</td></tr>
</tbody></table></div>`),
      ]
    : [
        sec("how", "How ekip works", `
<p>ekip is a control room for coding agents. You hand out work in plain words; the hub launches the right agent, agents can hand work to each other, and every result lands in one place.</p>
<figure>${arch(t, lang)}<figcaption>You only ever talk to the hub. When there is work, it launches an agent headless; the agent reports back over MCP and exits — no need to open the receiving app. A working agent lights its red lamp.</figcaption></figure>
<ul class="facts">
<li><b>The hub</b> runs inside your project folder (<code>ekip serve</code>) — one hub per project.</li>
<li><b>The task queue</b> keeps each task and its state; <b>the blackboard</b> keeps what must outlive a single run, such as plans and review verdicts.</li>
<li><b>The watchdog</b> notices agents that die quietly (quota, permissions, a stale model name) and fails the task with the reason within seconds.</li>
</ul>`),
        sec("folders", "Working by folder", `
<p>Every conversation belongs to a project folder. Agents run inside it, so they pick up that project's <code>CLAUDE.md</code>, <code>AGENTS.md</code> and settings on their own.</p>
<ul class="facts">
<li><b>Pick the folder before you send.</b> In a new conversation, press the folder button next to the recipient: choose a recent folder, or <b>Choose another folder…</b> to browse your disk. Folders with <code>.git</code>, <code>package.json</code>… are marked as projects.</li>
<li><b>A conversation keeps its folder.</b> Replies, and work agents hand to each other inside it, all happen there.</li>
<li><b>The sidebar groups by folder.</b> Folders with running work rise to the top; the <kbd>+</kbd> on a group starts a conversation right in that folder; click a group's name to fold it.</li>
<li><b>Agents stay inside that folder.</b> Every run is told its working folder. For Claude, ekip adds a guard: any read, write, search or command that reaches another folder is blocked and explained to the agent, and the transcript shows a warning. Antigravity has no equivalent hook, so Gemini runs rely on the instruction alone.</li>
<li><b>Each folder has its own blackboard.</b> <code>plan.v1</code> in project A and in project B are different values that never mix. Board shows the blackboard of the folder you filter by.</li>
<li><b>Parallel limits count per folder</b>, so a busy project doesn't make another one wait; a ceiling across the whole hub still guards your quota.</li>
<li><b>The crew, logs and history stay with the hub</b> — nothing is sprinkled into your projects. Board can filter by folder.</li>
</ul>`),
        sec("life", "The life of a task", `
<p>Every task moves through these states. The colours match the labels on Chat and Board.</p>
<figure>${lifecycle(t, lang)}<figcaption>Most tasks go straight along the top row. The two branches below are the ways a task ends without finishing: it fails, or you stop it.</figcaption></figure>
<ul class="states">
<li><span class="pill queued">queued</span> The hub has it; if every parallel slot is busy, it waits its turn.</li>
<li><span class="pill working">working</span> An agent picked it up and is running — with a timer and a Stop button.</li>
<li><span class="pill done">done</span> The agent reported back, with files and logs as receipts.</li>
<li><span class="pill failed">failed</span> Always with a concrete reason, such as "model not recognized" or "quota".</li>
<li><span class="pill cancelled">stopped</span> You pressed Stop; everything handed out from it stops too.</li>
</ul>`),
        sec("handoff", "When agents hand work to each other", `
<p>An agent can split work, hand a piece to another member, and wait for the result. In order:</p>
<figure>${sequence(t, lang)}<figcaption>The conductor writes no code: it hands the work to a coder through the hub, waits, then summarises. Coloured arrows are results travelling back.</figcaption></figure>
<p>In Chat, handed-out work appears as a block nested right under the "hands to…" line, so you can read who asked whom to do what. Agents choose whom to ask from each member's <b>job</b> — the clearer the job, the better the choice.</p>`),
        sec("crew", "Your crew", `
<p>These are the members of this project. Each has an <b>@id</b> agents use to address it, a <b>name</b> for you to read, and a <b>job</b> that tells the crew what to ask it for. Edit them in <a href="/settings" data-go="/settings">Settings</a>.</p>
${crewSlot()}`),
        sec("pipeline", "Flows", `
<p>A flow is a fixed chain of stages that <b>the hub runs itself</b>: each stage goes to one role, its result is checked at a <b>gate</b>, a miss sends the work back a stage with the feedback, and the run stops for good when the rounds run out. The rules live in the hub's code, not in whether an agent remembers its instructions.</p>
<figure>${pipeline(t, lang)}<figcaption>The "Big feature" flow: a plan must pass the critic (≥ 90) before any code; code must pass review (starting with APPROVE) before the final audit (SHIP). Each loop runs at most 3 times.</figcaption></figure>
<ul class="facts">
<li><b>Run one:</b> in a new conversation, click the recipient (or type @) and pick from <b>Flows</b>; or run <code>ekip flow code-review "what to build"</code> in a terminal.</li>
<li><b>Built in:</b> "Code, then review" (Claude coder → reviewer, 2 rounds) and "Big feature" (needs planner, critic and auditor roles). A flow missing a role is greyed out with the reason.</li>
<li><b>Write your own:</b> drop a JSON file in the project's <code>.ekip/flows/</code> (or <code>~/.ekip/flows/</code> for the whole machine). Each stage has an <code>agent</code>, a <code>prompt</code> (with <code>{{input}}</code>, <code>{{feedback}}</code>, <code>{{prev.&lt;stage&gt;}}</code>), and optionally a <code>gate</code> and <code>onFail</code>.</li>
<li><b>When to use one:</b> a small task sent straight to the Claude coder is cheapest (measured: one run). Use a flow when review must happen; use the conductor for vague work that needs splitting up.</li>
</ul>`),
        sec("screens", "Using the screens", `
<figure>${screenMap(t)}<figcaption>The Chat screen; numbers match the list below.</figcaption></figure>
<ol class="legend">
<li><b>Conversations</b> — grouped Running, Today, Earlier. The filter matches with or without diacritics.</li>
<li><b>Transcript</b> — your request, the agents' words, and handed-out work nested underneath.</li>
<li><b>Steps</b> — open while an agent works, folded when done. Click a step for its details.</li>
<li><b>Result</b> — a green (or red) card with receipts: changed files, check logs, a copy button.</li>
<li><b>Crew</b> — who is doing what, for how long, and today's cost. Message picks the recipient; Stop stops the run.</li>
<li><b>Composer</b> — type <kbd>@</kbd> to pick who gets it, <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line.</li>
</ol>
<ul class="facts">
<li><b>Board</b> — columns Queued, Working, Done, Failed. Filter by member; click a card for details, log, cost and Stop.</li>
<li><b>Settings</b> — reporting language, and per role: name, job, model, effort, parallelism, role brief. Changes save themselves and apply from the next task.</li>
<li><kbd>⌘</kbd>+<kbd>K</kbd> jumps to any screen, conversation or member. <kbd>Esc</kbd> closes any panel.</li>
</ul>`),
        sec("cost", "Cost and tokens", `
<p>These figures come from the final tally Claude Code itself emits at the end of each run — ekip does not estimate them. Read them like this:</p>
<ul class="facts">
<li><b>Cost (≈ $)</b> is Anthropic's API list price for exactly the tokens that run used — checked by hand against the price list to the micro-dollar. If you sign in with a <b>Claude subscription</b>, it is a <b>reference value</b>: you are not billed per token; runs count against your plan's usage limits.</li>
<li><b>Tokens out</b> is what the model actually wrote. <b>Input</b> is mostly <b>read back from cache</b> (system instructions, tools, context) — large in count but a tenth of the price. Click a card in Board for the breakdown bar.</li>
<li>Every new run has to <b>write its opening context to cache</b>, so even tiny tasks have a floor: measured at roughly $0.10–0.28 on Sonnet, $0.04–0.11 on Haiku, and over $0.50 on Opus.</li>
<li>Figures arrive <b>about two minutes after</b> the work is done ("tallying…"), because the Claude process finishes its shutdown first.</li>
<li><b>No data</b> for Gemini (Antigravity reports no usage) or for runs that were stopped or crashed; a conversation's total says how many runs are missing.</li>
<li><b>Budget per request</b> (Settings): each message you send — with everything agents hand out from it — and each flow run may use at most so many <b>runs</b>, <b>output tokens</b> and <b>minutes</b> (default 20 runs, 120 minutes). At a limit the hub starts nothing more for it and says why in the conversation; running out of time also stops work in flight. Tokens are only known once a run reports, so a token limit stops the next run. Your next message in the conversation gets a fresh budget. The conversation header shows <b>used/limit</b>, turning amber past 80%.</li>
</ul>`),
        sec("start", "Start a new project", `
<ol class="steps">
<li><b>Install once per machine.</b>${copyBlock("npm install -g @swtiit/ekip")}</li>
<li><b>In your project folder, initialise.</b> This writes <code>ekip.config.json</code> from your machine's default crew and wires <code>.mcp.json</code> for Claude Code.${copyBlock("ekip init")}</li>
<li><b>Start the hub</b>, keep the terminal open, and open the web app.${copyBlock("ekip serve")}</li>
<li><b>Using Gemini?</b> Add the hub to <code>~/.gemini/config/mcp_config.json</code> and grant <code>mcp(ekip/*)</code> and <code>write_file(*)</code> in <code>~/.gemini/config/config.json</code>. <code>ekip init</code> prints the snippet.</li>
<li><b>Hand out a first task</b> in Chat — something small, to watch a whole round.</li>
</ol>`),
        sec("trouble", "When something goes wrong", `
<div class="tablewrap"><table class="gtable">
<thead><tr><th>You see</th><th>Usually because</th><th>Do this</th></tr></thead>
<tbody>
<tr><td>"not recognized as a known model"</td><td>The model name changed in an update</td><td>Pick the model again in Settings — Gemini's list is read live</td></tr>
<tr><td>"session limit", "quota" or "429"</td><td>Your plan's quota ran out</td><td>Wait for the reset, or hand it to a role on a cheaper model</td></tr>
<tr><td>Gemini "auto-denied"</td><td>A permission is missing</td><td>Add the grant in <code>~/.gemini/config/config.json</code></td></tr>
<tr><td>A task sits "queued" for long</td><td>Every parallel slot is busy</td><td>Raise "Parallel" in Settings, or stop some work</td></tr>
<tr><td>Agents answer in the wrong language</td><td>No reporting language set</td><td>Settings → Reporting language</td></tr>
<tr><td>The web app won't open</td><td>The hub isn't running</td><td>Run <code>ekip serve</code> in the project folder</td></tr>
</tbody></table></div>`),
      ];

  return `<div class="guide-doc" data-lang="${lang}">
<nav class="gtoc"><div class="gtoc-title">${vi ? "Trong trang này" : "On this page"}</div>${toc.map(([id, title]) => `<a href="#g-${id}-${lang}" data-anchor="g-${id}-${lang}">${title}</a>`).join("")}</nav>
<article class="garticle">
<header class="ghead"><div class="eyebrow">${vi ? "Hướng dẫn sử dụng" : "User guide"}</div><h1>${vi ? "Làm việc với ê-kíp agent" : "Working with your agent crew"}</h1>
<p class="glead">${vi ? "Mười phút đọc: hệ thống chạy thế nào, một việc đi qua những bước nào, và cách dùng từng trang." : "A ten-minute read: how the system runs, what a task goes through, and how to use each screen."}</p></header>
${body.join("\n")}
</article>
</div>`;
}

export function guideHtml(): string {
  return doc("vi") + doc("en");
}
