# Hướng dẫn sử dụng ekip (tiếng Việt)

**ekip** — từ chữ *ê-kíp*: một nhóm làm việc ăn ý. Công cụ này lắp một ê-kíp
coding agent (Claude Code, Google Antigravity, và bất kỳ CLI nào) cho dự án
của bạn: các agent **giao việc cho nhau, chia sẻ ngữ cảnh chung**, và bạn là
một thành viên ngang hàng trong ê-kíp đó.

## 1. Khái niệm trong 60 giây

- **Hub** — một server nhỏ chạy cho mỗi dự án (`ekip serve`). Mọi agent cắm
  vào hub qua MCP; không agent nào nói chuyện trực tiếp với agent nào.
- **Task** — một đơn vị việc giao từ agent này sang agent kia, đi qua vòng
  đời `pending → claimed → done/failed`.
- **Blackboard** — kho ngữ cảnh chung dạng key/value (`plan.v1`,
  `review.round1`…). Agent chạy headless là "một lần rồi thôi", ngữ cảnh
  sống sót nhờ blackboard.
- **Dispatcher** — khi có task, hub tự bật CLI headless của agent đích
  (`claude -p`, `agy -p`…), xong việc thì process tự tắt. **Không cần mở
  app nào của bên nhận.**
- **Watchdog** — agent chết im (hết quota, thiếu quyền) thì task được đánh
  `failed` kèm lý do moi từ log, không treo vĩnh viễn.

## 2. Cài đặt (một lần cho máy)

```bash
git clone https://github.com/swtiit/ekip && cd ekip
npm install && npm run build && npm link   # có lệnh `ekip`
```

Phía **Antigravity** cần 2 chỉnh global (một lần duy nhất):

1. Thêm server vào `~/.gemini/config/mcp_config.json`:
   `"ekip": { "serverUrl": "http://127.0.0.1:4319/mcp" }`
2. Thêm `"mcp(ekip/*)"` vào `userSettings.globalPermissionGrants.allow`
   trong `~/.gemini/config/config.json`. Agent cần sửa file thì thêm
   `"write_file(*)"`; cần chạy lệnh gì thì thêm `"command(<lệnh>)"` từng cái.

> Lưu ý: headless agy bị từ chối quyền là **chết cả run** — grant phải phủ
> đủ những gì vai đó cần làm.

## 3. Dùng cho một dự án

```bash
cd du-an-cua-ban
ekip init     # sinh ekip.config.json từ chuẩn máy + tự nối .mcp.json
ekip serve    # hub + dashboard, một tab terminal
```

Nếu đã có "chuẩn máy" (xem mục 6) thì hai lệnh trên là **toàn bộ** setup.

Giao việc — ba cửa, chọn cửa nào cũng được:

```bash
# 1. Từ terminal — theo dõi cây tiến trình live:
ekip run coder "Viết unit test cho src/auth"

# 2. Từ dashboard: http://127.0.0.1:4319/ui — form "New task"

# 3. Từ trong Claude Code / Antigravity đang chat:
#    "Delegate cho agy: ... rồi bridge_wait lấy kết quả"
```

## 4. CLI đầy đủ

| Lệnh | Công dụng |
|---|---|
| `ekip init` | Sinh config từ chuẩn máy + nối `.mcp.json` |
| `ekip init --global` | Lưu đội hình + roles của dự án này làm chuẩn máy |
| `ekip serve` | Chạy hub + dashboard |
| `ekip run <agent> <việc\|@file>` | Giao việc + theo dõi live đến khi xong |
| `ekip delegate / follow <id>` | Giao không chờ / bám vào task đang chạy |
| `ekip config` | **Picker tương tác** (như /model của Claude Code): chọn agent → chọn model → effort |
| `ekip agents` / `ekip model <agent> [model]` | Xem / đổi model nóng — áp dụng ngay spawn kế |
| `ekip tasks [status]` / `task <id>` / `logs <id>` | Tra cứu task, kết quả, log |
| `ekip context [key] [value]` | Đọc/ghi blackboard |
| `ekip watch` / `ekip ui` | Bảng theo dõi terminal / mở dashboard |

Mẹo: id task gõ 8 ký tự đầu là đủ; việc dài thì viết vào file rồi `@file`.

## 5. Đội hình và vai (skills 3 tầng)

Mỗi agent trong `ekip.config.json` là một **vai** — cùng adapter nhưng khác
model, khác quyền, khác "nghề":

```json
{ "name": "planner", "adapter": "claude",
  "args": ["--model", "claude-opus-4-8", "--effort", "high"],
  "promptFile": ".ekip/roles/planner.md" }
```

- **Tầng vai** (`promptFile`): nhân cách nghề nghiệp — checklists, luật ứng
  xử, format output. Thư viện 6 vai có sẵn trong `examples/roles/`
  (conductor, planner, critic, coder, reviewer, auditor).
- **Tầng dự án**: `CLAUDE.md` / `AGENTS.md` / `.claude/skills/` — kiến thức
  riêng của repo, agent tự nạp. Chạy **chặng onboard** một lần để planner
  research repo và đề xuất các file này (xem `examples/feature-pipeline.md`).
- **Tầng quyền**: claude thêm `--permission-mode acceptEdits` để sửa file;
  agy dùng grants (mục 2).

## 6. Chuẩn máy (`~/.ekip/`)

Chỉnh đội hình ở một dự án cho ưng, rồi:

```bash
ekip init --global   # lưu agents + roles làm mặc định toàn máy
```

Từ đó mọi `ekip init` ở dự án mới tự có nguyên đội hình. File của dự án luôn
thắng chuẩn máy (theo từng field); role file cũng vậy — muốn reviewer "khó
tính riêng" cho một repo thì đặt file role trong repo đó.

## 7. Pipeline nhiều chặng

Mẫu đầy đủ trong `examples/feature-pipeline.md`:
**plan → debate (đồng thuận ≥ 90, tối đa 3 vòng) → code (+tự chạy test) →
review loop (tối đa 3 vòng) → audit (SHIP/HOLD) → báo cáo**.

Cách chạy: giao cho `conductor` một task chứa kịch bản các chặng (copy từ
template, điền yêu cầu + lệnh test). Conductor tự delegate + chờ từng chặng,
mọi bàn giao đi qua blackboard, cap vòng lặp bảo vệ quota của bạn.

Chi phí ước lượng một vòng đầy đủ: **2 lần Opus + 3 Sonnet + 1–2 Gemini**
(6 spawn thuận lợi, ~12 nếu chạm cap). Chưa vendor nào cho xem quota còn lại
qua lệnh — watchdog sẽ báo *hậu kiểm* nếu run chết vì hết quota.

## 8. Khi có gì đó sai

- Task `failed` với `watchdog: ... spawn log hints: "You've hit your session
  limit"` → hết quota Claude, chờ reset rồi giao lại.
- `... "auto-denied"` → agy thiếu grant — đọc log để biết class quyền
  (`mcp(...)`, `write_file(...)`, `command(...)`) rồi thêm vào config.json
  của agy.
- Task treo `pending` mãi + log rỗng → binary agent không chạy được
  (`ekip logs <id>` xem "spawn error").
- Hub không lên: port 4319 đang bận? Mỗi dự án một hub, chạy lần lượt hoặc
  đổi `port` trong config.

## 9. FAQ nhanh

**Cả hai app phải mở à?** Không — chỉ hub chạy thường trực; bên nhận việc
được spawn headless khi cần rồi tự tắt.

**Có phạm ToS không?** Chỉ dùng bề mặt chính hãng: MCP + CLI headless chính
thức, tài khoản của chính bạn, không lách rate limit.

**Thêm agent lạ (Codex, Gemini CLI…)?** Adapter `command` + template args
là đủ, không cần code:
`{ "name": "codex", "adapter": "command", "command": "codex", "args": ["exec", "{prompt}"] }`
