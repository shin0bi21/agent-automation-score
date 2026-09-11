# Run report menu

`RunReportMenu` renders the completed run report as a centered dialog backed by normalized database data.

The report orders information from summary to detail:

1. overview with score, time, and total tokens;
2. agent overview with provider, model, and reasoning level;
3. token summary, including cached and uncached input;
4. missing structural-contract note when applicable;
5. implementation review grouped by applicable backend and frontend sections.

When review loops are introduced, total usage remains at the top and per-pass usage appears below it. The dialog uses the shared centered `FloatingMenuPanel`, keeps overflow internal, and must remain keyboard dismissible. Report conclusions must already exist in normalized report data; the component does not invent findings.
