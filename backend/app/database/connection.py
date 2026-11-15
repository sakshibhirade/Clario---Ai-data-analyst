import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Robustly find .env relative to this file
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
if _ENV_FILE.exists():
    load_dotenv(dotenv_path=_ENV_FILE)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def init_db():
    """Ensure internal database tables such as data_sources are created."""
    from .models import Base
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Notice: init_db could not connect to internal database: {e}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
