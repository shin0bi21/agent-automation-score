# Tooling quality review

- Keep package scripts as the reproducible interface and workflows as orchestration.
- Check pinned runtime and dependency compatibility, lockfile intent, generated output, and ignored local data.
- Verify migration checksum behavior and do not accept edits to applied migrations without a confirmed disposable reset.
- Check scripts for path containment, shell-sensitive input, deterministic exit codes, and useful failure messages.
- Confirm documentation and skill validators cover newly introduced paths and metadata.
- Treat absent required CI checks as pending or broken, never as success.
