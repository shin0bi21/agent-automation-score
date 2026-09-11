import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import RepositoryTraversal, { type RepositoryTraversalReport } from './RepositoryTraversal';

afterEach(cleanup);

const report: RepositoryTraversalReport = {
  available: true,
  limitation: 'Path touches show observed navigation, not intent.',
  totalFileHits: 17,
  uniqueFiles: 9,
  totalDirectoryVisits: 12,
  directionCounts: { down: 4, up: 2, cross: 1, same: 0, revisit: 5 },
  directories: [
    { id: 'root', path: '', parentId: null, depth: 0, firstVisitOrder: 1, visitCount: 3 },
    { id: 'app', path: 'frontend/src/App', parentId: 'root', depth: 1, firstVisitOrder: 2, visitCount: 6 },
  ],
  transitions: [
    {
      id: 'one',
      order: 1,
      fromPath: null,
      toPath: 'frontend/src/App',
      direction: 'down',
      hitCount: 2,
      heuristic: {
        phase: 'pattern discovery',
        reason: 'first read before a file change',
        basis: ['read', 'change ordering'],
        confidence: 'medium',
      },
    },
    {
      id: 'two',
      order: 2,
      fromPath: 'frontend/src/App',
      toPath: 'frontend/src/App',
      direction: 'revisit',
      hitCount: 3,
      heuristic: null,
    },
  ],
  directoriesTruncated: false,
  transitionsTruncated: false,
};

test('shows exact traversal totals, structure, route, and explicitly labelled heuristics', () => {
  render(<RepositoryTraversal report={report} />);

  expect(screen.getByText('File hits').nextElementSibling).toHaveTextContent('17');
  expect(screen.getByText('Revisits').nextElementSibling).toHaveTextContent('5');
  expect(screen.getByRole('region', { name: 'Directory structure observed during traversal' })).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('region', { name: 'Ordered repository traversal route chart' })).toHaveAttribute('tabindex', '0');

  const exactValues = screen.getByRole('region', { name: 'Exact repository traversal values' });
  const rows = within(exactValues).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('Down')).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent(
    'Inferred phase: pattern discovery · Why heuristic: first read before a file change · medium confidence',
  );
  expect(within(rows[2]).getByText('No heuristic available')).toBeInTheDocument();
  expect(screen.getByText(/not the agent's intent or private reasoning/i)).toBeInTheDocument();
  expect(screen.getByText('Coverage note:')).toBeInTheDocument();
  expect(screen.getByText(/Path touches show observed navigation/)).toBeInTheDocument();
});

test('shows an unavailable state without inventing zero values', () => {
  render(<RepositoryTraversal report={{ ...report, available: false, limitation: 'Historical event paths were not retained.' }} />);

  expect(screen.getByText('Repository traversal unavailable')).toBeInTheDocument();
  expect(screen.getByText('Historical event paths were not retained.')).toBeInTheDocument();
  expect(screen.queryByText('File hits')).not.toBeInTheDocument();
});

test('bounds long route presentation and announces the limit', () => {
  const transitions = Array.from({ length: 44 }, (_, index) => ({
    ...report.transitions[0],
    id: `transition-${index}`,
    order: index + 1,
  }));

  render(<RepositoryTraversal report={{ ...report, transitions }} />);

  expect(screen.getAllByText('Route chart bounded to the first 40 transitions.')).toHaveLength(1);
  expect(screen.getByText('Exact-value table bounded to the first 40 transitions.')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Exact repository traversal values' })).getAllByRole('row')).toHaveLength(41);
});
