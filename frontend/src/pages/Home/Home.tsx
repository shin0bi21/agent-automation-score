import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AgentProvider, BenchmarkCatalog, BenchmarkReadiness, BenchmarkSchedule, RunRecord, StartRunInput } from '../../types';
import { eyebrowClass, mutedTextClass } from '../../ui';
import CurrentRun from './components/CurrentRun/CurrentRun';
import RunSetup from './components/RunSetup/RunSetup';
import RecurringBenchmarks from './components/RecurringBenchmarks/RecurringBenchmarks';

type RepositoryTone = 'idle' | 'checking' | 'ready' | 'error';

interface HomeProps {
  input: StartRunInput;
  providers: AgentProvider[];
  directoryPickerAvailable: boolean;
  currentRun?: RunRecord;
  now: number;
  busy: boolean;
  runInProgress: boolean;
  message: string;
  repositoryMessage: string;
  repositoryTone: RepositoryTone;
  readiness: BenchmarkReadiness | null;
  onInputChange: (input: StartRunInput) => void;
  onRepositoryEdit: () => void;
  onBrowse: () => void;
  onConnect: () => void;
  onSubmit: () => void;
  onRefresh: () => void;
  onRetry: (run: RunRecord) => void;
  onViewHistory: () => void;
  catalog: BenchmarkCatalog;
  schedules: BenchmarkSchedule[];
  scheduleMessage: string;
  onCreateSchedule: (suiteId: string, intervalMinutes: number, consent: boolean) => void;
  onToggleSchedule: (schedule: BenchmarkSchedule, enabled: boolean) => void;
}

export default function Home(props: HomeProps) {
  const [setupHeight, setSetupHeight] = useState<number | null>(null);
  const setupRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const setup = setupRef.current;
    if (!setup) {
      return;
    }
    const update = () => setSetupHeight(setup.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(setup);
    return () => observer.disconnect();
  }, []);

  const layoutStyle = setupHeight
    ? { '--setup-height': `${setupHeight}px` } as CSSProperties
    : undefined;

  return (
    <>
      <section className="mb-12 flex items-end justify-between gap-6 max-[850px]:items-start" aria-labelledby="hero-title">
        <div>
          <h1 className={`${eyebrowClass} mb-[18px]`}>Agent Insights</h1>
          <h2
            id="hero-title"
            className="my-2 mb-6 max-w-[900px] text-[clamp(2.6rem,5vw,5.5rem)] leading-[.96] tracking-[-.055em] max-[850px]:text-[clamp(2.6rem,12vw,4.5rem)]"
          >
            Is your repo ready for automated workflows?
          </h2>
          <p className={`max-w-[720px] text-[1.05rem] leading-[1.7] ${mutedTextClass}`}>
            Connect a guided Git repository, choose the feature scope, and gather real
            execution evidence from your chosen agent platform.
          </p>
        </div>
        <button className="shrink-0 rounded-lg border border-[#c8c1df] bg-white px-4 py-3 text-sm font-bold text-[#573dbf] dark:border-[#4d455e] dark:bg-[#1b1921] dark:text-[#b9a6ff]" onClick={props.onViewHistory} type="button">Benchmark History</button>
      </section>
      <div
        className="grid grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)] items-start gap-6 max-[850px]:grid-cols-1"
        style={layoutStyle}
      >
        <RunSetup
          sectionRef={setupRef}
          input={props.input}
          providers={props.providers}
          directoryPickerAvailable={props.directoryPickerAvailable}
          busy={props.busy}
          runInProgress={props.runInProgress}
          message={props.message}
          repositoryMessage={props.repositoryMessage}
          repositoryTone={props.repositoryTone}
          readiness={props.readiness}
          catalog={props.catalog}
          onInputChange={props.onInputChange}
          onRepositoryEdit={props.onRepositoryEdit}
          onBrowse={props.onBrowse}
          onConnect={props.onConnect}
          onSubmit={props.onSubmit}
        />
        <CurrentRun
          run={props.currentRun}
          now={props.now}
          retryDisabled={props.busy || props.runInProgress}
          onRefresh={props.onRefresh}
          onRetry={props.onRetry}
        />
      </div>
      <RecurringBenchmarks catalog={props.catalog} schedules={props.schedules} input={props.input} providers={props.providers} busy={props.busy} message={props.scheduleMessage} onCreate={props.onCreateSchedule} onToggle={props.onToggleSchedule} />
    </>
  );
}
