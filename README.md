# Drive Organizer

Drive Organizer is a full-stack React 19 + Express production application for managing Google Drive files, autonomous folder triage, scheduled backups, Google Tasks & reminders, human-approved Gmail executive reports, and Gemini-powered productivity workflows.

---

## Architecture Overview

Drive Organizer uses a **hybrid edge-and-proxy architecture** that decouples the UI layer from the AI service client:

- **Direct Workspace Domain (Client-Side):** Browser sessions authenticate via Firebase Auth and communicate directly with Google Workspace APIs (Google Drive API v3, Google Tasks API v1, Gmail API v1, Google Sheets API v4, Google Docs API v1) using OAuth 2.0 Bearer tokens (`src/lib/googleApi.ts`). The backend server never ingests, proxies, or stores user Drive files or personal OAuth credentials.
- **Modular UI Entry Point & Decoupled AI Client (`src/main.tsx` & `src/lib/geminiApi.ts`):** `bootstrapApplication()` mounts the UI inside a `ProductionErrorBoundary` and injects an `IGeminiServiceClient` instance via `GeminiServiceProvider`. Components consume the AI service contract without coupling to raw transport or SDK internals.
- **AI Orchestration Gateway (`server.ts`):** All `@google/genai` operations execute server-side behind verified Firebase ID tokens (`requireFirebaseAuth`), sliding-window rate limiting, strict `ResponseSchema` enforcement, safety filter handling, and multi-model exponential backoff (`gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest` → deterministic heuristic fallback).

---

## Prerequisites

- **Node.js:** `>= 22.0.0` (LTS recommended)
- **npm:** `>= 10.0.0`
- **Google Gemini API Key:** Issued from Google AI Studio
- **Firebase Project:** Configured with Google Auth provider and enabled Google Workspace APIs (Drive, Tasks, Gmail, Docs, Sheets)

---

## Local Setup & Development

### 1. Install Dependencies

Use `npm ci` for deterministic lockfile installation (or `npm install` when updating packages):

```bash
npm ci
```

### 2. Configure Environment Variables

Copy the template and populate your runtime secrets:

```bash
cp .env.example .env
```

Required variables in `.env`:

| Variable | Scope | Format / Example | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server | `AIzaSy...` | Google Gemini API key (never exposed to client bundle) |
| `FIREBASE_PROJECT_ID` | Server | `gen-lang-client-0910713313` | Firebase project ID for verifying client ID tokens |
| `PORT` | Server | `3000` | HTTP server listening port (binds to `0.0.0.0`) |
| `NODE_ENV` | Server | `development` \| `production` | Runtime environment mode |
| `APP_URL` | Server | `http://localhost:3000` | Canonical application origin URL |
| `GOOGLE_APPLICATION_CREDENTIALS` | Server | `/path/to/service-account.json` | Optional local ADC path for Firebase Admin verification |
| `VITE_API_BASE_URL` | Client | `""` or `https://api.example.com` | Optional API origin override when hosting UI separately |

Ensure `firebase-applet-config.json` contains your Firebase Web App configuration for browser sign-in.

### 3. Run in Development Mode

Starts the Express server with Vite HMR/middleware mounted on `http://0.0.0.0:3000`:

```bash
npm run dev
```

### 4. Lint, Test & Build for Production

```bash
# Run strict TypeScript type-checking
npm run lint

# Run automated unit and schema contract tests
npm test

# Build optimized Vite client bundle (dist/) and standalone server bundle (dist/server.cjs)
npm run build

# Start the compiled production server on http://0.0.0.0:3000
npm start
```

---

## Containerization (Docker)

A multi-stage `Dockerfile` is included for standalone container builds, Cloud Run, or Kubernetes deployments.

### Build the Production Image

```bash
docker build -t drive-organizer:latest .
```

### Run the Container

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e GEMINI_API_KEY="your_gemini_api_key" \
  -e FIREBASE_PROJECT_ID="gen-lang-client-0910713313" \
  -e APP_URL="http://localhost:3000" \
  drive-organizer:latest
```

### Verify Container Health

```bash
curl -s http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"...","service":"drive-organizer"}
```

---

## Project Structure

```text
├── Dockerfile                    # Multi-stage Node 22 Alpine production container build
├── .dockerignore                 # Excludes node_modules, .env, and build artifacts from Docker context
├── .env.example                  # Documented environment variable template
├── package.json                  # Exact locked dependencies and build/lint/test/start scripts
├── server.ts                     # Express AI orchestration gateway & static asset server
├── src/
│   ├── main.tsx                  # Modular production entry point with DI & ErrorBoundary
│   ├── App.tsx                   # Primary application shell and workspace state coordinator
│   ├── types.ts                  # Canonical shared TypeScript interfaces
│   ├── components/               # Responsive, WCAG 2.1 AA compliant UI feature modules
│   └── lib/
│       ├── geminiApi.ts          # Decoupled IGeminiServiceClient, provider, and auth transport
│       ├── googleApi.ts          # Direct client-side Google Workspace OAuth & REST operations
│       ├── decisionEngine.ts     # Deterministic file classification & triage engine
│       ├── prompts.ts            # Enforced Gemini JSON ResponseSchemas & TypeScript contracts
│       └── __tests__/
│           └── production.test.ts # Automated CI verification test suite
```
