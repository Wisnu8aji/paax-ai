# PAAX AI v0.2-demo

PAAX AI v0.2-demo is a browser-based React + Vite app with an Express backend for demo AHSP/RAB workflows, preliminary drawing screening, chat assistance, and schedule generation.

This is not production software. It uses demo AHSP/RAB template data only. Structural outputs are preliminary screening only and require verification by a qualified engineer.

## Stack

- React + Vite frontend
- Express backend
- TypeScript deterministic RAB calculations
- Gemini API through `@google/genai`
- Mock mode when `GEMINI_API_KEY` is not configured

## Environment

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Then set your own key:

```dotenv
GEMINI_API_KEY=your_key_here
```

Do not commit `.env`, `.env.local`, or real API keys. The default model is `gemini-2.5-flash`.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run check
npm audit --omit=dev
```

## API

- `GET /api/health`
- `GET /api/paax/status`
- `POST /api/paax/chat`
- `POST /api/paax/analyze-drawing`
- `POST /api/paax/generate-schedule`
- `POST /api/paax/extract-rab-items`

## Data Boundary

The app includes only demo AHSP/RAB template data in `src/data/demoAhsp.ts`. Do not add real AHSP Excel files, private project data, or secrets to this repository.

The Python/Streamlit v0.1 code has been retained under `legacy/streamlit-v0.1/`.
