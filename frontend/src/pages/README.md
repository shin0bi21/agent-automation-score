# Pages

Each top-level application view owns its composition under this directory.

| Page | Responsibility |
|---|---|
| `Home` | Repository connection, run configuration, and latest-run presentation |
| `History` | Complete run archive |
| `Settings` | Local appearance preferences |

Page-only components stay in that page's `components/` directory. Shared product components move to `src/components/`; generic interaction primitives move to `src/common/components/`.
