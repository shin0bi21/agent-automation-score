import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';

const CLIENT_INFO = { name: 'agent-insights', title: 'Agent Insights', version: '0.1.0' };
type JsonObject = Record<string, unknown>;
type Options = { executable?: string; timeoutMs?: number };
type RpcClient = { request(method: string, params?: JsonObject): Promise<unknown>; close(): void };

export type CodexStoredSession = {
  externalId: string; title: string; repositoryName: string | null; source: string;
  status: string; createdAt: string | null; updatedAt: string | null;
  branch: string | null; revision: string | null;
};
export type CodexStoredSessionDetail = CodexStoredSession & {
  turns: Array<{ id: string; status: string; items: Array<{ id: string; type: string; status: string | null }> }>;
};
export type CodexSessionProbe = {
  connected: true; loadedThreadIds: string[]; storedThreadAvailable: boolean;
};

const object = (value: unknown): JsonObject => value && typeof value === 'object' ? value as JsonObject : {};
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
function timestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value < 10_000_000_000 ? value * 1_000 : value).toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

export function normalizeCodexThread(value: unknown): CodexStoredSession | null {
  const thread = object(value);
  const externalId = text(thread.id);
  if (!externalId) return null;
  const cwd = text(thread.cwd);
  const git = object(thread.gitInfo);
  return {
    externalId,
    title: `Codex session ${externalId.slice(0, 8)}`,
    repositoryName: cwd ? basename(cwd) : null,
    source: text(thread.source, 'unknown'),
    status: text(object(thread.status).type || thread.status, 'unknown'),
    createdAt: timestamp(thread.createdAt ?? thread.created_at),
    updatedAt: timestamp(thread.updatedAt ?? thread.updated_at),
    branch: text(git.branch) || null,
    revision: text(git.sha) || null,
  };
}

export function normalizeCodexNotification(message: unknown) {
  if (!message || typeof message !== 'object' || !('method' in message)) return null;
  const method = String((message as JsonObject).method);
  const allowed = new Set(['thread/status/changed', 'thread/tokenUsage/updated', 'turn/started', 'turn/completed', 'turn/diff/updated', 'turn/plan/updated', 'item/started', 'item/completed']);
  return allowed.has(method) ? { type: method } : null;
}

function createRpcClient({ executable = process.env.CODEX_BIN ?? 'codex', timeoutMs = 10_000 }: Options = {}): Promise<RpcClient> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    const output = createInterface({ input: child.stdout });
    const pending = new Map<number, { method: string; resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
    let nextId = 0;
    let ready = false;
    let closed = false;
    function close(error = new Error('Codex session connection closed.')) {
      if (closed) return;
      closed = true;
      output.close();
      child.kill('SIGTERM');
      for (const call of pending.values()) { clearTimeout(call.timer); call.reject(error); }
      pending.clear();
    }
    function request(method: string, params?: JsonObject) {
      if (closed) return Promise.reject(new Error('Codex session connection is closed.'));
      const id = ++nextId;
      return new Promise<unknown>((resolveCall, rejectCall) => {
        const timer = setTimeout(() => { pending.delete(id); rejectCall(new Error(`Codex did not answer ${method} in time.`)); }, timeoutMs);
        pending.set(id, { method, resolve: resolveCall, reject: rejectCall, timer });
        child.stdin.write(`${JSON.stringify({ id, method, ...(params ? { params } : {}) })}\n`);
      });
    }
    output.on('line', line => {
      let message: JsonObject;
      try { message = JSON.parse(line) as JsonObject; } catch { return; }
      if (typeof message.id !== 'number') return;
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) {
        const detail = text(object(message.error).message, 'request rejected').replace(/\s+/g, ' ').slice(0, 200);
        call.reject(new Error(`Codex rejected ${call.method}: ${detail}`));
      }
      else call.resolve(message.result);
    });
    child.once('error', error => { close(); if (!ready) reject(new Error(`Codex could not be started: ${error.message}`)); });
    child.once('exit', code => { if (!closed) { const error = new Error(`Codex session connection exited with code ${code ?? 'unknown'}.`); close(error); if (!ready) reject(error); } });
    request('initialize', { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true, requestAttestation: false } }).then(() => {
      ready = true;
      child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
      resolve({ request, close });
    }).catch(error => { close(); reject(error); });
  });
}

export async function listCodexStoredSessions(options: Options = {}) {
  const client = await createRpcClient(options);
  try {
    const sessions: CodexStoredSession[] = [];
    let cursor: string | null = null;
    do {
      const result = object(await client.request('thread/list', { limit: 100, sortKey: 'updated_at', sortDirection: 'desc', ...(cursor ? { cursor } : {}) }));
      const data = Array.isArray(result.data) ? result.data : [];
      sessions.push(...data.map(normalizeCodexThread).filter((item): item is CodexStoredSession => Boolean(item)));
      cursor = text(result.nextCursor) || null;
    } while (cursor && sessions.length < 500);
    if (cursor) throw new Error('Codex returned more stored sessions than the safe listing limit.');
    return sessions;
  } finally { client.close(); }
}

export async function readCodexStoredSession(externalId: string, options: Options = {}): Promise<CodexStoredSessionDetail> {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(externalId)) throw new Error('Invalid Codex session ID.');
  const client = await createRpcClient(options);
  try {
    const read = object(await client.request('thread/read', { threadId: externalId, includeTurns: false }));
    const thread = normalizeCodexThread(read.thread ?? read);
    if (!thread) throw new Error('Codex session was not found.');
    const turns: CodexStoredSessionDetail['turns'] = [];
    let cursor: string | null = null;
    do {
      const page = object(await client.request('thread/turns/list', { threadId: externalId, limit: 100, itemsView: 'full', ...(cursor ? { cursor } : {}) }));
      const data = Array.isArray(page.data) ? page.data : [];
      for (const value of data) {
        const turn = object(value); const id = text(turn.id); if (!id) continue;
        const items = Array.isArray(turn.items) ? turn.items : [];
        turns.push({ id, status: text(turn.status, 'unknown'), items: items.map(value => {
          const item = object(value); return { id: text(item.id), type: text(item.type, 'unknown'), status: text(item.status) || null };
        }).filter(item => item.id) });
      }
      cursor = text(page.nextCursor) || null;
    } while (cursor && turns.length < 2_000);
    if (cursor) throw new Error('Codex returned more turns than the safe import limit.');
    return { ...thread, turns };
  } finally { client.close(); }
}

export async function probeCodexSessionSource(options: Options = {}): Promise<CodexSessionProbe> {
  const client = await createRpcClient(options);
  try {
    const [loaded, stored] = await Promise.all([client.request('thread/loaded/list', {}), client.request('thread/list', { limit: 1, sortKey: 'updated_at', sortDirection: 'desc' })]);
    const loadedData = object(loaded).data; const storedData = object(stored).data;
    return { connected: true, loadedThreadIds: Array.isArray(loadedData) ? loadedData.filter(item => typeof item === 'string') : [], storedThreadAvailable: Array.isArray(storedData) && storedData.length > 0 };
  } finally { client.close(); }
}
