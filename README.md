# Clario — AI Data Analyst & Insight Engine Platform

A modern conversational data analyst and automated business intelligence platform. Connect external PostgreSQL databases or upload CSV / Excel spreadsheets, ask questions in natural language, or use the **Clario Insight Engine** to automatically profile data, detect statistical anomalies, map trend trajectories, and receive actionable business recommendations.

## Architecture

User → React/Vite UI → FastAPI → Gemini → SQLGlot Guardrails → Dynamic Data Source (PostgreSQL / CSV / Excel) [READ ONLY] → Result Analysis / Automated Insight Engine → Visualization & Business Actions

## Core Features

### 1. Clario Insight Engine (Automated Analytics & Anomaly Detection)
- **Automatic Data Profiling**: Generic inspection across all tables; categorizes columns into numerical, categorical, and temporal data without making assumptions about table schemas.
- **Statistical Anomaly Detection**:
  - **IQR & Z-Score Outlier Detection**: Identifies spikes and drops deviating beyond quartile fences ($Q_3 + 1.5\text{IQR}$) or $>2.5\sigma$.
  - **Data Quality Anomalies**: Detects elevated null/missing rates ($> 20\%$).
  - **Distribution Skew Detection**: Flags heavy concentration risks where a single category accounts for $\ge 65\%$ of volume.
- **Trend & Trajectory Analysis**:
  - Time-series period-over-period momentum and growth/decline rates.
  - Category comparison rankings and segment contribution multipliers.
- **Gemini-Grounded Synthesis**:
  - Executive dataset summary.
  - Factual business explanations strictly grounded in computed statistics.
  - Practical, next-step recommendations.
  - Transparent notification when historical sample sizes are limited.
- **Interactive "Ask AI" Handoff**: Transition directly from any insight card into the AI conversational analyst to probe deeper.
- **Insight Review & Status Tracking**: Mark insights as Reviewed, Saved, or Dismissed.

### 2. Dynamic Data Sources
- Connect external PostgreSQL databases with connection wizard and live "Test Connection" validation.
- Upload CSV and Excel (.xlsx) spreadsheets; automatically parsed and ingested into queryable datasets.
- Switch active data source with one click in the top toolbar.
- Inspect tables, column schemas, types, and preview the first 20 rows of any dataset.
- Encrypted credential storage (Fernet symmetric encryption) and safe engine lifecycle management.

### 3. Conversational AI Analyst
- Real frontend → FastAPI → database execution flow.
- Think → Decide → Act execution trail.
- Context-aware follow-up queries.
- Schema-aware SQL generation tailored to the active database.
- SQL parsing and single-statement validation via SQLGlot.
- Safe read-only transactions with query timeouts (10s limit).
- AI-generated insights explaining data trends and key takeaways.
- Automatic bar/line/donut visualization selection.
- SQL viewer with copy button and CSV export.
- Interactive Three.js 3D agent robot with emotional response states.

---

## API Endpoints

### Insight Engine Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/insights/analyze` | Triggers profiling, statistical anomaly detection, trend analysis & Gemini synthesis |
| `GET` | `/api/insights` | Retrieves the latest report and items for the active data source with optional filters |
| `GET` | `/api/insights/{id}` | Fetches full insight details, statistical evidence, and sample underlying rows |
| `POST` | `/api/insights/{id}/ask` | Prepares context and suggested questions for the AI conversational chat agent |
| `PATCH` | `/api/insights/{id}/status` | Updates insight status (`new`, `reviewed`, `saved`, `dismissed`) |

### Data Sources Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/datasources/test-connection` | Validates host/credentials without persisting, returns discovered tables |
| `POST` | `/api/datasources/connect` | Validates credentials, encrypts password with Fernet, and saves data source |
| `POST` | `/api/datasources/upload` | Ingests CSV or XLSX files into an isolated queryable dataset with preview |
| `GET` | `/api/datasources` | Lists connected data sources with status and discovered table counts |
| `GET` | `/api/datasources/{id}/schema` | Retrieves full tables and column schemas for a data source |
| `GET` | `/api/datasources/{id}/preview/{table}` | Previews the first 20 rows of a table |
| `DELETE` | `/api/datasources/{id}` | Disposes engine, cleans up uploaded files, and deletes data source |
| `POST` | `/api/ai/query` | Generates validated SQL, executes read-only on the active data source, returns insight & chart |

---

## Statistical Methods Implemented

- **Interquartile Range (IQR)**: Used for outlier detection across numerical metrics ($Q_1, Q_3, \text{IQR} = Q_3 - Q_1$). Flags extreme upper outliers exceeding $Q_3 + 2.5\text{IQR}$.
- **Z-Score & Variance**: Computes mean ($\mu$) and standard deviation ($\sigma$) across numerical samples to measure relative deviations.
- **Period-over-Period Percentage Change**: Tracks trajectory momentum between initial, prior, and latest time periods ($\Delta\% = \frac{v_t - v_{t-1}}{v_{t-1}} \times 100$).
- **Frequency Distribution Skew**: Calculates category shares against balanced theoretical baselines ($100\% / K$) to detect customer or operational concentration risk.
- **Completeness Ratio**: Measures null/missing value percentages against a data quality threshold ($5.0\%$).

---

## Security & Safety Layers

1. **Credential Protection**: Passwords are encrypted on the server using AES/Fernet encryption (`ENCRYPTION_KEY`). Passwords are never stored in plaintext and never echoed back in API responses or frontend logs.
2. **SSRF Guardrail**: Target hosts are validated to prevent connections to private cloud metadata endpoints (e.g., `169.254.169.254`).
3. **SQLGlot AST Parsing**: Validates that all queries are single-statement `SELECT` operations. Blocks `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, and dangerous functions (`pg_sleep`, `pg_read_file`, etc.).
4. **Read-Only Transaction Isolation**: PostgreSQL queries run within an explicit `SET TRANSACTION READ ONLY` session with `statement_timeout = '10s'`.
5. **Resource Limits**: Results are hard-capped at 2,000 rows to ensure responsive browser rendering.
6. **File Upload Security**: Uploaded CSV and XLSX files are validated, size-checked (max 25MB), and converted into isolated SQLite datasets without executing file contents.

---

## Setup Instructions

### 1. Database

**Option A — Docker (fastest):**
```bash
docker compose up -d
```

**Option B — your own PostgreSQL:** configure connection string in `backend/.env`.

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Configure `backend/.env`:
```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/ai_data_analyst
GEMINI_API_KEY=your_gemini_api_key_here
# Optional: override model (default: gemini-3.6-flash)
# GEMINI_MODEL=gemini-3.6-flash
# Optional: server-side credential encryption key (auto-generated if omitted)
# ENCRYPTION_KEY=your_fernet_key_here
```

Run the backend:
```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.
