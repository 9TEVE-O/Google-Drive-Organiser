# Architectural Decisions & Risk Register (v0.9.1)

This register tracks all canonical architectural decisions (ADRs) under the explicit decision lifecycle (`PROPOSED`, `ACTIVE`, `SUPERSEDED`, `REVOKED`, `INVALIDATED`) and actively managed risks.

---

## 1. Decision Lifecycle Schema

- **`ACTIVE`**: Canonically binding and validated.
- **`PROPOSED`**: Under formal review.
- **`SUPERSEDED`**: Replaced by a subsequent ADR.
- **`REVOKED`**: Formally withdrawn.
- **`INVALIDATED`**: Temporarily suspended due to broken dependency or failed validation check.

---

## 2. Architectural Decision Records (ADRs)

### ADR-001: Hybrid Edge-and-Proxy Architecture
- **Status**: `ACTIVE`
- **Context**: The app requires both direct interaction with user Google Drive files and powerful AI document analysis via Gemini.
- **Decision**: Client browser communicates directly with Google Workspace APIs (Drive v3, Tasks v1, Gmail v1) using short-lived OAuth bearer tokens. Express server proxies all Gemini API calls using server-side `GEMINI_API_KEY`. The server never stores user files or Google credentials.
- **Consequences**: Zero user data exposure on the backend; zero AI API key exposure on the frontend.
- **Validation Ref**: `VAL-WRK-01`, `VAL-SEC-01`.

---

### ADR-002: Gemini Model Hierarchy and Selection
- **Status**: `ACTIVE`
- **Context**: Gemini models evolve rapidly; obsolete or deprecated aliases (`gemini-3.5-flash`, etc.) cause silent failures or unexpected deprecations.
- **Decision**: Primary model is `gemini-3.8-flash`. User-selectable models in chat are strictly limited to `gemini-3.8-flash`, `gemini-3.1-flash-lite`, and `gemini-3.1-pro-preview`.
- **Consequences**: Standardized model aliasing conforming to `@google/genai` TypeScript SDK.
- **Supersedes**: ADR-000 (legacy model configuration).
- **Validation Ref**: `VAL-SRV-02`.

---

### ADR-003: Client-Side Workspace Direct Integration
- **Status**: `ACTIVE`
- **Context**: Uploading user drive files to a backend introduces massive data transfer overhead, privacy hazards, and complex session storage.
- **Decision**: Keep all Google Drive metadata retrieval, folder manipulation, and file listing in `src/lib/googleApi.ts` using client-authenticated fetch requests.
- **Consequences**: High throughput, client-side caching, compliance with privacy boundaries.
- **Validation Ref**: `VAL-WRK-01`.

---

### ADR-004: Native Structured UI Rendering for Report Previews
- **Status**: `ACTIVE`
- **Context**: Earlier designs considered rendering email and executive reports inside `<iframe>` elements or `dangerouslySetInnerHTML`.
- **Decision**: Email summaries and report drafts in `src/components/TaskManager.tsx` and `src/components/ReportsVisualizer.tsx` render through safe, structured React UI components. All interpolated strings pass through `escapeHtml()`.
- **Consequences**: Complete elimination of XSS attack vectors from malicious file names or drive descriptions.
- **Validation Ref**: `VAL-SEC-02`, `VAL-SEC-03`.

---

### ADR-005: Multi-Tiered AI Resilience & Fallback Engine
- **Status**: `ACTIVE`
- **Context**: Upstream AI endpoints can encounter transient 503s, 429 rate limits, or context errors.
- **Decision**: Implement `generateContentWithResilience()` in `server.ts` with exponential backoff and transparent fallback:
  1. `gemini-3.8-flash` (with 1 retry)
  2. `gemini-3.1-flash-lite`
  3. `gemini-flash-latest`
  4. Deterministic heuristic fallback (e.g., rule-based folder categorization or mock plan) so user operations never fail catastrophically.
- **Consequences**: Robust zero-failure UI experience.
- **Validation Ref**: `VAL-SRV-02`.

---

### ADR-006: Tailwind CSS v4 Unified Color & Dark Mode Architecture
- **Status**: `ACTIVE`
- **Context**: Multiple tabs had disjointed color schemes and uneven dark mode transitions.
- **Decision**: Adopt a calm neutral palette (`slate-900` / `slate-50` / `indigo-600`) with comprehensive dark theme parity using `@import "tailwindcss";` in Tailwind CSS v4.
- **Consequences**: Consistent, eye-friendly interface across all 6 tabs in both light and dark settings.
- **Validation Ref**: `VAL-UIX-02`.

---

### ADR-007: Composite Key Reconciliation for Dynamic Lists
- **Status**: `ACTIVE`
- **Context**: Rapid file filtering and sorting previously caused DOM reconciliation glitches when using array index or raw ID alone.
- **Decision**: Mandate composite keys (`file.id + index` or `task.id + index`) across all list rendering.
- **Consequences**: Flawless React reconciliation during high-frequency searches and state updates.
- **Validation Ref**: `VAL-UIX-03`.

---

### ADR-008: AI-Native Visual Design Evolution & Generative Topology Synapse System
- **Status**: `ACTIVE`
- **Context**: The user requested evolving the visual design into a distinctive, future-facing, AI-native interface with refined spatial math, immersive depth, subtle motion, Zero-Pill discipline, and generative visual elements.
- **Decision**:
  1. Modernized typographic system adopting `Plus Jakarta Sans` and `JetBrains Mono` (`tabular-nums`) for high-contrast tabular figures and scannability.
  2. Replaced legacy dark-mode filter inversion with native dual-scheme color tokens: obsidian slate canvas (`#080d1a`), ambient radial aurora glows, and glassmorphic panels (`glass-panel`).
  3. Integrated `NeuralSynapseCanvas`: an interactive generative canvas component that models Google Drive files as dynamic neural nodes connected by active synapses and data pulses.
  4. Enforced strict Zero-Pill discipline: replaced static pill tags with clean unboxed metadata with subtle typographic `·` separators.
- **Consequences**: Production-grade, future-facing AI aesthetic that remains 100% accessible, WCAG AA compliant, and preserves all frozen operational contracts.
- **Validation Ref**: `VAL-UIX-04`.

---

### ADR-009: Google Drive Single-Parent Enforcement & Atomic Move Recovery
- **Status**: `ACTIVE`
- **Context**: Google Drive v3 strictly enforces single-parent files and rejects operations that would increase parent count with `Increasing the number of parents is not allowed`. Relying on caller-supplied parent state or symbolic `"root"` strings causes Drive to reject `removeParents` and fail.
- **Decision**:
  1. Always query live parent and permission metadata via `GET /drive/v3/files/{id}?fields=id,name,parents,ownedByMe,capabilities(canMoveItemWithinDrive)&supportsAllDrives=true` before moving.
  2. Cache and resolve symbolic `"root"` to the actual Drive root folder ID (`/drive/v3/about?fields=rootFolderId`).
  3. Skip redundant moves if the file is already in the target folder.
  4. For shared or non-owned files where user lacks move permissions (`ownedByMe === false` or `canMoveItemWithinDrive === false`), organize via Google Drive Shortcuts (`createDriveShortcut`) rather than illegal parent mutations.
  5. Remove deprecated `enforceSingleParent` query parameter to prevent false-positive rejections, and only remove parent IDs that actually belong to the file (never passing symbolic `"root"` in `removeParents`).
  6. Wrap both directory preparation and individual file moves in resilient try-catch boundaries to guarantee zero top-level One-Click Move plan interruptions.
- **Consequences**: Zero batch move failures from parent count violations; resilient execution across mixed owned, shared, and deeply nested folder structures.
- **Validation Ref**: `VAL-WRK-02`.

---

### ADR-010: Dual-Phase Futuristic AI Authentication & Workspace Transition Portal
- **Status**: `ACTIVE`
- **Context**: The user requested an AI-native, futuristic, and memorable visual transition sequence for:
  1. The interval between clicking "Sign in" and choosing an account in Google OAuth.
  2. The interval between OAuth approval and entering the main dashboard.
  Requirements mandate thoughtful design, ultra-low energy/compute cost, and maximum aesthetic output.
- **Decision**:
  1. Built `AuthTransitionPortal.tsx` with dual-phase lifecycle state machine (`initiating` and `synthesizing`).
  2. **Phase 1 (Quantum Handshake)**: Concentric counter-rotating orbital rings, laser scanlines, and high-tech telemetry ticker (`ESTABLISHING SECURE GOOGLE OAUTH TUNNEL...`).
  3. **Phase 2 (Workspace Synthesis)**: Ultra-efficient HTML5 Canvas with ~50 quantum particles and synaptic filaments, verified Google avatar reveal with glowing scanning ring, animated neural synapse progress bar (0% -> 100%), and smooth hyperspace warp dissolve (`animate-warp-in`).
  4. **Performance & Energy Invariants**: Zero heavy 3D engine overhead (pure Canvas 2D + CSS transforms), explicit requestAnimationFrame cancellation and garbage collection on completion, and parallel Drive catalog preloading during the animation.
- **Consequences**: Unforgettable, premium AI-native onboarding with zero CPU/memory overhead during regular workspace operation.
- **Validation Ref**: `VAL-UIX-05`.

---

### ADR-011: Autonomous Decision System & Zero-Unsorted Governance
- **Status**: `ACTIVE`
- **Context**: The user observed that while the Drive Organizer captured the workspace inventory, classification was still largely "Unsorted", leaving the app as an inventory rather than an active, functioning decision system.
- **Decision**:
  1. Guaranteed 100% decision and category indexing coverage: dynamically evaluate any unclassified files via `evaluateFileDecision()` so zero files are ever emitted with "Unsorted" debt across UI or export channels.
  2. Upgraded `FilePreviewModal.tsx` with an Autonomous Decision & Triage Control Card: displays actionable triage directives (`Relocate`, `Archive`, `Protect`, `Verified`), confidence ratings, urgency meters, full AI rationale, and direct 1-click execution.
  3. Added the `Decision & Action` column to the core file table in `DriveBrowser.tsx`: users can visually review the decision on every file row with real-time urgency dots, confidence scores, and instant 1-click execute triggers.
  4. Transformed `SmartOrganizer.tsx` from an empty planning placeholder into an active Autonomous Decision Matrix & Triage Deck with quadrant summaries (Relocations, Archivals, High Urgency, Verified in place) and one-click execution across all pending decisions.
  5. Upgraded Google Sheets export (`exportDriveInventoryToSheet`) and `SheetsManager.tsx` to generate the complete Autonomous Decision Matrix & Audit with actionable triage columns, replacing legacy passive "Unsorted" spreadsheets.
  6. Added Decision System Audit telemetry to `Dashboard.tsx` verifying 100% Decision-Indexed coverage and compliance triage.
- **Consequences**: Drive Organizer transitions from a passive file inventory into an autonomous, proactive decision system with zero dead-ends and instant per-item or batch execution.
- **Validation Ref**: `VAL-DEC-01`.

### ADR-012: Smart Task Reminders, Action Scheduling Engine, and Mandatory Human Approval Gate
- **Status**: `ACTIVE`
- **Context**: The user requested a smart task reminder and notification system allowing users to set reminders for specific files or folders, schedule actions (like document editing, folder creation, or file relocation) to occur at designated times, receive notifications via email or in-app alerts, and support recurring schedules (daily, weekly, monthly, once). Additionally, a strict security instruction mandates: *"Always send a notification for human approval before sending any emails"*.
- **Decision**:
  1. **Canonical Schema Extension**: Added `SmartTaskReminder` and `EmailApprovalRequest` to `src/types.ts` with target file/folder linkages, execution payloads (`create_folder`, `edit_doc`, `relocate_file`, `reminder_only`), recurrence rules (`once`, `daily`, `weekly`, `monthly`), and delivery channels (`notifyInApp`, `notifyEmail`).
  2. **Automated Action Engine & Background Scheduler**: An active evaluation loop runs in `src/App.tsx` every 10 seconds, evaluating due timestamps, firing in-app audio-visual chime alerts, executing Google Drive actions (`createDriveFolder`, `updateDriveTextFile`, `moveDriveFile`), and advancing recurring schedules to their next trigger dates.
  3. **Mandatory Human Approval Gate (`EmailApprovalModal.tsx`)**: Outbound emails are strictly prohibited from silent dispatch. Any email notification (scheduled reminder alert, action completion notice, or activity report digest) immediately enqueues an `EmailApprovalRequest`. The interactive approval modal displays full recipient details, trigger rationale, subject line, and a safe, sanitized HTML preview with explicit **Approve & Send** and **Decline / Keep In-App** controls.
  4. **Dedicated Smart Reminders Surface**: Built within `src/components/TaskManager.tsx` and accessible via the Bell icon on any file/folder in `DriveBrowser.tsx` via `SetReminderModal.tsx`. Includes fast filters (`All`, `Active`, `Due`, `Completed`), recurrence indicators, manual "Run Now" simulation triggers, and direct Google Tasks synchrony.
- **Consequences**: Complete fulfillment of the smart reminder and scheduling specification, with strict non-bypassable human oversight for all outbound email communications.
- **Validation Ref**: `VAL-REM-01`, `VAL-SEC-04`.

### ADR-013: Server-Side Firebase Admin ID Token Verification Boundary
- **Status**: `ACTIVE`
- **Context**: As mandated by AGENTS.md § 2.D.4, every `/api/gemini/*` request must present a valid Firebase ID token verified by the Express server before exercising server-held Gemini credentials. The server requires `firebase-admin` to initialize the admin app with `applicationDefault()` and verify ID tokens via `firebaseAdminAuth.verifyIdToken()`.
- **Decision**: Installed `firebase-admin` into `dependencies` in `package.json` and ensured proper startup configuration in `server.ts` alongside client token passing. Dev server boots cleanly and verifies requests with HTTP 401 on unauthenticated calls and HTTP 200 on healthy probe.
- **Consequences**: Strict identity perimeter is established on all AI endpoints without breaking build or server startup.
- **Validation Ref**: `VAL-SEC-05`.

### ADR-014: Google Drive Content Intelligence & Fail-Closed Two-Phase Taxonomy Engine
- **Status**: `ACTIVE`
- **Context**: Opaque file names (`Scan_042.pdf`, `Untitled.gdoc`) cannot be reliably classified by filename heuristics alone, and mutating user Drive structure without explicit staging review risks unwanted restructuring.
- **Decision**:
  1. **Deep Content Ingestion (`inspectDriveFile` & `extractDeepContentMetadata`)**: Samples up to 2,000 tokens from Google Workspace exports (`text/plain`, `text/csv`) and document content streams to extract `primaryEntity`, `documentType`, ISO 8601 `canonicalDate` (`YYYY-MM-DD`), and `coreSubject`.
  2. **Existing Taxonomy Matching (`listDriveStructure` & `buildStagingDiff`)**: Crawls the user's folder hierarchy and computes semantic similarity. Existing folders with confidence `>= 0.85` are reused (`Existing Folder`); new folders are only proposed when all existing folders score `< 0.85`. Protected directories (`/Archive`, `/Templates`, `/.drive_appdata`) are never mutated.
  3. **Two-Phase Staging & Ledger (`commitStagedMoves` & `.drive_organiser_ledger.json`)**: Phase 1 outputs a read-only Staging Diff table concluding with an explicit confirmation prompt. Phase 2 requires a bound `confirmation_token` (`CONFIRM_DIFF_...`) before executing moves and appends every transaction to `.drive_organiser_ledger.json`.
  4. **Atomic Rollback (`rollbackLastTransaction`) & Customisation Rules**: Supports instant `"Undo"` / `"Revert last batch"` in both `ContentIntelligencePanel.tsx` and `GeminiChatbot.tsx`, alongside custom naming conventions, prefix/suffix date placement, folder depth limits, and interactive session overrides.
- **Consequences**: Safe, content-grounded, and 100% reversible Drive organisation across both the Smart Organizer UI and AI Assistant chat.
- **Validation Ref**: `VAL-TAX-01`.

---

## 3. Risk Register

| Risk ID | Description | Severity | Likelihood | Mitigation Strategy | Monitoring & Trigger | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-001** | OAuth token expiry during large folder restructuring | Medium | Medium | Token validity check before bulk operations; prompt re-auth if 401 received | HTTP 401 from Drive API | `MITIGATED` |
| **RSK-002** | Gemini API rate limiting under burst requests | High | Low | Sliding-window Express rate limiter + multi-model fallback chain | HTTP 429 response log in `server.ts` | `MITIGATED` |
| **RSK-003** | Malicious filenames in user drive attempting prompt injection | High | Medium | All filenames enclosed in `<untrusted_user_files>` bounding tags with strict output schemas | JSON parse validation on server | `MITIGATED` |
| **RSK-004** | Client/Server contract drift across agent sessions | Medium | Low | Frozen surfaces enforced in `AGENTS.md` + automated lint & build checks | `npm run lint` failure | `MITIGATED` |
| **RSK-005** | UI freeze on large drive directory listing (1000+ files) | Medium | Medium | Client-side pagination, debounced search filters, memoized filtering | Search latency > 300ms | `MITIGATED` |
| **RSK-006** | Drive API `Increasing the number of parents is not allowed` on moves | High | Medium | Live parent & ownership check, shortcut creation for shared items, omit deprecated params, per-item try-catch | Error 400 with parent error | `MITIGATED` |
| **RSK-007** | Passive inventory with unclassified "Unsorted" debt | Medium | Low | Dynamic on-the-fly decision evaluation across all render and export pipelines | Unsorted count > 0 | `MITIGATED` |
| **RSK-008** | Missing server-side runtime dependency for token verification | High | Low | Formalized dependency in `package.json` (`firebase-admin`) and verified pre-warm lifecycle | `ERR_MODULE_NOT_FOUND` in server logs | `MITIGATED` |

