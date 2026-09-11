# Structure and ownership review

- Map each changed behavior to the canonical feature, architecture, development, and local component contract.
- Verify dependency direction: browser to typed API, Express to orchestration/service, persistence service to Kysely, evaluator to normalized evidence.
- Flag privileged repository, process, credential, or database behavior placed in the browser.
- Avoid demanding a larger-app folder structure when the current owner is cohesive and tested.
- Check that renamed or moved documentation has an updated canonical index and no stale inbound links.
- Confirm generated, temporary, and machine-local data remain outside source ownership.
