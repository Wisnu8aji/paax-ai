# ADR 0001: Monorepo Architecture for PAAX AI

## Status
Accepted

## Context
PAAX AI v0.3 consists of multiple services: a Next.js frontend, a FastAPI core engine, an AI Orchestrator, and Document Intelligence services. Historically (v0.2), the frontend and backend were somewhat loosely coupled but as the complexity grows with shared schemas (e.g., RAB structures, API responses) and shared tools, we need a better way to manage code across the stack.

The two main options are:
1. **Multi-repo (Polyrepo)**: Each service has its own repository.
2. **Monorepo**: All services and shared packages live in a single repository.

With multi-repo, managing schema synchronization across Next.js (TypeScript) and FastAPI (Python) would require separate schema publishing pipelines or copying files. Given a small, agile team building PAAX AI, the overhead of managing multiple repositories, PRs across repos for a single feature, and versioning shared libraries is prohibitive.

## Decision
We will use a **Monorepo** structure for PAAX AI v0.3 using `pnpm` workspaces for the TypeScript ecosystem and standard Python package structures for the backend.

The repository will be structured as follows:
- `apps/frontend/`: Next.js workspace dashboard
- `apps/core-engine/`: FastAPI deterministic calculation engine
- `apps/ai-orchestrator/`: Genkit-based AI routing
- `apps/document-intelligence/`: Python/Node services for PDF and image processing
- `packages/shared-schemas/`: Shared TypeScript/Python Pydantic schemas
- `packages/ui/`: Shared React components (if needed)

## Consequences

### Positive
- **Atomic Commits**: A single pull request can contain both the frontend UI changes and the corresponding backend API changes.
- **Shared Code**: Schemas and utilities can be easily imported across different services.
- **Simplified CI/CD**: A single CI pipeline can test the entire stack, ensuring cross-service compatibility before merging.
- **Discoverability**: The entire system's code is easily searchable in a single IDE window.

### Negative
- **Build Tooling Complexity**: We need to configure tools like Turborepo or similar to ensure we don't rebuild the entire monorepo on every commit.
- **Repository Size**: Over time, the repository will grow larger, though for text source code this is negligible in the short to medium term.
- **Deployment Complexity**: CI/CD pipelines need to be intelligent enough to only deploy services that have changed.

## Alternatives Considered
- **Polyrepo with git submodules**: Discarded due to the notoriously difficult developer experience of git submodules.
- **Polyrepo with private NPM/PyPI packages**: Discarded because publishing packages for every internal schema change slows down iteration speed drastically.
