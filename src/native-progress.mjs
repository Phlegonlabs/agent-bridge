import { notifyProgress } from './task-progress.mjs';

// Parse event types only. Never forward reasoning, text, commands or tool arguments.
export function observeNativeProgress(provider, line, observer) {
  if (!observer) return;
  let event;
  try { event = JSON.parse(line); } catch { return; }
  let kind;
  if (provider === 'claude') {
    if (event.type === 'stream_event') {
      const delta = event.event?.delta;
      if (delta?.type === 'thinking_delta') kind = 'thinking';
      if (delta?.type === 'text_delta') kind = 'text';
      if (event.event?.type === 'content_block_start' && event.event.content_block?.type === 'tool_use') kind = 'tool_started';
    } else if (event.type === 'assistant') {
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (block.type === 'thinking') kind = 'thinking';
        if (block.type === 'text') kind = 'text';
        if (block.type === 'tool_use') kind = 'tool_started';
      }
    } else if (event.type === 'user' && event.message?.content?.some?.(block => block.type === 'tool_result')) kind = 'tool_finished';
  } else if (provider === 'codex') {
    if (['item.started', 'item.completed', 'item.updated'].includes(event.type)) {
      const type = event.item?.type;
      if (type === 'reasoning') kind = 'thinking';
      else if (type === 'agent_message') kind = 'text';
      else if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(type)) {
        kind = event.type === 'item.completed' ? 'tool_finished' : 'tool_started';
      }
    } else if (event.type === 'error' && /^Reconnecting\.\.\.\s+\d+\/\d+/.test(event.message ?? '')) kind = 'native_retry';
  } else if (provider === 'cursor') {
    if (event.type === 'assistant') kind = 'text';
    if (event.type === 'tool_call' && ['started', 'completed'].includes(event.subtype)) {
      kind = event.subtype === 'started' ? 'tool_started' : 'tool_finished';
    }
  } else if (provider === 'zcode') {
    if (event.type === 'text.delta') kind = 'text';
    if (event.type === 'tool.updated' && ['scheduled', 'completed', 'result'].includes(event.payload?.kind)) {
      kind = event.payload.kind === 'scheduled' ? 'tool_started' : 'tool_finished';
    }
  }
  if (kind) notifyProgress(observer, { type: 'activity', kind });
}
