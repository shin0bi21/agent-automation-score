# Repository workflows

These guides own executable setup, local operation, testing, review, shipping, and CI procedures. Product behavior remains under `docs/features/`, implementation guidance under `docs/development/`, and durable system boundaries under `docs/architecture/`.

| Task | Guide |
|---|---|
| Prepare a checkout | [Setup](setup.md) |
| Run, restart, migrate, and inspect locally | [Local development](local-development.md) |
| Select and run tests | [Testing](testing.md) |
| Diagnose the UI, API, database, provider, or target run | [Debugging](debugging.md) |
| Configure and run a paid benchmark | [Running benchmarks](running-benchmarks.md) |
| Understand or change the merge gate | [Continuous integration](ci.md) |
| Review mapped concerns | [Review](review.md) |
| Ship approved concerns to `develop` | [Shipping](shipping.md) |

There is no production deployment contract yet. Add one only when a supported hosted or packaged distribution exists.
