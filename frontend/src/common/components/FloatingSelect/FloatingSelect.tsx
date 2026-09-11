import { useRef, useState } from 'react';
import FloatingMenuPanel from '../FloatingMenu/FloatingMenuPanel';
import { focusRingClass } from '../../../ui';

export interface FloatingSelectOption {
  value: string;
  label: string;
}

interface FloatingSelectProps {
  id: string;
  value: string;
  options: readonly FloatingSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const triggerClass = `
  flex min-h-[45px] w-full cursor-pointer items-center justify-between rounded-lg
  border border-[#c8c1df] bg-white px-[14px] py-3 text-left text-[#1d1929]
  disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4d455e]
  dark:bg-[#1b1921] dark:text-[#f6f2fb]
`;
const optionClass = `
  w-full cursor-pointer rounded-[5px] border-0 bg-white px-3 py-[10px]
  text-left text-[#1d1929] outline-none hover:bg-[#eeeafe]
  focus-visible:bg-[#eeeafe] aria-selected:bg-[#eeeafe] aria-selected:font-bold
  aria-selected:text-[#573dbf] dark:bg-[#1b1921] dark:text-[#f6f2fb]
  dark:hover:bg-[#2d2645] dark:focus-visible:bg-[#2d2645]
  dark:aria-selected:bg-[#2d2645] dark:aria-selected:text-[#b9a6ff]
`;

export default function FloatingSelect({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
}: FloatingSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${triggerClass} ${focusRingClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={selected ? undefined : 'text-[#6f6a7d] dark:text-[#aaa3b7]'}>
          {selected?.label ?? placeholder}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <FloatingMenuPanel
          menuRef={menuRef}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
        >
          {options.length ? (
            options.map(option => (
              <button
                key={option.value}
                className={optionClass}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <span className="px-3 py-[10px] text-[#6f6a7d] dark:text-[#aaa3b7]">
              No options available
            </span>
          )}
        </FloatingMenuPanel>
      )}
    </>
  );
}
