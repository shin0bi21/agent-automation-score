import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import RecurringBenchmarks, { benchmarkRegressionSignals } from './RecurringBenchmarks';

afterEach(cleanup);

const catalog = {
  scenarios: [{ id: 'scenario-a', version: 1, title: 'Scenario A', featureType: 'frontend' as const }],
  suites: [{ id: 'suite-a', version: 1, title: 'Sharpness suite', scenarioIds: ['scenario-a'] }],
};
const input = { repo: '/workspace/app', provider: 'codex', model: 'gpt-5.6-luna', reasoningEffort: 'low', featureType: 'frontend' as const, description: '' };

test('requires explicit token consent before scheduling a recurring suite', () => {
  const onCreate = vi.fn();
  render(<RecurringBenchmarks catalog={catalog} schedules={[]} input={input} providers={[]} busy={false} message="" onCreate={onCreate} onToggle={vi.fn()} />);
  const schedule = screen.getByRole('button', { name: 'Schedule regression suite' });
  expect(schedule).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Allow recurring provider-token use/ }));
  expect(schedule).toBeEnabled();
  fireEvent.click(schedule);
  expect(onCreate).toHaveBeenCalledWith('suite-a', 10080, true);
});

test('shows scenario-local usage trends and reconnect state', () => {
  render(<RecurringBenchmarks catalog={catalog} input={input} providers={[]} busy={false} message="" onCreate={vi.fn()} onToggle={vi.fn()} schedules={[{
    id: 'schedule-a', repositoryName: 'app', scenarioId: 'scenario-a', scenarioVersion: 1, scenarioFingerprint: 'a'.repeat(64), provider: 'codex', model: 'gpt-5.6-luna', reasoningEffort: 'low', featureType: 'frontend', description: 'Scenario A', intervalMinutes: 10080, enabled: false, consentedAt: null, nextRunAt: '2026-09-04T00:00:00.000Z', connected: false, createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z', trend: [
      { plannedAt: '2026-08-21T00:00:00.000Z', outcome: 'started', runId: 'run-previous', reason: null, runStatus: 'completed', score: 88, durationMs: 130000, inputTokens: 110000, cachedInputTokens: 90000, newInputTokens: 20000, outputTokens: 3500 },
      { plannedAt: '2026-08-28T00:00:00.000Z', outcome: 'started', runId: 'run-a', reason: null, runStatus: 'completed', score: 91, durationMs: 120000, inputTokens: 120000, cachedInputTokens: 100000, newInputTokens: 20000, outputTokens: 4000 },
    ],
  }]} />);
  expect(screen.getByText(/reconnect required/)).toBeInTheDocument();
  expect(screen.getAllByText('91.0%').length).toBeGreaterThan(1);
  expect(screen.getAllByText('100K').length).toBeGreaterThan(1);
  expect(screen.getByRole('img', { name: 'Compatible benchmark score trend' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Compatible benchmark token trend' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reconnect and enable' })).toBeInTheDocument();
});

test('flags sustained compatible score, time, token, and failure regressions', () => {
  const base = { outcome: 'started' as const, runId: 'run', reason: null, runStatus: 'completed', cachedInputTokens: 80, newInputTokens: 20 };
  expect(benchmarkRegressionSignals([
    { ...base, plannedAt: '2026-08-01T00:00:00Z', score: 95, durationMs: 100, inputTokens: 100, outputTokens: 10 },
    { ...base, plannedAt: '2026-08-08T00:00:00Z', score: 80, durationMs: 140, inputTokens: 140, outputTokens: 20 },
  ])).toEqual([
    'Score is 15.0 points below the recent median',
    'Duration is at least 30% above the recent median',
    'Processed tokens are at least 30% above the recent median',
  ]);
  expect(benchmarkRegressionSignals([
    { ...base, plannedAt: '2026-08-01T00:00:00Z', outcome: 'failed', runStatus: 'failed', score: null, durationMs: null, inputTokens: null, outputTokens: null },
    { ...base, plannedAt: '2026-08-08T00:00:00Z', outcome: 'failed', runStatus: 'failed', score: null, durationMs: null, inputTokens: null, outputTokens: null },
  ])).toContain('Two consecutive failures');
});
