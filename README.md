# VibeShop-TestLab

VibeShop is an independent fictional shopping application for educational source analysis.
It is separate from VibeFlow Inspector AI and contains intentionally insecure source examples.
The paired `vulnerable/` and `safer/` trees are review fixtures, not production applications.
The safer tree addresses the controlled examples; it is not a production security certification.

**Source only. Do not deploy or connect this fixture to real services or customer data.**
No HTTP server, database driver, payment flow, real login provider, or deployment entry point is included.
All catalog entries, customer labels, orders, reviews and credential-like fixture values are synthetic.

## Layout

```text
vulnerable/src/    Application assembly, API handlers, auth, data interfaces, config, types and React UI
safer/src/         Comparable alternative implementation
synthetic-data/    Fictional JSON records shared by both trees
tests/             General syntax, type, import, data and integrity checks
fixture-manifest.json  Source hashes and versioned snapshot identifiers
PROVENANCE.md      Authorship, timing, decisions and tooling
VALIDATION_REPORT.md  Actual validation and its limits
SHA256SUMS         Hashes of all other publishable candidate files
```

Each `src/index.ts` exposes application composition, the presentation component, and fictional data.
`application.ts` connects the handlers to database, session-verification and secret-source interfaces.
The UI receives data through props. Authentication verification and SQL execution are host contracts,
not working adapters. The application settings stay on the application side and are not UI props.

## Local validation

Use existing local TypeScript and React type definitions. No package installation is required by the checks.
If dependencies already resolve from this directory, run `node tests/validate-source.mjs`.
Alternatively, supply absolute paths to existing tooling:

```sh
VIBESHOP_TYPESCRIPT=/absolute/existing/typescript/lib/typescript.js \
VIBESHOP_REACT_TYPES=/absolute/existing/@types/react \
node tests/validate-source.mjs
```

The validation command checks source without starting a service or invoking application handlers.
The package manifest records the versions used for the candidate; no lockfile was generated because
packages were not installed. Do not install packages or publish anything without the owner's approval.

Case-specific evaluation records are maintained separately from this project and are not part of its
source inventory. No scanner implementation or importer-specific instructions are supplied here.
For evaluation, use immutable source hashes and keep external evaluation material out of importer inputs.

## Publication status

This is a local candidate for owner review. It has not been accepted, frozen, published or qualified.
GitHub repository creation and pushing require separate approval. The owner must review the full source,
data, proposed license, complete future Git history and exact commit before any public release.
