# Build context MUST be monorepo root
FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/ai-orchestrator/package.json ./services/ai-orchestrator/
COPY packages/schemas/package.json ./packages/schemas/

# Install dependencies (using npm since we are only testing running this single package, 
# or pnpm if available. We will just install globally pnpm)
RUN npm install -g pnpm && pnpm install --filter ai-orchestrator...

# Copy source
COPY packages/schemas ./packages/schemas
COPY services/ai-orchestrator ./services/ai-orchestrator

WORKDIR /app/services/ai-orchestrator

# Ensure healthcheck tool is available (node slim usually has curl, but let's be sure or use wget/node script)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8082/health || exit 1

RUN useradd -m paaxuser && chown -R paaxuser /app
USER paaxuser

CMD ["pnpm", "start"]
