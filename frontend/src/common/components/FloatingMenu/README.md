# Floating menu panel

`FloatingMenuPanel` is the shared overlay primitive for anchored run menus and centered dialogs.

- Anchored panels measure available viewport space and open above or below their trigger.
- Anchored panels close when their scroll context moves.
- Panels bound height and scroll internally instead of expanding the page.
- Centered dialogs lock background scrolling and restore it on close.
- Escape and backdrop interaction dismiss the panel; the trigger exposes its expanded state and names the panel.

Keep layout measurement and dismissal here rather than reimplementing it in each menu. Changes that depend on actual viewport geometry, scroll, or focus should receive a real-browser smoke check in addition to semantic component tests.
