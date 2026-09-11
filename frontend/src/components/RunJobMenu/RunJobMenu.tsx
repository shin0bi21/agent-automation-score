import { useId, useRef, useState } from 'react';
import type { RunRecord } from '../../types';
import FloatingMenuPanel from '../../common/components/FloatingMenu/FloatingMenuPanel';
import { actionLinkClass } from '../../ui';

interface RunJobMenuProps {
  run: RunRecord;
  worktree: string | null;
}

interface JobSetting {
  label: string;
  value: string;
}

function JobSettingItem({ label, value }: JobSetting) {
  return (
    <div className="grid gap-1">
      <dt className="font-mono text-[.58rem] leading-[1.2] font-bold tracking-[.08em] text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
        {label}
      </dt>
      <dd className="m-0 [overflow-wrap:anywhere] font-mono text-[.7rem] leading-[1.5] text-[#1d1929] dark:text-[#f6f2fb]">
        {value}
      </dd>
    </div>
  );
}

export default function RunJobMenu({ run, worktree }: RunJobMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const settings: JobSetting[] = [
    {
      label: 'Agent',
      value: `${run.provider ?? 'codex'} / ${run.model.replace('gpt-5.6-', '')}`,
    },
    { label: 'Reasoning', value: run.reasoningEffort },
    { label: 'Feature type', value: run.featureType ?? 'full-stack' },
  ];
  const paths: JobSetting[] = [
    { label: 'Benchmark worktree', value: worktree },
    { label: 'Local artifacts', value: run.artifactPath },
  ].filter((item): item is JobSetting => Boolean(item.value));

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
        View Job Configuration
      </button>
      {open && (
        <FloatingMenuPanel
          menuRef={menuRef}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          role="dialog"
          labelledBy={titleId}
          panelWidth={620}
        >
          <div className="p-4">
            <strong
              id={titleId}
              className="mb-[14px] block font-mono text-[.66rem] leading-[1.2] font-bold tracking-[.1em] text-[#6f56d9] uppercase dark:text-[#a58cff]"
            >
              Job configuration
            </strong>
            <dl className="grid grid-cols-3 gap-[10px] max-[560px]:grid-cols-1">
              {settings.map(setting => (
                <JobSettingItem key={setting.label} {...setting} />
              ))}
            </dl>
            <dl className="mt-[14px] grid gap-[10px] border-t border-[#dedbea] pt-[14px] dark:border-[#373241]">
              {paths.map(setting => (
                <JobSettingItem key={setting.label} {...setting} />
              ))}
            </dl>
          </div>
        </FloatingMenuPanel>
      )}
    </>
  );
}
