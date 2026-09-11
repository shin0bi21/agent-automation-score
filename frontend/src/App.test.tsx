import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';
import { formatDuration, summarizeBenchmarkProgress } from './components/RunCard/RunCard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
  const path = String(input);
  const value = path.endsWith('/api/providers')
    ? [{ id: 'codex', label: 'Codex', models: [{ id: 'luna', label: 'Luna' }] }]
    : path.endsWith('/api/runtime')
      ? { directoryPickerAvailable: false, repositoryPath: '/mounted/example' }
    : path.endsWith('/api/repository')
      ? { repo: '/tmp/example', skills: Array.from({ length: 5 }, (_, index) => ({ name: `skill-${index}`, description: '', path: '' })) }
      : path.endsWith('/api/benchmark-catalog')
        ? { scenarios: [{ id: 'example', version: 1, title: 'Example scenario', featureType: 'frontend' }], suites: [] }
      : path.endsWith('/api/benchmark-readiness')
        ? { status: 'ready', contractVersion: 1, fingerprint: 'abc', scenarioId: 'example', baseRevision: 'abc', evidence: { guidance: ['AGENTS.md'], patternDocuments: ['docs/features/example.md'], analogues: ['frontend/src/Example.tsx'], inferredAnalogues: [], verification: ['npm test'] }, findings: [] }
      : [];
  return { ok: true, json: async () => value } as Response;
}));

test('renders the typed run configuration and provider catalog', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  expect(screen.getByRole('heading', { name: 'Agent Insights' })).toBeInTheDocument();
  expect(screen.getByLabelText('Local repository path')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Local repository path')).toHaveValue('/mounted/example'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Platform' })).toHaveTextContent('Codex'));
  expect(screen.getByRole('button', { name: 'Model' })).toHaveTextContent('Luna');
  expect(screen.getByRole('button', { name: 'Benchmark scenario' })).toHaveTextContent('Example scenario');
  expect(screen.queryByText('Repository skill')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Browse…' })).not.toBeInTheDocument();
  expect(screen.getByText(/Folder browsing is unavailable/)).toBeInTheDocument();
});

test('offers session review and benchmark workflows from the homepage', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(screen.getByRole('button', { name: /Watch and review agent work/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run a controlled sandbox/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Live Session' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Watch and review agent work/ }));
  expect(screen.getByRole('heading', { name: 'Session Review' })).toBeInTheDocument();
  expect(screen.getByText('Monitor an existing session or review a completed session.')).toBeInTheDocument();
});

test('shows repository readiness inside the repository section', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.change(screen.getByLabelText('Local repository path'), { target: { value: '/tmp/example' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  const repository = screen.getByRole('group', { name: 'Repository' });
  expect(
    await within(repository).findByRole('status'),
  ).toHaveTextContent('Repository ready. AGENTS.md and 5 skills discovered.');
});

test('marks the repository step as invalid when agent guidance is missing', async () => {
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    if (path.endsWith('/api/providers') || path.endsWith('/api/runs')) return { ok: true, json: async () => [] } as Response;
    return { ok: false, json: async () => ({ error: 'Repository is not automation-ready: AGENTS.md is required.' }) } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.change(screen.getByLabelText('Local repository path'), { target: { value: '/tmp/unguided' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  const repository = screen.getByRole('group', { name: 'Repository' });
  expect(await within(repository).findByRole('status')).toHaveTextContent(
    'Repository is not automation-ready: AGENTS.md is required.',
  );
});

test('formats elapsed run time compactly', () => {
  expect(formatDuration(3_725_000)).toBe('1h 2m 5s');
  expect(formatDuration(45_000)).toBe('45s');
});

test('summarizes benchmark activity without Codex state noise', () => {
  const progress = [
    'Runner',
    '[benchmark] gpt-5.6-sol (low) repetition 1/1',
    'Preparing worktree (detached HEAD 70221361)',
    'Agent progress',
    '2026-08-14T03:41:06Z WARN codex_rollout::list: state db discrepancy during lookup: falling_back',
    '2026-08-14T03:45:03Z ERROR codex_core::tools::router: error=apply_patch verification failed in /tmp/my-webapp-agent-benchmark-ABC/gpt-5.6-sol-low-run-1/file.ts',
  ].join('\n');
  expect(summarizeBenchmarkProgress(progress)).toEqual({
    worktree: '/tmp/my-webapp-agent-benchmark-ABC/gpt-5.6-sol-low-run-1',
    summary: '[benchmark] gpt-5.6-sol (low) repetition 1/1\nPreparing worktree (detached HEAD 70221361)\nAgent adjusted a patch after the target changed.',
  });
});

test('persists the selected appearance from Settings', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('radio', { name: /Dark/ }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(localStorage.getItem('agent-insights-theme')).toBe('dark');
});

test('shows only the latest run in Benchmark Lab and every run in Benchmark History', async () => {
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    const value = path.endsWith('/api/providers')
      ? [{ id: 'codex', label: 'Codex', models: [{ id: 'luna', label: 'Luna' }] }]
      : path.endsWith('/api/runs')
        ? [
            {
              id: 'active',
              createdAt: new Date().toISOString(),
              status: 'running',
              provider: 'codex',
              model: 'luna',
              reasoningEffort: 'low',
              featureType: 'frontend',
              skill: 'develop-feature',
              description: 'Active feature',
              artifactPath: '/tmp/active',
              progress: '',
              comparison: null,
            },
            {
              id: 'done',
              createdAt: new Date().toISOString(),
              status: 'completed',
              provider: 'codex',
              model: 'luna',
              reasoningEffort: 'low',
              featureType: 'full-stack',
              skill: 'develop-feature',
              description: 'Finished feature',
              artifactPath: '/tmp/done',
              progress: '',
              comparison: null,
            },
            {
              id: 'stale',
              createdAt: new Date().toISOString(),
              status: 'interrupted',
              provider: 'codex',
              model: 'terra',
              reasoningEffort: 'low',
              featureType: 'backend',
              skill: 'develop-feature',
              description: 'Interrupted feature',
              artifactPath: '/tmp/stale',
              progress: '',
              comparison: null,
            },
          ]
        : [];
    return { ok: true, json: async () => value } as Response;
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  expect(await screen.findByText('Frontend request')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Run in progress' })).toBeDisabled();
  expect(screen.queryByText('Agent run started.')).not.toBeInTheDocument();
  expect(screen.queryByText('interrupted')).not.toBeInTheDocument();
  expect(screen.queryByText('Active feature')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View Request' }));
  expect(screen.getByRole('dialog', { name: 'Feature request' })).toHaveTextContent('Active feature');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('Finished feature')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark History' }));
  expect(screen.getByRole('heading', { name: 'Run history' })).toBeInTheDocument();
  expect(screen.getByText('Frontend request')).toBeInTheDocument();
  expect(screen.getByText('Full-stack request')).toBeInTheDocument();
  expect(screen.getByText('Backend request')).toBeInTheDocument();
  expect(screen.getByText('running')).toBeInTheDocument();
  expect(screen.getByText('completed')).toBeInTheDocument();
  expect(screen.getByText('interrupted')).toBeInTheDocument();
  expect(screen.queryByText('Finished feature')).not.toBeInTheDocument();
  expect(screen.queryByText('Active feature')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Benchmark Lab' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: /Back to Benchmark Lab/ }));
  expect(screen.getByRole('heading', { name: 'Is your repo ready for automated workflows?' })).toBeInTheDocument();
});

test('keeps start and retry disabled when any historical record is still running', async () => {
  const completed = {
    id: 'newer',
    createdAt: '2026-08-14T02:00:00.000Z',
    status: 'completed',
    provider: 'codex',
    model: 'luna',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Finished.',
    comparison: null,
  };
  const running = {
    id: 'older',
    createdAt: '2026-08-14T01:00:00.000Z',
    status: 'running',
    repo: '/tmp/repo',
    provider: 'codex',
    model: 'luna',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Still running.',
    comparison: null,
  };
  vi.mocked(fetch).mockImplementation(async input => {
    const requestPath = String(input);
    if (requestPath.endsWith('/api/providers')) return { ok: true, json: async () => [{ id: 'codex', label: 'Codex', models: [{ id: 'luna', label: 'Luna' }] }] } as Response;
    if (requestPath.endsWith('/api/runs')) return { ok: true, json: async () => [completed, running] } as Response;
    return { ok: true, json: async () => [] } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  expect(await screen.findByText('completed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Run in progress' })).toBeDisabled();
});

test('retries an interrupted run with its recorded configuration', async () => {
  const interrupted = {
    id: 'stale',
    createdAt: new Date().toISOString(),
    status: 'interrupted',
    repo: '/tmp/repo',
    provider: 'codex',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Build Tasks.',
    artifactPath: '/tmp/stale',
    progress: '',
    comparison: null,
  };
  const retried = { ...interrupted, id: 'retry', status: 'running', createdAt: new Date().toISOString() };
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const requestPath = String(input);
    if (requestPath.endsWith('/api/providers')) return { ok: true, json: async () => [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-terra', label: 'Terra' }] }] } as Response;
    if (requestPath.endsWith('/api/runs') && init?.method === 'POST') return { ok: true, json: async () => retried } as Response;
    if (requestPath.endsWith('/api/runs')) return { ok: true, json: async () => [interrupted] } as Response;
    return { ok: true, json: async () => [] } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Run' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    '/api/runs',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        repo: '/tmp/repo',
        provider: 'codex',
        model: 'gpt-5.6-terra',
        reasoningEffort: 'low',
        featureType: 'frontend',
        description: 'Build Tasks.',
      }),
    }),
  ));
  expect(await screen.findByText('Run in progress')).toBeInTheDocument();
});

test('requires the matching repository to be reconnected for a durable historical retry', async () => {
  const interrupted = {
    id: 'stale',
    createdAt: new Date().toISOString(),
    status: 'interrupted',
    repositoryName: 'my-webapp',
    provider: 'codex',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Build Tasks.',
    comparison: null,
  };
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const requestPath = String(input);
    if (requestPath.endsWith('/api/providers')) return { ok: true, json: async () => [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-terra', label: 'Terra' }] }] } as Response;
    if (requestPath.endsWith('/api/repository')) return { ok: true, json: async () => ({ repo: '/tmp/my-webapp', skills: [{ name: 'develop-feature', description: '', path: '' }] }) } as Response;
    if (requestPath.endsWith('/api/runs') && init?.method === 'POST') return { ok: true, json: async () => ({ ...interrupted, id: 'retry', status: 'running' }) } as Response;
    if (requestPath.endsWith('/api/runs')) return { ok: true, json: async () => [interrupted] } as Response;
    return { ok: true, json: async () => [] } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Run' }));
  expect(await screen.findByText('Reconnect my-webapp before retrying this run.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Local repository path'), { target: { value: '/tmp/my-webapp' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText(/Repository ready/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry Run' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/runs', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"repo":"/tmp/my-webapp"') })));
});

test('does not retry durable history against a different connected repository', async () => {
  const interrupted = {
    id: 'stale',
    createdAt: new Date().toISOString(),
    status: 'interrupted',
    repositoryName: 'my-webapp',
    provider: 'codex',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Build Tasks.',
    comparison: null,
  };
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const requestPath = String(input);
    if (requestPath.endsWith('/api/providers')) return { ok: true, json: async () => [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-terra', label: 'Terra' }] }] } as Response;
    if (requestPath.endsWith('/api/repository')) return { ok: true, json: async () => ({ repo: '/tmp/other-repo', skills: [{ name: 'develop-feature', description: '', path: '' }] }) } as Response;
    if (requestPath.endsWith('/api/runs') && init?.method === 'POST') throw new Error('should not start');
    if (requestPath.endsWith('/api/runs')) return { ok: true, json: async () => [interrupted] } as Response;
    return { ok: true, json: async () => [] } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.change(screen.getByLabelText('Local repository path'), { target: { value: '/tmp/other-repo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText(/Repository ready/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry Run' }));
  expect(await screen.findByText('Reconnect my-webapp before retrying this run.')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalledWith('/api/runs', expect.objectContaining({ method: 'POST' }));
});

test('does not let an older refresh overwrite a newly retried run', async () => {
  const interrupted = {
    id: 'stale',
    createdAt: new Date().toISOString(),
    status: 'interrupted',
    repo: '/tmp/repo',
    provider: 'codex',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Build Tasks.',
    comparison: null,
  };
  const retried = { ...interrupted, id: 'retry', status: 'running', createdAt: new Date().toISOString() };
  let reads = 0;
  let resolveRefresh: ((response: Response) => void) | undefined;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const requestPath = String(input);
    if (requestPath.endsWith('/api/providers')) return { ok: true, json: async () => [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-terra', label: 'Terra' }] }] } as Response;
    if (requestPath.endsWith('/api/runs') && init?.method === 'POST') return { ok: true, json: async () => retried } as Response;
    if (requestPath.endsWith('/api/runs')) {
      reads += 1;
      if (reads === 1) return { ok: true, json: async () => [interrupted] } as Response;
      return await new Promise<Response>(resolve => { resolveRefresh = resolve; });
    }
    return { ok: true, json: async () => [] } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry Run' }));
  expect(await screen.findByText('Run in progress')).toBeInTheDocument();
  resolveRefresh?.({ ok: true, json: async () => [interrupted] } as Response);
  await waitFor(() => expect(screen.getByText('Run in progress')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Retry Run' })).not.toBeInTheDocument();
});

test('keeps completed cards compact and marks them successful', async () => {
  vi.mocked(fetch).mockImplementation(async input => {
    const requestPath = String(input);
    if (requestPath.endsWith('/api/providers')) return { ok: true, json: async () => [] } as Response;
    if (requestPath.endsWith('/api/runs')) {
      return {
        ok: true,
        json: async () => [{
          id: 'done',
          createdAt: new Date().toISOString(),
          status: 'completed',
          repo: '/tmp/repo',
          provider: 'codex',
          model: 'gpt-5.6-luna',
          reasoningEffort: 'low',
          featureType: 'frontend',
          description: 'Build Tasks.',
          artifactPath: '/tmp/done',
          progress: '',
          comparison: {
            comparison: [{
              medianScore: 100,
              medianDurationMs: 1000,
              inputTokens: 100,
              cachedInputTokens: 50,
              outputTokens: 10,
              missedRequirements: {},
              implementationReview: null,
            }],
          },
        }],
      } as Response;
    }
    return { ok: true, json: async () => [] } as Response;
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Benchmark Lab' }));
  expect(await screen.findByText('completed')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'View Job Configuration' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View Report' })).toBeInTheDocument();
});
