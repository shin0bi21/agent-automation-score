import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import Sessions from './Sessions';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('uses one session selector and dashboard for live and static review', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
  render(<Sessions />);
  const heading = screen.getByRole('heading', { name: 'Session Review' });
  expect(heading).toBeInTheDocument();
  expect(screen.queryByText('SESSION TELEMETRY')).not.toBeInTheDocument();
  expect(screen.queryByText('Watch a session as it changes or generate a frozen review in the same dashboard.')).not.toBeInTheDocument();
  expect(heading.parentElement).not.toHaveClass('max-w-[1100px]');
  expect(heading.parentElement).not.toHaveClass('max-w-[1400px]');
  expect(screen.getByText('Monitor an existing session or review a completed session.')).toBeInTheDocument();
  expect(screen.queryByText('START WATCHING')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Watch work in progress' })).not.toBeInTheDocument();
  const dashboard = screen.getByText('Monitor an existing session or review a completed session.').parentElement;
  expect(dashboard).not.toHaveClass('max-w-[1100px]');
  expect(dashboard).not.toHaveClass('max-w-[1400px]');
  expect(await screen.findByRole('button', { name: 'Generate static review' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeInTheDocument();
  expect(screen.queryByText('Full overview')).not.toBeInTheDocument();
  expect(screen.queryByText('No live snapshot yet')).not.toBeInTheDocument();
  expect(screen.queryByText('Use this same dashboard as a live view or a frozen review.')).not.toBeInTheDocument();
});
