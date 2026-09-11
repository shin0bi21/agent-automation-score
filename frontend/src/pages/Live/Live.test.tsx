import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import Live from './Live';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('shows the shared spinner while stored sessions are loading', async () => {
  let resolveSessions!: (response: Response) => void;
  const pendingSessions = new Promise<Response>(resolve => { resolveSessions = resolve; });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => pendingSessions);
  render(<Live />);
  expect(screen.getByRole('status', { name: 'Loading sessions' })).toHaveTextContent('Loading sessions…');
  resolveSessions(new Response(JSON.stringify([]), { status: 200 }));
  expect(await screen.findByText('No matching recent sessions')).toBeInTheDocument();
});

test('shows a session-information loader while the first live snapshot is pending', async () => {
  let resolveLive!: (response: Response) => void;
  const pendingLive = new Promise<Response>(resolve => { resolveLive = resolve; });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input);
    if (path.endsWith('/live')) return pendingLive;
    return new Response(JSON.stringify([{ externalId: 'thread-1234', title: 'Pending session', repositoryName: 'app', source: 'cli', status: 'active', createdAt: null, updatedAt: new Date().toISOString(), branch: null, revision: null }]), { status: 200 });
  });
  render(<Live />);
  await screen.findByText('Pending session');
  fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
  expect(await screen.findByRole('status', { name: 'Loading session information' })).toBeInTheDocument();
  resolveLive(new Response(JSON.stringify({
    externalId: 'thread-1234', title: 'Pending session', repositoryName: 'app', status: 'active', observedAt: new Date().toISOString(),
    contextWindow: null, contextTokens: 0, contextPercent: null, turnCount: 0, completedTurnCount: 0, evidence: {},
    guidance: { available: false, agentsReads: 0, skillReads: 0, skillsUsed: [], promptCount: 0, promptsWithSkillRead: 0, averageSkillReadLatencyMs: null, currentPromptHasSkillRead: null },
    offload: { available: false, shellBatches: 0, candidateBatches: 0, associatedInputTokens: 0, associatedCachedInputTokens: 0, associatedOutputTokens: 0, associatedTotalTokens: 0, categories: { verification: 0, build: 0, formatting: 0, script: 0, monitoring: 0 }, processPatterns: [] },
    directives: { available: true, classifierVersion: 2, episodes: [] }, usageTimeline: { available: false, points: [] }, workers: [],
  }), { status: 200 }));
  expect(await screen.findByRole('heading', { name: 'Pending session' })).toBeInTheDocument();
});

test('clears the session-information loader when watching is paused before the first snapshot', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input).endsWith('/live')) return new Promise<Response>(() => undefined);
    return new Response(JSON.stringify([{ externalId: 'thread-1234', title: 'Pending session', repositoryName: 'app', source: 'cli', status: 'active', createdAt: null, updatedAt: new Date().toISOString(), branch: null, revision: null }]), { status: 200 });
  });
  render(<Live />);
  await screen.findByText('Pending session');
  fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
  expect(await screen.findByRole('status', { name: 'Loading session information' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pause watching' }));
  expect(screen.queryByRole('status', { name: 'Loading session information' })).not.toBeInTheDocument();
});

test('watches normalized Codex usage without starting a turn', async () => {
  const requests: string[] = [];
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input); requests.push(path);
    if (path.endsWith('/api/sessions/import')) return new Response(JSON.stringify({
      id: 'review-1', title: 'Codex session thread-1', status: 'idle', telemetryLevel: 'imported',
      observedSequence: 3, durableSequence: 3, startedAt: '2026-08-19T00:00:00.000Z', completedAt: null,
      turnCount: 2, eventCount: 3, checkCount: 0, changedFileEventCount: 0,
      inputTokens: 80, cachedInputTokens: 40, outputTokens: 20, platform: 'codex',
      externalSessionId: 'thread-1234', repositoryName: 'app', evidence: { toolCall: 3 }, usageAvailable: true,
      offload: { available: true, shellBatches: 3, candidateBatches: 1, associatedInputTokens: 20, associatedCachedInputTokens: 10, associatedOutputTokens: 5, associatedTotalTokens: 25, categories: { verification: 1, build: 0, formatting: 0, script: 0, monitoring: 0 }, processPatterns: [] },
      directives: { available: false, classifierVersion: 2, episodes: [] },
      usageTimeline: { available: false, points: [] },
      workerUsage: [{ id: 'worker-main', name: 'Main agent', role: 'orchestrator', model: 'gpt-sol', reasoningLevel: 'low', inputTokens: 80, cachedInputTokens: 40, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 5, totalTokens: 100 }],
      modelUsage: [],
    }), { status: 201 });
    if (path.endsWith('/live')) return new Response(JSON.stringify({
      externalId: 'thread-1234', title: 'Build live mode', repositoryName: 'app', status: 'active',
      observedAt: '2026-08-19T00:00:00.000Z', contextWindow: 200, contextTokens: 50,
      contextPercent: 25, turnCount: 2, completedTurnCount: 1, evidence: { toolCall: 3 },
      guidance: { available: true, agentsReads: 2, skillReads: 1, skillsUsed: ['develop-feature'], promptCount: 2, promptsWithSkillRead: 1, averageSkillReadLatencyMs: 2400, currentPromptHasSkillRead: false },
      offload: { available: true, shellBatches: 4, candidateBatches: 2, associatedInputTokens: 30, associatedCachedInputTokens: 20, associatedOutputTokens: 10, associatedTotalTokens: 40, categories: { verification: 1, build: 0, formatting: 0, script: 1, monitoring: 0 }, processPatterns: [{ key: 'git-host:pr-checks', label: 'GitHub pull-request checks', runner: 'git-host', operation: 'pr-checks', batchCount: 3, successCount: 2, failureCount: 1, unknownCount: 0, outputBytes: 2400000, maximumOutputBytes: 1200000, outputMode: 'final-state', recommendation: 'Poll outside model context; return the final state and failed check names only.' }] },
      directives: { available: true, classifierVersion: 2, episodes: [{
        key: 'directive:1', sequenceNumber: 1, status: 'completed', startedAt: '2026-08-19T00:00:00.000Z', completedAt: '2026-08-19T00:10:00.000Z',
        openingInteractionKey: 'prompt-1', openingKind: 'directive', classificationConfidence: 0.8,
        preparation: { questions: 2, context: 1, approvals: 0, patternReferences: 1, skillsUsed: ['review-changes'] }, corrections: 1,
        context: { tokensAtStart: 100, window: 200, percentAtStart: 50, peakPercent: 75 },
        usageAtStart: { inputTokens: 80, cachedInputTokens: 40, outputTokens: 20 },
        discovery: { agentsReferences: 1, skillReferences: 1, skillsUsed: ['develop-feature'], firstPatternLatencyMs: 2400, patternBeforeFirstChange: true },
        execution: { toolCalls: 4, fileChanges: 2, webSearches: 1, delegations: 1, compactions: 0, verificationBatches: 1 },
      }] },
      usageTimeline: { available: true, points: [
        { key: 'prompt-1', sequenceNumber: 1, kind: 'directive', status: 'completed', measurement: 'exact-live', startedAt: '2026-08-18T23:50:00.000Z', endedAt: '2026-08-18T23:58:00.000Z', durationMs: 480000, contextTokens: 20, contextWindow: 200, contextPercent: 10, inputTokens: 40, cachedInputTokens: 30, newInputTokens: 10, outputTokens: 8 },
        { key: 'prompt-2', sequenceNumber: 2, kind: 'question', status: 'active', measurement: 'exact-live', startedAt: '2026-08-18T23:58:00.000Z', endedAt: '2026-08-19T00:00:00.000Z', durationMs: 120000, contextTokens: 50, contextWindow: 200, contextPercent: 25, inputTokens: 20, cachedInputTokens: 10, newInputTokens: 10, outputTokens: 4 },
      ] },
      repositoryTraversal: {
        available: true, limitation: 'Observed paths do not establish intent.', totalFileHits: 3, uniqueFiles: 2, totalDirectoryVisits: 5,
        directionCounts: { down: 1, up: 1, cross: 0, same: 0, revisit: 1 }, directoriesTruncated: false, transitionsTruncated: false,
        directories: [{ id: 'repository:.', path: '', parentId: null, depth: 0, firstVisitOrder: 1, visitCount: 3 }, { id: 'directory:frontend', path: 'frontend', parentId: 'repository:.', depth: 1, firstVisitOrder: 1, visitCount: 2 }],
        transitions: [{ id: 'one', order: 1, fromPath: 'AGENTS.md', toPath: 'frontend/src/App.tsx', direction: 'down', hitCount: 1, heuristic: { phase: 'pre change observation', reason: 'read before change', basis: ['observable order'], confidence: 'medium' } }],
      },
      workers: [
        { externalThreadId: 'thread-1234', parentExternalThreadId: null, nickname: null, role: null, model: 'gpt-sol', reasoningLevel: 'low', inputTokens: 80, cachedInputTokens: 40, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 5, totalTokens: 100, active: true, updatedAt: new Date().toISOString() },
        { externalThreadId: 'thread-old', parentExternalThreadId: 'thread-1234', nickname: 'Historical worker', role: null, model: 'gpt-sol', reasoningLevel: 'medium', inputTokens: 40, cachedInputTokens: 20, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 1, totalTokens: 45, active: false, updatedAt: '2025-01-01T00:00:00.000Z' },
      ],
    }), { status: 200 });
    return new Response(JSON.stringify([
      { externalId: 'thread-1234', title: 'Build live mode', repositoryName: 'app', source: 'cli', status: 'active', createdAt: null, updatedAt: new Date().toISOString(), branch: null, revision: null },
      { externalId: 'thread-old', title: 'Old archived work', repositoryName: 'legacy-app', source: 'cli', status: 'idle', createdAt: null, updatedAt: '2025-01-01T00:00:00.000Z', branch: null, revision: null },
    ]), { status: 200 });
  });
  render(<Live />);
  expect(await screen.findByText('Build live mode')).toBeInTheDocument();
  expect(screen.queryByText('Old archived work')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Session activity period' }));
  fireEvent.click(screen.getByRole('option', { name: 'Last 24 hours' }));
  expect(screen.queryByText('Old archived work')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Generate static review' }));
  expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
  expect(screen.getByText('Waiting for prompt activity')).toBeInTheDocument();
  expect(await screen.findByText('Static review generated from durable SQLite evidence.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
  expect(await screen.findByRole('heading', { name: 'Build live mode' })).toBeInTheDocument();
  expect((await screen.findAllByText('25.0%')).length).toBeGreaterThan(0);
  expect(screen.getByRole('region', { name: 'Recent prompt token activity' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Stacked token movement by prompt' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Context pressure by prompt' })).toBeInTheDocument();
  expect(screen.getByText('Updating every second')).toBeInTheDocument();
  expect(screen.getAllByText('#2').length).toBeGreaterThan(1);
  expect(screen.getByText('2m 0s')).toBeInTheDocument();
  expect(screen.queryByText('Visible worker tokens')).not.toBeInTheDocument();
  expect(screen.queryByText('Directive episodes')).not.toBeInTheDocument();
  expect(screen.getByText('change-backed')).toBeInTheDocument();
  const promptDetails = screen.getByRole('button', { name: 'Show details for prompt #1' });
  expect(promptDetails).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(promptDetails);
  expect(promptDetails).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Pattern found before editing · 2.4s/)).toBeInTheDocument();
  expect(screen.getByText(/2 changes · 1 verification run/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Observed skill routing tree' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Directory structure observed during traversal' })).toBeInTheDocument();
  expect(screen.getByText('File hits').nextElementSibling).toHaveTextContent('3');
  expect(screen.getByText('All observed workers')).toBeInTheDocument();
  expect(screen.getByText('First guidance read after 2.4s · before first change')).toBeInTheDocument();
  expect(screen.getByText('develop-feature')).toBeInTheDocument();
  expect(screen.getByText(/Observed downstream: 2 changes/)).toBeInTheDocument();
  expect(screen.queryByText('Quiet process opportunities')).not.toBeInTheDocument();
  expect(screen.queryByText('Tool calls')).not.toBeInTheDocument();
  expect(screen.getByText('gpt-sol · low reasoning · 1 worker')).toBeInTheDocument();
  expect(screen.getByText('input tokens · 50.0% cached')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Main agent/ }));
  expect(screen.getAllByText(/low reasoning · 1 worker/).length).toBeGreaterThan(1);
  expect(screen.getByText('Cached input')).toBeInTheDocument();
  expect(screen.getAllByText('New input').length).toBeGreaterThan(1);
  expect(screen.getAllByText('Output').length).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole('button', { name: 'Worker activity period' }));
  fireEvent.click(screen.getByRole('option', { name: 'All time' }));
  expect(screen.getByText('Subagents')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Subagents/ }));
  expect(screen.getAllByText(/medium reasoning · 1 worker/).length).toBeGreaterThan(1);
  expect(screen.getAllByText('input tokens · 50.0% cached').length).toBeGreaterThan(1);
  expect(screen.queryByText('Historical worker')).not.toBeInTheDocument();
  expect(screen.queryByText('Agent breakdown')).not.toBeInTheDocument();
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));
  expect(requests.some(path => path.endsWith('/live'))).toBe(true);
  expect(requests.some(path => path.includes('turn/start'))).toBe(false);
});
