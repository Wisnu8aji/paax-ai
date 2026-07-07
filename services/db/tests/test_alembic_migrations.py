import os
from pathlib import Path

from alembic.config import Config
from alembic import command
import pytest

# Pastikan path absolut ke alembic.ini dan env.py
BASE_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BASE_DIR / "alembic.ini"
ALEMBIC_DIR = BASE_DIR / "alembic"

@pytest.fixture
def alembic_config(postgresql):
    """Fixture to provide Alembic configuration connected to pytest-postgresql."""
    # postgresql is a psycopg2 connection or a dict?
    # pytest-postgresql provides a `postgresql` fixture which is a psycopg2 connection.
    # We need the connection string.
    # According to pytest-postgresql docs, we can get connection params from `postgresql.info`.
    
    # Wait, the best way to get the URL with pytest-postgresql is to use `postgresql` fixture 
    # to construct the SQLAlchemy URI.
    
    # Or easier, use `postgresql_proc` or `postgresql` depending on fixture.
    # The default `postgresql` fixture yields a psycopg2 connection. We can extract connection info:
    dsn = postgresql.get_dsn_parameters()
    db_url = f"postgresql://{dsn['user']}@{dsn.get('host', 'localhost')}:{dsn.get('port', 5432)}/{dsn['dbname']}"

    # Setup alembic config
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    config.set_main_option("sqlalchemy.url", db_url)
    
    yield config

@pytest.mark.skip(reason="Requires local PostgreSQL binaries to run.")
def test_alembic_upgrade_and_downgrade(alembic_config):
    """Test that we can upgrade to head and downgrade to base successfully."""
    # Test upgrade
    command.upgrade(alembic_config, "head")
    
    # Test downgrade
    command.downgrade(alembic_config, "base")
