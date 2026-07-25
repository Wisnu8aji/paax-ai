# Build context MUST be monorepo root (e.g. docker build -t paax-doc -f services/document-intelligence/Dockerfile .)
FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN pip install poetry && poetry config virtualenvs.create false

# Copy schemas first
COPY packages/schemas/python /packages/schemas/python

# Copy service files
COPY services/document-intelligence/pyproject.toml services/document-intelligence/poetry.lock* /app/

# Install dependencies without dev (no OCR unless specified)
RUN poetry install --without dev

# Copy the rest of the service
COPY services/document-intelligence /app

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8083/health || exit 1

RUN useradd -m paaxuser && chown -R paaxuser /app
USER paaxuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8083"]
