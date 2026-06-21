# ADR 0003: Google-First Cloud Architecture

## Status
Accepted

## Context
PAAX AI requires robust cloud infrastructure for hosting, database, authentication, and particularly, AI inference. We evaluated AWS, Azure, and Google Cloud Platform (GCP).

Given the project's heavy reliance on Gemini models (especially Gemini 1.5 Pro for its massive context window capable of handling large construction PDFs) and the need for rapid iteration, a unified ecosystem is highly desirable.

## Decision
We will adopt a **Google-First Cloud Architecture**.

Specifically:
- **AI Models**: Gemini 1.5 Pro / Flash via Vertex AI.
- **AI Framework**: Firebase Genkit for orchestrating AI flows, natively designed for the GCP ecosystem.
- **Database**: Firestore (NoSQL, real-time sync for the dashboard).
- **Storage**: Cloud Storage for Firebase (for Drawings, PDFs, Exports).
- **Compute**: Cloud Run for hosting Next.js and FastAPI services.
- **Authentication**: Firebase Authentication.

We will **not** host local models (e.g., Llama 3) to minimize DevOps overhead. The AI will be purely API-driven.

## Consequences

### Positive
- **Deep Integration**: Genkit, Firestore, and Vertex AI work seamlessly together.
- **Massive Context**: Vertex AI provides access to Gemini 1.5 Pro's 2M token context, essential for Document Intelligence on 100+ page specification PDFs.
- **Speed to Market**: Firebase provides out-of-the-box auth, real-time DB, and storage without configuring VPCs or complex IAM roles initially.
- **Serverless Scaling**: Cloud Run scales to zero, saving costs during early development and scaling instantly for traffic spikes.

### Negative
- **Vendor Lock-in**: We are heavily tied to GCP and Firebase schemas. Moving to AWS later would require a rewrite of the data access layer.
- **NoSQL Limitations**: Firestore is great for document retrieval but complex aggregations (e.g., "sum all concrete volumes across all projects in 2026") are harder than in PostgreSQL. We will mitigate this by having the Core Engine handle complex aggregations in-memory when needed.
