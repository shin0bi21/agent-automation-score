import { useId, useRef, useState } from 'react';
import FloatingMenuPanel from '../../common/components/FloatingMenu/FloatingMenuPanel';
import { actionLinkClass } from '../../ui';

interface RunRequestMenuProps {
  description: string;
}

export default function RunRequestMenu({ description }: RunRequestMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        ref={triggerRef}
        className={actionLinkClass}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        View Request
      </button>
      {open && (
        <FloatingMenuPanel
          menuRef={menuRef}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          role="dialog"
          labelledBy={titleId}
          panelWidth={420}
        >
          <div className="p-[14px]">
            <strong
              id={titleId}
              className="mb-[9px] block font-mono text-[.66rem] leading-[1.2] font-bold tracking-[.1em] text-[#6f56d9] uppercase dark:text-[#a58cff]"
            >
              Feature request
            </strong>
            <p className="m-0 [overflow-wrap:anywhere] text-[.82rem] leading-[1.55] whitespace-pre-wrap text-[#1d1929] dark:text-[#f6f2fb]">
              {description}
            </p>
          </div>
        </FloatingMenuPanel>
      )}
    </>
  );
}
