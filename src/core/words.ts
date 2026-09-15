/**
 * The sentences the hub writes into conversations and task results, in the
 * hub's reporting language. People read them in the web app and the CLI, and
 * agents read them in results, so they follow `language` like everything else
 * the crew writes. English stays word-for-word what it always was.
 */

export function isVietnamese(language?: string): boolean {
  return /^vi|việt/i.test((language ?? "").trim());
}

export interface HubWords {
  refused(reason: string): string;
  blockedOutside(tool: string, path: string): string;
  queued(agent: string, blocker: string, position: number): string;
  blockAllFolders(running: number): string;
  blockFolder(running: number): string;
  blockAgent(count: number, agent: string): string;
  blockEditor(editors: string): string;
  failedToStart(error: string): string;
  couldNotStart(error: string): string;
  exited(how: string, claimed: boolean): string;
  signal(signal: string): string;
  code(code: number | null): string;
  hints(hint: string): string;
  cancelledBy(by: string, reason?: string): string;
  hubStopped: string;
  watchdog(reason: string): string;
  noClaimWithin(seconds: number): string;
  noResultWithin(seconds: number): string;
  unknownAgent(name: string): string;
  depthExceeded(max: number): string;
}

const en: HubWords = {
  refused: (reason) => `dispatch refused: ${reason}`,
  blockedOutside: (tool, path) => `blocked outside the folder: ${tool} → ${path}`,
  queued: (agent, blocker, position) => `queued for ${agent}: ${blocker} (position ${position})`,
  blockAllFolders: (n) => `${n} worker(s) running across all folders`,
  blockFolder: (n) => `${n} worker(s) running in this folder`,
  blockAgent: (n, agent) => `${n} ${agent} run(s) already going`,
  blockEditor: (editors) => `another agent is editing this folder (${editors})`,
  failedToStart: (error) => `worker failed to start: ${error}`,
  couldNotStart: (error) => `could not start the worker: ${error}`,
  exited: (how, claimed) => `worker exited (${how}) ${claimed ? "before posting a result" : "without claiming the task"}`,
  signal: (s) => `signal ${s}`,
  code: (c) => `code ${c}`,
  hints: (hint) => ` — spawn log hints: ${hint}`,
  cancelledBy: (by, reason) => `cancelled by ${by}${reason ? `: ${reason}` : ""}`,
  hubStopped: "the hub stopped while this was running",
  watchdog: (reason) => `watchdog: ${reason}`,
  noClaimWithin: (s) => `no claim within ${s}s of delegation`,
  noResultWithin: (s) => `claimed but no result within ${s}s`,
  unknownAgent: (name) => `unknown agent "${name}"`,
  depthExceeded: (max) => `max delegation depth ${max} exceeded (loop guard)`,
};

const vi: HubWords = {
  refused: (reason) => `không chạy được: ${reason}`,
  blockedOutside: (tool, path) => `đã chặn thao tác ngoài folder: ${tool} → ${path}`,
  queued: (agent, blocker, position) => `xếp hàng chờ ${agent}: ${blocker} (vị trí ${position})`,
  blockAllFolders: (n) => `đang có ${n} worker chạy trên mọi folder`,
  blockFolder: (n) => `đang có ${n} worker chạy trong folder này`,
  blockAgent: (n, agent) => `${agent} đang chạy ${n} lượt`,
  blockEditor: (editors) => `một agent khác đang sửa file trong folder này (${editors})`,
  failedToStart: (error) => `worker không khởi động được: ${error}`,
  couldNotStart: (error) => `không bật được worker: ${error}`,
  exited: (how, claimed) => `worker đã thoát (${how}) ${claimed ? "trước khi báo kết quả" : "mà chưa nhận việc"}`,
  signal: (s) => `tín hiệu ${s}`,
  code: (c) => `mã ${c}`,
  hints: (hint) => ` — gợi ý từ log: ${hint}`,
  cancelledBy: (by, reason) => `đã huỷ bởi ${by}${reason ? `: ${reason}` : ""}`,
  hubStopped: "hub đã dừng khi việc này đang chạy",
  watchdog: (reason) => `watchdog: ${reason}`,
  noClaimWithin: (s) => `không ai nhận việc trong ${s} giây sau khi giao`,
  noResultWithin: (s) => `đã nhận việc nhưng không có kết quả sau ${s} giây`,
  unknownAgent: (name) => `không có agent "${name}"`,
  depthExceeded: (max) => `vượt quá ${max} tầng giao việc (chống vòng lặp)`,
};

export function hubWords(language?: string): HubWords {
  return isVietnamese(language) ? vi : en;
}
