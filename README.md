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

- React
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

- A current Node.js LTS release
- npm
- A Firebase project configured for Google sign-in
- Google Cloud access for Drive, Tasks, and Gmail APIs
- A Gemini API key

### Installation

```bash
npm install
```

### Environment

Create a `.env` file and set:

```env
GEMINI_API_KEY=your_gemini_api_key
APP_URL=http://localhost:3000
FIREBASE_PROJECT_ID=your_firebase_project_id
```

Before running locally, make sure the repository's Firebase client configuration file contains the correct web app settings for your Firebase project so browser-based sign-in can succeed.

For local server-side Firebase ID token verification, also provide Firebase Admin application default credentials, such as `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service account key file or another environment that supports `applicationDefault()`.

### Run locally

```bash
npm run dev
```

This starts the local full-stack development server for the app.

Open:

```text
http://localhost:3000
```

## Available scripts

- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`
- `npm run clean`

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
  lib/           browser-side Firebase, Google Workspace, and authenticated fetch helpers
  types.ts       shared app contracts
server.ts        Express server and Gemini endpoints
```

## Security notes

- Do not expose `GEMINI_API_KEY` to the browser
- Keep Gemini requests behind verified Firebase identity
- Treat Google OAuth access as browser-session credentials only
- Preserve payload limits and rate limiting on Gemini routes
