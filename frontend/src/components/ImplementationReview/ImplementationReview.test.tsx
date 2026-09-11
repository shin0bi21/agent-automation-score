import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ImplementationReview from './ImplementationReview';

afterEach(cleanup);

test('shows candidate and pinned reference evidence for each subsection', () => {
  render(
    <ImplementationReview
      sections={[{
        id: 'backend',
        label: 'Backend implementation',
        classification: 'reference-derived',
        items: [{
          id: 'services',
          label: 'Services',
          implemented: false,
          candidateFiles: [],
          referenceFiles: ['backend/src/services/taskService.ts'],
        }],
      }]}
    />,
  );

  expect(screen.getByText('Services')).toBeInTheDocument();
  expect(screen.getByText('Missing')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Services'));
  expect(screen.getByText('No matching files created.')).toBeInTheDocument();
  expect(screen.getByText('backend/src/services/taskService.ts')).toBeInTheDocument();
});
