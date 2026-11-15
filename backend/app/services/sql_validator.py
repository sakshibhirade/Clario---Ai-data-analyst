import sqlglot
from sqlglot import exp


class SQLValidationError(Exception):
    pass


# Anything that writes or changes the database, wherever it appears in the tree
# (including inside CTEs and subqueries).
_FORBIDDEN_NODES = tuple(
    getattr(exp, name)
    for name in (
        "Insert", "Update", "Delete", "Merge", "Drop", "Create", "Alter",
        "TruncateTable", "Command", "Copy", "Grant", "Set", "Into",
    )
    if hasattr(exp, name)
)

# Functions that read files, sleep, or touch server state.
_FORBIDDEN_FUNCTIONS = {
    "pg_sleep", "pg_read_file", "pg_read_binary_file", "pg_ls_dir",
    "pg_terminate_backend", "pg_cancel_backend", "lo_import", "lo_export",
    "dblink", "set_config", "pg_reload_conf", "load_extension",
}


def _clean(sql: str) -> str:
    """Strip markdown fences the model sometimes adds."""
    sql = sql.strip()
    if sql.startswith("```"):
        sql = sql.replace("```sql", "").replace("```sqlite", "").replace("```", "").strip()
    return sql


def validate_sql(sql: str, dialect: str = "postgres") -> str:
    """
    Validate that the generated SQL is a safe read-only query.
    Blocks any data-changing operations, non-SELECT statements, and dangerous functions.
    """
    if not sql or not sql.strip():
        raise SQLValidationError("SQL query is empty.")

    sql = _clean(sql)

    # Normalize dialect name
    read_dialect = "sqlite" if dialect in ("sqlite", "csv", "excel") else "postgres"

    # Parse the SQL
    try:
        statements = [s for s in sqlglot.parse(sql, read=read_dialect) if s is not None]
    except Exception:
        # Fallback to postgres parser if dialect-specific parser had issues
        try:
            statements = [s for s in sqlglot.parse(sql, read="postgres") if s is not None]
        except Exception as e:
            raise SQLValidationError(f"Invalid SQL syntax: {str(e)}")

    # Only one SQL statement is allowed
    if len(statements) != 1:
        raise SQLValidationError("Only one SQL statement is allowed.")

    statement = statements[0]

    # Only SELECT-style queries are allowed
    if not isinstance(statement, (exp.Select, exp.Union)):
        raise SQLValidationError("Only SELECT queries are allowed.")

    for node in statement.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise SQLValidationError(
                f"{type(node).__name__.upper()} operations are not allowed."
            )
        if isinstance(node, (exp.Func, exp.Anonymous)):
            name = (node.name or node.sql_name() or "").lower()
            if name in _FORBIDDEN_FUNCTIONS:
                raise SQLValidationError(f"Function {name}() is not allowed.")

    return sql.rstrip(";").strip()
