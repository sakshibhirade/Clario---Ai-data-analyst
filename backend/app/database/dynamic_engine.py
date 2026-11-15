import ipaddress
import socket
import urllib.parse
from typing import Any, Dict, List, Optional
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from ..services.crypto_service import decrypt_credentials
from .models import DataSource

# In-memory engine cache for connected data sources
_engine_cache: Dict[str, Engine] = {}

# Blacklisted hosts for SSRF protection (e.g. cloud metadata services)
_BLOCKED_HOSTS = {
    "169.254.169.254",  # AWS/GCP/Azure link-local metadata
    "metadata.google.internal",
    "metadata",
}


def is_safe_host(host: str) -> bool:
    """Validate host to prevent SSRF against cloud metadata endpoints."""
    host_clean = host.strip().lower()
    if host_clean in _BLOCKED_HOSTS:
        return False
    try:
        ip = ipaddress.ip_address(host_clean)
        if ip.is_link_local:
            return False
    except ValueError:
        # Not a raw IP, resolve hostname
        try:
            resolved_ip = socket.gethostbyname(host_clean)
            if resolved_ip in _BLOCKED_HOSTS:
                return False
            ip = ipaddress.ip_address(resolved_ip)
            if ip.is_link_local:
                return False
        except Exception:
            pass
    return True


def build_postgres_url(
    host: str,
    port: int,
    database_name: str,
    username: str,
    password: str,
) -> str:
    """Build a safe PostgreSQL SQLAlchemy connection string."""
    encoded_user = urllib.parse.quote_plus(username)
    encoded_pass = urllib.parse.quote_plus(password)
    encoded_db = urllib.parse.quote_plus(database_name)
    return f"postgresql+psycopg2://{encoded_user}:{encoded_pass}@{host}:{port}/{encoded_db}"


def test_postgres_connection(
    host: str,
    port: int,
    database_name: str,
    username: str,
    password: str,
    sslmode: str = "prefer",
    timeout: int = 5,
) -> Dict[str, Any]:
    """
    Test dynamic PostgreSQL connection and return discovered tables.
    Returns a dict with success status, tables, and friendly message.
    """
    if not host or not host.strip():
        raise ValueError("Host is required.")
    if not database_name or not database_name.strip():
        raise ValueError("Database name is required.")
    if not username or not username.strip():
        raise ValueError("Username is required.")
    if not (1 <= port <= 65535):
        raise ValueError("Port must be between 1 and 65535.")

    if not is_safe_host(host):
        raise ValueError("Host target is restricted for security reasons.")

    sslmode = sslmode if sslmode in {"disable", "require", "prefer", "verify-ca", "verify-full"} else "prefer"
    db_url = build_postgres_url(host.strip(), port, database_name.strip(), username.strip(), password)

    temp_engine = create_engine(
        db_url,
        connect_args={
            "connect_timeout": timeout,
            "sslmode": sslmode,
        },
        pool_pre_ping=True,
    )

    try:
        with temp_engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        inspector = inspect(temp_engine)
        tables = inspector.get_table_names()

        return {
            "success": True,
            "message": f"Successfully connected to PostgreSQL. Found {len(tables)} table{'s' if len(tables) != 1 else ''}.",
            "tables": tables,
        }
    except OperationalError as oe:
        err_str = str(oe).lower()
        if "password authentication failed" in err_str:
            raise ValueError("Authentication failed: invalid username or password.")
        elif "database" in err_str and "does not exist" in err_str:
            raise ValueError(f"Database '{database_name}' does not exist on server {host}:{port}.")
        elif "could not connect" in err_str or "connection refused" in err_str or "10013" in err_str or "failed: connection" in err_str:
            raise ValueError(f"Could not connect to {host}:{port}. Please verify the host address, port, and network accessibility.")
        elif "timeout" in err_str or "timed out" in err_str:
            raise ValueError(f"Connection timed out after {timeout} seconds. Host {host} may be unreachable.")
        else:
            raise ValueError(f"Database connection error: {str(oe.orig) if hasattr(oe, 'orig') else str(oe)}")
    except SQLAlchemyError as se:
        raise ValueError(f"Database error: {str(se)}")
    finally:
        temp_engine.dispose()


def get_engine_for_datasource(datasource: DataSource) -> Engine:
    """Retrieve or create an SQLAlchemy Engine for a given DataSource."""
    if datasource.id in _engine_cache:
        return _engine_cache[datasource.id]

    if datasource.database_type == "postgresql":
        creds = decrypt_credentials(datasource.encrypted_credentials or "")
        password = creds.get("password", "")
        sslmode = creds.get("sslmode", "prefer")
        db_url = build_postgres_url(
            datasource.host or "localhost",
            datasource.port or 5432,
            datasource.database_name or "",
            datasource.username or "",
            password,
        )
        engine = create_engine(
            db_url,
            connect_args={"connect_timeout": 10, "sslmode": sslmode},
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    elif datasource.database_type in ("csv", "excel"):
        # SQLite storage for CSV and Excel files
        if not datasource.file_path:
            raise ValueError(f"Dataset file path not found for datasource {datasource.id}")
        engine = create_engine(
            f"sqlite:///{datasource.file_path}",
            connect_args={"timeout": 15},
            pool_pre_ping=True,
        )
    else:
        raise ValueError(f"Unsupported database type: {datasource.database_type}")

    _engine_cache[datasource.id] = engine
    return engine


def dispose_engine(datasource_id: str) -> None:
    """Dispose and remove cached engine for a disconnected/deleted data source."""
    if datasource_id in _engine_cache:
        try:
            _engine_cache[datasource_id].dispose()
        except Exception:
            pass
        del _engine_cache[datasource_id]


def get_schema_for_datasource(datasource: DataSource) -> Dict[str, Any]:
    """Inspect and return schema for all tables and columns in the data source."""
    engine = get_engine_for_datasource(datasource)
    inspector = inspect(engine)

    schema: Dict[str, Any] = {}
    tables = inspector.get_table_names()

    for table_name in tables:
        columns = inspector.get_columns(table_name)
        foreign_keys = inspector.get_foreign_keys(table_name)
        pk_constraint = inspector.get_pk_constraint(table_name)
        pk_columns = pk_constraint.get("constrained_columns", []) if pk_constraint else []

        schema[table_name] = {
            "columns": [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "primary_key": col["name"] in pk_columns,
                }
                for col in columns
            ],
            "foreign_keys": [
                {
                    "column": fk.get("constrained_columns", []),
                    "references_table": fk.get("referred_table"),
                    "references_columns": fk.get("referred_columns", []),
                }
                for fk in foreign_keys
            ],
        }

    return schema


def preview_table_data(datasource: DataSource, table_name: str, limit: int = 20) -> Dict[str, Any]:
    """Fetch the first N rows of a table safely for preview."""
    engine = get_engine_for_datasource(datasource)
    inspector = inspect(engine)
    valid_tables = inspector.get_table_names()

    if table_name not in valid_tables:
        raise ValueError(f"Table '{table_name}' does not exist in data source.")

    # Safe quoting for identifier
    safe_table = f'"{table_name}"' if datasource.database_type != "sqlite" else f'"{table_name}"'

    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {safe_table} LIMIT {limit}"))
        columns = list(result.keys())
        rows = [dict(row) for row in result.mappings().fetchall()]

        # Also get total row count
        count_res = conn.execute(text(f"SELECT COUNT(*) FROM {safe_table}"))
        total_rows = count_res.scalar() or 0

    return {
        "table_name": table_name,
        "columns": columns,
        "rows": rows,
        "preview_count": len(rows),
        "total_rows": total_rows,
    }
