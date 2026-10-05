import { BridgeError } from './profiles.mjs';

export const defaultClaudeDelegate = Object.freeze({ attemptTimeoutMs: 75 * 60000, requestTimeoutMs: 90 * 60000 });
export const MAX_CLAUDE_ATTEMPT_MS = 120 * 60000;

export function claudeDelegateBudget(config) {
  const budget = config.claudeDelegate === undefined ? defaultClaudeDelegate : config.claudeDelegate;
  if (!budget || typeof budget !== 'object' || Array.isArray(budget) ||
      Object.keys(budget).some(key => !['attemptTimeoutMs', 'requestTimeoutMs'].includes(key)) ||
      !Number.isInteger(budget.attemptTimeoutMs) || budget.attemptTimeoutMs < 1000 || budget.attemptTimeoutMs > MAX_CLAUDE_ATTEMPT_MS ||
      !Number.isInteger(budget.requestTimeoutMs) || budget.requestTimeoutMs < budget.attemptTimeoutMs || budget.requestTimeoutMs > 135 * 60000) {
    throw new BridgeError('INVALID_CONFIG', 'Claude budgets require an attempt of 1 second..120 minutes and a request of attempt..135 minutes.');
  }
  return budget;
}
