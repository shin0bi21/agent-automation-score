# Common components

This directory owns reusable, product-agnostic browser interaction primitives. Components here never access repositories, providers, subprocesses, or SQLite directly.

| Component | Responsibility | Local contract |
|---|---|---|
| `FloatingMenu` | Shared anchored or centered overlay behavior | [FloatingMenu/README.md](FloatingMenu/README.md) |
| `FloatingSelect` | Custom accessible selection with shared overlay behavior | [FloatingSelect/README.md](FloatingSelect/README.md) |

Run-specific components belong under `src/components/`; page-specific components belong beside their page under `src/pages/<Page>/components/`. Colocate focused behavior tests with each component.
