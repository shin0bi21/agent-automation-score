export type SessionUsageCounters = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

export type SessionUsageBoundary = SessionUsageCounters & {
  key: string;
  sequenceNumber: number;
  kind: 'directive' | 'question' | 'correction' | 'approval' | 'context' | 'mixed';
  occurredAt: string;
  contextTokens: number | null;
  contextWindow: number | null;
};

export type SessionUsageTimelinePoint = {
  key: string;
  sequenceNumber: number;
  kind: SessionUsageBoundary['kind'];
  status: 'active' | 'completed';
  measurement: 'exact-live' | 'exact-stored' | 'unavailable';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  contextTokens: number | null;
  contextWindow: number | null;
  contextPercent: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  newInputTokens: number | null;
  outputTokens: number | null;
};

const safeDelta = (end: number | null, start: number | null) => (
  end !== null && start !== null && end >= start ? end - start : null
);

export function buildSessionUsageTimeline({
  boundaries,
  closing,
  observedAt,
  live,
  maximumPoints = 100,
}: {
  boundaries: SessionUsageBoundary[];
  closing: SessionUsageCounters;
  observedAt: string;
  live: boolean;
  maximumPoints?: number;
}): SessionUsageTimelinePoint[] {
  const ordered = boundaries.slice().sort((a, b) => a.sequenceNumber - b.sequenceNumber).slice(-maximumPoints);
  return ordered.map((boundary, index) => {
    const next = ordered[index + 1];
    const end = next ?? closing;
    const inputTokens = safeDelta(end.inputTokens, boundary.inputTokens);
    const cachedInputTokens = safeDelta(end.cachedInputTokens, boundary.cachedInputTokens);
    const outputTokens = safeDelta(end.outputTokens, boundary.outputTokens);
    const complete = inputTokens !== null && cachedInputTokens !== null && cachedInputTokens <= inputTokens && outputTokens !== null;
    const endedAt = next?.occurredAt ?? observedAt;
    const started = Date.parse(boundary.occurredAt);
    const ended = Date.parse(endedAt);
    const contextPercent = boundary.contextWindow && boundary.contextTokens !== null
      ? Math.min(100, boundary.contextTokens / boundary.contextWindow * 100)
      : null;
    return {
      key: boundary.key,
      sequenceNumber: boundary.sequenceNumber,
      kind: boundary.kind,
      status: !next && live ? 'active' : 'completed',
      measurement: complete ? (live ? 'exact-live' : 'exact-stored') : 'unavailable',
      startedAt: boundary.occurredAt,
      endedAt,
      durationMs: Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : 0,
      contextTokens: boundary.contextTokens,
      contextWindow: boundary.contextWindow,
      contextPercent,
      inputTokens: complete ? inputTokens : null,
      cachedInputTokens: complete ? cachedInputTokens : null,
      newInputTokens: complete ? inputTokens - cachedInputTokens : null,
      outputTokens: complete ? outputTokens : null,
    };
  });
}
