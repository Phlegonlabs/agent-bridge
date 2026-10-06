import { publicTaskStatus, terminalStates } from './task-progress.mjs';

const states = {
  accepted: '已接收', queued: '排隊中', starting: '正在啟動', running: '執行中',
  finishing: '正在驗證結果', stopping: '正在停止並清理',
  finished: '執行已結束', failed: '執行失敗', cancelled: '已取消',
};
const activities = {
  thinking: '思考事件', text: '文字輸出', tool_started: '工具開始執行',
  tool_finished: '工具已返回', native_retry: '原生重試',
};
const duration = value => {
  if (value === null) return '未知';
  const seconds = Math.floor(value / 1000), minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
};

// The host renders this channel as Thought. Every line identifies bridge status;
// it contains observations, never native reasoning or assistant answer text.
export class ProgressStream {
  constructor({ now = Date.now, intervalMs = 30000, maxBytes = 64 * 1024 } = {}) {
    this.now = now; this.intervalMs = intervalMs; this.maxBytes = maxBytes;
    this.lastKey = null; this.lastSentAt = null; this.bytes = 0; this.ended = false;
  }
  next(snapshot) {
    if (!snapshot || this.ended) return null;
    let task;
    try { task = publicTaskStatus(snapshot); } catch { return null; }
    const terminal = terminalStates.has(task.state);
    const key = JSON.stringify([task.state, task.attempt, task.provider, task.requestedModel,
      task.lastActivityKind, task.code]);
    const time = this.now();
    if (key === this.lastKey && time - this.lastSentAt < this.intervalMs) return null;
    const recent = activities[task.lastActivityKind];
    const activity = recent
      ? `最近活動：${recent}（距今 ${duration(task.lastActivityAgeMs)}）`
      : '尚未觀察到原生活動';
    const attempt = task.attempt ? ` · 第 ${task.attempt} 次嘗試` : '';
    const text = `〔Agent Bridge 執行狀態〕${states[task.state]} · 已用 ${duration(task.elapsedMs)}${attempt}\n${activity}\n\n`;
    // Reserve space for a final cap notice, even if a native worker is very noisy.
    if (this.bytes + Buffer.byteLength(text) > this.maxBytes - 256) {
      this.ended = true;
      return '〔Agent Bridge 執行狀態〕訊息已達顯示上限；任務仍依原定期限執行，請用狀態查詢查看後續活動。\n\n';
    }
    this.bytes += Buffer.byteLength(text); this.lastKey = key; this.lastSentAt = time;
    this.ended = terminal;
    return text;
  }
}
