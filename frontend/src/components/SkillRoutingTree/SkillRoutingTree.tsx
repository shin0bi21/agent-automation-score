import type { DirectiveSummary, LiveSessionSnapshot } from '../../types';

interface Props { guidance: LiveSessionSnapshot['guidance']; directives: DirectiveSummary; }
const muted = 'text-[#6f6a7d] dark:text-[#aaa3b7]';

export default function SkillRoutingTree({ guidance, directives }: Props) {
  if (!guidance.available) return <div className="mt-4 rounded-xl border border-dashed border-[#c8c1df] p-5 text-sm dark:border-[#4d455e]"><strong>Routing evidence unavailable</strong><p className={`mt-2 ${muted}`}>This session does not contain compatible skill-read telemetry.</p></div>;
  const episodes = directives.episodes.filter(episode => episode.preparation.skillsUsed.length || episode.discovery.skillsUsed.length || episode.discovery.agentsReferences || episode.discovery.skillReferences);
  if (!guidance.skillReads && !episodes.length) return <div className="mt-4 rounded-xl border border-dashed border-[#c8c1df] p-5 text-sm dark:border-[#4d455e]"><strong>No skill route observed</strong><p className={`mt-2 ${muted}`}>No explicit SKILL.md read appeared in observable tool activity.</p></div>;
  return <div className="mt-4 max-h-[430px] overflow-auto rounded-xl border border-[#dedbea] p-4 outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/32 dark:border-[#373241]" role="region" aria-label="Observed skill routing tree" tabIndex={0}>
    <ol className="list-none"><li><strong className="text-sm">All observed workers</strong><span className={`ml-2 text-xs ${muted}`}>{guidance.agentsReads} AGENTS.md reads · {guidance.skillReads} skill reads</span>
      <ol className="mt-3 ml-2 list-none border-l border-[#c8c1df] pl-5 dark:border-[#4d455e]">{episodes.map(episode => {
        const skills = [...new Set([...episode.preparation.skillsUsed, ...episode.discovery.skillsUsed])];
        return <li className="relative pb-4 before:absolute before:top-2 before:-left-5 before:w-4 before:border-t before:border-[#c8c1df] dark:before:border-[#4d455e]" key={episode.key}>
          <strong className="block text-xs">Root prompt #{episode.sequenceNumber}</strong>
          <span className={`block text-xs ${muted}`}>{episode.discovery.firstPatternLatencyMs === null ? 'Read timing unavailable' : `First guidance read after ${(episode.discovery.firstPatternLatencyMs / 1_000).toFixed(1)}s`} · {episode.discovery.patternBeforeFirstChange === null ? 'change ordering unavailable' : episode.discovery.patternBeforeFirstChange ? 'before first change' : 'after first change'}</span>
          {skills.length > 0 && <ol className="mt-2 ml-2 list-none border-l border-[#c8c1df] pl-5 dark:border-[#4d455e]">{skills.map(skill => <li className="relative py-1 before:absolute before:top-3 before:-left-5 before:w-4 before:border-t before:border-[#c8c1df] dark:before:border-[#4d455e]" key={skill}><strong className="text-xs">{skill.includes(':') ? skill.replace(':', ' plugin → ') : skill}</strong><span className={`ml-2 text-xs ${muted}`}>explicit file read</span></li>)}</ol>}
          <span className={`mt-2 block text-xs ${muted}`}>Observed downstream: {episode.execution.fileChanges} changes · {episode.execution.verificationBatches} verification batches · {episode.execution.delegations} delegations</span>
        </li>;
      })}</ol>
    </li></ol>
  </div>;
}
