import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionUsageTimeline } from '../src/services/session-usage-timeline.js';

test('derives prompt intervals from cumulative usage without inventing reset deltas', () => {
  const points = buildSessionUsageTimeline({
    boundaries: [
      { key: 'one', sequenceNumber: 1, kind: 'directive', occurredAt: '2026-08-19T00:00:00.000Z', contextTokens: 100, contextWindow: 200, inputTokens: 100, cachedInputTokens: 60, outputTokens: 20 },
      { key: 'two', sequenceNumber: 2, kind: 'question', occurredAt: '2026-08-19T00:02:00.000Z', contextTokens: 150, contextWindow: 200, inputTokens: 140, cachedInputTokens: 90, outputTokens: 28 },
    ],
    closing: { inputTokens: 10, cachedInputTokens: 5, outputTokens: 2 },
    observedAt: '2026-08-19T00:03:00.000Z',
    live: true,
  });

  assert.deepEqual(points[0], {
    key: 'one', sequenceNumber: 1, kind: 'directive', status: 'completed', measurement: 'exact-live',
    startedAt: '2026-08-19T00:00:00.000Z', endedAt: '2026-08-19T00:02:00.000Z', durationMs: 120_000,
    contextTokens: 100, contextWindow: 200, contextPercent: 50,
    inputTokens: 40, cachedInputTokens: 30, newInputTokens: 10, outputTokens: 8,
  });
  assert.equal(points[1].status, 'active');
  assert.equal(points[1].measurement, 'unavailable');
  assert.equal(points[1].inputTokens, null);
  assert.equal(points[1].newInputTokens, null);
});

test('rejects an interval whose cached delta exceeds its input delta', () => {
  const [point] = buildSessionUsageTimeline({
    boundaries: [{ key: 'one', sequenceNumber: 1, kind: 'directive', occurredAt: '2026-08-19T00:00:00.000Z', contextTokens: 100, contextWindow: 200, inputTokens: 100, cachedInputTokens: 60, outputTokens: 20 }],
    closing: { inputTokens: 110, cachedInputTokens: 80, outputTokens: 22 },
    observedAt: '2026-08-19T00:01:00.000Z',
    live: false,
  });
  assert.equal(point.measurement, 'unavailable');
  assert.equal(point.cachedInputTokens, null);
  assert.equal(point.outputTokens, null);
});
