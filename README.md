# PAAX AI

## Project Overview

PAAX AI is a portfolio project exploring how AI-assisted workflows can support early-stage civil construction cost planning. The current repository version is a browser-based demo app for RAB (Rencana Anggaran Biaya) exploration, preliminary drawing screening, scheduling assistance, and demo rate/template review.

This project is not production software. It is designed to demonstrate product thinking, full-stack implementation, and safe AI boundaries for civil engineering workflows.

## Current Version

The current version is **PAAX AI v0.2-demo**.

PAAX AI started as **v0.1**, a Python + Streamlit + Gemini chatbot baseline. That version focused on conversational interaction and is retained under `legacy/streamlit-v0.1/` for reference.

PAAX AI **v0.2-demo** transitions the project into a full-stack React + Vite + Express application. The demo now separates deterministic RAB calculation logic from assistant text generation, uses TypeScript for the main app workflow, and presents the experience through a browser-based workspace.

## Features

- RAB Demo Workspace for exploring demo construction cost items.
- PAAX Assistant tab, using the Gemini API when configured.
- Deterministic mock assistant mode when no Gemini API key is available.
- Drawing Screening tab for preliminary civil/structural review prompts.
- Schedule tab for demo construction schedule generation.
- Rates tab for reviewing bundled demo AHSP/RAB template data.
- TypeScript deterministic RAB calculation flow.
- Demo AHSP/RAB template data only.

## Tech Stack

- React + Vite frontend.
- Express backend.
- TypeScript application logic.
- Gemini API via `@google/genai`.
- Deterministic mock mode for local demos without an API key.
- Node.js development workflow.

## How to Run Locally

Install dependencies:

```powershell
npm install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env.local
```

Open the local environment file and add your own values if needed:

```powershell
notepad .env.local
```

Start the development server:

```powershell
npm run dev
```

Open `http://localhost:3000` in your browser.

## Environment Setup

The app reads local configuration from `.env.local`. To enable Gemini-backed assistant responses, set:

```dotenv
GEMINI_API_KEY=your_key_here
```

If `GEMINI_API_KEY` is not set, the PAAX Assistant runs in deterministic mock mode. This keeps the demo usable without requiring a live AI service or secret key.

Do not commit `.env`, `.env.local`, API keys, private AHSP files, private project data, or client data.

## Data & Safety Boundary

PAAX AI v0.2-demo includes demo AHSP/RAB template data only. It does not include an official AHSP database, private AHSP Excel files, vendor quotes, client budgets, or real project cost data.

The final RAB calculation path must remain deterministic. LLM-generated text can assist with explanation, extraction, or drafting, but final cost totals should not be trusted directly from LLM prose.

Structural and drawing-related outputs are preliminary screening only. They are not engineering approvals, construction instructions, or substitutes for review by a qualified engineer.

## What v0.2-demo Can Do

- Demonstrate a full-stack civil RAB workflow in a browser app.
- Calculate demo RAB totals through deterministic TypeScript logic.
- Show how an AI assistant can support explanation and workflow guidance.
- Fall back to mock assistant behavior when no Gemini API key is configured.
- Screen drawing-related input at a preliminary level for demo purposes.
- Generate demo schedule output for planning exploration.
- Present demo rates and template items in a portfolio-friendly interface.

## What v0.2-demo Cannot Do Yet

- It cannot be used as production estimating software.
- It cannot replace a licensed engineer, estimator, QS, or project manager.
- It does not include real/private AHSP Excel data.
- It does not include an official AHSP database.
- It does not guarantee drawing, structural, schedule, or cost correctness.
- It does not resolve the intermittent connection error yet.
- It does not make final RAB decisions from LLM text.

## Roadmap

- Improve reliability of local and deployed API connections.
- Add safer import flows for user-provided RAB/AHSP data.
- Expand validation around deterministic RAB calculations.
- Add clearer export and reporting workflows.
- Improve drawing screening with stronger input structure and review states.
- Prepare deployment documentation for a controlled demo environment.

## Portfolio Purpose

PAAX AI v0.2-demo is intended to show the evolution from an AI chatbot prototype into a structured full-stack civil engineering demo product. It highlights React, Vite, Express, TypeScript, deterministic calculation design, AI integration boundaries, and responsible handling of sensitive construction data.

The project is suitable for portfolio review, technical discussion, and controlled demonstration. It should not be presented as production-ready software.
