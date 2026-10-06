// Inspect structured native error fields only. Never classify assistant prose.
export function codexErrorCode(message) {
  return typeof message === 'string' && /\bThis content was flagged for\b/i.test(message)
    ? 'CODEX_CONTENT_REJECTED' : 'CODEX_REPORTED_ERROR';
}

export function codexErrorMessage(code) {
  return code === 'CODEX_CONTENT_REJECTED'
    ? 'The upstream provider rejected this request during content checks. It was not retried or sent to another model by Agent Bridge.'
    : 'The selected CLI failed.';
}
