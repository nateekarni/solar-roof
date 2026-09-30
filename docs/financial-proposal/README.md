# Financial proposal v2 — not applied

Review [the patch](../financial-proposal.patch) and [v2 report](review-v2.md). `files/` contains complete proposed versions; `manifest.json` lists60 changed/new files. This supersedes the original20-file proposal after Q1–Q37. No proposal was applied to active application directories.

Validation:29 focused tests passed with isolated PostgreSQL, PDF and storage fixtures; API/web/worker typechecks passed; frontend built and browser smoke passed; `git apply --check` passed. See v2 report for coverage boundaries, CSS warnings and accounting gate. All new financial issuance remains blocked pending confirmed accounting rules; do not interpret this proposal as ready to bill customers.

The patch is relative to the current working tree, including existing user work. Review before applying; re-run `git apply --check` if the baseline changes. No live financial migration or deployment is authorized by this artifact.
