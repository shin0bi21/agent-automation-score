import type { RefObject } from 'react';
import FloatingSelect from '../../../../common/components/FloatingSelect/FloatingSelect';
import type { AgentProvider, BenchmarkCatalog, BenchmarkReadiness, StartRunInput } from '../../../../types';
import { focusRingClass } from '../../../../ui';

type RepositoryTone = 'idle' | 'checking' | 'ready' | 'error';

export interface RunSetupProps {
  sectionRef: RefObject<HTMLElement | null>;
  input: StartRunInput;
  providers: AgentProvider[];
  directoryPickerAvailable: boolean;
  busy: boolean;
  runInProgress: boolean;
  message: string;
  repositoryMessage: string;
  repositoryTone: RepositoryTone;
  readiness: BenchmarkReadiness | null;
  catalog: BenchmarkCatalog;
  onInputChange: (input: StartRunInput) => void;
  onRepositoryEdit: () => void;
  onBrowse: () => void;
  onConnect: () => void;
  onSubmit: () => void;
}

const reasoningOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const fieldsetClass = `
  relative m-0 min-w-0 rounded-xl border border-[#dedbea] bg-white
  pt-[18px] pr-5 pb-5 pl-9 shadow-[0_16px_42px_rgba(46,36,82,.08)]
  disabled:opacity-50 max-[560px]:pt-4 max-[560px]:pr-4
  max-[560px]:pb-[18px] max-[560px]:pl-8 dark:border-[#373241]
  dark:bg-[#1b1921] dark:shadow-[0_18px_48px_rgba(0,0,0,.28)]
`;
const legendClass = `
  float-left mb-2 w-full p-0 text-sm font-extrabold
  text-[#1d1929] dark:text-[#f6f2fb]
`;
const stepNumberClass = `
  absolute top-[17px] -left-[15px] inline-grid size-[31px] place-items-center
  rounded-[9px] border border-[#6f56d9]/30 bg-[#6f56d9] font-mono
  text-[.72rem] leading-none font-extrabold text-white
  shadow-[0_6px_16px_rgb(111_86_217_/_0.28)] dark:border-[#a58cff]/30
  dark:bg-[#a58cff] dark:shadow-[0_6px_16px_rgb(165_140_255_/_0.28)]
`;
const labelClass = 'grid gap-[9px] text-[.84rem] font-semibold text-[#1d1929] dark:text-[#f6f2fb]';
const repositoryInputClass = `
  w-full rounded-l-lg border border-[#c8c1df] bg-white px-[14px] py-[13px]
  text-[#1d1929] max-[560px]:col-span-full max-[560px]:rounded-b-none
  max-[560px]:rounded-t-lg dark:border-[#4d455e] dark:bg-[#1b1921]
  dark:text-[#f6f2fb]
`;
const repositoryButtonClass = `
  cursor-pointer border border-l-0 border-[#c8c1df] px-[17px] font-bold
  text-[#573dbf] disabled:opacity-50 max-[560px]:min-h-[42px]
  max-[560px]:border-t-0 max-[560px]:border-l dark:border-[#4d455e]
  dark:text-[#b9a6ff]
`;
const primaryButtonClass = `
  group mt-0.5 flex w-full cursor-pointer rounded-[10px] bg-[#6f56d9]
  px-5 py-4 font-extrabold text-white
  shadow-[0_10px_24px_rgb(111_86_217_/_0.24)]
  disabled:cursor-wait disabled:opacity-50 dark:bg-[#a58cff]
  dark:shadow-[0_10px_24px_rgb(165_140_255_/_0.24)]
`;

function repositoryFieldsetClass(tone: RepositoryTone) {
  if (tone === 'error') {
    return `${fieldsetClass} border-[#bd3d52]/70 bg-[#bd3d52]/6 dark:border-[#ff8796]/70 dark:bg-[#ff8796]/6`;
  }
  if (tone === 'checking' || tone === 'ready') {
    return `${fieldsetClass} border-[#6f56d9]/45 dark:border-[#a58cff]/45`;
  }
  return fieldsetClass;
}

export default function RunSetup({
  sectionRef,
  input,
  providers,
  directoryPickerAvailable,
  busy,
  runInProgress,
  message,
  repositoryMessage,
  repositoryTone,
  readiness,
  catalog,
  onInputChange,
  onRepositoryEdit,
  onBrowse,
  onConnect,
  onSubmit,
}: RunSetupProps) {
  const provider = providers.find(item => item.id === input.provider);

  return (
    <section ref={sectionRef} aria-label="Configure agent run">
      <form
        className="grid gap-[14px] pl-[14px]"
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset className={repositoryFieldsetClass(repositoryTone)}>
          <legend className={legendClass}>
            <span
              className={repositoryTone === 'error'
                ? `${stepNumberClass} border-[#bd3d52] bg-[#bd3d52] shadow-[0_6px_16px_rgb(189_61_82_/_0.24)] dark:border-[#ff8796] dark:bg-[#ff8796]`
                : stepNumberClass}
              aria-hidden="true"
            >
              1
            </span>
            Repository
          </legend>
          <div className="clear-both min-w-0 pt-1">
            {repositoryMessage && (
              <p
                className={`mb-[10px] rounded-lg border px-[10px] py-2 text-[.74rem] leading-[1.4] ${
                  repositoryTone === 'error'
                    ? 'border-[#bd3d52]/35 bg-[#bd3d52]/10 text-[#bd3d52] dark:border-[#ff8796]/35 dark:bg-[#ff8796]/10 dark:text-[#ff8796]'
                    : 'border-[#6f56d9]/25 bg-[#eeeafe] text-[#573dbf] dark:border-[#a58cff]/25 dark:bg-[#2d2645] dark:text-[#b9a6ff]'
                }`}
                role="status"
                aria-live="polite"
              >
                {repositoryMessage}
              </p>
            )}
            <label className="sr-only" htmlFor="repo">
              Local repository path
            </label>
            <div
              className={`grid max-[560px]:grid-cols-2 ${
                directoryPickerAvailable
                  ? 'grid-cols-[minmax(0,1fr)_auto_auto]'
                  : 'grid-cols-[minmax(0,1fr)_auto]'
              }`}
            >
              <input
                className={`${repositoryInputClass} ${focusRingClass}`}
                id="repo"
                value={input.repo}
                onChange={event => {
                  onInputChange({ ...input, repo: event.target.value });
                  onRepositoryEdit();
                }}
                required
                placeholder="Local repository path"
              />
              {directoryPickerAvailable && (
                <button
                  className={`${repositoryButtonClass} bg-white max-[560px]:rounded-bl-lg dark:bg-[#1b1921] ${focusRingClass}`}
                  type="button"
                  disabled={busy}
                  onClick={onBrowse}
                >
                  Browse…
                </button>
              )}
              <button
                className={`${repositoryButtonClass} rounded-r-lg bg-[#eeeafe] max-[560px]:rounded-t-none max-[560px]:rounded-br-lg dark:bg-[#2d2645] ${focusRingClass}`}
                type="button"
                disabled={busy}
                onClick={onConnect}
              >
                Connect
              </button>
            </div>
            {!directoryPickerAvailable && (
              <p className="mt-2 text-[.74rem] text-[#6f6a7d] dark:text-[#aaa3b7]">
                Folder browsing is unavailable in this runtime. Paste the mounted repository path.
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>
            <span className={stepNumberClass} aria-hidden="true">2</span>
            Benchmark scenario
          </legend>
          <div className="clear-both min-w-0 pt-1">
            <label className="sr-only" htmlFor="scenario">
              Benchmark scenario
            </label>
            <FloatingSelect
              id="scenario"
              value={input.scenarioId ?? ''}
              options={catalog.scenarios.map(scenario => ({ value: scenario.id, label: scenario.title }))}
              onChange={value => {
                const scenario = catalog.scenarios.find(item => item.id === value);
                onInputChange({ ...input, scenarioId: value, featureType: scenario?.featureType ?? input.featureType, description: scenario?.title ?? '' });
              }}
            />
            <p className="mt-[9px] text-[.77rem] leading-[1.45] text-[#6f6a7d] dark:text-[#aaa3b7]">
              The pinned prompt, patterns, and checks must form a runnable evaluation contract.
            </p>
          </div>
        </fieldset>

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>
            <span className={stepNumberClass} aria-hidden="true">3</span>
            Agent
          </legend>
          <div className="clear-both grid min-w-0 grid-cols-3 gap-[14px] pt-1 max-[850px]:grid-cols-1">
            <div className="grid gap-[9px]">
              <label className={labelClass} htmlFor="provider">Platform</label>
              <FloatingSelect
                id="provider"
                value={input.provider}
                options={providers.map(item => ({ value: item.id, label: item.label }))}
                onChange={value => {
                  const next = providers.find(item => item.id === value);
                  onInputChange({
                    ...input,
                    provider: value,
                    model: next?.models[0]?.id ?? '',
                  });
                }}
              />
            </div>
            <div className="grid gap-[9px]">
              <label className={labelClass} htmlFor="model">Model</label>
              <FloatingSelect
                id="model"
                value={input.model}
                options={provider?.models.map(item => ({
                  value: item.id,
                  label: item.label,
                })) ?? []}
                onChange={value => onInputChange({ ...input, model: value })}
              />
            </div>
            <div className="grid gap-[9px]">
              <label className={labelClass} htmlFor="reasoning">Reasoning</label>
              <FloatingSelect
                id="reasoning"
                value={input.reasoningEffort}
                options={reasoningOptions}
                onChange={value => onInputChange({ ...input, reasoningEffort: value })}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>
            <span className={stepNumberClass} aria-hidden="true">4</span>
            Evaluation readiness
          </legend>
          <div className="clear-both min-w-0 pt-1">
            {!readiness && <p className="text-sm text-[#6f6a7d] dark:text-[#aaa3b7]">Connect the repository to build the zero-token evaluation contract.</p>}
            {readiness && <div aria-live="polite" role="status"><strong className="capitalize">{readiness.status.replaceAll('-', ' ')}</strong><p className="mt-1 text-xs text-[#6f6a7d] dark:text-[#aaa3b7]">{readiness.evidence.patternDocuments.length} pattern documents · {readiness.evidence.analogues.length + readiness.evidence.inferredAnalogues.length} pattern examples · {readiness.evidence.verification.length} verification routes</p>{readiness.findings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-[#6f6a7d] dark:text-[#aaa3b7]">{readiness.findings.map(finding => <li key={finding}>{finding}</li>)}</ul>}</div>}
          </div>
        </fieldset>

        <div
          className="min-h-[1.4rem] text-[.85rem] text-[#bd3d52] empty:hidden dark:text-[#ff8796]"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
        <button
          className={`${primaryButtonClass} ${
            busy || runInProgress ? 'justify-center gap-[10px]' : 'justify-between'
          } ${focusRingClass}`}
          disabled={busy || runInProgress || !readiness || readiness.status === 'not-evaluable'}
          type="submit"
        >
          {busy ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-white/42 border-t-white motion-reduce:animate-none"
                aria-hidden="true"
              />
              Starting run…
            </>
          ) : runInProgress ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-white/42 border-t-white motion-reduce:animate-none"
                aria-hidden="true"
              />
              Run in progress
            </>
          ) : (
            <>
              Start agent run
              <span className="motion-safe:transition-transform motion-safe:group-hover:translate-x-[5px]" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>
      </form>
    </section>
  );
}
