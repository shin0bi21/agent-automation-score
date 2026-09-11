import RunCard from '../../../../components/RunCard/RunCard';
import type { RunRecord } from '../../../../types';
import { eyebrowClass, mutedTextClass, panelClass, quietButtonClass } from '../../../../ui';

interface CurrentRunProps {
  run?: RunRecord;
  now: number;
  retryDisabled: boolean;
  onRefresh: () => void;
  onRetry: (run: RunRecord) => void;
}

export default function CurrentRun({
  run,
  now,
  retryDisabled,
  onRefresh,
  onRetry,
}: CurrentRunProps) {
  return (
    <section
      className={`${panelClass} flex max-h-[var(--setup-height,none)] flex-col max-[850px]:max-h-[none]`}
      aria-labelledby="current-run-title"
    >
      <div className="flex items-center justify-between border-b border-[#dedbea] px-7 py-[25px] max-[560px]:px-[18px] dark:border-[#373241]">
        <div>
          <span className={eyebrowClass}>LATEST</span>
          <h2 id="current-run-title" className="mt-[.35rem] text-xl">
            Current run
          </h2>
        </div>
        <button className={quietButtonClass} onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>

      <div
        className="min-h-0 overflow-y-auto overscroll-contain px-7 pt-[10px] pb-7 max-[560px]:px-[18px]"
        aria-live="polite"
      >
        {run ? (
          <RunCard
            run={run}
            now={now}
            retryDisabled={retryDisabled}
            onRetry={onRetry}
          />
        ) : (
          <p className={`py-7 ${mutedTextClass}`}>No runs yet.</p>
        )}
      </div>
    </section>
  );
}
