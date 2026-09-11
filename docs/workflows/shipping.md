# Shipping

Shipping is a separately authorized phase that turns an approved concern into an issue-scoped pull request merged into `develop`. Implementation, mapping, review, fixes, or approval of code do not authorize shipping. Release, deployment, package publication, and uploading local benchmark data require separate explicit authorization.

Start with the approved output from [Review](review.md). Follow [Testing](testing.md) for local verification and [Continuous integration](ci.md) for the required-check merge gate.

## Confirm the approved concern

Use the current concern map and completed concern-level review. Do not ship unresolved high- or medium-severity findings. Every remaining low-severity finding must be fixed, explicitly accepted, or assigned to a concrete deferred concern.

Inventory the complete working tree and state what will remain uncommitted. If the concern map is absent or stale, return to `map-changes` before creating remote state.

## Ship one concern

Create or reuse the GitHub issue, synchronize `develop`, create an issue-numbered branch, and isolate only the approved concern. Run the mapped focused verification against that exact isolated diff, then commit, push, and open a pull request to `develop`.

Required GitHub checks are the full merge gate. Merge only after they pass, then return the local repository to clean synchronized `develop`. Revalidate the remaining concern map before starting another concern; never prepare multiple concern branches from the same pre-merge base.

Agents use the repository `ship-changes` skill for the detailed safety-stash, verification, pull-request, check-waiting, merge, and reconciliation procedure.
