import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { listCodexStoredSessions } from './services/codex-session-source.js';

const codexHome = process.env.CODEX_HOME ?? resolve(homedir(), '.codex');
const sessions = await listCodexStoredSessions();

if (sessions.length) {
  process.stdout.write(`Codex session source ready: ${sessions.length} stored session${sessions.length === 1 ? '' : 's'} available from ${codexHome}.\n`);
} else {
  process.stdout.write(`Codex session source connected at ${codexHome}, but it currently contains no stored sessions.\n`);
}
