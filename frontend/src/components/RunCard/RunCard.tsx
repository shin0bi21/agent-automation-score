import type { RunRecord } from '../../types';
import RunActivityTree from '../RunActivityTree/RunActivityTree';
import RunJobMenu from '../RunJobMenu/RunJobMenu';
import RunReportMenu from '../RunReportMenu/RunReportMenu';
import RunRequestMenu from '../RunRequestMenu/RunRequestMenu';
import { actionLinkClass } from '../../ui';

const retryableStatuses = new Set<RunRecord['status']>(['interrupted', 'failed', 'timed-out', 'cancelled']);
const liveActivityClass = `
  mt-4 flex h-[340px] max-h-[340px] flex-col overflow-hidden rounded-[10px]
  border border-[#dedbea] bg-[#fbfaff] p-[14px]
  max-[560px]:h-[300px] max-[560px]:max-h-[300px]
  dark:border-[#373241] dark:bg-[#211e2a]
`;

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    hours ? `${hours}h` : '',
    minutes || hours ? `${minutes}m` : '',
    `${remainder}s`,
  ].filter(Boolean).join(' ');
}

export function summarizeBenchmarkProgress(progress: string) {
  const worktree = progress.match(/\/[^\n:]*?-agent-benchmark-[^/\s:]+\/[^/\s:]+-run-\d+/)?.[0] ?? null;
  const lines: string[] = [];
  for (const rawLine of progress.split('\n')) {
    const line = rawLine.trim();
    if (
      !line
      || line === 'Runner'
      || line === 'Agent progress'
      || line.includes('state db discrepancy')
    ) {
      continue;
    }
    if (line.includes('apply_patch verification failed')) {
      if (!lines.includes('Agent adjusted a patch after the target changed.')) {
        lines.push('Agent adjusted a patch after the target changed.');
      }
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
      continue;
    }
    lines.push(line);
  }
  return {
    worktree,
    summary: lines.join('\n') || 'Agent is working in the isolated benchmark worktree.',
  };
}

export interface RunCardProps {
  run: RunRecord;
  now: number;
  retryDisabled: boolean;
  onRetry: (run: RunRecord) => void;
}

function badgeClass(status: RunRecord['status']) {
  const base = 'h-max rounded-full border px-[9px] py-[6px] font-mono text-[.65rem] font-bold uppercase';
  if (status === 'running') {
    return `${base} border-[#6f56d9]/35 bg-[#eeeafe] text-[#573dbf] dark:border-[#a58cff]/35 dark:bg-[#2d2645] dark:text-[#b9a6ff]`;
  }
  if (status === 'completed') {
    return `${base} border-[#68ad82] bg-[#3d9b62]/12 text-[#287849] dark:border-[#57966e] dark:bg-[#3d9b62]/12 dark:text-[#83d7a2]`;
  }
  if (status === 'failed') {
    return `${base} border-[#dedbea] text-[#bd3d52] dark:border-[#373241] dark:text-[#ff8796]`;
  }
  return `${base} border-[#dedbea] dark:border-[#373241]`;
}

function requestTypeLabel(featureType: RunRecord['featureType']) {
  if (featureType === 'frontend') {
    return 'Frontend request';
  }
  if (featureType === 'backend') {
    return 'Backend request';
  }
  return 'Full-stack request';
}

export default function RunCard({ run, now, retryDisabled, onRetry }: RunCardProps) {
  const result = run.comparison?.comparison[0];
  const duration = run.status === 'running'
    ? now - new Date(run.createdAt).getTime()
    : null;
  const requestType = requestTypeLabel(run.featureType);
  const activity = summarizeBenchmarkProgress(run.progress ?? '');

  return (
    <article className="border-b border-[#dedbea] py-5 last:border-b-0 dark:border-[#373241]">
      <div className="flex justify-between gap-4">
        <div className="min-w-0">
          <span className="mb-2 block font-mono text-[.65rem] leading-[1.2] font-bold tracking-[.14em] text-[#6f56d9] uppercase dark:text-[#a58cff]">
            Request type
          </span>
          <strong className="mb-[9px] block text-[.95rem] text-[#1d1929] dark:text-[#f6f2fb]">
            {requestType}
          </strong>
          <div className="flex flex-wrap gap-x-[14px] gap-y-2">
            <RunRequestMenu description={run.description} />
            {run.status !== 'completed' && (
              <RunJobMenu run={run} worktree={activity.worktree} />
            )}
            {result && <RunReportMenu result={result} run={run} />}
            {retryableStatuses.has(run.status) && (
              <button
                className={actionLinkClass}
                type="button"
                disabled={retryDisabled}
                onClick={() => onRetry(run)}
              >
                Retry Run
              </button>
            )}
          </div>
        </div>
        <div className="grid justify-items-end gap-[7px]">
          <span className={badgeClass(run.status)}>{run.status}</span>
          {duration !== null && (
            <small className="font-mono text-[.68rem] leading-none text-[#6f6a7d] dark:text-[#aaa3b7]">
              {formatDuration(duration)}
            </small>
          )}
        </div>
      </div>

      {run.readiness?.status === 'not-evaluable' && <div className="mt-4 rounded-lg border border-[#bd3d52]/35 bg-[#bd3d52]/8 p-3 text-xs text-[#8f2f41] dark:border-[#ff8796]/35 dark:text-[#ff9ba7]" role="status"><strong className="block">Score unavailable: incompatible evaluation contract</strong><span className="mt-1 block">{run.readiness.findings.join(' ') || 'This run cannot support a valid performance score.'}</span></div>}

      {run.status === 'running' && run.activity?.length ? (
        <div className={liveActivityClass}>
          <div className="mb-3 flex items-center justify-between">
            <strong className="text-[.78rem]">Live activity</strong>
            <span className="font-mono text-[.62rem] leading-none font-bold text-[#573dbf] uppercase dark:text-[#b9a6ff]">
              Updating
            </span>
          </div>
          <RunActivityTree nodes={run.activity} />
        </div>
      ) : run.status === 'running' && run.progress ? (
        <div className={liveActivityClass}>
          <div className="mb-3 flex items-center justify-between">
            <strong className="text-[.78rem]">Live activity</strong>
          </div>
          <p className="mt-[3px] [overflow-wrap:anywhere] font-mono text-[.66rem] leading-[1.5] whitespace-pre-wrap text-[#6f6a7d] dark:text-[#aaa3b7]">
            {activity.summary}
          </p>
        </div>
      ) : null}

      {run.status === 'running' && run.progress && (
        <details className="mt-[14px] open:[&>summary]:text-[#6f56d9] dark:open:[&>summary]:text-[#a58cff]">
          <summary className="cursor-pointer font-mono text-[.7rem] leading-[1.4] tracking-[.08em] text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
            Raw diagnostic log
          </summary>
          <pre className="mt-3 max-h-[150px] overflow-auto rounded-lg bg-[#fbfaff] p-3 font-mono text-[.68rem] leading-[1.45] whitespace-pre-wrap text-[#6f6a7d] dark:bg-[#211e2a] dark:text-[#aaa3b7]">
            {run.progress}
          </pre>
        </details>
      )}
    </article>
  );
}
