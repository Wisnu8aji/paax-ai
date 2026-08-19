# PAAX Security & Sandbox (`paax-sandbox`)

The PAAX Security package provides path isolation, secret redaction, and execution sandbox controls.

## Sandbox Modes
- `full-access`: Standard workspace access with traversal and secret guards active.
- `read-only`: Forbids all write, modification, or deletion operations.
- `restricted`: Limits file operations strictly to explicit path allowlists.
- `elevated-deny`: Hard-blocks administrative, disk-destructive, or privilege-escalating commands (`sudo`, `runas`, `format`).

## Features
- **Path Traversal Guard**: Rejects `..` relative path escape and symlink escape outside the workspace root.
- **Protected File Patterns**: Blocks access to `.env`, `.git`, `.ssh`, and credential files.
- **Secret Redaction**: Redacts API keys, Bearer tokens, passwords, and private keys from outputs and logs.
