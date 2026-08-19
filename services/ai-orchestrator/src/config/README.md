# PAAX Environment Policy (`paax-env`)

The Environment Policy module provides environment variable management and sanitization matching OpenAI Codex `[shell_environment_policy.set]`.

## Features
- **Allowed Variable Whitelist**: Permits `PAAX_*`, `NODE_*`, `NPM_*`, `PYTHON*` and core OS system variables (`PATH`, `TEMP`, `USERPROFILE`, etc.).
- **Secret Protection**: Strips environment variables matching sensitive patterns (`*KEY*`, `*SECRET*`, `*TOKEN*`, `*AUTH*`, `*PASSWORD*`) to prevent subprocess credential leaks.
- **Explicit Shell Overrides**: Enforces deterministic environment variable injections for execution environments.
