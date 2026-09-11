import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import FloatingMenuPanel from './FloatingMenuPanel';

afterEach(cleanup);

test('preserves dialog focus when its parent rerenders', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 20,
    bottom: 60,
    left: 20,
    right: 220,
    width: 200,
    height: 40,
    x: 20,
    y: 20,
    toJSON: () => ({}),
  } as DOMRect);
  const menuRef = createRef<HTMLDivElement>();
  const triggerRef = createRef<HTMLButtonElement>();
  const view = (label: string, open = true) => (
    <>
      <button ref={triggerRef} type="button">Open</button>
      {open && (
        <FloatingMenuPanel
          menuRef={menuRef}
          triggerRef={triggerRef}
          onClose={() => undefined}
          role="dialog"
          labelledBy="dialog-title"
          placement="centered"
        >
          <h2 id="dialog-title">{label}</h2>
          <button type="button">First action</button>
          <button type="button">Second action</button>
        </FloatingMenuPanel>
      )}
    </>
  );
  const { rerender } = render(view('Initial', false));
  rerender(view('Initial'));
  const secondAction = screen.getByRole('button', { name: 'Second action' });
  secondAction.focus();

  rerender(view('Updated'));

  expect(screen.getByRole('button', { name: 'Second action' })).toHaveFocus();
});
