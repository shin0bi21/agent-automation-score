import type { RepositoryTraversalReport } from '../../types';
export type { RepositoryTraversalReport } from '../../types';

export type RepositoryTraversalDirection = RepositoryTraversalReport['transitions'][number]['direction'];

interface RepositoryTraversalProps {
  report: RepositoryTraversalReport;
}

const MAX_DIRECTORY_NODES = 24;
const MAX_TRANSITIONS = 40;
const muted = 'text-[#6f6a7d] dark:text-[#aaa3b7]';
const depthIndent = ['ms-0', 'ms-3', 'ms-6', 'ms-9', 'ms-12', 'ms-15', 'ms-18'];

const directionPresentation: Record<RepositoryTraversalDirection, { label: string; color: string }> = {
  entry: { label: 'Entry', color: '#6f6a7d' },
  down: { label: 'Down', color: '#168268' },
  up: { label: 'Up', color: '#c15d19' },
  same: { label: 'Same directory', color: '#6f6a7d' },
  cross: { label: 'Cross', color: '#5f55b8' },
  revisit: { label: 'Revisit', color: '#ad3f62' },
};

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#dedbea] bg-white px-3 py-2 dark:border-[#373241] dark:bg-[#211e29]">
      <dt className={`text-xs ${muted}`}>{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-[#1d1929] dark:text-[#f6f2fb]">{value.toLocaleString()}</dd>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#c8c1df] p-5 text-sm dark:border-[#4d455e]">
      <strong>{title}</strong>
      <p className={`mt-2 ${muted}`}>{detail}</p>
    </div>
  );
}

function pathLabel(path: string) {
  return path || 'repository root';
}

export default function RepositoryTraversal({ report }: RepositoryTraversalProps) {
  if (!report.available) {
    return (
      <EmptyState
        title="Repository traversal unavailable"
        detail={report.limitation ?? 'This session does not contain compatible file-access telemetry.'}
      />
    );
  }

  if (report.directories.length === 0 && report.transitions.length === 0) {
    return (
      <EmptyState
        title="No repository traversal observed"
        detail="No repository-relative file access appeared in the observable session activity."
      />
    );
  }

  const directories = [...report.directories]
    .sort((left, right) => left.firstVisitOrder - right.firstVisitOrder)
    .slice(0, MAX_DIRECTORY_NODES);
  const transitions = [...report.transitions]
    .sort((left, right) => left.order - right.order)
    .slice(0, MAX_TRANSITIONS);
  const routeHeight = Math.max(96, transitions.length * 28 + 24);

  return (
    <section aria-labelledby="repository-traversal-title" className="space-y-4">
      <div>
        <h3 id="repository-traversal-title" className="text-base font-semibold text-[#1d1929] dark:text-[#f6f2fb]">
          Repository traversal
        </h3>
        <p className={`mt-1 text-sm ${muted}`}>
          Observed repository-relative file access and directory movement. Inferred phases and reasons are content-free heuristics,
          not the agent&apos;s intent or private reasoning.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
        <SummaryValue label="File hits" value={report.totalFileHits} />
        <SummaryValue label="Unique files" value={report.uniqueFiles} />
        <SummaryValue label="Directory visits" value={report.totalDirectoryVisits} />
        <SummaryValue label="Down" value={report.directionCounts.down} />
        <SummaryValue label="Up" value={report.directionCounts.up} />
        <SummaryValue label="Same directory" value={report.directionCounts.same} />
        <SummaryValue label="Cross" value={report.directionCounts.cross} />
        <SummaryValue label="Revisits" value={report.directionCounts.revisit} />
      </dl>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div
          aria-label="Directory structure observed during traversal"
          className="max-h-[360px] overflow-auto rounded-xl border border-[#dedbea] p-4 outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/40 dark:border-[#373241]"
          role="region"
          tabIndex={0}
        >
          <p className="mb-3 text-xs font-semibold tracking-wide text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
            Directory structure · first-visit order
          </p>
          <ol className="space-y-1 text-sm">
            {directories.map(directory => (
              <li
                key={directory.id}
                className={`${depthIndent[Math.min(Math.max(directory.depth, 0), 6)]} rounded-lg border border-[#ebe8f2] px-2 py-1.5 dark:border-[#373241]`}
              >
                <span className="font-mono text-xs [overflow-wrap:anywhere]">{pathLabel(directory.path)}</span>
                <span className={`ml-2 text-xs ${muted}`}>{directory.visitCount} visits</span>
              </li>
            ))}
          </ol>
          {(report.directoriesTruncated || report.directories.length > MAX_DIRECTORY_NODES) && (
            <p className={`mt-3 text-xs ${muted}`}>Directory view bounded to the first {directories.length} nodes.</p>
          )}
        </div>

        <div
          aria-label="Ordered repository traversal route chart"
          className="max-h-[360px] overflow-auto rounded-xl border border-[#dedbea] p-4 outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/40 dark:border-[#373241]"
          role="region"
          tabIndex={0}
        >
          <p className="text-xs font-semibold tracking-wide text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">Ordered route</p>
          <p className={`mt-1 text-xs ${muted}`}>Line color is supplemented by a direction label in the exact-value table.</p>
          <svg aria-hidden="true" className="mt-3 min-w-[420px]" height={routeHeight} viewBox={`0 0 640 ${routeHeight}`} width="100%">
            {transitions.map((transition, index) => {
              const y = index * 28 + 18;
              const presentation = directionPresentation[transition.direction];
              return (
                <g key={transition.id}>
                  <circle cx="10" cy={y} fill={presentation.color} r="4" />
                  {index < transitions.length - 1 && <line stroke={presentation.color} strokeWidth="2" x1="10" x2="10" y1={y + 4} y2={y + 24} />}
                  <text fill="currentColor" fontSize="11" x="24" y={y + 4}>
                    {transition.order}. {pathLabel(transition.toPath)} ({presentation.label})
                  </text>
                </g>
              );
            })}
          </svg>
          {(report.transitionsTruncated || report.transitions.length > MAX_TRANSITIONS) && (
            <p className={`mt-3 text-xs ${muted}`}>Route chart bounded to the first {transitions.length} transitions.</p>
          )}
        </div>
      </div>

      {report.limitation && <p className={`rounded-lg bg-[#f7f5fb] px-3 py-2 text-xs dark:bg-[#292530] ${muted}`}><strong>Coverage note:</strong> {report.limitation}</p>}

      <div
        aria-label="Exact repository traversal values"
        className="max-h-[430px] overflow-auto rounded-xl border border-[#dedbea] outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/40 dark:border-[#373241]"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <caption className="p-3 text-left font-semibold text-[#1d1929] dark:text-[#f6f2fb]">
            Exact ordered transitions
          </caption>
          <thead className="sticky top-0 bg-[#f7f5fb] text-[#6f6a7d] dark:bg-[#292530] dark:text-[#aaa3b7]">
            <tr>
              <th className="px-3 py-2" scope="col">Order</th>
              <th className="px-3 py-2" scope="col">From</th>
              <th className="px-3 py-2" scope="col">To</th>
              <th className="px-3 py-2" scope="col">Direction</th>
              <th className="px-3 py-2" scope="col">Hits</th>
              <th className="px-3 py-2" scope="col">Observable heuristic</th>
            </tr>
          </thead>
          <tbody>
            {transitions.map(transition => {
              const heuristic = transition.heuristic;
              return (
                <tr className="border-t border-[#ebe8f2] align-top dark:border-[#373241]" key={transition.id}>
                  <td className="px-3 py-2 tabular-nums">{transition.order}</td>
                  <td className="px-3 py-2 font-mono [overflow-wrap:anywhere]">{transition.fromPath === null ? 'Session entry' : pathLabel(transition.fromPath)}</td>
                  <td className="px-3 py-2 font-mono [overflow-wrap:anywhere]">{pathLabel(transition.toPath)}</td>
                  <td className="px-3 py-2 font-medium">{directionPresentation[transition.direction].label}</td>
                  <td className="px-3 py-2 tabular-nums">{transition.hitCount}</td>
                  <td className="px-3 py-2">
                    {heuristic ? (
                      <div>
                        <strong>Inferred phase:</strong> {heuristic.phase ?? 'unavailable'} · <strong>Why heuristic:</strong>{' '}
                        {heuristic.reason ?? 'unavailable'} · {heuristic.confidence} confidence
                        <span className={`mt-1 block ${muted}`}>Basis: {heuristic.basis.length ? heuristic.basis.join(' · ') : 'unavailable'}</span>
                      </div>
                    ) : (
                      <span className={muted}>No heuristic available</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(report.transitionsTruncated || report.transitions.length > MAX_TRANSITIONS) && (
          <p className={`border-t border-[#ebe8f2] p-3 text-xs ${muted} dark:border-[#373241]`}>
            Exact-value table bounded to the first {transitions.length} transitions.
          </p>
        )}
      </div>
    </section>
  );
}
