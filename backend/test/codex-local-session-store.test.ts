import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import DatabaseDriver from 'better-sqlite3';
import { classifySessionInteraction, readCodexLiveSession, readCodexWorkerUsage } from '../src/services/codex-local-session-store.js';

test('classifies content transiently into directive episode inputs', () => {
  assert.deepEqual(classifySessionInteraction('How does this work?'), { kind: 'question', confidence: 0.85 });
  assert.deepEqual(classifySessionInteraction('Please add the session report.'), { kind: 'directive', confidence: 0.8 });
  assert.deepEqual(classifySessionInteraction('Can you add it?'), { kind: 'mixed', confidence: 0.7 });
  assert.deepEqual(classifySessionInteraction('Actually, remove that panel.', true), { kind: 'correction', confidence: 0.85 });
  assert.deepEqual(classifySessionInteraction('yes'), { kind: 'approval', confidence: 0.95 });
});

test('reads bounded per-worker usage without retaining rollout content', async () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'agent-insights-codex-store-'));
  const sessions = join(codexHome, 'sessions');
  mkdirSync(sessions);
  const parentRollout = join(sessions, 'parent.jsonl');
  const childRollout = join(sessions, 'child.jsonl');
  const usage = (input, cached, output, reasoning) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output }, last_token_usage: { total_tokens: 75 }, model_context_window: 300 } } });
  writeFileSync(parentRollout, `${JSON.stringify({ payload: { message: 'must not be returned' } })}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: 'private prompt' } })}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:02.500Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec_command', input: 'cat AGENTS.md .agents/skills/develop-feature/SKILL.md .codex/plugins/cache/deep-research-work/0.1.0/skills/deep-research/SKILL.md' } })}\n${JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } })}\n${JSON.stringify({ type: 'event_msg', payload: { type: 'web_search_end', query: 'private query' } })}\n${usage(100, 60, 20, 5)}\n`);
  writeFileSync(childRollout, `${usage(40, 10, 8, 2)}\n`);
  const sqlite = new DatabaseDriver(join(codexHome, 'state_5.sqlite'));
  sqlite.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, model TEXT, reasoning_effort TEXT, agent_nickname TEXT, agent_role TEXT, rollout_path TEXT, title TEXT, cwd TEXT); CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT PRIMARY KEY, status TEXT);');
  sqlite.prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('thread-parent', 'gpt-sol', 'low', null, null, parentRollout, 'Build safely', '/private/repositories/example');
  sqlite.prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('thread-child', 'gpt-luna', 'medium', 'Tester', 'tester', childRollout, null, null);
  sqlite.prepare('INSERT INTO thread_spawn_edges VALUES (?, ?, ?)').run('thread-parent', 'thread-child', 'completed');
  sqlite.close();
  const workers = await readCodexWorkerUsage('thread-parent', { codexHome });
  assert.deepEqual(workers.map(worker => ({ id: worker.externalThreadId, model: worker.model, total: worker.totalTokens })), [
    { id: 'thread-parent', model: 'gpt-sol', total: 120 },
    { id: 'thread-child', model: 'gpt-luna', total: 48 },
  ]);
  assert.equal(JSON.stringify(workers).includes('must not be returned'), false);
  const live = await readCodexLiveSession('thread-parent', { codexHome });
  assert.equal(live.status, 'active');
  assert.equal(live.repositoryName, 'example');
  assert.equal(live.contextPercent, 25);
  assert.equal(live.evidence.webSearch, 1);
  assert.equal(live.usageTimeline.available, true);
  assert.equal(live.repositoryTraversal.available, true);
  assert.equal(live.repositoryTraversal.totalFileHits, 3);
  assert.equal(live.repositoryTraversal.uniqueFiles, 3);
  assert.deepEqual(live.usageTimeline.points.map(point => ({ sequence: point.sequenceNumber, status: point.status, input: point.inputTokens, cached: point.cachedInputTokens, output: point.outputTokens })), [
    { sequence: 1, status: 'active', input: 100, cached: 60, output: 20 },
  ]);
  assert.deepEqual(live.guidance, { available: true, agentsReads: 1, skillReads: 2, skillsUsed: ['deep-research-work:deep-research', 'develop-feature'], promptCount: 1, promptsWithSkillRead: 1, averageSkillReadLatencyMs: 2500, currentPromptHasSkillRead: true });
  assert.equal(live.directives.episodes.length, 0);
  assert.deepEqual(live.offload, { available: true, shellBatches: 1, candidateBatches: 0, associatedInputTokens: 0, associatedCachedInputTokens: 0, associatedOutputTokens: 0, associatedTotalTokens: 0, categories: { verification: 0, build: 0, formatting: 0, script: 0, monitoring: 0 }, processPatterns: [] });
  assert.equal(JSON.stringify(live).includes('private query'), false);

  const longNonCandidate = `await tools.exec_command({ cmd: "${'path/'.repeat(20_000)}" })`;
  const processOutput = JSON.stringify({ output: 'bounded result', exit_code: 0 });
  appendFileSync(parentRollout, `${JSON.stringify({ timestamp: '2026-08-19T00:00:03.000Z', type: 'response_item', payload: { id: 'message-directive', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Please add the report.' }] } })}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:04.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec', arguments: longNonCandidate } })}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:04.500Z', type: 'event_msg', payload: { type: 'patch_apply_end' } })}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:05.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec', call_id: 'process-1', arguments: 'await tools.exec_command({ cmd: "npm run check && ./scripts/verify.sh" })' } })}\n${JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'process-1', output: processOutput } })}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:06.000Z', type: 'event_msg', payload: { type: 'task_complete' } })}\n${usage(120, 80, 30, 6)}\n${JSON.stringify({ timestamp: '2026-08-19T00:00:07.000Z', type: 'response_item', payload: { id: 'message-question', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'What did that change?' }] } })}\n`);
  const appended = await readCodexLiveSession('thread-parent', { codexHome });
  assert.equal(appended.status, 'idle');
  assert.equal(appended.evidence.webSearch, 1);
  assert.equal(appended.completedTurnCount, 1);
  assert.equal(appended.workers[0].totalTokens, 150);
  assert.deepEqual(appended.usageTimeline.points.at(-1) && {
    sequence: appended.usageTimeline.points.at(-1)!.sequenceNumber,
    status: appended.usageTimeline.points.at(-1)!.status,
    input: appended.usageTimeline.points.at(-1)!.inputTokens,
  }, { sequence: 3, status: 'completed', input: 0 });
  assert.equal(appended.offload.processPatterns.length, 2);
  assert.deepEqual(appended.directives.episodes[0], {
    key: 'directive:message-directive', sequenceNumber: 1, status: 'completed', startedAt: '2026-08-19T00:00:03.000Z', completedAt: '2026-08-19T00:00:06.000Z',
    openingInteractionKey: 'message-directive', openingKind: 'directive', classificationConfidence: 0.8,
    preparation: { questions: 0, context: 1, approvals: 0, patternReferences: 3, skillsUsed: ['deep-research-work:deep-research', 'develop-feature'] }, corrections: 0,
    context: { tokensAtStart: 75, window: 300, percentAtStart: 25, peakPercent: 25 },
    usageAtStart: { inputTokens: 100, cachedInputTokens: 60, outputTokens: 20 },
    discovery: { agentsReferences: 0, skillReferences: 0, skillsUsed: [], firstPatternLatencyMs: null, patternBeforeFirstChange: null },
    execution: { toolCalls: 2, fileChanges: 1, webSearches: 0, delegations: 0, compactions: 0, verificationBatches: 1 },
  });
  assert.deepEqual(appended.offload.processPatterns.map(pattern => ({ key: pattern.key, batches: pattern.batchCount, success: pattern.successCount, bytes: pattern.outputBytes })), [
    { key: 'package-manager:check', batches: 1, success: 1, bytes: Buffer.byteLength(processOutput) },
    { key: 'script:script', batches: 1, success: 1, bytes: Buffer.byteLength(processOutput) },
  ]);

  appendFileSync(parentRollout, `${JSON.stringify({ timestamp: '2026-08-19T00:00:08.000Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec_command', call_id: 'process-pending', input: 'npm test' } })}\n`);
  const pending = await readCodexLiveSession('thread-parent', { codexHome });
  assert.deepEqual(pending.offload.processPatterns.find(pattern => pattern.key === 'package-manager:test'), {
    key: 'package-manager:test', label: 'Package-manager test', runner: 'package-manager', operation: 'test', batchCount: 1,
    successCount: 0, failureCount: 0, unknownCount: 1, outputBytes: 0, maximumOutputBytes: 0,
    outputMode: 'summary-errors', recommendation: 'Return exit status and a compact summary on success; include a bounded error excerpt on failure.',
  });
  appendFileSync(parentRollout, `${JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'process-pending', output: JSON.stringify({ exit_code: 0, output: 'x'.repeat(70_000) }) } })}\n`);
  const completedPending = await readCodexLiveSession('thread-parent', { codexHome });
  assert.deepEqual(completedPending.offload.processPatterns.find(pattern => pattern.key === 'package-manager:test') && {
    success: completedPending.offload.processPatterns.find(pattern => pattern.key === 'package-manager:test')!.successCount,
    unknown: completedPending.offload.processPatterns.find(pattern => pattern.key === 'package-manager:test')!.unknownCount,
    boundedBytes: completedPending.offload.processPatterns.find(pattern => pattern.key === 'package-manager:test')!.outputBytes,
  }, { success: 0, unknown: 1, boundedBytes: 65_536 });

  const cyclic = new DatabaseDriver(join(codexHome, 'state_5.sqlite'));
  cyclic.prepare('INSERT INTO thread_spawn_edges VALUES (?, ?, ?)').run('thread-child', 'thread-parent', 'completed');
  cyclic.close();
  assert.equal((await readCodexWorkerUsage('thread-parent', { codexHome })).length, 2);

  const roots = new DatabaseDriver(join(codexHome, 'state_5.sqlite'));
  roots.prepare('UPDATE threads SET cwd = ? WHERE id = ?').run('/private/repositories/example/worker', 'thread-child');
  roots.close();
  const pathCall = (id: string, cmd: string, workdir?: string) => JSON.stringify({ timestamp: '2026-08-19T00:00:09.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: id, arguments: JSON.stringify({ cmd, workdir }) } }) + '\n';
  appendFileSync(parentRollout, pathCall('nested-read', 'cat local.ts', '/private/repositories/example/src'));
  appendFileSync(parentRollout, pathCall('external-read', 'cat secret.ts', '/private/other'));
  appendFileSync(childRollout, pathCall('worker-read', 'cat helper.ts'));
  const rooted = await readCodexLiveSession('thread-parent', { codexHome });
  assert.ok(rooted.repositoryTraversal.transitions.some(transition => transition.toPath === 'src/local.ts'));
  assert.ok(rooted.repositoryTraversal.transitions.some(transition => transition.toPath === 'worker/helper.ts'));
  assert.equal(JSON.stringify(rooted.repositoryTraversal).includes('secret.ts'), false);
  const orderedPaths = Array.from({ length: 12 }, (_, index) => `ordered/file-${index + 1}.ts`);
  appendFileSync(parentRollout, pathCall('ordered-read', `cat ${orderedPaths.join(' ')}`));
  const ordered = await readCodexLiveSession('thread-parent', { codexHome });
  assert.deepEqual(ordered.repositoryTraversal.transitions.filter(transition => transition.toPath.startsWith('ordered/')).map(transition => transition.toPath), orderedPaths);


  writeFileSync(parentRollout, `${usage(2, 1, 1, 0)}\n`);
  const truncated = await readCodexLiveSession('thread-parent', { codexHome });
  assert.equal(truncated.evidence.webSearch ?? 0, 0);
  assert.equal(truncated.workers[0].totalTokens, 3);
});
