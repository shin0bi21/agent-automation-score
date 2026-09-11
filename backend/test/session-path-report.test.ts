import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionRepositoryTraversalReport } from '../src/services/session-path-report.js';

test('projects traversal analysis into privacy-safe browser evidence', () => {
  const report = buildSessionRepositoryTraversalReport([
    { path: 'frontend/src/App.tsx', kind: 'read', occurredAt: '2026-08-30T10:00:00.000Z', promptKey: 'one' },
    { path: 'frontend/src/pages/Home.tsx', kind: 'search', occurredAt: '2026-08-30T10:00:01.000Z', promptKey: 'one' },
    { path: 'frontend/src/App.tsx', kind: 'change', occurredAt: '2026-08-30T10:00:02.000Z', promptKey: 'one' },
    { path: 'frontend/test/App.test.tsx', kind: 'check', occurredAt: '2026-08-30T10:00:03.000Z', promptKey: 'one' },
  ]);
  assert.equal(report.available, true);
  assert.equal(report.totalFileHits, 4);
  assert.equal(report.uniqueFiles, 3);
  assert.equal(report.directionCounts.revisit, 1);
  assert.equal(report.transitions.find(transition => transition.heuristic?.phase === 'change activity')?.heuristic?.phase, 'change activity');
  assert.equal(report.transitions[0].direction, 'entry');
  assert.match(report.limitation ?? '', /not why a path was chosen/);
  assert.match(report.limitation ?? '', /supported simple shell commands/);
  assert.equal(JSON.stringify(report).includes('private reasoning'), false);
});


test('keeps same-directory movement distinct from cross-branch movement and counts each ordered hit once', () => {
  const report = buildSessionRepositoryTraversalReport(['src/a.ts', 'src/b.ts', 'src/a.ts', 'src/b.ts'].map(path => ({ path, kind: 'read' as const, occurredAt: '2026-08-30T10:00:00Z' })));
  assert.equal(report.directionCounts.cross, 0);
  assert.equal(report.directionCounts.same, 3);
  assert.deepEqual(report.transitions.slice(1).map(transition => transition.direction), ['same', 'same', 'same']);
  assert.deepEqual(report.transitions.map(transition => transition.hitCount), [1, 1, 1, 1]);
  assert.match(report.limitation!, /first 1,000 touches per saved review/);
});
