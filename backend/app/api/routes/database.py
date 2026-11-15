from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...database.connection import get_db
from ...database.schema_service import get_database_schema


router = APIRouter()


@router.get("/test")
def test_database(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT version()"))
    version = result.scalar()

    return {
        "status": "connected",
        "database": "PostgreSQL",
        "version": version
    }


@router.get("/schema")
def database_schema():
    return {
        "database": "ai_data_analyst",
        "schema": get_database_schema()
    }