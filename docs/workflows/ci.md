# Continuous integration

Architecture and merge-gate ownership are summarized in [`docs/architecture/ci.md`](../architecture/ci.md). This document is the operational command and branch-policy guide.

The supported branch flow is:

```text
feature branch -> pull request -> develop -> release pull request -> main
```

Feature work targets `develop`. Pull requests targeting `main` are accepted only from `develop`; the CI merge-path job rejects every other source branch. Merging to either branch does not deploy or publish the package.

CI validates repository skills and local documentation links, then runs root-tooling, backend, and frontend TypeScript checks, tests, production builds, the single Compose configuration in default and Docker-enabled modes, and the production Docker image build. Configure both jobs in `.github/workflows/ci.yml` as required checks in the GitHub branch rulesets for `develop` and `main`; workflow YAML cannot enable repository rulesets by itself.

Repository skill validation is part of the same required verification job. The validator is implemented in TypeScript and has no Python or PyYAML dependency.

Local verification uses the same commands:

```bash
npm run validate:skills
npm run validate:docs
npm run tooling:check
npm run backend:check
npm test
npm run web:check
npm run test:web
npm run backend:build
npm run web:build
npm run docker:config
npm run docker:build
```

The Docker build adds cold-build time to the existing verification job but does not create a new required-check name or publish an image.
