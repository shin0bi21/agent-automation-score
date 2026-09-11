import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import FloatingSelect from './FloatingSelect';

afterEach(cleanup);

test('opens below its trigger and selects an option', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 60, left: 20, right: 220, width: 200, height: 40, x: 20, y: 20, toJSON: () => ({}) } as DOMRect);
  const onChange = vi.fn();
  render(<FloatingSelect id="model" value="luna" options={[{ value: 'luna', label: 'Luna' }, { value: 'terra', label: 'Terra' }]} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button', { name: /Luna/ }));
  expect(screen.getByRole('listbox')).toHaveStyle({ top: '64px', left: '20px', width: '200px' });
  fireEvent.click(screen.getByRole('option', { name: 'Terra' }));
  expect(onChange).toHaveBeenCalledWith('terra');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('closes an anchored menu when its scroll context moves', () => {
  render(<FloatingSelect id="model" value="luna" options={[{ value: 'luna', label: 'Luna' }]} onChange={() => undefined}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Luna' }));
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.scroll(document);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('keeps an anchored menu open while its own overflow scrolls', () => {
  render(<FloatingSelect id="model" value="luna" options={[{ value: 'luna', label: 'Luna' }, { value: 'terra', label: 'Terra' }]} onChange={() => undefined}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Luna' }));
  fireEvent.scroll(screen.getByRole('listbox'));
  expect(screen.getByRole('listbox')).toBeInTheDocument();
});

test('opens from the keyboard and focuses an option', () => {
  render(<FloatingSelect id="model" value="luna" options={[{ value: 'luna', label: 'Luna' }]} onChange={vi.fn()}/>);
  fireEvent.keyDown(screen.getByRole('button', { name: /Luna/ }), { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: 'Luna' })).toHaveFocus();
});
