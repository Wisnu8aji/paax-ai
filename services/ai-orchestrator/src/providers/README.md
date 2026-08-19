# PAAX Model Providers & Routing Layer (`paax-models`)

This module manages model abstractions, provider transports (OpenAI-compatible, Gemini), response validation, and dynamic model routing.

## Architecture

```
services/ai-orchestrator/src/providers/
├── base.ts               # Core model provider interfaces
├── errors.ts             # Provider error taxonomy
├── model-router.ts       # Task-based routing & fallback chains
├── response-validator.ts # Strict response JSON and structure validation
└── transports/           # OpenAI-compatible & Gemini transports
```

## Features
- **Task-Based Routing**: Automatically routes tasks (planning, code execution, review) to the optimal model configuration.
- **Fallback Chain Management**: Seamlessly falls back from primary to secondary/emergency models when rate limits or provider errors occur.
- **Environment Configuration**: Supported overrides via `PAAX_MODEL_PRIMARY`, `PAAX_MODEL_FALLBACK`, `PAAX_MODEL_REASONING`, and `PAAX_MODEL_EMERGENCY`.
