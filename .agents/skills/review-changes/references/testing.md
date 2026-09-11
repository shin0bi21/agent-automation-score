# Testing review

- Match every test claim to the exact command and unchanged diff it covered.
- Require persistence tests for migrations, normalization, status precedence, cascades, and projections that changed.
- Require API tests for validation, status, error, or response-contract changes.
- Require component tests for semantics and workflow state; use a real browser signal for geometry, focus, scroll, and pointer behavior.
- Distinguish fake-provider, dry-run, and real-provider coverage.
- Check failure, interruption, timeout, retry, cleanup, and empty-history behavior when lifecycle code changes.
- Do not rerun broad suites when current focused evidence already covers the exact concern.
