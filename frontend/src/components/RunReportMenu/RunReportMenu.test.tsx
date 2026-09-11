import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import RunReportMenu from './RunReportMenu';

afterEach(cleanup);

test('opens a report with headline metrics and implementation evidence', () => {
  render(
    <RunReportMenu
      run={{
        provider: 'codex',
        model: 'gpt-5.6-terra',
        reasoningEffort: 'low',
      }}
      result={{
        medianScore: 100,
        medianDurationMs: 421000,
        inputTokens: 12000,
        cachedInputTokens: 8000,
        outputTokens: 3456,
        missedRequirements: {},
        implementationReview: [{
          id: 'frontend',
          label: 'Frontend implementation',
          classification: 'reference-derived',
          items: [
            {
              id: 'page',
              label: 'Tasks page',
              implemented: true,
              candidateFiles: ['frontend/src/Tasks.tsx'],
              referenceFiles: ['reference/Tasks.tsx'],
            },
            {
              id: 'page-tests',
              label: 'Page tests',
              implemented: false,
              candidateFiles: [],
              referenceFiles: ['reference/Tasks.test.tsx'],
            },
          ],
        }],
      }}
    />,
  );

  expect(screen.queryByText('100%')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View Report' }));
  const report = screen.getByRole('dialog', { name: 'Report' });
  expect(report).toHaveAttribute('aria-modal', 'true');
  expect(document.body).toHaveStyle({ overflow: 'hidden' });
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  expect(report).toHaveTextContent('100%');
  expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Agent overview' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Token usage' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Structural review' })).toBeInTheDocument();
  expect(report).toHaveTextContent('7m 1s');
  expect(report).toHaveTextContent('15,456');
  expect(screen.getByText('codex')).toBeInTheDocument();
  expect(screen.getByText('terra')).toBeInTheDocument();
  expect(report).toHaveTextContent('low');
  expect(report).toHaveTextContent('8,000');
  expect(report).toHaveTextContent('4,000');
  expect(report).toHaveTextContent('All structural contracts found.');
  fireEvent.click(screen.getByText('Tasks page'));
  expect(report).toHaveTextContent('frontend/src/Tasks.tsx');
});

test('surfaces missing structural contracts in a dedicated review card', () => {
  render(
    <RunReportMenu
      run={{
        provider: 'codex',
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
      }}
      result={{
        medianScore: 52.7,
        medianDurationMs: 1000,
        inputTokens: 100,
        cachedInputTokens: 50,
        outputTokens: 10,
        missedRequirements: { 'frontend-layers': 1, workflows: 1 },
        implementationReview: null,
      }}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'View Report' }));
  expect(
    screen.getByText('Missing structural contracts: Frontend Layers, Workflows.'),
  ).toBeInTheDocument();
});
