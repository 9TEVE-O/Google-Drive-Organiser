# Foundation Closure Lifecycle (v0.9.1)

This document formalizes the foundation lifecycle for **Drive Organizer** under the App by AI v0.9.1 framework.

---

## 1. The Foundation Lifecycle

A foundation is a stable architectural baseline upon which functional extensions are safely constructed. The lifecycle consists of five strict sequential stages:

```
┌────────────────────────┐
│  Candidate Foundation  │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  Independent Closure   │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  Coordinated Revision  │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│   Targeted Re-Review   │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Implementation-Ready   │
│       Foundation       │
└────────────────────────┘
```

---

## 2. Stage Definitions & Gate Criteria

### Stage 1: Candidate Foundation
- **Definition**: A coherent set of code changes, structural refactorings, or capability additions that meet primary functional needs but have not yet completed adversarial verification.
- **Entry Criteria**: All planned file edits committed, initial manual sanity check passed.
- **Exit Criteria**: All modified files syntactically valid; no unfinished `TODO` or broken mock stubs in critical paths.

### Stage 2: Independent Closure
- **Definition**: Verification conducted without reliance on conversational assertions, developer intent, or untested assumptions.
- **Entry Criteria**: Exit criteria of Stage 1 satisfied.
- **Exit Criteria**:
  - Verification run via clean `tsc --noEmit` returns exit code 0.
  - Production build via `vite build` and `esbuild server.ts` produces clean bundles with no unresolved symbols.
  - Runtime health check (`GET /api/health`) responds `{ status: "ok" }`.
  - Zero violation of frozen surfaces documented in `AGENTS.md`.

### Stage 3: Coordinated Revision
- **Definition**: If Stage 2 identifies edge-case defects, regression failures, or invalidations, targeted revisions are coordinated across all dependent surfaces.
- **Entry Criteria**: Specific failure identified with reproducible failure mode.
- **Exit Criteria**:
  - Fixes applied strictly within scope of the failure.
  - Validity propagation triggered to identify any secondary impacts on `types.ts`, `server.ts`, or UI components.
  - All modified files re-staged for verification.

### Stage 4: Targeted Re-Review
- **Definition**: Focused re-verification specifically targeting the surfaces touched during Coordinated Revision, plus a complete regression smoke test.
- **Entry Criteria**: Coordinated Revision complete.
- **Exit Criteria**:
  - Re-run of failed checkpoint passes with fresh evidence.
  - No secondary regressions introduced across the 6 primary application tabs.
  - Decision state transitions logged in `DECISIONS_AND_RISKS.md`.

### Stage 5: Implementation-Ready Foundation
- **Definition**: Canonical, fully verified foundation ready for subsequent feature expansion or production deployment.
- **Entry Criteria**: Targeted Re-Review cleanly passed.
- **Exit Criteria**:
  - `CURRENT_BUILD_STATE.md` updated with fresh build timestamp, verified claim hashes, and state marked as `IMPLEMENTATION_READY`.
  - `CHECKPOINTS_AND_TESTS.md` populated with current execution evidence.
  - State carries full authority for subsequent agent sessions.

---

## 3. Independent Verification Principles

1. **Zero Assumption of Trust**: Agents must execute automated verification tools rather than assuming prior step results remain valid.
2. **Deterministic Reproducibility**: Any claim that a feature is functional must be backed by reproducible steps (build command, lint run, API contract check).
3. **Immutability of Frozen Surfaces**: An agent cannot declare closure if any frozen surface defined in `AGENTS.md` was altered without explicit authorization.
