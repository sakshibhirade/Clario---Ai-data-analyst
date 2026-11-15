import re
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...services.llm_service import generate_text, LLMError
from ...services.sql_validator import validate_sql, SQLValidationError
from ...database.schema_service import get_database_schema
from ...database.connection import get_db, engine as internal_engine
from ...database.models import DataSource
from ...database.dynamic_engine import (
    get_engine_for_datasource,
    get_schema_for_datasource,
)

router = APIRouter()

# Hard cap so a huge result can never freeze the browser.
MAX_ROWS = 2000
DEFAULT_USER_ID = "default_user"


class SQLRequest(BaseModel):
    question: str
    datasource_id: Optional[str] = None


class QueryHistory(BaseModel):
    question: str
    insight: str | None = None


class QueryRequest(BaseModel):
    question: str
    history: list[QueryHistory] = Field(default_factory=list)
    datasource_id: Optional[str] = None


@router.get("/test")
def test_ai():
    try:
        response = generate_text(
            "Say hello and explain in one sentence what an AI Data Analyst does."
        )
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "status": "success",
        "response": response
    }


def _resolve_datasource_context(
    datasource_id: Optional[str],
    db: Session,
):
    """
    Resolve schema, engine, database type, and display name for query execution.
    If datasource_id is given, uses the external connection or uploaded file.
    If not, falls back to internal demo database.
    """
    if datasource_id and datasource_id != "internal":
        ds = db.query(DataSource).filter(
            DataSource.id == datasource_id,
            DataSource.user_id == DEFAULT_USER_ID,
        ).first()

        if not ds:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Selected data source (id: {datasource_id}) was not found.",
            )

        try:
            schema = get_schema_for_datasource(ds)
            target_engine = get_engine_for_datasource(ds)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to access data source '{ds.connection_name}': {str(e)}",
            )

        dialect = "sqlite" if ds.database_type in ("csv", "excel", "sqlite") else "postgres"
        db_label = ds.connection_name
        return schema, target_engine, dialect, db_label, ds.database_type

    # Fallback to internal PostgreSQL demo database
    schema = get_database_schema()
    return schema, internal_engine, "postgres", "Internal Demo Database", "postgresql"


@router.post("/generate-sql")
def generate_sql(
    request: SQLRequest,
    db: Session = Depends(get_db),
):
    schema, target_engine, dialect, db_label, db_type = _resolve_datasource_context(
        request.datasource_id, db
    )

    dialect_name = "SQLite" if dialect == "sqlite" else "PostgreSQL"

    prompt = f"""
You are an expert {dialect_name} SQL generator for the data source "{db_label}".

You are working with this database schema:

{schema}

Conversation context (use only when it clarifies follow-up references):
{getattr(request, "history", [])[-5:]}

User question:
{request.question}

Generate a {dialect_name} SQL query that answers the user's question.

Rules:
1. Generate ONLY a single SELECT query.
2. Do not use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE,
   or any other data-changing operation.
3. Use only tables and columns that exist in the provided schema.
4. Return ONLY the SQL query.
5. Do not use markdown code fences.
6. Do not add explanations.

SQL query:
"""

    try:
        sql = generate_text(prompt)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    sql = sql.strip()

    # Remove accidental markdown code fences
    if sql.startswith("```"):
        sql = sql.replace("```sql", "").replace("```sqlite", "").replace("```", "").strip()

    try:
        validated_sql = validate_sql(sql, dialect=dialect)
    except SQLValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    return {
        "status": "success",
        "question": request.question,
        "sql": validated_sql,
        "datasource": db_label,
    }


@router.post("/query")
def query_database(
    request: QueryRequest,
    db: Session = Depends(get_db)
):
    schema, target_engine, dialect, db_label, db_type = _resolve_datasource_context(
        request.datasource_id, db
    )

    if not schema:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Data source '{db_label}' has no discovered tables. Please check the connection or upload data.",
        )

    dialect_name = "SQLite" if dialect == "sqlite" else "PostgreSQL"

    # Ask Gemini to generate SQL
    prompt = f"""
You are an expert {dialect_name} SQL generator for the data source "{db_label}".

Database schema:

{schema}

Conversation context (use only when it clarifies follow-up references):
{request.history[-5:]}

User question:
{request.question}

Generate a {dialect_name} SQL query that answers the question.

Rules:
1. Generate ONLY a single SELECT query.
2. Never generate INSERT, UPDATE, DELETE, DROP, ALTER,
   CREATE, TRUNCATE, or other write operations.
3. Use only tables and columns from the provided schema.
4. Return ONLY SQL.
5. Do not use markdown code fences.
6. Do not explain the query.

SQL:
"""

    try:
        sql = generate_text(prompt).strip()
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Remove markdown code fences if Gemini adds them
    if sql.startswith("```"):
        sql = sql.replace("```sql", "").replace("```sqlite", "").replace("```", "").strip()

    # Validate generated SQL with SQLGlot
    try:
        validated_sql = validate_sql(sql, dialect=dialect)
    except SQLValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Unsafe SQL generated: {str(e)}"
        )

    # Execute as READ ONLY with statement timeout
    try:
        with target_engine.connect() as conn:
            if dialect == "postgres":
                with conn.begin():
                    conn.execute(text("SET TRANSACTION READ ONLY"))
                    conn.execute(text("SET LOCAL statement_timeout = '10s'"))
                    result = conn.execute(text(validated_sql))
                    columns = list(result.keys())
                    rows = [dict(row) for row in result.mappings().fetchmany(MAX_ROWS)]
            else:
                # SQLite execution for CSV/Excel datasets
                result = conn.execute(text(validated_sql))
                columns = list(result.keys())
                rows = [dict(row) for row in result.mappings().fetchmany(MAX_ROWS)]

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Database query failed: {str(e)}"
        )

    # Build a compact agent plan from the validated query/schema.
    lower_sql = validated_sql.lower()
    schema_tables = list(schema.keys()) if isinstance(schema, dict) else []
    tables = [
        t for t in schema_tables
        if f"{t.lower()} " in lower_sql
        or f"{t.lower()}\n" in lower_sql
        or f"{t.lower()}," in lower_sql
        or f'"{t.lower()}"' in lower_sql
    ]
    if not tables:
        tables = [t for t in schema_tables if t.lower() in lower_sql]

    if any(k in lower_sql for k in ["date_trunc", "date(", "strftime", "group by day", "month", "year"]):
        chart_type = "line"
    elif any(k in lower_sql for k in ["percent", "percentage", "share", "proportion"]):
        chart_type = "donut"
    elif len(columns) >= 2 and len(rows) >= 2:
        chart_type = "bar"
    else:
        chart_type = "table"

    # Ask the model to turn the returned data into a short human-readable insight.
    preview = rows[:10]
    insight_prompt = f"""You are an AI data analyst. Give one concise, factual insight from this query result. Do not invent facts. Mention the leading value or trend when obvious.
Question: {request.question}
Data Source: {db_label}
Columns: {columns}
Rows: {preview}
Return only 1-2 sentences."""
    try:
        insight = generate_text(insight_prompt).strip()
    except Exception:
        insight = "The query completed successfully. Review the result table for the returned data."

    plan = [
        f"Analyze intent and metrics on data source '{db_label}'",
        f"Select relevant tables{': ' + ', '.join(tables) if tables else ''} and joins",
        f"Generate and validate safe read-only {dialect_name} SQL",
        "Execute query and synthesize insight and visualization",
    ]

    return {
        "status": "success",
        "question": request.question,
        "datasource": db_label,
        "datasource_id": request.datasource_id,
        "database_type": db_type,
        "sql": validated_sql,
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "tables": tables,
        "insight": insight,
        "chart_type": chart_type,
        "plan": plan,
    }
