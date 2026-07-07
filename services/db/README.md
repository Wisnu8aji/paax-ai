# PAAX Database Schema

This package contains the database schema and Alembic migrations for PAAX AI.
We use PostgreSQL as the server-side database.

## Local Development

To run migrations locally during development, you can start a PostgreSQL Docker container:

```bash
docker run --name paax-postgres -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=paax -p 5432:5432 -d postgres:15
```

Then, set the environment variable and run Alembic:

```bash
export DATABASE_URL="postgresql://postgres:secret@localhost:5432/paax"
cd services/db
alembic upgrade head
```

## Adding a new migration

When you change the schema, create a new Alembic revision:

```bash
alembic revision -m "description of changes"
```

Then edit the generated file in `alembic/versions/`.
