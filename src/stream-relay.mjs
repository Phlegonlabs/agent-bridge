// Incrementally extracts the content string of this request's relay envelope
// from the model's streaming text, so partial output can reach the client
// before the full JSON reply arrives. Emits nothing unless the nonce-keyed
// envelope's content field is a string; narration, code fences and any other
// JSON the model quotes are ignored. A tool-call envelope (content null)
// emits nothing, which keeps streamed and buffered requests consistent.
export function createEnvelopeContentStream(nonce, onText) {
  const marker = `"nonce":${JSON.stringify(nonce)}`;
  const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
  let mode = 'searching', buffer = '';

  function feed(text) {
    buffer += text;
    for (;;) {
      if (mode === 'searching') {
        const at = buffer.indexOf(marker);
        if (at < 0) {
          // A marker split across deltas must survive the trim.
          buffer = buffer.slice(Math.max(0, buffer.length - marker.length - 1));
          return;
        }
        buffer = buffer.slice(at + marker.length);
        mode = 'contentKey';
      } else if (mode === 'contentKey') {
        const match = /"content"\s*:\s*/.exec(buffer);
        if (!match) {
          if (buffer.length > 65536 || buffer.includes(marker)) { mode = 'closed'; }
          return;
        }
        const after = match.index + match[0].length;
        if (after >= buffer.length) return;
        if (buffer[after] === '"') { buffer = buffer.slice(after + 1); mode = 'streaming'; }
        else if (buffer.startsWith('null', after)) { mode = 'closed'; return; }
        else { buffer = buffer.slice(after); mode = 'searching'; }
      } else if (mode === 'streaming') {
        let index = 0, out = '';
        while (index < buffer.length) {
          const ch = buffer[index];
          if (ch === '"') {
            buffer = buffer.slice(index + 1);
            // A corrective round sends a second envelope; keep scanning so the
            // retry's content is forwarded too (sent text cannot be retracted).
            mode = 'searching';
            if (out) onText(out);
            return;
          }
          if (ch === '\\') {
            if (index + 1 >= buffer.length) break;
            const esc = buffer[index + 1];
            if (esc === 'u') {
              if (index + 5 >= buffer.length) break;
              out += String.fromCharCode(parseInt(buffer.slice(index + 2, index + 6), 16));
              index += 6;
              continue;
            }
            if (!(esc in ESCAPES)) { mode = 'closed'; break; }
            out += ESCAPES[esc];
            index += 2;
            continue;
          }
          out += ch;
          index++;
        }
        buffer = buffer.slice(index);
        if (out) onText(out);
        return;
      } else {
        return;
      }
    }
  }

  return { feed, state: () => mode };
}
