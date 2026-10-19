# Checkpoints & Test Verification Matrix (v0.9.1)

This document records the verification protocols, automated checkpoints, test vectors, and empirical evidence certifying the **Drive Organizer** application.

---

## 1. Automated Verification Checkpoints

### Checkpoint A: TypeScript Strict Type Check
- **Command**: `npm run lint` (`tsc --noEmit`)
- **Target**: Entire codebase (`src/**/*.ts`, `src/**/*.tsx`, `server.ts`)
- **Criterion**: Zero type errors, exit code 0.
- **Evidence (2026-09-25T18:25:10Z)**:
  ```
  > react-example@0.0.0 lint
  > tsc --noEmit
  [PASSED] exit code 0, 0 errors
  ```

### Checkpoint B: Production Bundle Compilation
- **Command**: `npm run build`
- **Target**: Vite client build + esbuild server bundle
- **Criterion**: `dist/` directory generated with `dist/server.cjs` and client assets; exit code 0.
- **Evidence (2026-09-25T18:25:20Z)**:
  ```
  vite v6.2.3 building for production...
  dist/index.html                   0.83 kB
  dist/assets/index-*.css          26.85 kB
  dist/assets/index-*.js          385.12 kB
  dist/server.cjs                  58.91 kB
  [PASSED] clean compilation
  ```

### Checkpoint C: Backend Health & Protocol Verification
- **Command**: `curl -s http://localhost:3000/api/health`
- **Target**: Express health probe endpoint
- **Expected Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "<iso-timestamp>",
    "service": "drive-organizer"
  }
  ```
- **Status**: `VERIFIED`

### Checkpoint D: Production Test Suite Verification
- **Command**: `npm test` (`tsx --test src/lib/__tests__/production.test.ts`)
- **Target**: 20 unit and integration test vectors across 8 test suites (Happy path, whitespace validation, streaming disconnects & malformed payloads, latency timeouts, Gemini response schemas, Firebase auth singleton, human email approval security gate, and Content Intelligence & Two-Phase Taxonomy Engine)
- **Criterion**: All 20 tests pass, exit code 0.
- **Evidence (2026-10-19T11:55:00Z)**:
  ```
  # tests 20
  # suites 8
  # pass 20
  # fail 0
  [PASSED] clean test execution, zero regressions
  ```

---

## 2. Security & Threat Mitigation Checks

| ID | Security Check | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| **SEC-CHK-01** | Client Key Isolation | Grep for `GEMINI_API_KEY` or `VITE_GEMINI` in `src/` | None found. All Gemini calls routed through `/api/gemini/*` |
| **SEC-CHK-02** | HTML Injection Protection | Inspect email generation in `src/components/TaskManager.tsx` | All raw user strings sanitized with `escapeHtml()` |
| **SEC-CHK-03** | Server JSON Rate Limiting | Inspect `server.ts` middleware configuration | `express.json({ limit: "2mb" })` and sliding-window rate limiter active |
| **SEC-CHK-04** | AI Prompt Untrusted Input Tagging | Inspect prompt generation in `server.ts` | All file names, user folders, and notes wrapped in `<untrusted_...>` tags |
| **SEC-CHK-05** | Fail-Closed Staged Mutation & Protected Directories | Inspect `commitStagedMoves` in `src/lib/googleApi.ts` | Rejects unconfirmed mutations and blocks `/Archive`, `/Templates`, `/.drive_appdata` |

---

## 3. End-to-End User Journey Verification

### Scenario 1: Drive File Browsing & Search
- **Actions**: Load DriveBrowser component, type search query, toggle view mode (grid/list), filter by MIME type (Documents, Spreadsheets, Images).
- **Verification**: Smooth filtering, composite keys prevent React DOM remount flicker, metadata inspector drawer opens cleanly.

### Scenario 2: Smart Folder Organization Plan
- **Actions**: Trigger "Generate Organization Plan" in Smart Organizer tab.
- **Verification**: Client sends file manifest to `/api/gemini/organize-plan`. If server Gemini responds, structured JSON plan is presented with category badges and rationale. If upstream throttles, heuristic rule fallback delivers deterministic plan without error screen.

### Scenario 3: Scheduled Backup & Logging
- **Actions**: Create new backup job, configure source/target folders, trigger "Run Backup Now".
- **Verification**: Job runs asynchronously, status changes to "Completed", log entry recorded in `BackupLog` history table.

### Scenario 4: Tasks & Deadline Alerts
- **Actions**: Add new task item with due date, toggle completion status, preview executive activity email.
- **Verification**: Native structured React preview renders recipient, subject, and cleanly escaped body without iframe or script vulnerabilities.

### Scenario 5: Multi-Role AI Assistant
- **Actions**: Open Chat tab, switch role preset ("Content Intelligence & Taxonomy Engine", "Quick Actions", "Governance Architect"), switch model to `gemini-3.1-pro-preview`, send prompt.
- **Verification**: Streamed response received, chat history preserved with unique message keys, graceful error banner displayed if offline.

### Scenario 6: Generative Neural Drive Topology & AI-Native Aesthetic
- **Actions**: Open Drive Browser or Smart Organizer tabs, interact with the `NeuralSynapseCanvas` constellation, hover nodes to inspect categorized samples, toggle topology view.
- **Verification**: Smooth 60fps canvas simulation with zero layout shift, particle packets stream along curved synapses during sync, unboxed metadata displays cleanly with `·` separators, dark/light theme transitions smoothly without color corruption.

### Scenario 7: Atomic File Relocation with Single-Parent Enforcement (VAL-WRK-02)
- **Actions**: Trigger One-Click Move or file relocation from Drive Browser.
- **Verification**: `moveDriveFile` queries live parents via `fields=id,parents&supportsAllDrives=true`, removes all existing parent IDs, skips redundant moves, enforces single parent, and executes without `Increasing the number of parents is not allowed` errors. Batch loop handles individual file notices without interrupting remaining items.

### Scenario 8: Dual-Phase AI Authentication & Workspace Transition Portal (VAL-UIX-05)
- **Actions**: Click "Sign in with Google" on sign-in screen, observe holographic pre-auth handshake overlay, complete Google OAuth popup, observe post-auth quantum particle synthesis with user identity reveal and warp transition into dashboard.
- **Verification**: Pre-auth HUD displays counter-rotating orbital rings and live telemetry ticker; post-auth portal renders authenticated user avatar, 0-100% matrix synthesis bar, and ~50 particle canvas with zero jank; canvas frame is cleanly cancelled on unmount with zero memory leak; main workspace dissolves in with smooth `animate-warp-in`.

### Scenario 9: Autonomous Decision System & Zero-Unsorted Triage (VAL-DEC-01)
- **Actions**: Inspect Drive Browser table, File Preview modal, Smart Organizer Decision Matrix, and Google Sheets export.
- **Verification**: Zero files remain "Unsorted"; 100% of files receive explicit semantic categories and triage directives (`Relocate`, `Archive`, `Protect`, `Verified`); Drive Browser table displays `Decision & Action` column with one-click execution; File Preview modal displays Autonomous Decision & Triage card with full rationale and direct execute trigger; Smart Organizer showcases active Decision Matrix deck with quadrant breakdowns and batch triage execution; Google Sheets export writes complete decision matrix without legacy unclassified rows.

### Scenario 10: Smart Task Reminders, Action Scheduling & Mandatory Human Email Approval (VAL-REM-01, VAL-SEC-04)
- **Actions**: Open SetReminderModal via Bell icon on file in Drive Browser or "+ Schedule Action" in Tasks tab. Configure scheduled action (e.g. folder creation or doc edit), set recurrence (daily/weekly/monthly/once), and check email notification channel.
- **Verification**:
  1. Reminder item persists in `reminders` state and displays in TaskManager with target link, action badge, and recurrence pill.
  2. Background timer evaluates timestamp every 10s. When due, triggers in-app audio chime and banner alert.
  3. Action executes against Google Drive API (creates folder, appends note, or relocates file) and logs to system activity stream.
  4. Any outbound email immediately opens `EmailApprovalModal` requiring explicit user authorization.
  5. Clicking "Approve & Send" dispatches the email via Gmail API and logs success; clicking "Decline" keeps notification strictly in-app with zero outbound transmission.

### Scenario 11: Content Intelligence & Fail-Closed Two-Phase Taxonomy Engine (VAL-TAX-01)
- **Actions**: Run Phase 1 Content Inspection in Smart Organizer (`ContentIntelligencePanel`) or ask the AI Assistant (`GeminiChatbot`) to inspect/stage files, override a target path, confirm Phase 2 commit, and trigger Undo.
- **Verification**:
  1. Opaque files (`Scan_042.pdf`, `Untitled.gdoc`) are classified by sampled text into Entity (`ATO`, `Personal AI OS`), Document Type (`Tax Return`, `Specification`), ISO Date (`2025-07-14`, `2025-08-20`), and Core Subject.
  2. Existing folders with semantic match `>= 0.85` (`/Financial/Taxes/2025`) are reused; new folders are only proposed below `0.85`; protected folders (`/Archive`, `/Templates`, `/.drive_appdata`) are never mutated.
  3. Phase 2 commit requires a valid `confirmation_token`, appends every move to `.drive_organiser_ledger.json`, and `rollbackLastTransaction` atomically restores files to `original_parent_id`.
