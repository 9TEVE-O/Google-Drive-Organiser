# Foundation Closure Validation Checklist (v0.9.1)

This document provides the canonical verification matrix, validation protocols, and acceptance checklists required to certify an Implementation-Ready Foundation for **Drive Organizer**.

---

## 1. Validation Matrix

| Domain | Check ID | Validation Target | Method | Canonical Standard | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Types & Compilation** | `VAL-TYP-01` | TypeScript Type Safety | `npm run lint` (`tsc --noEmit`) | Exit code 0, 0 errors, 0 warnings | Verified |
| **Production Bundles** | `VAL-BLD-01` | Vite & Node CJS Bundling | `npm run build` | Clean dist output (`dist/server.cjs`, `dist/assets/*`) | Verified |
| **Backend Endpoints** | `VAL-SRV-01` | Server Health Endpoint | `GET /api/health` | HTTP 200 `{ "status": "ok", "service": "drive-organizer" }` | Verified |
| **Backend Resilience** | `VAL-SRV-02` | Gemini Fallback Engine | Code inspection / simulate 503 | Automatic fallback chain: 3.8-flash -> 3.1-flash-lite -> flash-latest | Verified |
| **Security & Privacy** | `VAL-SEC-01` | Key Isolation | Grep `VITE_` across src | Zero `GEMINI_API_KEY` exposure in browser bundle | Verified |
| **Security & Privacy** | `VAL-SEC-02` | HTML Escaping | Unit inspection | All user content in emails passes through `escapeHtml()` | Verified |
| **Security & Privacy** | `VAL-SEC-03` | Safe UI Previews | Component inspection | Structured React UI used in TaskManager preview (no raw iframe) | Verified |
| **Security & Privacy** | `VAL-SEC-04` | Untrusted Content Tagging | Server prompt inspection | User inputs enclosed in `<untrusted_user_files>` / `<untrusted_drive_items>` | Verified |
| **Workspace Integration** | `VAL-WRK-01` | Client-Side Direct Auth | `src/lib/googleApi.ts` | Direct client-to-Google Workspace with Bearer token | Verified |
| **UI/UX Consistency** | `VAL-UIX-01` | 6 Primary Tabs | Navigation inspection | `drive`, `organizer`, `backup`, `tasks`, `reports`, `chat` present | Verified |
| **UI/UX Consistency** | `VAL-UIX-02` | Dark Mode Support | Theme toggling inspection | Dark neutral palette (`slate-900`/`slate-50`) across all views | Verified |
| **UI/UX Consistency** | `VAL-UIX-03` | Stable React Keys | List rendering inspection | Composite keys (`file.id + index`) on all mapped file lists | Verified |

---

## 2. Validation Execution Protocol

When conducting Foundation Closure:

1. **Static Analysis**:
   ```bash
   npm run lint
   ```
   Must produce zero errors.

2. **Bundle Build**:
   ```bash
   npm run build
   ```
   Must build client (`dist/`) and server (`dist/server.cjs`) without circular dependencies or unresolvable imports.

3. **Frozen Contract Verification**:
   - Inspect `src/types.ts`: Ensure `DriveFile`, `BackupJob`, `BackupLog`, `ActivityLog`, `TaskItem`, `OrganizerRule`, `GeminiChatModel` retain canonical structure.
   - Inspect `server.ts`: Ensure the 6 canonical endpoints (`/api/health`, `/api/gemini/analyze`, `/api/gemini/organize-plan`, `/api/gemini/compose-report`, `/api/gemini/file-summary`, `/api/gemini/chat`) preserve signature.
   - Ensure primary AI model remains `gemini-3.8-flash`.

4. **Evidence Logging**:
   - Record execution timestamps and pass results in `CHECKPOINTS_AND_TESTS.md`.
   - Update `CURRENT_BUILD_STATE.md` with timestamp, commit hash or build signature, and certify state as `IMPLEMENTATION_READY`.

---

## 3. Re-Closure Protocol on Invalidation

If any validation check fails during development:
1. Immediately revert or isolate the offending commit.
2. Mark the corresponding claim in `CURRENT_BUILD_STATE.md` as `INVALIDATED`.
3. Mark affected ADRs in `DECISIONS_AND_RISKS.md` as `INVALIDATED`.
4. Implement targeted revision adhering to `docs/FOUNDATION_CLOSURE.md` (Stage 3).
5. Re-run complete validation matrix (Stage 4).
6. Re-close and certify (Stage 5).
