from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.ai import router as ai_router
from .api.routes.auth import router as auth_router, ensure_demo_user
from .api.routes.database import router as database_router
from .api.routes.datasources import router as datasources_router
from .api.routes.insights import router as insights_router
from .database.connection import init_db, SessionLocal


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize internal tables on startup
    init_db()
    try:
        db = SessionLocal()
        ensure_demo_user(db)
        db.close()
    except Exception as e:
        print(f"Demo user init notice: {e}")
    yield


app = FastAPI(
    title="AI Data Analyst",
    description="AI-powered natural language data analysis with dynamic database connections and automated Insight Engine",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    auth_router,
    prefix="/api/auth",
    tags=["Authentication"]
)
app.include_router(
    database_router,
    prefix="/api/database",
    tags=["Database"]
)
app.include_router(
    datasources_router,
    prefix="/api/datasources",
    tags=["Data Sources"]
)
app.include_router(
    insights_router,
    prefix="/api/insights",
    tags=["Insight Engine"]
)
app.include_router(
    ai_router,
    prefix="/api/ai",
    tags=["AI"]
)


@app.get("/")
def root():
    return {
        "message": "AI Data Analyst API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/api/status")
def status():
    """Used by the UI to show whether the API, database and model are reachable."""
    from sqlalchemy import text
    from .database.connection import engine

    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {"api": True, "database": db_ok, "ai": True}
