# Task: centralize account-list policy ownership

Remove the duplicated account-list visibility decision from the account query-filter builder. Make the account policy module own the parameterized SQL access predicate while preserving behavior: administrators can list all account roles, and non-administrators can list youth accounts only. Keep filtering parameterized, reuse the policy from the query builder, and avoid changing the public API.

Run focused account tests and type checking. Follow repository guidance and do not create commits, pull requests, deployments, or external artifacts. Finish with the checks actually run and genuine limitations.
