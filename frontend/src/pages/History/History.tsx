import RunCard from '../../components/RunCard/RunCard';
import type { RunRecord } from '../../types';
import {
  eyebrowClass,
  mutedTextClass,
  pageTitleClass,
  panelClass,
  quietButtonClass,
} from '../../ui';

interface HistoryProps {
  runs: RunRecord[];
  now: number;
  retryDisabled: boolean;
  onRefresh: () => void;
  onRetry: (run: RunRecord) => void;
  onBack: () => void;
}

export default function History({
  runs,
  now,
  retryDisabled,
  onRefresh,
  onRetry,
  onBack,
}: HistoryProps) {
  return (
    <section className="mx-auto max-w-[1000px]" aria-labelledby="history-title">
      <div className="mb-8 flex items-end justify-between gap-8 max-[850px]:flex-col max-[850px]:items-start">
        <div>
          <p className={eyebrowClass}>RUN ARCHIVE</p>
          <h2 id="history-title" className={pageTitleClass}>
            Run history
          </h2>
          <p className={mutedTextClass}>
            Review every run, including the latest and any interrupted attempts.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={quietButtonClass} onClick={onBack} type="button">← Back to Benchmark Lab</button>
          <button className={quietButtonClass} onClick={onRefresh} type="button">Refresh history</button>
        </div>
      </div>
      <section className={panelClass}>
        <div className="px-7 pt-[18px] pb-7 max-[560px]:px-[18px]" aria-live="polite">
          {runs.length ? (
            runs.map(run => (
              <RunCard
                key={run.id}
                run={run}
                now={now}
                retryDisabled={retryDisabled}
                onRetry={onRetry}
              />
            ))
          ) : (
            <p className={`py-7 ${mutedTextClass}`}>No runs yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
