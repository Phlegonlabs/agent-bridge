import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvelopeContentStream } from '../src/stream-relay.mjs';

const nonce = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
function collect(feeds) {
  const out = [];
  const stream = createEnvelopeContentStream(nonce, text => out.push(text));
  for (const feed of feeds) stream.feed(feed);
  return { text: out.join(''), state: stream.state() };
}

test('streams envelope content incrementally and ignores narration around it', () => {
  const envelope = `{"nonce":"${nonce}","content":"line1\\nline2","tool_calls":[]}`;
  const result = collect(['Reading the transport file...\n', '```json\n', envelope.slice(0, 30), envelope.slice(30), '\n```']);
  assert.equal(result.text, 'line1\nline2');
  assert.equal(result.state, 'searching');
});

test('decodes escapes split across deltas, including unicode', () => {
  const raw = `{"nonce":"${nonce}","content":"a\\"b\\u00e9c\\\\d"}`;
  const result = collect([raw.slice(0, raw.indexOf('\\u00e') + 3), raw.slice(raw.indexOf('\\u00e') + 3)]);
  assert.equal(result.text, 'a"béc\\d');
});

test('emits nothing for tool-call envelopes, missing envelopes, and foreign nonces', () => {
  assert.equal(collect([`{"nonce":"${nonce}","content":null,"tool_calls":[{"name":"f","arguments":{}}]}`]).text, '');
  assert.equal(collect(['Just a prose answer with no envelope at all.']).text, '');
  assert.equal(collect([`{"nonce":"00000000-0000-0000-0000-000000000000","content":"not ours"}`]).text, '');
});

test('ignores text after the content string closes', () => {
  const raw = `{"nonce":"${nonce}","content":"done"} trailing narration {"other":"json"}`;
  const result = collect([raw]);
  assert.equal(result.text, 'done');
  assert.equal(result.state, 'searching');
});

test('surrogate pairs survive split deltas', () => {
  const raw = `{"nonce":"${nonce}","content":"\\ud83d\\ude80"}`;
  const result = collect([raw.slice(0, -6), raw.slice(-6)]);
  assert.equal(result.text, '🚀');
});

test('a second envelope after a failed first attempt still streams', () => {
  const bad = `{"nonce":"${nonce}","content":"first"}`;
  const good = `{"nonce":"${nonce}","content":"second"}`;
  const result = collect([bad, ' ', good]);
  assert.equal(result.text, 'firstsecond');
});
