# Hướng dẫn sử dụng ekip (tiếng Việt)

**ekip** — từ chữ *ê-kíp*: một nhóm làm việc ăn ý. Công cụ này lắp một ê-kíp
coding agent (Claude Code, Google Antigravity, và bất kỳ CLI nào) cho dự án
của bạn: các agent **giao việc cho nhau, trò chuyện trong cùng một hội thoại,
chia sẻ bảng đen chung**, còn bạn theo dõi và điều khiển từ một web app.

> Bản đầy đủ có hình minh hoạ nằm ngay trong app: mở hub rồi vào mục
> **Hướng dẫn** (`/guide`). File này là bản tóm tắt để đọc trên GitHub.

## 1. Khái niệm trong 60 giây

- **Hub** — một server nhỏ cho mỗi dự án (`ekip serve`). Mọi agent cắm vào
  hub qua MCP; không agent nào nói chuyện trực tiếp với agent nào.
- **Task** — một việc giao từ người/agent này sang agent kia, đi qua
  `pending → claimed → done / failed / cancelled`. Việc giao tiếp nối vào
  cùng **hội thoại** với việc gốc.
- **Bảng đen** — kho ngữ cảnh key/value (`plan.v1`, `review.round1`…), **mỗi
  folder một bảng**. Agent chạy nền là "một lần rồi thôi", ngữ cảnh sống sót
  nhờ bảng đen.
- **Dispatcher** — khi có task, hub tự bật CLI chạy nền của agent đích
  (`claude -p`, `agy -p`…), xong việc thì tiến trình tự tắt. **Không cần mở
  app nào của bên nhận.** Agent chết im (hết quota, thiếu quyền, thiếu binary)
  thì task `failed` trong vài giây, kèm lý do lấy từ log.
- **Quy trình (flow)** — chuỗi chặng cố định do **hub tự chạy**, có cổng chấm
  điểm và vòng lặp có giới hạn (mục 6).

## 2. Cài đặt (một lần cho máy)

```bash
npm install -g @swtiit/ekip   # lệnh cài xong tên là `ekip`
# hoặc từ source: git clone https://github.com/swtiit/ekip && cd ekip
#                 npm install && npm run build && npm link
```

Claude Code chỉ cần đăng nhập sẵn (`claude` → `/login`). Phía **Antigravity**
cần 2 chỉnh global (một lần):

1. Thêm server vào `~/.gemini/config/mcp_config.json`:
   `"ekip": { "serverUrl": "http://127.0.0.1:4319/mcp" }`
2. Thêm `"mcp(ekip/*)"` vào `userSettings.globalPermissionGrants.allow` trong
   `~/.gemini/config/config.json`. Agent cần sửa file thì thêm
   `"write_file(*)"`; cần chạy lệnh gì thì thêm `"command(<lệnh>)"` từng cái.

> Headless agy bị từ chối quyền là **chết cả run** — grant phải phủ đủ những
> gì vai đó cần làm.

## 3. Dùng cho một dự án

```bash
cd du-an-cua-ban
ekip init     # sinh ekip.config.json từ chuẩn máy + tự nối .mcp.json
ekip serve    # hub + web app
ekip ui       # mở http://127.0.0.1:4319/chat
```

Nếu đã có "chuẩn máy" (mục 8) thì hai lệnh đầu là **toàn bộ** setup.

## 4. Web app

Thanh trên cùng có 4 mục. Giao diện theo ngôn ngữ của hub (đặt tiếng Việt là
giao diện tiếng Việt).

| Mục | Dùng để |
| --- | --- |
| **Trò chuyện** `/chat` | Gõ yêu cầu, bấm vào người nhận (hoặc gõ `@`) để chọn agent hay quy trình. Khung giữa hiện từng agent nói gì, dùng tool gì (viết bằng lời thường), giao việc cho ai (khối lồng bên dưới), kết quả và biên nhận (file, log). Thanh bên trái gom hội thoại **theo folder**, mỗi folder hiện 10 cái, bấm "Xem thêm" để hiện hết; xoá hội thoại bằng nút thùng rác. Bảng bên phải là ê-kíp: ai đang làm gì, bao lâu, nút Dừng và Nhắn. |
| **Bảng việc** `/board` | Kanban theo trạng thái, lọc theo agent, tìm kiếm. Bấm thẻ để xem yêu cầu, kết quả, model, token, log. Bảng đen nằm cạnh. |
| **Hướng dẫn** `/guide` | Sơ đồ cách hệ thống chạy, vòng đời một việc, quy trình, cách đọc chi phí. |
| **Cài đặt** `/settings` | Cách Claude tính phí, ngôn ngữ báo cáo, ngân sách mỗi yêu cầu, xem các giới hạn của hub (sửa trong `ekip.config.json`); từng thành viên: tên hiển thị, việc, model (danh sách lấy trực tiếp khi hãng có), effort, số việc song song, tự bật. Lưu ngay khi đổi. |

`⌘K` mở bảng lệnh: nhảy tới hội thoại, agent, quy trình, trang bất kỳ.

## 5. Làm việc theo folder

Trước khi gửi, chọn **folder** ở ô dưới khung soạn (folder gần đây hoặc duyệt
thư mục). Folder quyết định:

- Agent **chạy trong folder đó** và đọc `CLAUDE.md` / `AGENTS.md` của nó.
- **Bảng đen riêng** cho folder; giới hạn song song tính theo folder
  (`maxConcurrent`, mặc định 4 mỗi folder; `maxConcurrentTotal` mặc định 8).
- **Chặn ngoài folder** (`folderGuard`, mặc định bật): mọi run được báo folder
  của nó; riêng Claude còn có hook PreToolUse chặn cứng mọi thao tác đọc/ghi/
  tìm/lệnh shell trỏ ra ngoài (đã thử thật: không có hook thì `claude -p` đọc
  và ghi sang folder bên cạnh thoải mái). Antigravity không có hook, nên trên
  macOS ekip chạy agy trong **sandbox của hệ điều hành**: chỉ ghi được vào
  folder và chỗ agent giữ trạng thái/cache (`~/.gemini`, `~/.cache`,
  `~/Library/Caches`…) — không ghi được `~/.zshrc`, LaunchAgents hay dự án
  khác; không đọc được folder khác trong home và các file credential
  (`~/.ssh`, `~/.aws`, `~/.netrc`, `~/.npmrc`, cấu hình gh/docker, file của
  Claude, lịch sử shell, profile trình duyệt, Mail). File keychain vẫn đọc
  được vì agy đăng nhập qua đó. Đã thử thật với agy. Linux/Windows thì Gemini
  chỉ được dặn. Agent khác (kể cả Claude) muốn chặn cứng thì thêm
  `"sandbox": true`.
- **Hook của Claude là rào chắn mềm:** nó đọc đường dẫn trong lệnh nên chặn
  được nhầm lẫn thông thường, nhưng lách được bằng `$HOME/…`, symlink hay
  script giải mã. Muốn chặn cứng cho Claude thì bật `"sandbox": true`.
- **Mỗi folder một người sửa:** agent có quyền sửa file (Antigravity, hoặc
  Claude có `acceptEdits`; hoặc đặt `"writer": true`) không chạy hai cái cùng
  lúc trong một folder (`writersPerFolder`, mặc định 1). Cái sau xếp hàng với
  lý do "another agent is editing this folder". Review, Điều phối chạy song
  song bình thường.
- **Mỗi lượt chạy có khoá riêng:** hub cấp cho mỗi worker một khoá bí mật; chỉ
  khoá đó mới nhận (claim) được task, nên phiên khác không thể giành việc rồi
  tự báo "APPROVE" thay reviewer. Việc giao tiếp từ lượt chạy tự gắn vào task
  của nó (cùng folder, ngân sách, độ sâu). Kết quả đã báo xong thì không thay
  được.
- **Lưu ý:** bật `openAccess` là bỏ hàng rào này — mọi tiến trình trên máy,
  kể cả agent, gọi thẳng được HTTP API.
- **Tắt / bật lại hub:** Ctrl+C dừng luôn các worker hub đã bật và ghi lý do
  lên task. Bật lại thì việc đang xếp hàng tự chạy tiếp; quy trình đang dở bị
  đánh dấu thất bại "hub đã khởi động lại" để bạn chạy lại.

## 6. Quy trình (flow) — luật cứng do hub chạy

Trước đây quy trình nhiều chặng là lời dặn cho Điều phối; agent quên hay tự
ý bỏ vòng là luật mất tác dụng. Giờ **hub tự chạy**: giao từng chặng, chấm
kết quả qua **cổng**, chưa đạt thì quay lại chặng trước kèm nhận xét, hết số
vòng thì dừng hẳn.

Có sẵn hai quy trình:

- **Code rồi review** (`code-review`): Lập trình · Claude làm và tự chạy
  test → Review kiểm lại; kết quả review phải mở đầu bằng `APPROVE`/`DUYỆT`,
  không thì quay lại sửa, tối đa 2 vòng.
- **Tính năng lớn** (`feature`): Lên kế hoạch → Phản biện (`SCORE ≥ 90`, tối
  đa 3 vòng) → Code → Review (tối đa 3 vòng) → Kiểm định cuối (`SHIP`). Cần
  đủ các vai planner, critic, claude-coder, reviewer, auditor.

Chạy: ở hội thoại mới, chọn người nhận trong mục **Quy trình**; hoặc

```bash
ekip flow                                   # liệt kê (kèm lý do nếu thiếu vai)
ekip flow code-review "Thêm validate cho form đăng ký"
```

Tự viết: thêm file JSON vào `.ekip/flows/` của dự án (hoặc `~/.ekip/flows/`
cho cả máy; file dự án thắng):

```json
{
  "name": "fix-and-check",
  "label": { "en": "Fix, then check", "vi": "Sửa rồi kiểm" },
  "steps": [
    { "id": "fix", "agent": "claude-coder", "title": "Sửa",
      "prompt": "{{input}}\n\nNhận xét cần sửa (vòng đầu để trống):\n{{feedback}}" },
    { "id": "check", "agent": "reviewer", "title": "Kiểm",
      "prompt": "Kiểm thay đổi cho: {{input}}\n\nBáo cáo: {{prev.fix}}",
      "gate": { "startsWith": ["APPROVE", "DUYỆT"] },
      "onFail": { "goto": "fix", "maxRounds": 2 } }
  ]
}
```

- Biến trong `prompt`: `{{input}}` (yêu cầu), `{{feedback}}` (kết quả của
  cổng vừa trượt), `{{prev.<id>}}` (kết quả chặng trước), `{{round}}`,
  `{{run}}` (khoá riêng của lần chạy, dùng cho bảng đen).
- `gate`: `{ "pattern": "SCORE:\\s*(\\d+)", "min": 90 }` hoặc
  `{ "startsWith": ["SHIP"] }`.
- `label`, `description`, `title` viết chuỗi thường hoặc theo ngôn ngữ
  `{ "en": …, "vi": … }`.

## 7. Nên giao cho ai (đã đo thật)

Cùng một việc nhỏ (viết `slugify` + test, chấm bằng 8 ca ẩn — cả ba đều đạt
8/8):

| Cách | Thời gian | Số run | Giá niêm yết Claude |
| --- | --- | --- | --- |
| Gửi thẳng Lập trình · Claude (Sonnet) | 49 giây | 1 | $0.27 |
| Lập trình · Gemini làm → Review (Sonnet) | 122 giây | 2 | $0.30 + quota Gemini |
| Điều phối (Sonnet, effort thấp) → Lập trình · Claude | 114 giây | 2 | $0.62 |

Rút ra:

- **Việc nhỏ, rõ ràng → gửi thẳng Lập trình · Claude.** Rẻ và nhanh nhất.
- **Gemini làm rồi Claude review không tiết kiệm quota Claude** — phần review
  tốn ngang việc tự làm. Dùng Gemini cho việc tay chân nhiều file, không cần
  review kỹ.
- **Điều phối tốn thêm một run đầy đủ** — chỉ đáng khi việc mơ hồ, cần chia
  nhỏ. Việc cần review bắt buộc thì dùng quy trình `code-review`.

## 8. Đội hình, vai và chuẩn máy

Mỗi agent trong `ekip.config.json` là một **vai**: `name` là địa chỉ (ngắn,
ổn định, vd `claude-coder`), `label` là tên hiển thị ("Lập trình · Claude"),
`description` là việc của vai — được báo cho mọi agent nên Điều phối chọn
người theo việc chứ không đoán theo tên.

```json
{ "name": "claude-coder", "adapter": "claude",
  "label": "Lập trình · Claude",
  "description": "Code nặng, cần tự chạy test và sửa đến khi pass.",
  "args": ["--model", "claude-sonnet-5", "--permission-mode", "acceptEdits",
           "--allowedTools", "Read Write Edit Glob Grep Bash(npm test:*)"],
  "promptFile": ".ekip/roles/coder.md" }
```

- **Tầng vai** (`promptFile`): cách làm việc, checklist, format kết quả. Thư
  viện có sẵn ở `examples/roles/` (conductor, planner, critic, coder,
  reviewer, auditor). `coder.md` dùng chung cho cả coder Claude và Gemini —
  nghề giống nhau, chỉ khác model và quyền.
- **Tầng dự án**: `CLAUDE.md` / `AGENTS.md` / `.claude/skills/` — agent tự nạp.
- **Tầng quyền**: Claude thêm `--permission-mode acceptEdits` và
  `--allowedTools`; agy dùng grants (mục 2).
- **Thứ tự ưu tiên** (được ghi rõ trong prompt của mọi run): giới hạn của hub
  (folder, độ sâu, song song) > chỉ dẫn vai > nội dung task > mặc định.

Các field khác trong `ekip.config.json` (đều có mặc định):

| Field | Ý nghĩa |
|---|---|
| `language` | Ngôn ngữ agent viết kết quả, và hub dùng cho thông báo của nó (xếp hàng, dừng, lỗi, cổng, ngân sách) |
| `budget` | Trần mỗi yêu cầu: `{ runs: 20, outputTokens: 0, minutes: 120 }` |
| `maxConcurrent` / `maxConcurrentTotal` | Số worker cùng lúc mỗi folder (4) / toàn hub (8) |
| `writersPerFolder` | Số agent sửa file cùng lúc trong một folder (1) |
| `folderGuard` | Báo và chặn thao tác ngoài folder (bật) |
| `retention.days` | Xoá hội thoại đã xong sau N ngày (14); chỉ xoá khi cả hội thoại đều cũ |
| `watchdog` | `pendingTtlSeconds` (600), `claimedTtlSeconds` (3600), `sweepIntervalSeconds` (30), `enabled` |
| `mcpSessions` | `max` (256) phiên MCP, đóng phiên im lặng sau `idleMinutes` (30) |
| `token` / `agentToken` | Token của bạn / của agent (hoặc `EKIP_TOKEN`, `EKIP_AGENT_TOKEN`); tự sinh nếu bỏ trống |
| `openAccess` | `true` = chạy không cần token |
| `agents[].sandbox` / `writer` / `cwd` | Sandbox hệ điều hành · có sửa file không · folder cố định |

`ekip init --global` lưu mọi field trên làm chuẩn máy, trừ `token` và tên dự án.

Chỉnh đội hình ở một dự án cho ưng rồi `ekip init --global` để lưu làm chuẩn
máy (`~/.ekip/`). Mọi `ekip init` sau tự có nguyên đội hình; file của dự án
luôn thắng chuẩn máy theo từng field.

### Chọn model nào, và làm sao biết id đúng

Claude Code **không có lệnh liệt kê model**, nên danh sách trong Cài đặt là
ghép từ ba nguồn: alias (`opus`, `sonnet`, `haiku`, `fable` — luôn trỏ bản mới
nhất), danh sách tài khoản mà app Claude lưu lại, và những model đã chạy thật
ở đây. Gõ tay id bất kỳ cũng được.

Muốn chắc một id dùng được: bấm **Kiểm tra** cạnh ô model (hoặc
`ekip models --check claude-opus-5`). ekip chạy thử một việc một chữ với id
đó rồi báo id thật nó dùng — ví dụ `sonnet → claude-sonnet-5` — hoặc lý do bị
từ chối. Tốn một phần nhỏ của lượt chạy: đo thật $0.06 với Haiku, khoảng
$0.25 với Opus. `ekip models --refresh` dò cả bốn alias một lượt.

Antigravity thì có danh sách thật: ekip đọc thẳng từ `agy models`.

## 9. Chi phí và token

- **Dùng gói Claude (Pro/Max) đăng nhập ở terminal thì không trả tiền theo
  token** — mỗi run chỉ trừ vào hạn mức của gói. ekip tự nhận ra (qua
  `claude auth status`) và **ẩn số tiền**, chỉ hiện token và thời gian. Muốn
  xem giá quy đổi thì bật trong Cài đặt.
- Nếu môi trường của hub có `ANTHROPIC_API_KEY`, `claude -p` sẽ **tính tiền
  thật theo API** — app hiện số tiền và cảnh báo.
- Con số tiền là **giá niêm yết** × token do chính Claude Code báo
  (`total_cost_usd`), khớp đến micro-dollar với bảng giá. Token hiện trước
  hết là token output; phần đọc cache (rẻ, 0.1×) tách riêng để khỏi thổi phồng.
- Antigravity không báo token — chỉ có thời gian chạy.

### Ngân sách mỗi yêu cầu

Với gói thuê bao, thứ cần giữ là hạn mức của gói. **Cài đặt → Ngân sách mỗi
yêu cầu** đặt trần cho mỗi tin bạn gửi (kèm mọi việc agent giao tiếp từ nó)
và mỗi lần chạy quy trình:

- **Lượt chạy** (mặc định 20), **token ra** (mặc định không giới hạn),
  **phút** (mặc định 120). Đặt 0 là không giới hạn. Phút chỉ tính từ khi lượt
  chạy đầu tiên được bật, nên thời gian xếp hàng hay chờ người không bị tính.
- Chạm trần thì hub không bật thêm lượt nào, ghi "hết ngân sách của yêu cầu
  này" vào hội thoại; hết giờ thì dừng luôn việc đang chạy. Quy trình dừng
  trước chặng không đủ ngân sách và trả kết quả gần nhất.
- Token chỉ biết sau khi lượt chạy báo về, nên trần token chặn từ lượt kế.
- Tin nhắn tiếp theo của bạn trong cùng hội thoại có ngân sách mới.
- Đầu hội thoại hiện `đã dùng/giới hạn`, chuyển cam khi quá 80%. Quy trình
  có sẵn mang ngân sách riêng: `code-review` 4 lượt/45 phút, `feature` 13
  lượt/90 phút.

## 10. Bảo mật

- Hub nghe ở `127.0.0.1` và **từ chối** request đổi trạng thái từ trang web
  khác (bắt buộc `Content-Type: application/json`, Origin phải là hub) và
  request có Host lạ (chống DNS rebinding).
- **Dữ liệu của hub nằm ngoài dự án:** task, hội thoại, bảng đen và log chạy
  để ở `~/.ekip/projects/<tên dự án>-<mã>/`. Lý do: nếu để trong `.ekip/` của
  dự án thì một agent làm việc ngay trong dự án chứa hub sẽ đọc được hội thoại
  của mọi folder khác và sửa được cấu hình hub. Bản cũ tự được dời sang chỗ
  mới ở lần khởi động kế tiếp. Riêng `.ekip/roles` và `.ekip/flows` vẫn nằm
  trong dự án vì đó là file bạn viết và commit.
- **Hub có sẵn hai token**, tự sinh lần chạy đầu, để trong `~/.ekip/auth.json`
  (chỉ bạn đọc được). Xem bằng `ekip token`; xoá file đó là cấp lại cặp mới.
  - **Token của bạn**: mở được cả API và MCP. Web app hỏi một lần rồi nhớ bằng
    cookie; `ekip ui` mở thẳng khỏi cần dán; CLI tự dùng.
  - **Token của agent**: chỉ mở được `/mcp`. Nhờ vậy một agent bị nội dung xấu
    trong repo dụ dỗ cũng chỉ dùng được các công cụ bridge trong phạm vi task
    của nó, không gọi được `/api/delegate` để mở việc ở folder khác. Agent bạn
    tự chạy (Claude Code, agy) thì `export EKIP_AGENT_TOKEN=…`; `ekip init` ghi
    sẵn header này vào `.mcp.json`.
  - Muốn tắt hẳn: `"openAccess": true` trong config — khi đó mọi tiến trình
    trên máy đều điều khiển được hub.
- Hub nghe ra ngoài máy (`host` khác loopback) mà **không có token thì không
  chịu khởi động**.

## 11. CLI

| Lệnh | Công dụng |
|---|---|
| `ekip init` / `init --global` | Sinh config từ chuẩn máy / lưu đội hình làm chuẩn máy |
| `ekip serve` · `ekip ui` | Chạy hub · mở web app |
| `ekip run <agent> <việc\|@file>` | Giao việc + theo dõi live đến khi xong |
| `ekip delegate` · `follow <id>` · `cancel <id>` | Giao không chờ · bám task · dừng cả cây |
| `ekip flow [tên] [việc\|@file]` | Liệt kê hoặc chạy quy trình |
| `ekip config` · `agents` · `model <agent> [model]` | Chọn model tương tác · xem · đổi nóng |
| `ekip tasks [status]` · `task <id>` · `logs <id>` | Tra cứu task, kết quả, log |
| `ekip context [key] [value]` | Đọc/ghi bảng đen |
| `ekip watch` · `ekip status` | Bảng theo dõi trong terminal · tóm tắt |

Mẹo: id task gõ 8 ký tự đầu là đủ; việc dài thì viết vào file rồi `@file`.

## 12. Khi có gì đó sai

- `worker exited ... spawn log hints: "You've hit your session limit"` → hết
  hạn mức Claude, chờ reset rồi giao lại.
- `dispatch refused: ...` → tên agent sai, thiếu adapter, hoặc vượt
  `maxDepth`; sửa config rồi giao lại.
- `... "auto-denied"` → agy thiếu grant — đọc log để biết class quyền rồi
  thêm vào `config.json` của agy.
- `worker failed to start: spawn ... ENOENT` → binary agent không có trong
  PATH của hub.
- Thông báo **"Đã chặn — nằm ngoài folder của hội thoại"** → agent định đụng file ngoài
  folder. Chọn đúng folder, hoặc tắt `folderGuard` nếu thật sự cần.
- Task chờ lâu mà chưa có tiến trình → đang xếp hàng chờ slot; xem ai đang
  chiếm trong bảng ê-kíp hoặc `ekip tasks claimed`.
- Quy trình dừng với **"Dừng ở … Đã hết số vòng"** → cổng trượt quá số vòng
  cho phép; đọc nhận xét cuối, sửa yêu cầu rồi chạy lại.
- Web app hỏi token → hub đang đặt `EKIP_TOKEN`; dán token đó vào.
- Hub không lên: port 4319 bận? Mỗi dự án một hub, chạy lần lượt hoặc đổi
  `port`.

## 13. FAQ nhanh

**Cả hai app phải mở à?** Không — chỉ hub chạy thường trực; bên nhận việc
được bật chạy nền khi cần rồi tự tắt.

**Có phạm điều khoản không?** Chỉ dùng bề mặt chính hãng: MCP + CLI headless
chính thức, tài khoản của chính bạn, không lách rate limit.

**Thêm agent lạ (Codex, Gemini CLI…)?** Adapter `command` + template args là
đủ: `{ "name": "codex", "adapter": "command", "command": "codex", "args": ["exec", "{prompt}"] }`
