# Task: reconcile table mutations locally

Make successful row mutations reconcile locally instead of refetching entire list tables. Cover Lead status and sign-up changes, Cohort deletion, and Session deletion. Use the authoritative API response or deleted identifier to upsert or remove only the affected row; if an updated Lead no longer matches the active status filter, remove it. Preserve current confirmation, success, error, pagination, and filtering behavior. Add focused tests proving the row changes without another list request or a table-wide updating state.

Follow existing list hooks and repository guidance. Do not create parallel state infrastructure, commits, pull requests, deployments, or external artifacts. Finish with the checks actually run and genuine limitations.
