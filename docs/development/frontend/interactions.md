# Frontend interactions

Use this guide for floating selectors, anchored menus, centered dialogs, focus, keyboard behavior, scrolling, and viewport geometry.

## Floating overlays

- Reuse `FloatingMenuPanel` for shared anchoring, dismissal, and placement behavior.
- Choose upward or downward placement from measured viewport space.
- Close anchored overlays when their scroll context moves.
- Bound panel height and scroll inside the panel rather than growing the page.
- Keep trigger `aria-expanded`, dialog/menu semantics, labels, and Escape dismissal correct.
- Center report dialogs in the viewport, lock background body scrolling, and keep report overflow internal.
- Express overlay placement, bounds, backdrop, focus visibility, and responsive behavior with
  Tailwind utilities on the elements that own those interactions.

## Responsive behavior

Desktop run activity stays bounded by the setup area. Mobile layouts stack naturally and keep controls usable without horizontal overflow. Test the shared breakpoint, long request text, long activity, keyboard scrolling, and focus return.

Use jsdom tests for state and semantics. Use a real browser when correctness depends on layout geometry, scrolling, focus trapping, or pointer behavior.
