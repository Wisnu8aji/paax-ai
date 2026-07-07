# Build context MUST be monorepo root (e.g. docker build -t paax-core -f services/core-engine/Dockerfile .)
FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN pip install poetry && poetry config virtualenvs.create false

# Copy schemas first
COPY packages/schemas/python /packages/schemas/python

# Copy service files
COPY services/core-engine/pyproject.toml services/core-engine/poetry.lock* /app/

# Install dependencies
RUN poetry install --without dev

# Copy the rest of the service
COPY services/core-engine /app

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

RUN useradd -m paaxuser && chown -R paaxuser /app
USER paaxuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
