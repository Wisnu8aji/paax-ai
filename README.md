# PAAX AI - Civil Engineering Workspace (v0.3)

![PAAX AI](https://via.placeholder.com/800x200?text=PAAX+AI+Workspace)

PAAX AI is an advanced, AI-powered workspace designed for civil engineers, contractors, and project managers. It automates the extraction of quantities from drawings, generates deterministic Bill of Quantities (RAB), and optimizes project schedules.

## 🌟 Overview

PAAX AI bridges the gap between unstructured construction data (PDFs, blueprints, site photos) and structured financial/scheduling formats. Unlike generic LLMs, PAAX utilizes a **Deterministic Engine** for all calculations, ensuring 100% auditability and precision, while leveraging **Gemini 1.5 Pro** for document understanding and natural language orchestration.

## 🏗️ Architecture

PAAX AI v0.3 is built as a **Monorepo** with distinct, specialized services:

- **Frontend (Next.js)**: The user-facing dashboard and workspace.
- **Core Engine (FastAPI/Python)**: Deterministic calculation engine for RAB math, scheduling scenarios, and Excel export.
- **AI Orchestrator (Firebase Genkit)**: Routes prompts, manages tools, and interfaces with Vertex AI.
- **Document Intelligence (Python)**: Pipeline for PDF OCR, vision analysis, and quantity extraction.
- **Database**: Firebase Firestore & Cloud Storage.

## 💻 Tech Stack

- **Web**: Next.js 14, React, TailwindCSS, shadcn/ui, TypeScript.
- **Backend/AI**: Python 3.11+, FastAPI, Pydantic, Firebase Genkit, Google Vertex AI (Gemini).
- **Data**: Google Cloud Firestore, Firebase Storage.
- **Package Management**: `pnpm` (Node), `uv` / `pip` (Python).

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.0
- Python >= 3.11
- `pnpm` (`npm install -g pnpm`)
- Google Cloud / Firebase account with Vertex AI enabled.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/paax-ai.git
   cd paax-ai
   ```

2. **Install Node dependencies**
   ```bash
   pnpm install
   ```

3. **Install Python dependencies (Core Engine)**
   ```bash
   cd apps/core-engine
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

4. **Environment Variables**
   Copy `.env.example` to `.env` in the respective app directories and fill in your Firebase and Vertex AI credentials.

### Running the App

Run the development servers concurrently from the root (using a tool like Turbo or manually):

```bash
# Terminal 1: Frontend
cd apps/frontend && pnpm dev

# Terminal 2: Core Engine
cd apps/core-engine && uvicorn main:app --reload

# Terminal 3: AI Orchestrator
cd apps/ai-orchestrator && pnpm run start
```

## 📂 Project Structure

```text
paax-ai/
├── apps/
│   ├── frontend/               # Next.js Workspace
│   ├── core-engine/            # FastAPI calculation engine
│   ├── ai-orchestrator/        # Genkit agent routing
│   └── document-intelligence/  # PDF processing pipeline
├── packages/
│   ├── shared-schemas/         # TS/Python data models
│   └── ui-components/          # Shared React components
├── docs/                       # Architecture & Product documentation
├── legacy/
│   └── vite-v0.2/              # Previous version reference
└── README.md
```

## 🛠️ Development

- **Branching**: We use a standard Git Flow (`main`, `develop`, `feature/*`, `fix/*`).
- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `docs:`).
- **Testing**: 
  - Python: `pytest`
  - JS/TS: `jest` / `vitest`

## 📦 Deployment
The application is designed to be deployed to Google Cloud Run (Backend services) and Vercel/Firebase Hosting (Frontend). See `docs/architecture/system-overview.md` for details.

## 📜 License
*Proprietary - Do not distribute.*
