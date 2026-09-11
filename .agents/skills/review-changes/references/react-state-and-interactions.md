# React state and interaction review

- Keep API data authoritative and local state limited to transient input, view, theme, and overlay state.
- Check stale polling, newest-run selection, retry disabling, and history transitions.
- Verify semantic labels, status text, keyboard dismissal, focus visibility, and scrollable-region access.
- Check overlay placement above/below, close-on-scroll, bounded overflow, body scroll lock, and cleanup on unmount.
- Ensure provider-private fields and hidden reasoning do not enter components.
- Prefer a focused component or hook owner when effects and coordinated state make top-level composition unclear; do not extract for directory symmetry alone.
