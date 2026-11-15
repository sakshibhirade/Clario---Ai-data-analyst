import os
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...database.connection import get_db
from ...database.models import DataSource
from ...database.dynamic_engine import (
    dispose_engine,
    get_schema_for_datasource,
    preview_table_data,
    test_postgres_connection,
)
from ...services.crypto_service import encrypt_credentials
from ...services.file_dataset_service import process_file_upload

router = APIRouter()

DEFAULT_USER_ID = "default_user"


class TestConnectionRequest(BaseModel):
    connection_name: Optional[str] = "PostgreSQL Database"
    host: str = Field(..., description="PostgreSQL host (e.g. localhost, db.example.com)")
    port: int = Field(5432, ge=1, le=65535)
    database_name: str = Field(..., description="Database name")
    username: str = Field(..., description="PostgreSQL username")
    password: str = Field("", description="PostgreSQL password")
    sslmode: str = Field("prefer", description="SSL mode: disable, require, prefer, verify-ca, verify-full")


class ConnectPostgresRequest(TestConnectionRequest):
    connection_name: str = Field(..., min_length=1, max_length=200)


@router.post("/test-connection")
def test_connection_endpoint(request: TestConnectionRequest):
    """
    Test dynamic PostgreSQL connection without saving credentials.
    Returns discovered tables on success or descriptive error.
    """
    try:
        result = test_postgres_connection(
            host=request.host,
            port=request.port,
            database_name=request.database_name,
            username=request.username,
            password=request.password,
            sslmode=request.sslmode,
            timeout=6,
        )
        return {
            "status": "success",
            "message": result["message"],
            "tables": result["tables"],
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection test failed: {str(e)}",
        )


@router.post("/connect")
def connect_postgres(
    request: ConnectPostgresRequest,
    db: Session = Depends(get_db),
):
    """
    Test credentials, encrypt password, and save data source metadata.
    """
    # 1. Test connection first
    try:
        test_result = test_postgres_connection(
            host=request.host,
            port=request.port,
            database_name=request.database_name,
            username=request.username,
            password=request.password,
            sslmode=request.sslmode,
            timeout=8,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to connect to database: {str(e)}",
        )

    # 2. Encrypt credentials securely
    encrypted = encrypt_credentials({
        "password": request.password,
        "sslmode": request.sslmode,
    })

    # 3. Persist DataSource record
    data_source = DataSource(
        user_id=DEFAULT_USER_ID,
        connection_name=request.connection_name.strip(),
        database_type="postgresql",
        host=request.host.strip(),
        port=request.port,
        database_name=request.database_name.strip(),
        username=request.username.strip(),
        encrypted_credentials=encrypted,
        connection_status="connected",
    )
    db.add(data_source)
    db.commit()
    db.refresh(data_source)

    return {
        "status": "success",
        "message": f"Successfully connected '{request.connection_name}'",
        "datasource": data_source.to_dict(),
        "tables": test_result["tables"],
    }


@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    connection_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Accept CSV or XLSX file, validate, ingest into queryable SQLite, and store metadata.
    """
    try:
        content = await file.read()
        processed = process_file_upload(file, content)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File upload failed: {str(e)}",
        )

    name = (connection_name or file.filename or "Uploaded Dataset").strip()

    data_source = DataSource(
        user_id=DEFAULT_USER_ID,
        connection_name=name,
        database_type=processed["database_type"],
        database_name=processed["filename"],
        file_path=processed["file_path"],
        connection_status="connected",
    )
    db.add(data_source)
    db.commit()
    db.refresh(data_source)

    return {
        "status": "success",
        "message": f"Successfully loaded dataset with {processed['row_count']} rows",
        "datasource": data_source.to_dict(),
        "table_name": processed["table_name"],
        "row_count": processed["row_count"],
        "column_count": processed["column_count"],
        "columns": processed["columns"],
        "preview_rows": processed["preview_rows"],
    }


@router.get("")
def list_datasources(db: Session = Depends(get_db)):
    """List all connected data sources for the current user."""
    sources = db.query(DataSource).filter(
        DataSource.user_id == DEFAULT_USER_ID
    ).order_by(DataSource.created_at.desc()).all()

    items = []
    for s in sources:
        d = s.to_dict()
        # Count tables
        try:
            schema = get_schema_for_datasource(s)
            d["table_count"] = len(schema)
            d["tables"] = list(schema.keys())
        except Exception:
            d["table_count"] = 0
            d["tables"] = []
            d["connection_status"] = "error"
        items.append(d)

    return {
        "status": "success",
        "count": len(items),
        "datasources": items,
    }


@router.get("/{id}/schema")
def get_datasource_schema(id: str, db: Session = Depends(get_db)):
    """Fetch complete tables and columns schema for a specific data source."""
    ds = db.query(DataSource).filter(
        DataSource.id == id,
        DataSource.user_id == DEFAULT_USER_ID
    ).first()

    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    try:
        schema = get_schema_for_datasource(ds)
        return {
            "status": "success",
            "datasource_id": ds.id,
            "connection_name": ds.connection_name,
            "database_type": ds.database_type,
            "schema": schema,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to inspect schema: {str(e)}",
        )


@router.get("/{id}/preview/{table_name}")
def get_datasource_table_preview(
    id: str,
    table_name: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Fetch the first N rows of a specific table for preview in the UI."""
    ds = db.query(DataSource).filter(
        DataSource.id == id,
        DataSource.user_id == DEFAULT_USER_ID
    ).first()

    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    try:
        preview = preview_table_data(ds, table_name, limit=min(limit, 50))
        return {
            "status": "success",
            "datasource_id": ds.id,
            **preview,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to preview table data: {str(e)}",
        )


@router.delete("/{id}")
def delete_datasource(id: str, db: Session = Depends(get_db)):
    """Disconnect and delete a data source and dispose of its engine."""
    ds = db.query(DataSource).filter(
        DataSource.id == id,
        DataSource.user_id == DEFAULT_USER_ID
    ).first()

    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    # 1. Dispose engine cache
    dispose_engine(ds.id)

    # 2. If it has an uploaded SQLite file, remove it
    if ds.file_path and os.path.exists(ds.file_path):
        try:
            os.remove(ds.file_path)
        except Exception:
            pass

    # 3. Delete from database
    db.delete(ds)
    db.commit()

    return {
        "status": "success",
        "message": f"Data source '{ds.connection_name}' disconnected successfully",
    }
