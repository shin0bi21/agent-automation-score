import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface FloatingMenuPanelProps {
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
  role?: 'listbox' | 'dialog';
  labelledBy?: string;
  panelWidth?: number;
  placement?: 'anchored' | 'centered';
}

const panelClass = `
  z-[100] box-border flex max-h-[min(70vh,640px)] flex-col overflow-y-auto
  rounded-lg border border-[#c8c1df] bg-white p-1
  shadow-[0_16px_42px_rgba(46,36,82,.08)]
  dark:border-[#4d455e] dark:bg-[#1b1921]
  dark:shadow-[0_18px_48px_rgba(0,0,0,.28)]
`;
const closeButtonClass = `
  sticky top-1 z-[1] mb-[-30px] size-[30px] cursor-pointer self-end
  rounded-full border-0 bg-white p-0 text-center text-xl leading-none
  text-[#6f6a7d] outline-offset-2 focus-visible:outline-3
  focus-visible:outline-[#6f56d9]/32 dark:bg-[#1b1921] dark:text-[#aaa3b7]
  dark:focus-visible:outline-[#a58cff]/32
`;

export default function FloatingMenuPanel({
  menuRef,
  triggerRef,
  onClose,
  children,
  role = 'listbox',
  labelledBy,
  panelWidth,
  placement = 'anchored',
}: FloatingMenuPanelProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const rect = triggerRef.current?.getBoundingClientRect();

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onCloseRef.current();
      }
    };
    const handleScroll = (event: Event) => {
      if (placement !== 'anchored') {
        return;
      }
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (role === 'dialog' && event.key === 'Tab') {
        const focusable = Array.from(
          menuRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (!focusable.length) {
          event.preventDefault();
          menuRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === menuRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (role !== 'listbox') {
        return;
      }
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
      );
      if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : current <= 0
              ? items.length - 1
              : current - 1;
      items[next]?.focus();
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    if (role === 'listbox') {
      menuRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
    } else {
      menuRef.current
        ?.querySelector<HTMLElement>('button, [href], input, select, textarea')
        ?.focus() ?? menuRef.current?.focus();
    }
    const previousOverflow = document.body.style.overflow;
    if (placement === 'centered') {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
      triggerRef.current?.focus();
      document.body.style.overflow = previousOverflow;
    };
  }, [menuRef, placement, role, triggerRef]);

  if (!rect) {
    return null;
  }
  const width = Math.min(panelWidth ?? rect.width, window.innerWidth - 32);
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
  const spaceBelow = window.innerHeight - rect.bottom - 16;
  const opensUp = placement === 'anchored' && spaceBelow < 280 && rect.top > spaceBelow;
  const anchoredStyle = opensUp
    ? {
        bottom: window.innerHeight - rect.top + 4,
        left,
        width,
        maxHeight: Math.max(120, rect.top - 20),
      }
    : {
        top: rect.bottom + 4,
        left,
        width,
        maxHeight: Math.max(120, spaceBelow),
      };
  const panel = (
    <div
      ref={menuRef}
      role={role}
      aria-modal={role === 'dialog' && placement === 'centered' ? true : undefined}
      aria-labelledby={labelledBy}
      tabIndex={role === 'dialog' ? -1 : undefined}
      className={`${panelClass} ${
        placement === 'centered' ? 'relative max-h-[min(82vh,760px)]' : 'fixed'
      }`}
      style={placement === 'centered' ? { width } : anchoredStyle}
    >
      {role === 'dialog' && (
        <button
          className={closeButtonClass}
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      )}
      {children}
    </div>
  );

  return createPortal(
    placement === 'centered' ? (
      <div className="fixed inset-0 z-[99] grid place-items-center bg-[rgba(10,8,14,.38)] p-4">
        {panel}
      </div>
    ) : panel,
    document.body,
  );
}
