import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSessionPathTraversal, type SessionPathTouch } from '../src/services/session-path-traversal.js';

const at = (offset: number) => `2026-08-30T00:00:0${offset}.000Z`;

test('builds a repository tree and measures ordered directory movement and revisits', () => {
  const touches: SessionPathTouch[] = [
    { path: 'src/app/routes.ts', kind: 'search', occurredAt: at(0), promptKey: 'prompt-1' },
    { path: 'src/app/pages/Home.tsx', kind: 'read', occurredAt: at(1), promptKey: 'prompt-1' },
    { path: 'src/app/routes.ts', kind: 'read', occurredAt: at(2), promptKey: 'prompt-1' },
    { path: 'src/lib/api.ts', kind: 'change', occurredAt: at(3), promptKey: 'prompt-1' },
    { path: 'src/lib/api.test.ts', kind: 'check', occurredAt: at(4), promptKey: 'prompt-1' },
    { path: 'README.md', kind: 'read', occurredAt: at(5), promptKey: 'prompt-2' },
  ];

  const result = analyzeSessionPathTraversal(touches);

  assert.deepEqual(result.summary, {
    uniqueDirectories: 4,
    uniqueFiles: 5,
    totalRevisits: 1,
    directionCounts: { up: 2, down: 1, same: 1, cross: 1 },
  });
  assert.deepEqual(result.nodes[0], {
    id: 'repository:.', path: '.', type: 'repository', parentId: null, depth: 0,
    visitCount: 6, revisitCount: 5, observedKinds: ['search', 'read', 'change', 'check'],
    firstSequence: 0, lastSequence: 5,
  });
  assert.deepEqual(
    result.nodes.filter((node) => node.type === 'directory').map((node) => [node.path, node.parentId]),
    [
      ['src', 'repository:.'],
      ['src/app', 'directory:src'],
      ['src/app/pages', 'directory:src/app'],
      ['src/lib', 'directory:src'],
    ],
  );
  assert.deepEqual(
    result.nodes.find((node) => node.id === 'file:src/app/routes.ts'),
    {
      id: 'file:src/app/routes.ts', path: 'src/app/routes.ts', type: 'file', parentId: 'directory:src/app', depth: 3,
      visitCount: 2, revisitCount: 1, observedKinds: ['search', 'read'], firstSequence: 0, lastSequence: 2,
    },
  );
  assert.deepEqual(
    result.nodes.find((node) => node.id === 'directory:src/app'),
    {
      id: 'directory:src/app', path: 'src/app', type: 'directory', parentId: 'directory:src', depth: 2,
      visitCount: 3, revisitCount: 2, observedKinds: ['search', 'read'], firstSequence: 0, lastSequence: 2,
    },
  );
  assert.deepEqual(
    result.nodes.find((node) => node.id === 'directory:src'),
    {
      id: 'directory:src', path: 'src', type: 'directory', parentId: 'repository:.', depth: 1,
      visitCount: 5, revisitCount: 4, observedKinds: ['search', 'read', 'change', 'check'],
      firstSequence: 0, lastSequence: 4,
    },
  );
  assert.deepEqual(result.transitions.map(({ direction, upLevels, downLevels, commonDirectory }) => ({
    direction, upLevels, downLevels, commonDirectory,
  })), [
    { direction: 'down', upLevels: 0, downLevels: 1, commonDirectory: 'src/app' },
    { direction: 'up', upLevels: 1, downLevels: 0, commonDirectory: 'src/app' },
    { direction: 'cross', upLevels: 1, downLevels: 1, commonDirectory: 'src' },
    { direction: 'same', upLevels: 0, downLevels: 0, commonDirectory: 'src/lib' },
    { direction: 'up', upLevels: 2, downLevels: 0, commonDirectory: '.' },
  ]);
  assert.deepEqual(result.phases.map((phase) => phase.label), [
    'pre-change-observation',
    'change-activity',
    'check-activity',
    'post-check-observation',
  ]);
  assert.equal(result.coverage.complete, true);
});

test('ignores unsafe paths and reports invalid timestamp coverage without reordering touches', () => {
  const result = analyzeSessionPathTraversal([
    { path: '/Users/example/private.ts', kind: 'read', occurredAt: at(0) },
    { path: '../outside.ts', kind: 'read', occurredAt: at(1) },
    { path: 'C:\\private\\secret.ts', kind: 'read', occurredAt: at(2) },
    { path: 'D:drive-relative.ts', kind: 'read', occurredAt: at(2) },
    { path: 'src\\safe.ts', kind: 'search', occurredAt: 'not-a-time' },
    { path: './src/safe.ts', kind: 'change', occurredAt: at(4) },
  ]);

  assert.equal(result.coverage.receivedTouches, 6);
  assert.equal(result.coverage.acceptedTouches, 2);
  assert.equal(result.coverage.ignoredUnsafePaths, 4);
  assert.equal(result.coverage.invalidTimestamps, 1);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.summary.uniqueFiles, 1);
  assert.equal(result.summary.totalRevisits, 1);
  assert.equal(result.transitions[0].sequence, 5);
  assert.equal(result.transitions[0].direction, 'same');
});

test('applies deterministic touch, tree, edge, and transition bounds with explicit coverage', () => {
  const touches: SessionPathTouch[] = [
    { path: 'a/one.ts', kind: 'read', occurredAt: at(0) },
    { path: 'b/two.ts', kind: 'read', occurredAt: at(1) },
    { path: 'c/three.ts', kind: 'change', occurredAt: at(2) },
    { path: 'd/four.ts', kind: 'check', occurredAt: at(3) },
  ];

  const first = analyzeSessionPathTraversal(touches, {
    maximumTouches: 3,
    maximumNodes: 3,
    maximumEdges: 0,
    maximumTransitions: 1,
  });
  const second = analyzeSessionPathTraversal(touches, {
    maximumTouches: 3,
    maximumNodes: 3,
    maximumEdges: 0,
    maximumTransitions: 1,
  });

  assert.deepEqual(first, second);
  assert.equal(first.nodes.length, 3);
  assert.equal(first.edges.length, 0);
  assert.equal(first.transitions.length, 1);
  assert.equal(first.coverage.truncatedTouches, 1);
  assert.ok(first.coverage.omittedNodes > 0);
  assert.ok(first.coverage.omittedEdges > 0);
  assert.equal(first.coverage.omittedTransitions, 1);
  assert.equal(first.coverage.complete, false);
});

test('returns an explicit empty analysis without inventing navigation', () => {
  const result = analyzeSessionPathTraversal([]);

  assert.equal(result.nodes.length, 1);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.transitions, []);
  assert.deepEqual(result.phases, []);
  assert.deepEqual(result.summary, {
    uniqueDirectories: 0,
    uniqueFiles: 0,
    totalRevisits: 0,
    directionCounts: { up: 0, down: 0, same: 0, cross: 0 },
  });
  assert.equal(result.coverage.complete, true);
});
