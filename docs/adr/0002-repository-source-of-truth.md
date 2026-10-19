# ADR 0002 — Repository as the Single Source of Truth

- **Status:** Accepted
- **Date:** 2026-10-19

## Decision

All approved decisions, architecture, story canon, content definitions, implementation plans, tests and operational procedures live in this GitHub repository. Chat is a collaboration interface, not the authoritative record.

## Rules

- Every meaningful decision is added to or reconciled with canonical docs.
- Engineering changes update relevant documents in the same workstream.
- Unresolved assumptions remain explicitly provisional.
- Use focused commits and reviewable branches; preserve history.
- Local copies are working trees, not competing sources of truth.
- Do not commit generated build output, secrets, personal data or proprietary reference assets.

## Consequence

Any contributor or agent can rehydrate project status from repository files. Missing or contradictory documentation is project work, not something to fill silently from memory.
