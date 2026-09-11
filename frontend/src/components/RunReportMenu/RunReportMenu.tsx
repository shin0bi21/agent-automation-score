import { useId, useRef, useState, type ReactNode } from 'react';
import FloatingMenuPanel from '../../common/components/FloatingMenu/FloatingMenuPanel';
import type { ComparisonRow, RunRecord } from '../../types';
import { actionLinkClass } from '../../ui';
import ImplementationReview from '../ImplementationReview/ImplementationReview';

interface RunReportMenuProps {
  result: ComparisonRow;
  run: Pick<RunRecord, 'provider' | 'model' | 'reasoningEffort'>;
}

interface DefinitionProps {
  label: string;
  children: ReactNode;
  capitalize?: boolean;
}

interface ReportHeadingProps {
  children: ReactNode;
}

function reportDuration(milliseconds: number | null) {
  if (milliseconds === null) {
    return '—';
  }
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function contractLabel(value: string) {
  return value
    .replaceAll('-', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function Definition({ label, children, capitalize = false }: DefinitionProps) {
  return (
    <div className="grid gap-[5px] bg-white p-[10px] dark:bg-[#1b1921]">
      <dt className="font-mono text-[.58rem] leading-[1.2] font-bold tracking-[.08em] text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
        {label}
      </dt>
      <dd
        className={`m-0 [overflow-wrap:anywhere] text-[.78rem] leading-[1.5] font-bold text-[#1d1929] dark:text-[#f6f2fb] ${
          capitalize ? 'capitalize' : ''
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

export default function RunReportMenu({ result, run }: RunReportMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const misses = Object.keys(result.missedRequirements);
  const uncachedInput = Math.max(
    0,
    (result.inputTokens ?? 0) - (result.cachedInputTokens ?? 0),
  );
  const cacheRate = result.inputTokens
    ? Math.round(1000 * (result.cachedInputTokens ?? 0) / result.inputTokens) / 10
    : 0;

  return (
    <>
      <button
        ref={triggerRef}
        className={actionLinkClass}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        View Report
      </button>
      {open && (
        <FloatingMenuPanel
          menuRef={menuRef}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          role="dialog"
          labelledBy={titleId}
          panelWidth={720}
          placement="centered"
        >
          <div className="p-4">
            <h2 id={titleId} className="sr-only">Report</h2>
            <h3 className="mb-2 text-[.82rem] text-[#1d1929] dark:text-[#f6f2fb]">
              Overview
            </h3>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-[#dedbea] bg-[#dedbea] max-[560px]:grid-cols-1 dark:border-[#373241] dark:bg-[#373241]">
              <ReportMetric label="Score">{result.medianScore ?? '—'}%</ReportMetric>
              <ReportMetric label="Time">
                {reportDuration(result.medianDurationMs)}
              </ReportMetric>
              <ReportMetric label="Total tokens">
                {formatNumber((result.inputTokens ?? 0) + (result.outputTokens ?? 0))}
              </ReportMetric>
            </div>

            <ReportHeading>Agent overview</ReportHeading>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-[#dedbea] bg-[#dedbea] max-[560px]:grid-cols-1 dark:border-[#373241] dark:bg-[#373241]">
              <Definition label="Provider" capitalize>{run.provider ?? 'codex'}</Definition>
              <Definition label="Agent" capitalize>
                {run.model.replace('gpt-5.6-', '')}
              </Definition>
              <Definition label="Reasoning" capitalize>{run.reasoningEffort}</Definition>
            </dl>

            <ReportHeading>Token usage</ReportHeading>
            <dl className="mt-[10px] grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-[#dedbea] bg-[#dedbea] max-[560px]:grid-cols-2 dark:border-[#373241] dark:bg-[#373241]">
              <Definition label="Input">{formatNumber(result.inputTokens)}</Definition>
              <Definition label="Cached input">
                {formatNumber(result.cachedInputTokens)}{' '}
                <small className="text-[.6rem] text-[#573dbf] dark:text-[#b9a6ff]">
                  {cacheRate}%
                </small>
              </Definition>
              <Definition label="Uncached input">{formatNumber(uncachedInput)}</Definition>
              <Definition label="Output">{formatNumber(result.outputTokens)}</Definition>
            </dl>

            <ReportHeading>Structural review</ReportHeading>
            <div
              className={`rounded-lg border px-[14px] py-3 text-[.76rem] ${
                misses.length
                  ? 'border-[#bd3d52]/45 bg-[#bd3d52]/9 text-[#bd3d52] dark:border-[#ff8796]/45 dark:bg-[#ff8796]/9 dark:text-[#ff8796]'
                  : 'border-[#6f56d9]/35 bg-[#eeeafe] text-[#573dbf] dark:border-[#a58cff]/35 dark:bg-[#2d2645] dark:text-[#b9a6ff]'
              }`}
            >
              <strong>
                {misses.length
                  ? `Missing structural contracts: ${misses.map(contractLabel).join(', ')}.`
                  : 'All structural contracts found.'}
              </strong>
            </div>

            {result.implementationReview?.length ? (
              <ImplementationReview sections={result.implementationReview} />
            ) : (
              <p>No implementation breakdown was produced.</p>
            )}
          </div>
        </FloatingMenuPanel>
      )}
    </>
  );
}

function ReportHeading({ children }: ReportHeadingProps) {
  return (
    <h3 className="mt-4 mb-2 text-[.82rem] text-[#1d1929] dark:text-[#f6f2fb]">
      {children}
    </h3>
  );
}

function ReportMetric({ label, children }: DefinitionProps) {
  return (
    <div className="grid gap-[6px] bg-[#fbfaff] p-[14px] dark:bg-[#211e2a]">
      <span className="font-mono text-[.58rem] leading-[1.2] font-bold tracking-[.08em] text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
        {label}
      </span>
      <b className="text-[1.3rem] text-[#1d1929] dark:text-[#f6f2fb]">
        {children}
      </b>
    </div>
  );
}
