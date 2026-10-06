# Campus AI

A placement-information application with a FastAPI backend, React interface, MongoDB storage and retrieval-assisted answers with source citations.

It organizes placement-drive records for exploration and eligibility checks. It does not guarantee eligibility, a job offer or error-free AI answers.

## Main flows

- Dashboard with placement-record statistics and charts.
- Company explorer and individual drive details.
- Eligibility checks using academic scores, branch and backlog inputs.
- Side-by-side drive comparison.
- Retrieval-assisted chat with cited records and streaming responses.
- Document ingestion and structured extraction for placement material.

The frontend routes and backend endpoints implement these flows. Availability depends on configured data, database and model services.

## Stack and architecture

React 18, React Router, Tailwind CSS and Recharts; FastAPI, Pydantic, Motor/MongoDB, NumPy and Google GenAI. The backend supports Gemini generation and an optional NVIDIA API fallback.

```text
React -> FastAPI -> MongoDB records + retrieval
                   -> selected record context -> model -> answer with citations
```

## Run locally

Requirements: Python 3.11+, Node.js/npm and a MongoDB instance for persistent records.

```bash
git clone https://github.com/sagar-grv/Campusai.git
cd Campusai/backend
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a local `backend/.env` with your own values:

```dotenv
MONGO_URL=mongodb://localhost:27017
DB_NAME=campus_ai
CORS_ORIGINS=http://localhost:3000
GEMINI_API_KEY=your_key
ADMIN_USERNAME=your_admin_name
ADMIN_PASSWORD=replace_default
ADMIN_TOKEN=replace_with_random_token
```

Optional NVIDIA settings are `NVIDIA_API_KEY` and `NVIDIA_MODEL`. Keep real keys out of Git. Provider requests may have charges or quotas.

```bash
python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

In another terminal, from the repository root:

```bash
cd frontend
npm ci
npm start
```

Open `http://localhost:3000`. Backend API documentation is at `http://127.0.0.1:8000/docs`. The frontend development proxy targets port 8000.

When MongoDB is unreachable, the backend can fall back to `mongomock_motor`. That is an in-memory development fallback, not persistent production storage. Import suitable records before expecting useful company results.

## Validation

The repository contains backend endpoint/search checks and scripts in `scripts/`. Review their target URLs before running them; some are environment-specific. This documentation audit did not rerun the live model/database workflow.

## Boundaries

- Citations expose retrieved evidence; they do not guarantee every generated statement is correct. Verify important eligibility and compensation details against the original drive notice.
- The existing README reports coverage of 115+ company drives. That is a dataset claim, not placements managed or a guaranteed count in a fresh installation.
- Default admin credentials in source are development placeholders and must be replaced before deployment.
- Model failover is a recovery path, not a zero-downtime promise.
- No product screenshots were found in this checkout. Add real redacted screenshots only after inspecting them.

## Deployment

`vercel.json` and `api/index.py` describe the repository's Vercel route. Supply database, admin and provider settings in the host environment. A successful build does not prove the connected database or AI provider is ready.

## License

[MIT](LICENSE).
