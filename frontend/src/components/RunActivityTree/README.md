# Run activity tree

`RunActivityTree` presents normalized provider progress without exposing private reasoning.

Allowed detail includes explicit agent updates, command state, file changes, checks, errors, retries, and completion. The API bounds and normalizes this data before it reaches the component.

The tree is a named, keyboard-focusable scroll region. Its owning run card sets a bounded height so a long run cannot continuously expand the page. Status must be expressed in text/structure as well as color.
