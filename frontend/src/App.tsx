import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import History from './pages/History/History';
import Home from './pages/Home/Home';
import Landing from './pages/Landing/Landing';
import Settings, { type Theme } from './pages/Settings/Settings';
import Sessions from './pages/Sessions/Sessions';
import type { AgentProvider, BenchmarkCatalog, BenchmarkReadiness, BenchmarkSchedule, RunRecord, StartRunInput } from './types';

const emptyRun: StartRunInput = {
  repo: '',
  provider: '',
  model: '',
  reasoningEffort: 'low',
  featureType: 'full-stack',
  description: '',
  scenarioId: '',
};
const themeStorageKey = 'agent-insights-theme';
type View = 'home' | 'benchmark' | 'history' | 'sessions' | 'settings';
type RepositoryTone = 'idle' | 'checking' | 'ready' | 'error';

interface NavigationButtonProps {
  active: boolean;
  children: string;
  onClick: () => void;
}

const navigationButtonClass = `
  relative cursor-pointer border-0 bg-transparent px-[18px] font-mono text-[.74rem]
  leading-none font-semibold tracking-[.08em] text-[#6f6a7d] uppercase
  after:absolute after:right-[18px] after:bottom-0 after:left-[18px] after:h-[3px]
  after:rounded-t-[3px] after:bg-transparent after:content-['']
  aria-[current=page]:text-[#1d1929] aria-[current=page]:after:bg-[#6f56d9]
  max-[850px]:px-[11px] max-[850px]:after:right-[11px] max-[850px]:after:left-[11px]
  dark:text-[#aaa3b7] dark:aria-[current=page]:text-[#f6f2fb]
  dark:aria-[current=page]:after:bg-[#a58cff]
`;

function NavigationButton({ active, children, onClick }: NavigationButtonProps) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={navigationButtonClass}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function repositoryName(repo: string) {
  return repo.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? '';
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem(themeStorageKey) === 'dark'
      ? 'dark'
      : 'light',
  );
  const [input, setInput] = useState(emptyRun);
  const [providers, setProviders] = useState<AgentProvider[]>([]);
  const [directoryPickerAvailable, setDirectoryPickerAvailable] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [benchmarkCatalog, setBenchmarkCatalog] = useState<BenchmarkCatalog>({ scenarios: [], suites: [] });
  const [benchmarkSchedules, setBenchmarkSchedules] = useState<BenchmarkSchedule[]>([]);
  const [benchmarkReadiness, setBenchmarkReadiness] = useState<BenchmarkReadiness | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [message, setMessage] = useState('');
  const [repositoryMessage, setRepositoryMessage] = useState('');
  const [repositoryTone, setRepositoryTone] = useState<RepositoryTone>('idle');
  const [connectedRepo, setConnectedRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const runLoadRevision = useRef(0);
  const runInProgress = runs.some(run => run.status === 'running');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const loadRuns = useCallback(async () => {
    const revision = ++runLoadRevision.current;
    try {
      const next = await api.runs();
      if (revision === runLoadRevision.current) {
        setRuns(next);
      }
    } catch (error) {
      if (revision === runLoadRevision.current) {
        setMessage((error as Error).message);
      }
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try { setBenchmarkSchedules(await api.benchmarkSchedules()); }
    catch (error) { setScheduleMessage((error as Error).message); }
  }, []);

  useEffect(() => {
    const revision = ++runLoadRevision.current;
    void Promise.all([
      api.providers(),
      api.runs(),
      api.runtime().catch(() => ({ directoryPickerAvailable: false, repositoryPath: null })),
      api.benchmarkCatalog().catch(() => ({ scenarios: [], suites: [] })),
      api.benchmarkSchedules().catch(() => []),
    ])
      .then(([catalog, history, runtime, benchmarkDefinitions, schedules]) => {
        const firstProvider = catalog[0];
        setProviders(catalog);
        setDirectoryPickerAvailable(runtime.directoryPickerAvailable);
        setBenchmarkCatalog(
          benchmarkDefinitions && Array.isArray(benchmarkDefinitions.scenarios) && Array.isArray(benchmarkDefinitions.suites)
            ? benchmarkDefinitions
            : { scenarios: [], suites: [] },
        );
        setBenchmarkSchedules(Array.isArray(schedules) && schedules.every(item => item && typeof item === 'object' && 'scenarioId' in item) ? schedules : []);
        if (revision === runLoadRevision.current) {
          setRuns(history);
        }
        setInput(current => ({
          ...current,
          repo: current.repo || runtime.repositoryPath || '',
          provider: firstProvider?.id ?? '',
          model: firstProvider?.models[0]?.id ?? '',
          scenarioId: current.scenarioId || benchmarkDefinitions.scenarios?.[0]?.id || '',
          description: current.description || benchmarkDefinitions.scenarios?.[0]?.title || '',
        }));
      })
      .catch(error => setMessage((error as Error).message));
  }, []);

  useEffect(() => {
    if (!runInProgress) return;
    const timer = window.setTimeout(() => void loadRuns(), 3000);
    return () => window.clearTimeout(timer);
  }, [runs, runInProgress, loadRuns]);

  useEffect(() => {
    if (!runInProgress) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runInProgress]);

  useEffect(() => {
    if (view !== 'benchmark') return;
    const timer = window.setInterval(() => void loadSchedules(), 30_000);
    return () => window.clearInterval(timer);
  }, [view, loadSchedules]);

  async function connect(repo = input.repo) {
    setRepositoryMessage('Connecting…');
    setRepositoryTone('checking');
    try {
      const result = await api.connectRepository(repo);
      setInput(current => ({ ...current, repo: result.repo }));
      setConnectedRepo(result.repo);
      const scenarioId = input.scenarioId || benchmarkCatalog.scenarios[0]?.id;
      const readiness = scenarioId ? await api.benchmarkReadiness({ repo: result.repo, scenarioId }) : null;
      setBenchmarkReadiness(readiness);
      setRepositoryMessage(
        readiness?.status === 'not-evaluable'
          ? 'Repository connected, but this benchmark is not evaluable.'
          : `Repository ready. AGENTS.md and ${result.skills.length} skill${result.skills.length === 1 ? '' : 's'} discovered.`,
      );
      setRepositoryTone(readiness?.status === 'not-evaluable' ? 'error' : 'ready');
    } catch (error) {
      setConnectedRepo('');
      setBenchmarkReadiness(null);
      setRepositoryMessage((error as Error).message);
      setRepositoryTone('error');
    }
  }

  async function browse() {
    setBusy(true);
    setRepositoryMessage('Opening folder picker…');
    setRepositoryTone('checking');
    try {
      const result = await api.pickDirectory();
      await connect(result.repo);
    } catch (error) {
      setRepositoryMessage((error as Error).message);
      setRepositoryTone('error');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      const run = await api.startRun(input);
      runLoadRevision.current += 1;
      setRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retry(run: RunRecord) {
    if (runInProgress || busy) {
      return;
    }
    const reconnectedRepo = connectedRepo
      && repositoryName(connectedRepo) === run.repositoryName
      ? connectedRepo
      : '';
    const repo = run.repo || reconnectedRepo;
    if (!repo) {
      setMessage(`Reconnect ${run.repositoryName ?? 'the original repository'} before retrying this run.`);
      return;
    }
    const retryInput: StartRunInput = {
      repo,
      provider: run.provider ?? 'codex',
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      featureType: run.featureType ?? 'full-stack',
      description: run.description,
      scenarioId: run.scenarioId,
    };
    setBusy(true);
    setMessage('');
    try {
      const attempt = await api.startRun(retryInput);
      runLoadRevision.current += 1;
      setInput(retryInput);
      setRuns(current => [attempt, ...current.filter(item => item.id !== attempt.id)]);
      setView('benchmark');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createSchedule(suiteId: string, intervalMinutes: number, tokenCostConsent: boolean) {
    setBusy(true); setScheduleMessage('');
    try {
      const result = await api.createBenchmarkSchedule({ repo: input.repo, suiteId, provider: input.provider, model: input.model, reasoningEffort: input.reasoningEffort, intervalMinutes, tokenCostConsent });
      setBenchmarkSchedules(current => [...result.schedules, ...current]);
      setScheduleMessage(`Scheduled ${result.schedules.length} compatible scenarios.`);
    } catch (error) { setScheduleMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleSchedule(schedule: BenchmarkSchedule, enabled: boolean) {
    setBusy(true); setScheduleMessage('');
    try {
      const updated = await api.updateBenchmarkSchedule(schedule.id, { enabled, repo: enabled ? input.repo : undefined, tokenCostConsent: enabled });
      setBenchmarkSchedules(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      setScheduleMessage(enabled ? 'Schedule enabled.' : 'Schedule disabled.');
    } catch (error) { setScheduleMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen overscroll-y-none bg-[#f7f6fb] font-sans text-[#1d1929] [color-scheme:light] dark:bg-[#121116] dark:text-[#f6f2fb] dark:[color-scheme:dark]">
      <a
        className="absolute top-4 -left-[999px] z-20 bg-[#6f56d9] p-3 text-white focus:left-4 dark:bg-[#a58cff]"
        href="#main"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 flex min-h-[68px] justify-start border-b border-[#dedbea] bg-white/94 px-[max(24px,5vw)] backdrop-blur-[14px] max-[850px]:px-[4vw] dark:border-[#373241] dark:bg-[#1b1921]/94">
        <nav className="flex self-stretch" aria-label="Primary navigation">
          <NavigationButton
            active={view === 'home'}
            onClick={() => setView('home')}
          >
            Home
          </NavigationButton>
          <NavigationButton
            active={view === 'sessions'}
            onClick={() => setView('sessions')}
          >
            Session Review
          </NavigationButton>
          <NavigationButton
            active={view === 'benchmark' || view === 'history'}
            onClick={() => setView('benchmark')}
          >
            Benchmark Lab
          </NavigationButton>
          <NavigationButton
            active={view === 'settings'}
            onClick={() => setView('settings')}
          >
            Settings
          </NavigationButton>
        </nav>
      </header>
      <main
        id="main"
        className={`mx-auto w-[min(1400px,90vw)] max-[850px]:w-[min(92vw,680px)] ${view === 'sessions' ? 'pt-8 pb-16 max-[850px]:pt-6' : 'py-16 max-[850px]:pt-10'}`}
      >
        {view === 'home' && <Landing onNavigate={setView} />}
        {view === 'benchmark' && (
          <Home
            input={input}
            providers={providers}
            directoryPickerAvailable={directoryPickerAvailable}
            currentRun={runs[0]}
            now={now}
            busy={busy}
            runInProgress={runInProgress}
            message={message}
            repositoryMessage={repositoryMessage}
            repositoryTone={repositoryTone}
            readiness={benchmarkReadiness}
            onInputChange={next => {
              setInput(next);
              if (next.scenarioId !== input.scenarioId) {
                setBenchmarkReadiness(null); setConnectedRepo(''); setRepositoryTone('idle');
                setRepositoryMessage('Reconnect to evaluate the selected scenario.');
              }
            }}
            onRepositoryEdit={() => {
              setConnectedRepo('');
              setRepositoryMessage('');
              setRepositoryTone('idle');
            }}
            onBrowse={() => void browse()}
            onConnect={() => void connect()}
            onSubmit={() => void submit()}
            onRefresh={() => void loadRuns()}
            onRetry={run => void retry(run)}
            onViewHistory={() => setView('history')}
            catalog={benchmarkCatalog}
            schedules={benchmarkSchedules}
            scheduleMessage={scheduleMessage}
            onCreateSchedule={(suiteId, intervalMinutes, consent) => void createSchedule(suiteId, intervalMinutes, consent)}
            onToggleSchedule={(schedule, enabled) => void toggleSchedule(schedule, enabled)}
          />
        )}
        {view === 'history' && (
          <History
            runs={runs}
            now={now}
            retryDisabled={busy || runInProgress}
            onRefresh={() => void loadRuns()}
            onRetry={run => void retry(run)}
            onBack={() => setView('benchmark')}
          />
        )}
        {view === 'settings' && (
          <Settings theme={theme} onThemeChange={setTheme} />
        )}
        {view === 'sessions' && <Sessions />}
      </main>
    </div>
  );
}
