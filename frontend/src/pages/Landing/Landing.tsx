import { eyebrowClass, mutedTextClass } from '../../ui';

type Destination = 'sessions' | 'benchmark';

export default function Landing({ onNavigate }: { onNavigate: (view: Destination) => void }) {
  const modes = [
    { view: 'sessions' as const, eyebrow: 'SESSION REVIEW', title: 'Watch and review agent work', detail: 'Start watching for a live overview, then save a snapshot for deeper analysis.' },
    { view: 'benchmark' as const, eyebrow: 'BENCHMARK LAB', title: 'Run a controlled sandbox', detail: 'Compare agent configurations safely in isolated worktrees.' },
  ];
  return (
    <section aria-labelledby="home-title">
      <p className={eyebrowClass}>AGENT INSIGHTS</p>
      <h1 className="mt-3 max-w-[950px] text-[clamp(2.8rem,6vw,6rem)] leading-[.96] tracking-[-.055em]" id="home-title">Choose how you want to measure agent work.</h1>
      <p className={`mt-6 max-w-[720px] text-[1.05rem] leading-7 ${mutedTextClass}`}>Watch and review real agent sessions, or run a reproducible sandbox benchmark.</p>
      <div className="mt-12 grid grid-cols-2 gap-5 max-[850px]:grid-cols-1" aria-label="Choose a mode">
        {modes.map(mode => (
          <button className="min-h-[220px] rounded-2xl border border-[#dedbea] bg-white p-7 text-left shadow-[0_16px_42px_rgba(46,36,82,.08)] transition hover:-translate-y-1 hover:border-[#6f56d9] dark:border-[#373241] dark:bg-[#1b1921] dark:hover:border-[#a58cff]" key={mode.view} onClick={() => onNavigate(mode.view)} type="button">
            <span className={eyebrowClass}>{mode.eyebrow}</span><strong className="mt-5 block text-2xl">{mode.title}</strong><span className={`mt-3 block leading-6 ${mutedTextClass}`}>{mode.detail}</span><span className="mt-8 block text-sm font-bold text-[#573dbf] dark:text-[#b9a6ff]">Open {mode.eyebrow.toLowerCase()} →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
