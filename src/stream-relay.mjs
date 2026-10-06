import { BridgeError } from './profiles.mjs';

// Read direct envelope fields only. Nested tool arguments and quoted narration
// cannot supply the nonce or content. parseRelay still validates the final JSON.
export function createEnvelopeContentStream(nonce, onText, { maxBytes = 512 * 1024 } = {}) {
  const escapes = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
  let depth = 0, stage = 'key', key = '', matched = false, outsideQuoted = false;
  let role = null, token = '', escaped = false, unicode = null, output = '', high = '';
  let rawBytes = 0, emittedBytes = 0, invalid = false;
  const fail = () => { throw new BridgeError('RELAY_PROTOCOL_ERROR', 'The streamed envelope is malformed.'); };
  const flush = () => {
    if (!output) return;
    emittedBytes += Buffer.byteLength(output);
    if (emittedBytes > maxBytes) throw new BridgeError('RESPONSE_TOO_LARGE', 'Streamed response exceeds the local limit.');
    onText(output); output = '';
  };
  const character = ch => {
    if (role === 'content') {
      if (high) { output += high; high = ''; }
      if (/[\uD800-\uDBFF]/.test(ch)) high = ch;
      else output += ch;
    } else if (role === 'key' || role === 'nonce') {
      token += ch;
      if (token.length > 256) { role = 'ignore'; token = ''; }
    }
  };
  const closeString = () => {
    if (role === 'key') { key = token; stage = 'colon'; }
    else if (depth === 1) {
      if (role === 'nonce') matched = token === nonce;
      if (role === 'content' && high) { output += high; high = ''; }
      stage = 'comma';
    }
    role = null; token = ''; escaped = false;
  };
  function feed(text) {
    if (typeof text !== 'string') fail();
    rawBytes += Buffer.byteLength(text);
    if (rawBytes > maxBytes) throw new BridgeError('RESPONSE_TOO_LARGE', 'Native relay response exceeds the local limit.');
    for (const ch of text) {
      if (invalid) continue;
      if (role) {
        if (unicode !== null) {
          if (!/[0-9a-f]/i.test(ch)) { invalid = true; fail(); }
          unicode += ch;
          if (unicode.length === 4) { character(String.fromCharCode(parseInt(unicode, 16))); unicode = null; }
        } else if (escaped) {
          escaped = false;
          if (ch === 'u') unicode = '';
          else if (Object.hasOwn(escapes, ch)) character(escapes[ch]);
          else { invalid = true; fail(); }
        } else if (ch === '\\') escaped = true;
        else if (ch === '"') closeString();
        else if (ch.charCodeAt(0) < 32) { invalid = true; fail(); }
        else character(ch);
        continue;
      }
      if (!depth) {
        if (outsideQuoted) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') outsideQuoted = false;
        } else if (ch === '"') outsideQuoted = true;
        else if (ch === '{') { depth = 1; stage = 'key'; matched = false; key = ''; }
        continue;
      }
      if (/\s/.test(ch)) continue;
      if (depth > 1) {
        if (ch === '"') role = 'nested';
        else if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (depth === 1) stage = 'comma'; }
        continue;
      }
      if (ch === '}') { depth = 0; stage = 'key'; continue; }
      if (stage === 'key') {
        if (ch === '"') { role = 'key'; token = ''; } else invalid = true;
      } else if (stage === 'colon') {
        if (ch === ':') stage = 'value'; else invalid = true;
      } else if (stage === 'value') {
        if (ch === '"') { role = key === 'nonce' ? 'nonce' : key === 'content' && matched ? 'content' : 'ignore'; token = ''; }
        else if (ch === '{' || ch === '[') { depth++; stage = 'nested'; }
        else stage = 'scalar';
      } else if (stage === 'scalar') {
        if (ch === ',') stage = 'key';
      } else if (stage === 'comma') {
        if (ch === ',') stage = 'key'; else invalid = true;
      }
    }
    flush();
  }
  return { feed, state: () => role === 'content' ? 'streaming' : invalid ? 'closed' : 'searching' };
}
