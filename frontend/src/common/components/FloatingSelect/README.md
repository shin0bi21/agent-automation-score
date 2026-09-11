# Floating select

`FloatingSelect` is a custom button/listbox control used when the application needs consistent themed options and shared anchored-overlay behavior.

- The trigger exposes `aria-haspopup="listbox"` and `aria-expanded`.
- Options use `role="option"`, expose selection, and support Arrow Up/Down, Home, End, Escape, and pointer selection.
- The menu opens above or below from available space, stays open while its own overflow scrolls, and closes when an external scroll context moves.
- Labels target the trigger button. Disabled state prevents opening.
- Options remain readable in both themes with a solid background and contrasting text.

Because this is not a native select, preserve its complete keyboard, focus, labeling, and screen-reader contract when changing it.
