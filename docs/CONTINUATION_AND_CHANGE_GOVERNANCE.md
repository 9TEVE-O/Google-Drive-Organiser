# Continuation and Change Governance (v0.9.1)

This document establishes the repository-carried continuation architecture and change governance protocol for **Drive Organizer** under the App by AI v0.9.1 specification.

---

## 1. Governance Objectives & Core Invariants

### 1.1 Repository-Carried State Over Ephemeral Context
Context windows in AI-assisted software development are finite, volatile, and subject to compaction, truncation, or session loss. A repository must be self-describing, self-verifying, and self-governing. All architectural decisions, state transitions, validation evidence, and dependency maps are carried within repository version control rather than conversational threads.

### 1.2 Invariant: Recency Does Not Confer Canonical Authority
In multi-agent or parallel-session development:
- **Timestamp Priority Rejected**: A newer commit, branch, or agent output does NOT supersede an existing decision or foundation claim simply by virtue of being generated later.
- **Evidence-Based Authority**: Authority derives exclusively from rigorous adherence to validation criteria, passing verification gates, compliance with frozen contracts, and formal lifecycle state transitions.
- **Reconciliation Protocol**: When parallel agents produce competing claims or code edits, the canonical version is determined through closure verification against `CHECKPOINTS_AND_TESTS.md` and alignment with `AGENTS.md` frozen surfaces.

---

## 2. Decision Lifecycle Governance

Every architectural decision and design commitment must be explicitly registered in `DECISIONS_AND_RISKS.md` under one of the five lifecycle states:

```
  ┌──────────────┐
  │   PROPOSED   │ ──(validation passing & accepted)──► ┌──────────────┐
  └──────────────┘                                      │    ACTIVE    │
         │                                              └──────────────┘
         │ (rejected)                                      │        │
         ▼                                                 │        │
  ┌──────────────┐ (new decision replaces)                 │        │
  │   REVOKED    │ ◄───────────────────────────────────────┘        │
  └──────────────┘                                                  ▼
                                                           ┌────────────────┐
                                                           │   SUPERSEDED   │
                                                           └────────────────┘
                                                                    ▲
  ┌──────────────┐                                                  │
  │ INVALIDATED  │ ──(dependency broken / validation fails)─────────┘
  └──────────────┘
```

### Lifecycle States Defined:
1. **`PROPOSED`**: The decision is documented with clear rationale, affected components, and acceptance criteria, but has not yet undergone closure verification.
2. **`ACTIVE`**: The decision has satisfied all validation gates, is fully implemented, verified with evidence, and is canonically binding across all agents.
3. **`SUPERSEDED`**: The decision was formerly `ACTIVE` but has been formally replaced by a newer decision (with explicit cross-reference to the replacing ADR ID).
4. **`REVOKED`**: The decision was considered or implemented but explicitly withdrawn without replacement due to design shift or unviability.
5. **`INVALIDATED`**: An upstream contract change, dependency shift, or test failure has broken the assumptions of this decision. An invalidated decision MUST NOT be relied upon until re-evaluated or re-closed.

---

## 3. Dependency-Based Validity Propagation

When any part of the codebase, environment, or configuration changes, validity does not remain static. It propagates downstream through a deterministic dependency graph:

```
┌──────────────────┐
│   Change Event   │  (e.g., Code edit, API model upgrade, security patch)
└─────────┬────────┘
          ▼
┌──────────────────┐
│ Impact Detection │  (Identify modified components, contracts, endpoints)
└─────────┬────────┘
          ▼
┌──────────────────┐
│ Affected Claims  │  (Flag claims in CURRENT_BUILD_STATE.md as PENDING_REVERIFICATION)
└─────────┬────────┘
          ▼
┌──────────────────┐
│ Decision Status  │  (Transition affected ADRs to INVALIDATED if assumptions breached)
└─────────┬────────┘
          ▼
┌──────────────────┐
│ Acceptance Inval │  (Invalidate prior test evidence in CHECKPOINTS_AND_TESTS.md)
└─────────┬────────┘
          ▼
┌──────────────────┐
│ Evidence Re-run  │  (Execute tsc, build, health checks, integration vectors)
└─────────┬────────┘
          ▼
┌──────────────────┐
│ Docs & Re-closure│  (Update CURRENT_BUILD_STATE.md, restore ADRs to ACTIVE, re-close)
└──────────────────┘
```

### Propagation Invariants:
- If a frozen surface in `AGENTS.md` is touched, ALL downstream acceptance criteria are immediately marked `INVALIDATED` until full regression suite succeeds.
- If upstream AI models are altered in `server.ts`, ADR-002, resilience fallback tests, and chat model interfaces must be re-validated.
- If Google Workspace OAuth scopes change, both `server.ts` and `src/lib/googleApi.ts` client-side contracts must be re-checked for consent compatibility.

---

## 4. `CURRENT_BUILD_STATE` Schema & Migration Controls

### 4.1 Schema Version Invariant
- The current schema version is **`v0.9.1`**.
- Any future agent modifying `CURRENT_BUILD_STATE.md` must declare `schema_version`.
- If an agent encounters a `CURRENT_BUILD_STATE` artifact from an earlier schema version (e.g., `v0.9.0`), it MUST execute the backward-compatible migration rules:
  1. Retain all existing validated claims and test evidence.
  2. Populate new required fields (e.g., `dependency_invalidation_matrix`, `decision_lifecycle_status`).
  3. Log the migration event in the state transition history.

### 4.2 State Machine Integrity
A build state is only valid if:
1. `npm run lint` (`tsc --noEmit`) passes with exit code 0.
2. `npm run build` succeeds without bundle or chunk generation errors.
3. Dev server configuration adheres to host `0.0.0.0` and port `3000`.
4. Zero unescaped untrusted inputs pass into HTML or prompt structures.

---

## 5. Longitudinal Capstone Composition Scenario

The following scenario validates that these governance controls compose robustly across common edge conditions:

### Scenario Walkthrough:
1. **Session Loss**: Agent Alpha initiates an architectural enhancement to file tagging, logs decisions ADR-008 as `PROPOSED`, updates build state, and terminates abruptly.
2. **Resumption**: Agent Beta resumes with zero conversation memory. Agent Beta inspects `AGENTS.md`, `CURRENT_BUILD_STATE.md`, and `DECISIONS_AND_RISKS.md`. It observes ADR-008 is `PROPOSED` and prior evidence is tagged.
3. **Parallel Drift Avoidance**: Agent Beta does not overwrite ADR-008 based on recency. Instead, it checks validity propagation: the affected files are verified, test vectors are executed.
4. **Invalidation Recovery**: A regression in `types.ts` is detected during `npm run lint`. Agent Beta marks the affected claim as `INVALIDATED`, applies targeted fix, re-executes `npm run lint` and `npm run build`, and transitions ADR-008 to `ACTIVE`.
5. **Re-Closure**: Evidence is recorded in `CHECKPOINTS_AND_TESTS.md`, state version is updated to v0.9.1 compliant closure, and repository integrity is preserved.

---

## 6. Cold-Start Resumption Sequence

Any agent initiating work or resuming from compaction MUST execute this inspection order:
1. `AGENTS.md`: Authoritative architectural contract and frozen surfaces.
2. `CURRENT_BUILD_STATE.md`: Active phase, health status, and verified claims.
3. `DECISIONS_AND_RISKS.md`: Active decisions, supersessions, and risk mitigations.
4. `CHECKPOINTS_AND_TESTS.md`: Verification protocols and evidence history.
5. `docs/FOUNDATION_CLOSURE.md`: Stage entry/exit requirements for changes.
