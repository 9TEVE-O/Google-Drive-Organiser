# Drive Organizer: Architecture & Codebase Guidelines (AGENTS.md)

This document is the authoritative architectural contract for **Drive Organizer**. All future coding agents and developers working on this project MUST adhere strictly to the rules, frozen surfaces, and development guidelines defined below.

---

## 1. Architectural Overview & Domain Separation

Drive Organizer uses a **hybrid edge-and-proxy architecture**:
- **Direct Workspace Domain (Client-Side)**: User authentication and all operations with Google Workspace APIs (Google Drive v3, Google Tasks v1, Gmail Send v1) occur directly from the user's browser session via OAuth Bearer tokens managed by Firebase Auth (`src/lib/googleApi.ts`). The server NEVER ingests, proxies, or stores user Drive files or personal credentials.
- **AI Orchestration Domain (Server-Side)**: All Gemini API calls (`@google/genai`) run inside the Express server (`server.ts`). Secret keys (`GEMINI_API_KEY`) must never be exposed to the browser or prefixed with `VITE_`.

---

## 2. Frozen Surfaces (DO NOT BREAK OR REFACTOR)

The following core modules and contracts are **FROZEN**. Do not rename, remove, or restructure their contracts without explicit instruction.

### A. Data Models & Type Contracts (`src/types.ts`)
- The following interfaces are canonical: `DriveFile`, `BackupJob`, `BackupLog`, `ActivityLog`, `TaskItem`, `OrganizerRule`, `GeminiChatModel`.
- Any future properties added to these types must be marked as optional (`?`) to prevent breaking existing consumers.
- `GeminiChatModel` is strictly typed as:
  ```typescript
  export type GeminiChatModel = 'gemini-3.8-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';
  ```
  *(Never reintroduce non-standard or legacy models like `gemini-3.5-flash`)*.

### B. Backend REST Endpoints (`server.ts`)
The endpoint paths and JSON payload structures must remain stable:
1. `GET /api/health`: Health status.
2. `POST /api/gemini/analyze`: File categorization and metadata analysis with bounded inputs (`<untrusted_drive_items>`).
3. `POST /api/gemini/organize-plan`: Smart folder layout recommendations (`<untrusted_user_files>`).
4. `POST /api/gemini/compose-report`: Automated executive activity report composition.
5. `POST /api/gemini/file-summary`: Deep file insight and document preview extraction.
6. `POST /api/gemini/generate-image`: Image synthesis for phone/desktop wallpapers using `imagen-3.0-generate-002`.
7. `POST /api/gemini/chat`: Multi-turn conversational chat with role presets.

### C. Resilience & Fallback Engine
- Every AI endpoint in `server.ts` MUST use `generateContentWithResilience()`.
- Primary model: `gemini-3.8-flash` (or user-selected model in chat).
- Fallback chain: Automatic exponential backoff on HTTP 503/429/500, followed by transparent failover to `gemini-3.1-flash-lite` and `gemini-flash-latest`.
- Deterministic heuristic fallbacks must always be preserved if all upstream AI calls fail, ensuring zero UI dead-ends for users.

### D. Security & Threat Mitigation Controls
1. **Safe Native Report Previews**: In `src/components/TaskManager.tsx`, email report summaries are rendered in a safe structured React UI instead of embedding raw HTML in an iframe or DOM.
2. **HTML Sanitization**: Any raw user data (filenames, email addresses, logs) interpolated into email HTML templates must pass through `escapeHtml()`.
3. **Rate Limiting & Payload Bounds**: Express must enforce `express.json({ limit: "2mb" })` and the sliding-window rate limiter on `/api/gemini`.
4. **Authenticated Gemini Boundary**: Every `/api/gemini/*` request must present a Firebase ID token and the Express server must verify it before any server-held Gemini credential is exercised. Client Google OAuth access tokens are not substitutes for Firebase application identity.
5. **Voice Removal Freeze**: Real-time Voice UI, microphone permission, the live WebSocket server route, and direct `ws` / `@types/ws` dependencies remain removed. Do not reintroduce them without a new authorised requirement and threat review.

---

## 3. UI/UX Hierarchy & State Rules

- **Fixed Navigation**: Maintain the 7 primary tabs in `src/App.tsx`:
  `drive` (Browser), `organizer` (Smart Rules), `backup` (Scheduled Jobs), `tasks` (Reminders & Deadlines), `reports` (Activity Visualizer), `image_gen` (Wallpaper Generator), `chat` (AI Assistant).
- **Zero Unsolicited Structural Additions**: Do not add new persistent sidebars, extra secondary tabs, or unrequested landing hero blocks.
- **Strict Key Hygiene**: When rendering lists of files, tasks, or logs, always use composite keys (`file.id + index`) to ensure stable React reconciliation during rapid filtering or pagination.
- **Color & Theme Harmony**: Retain the high-contrast slate neutral palette (`slate-900` / `slate-50` / `indigo-600`) with smooth dark/light mode toggling adhering to Tailwind CSS v4 standards.

---

## 4. Verification Protocol

Before completing any change, you MUST run:
1. `npm run lint` (or `tsc --noEmit`) to verify zero TypeScript errors.
2. `npm run build` to verify clean production bundle compilation.
3. Verify that the dev server starts and listens on host `0.0.0.0` and port `3000`.
