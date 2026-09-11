import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import Settings from './Settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('checks Codex session availability without starting a run', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      connected: true,
      loadedThreadIds: ['thread-1'],
      storedThreadAvailable: true,
      observedEventTypes: [],
    }),
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<Settings theme="light" onThemeChange={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check Connection' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Connected to Codex App Server. Stored sessions are available.',
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/session-source/probe',
    expect.objectContaining({ method: 'POST' }),
  );
});
