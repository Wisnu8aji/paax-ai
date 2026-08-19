# PAAX MCP (Model Context Protocol) Integration (`paax-mcp`)

The PAAX MCP package provides Model Context Protocol client capabilities, multi-server management, discovery, and seamless tool adapter integration.

## Architecture

```
services/ai-orchestrator/src/tools/mcp/
├── adapter.ts        # Adapts MCP JSON-RPC tools to canonical ToolDefinition
├── client.ts         # Stdio & HTTP JSON-RPC 2.0 client
├── config.ts         # Configuration parser with strict allowlists
├── mcp-discovery.ts  # Auto-discovery for core-engine, doc-intel, paax-db
├── mcp-registry.ts   # Multi-server registry, connection lifecycle & health
└── types.ts          # MCP protocol & tool contracts
```

## Features
- **Multi-Server Management**: Register and manage multiple MCP servers concurrently.
- **Auto-Discovery**: Detects local and containerized microservices (Core Engine, Document Intelligence, DB API).
- **Transport Support**: Supports `stdio` (local processes with fixed args) and `http` (streamed JSON-RPC).
- **Tool Adapter**: Automatically normalizes MCP tools into canonical PAAX agent tools prefixed as `mcp__<serverId>__<toolName>`.
