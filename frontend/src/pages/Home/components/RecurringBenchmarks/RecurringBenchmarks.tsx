import { useEffect, useState } from 'react';
import type { AgentProvider, BenchmarkCatalog, BenchmarkSchedule, StartRunInput } from '../../../../types';
import { mutedTextClass, panelClass } from '../../../../ui';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const median = (values: number[]) => values.length ? values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;

export function benchmarkRegressionSignals(points: BenchmarkSchedule['trend']) {
  const signals: string[] = [];
  const latest = points.at(-1);
  if (!latest) return signals;
  const lastTwo = points.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every(point => point.runStatus === 'failed' || point.outcome === 'failed')) signals.push('Two consecutive failures');
  const history = points.slice(0, -1).filter(point => point.runStatus === 'completed').slice(-5);
  const scoreBaseline = median(history.flatMap(point => point.score === null ? [] : [point.score]));
  if (latest.score !== null && scoreBaseline !== null && latest.score <= scoreBaseline - 10) signals.push(`Score is ${(scoreBaseline - latest.score).toFixed(1)} points below the recent median`);
  const durationBaseline = median(history.flatMap(point => point.durationMs === null ? [] : [point.durationMs]));
  if (latest.durationMs !== null && durationBaseline !== null && latest.durationMs >= durationBaseline * 1.3) signals.push('Duration is at least 30% above the recent median');
  const tokenBaseline = median(history.flatMap(point => point.inputTokens === null || point.outputTokens === null ? [] : [point.inputTokens + point.outputTokens]));
  if (latest.inputTokens !== null && latest.outputTokens !== null && tokenBaseline !== null && latest.inputTokens + latest.outputTokens >= tokenBaseline * 1.3) signals.push('Processed tokens are at least 30% above the recent median');
  return signals;
}

export default function RecurringBenchmarks({ catalog, schedules, input, providers, busy, message, onCreate, onToggle }: {
  catalog: BenchmarkCatalog;
  schedules: BenchmarkSchedule[];
  input: StartRunInput;
  providers: AgentProvider[];
  busy: boolean;
  message: string;
  onCreate: (suiteId: string, intervalMinutes: number, consent: boolean) => void;
  onToggle: (schedule: BenchmarkSchedule, enabled: boolean) => void;
}) {
  const [suiteId, setSuiteId] = useState(catalog.suites[0]?.id ?? '');
  const [intervalMinutes, setIntervalMinutes] = useState(7 * 24 * 60);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (!suiteId && catalog.suites[0]) setSuiteId(catalog.suites[0].id);
  }, [catalog.suites, suiteId]);
  const provider = providers.find(item => item.id === input.provider);
  const suiteSchedules = schedules.filter(schedule => catalog.suites.some(suite => suite.scenarioIds.includes(schedule.scenarioId)));
  return <section className={`${panelClass} mt-6 p-6`} aria-labelledby="recurring-title">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 id="recurring-title">Recurring regression suite</h3><p className={`mt-1 max-w-[720px] text-sm ${mutedTextClass}`}>Run pinned representative scenarios over time. Trends remain scenario-specific so repository or evaluator changes are not mistaken for agent degradation.</p></div><span className="rounded-full bg-[#f4f1fc] px-3 py-1 text-xs font-semibold dark:bg-[#27222f]">Local service only</span></div>
    {catalog.suites.length > 0 && <div className="mt-5 grid grid-cols-[1fr_180px] gap-4 max-[700px]:grid-cols-1">
      <label className="grid gap-2 text-sm font-semibold">Suite<select className="rounded-lg border border-[#c8c1df] bg-white px-3 py-2.5 dark:border-[#4d455e] dark:bg-[#1b1921]" value={suiteId} onChange={event => setSuiteId(event.target.value)}>{catalog.suites.map(suite => <option key={suite.id} value={suite.id}>{suite.title} · v{suite.version}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold">Interval<select className="rounded-lg border border-[#c8c1df] bg-white px-3 py-2.5 dark:border-[#4d455e] dark:bg-[#1b1921]" value={intervalMinutes} onChange={event => setIntervalMinutes(Number(event.target.value))}><option value={1440}>Daily</option><option value={10080}>Weekly</option><option value={43200}>Every 30 days</option></select></label>
    </div>}
    <label className="mt-4 flex items-start gap-3 rounded-xl border border-[#dedbea] p-4 text-sm dark:border-[#373241]"><input className="mt-1 size-4" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span><strong className="block">Allow recurring provider-token use</strong><span className={`mt-1 block ${mutedTextClass}`}>One {input.model || provider?.models[0]?.id || 'selected model'} run per scenario, serially. The service never backfills missed intervals and requires repository reconnection after restart.</span></span></label>
    <button className="mt-4 rounded-lg bg-[#6f56d9] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#a58cff] dark:text-[#17131f]" disabled={busy || !suiteId || !consent || !input.repo} onClick={() => onCreate(suiteId, intervalMinutes, consent)} type="button">Schedule regression suite</button>
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    <div className="mt-6 grid gap-3">{suiteSchedules.map(schedule => {
      const latest = schedule.trend.at(-1);
      const scored = schedule.trend.filter(point => point.score !== null);
      const tokenPoints = schedule.trend.filter(point => point.inputTokens !== null && point.outputTokens !== null);
      const tokenMaximum = Math.max(1, ...tokenPoints.map(point => (point.inputTokens ?? 0) + (point.outputTokens ?? 0)));
      const signals = benchmarkRegressionSignals(schedule.trend);
      return <article className="rounded-xl border border-[#dedbea] p-4 dark:border-[#373241]" key={schedule.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="flex flex-wrap items-center gap-2"><strong>{catalog.scenarios.find(item => item.id === schedule.scenarioId)?.title ?? schedule.scenarioId}</strong><span className="rounded-full bg-[#f4f1fc] px-2 py-0.5 text-[10px] font-semibold dark:bg-[#27222f]">v{schedule.scenarioVersion}</span></span><span className={`mt-1 block text-xs ${mutedTextClass}`}>{schedule.model} · {schedule.reasoningEffort} · {schedule.connected ? 'repository connected' : 'reconnect required'} · next {new Date(schedule.nextRunAt).toLocaleString()}</span></div><button className="rounded-lg border border-[#c8c1df] px-3 py-2 text-xs font-semibold dark:border-[#4d455e]" disabled={busy} onClick={() => onToggle(schedule, !schedule.enabled || !schedule.connected)} type="button">{!schedule.connected ? 'Reconnect and enable' : schedule.enabled ? 'Disable' : 'Enable'}</button></div>
        {signals.length > 0 && <div className="mt-4 rounded-lg border border-[#bd3d52]/35 bg-[#bd3d52]/8 p-3 text-xs text-[#8f2e40] dark:border-[#ff8796]/35 dark:text-[#ff9eaa]" role="status"><strong className="block">Regression signal</strong><span className="mt-1 block">{signals.join(' · ')}</span></div>}
        {latest ? <><div className="mt-4 grid grid-cols-5 gap-2 text-xs max-[760px]:grid-cols-2"><span><strong className="block text-base">{latest.score === null ? '—' : `${latest.score.toFixed(1)}%`}</strong>Score</span><span><strong className="block text-base">{latest.durationMs === null ? '—' : `${Math.round(latest.durationMs / 1000)}s`}</strong>Duration</span><span><strong className="block text-base">{latest.cachedInputTokens === null ? '—' : compact.format(latest.cachedInputTokens)}</strong>Cached</span><span><strong className="block text-base">{latest.newInputTokens === null ? '—' : compact.format(latest.newInputTokens)}</strong>New input</span><span><strong className="block text-base">{latest.outputTokens === null ? '—' : compact.format(latest.outputTokens)}</strong>Output</span></div>
          {schedule.trend.length > 1 && <div className="mt-4 grid grid-cols-2 gap-3 max-[700px]:grid-cols-1"><figure className="rounded-lg bg-[#f7f6fb] p-3 dark:bg-[#27222f]"><figcaption className="text-xs font-semibold">Score over time</figcaption><svg aria-label="Compatible benchmark score trend" className="mt-2 h-24 w-full" role="img" viewBox="0 0 300 100">{scored.slice(1).map((point, index) => { const previous = scored[index]; const spacing = 260 / Math.max(1, scored.length - 1); return <line className="stroke-[#6f56d9] dark:stroke-[#a58cff]" key={point.plannedAt} strokeWidth="3" x1={20 + index * spacing} x2={20 + (index + 1) * spacing} y1={90 - (previous.score ?? 0) * .75} y2={90 - (point.score ?? 0) * .75} />; })}{scored.map((point, index) => <circle className="fill-[#6f56d9] dark:fill-[#a58cff]" key={point.plannedAt} cx={20 + index * (260 / Math.max(1, scored.length - 1))} cy={90 - (point.score ?? 0) * .75} r="3" />)}</svg></figure><figure className="rounded-lg bg-[#f7f6fb] p-3 dark:bg-[#27222f]"><figcaption className="text-xs font-semibold">Processed tokens over time</figcaption><svg aria-label="Compatible benchmark token trend" className="mt-2 h-24 w-full" role="img" viewBox="0 0 300 100">{tokenPoints.slice(1).map((point, index) => { const previous = tokenPoints[index]; const spacing = 260 / Math.max(1, tokenPoints.length - 1); return <line className="stroke-[#2f9d78]" key={point.plannedAt} strokeWidth="3" x1={20 + index * spacing} x2={20 + (index + 1) * spacing} y1={90 - (((previous.inputTokens ?? 0) + (previous.outputTokens ?? 0)) / tokenMaximum) * 70} y2={90 - (((point.inputTokens ?? 0) + (point.outputTokens ?? 0)) / tokenMaximum) * 70} />; })}{tokenPoints.map((point, index) => <circle className="fill-[#2f9d78]" key={point.plannedAt} cx={20 + index * (260 / Math.max(1, tokenPoints.length - 1))} cy={90 - (((point.inputTokens ?? 0) + (point.outputTokens ?? 0)) / tokenMaximum) * 70} r="3" />)}</svg></figure></div>}
          <div className="mt-4 overflow-x-auto" role="region" aria-label={`Recent compatible observations for ${schedule.scenarioId}`} tabIndex={0}><table className="w-full min-w-[600px] text-xs"><thead><tr className={mutedTextClass}><th className="py-2 text-left">Observed</th><th className="text-right">Score</th><th className="text-right">Cached</th><th className="text-right">New input</th><th className="text-right">Output</th><th className="text-right">Status</th></tr></thead><tbody>{schedule.trend.slice(-6).reverse().map(point => <tr className="border-t border-[#dedbea] dark:border-[#373241]" key={point.plannedAt}><td className="py-2">{new Date(point.plannedAt).toLocaleDateString()}</td><td className="text-right">{point.score === null ? '—' : `${point.score.toFixed(1)}%`}</td><td className="text-right">{point.cachedInputTokens === null ? '—' : compact.format(point.cachedInputTokens)}</td><td className="text-right">{point.newInputTokens === null ? '—' : compact.format(point.newInputTokens)}</td><td className="text-right">{point.outputTokens === null ? '—' : compact.format(point.outputTokens)}</td><td className="text-right">{point.runStatus ?? point.outcome}</td></tr>)}</tbody></table></div></> : <p className={`mt-3 text-xs ${mutedTextClass}`}>No scheduled observations yet.</p>}
      </article>;
    })}{!suiteSchedules.length && <p className={`text-sm ${mutedTextClass}`}>No recurring suite is configured.</p>}</div>
  </section>;
}
