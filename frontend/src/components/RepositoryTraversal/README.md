# Repository traversal

`RepositoryTraversal` presents a bounded, provider-neutral projection of repository-relative file access. It combines exact totals, a first-visit directory structure, an ordered route chart, and an exact-value transition table so movement is never conveyed by color or graphics alone.

The component does not read a repository or infer absolute paths. Its `RepositoryTraversalReport` contract is owned by the shared browser types and receives the normalized live or persisted API projection.

Phase and reason fields are observable, content-free heuristics. They must stay explicitly labelled as inferred evidence and must never be presented as agent intent, semantic adherence, private reasoning, or time spent thinking. Unknown and unavailable evidence is not displayed as zero.

The directory list uses static list semantics, with indentation showing depth. Directory and transition regions are keyboard-focusable and internally scrollable. The presentation is bounded to 24 directory nodes and 40 transitions; upstream truncation is also disclosed.
