# Clario AI Data Analyst

## Run locally

1. Start PostgreSQL and create the database configured in `backend/.env`.
2. Copy `backend/.env.example` to `backend/.env` and add your own credentials/API key.
3. From `backend/`: `python -m venv .venv`, activate it, then `pip install -r requirements.txt`.
4. Start API: `uvicorn app.main:app --reload --port 8000`.
5. From `frontend/`: `npm install` and `npm run dev`.
6. Optional: copy `.env.example` to `.env` if your API is not on port 8000.

The UI uses the real `/api/ai/query` endpoint. The agent validates generated SQL and executes it in a read-only transaction with a statement timeout.
