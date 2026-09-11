import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRepositoryPathTouches } from '../src/services/codex-path-observation.js';

const root = '/private/repositories/example';

test('extracts bounded repository-relative path touches without retaining command text', () => {
  const touches = extractRepositoryPathTouches({
    toolName: 'exec_command',
    command: `sed -n '1,200p' AGENTS.md frontend/src/App.tsx ${root}/backend/src/server.ts /private/other/secret.ts`,
    repositoryRoot: root,
    occurredAt: '2026-08-30T10:00:00.000Z',
    promptKey: 'prompt-1',
    sourceKey: 'call-1',
  });
  assert.deepEqual(touches.map(({ path, kind }) => ({ path, kind })), [
    { path: 'AGENTS.md', kind: 'read' },
    { path: 'frontend/src/App.tsx', kind: 'read' },
    { path: 'backend/src/server.ts', kind: 'read' },
  ]);
  assert.equal(JSON.stringify(touches).includes('secret.ts'), false);
  assert.equal(JSON.stringify(touches).includes('sed -n'), false);
});

test('classifies observable search, change, and verification routes', () => {
  const inputs = [
    ['exec_command', 'rg pattern frontend/src/App.tsx', 'search'],
    ['apply_patch', '*** Update File: frontend/src/App.tsx', 'change'],
    ['exec_command', 'npm test -- backend/test/app.test.ts', 'check'],
  ] as const;
  assert.deepEqual(inputs.map(([toolName, command]) => extractRepositoryPathTouches({
    toolName, command, repositoryRoot: root, occurredAt: '2026-08-30T10:00:00.000Z', sourceKey: toolName,
  })[0] && { path: extractRepositoryPathTouches({ toolName, command, repositoryRoot: root, occurredAt: '2026-08-30T10:00:00.000Z', sourceKey: toolName })[0].path, kind: extractRepositoryPathTouches({ toolName, command, repositoryRoot: root, occurredAt: '2026-08-30T10:00:00.000Z', sourceKey: toolName })[0].kind }), [
    { path: 'frontend/src/App.tsx', kind: 'search' },
    { path: 'frontend/src/App.tsx', kind: 'change' },
    { path: 'backend/test/app.test.ts', kind: 'check' },
  ]);
});


test('does not turn patch contents, scripts, patterns, or external paths into file evidence', () => {
  const extract = (toolName: string, command: string) => extractRepositoryPathTouches({ toolName, command, repositoryRoot: root, occurredAt: '2026-08-30T10:00:00Z', sourceKey: 'call' });
  assert.deepEqual(extract('apply_patch', '*** Update File: src/app.ts\n+const secret = "customer/private.json";').map(touch => touch.path), ['src/app.ts']);
  assert.deepEqual(extract('exec_command', 'rg "customer/private.json" src/app.ts').map(touch => touch.path), ['src/app.ts']);
  for (const command of ['echo customer/private.json', 'python -c "print(\'customer/private.json\')"', 'cat /outside/private.json', 'cd /outside && cat private.json', 'rg pattern frontend/src', 'cat https://example.com/private.json']) assert.deepEqual(extract('exec_command', command), []);
  assert.deepEqual(extract('functions.exec', 'text(await tools.exec_command({cmd: "cat private.json"}))'), []);
});
