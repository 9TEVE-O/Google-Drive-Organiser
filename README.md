# Drive Organizer

Drive Organizer is a full-stack React + Express app for managing Google Drive files, Google Tasks, Gmail report delivery, and Gemini-powered productivity workflows from a single interface.

## What it does

- Browse Google Drive files and folders from the browser
- Create folders, move files, and manage file metadata
- Generate AI-assisted organization plans for Drive content
- Configure backup jobs and review backup history
- Sync Google Tasks and schedule reminders
- Compose and send executive-style Gmail reports
- Generate wallpapers and banners with Gemini image generation
- Chat with Gemini using multiple role presets and supported models

## Architecture

The app uses a split architecture:

- **Client-side Google Workspace access:** the browser talks directly to Google Drive, Google Tasks, and Gmail using OAuth scopes granted through Firebase Auth
- **Server-side AI orchestration:** the Express server handles all Gemini calls and keeps `GEMINI_API_KEY` off the client

Key backend behaviors:

- Firebase ID tokens are required for `/api/gemini/*`
- Gemini routes are rate limited
- AI routes use resilient retries and model fallback
- The server listens on `0.0.0.0:3000`

## Main areas of the app

The UI is organized into seven main tabs:

1. **Browser** — inspect and manage Google Drive files
2. **Smart Rules** — analyze files and generate organization plans
3. **Scheduled Jobs** — configure and review backup jobs
4. **Reminders & Deadlines** — manage Google Tasks and reminders
5. **Activity Visualizer** — review activity and export reports
6. **Wallpaper Generator** — create AI-generated images
7. **AI Assistant** — multi-role Gemini chat

## Tech stack

- React 19
- TypeScript
- Vite
- Express
- Firebase Auth / Firebase Admin
- Google Drive API v3
- Google Tasks API v1
- Gmail API
- `@google/genai`
- Tailwind CSS v4

## Getting started

### Prerequisites

- Node.js 20+
- npm
- A Firebase project configured for Google sign-in
- Google Cloud access for Drive, Tasks, and Gmail APIs
- A Gemini API key

### Installation

```bash
npm install
```

### Environment

Copy `.env.example` into `.env` and set:

```env
GEMINI_API_KEY=your_gemini_api_key
APP_URL=http://localhost:3000
FIREBASE_PROJECT_ID=your_firebase_project_id
```

The project also expects `/home/runner/work/Google-Drive-Organiser/Google-Drive-Organiser/firebase-applet-config.json` to contain the Firebase web app configuration used by the client.

### Run locally

```bash
npm run dev
```

This starts the full-stack app through `tsx server.ts`.

Open:

```text
http://localhost:3000
```

## Available scripts

```bash
npm run dev     # start the app locally
npm run lint    # TypeScript check
npm run build   # build client and bundled server output
npm run start   # run the production server from dist/server.cjs
npm run clean   # remove build artifacts
```

## API routes

- `GET /api/health`
- `POST /api/gemini/analyze`
- `POST /api/gemini/organize-plan`
- `POST /api/gemini/compose-report`
- `POST /api/gemini/file-summary`
- `POST /api/gemini/generate-image`
- `POST /api/gemini/chat`

## Project structure

```text
src/
  components/    UI features
  lib/           Google API and Gemini client helpers
  types.ts       shared app contracts
server.ts        Express server and Gemini endpoints
```

## Security notes

- Do not expose `GEMINI_API_KEY` to the browser
- Keep Gemini requests behind verified Firebase identity
- Treat Google OAuth access as browser-session credentials only
- Preserve payload limits and rate limiting on Gemini routes

