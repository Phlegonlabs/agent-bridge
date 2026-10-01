#!/usr/bin/env node
import { ClaudeSessions } from '../src/claude-sessions.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/claude-session-recovery.mjs <state-directory> inspect --session-id <id> --session-type <type>',
    '  node scripts/claude-session-recovery.mjs <state-directory> recover --session-id <id> --session-type <type>',
    '    --expected-native-session <uuid> --inspected',
    '',
    'For a persisted running receipt, first verify that port 32147 has no listener (or auth status active=0),',
    'stop and verify the native CLI, then add --offline-service-verified. Recovery never deletes the receipt;',
    'it writes a backup and marks the inspected uncertain or crashed receipt resumable.',
  ].join('\n');
}

function argumentValue(values, name) {
  const index = values.indexOf(name);
  if (index === -1 || index + 1 >= values.length) return undefined;
  return values[index + 1];
}

function hasFlag(values, name) {
  return values.includes(name);
}

const commandArguments = process.argv.slice(2);
const [directory, action] = commandArguments;
const sessionId = argumentValue(commandArguments, '--session-id');
const sessionType = argumentValue(commandArguments, '--session-type');
const expectedNativeSessionId = argumentValue(commandArguments, '--expected-native-session');
const inspected = hasFlag(commandArguments, '--inspected');
const runtimeOffline = hasFlag(commandArguments, '--offline-service-verified');

if (!directory || directory.startsWith('--') || !['inspect', 'recover'].includes(action)) {
  console.error(usage());
  process.exitCode = 1;
} else {
  try {
    const sessions = new ClaudeSessions(directory);
    const request = { sessionId, sessionType };
    if (action === 'inspect') {
      console.log(JSON.stringify(await sessions.inspect(request), null, 2));
    } else {
      const result = await sessions.recover({
        ...request, expectedNativeSessionId, inspected, runtimeOffline,
      });
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`${error.code ?? 'RECOVERY_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}
