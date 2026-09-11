import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import FloatingSelect from '../../common/components/FloatingSelect/FloatingSelect';
import LoadingSpinner from '../../common/components/LoadingSpinner/LoadingSpinner';
import SkillRoutingTree from '../../components/SkillRoutingTree/SkillRoutingTree';
import RepositoryTraversal from '../../components/RepositoryTraversal/RepositoryTraversal';
import type { LiveSessionSnapshot, RepositoryTraversalReport, SessionReview, StoredCodexSession } from '../../types';
import { eyebrowClass, mutedTextClass, pageTitleClass, panelClass } from '../../ui';

const buttonClass = 'rounded-lg bg-[#6f56d9] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 dark:bg-[#a58cff] dark:text-[#17131f]';
const secondaryButtonClass = 'rounded-lg border border-[#c8c1df] px-4 py-2.5 text-sm font-semibold dark:border-[#4d455e]';
const number = new Intl.NumberFormat();
const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
type WorkerRange = 'active' | 'today' | 'week' | 'month' | 'all';
type SessionRange = 'five' | 'hour' | 'day' | 'week' | 'month' | 'all';
const unavailableRepositoryTraversal: RepositoryTraversalReport = { available: false, limitation: 'Historical path touches were not retained for this review.', totalFileHits: 0, uniqueFiles: 0, totalDirectoryVisits: 0, directionCounts: { down: 0, up: 0, cross: 0, same: 0, revisit: 0 }, directories: [], transitions: [], directoriesTruncated: false, transitionsTruncated: false };

function startOfDay(date = new Date()) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function workerInRange(worker: LiveSessionSnapshot['workers'][number], range: WorkerRange, now = new Date()) {
  if (range === 'active') return worker.active;
  if (range === 'all') return true;
  const updated = new Date(worker.updatedAt).getTime();
  const today = startOfDay(now);
  if (range === 'today') return updated >= today.getTime();
  if (range === 'week') { const week = new Date(today); week.setDate(week.getDate() - week.getDay()); return updated >= week.getTime(); }
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  return updated >= month.getTime();
}
function sessionInRange(session: StoredCodexSession, range: SessionRange, now = Date.now()) {
  if (range === 'all') return true;
  const updated = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
  const windows = { five: 5 * 60_000, hour: 60 * 60_000, day: 24 * 60 * 60_000, week: 7 * 24 * 60 * 60_000, month: 30 * 24 * 60 * 60_000 };
  return updated > 0 && updated >= now - windows[range];
}
function relativeActivity(session: StoredCodexSession, now = Date.now()) {
  if (!session.updatedAt) return 'Activity time unavailable';
  const elapsed = Math.max(0, now - new Date(session.updatedAt).getTime());
  if (elapsed < 60_000) return 'Active less than a minute ago';
  if (elapsed < 60 * 60_000) return `Active ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 24 * 60 * 60_000) return `Active ${Math.floor(elapsed / (60 * 60_000))}h ago`;
  if (elapsed < 30 * 24 * 60 * 60_000) return `Active ${Math.floor(elapsed / (24 * 60 * 60_000))}d ago`;
  return `Last active ${new Date(session.updatedAt).toLocaleDateString()}`;
}
function cacheHitRate(inputTokens: number, cachedInputTokens: number) {
  return inputTokens > 0 ? `${((Math.min(cachedInputTokens, inputTokens) / inputTokens) * 100).toFixed(1)}%` : 'Unavailable';
}
function elapsedTime(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function openingKindLabel(kind: LiveSessionSnapshot['directives']['episodes'][number]['openingKind']) {
  if (kind === 'mixed') return 'Question + change request';
  if (kind === 'question') return 'Question that led to changes';
  if (kind === 'approval') return 'Approval that led to changes';
  if (kind === 'correction') return 'Correction that led to changes';
  if (kind === 'context') return 'Context that led to changes';
  return 'Change request';
}

function reviewSnapshot(review: SessionReview): LiveSessionSnapshot {
  const observedAt = review.completedAt ?? review.startedAt ?? new Date(0).toISOString();
  return {
    externalId: review.externalSessionId,
    title: review.title ?? 'Stored session',
    repositoryName: review.repositoryName,
    status: review.status,
    observedAt,
    contextWindow: null,
    contextTokens: 0,
    contextPercent: null,
    turnCount: review.turnCount,
    completedTurnCount: review.status === 'completed' ? review.turnCount : 0,
    evidence: review.evidence,
    guidance: { available: false, agentsReads: 0, skillReads: 0, skillsUsed: [], promptCount: 0, promptsWithSkillRead: 0, averageSkillReadLatencyMs: null, currentPromptHasSkillRead: null },
    offload: review.offload ?? { available: false, shellBatches: 0, candidateBatches: 0, associatedInputTokens: 0, associatedCachedInputTokens: 0, associatedOutputTokens: 0, associatedTotalTokens: 0, categories: { verification: 0, build: 0, formatting: 0, script: 0, monitoring: 0 }, processPatterns: [] },
    directives: review.directives ?? { available: false, classifierVersion: 2, episodes: [] },
    usageTimeline: review.usageTimeline ?? { available: false, points: [] },
    repositoryTraversal: review.repositoryTraversal ?? unavailableRepositoryTraversal,
    workers: review.workerUsage.map(worker => ({
      externalThreadId: worker.id,
      parentExternalThreadId: worker.role === 'orchestrator' ? null : 'subagent',
      nickname: worker.name,
      role: worker.role,
      model: worker.model,
      reasoningLevel: worker.reasoningLevel,
      inputTokens: worker.inputTokens ?? 0,
      cachedInputTokens: worker.cachedInputTokens ?? 0,
      cacheWriteInputTokens: worker.cacheWriteInputTokens ?? 0,
      outputTokens: worker.outputTokens ?? 0,
      reasoningOutputTokens: worker.reasoningOutputTokens ?? 0,
      totalTokens: worker.totalTokens,
      active: false,
      updatedAt: observedAt,
    })),
  };
}

export default function Live({ embedded = false }: { embedded?: boolean }) {
  const [sessions, setSessions] = useState<StoredCodexSession[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot | null>(null);
  const [watching, setWatching] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState<'live' | 'static' | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [workerRange, setWorkerRange] = useState<WorkerRange>('today');
  const [sessionRange, setSessionRange] = useState<SessionRange>('five');
  const [sessionQuery, setSessionQuery] = useState('');
  const [expandedUsage, setExpandedUsage] = useState<Record<'Main agent' | 'Subagents', boolean>>({ 'Main agent': false, Subagents: false });
  const [expandedPromptDetails, setExpandedPromptDetails] = useState<Record<string, boolean>>({});
  const dashboardRef = useRef<HTMLElement>(null);
  const scrollOnNextSnapshot = useRef(false);

  useEffect(() => {
    let active = true;
    api.storedCodexSessions().then(items => {
      if (!active) return;
      setSessions(items); setSelectedId(items.find(item => sessionInRange(item, 'five'))?.externalId ?? '');
    }).catch(error => active && setMessage((error as Error).message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!watching || !selectedId) return;
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api.liveCodexSession(selectedId);
        if (active) { setSnapshot(next); setSnapshotMode('live'); setMessage(''); }
      } catch (error) {
        if (active) { setMessage((error as Error).message); setWatching(false); }
      } finally { if (active) setDashboardLoading(false); inFlight = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedId, watching]);

  useEffect(() => {
    if (!snapshot || !scrollOnNextSnapshot.current) return;
    scrollOnNextSnapshot.current = false;
    dashboardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [snapshot]);

  useEffect(() => {
    if (!dashboardLoading || !scrollOnNextSnapshot.current) return;
    dashboardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [dashboardLoading]);

  async function generateReview() {
    if (!selectedId) return;
    setWatching(false); setDashboardLoading(true); setMessage('Generating a static review…');
    try {
      const saved = await api.importCodexSession(selectedId);
      setSnapshot(reviewSnapshot(saved)); setSnapshotMode('static');
      setMessage('Static review generated from durable SQLite evidence.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setDashboardLoading(false); }
  }

  const visibleWorkers = snapshot?.workers.filter(worker => workerInRange(worker, workerRange)) ?? [];
  const usageGroups = [...visibleWorkers.reduce((groups, worker) => {
    const scope = worker.parentExternalThreadId === null ? 'Main agent' : 'Subagents';
    const key = `${scope}:${worker.model ?? 'Unattributed'}:${worker.reasoningLevel ?? 'unknown'}`;
    const current = groups.get(key) ?? { key, scope, model: worker.model ?? 'Unattributed', reasoning: worker.reasoningLevel ?? 'unknown', workers: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, running: 0 };
    current.workers += 1; current.inputTokens += worker.inputTokens; current.cachedInputTokens += worker.cachedInputTokens; current.outputTokens += worker.outputTokens; current.running += worker.active ? 1 : 0;
    groups.set(key, current); return groups;
  }, new Map<string, { key: string; scope: string; model: string; reasoning: string; workers: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; running: number }>()).values()];
  const usageTotals = (['Main agent', 'Subagents'] as const).map(scope => {
    const workers = visibleWorkers.filter(worker => (worker.parentExternalThreadId === null ? 'Main agent' : 'Subagents') === scope);
    return {
      scope,
      workers: workers.length,
      running: workers.filter(worker => worker.active).length,
      inputTokens: workers.reduce((sum, worker) => sum + worker.inputTokens, 0),
      cachedInputTokens: workers.reduce((sum, worker) => sum + worker.cachedInputTokens, 0),
      outputTokens: workers.reduce((sum, worker) => sum + worker.outputTokens, 0),
      details: usageGroups.filter(group => group.scope === scope),
    };
  }).filter(group => group.workers > 0);
  const normalizedQuery = sessionQuery.trim().toLowerCase();
  const visibleSessions = sessions.filter(session => sessionInRange(session, sessionRange) && (!normalizedQuery || `${session.title} ${session.repositoryName ?? ''}`.toLowerCase().includes(normalizedQuery)));
  const directiveEpisodes = snapshot?.directives?.episodes ?? [];
  const directiveByInteraction = new Map(directiveEpisodes.map(episode => [episode.openingInteractionKey, episode]));
  const chartUsage = snapshot?.usageTimeline?.points.slice(-12) ?? [];
  const recentUsage = chartUsage.slice().reverse();
  const maximumPromptTokens = Math.max(1, ...chartUsage.map(point => (point.inputTokens ?? 0) + (point.outputTokens ?? 0)));
  const chartSlot = chartUsage.length ? 540 / chartUsage.length : 540;
  return (
    <section className={embedded ? undefined : 'mx-auto max-w-[1100px]'} aria-labelledby="live-title">
      {embedded
        ? <p className={`mb-5 ${mutedTextClass}`} id="live-title">Monitor an existing session or review a completed session.</p>
        : <><p className={eyebrowClass}>LIVE SESSION</p><h2 className={pageTitleClass} id="live-title">Watch work in progress</h2><p className={`mb-7 max-w-[760px] leading-7 ${mutedTextClass}`}>Select a Codex thread already on this machine. Monitoring reads normalized local telemetry only; it does not start a turn or spend tokens.</p></>}
      {message && <p className="mb-5 rounded-lg border border-[#dedbea] bg-white p-4 text-sm dark:border-[#373241] dark:bg-[#1b1921]" role="status">{message}</p>}
      <section className={`${panelClass} p-6`} aria-labelledby="connection-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="connection-title">Sessions</h3><p className={`mt-1 text-sm ${mutedTextClass}`}>{visibleSessions.length} sessions in this activity period</p></div><div className="w-[190px]"><label className="sr-only" htmlFor="session-range">Session activity period</label><FloatingSelect id="session-range" value={sessionRange} options={[{ value: 'five', label: 'Last 5 minutes' }, { value: 'hour', label: 'Last hour' }, { value: 'day', label: 'Last 24 hours' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' }, { value: 'all', label: 'All time' }]} onChange={value => setSessionRange(value as SessionRange)} /></div></div>
        <label className="sr-only" htmlFor="session-search">Search session history</label><input id="session-search" className="mt-4 w-full rounded-lg border border-[#c8c1df] bg-white px-4 py-3 text-sm outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/32 dark:border-[#4d455e] dark:bg-[#1b1921]" type="search" value={sessionQuery} onChange={event => setSessionQuery(event.target.value)} placeholder="Search by session title or repository" />
        <div className="mt-4 grid max-h-[360px] gap-2 overflow-y-auto pr-1" aria-label="Recent Codex sessions">
          {loading && <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#c8c1df] p-5 dark:border-[#4d455e]" aria-label="Loading sessions" role="status"><LoadingSpinner /><strong className="text-sm">Loading sessions…</strong><span className={`text-xs ${mutedTextClass}`}>Reading stored Codex threads.</span></div>}
          {!loading && visibleSessions.map(session => <button className={`grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-xl border p-4 text-left ${selectedId === session.externalId ? 'border-[#6f56d9] bg-[#f4f1fc] dark:border-[#a58cff] dark:bg-[#27222f]' : 'border-[#dedbea] dark:border-[#373241]'}`} key={session.externalId} onClick={() => { setSelectedId(session.externalId); setSnapshot(null); setSnapshotMode(null); setWatching(false); setDashboardLoading(false); setExpandedPromptDetails({}); }} type="button"><span><strong className="line-clamp-1 block text-sm">{session.title}</strong><span className={`mt-1 block text-xs ${mutedTextClass}`}>{session.repositoryName ?? 'No repository'} · {session.source}</span></span><span className={`text-xs font-semibold ${mutedTextClass}`}>{relativeActivity(session)}</span></button>)}
          {!loading && !visibleSessions.length && <div className="rounded-xl border border-dashed border-[#c8c1df] p-5 text-sm dark:border-[#4d455e]"><strong>No matching recent sessions</strong><p className={`mt-2 ${mutedTextClass}`}>Clear the search or choose a wider recent-activity period.</p></div>}
        </div>
        <div className={`mt-4 flex flex-wrap items-center gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
          {!embedded && <p className={`text-xs ${mutedTextClass}`}>{selectedId ? 'Use this same dashboard as a live view or a frozen review.' : 'Select a session to continue.'}</p>}
          <div className="flex gap-2"><button className={buttonClass} disabled={!selectedId || loading} onClick={() => { if (watching) { setWatching(false); setDashboardLoading(false); scrollOnNextSnapshot.current = false; } else { scrollOnNextSnapshot.current = true; setDashboardLoading(true); setSnapshotMode('live'); setWatching(true); } }} type="button">{watching ? 'Pause watching' : snapshotMode === 'live' ? 'Resume watching' : 'Start watching'}</button><button className={secondaryButtonClass} disabled={!selectedId || loading || dashboardLoading} onClick={() => void generateReview()} type="button">Generate static review</button></div>
        </div>
      </section>
      {dashboardLoading && <section className={`${panelClass} mt-6 scroll-mt-6 p-10`} aria-live="polite" aria-label="Loading session information" ref={dashboardRef} role="status"><div className="flex flex-col items-center justify-center gap-3"><LoadingSpinner size="lg" /><strong>Loading session information…</strong><span className={`text-xs ${mutedTextClass}`}>Reading normalized local telemetry.</span></div></section>}
      {snapshot && !dashboardLoading && <>
        <section className={`${panelClass} mt-6 scroll-mt-6 p-6`} aria-labelledby="health-title" ref={dashboardRef}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 id="health-title">{snapshot.title}</h3><p className={`mt-1 text-sm ${mutedTextClass}`}>{snapshot.repositoryName ?? 'No repository'}</p></div><span className="rounded-full bg-[#f4f1fc] px-3 py-1 text-xs font-semibold dark:bg-[#27222f]">{snapshot.status}</span></div>
          <div className="mt-5 grid grid-cols-[1.2fr_.8fr] gap-3 max-[700px]:grid-cols-1">
            <div className="rounded-xl bg-[#f4f1fc] p-4 dark:bg-[#27222f]">
              <div className="flex items-end justify-between gap-4"><span><span className={`block text-xs ${mutedTextClass}`}>Current context</span><strong className="mt-1 block text-2xl">{snapshot.contextPercent === null ? 'Unavailable' : `${snapshot.contextPercent.toFixed(1)}%`}</strong></span>{snapshot.contextWindow !== null && <span className={`text-right text-xs ${mutedTextClass}`}>{compactNumber.format(snapshot.contextTokens)} / {compactNumber.format(snapshot.contextWindow)}</span>}</div>
              {snapshot.contextPercent !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dedbea] dark:bg-[#373241]" aria-label={`${snapshot.contextPercent.toFixed(1)}% of context window used`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.contextPercent}><div className="h-full rounded-full bg-[#6f56d9] transition-[width] motion-reduce:transition-none dark:bg-[#a58cff]" style={{ width: `${snapshot.contextPercent}%` }} /></div>}
            </div>
            <div className="rounded-xl bg-[#f4f1fc] p-4 dark:bg-[#27222f]"><span className={`block text-xs ${mutedTextClass}`}>Session activity</span><strong className="mt-1 block text-2xl">{visibleWorkers.filter(worker => worker.active).length} active</strong><span className={`mt-1 block text-xs ${mutedTextClass}`}>{visibleWorkers.length} visible workers · {snapshot.completedTurnCount}/{snapshot.turnCount} turns complete</span></div>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3"><div><h4>Recent prompt activity</h4><p className={`mt-1 text-xs ${mutedTextClass}`}>Root-agent token movement between privacy-safe prompt boundaries.</p></div>{snapshotMode === 'live' && <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#236534] dark:text-[#9ce0ad]"><span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />Updating every second</span>}</div>
          {chartUsage.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
            <figure className="rounded-xl border border-[#dedbea] p-4 dark:border-[#373241]">
              <figcaption><strong className="text-sm">Token movement</strong><span className={`mt-0.5 block text-[11px] ${mutedTextClass}`}>Per prompt interval</span></figcaption>
              <svg aria-label="Stacked token movement by prompt" className="mt-3 h-[180px] w-full" role="img" viewBox="0 0 600 180">
                <line className="stroke-[#dedbea] dark:stroke-[#373241]" x1="30" x2="570" y1="145" y2="145" />
                {chartUsage.map((point, index) => {
                  const cachedHeight = ((point.cachedInputTokens ?? 0) / maximumPromptTokens) * 120;
                  const newHeight = ((point.newInputTokens ?? 0) / maximumPromptTokens) * 120;
                  const outputHeight = ((point.outputTokens ?? 0) / maximumPromptTokens) * 120;
                  const x = 30 + index * chartSlot + Math.max(2, (chartSlot - Math.min(34, chartSlot * .58)) / 2);
                  const width = Math.min(34, chartSlot * .58);
                  const available = point.measurement !== 'unavailable';
                  return <g key={point.key}>
                    {available ? <>
                      <rect className="fill-[#9b86ef] dark:fill-[#8e78e0]" height={cachedHeight} rx="2" width={width} x={x} y={145 - cachedHeight} />
                      <rect className="fill-[#5d43c5] dark:fill-[#b39cff]" height={newHeight} rx="2" width={width} x={x} y={145 - cachedHeight - newHeight} />
                      <rect className="fill-[#2f9d78] dark:fill-[#73d6b4]" height={outputHeight} rx="2" width={width} x={x} y={145 - cachedHeight - newHeight - outputHeight} />
                    </> : <line className="stroke-[#aaa3b7]" strokeDasharray="3 3" x1={x} x2={x + width} y1="144" y2="144" />}
                    <text className="fill-[#6f6a7d] text-[9px] dark:fill-[#aaa3b7]" textAnchor="middle" x={x + width / 2} y="163">#{point.sequenceNumber}</text>
                  </g>;
                })}
              </svg>
              <div className={`flex flex-wrap gap-3 text-[10px] ${mutedTextClass}`} aria-hidden="true"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#9b86ef]" />Cached</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#5d43c5]" />New input</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2f9d78]" />Output</span></div>
            </figure>
            <figure className="rounded-xl border border-[#dedbea] p-4 dark:border-[#373241]">
              <figcaption><strong className="text-sm">Context pressure</strong><span className={`mt-0.5 block text-[11px] ${mutedTextClass}`}>At each prompt boundary</span></figcaption>
              <svg aria-label="Context pressure by prompt" className="mt-3 h-[180px] w-full" role="img" viewBox="0 0 600 180">
                {[25, 50, 75, 100].map(percent => <g key={percent}><line className="stroke-[#dedbea] dark:stroke-[#373241]" x1="30" x2="570" y1={145 - percent * 1.2} y2={145 - percent * 1.2} /><text className="fill-[#6f6a7d] text-[9px] dark:fill-[#aaa3b7]" textAnchor="end" x="25" y={148 - percent * 1.2}>{percent}%</text></g>)}
                {chartUsage.slice(1).map((point, index) => {
                  const previous = chartUsage[index];
                  if (previous.contextPercent === null || point.contextPercent === null) return null;
                  const spacing = chartUsage.length === 1 ? 0 : 540 / (chartUsage.length - 1);
                  return <line className="stroke-[#6f56d9] dark:stroke-[#a58cff]" key={`${previous.key}:${point.key}`} strokeLinecap="round" strokeWidth="3" x1={30 + index * spacing} x2={30 + (index + 1) * spacing} y1={145 - previous.contextPercent * 1.2} y2={145 - point.contextPercent * 1.2} />;
                })}
                {chartUsage.map((point, index) => point.contextPercent === null ? null : <g key={point.key}><circle className="fill-white stroke-[#6f56d9] dark:fill-[#1b1921] dark:stroke-[#a58cff]" cx={30 + (chartUsage.length === 1 ? 270 : index * (540 / (chartUsage.length - 1)))} cy={145 - point.contextPercent * 1.2} r="4" strokeWidth="3" /><text className="fill-[#6f6a7d] text-[9px] dark:fill-[#aaa3b7]" textAnchor="middle" x={30 + (chartUsage.length === 1 ? 270 : index * (540 / (chartUsage.length - 1)))} y="163">#{point.sequenceNumber}</text></g>)}
              </svg>
            </figure>
          </div>}
          {recentUsage.length > 0 ? <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-[#dedbea] outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/32 dark:border-[#373241] dark:focus-visible:outline-[#a58cff]/32" role="region" aria-label="Recent prompt token activity" tabIndex={0}>
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <caption className="sr-only">Recent prompt activity with context, cached input, new input, output, and elapsed time</caption>
              <thead><tr className={`text-left text-[11px] uppercase tracking-wide ${mutedTextClass}`}><th className="px-4 py-3 font-semibold" scope="col">Prompt</th><th className="px-3 py-3 font-semibold" scope="col">Context</th><th className="px-3 py-3 text-right font-semibold" scope="col">Cached</th><th className="px-3 py-3 text-right font-semibold" scope="col">New input</th><th className="px-3 py-3 text-right font-semibold" scope="col">Output</th><th className="px-4 py-3 text-right font-semibold" scope="col">Elapsed</th></tr></thead>
              <tbody>{recentUsage.map(point => {
                const episode = directiveByInteraction.get(point.key);
                const expanded = Boolean(expandedPromptDetails[point.key]);
                const detailId = `prompt-detail-${point.sequenceNumber}`;
                const patternSignal = episode?.discovery.patternBeforeFirstChange === true ? 'Pattern found before editing' : episode?.discovery.patternBeforeFirstChange === false ? 'Pattern found after editing' : 'No pattern timing observed';
                return <Fragment key={point.key}>
                  <tr className="border-t border-[#dedbea] dark:border-[#373241]"><th className="px-4 py-3 text-left font-normal" scope="row"><span className="flex flex-wrap items-center gap-2"><strong>#{point.sequenceNumber}</strong>{point.status === 'active' && <span className="rounded-full bg-[#e8f6eb] px-2 py-0.5 text-[10px] font-semibold text-[#236534] dark:bg-[#203a28] dark:text-[#9ce0ad]">live</span>}{episode && <span className="rounded-full bg-[#f0ebff] px-2 py-0.5 text-[10px] font-semibold text-[#5d43c5] dark:bg-[#332b46] dark:text-[#c7b8ff]">change-backed</span>}</span><span className={`mt-0.5 block text-xs ${mutedTextClass}`}>{openingKindLabel(point.kind)}</span>{episode && <button aria-controls={detailId} aria-expanded={expanded} className="mt-1 rounded text-xs font-semibold text-[#5d43c5] outline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-[#6f56d9]/32 dark:text-[#b8a6ff]" onClick={() => setExpandedPromptDetails(current => ({ ...current, [point.key]: !current[point.key] }))} type="button">{expanded ? 'Hide details' : 'Show details'}<span className="sr-only"> for prompt #{point.sequenceNumber}</span></button>}</th><td className="px-3 py-3">{point.contextPercent === null ? '—' : `${point.contextPercent.toFixed(1)}%`}</td><td className="px-3 py-3 text-right font-semibold">{point.cachedInputTokens === null ? '—' : compactNumber.format(point.cachedInputTokens)}</td><td className="px-3 py-3 text-right font-semibold">{point.newInputTokens === null ? '—' : compactNumber.format(point.newInputTokens)}</td><td className="px-3 py-3 text-right font-semibold">{point.outputTokens === null ? '—' : compactNumber.format(point.outputTokens)}</td><td className="px-4 py-3 text-right"><strong>{elapsedTime(point.durationMs)}</strong><span className={`mt-0.5 block text-[11px] ${mutedTextClass}`}>{point.measurement === 'unavailable' ? 'usage unavailable' : point.status}</span></td></tr>
                  {episode && expanded && <tr className="bg-[#faf9fd] dark:bg-[#211e28]" id={detailId}><td className="px-4 py-4 text-xs" colSpan={6}><div className="grid grid-cols-3 gap-4 max-[760px]:grid-cols-1"><div><strong className="block">Preparation</strong><span className={mutedTextClass}>{episode.preparation.questions} questions · {episode.preparation.context} context · {episode.corrections} corrections{episode.preparation.patternReferences ? ` · ${episode.preparation.patternReferences} prior pattern refs` : ''}{episode.preparation.skillsUsed.length ? ` · ${episode.preparation.skillsUsed.join(', ')}` : ''}</span></div><div><strong className="block">Discovery</strong><span className={mutedTextClass}>{patternSignal}{episode.discovery.firstPatternLatencyMs === null ? '' : ` · ${(episode.discovery.firstPatternLatencyMs / 1_000).toFixed(1)}s`}{episode.discovery.skillsUsed.length ? ` · ${episode.discovery.skillsUsed.join(', ')}` : ''}</span></div><div><strong className="block">Execution</strong><span className={mutedTextClass}>{episode.execution.fileChanges} changes · {episode.execution.verificationBatches} verification run{episode.execution.verificationBatches === 1 ? '' : 's'} · {episode.execution.webSearches} searches · {episode.execution.delegations} delegations · {episode.execution.compactions} compactions</span></div></div><div className={`mt-3 ${mutedTextClass}`}>{Math.round(episode.classificationConfidence * 100)}% prompt classification confidence</div></td></tr>}
                </Fragment>;
              })}</tbody>
            </table>
          </div> : <div className="mt-3 rounded-xl border border-dashed border-[#c8c1df] p-5 text-sm dark:border-[#4d455e]"><strong>Waiting for prompt activity</strong><p className={`mt-2 ${mutedTextClass}`}>Token movement appears after a privacy-safe prompt boundary is observed.</p></div>}
        </section>
        <section className={`${panelClass} mt-6 p-6`}><h3>Skill routing</h3><p className={`mt-1 text-xs ${mutedTextClass}`}>Observed guidance reads by prompt. Downstream activity is correlated, not proof that a skill caused the work; skill contents and private reasoning are not retained.</p><SkillRoutingTree guidance={snapshot.guidance} directives={snapshot.directives} /></section>
        <section className={`${panelClass} mt-6 p-6`}><RepositoryTraversal report={snapshot.repositoryTraversal ?? unavailableRepositoryTraversal} /></section>
        <div className="mt-6 grid grid-cols-[.8fr_1.2fr] gap-6 max-[850px]:grid-cols-1">
          <section className={`${panelClass} p-6`}><h3>Technical activity</h3><p className={`mt-1 text-xs ${mutedTextClass}`}>Diagnostic session totals; expand change-backed prompts above for evaluative detail.</p><div className="mt-4 grid grid-cols-2 gap-3">{[['File changes', snapshot.evidence.fileChange ?? 0], ['Web searches', snapshot.evidence.webSearch ?? 0], ['Delegations', snapshot.evidence.delegation ?? 0], ['Compactions', snapshot.evidence.contextCompaction ?? 0]].map(([label, value]) => <div className="rounded-xl border border-[#dedbea] p-4 dark:border-[#373241]" key={label}><strong className="block text-xl">{value}</strong><span className={`text-xs ${mutedTextClass}`}>{label}</span></div>)}</div></section>
          <section className={`${panelClass} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3>Model and reasoning usage</h3><p className={`mt-1 text-xs ${mutedTextClass}`}>Expand either total for its model and reasoning breakdown.</p></div>
              <div className="w-[180px]"><label className="sr-only" htmlFor="worker-range">Worker activity period</label><FloatingSelect id="worker-range" value={workerRange} options={[{ value: 'active', label: 'Running now' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }]} onChange={value => setWorkerRange(value as WorkerRange)} /></div>
            </div>
            <div className="mt-4 grid gap-3">{usageTotals.map(group => <div className="rounded-xl border border-[#dedbea] dark:border-[#373241]" key={group.scope}>
              <button aria-expanded={expandedUsage[group.scope]} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-4 text-left" onClick={() => setExpandedUsage(current => ({ ...current, [group.scope]: !current[group.scope] }))} type="button">
                <span aria-hidden="true" className={`text-sm transition-transform ${expandedUsage[group.scope] ? 'rotate-90' : ''}`}>▶</span>
                <span><span className="flex flex-wrap items-center gap-2"><strong>{group.scope}</strong>{group.running > 0 && <span className="rounded-full bg-[#e8f6eb] px-2 py-0.5 text-[10px] font-semibold text-[#236534] dark:bg-[#203a28] dark:text-[#9ce0ad]">{group.running} running</span>}</span><span className={`mt-1 block text-xs ${mutedTextClass}`}>{group.details.length === 1 ? `${group.details[0].model} · ${group.details[0].reasoning} reasoning · ` : ''}{group.workers} worker{group.workers === 1 ? '' : 's'}</span></span>
                <span className="text-right"><strong className="text-lg">{compactNumber.format(group.inputTokens)}</strong><span className={`mt-0.5 block text-xs ${mutedTextClass}`}>input tokens · {cacheHitRate(group.inputTokens, group.cachedInputTokens)} cached</span></span>
              </button>
              {expandedUsage[group.scope] && <div className="border-t border-[#dedbea] p-3 dark:border-[#373241]">
                <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${mutedTextClass}`}>Model and reasoning breakdown</p>
                <div className="grid gap-2">{group.details.map(detail => <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#f4f1fc] p-3 dark:bg-[#27222f]" key={detail.key}><span className="text-sm"><strong>{detail.model}</strong><span className={`mt-1 block text-xs ${mutedTextClass}`}>{detail.reasoning} reasoning · {detail.workers} worker{detail.workers === 1 ? '' : 's'}</span></span><span className="flex flex-wrap gap-x-5 gap-y-2 text-right text-sm"><span><strong className="block">{compactNumber.format(detail.cachedInputTokens)}</strong><span className={`text-xs ${mutedTextClass}`}>Cached input</span></span><span><strong className="block">{compactNumber.format(Math.max(0, detail.inputTokens - detail.cachedInputTokens))}</strong><span className={`text-xs ${mutedTextClass}`}>New input</span></span><span><strong className="block">{compactNumber.format(detail.outputTokens)}</strong><span className={`text-xs ${mutedTextClass}`}>Output</span></span></span></div>)}</div>
              </div>}
            </div>)}{!usageTotals.length && <div className="rounded-xl border border-dashed border-[#c8c1df] p-5 text-sm dark:border-[#4d455e]"><strong>No usage in this period</strong><p className={`mt-2 ${mutedTextClass}`}>Choose a wider range to see historical usage.</p></div>}</div>
          </section>
        </div>
      </>}
    </section>
  );
}
