"""
Campus AI - FastAPI backend
- College Query Assistant (RAG, grounded on placement DB)
- Resume vs JD Gap Analysis
- Interview Prep generator
"""
import os
import io
import json
import uuid
import asyncio
import secrets
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pypdf import PdfReader
from docx import Document as DocxDocument

from gemini_client import GeminiClient, EMBED_DIM
from security import (
    rate_limiter,
    check_prompt_injection,
    check_domain_scope,
    sanitize_log_message,
    STRICT_SYSTEM_GUARDRAILS,
    PER_ENDPOINT_LIMITS,
)
from ingest.parser import parse_placement_pdf
from data.verified_seed import load_verified_seed, SEED_VERSION
from data.branches import normalize_branches, matches_allowed, canonical_for_tags

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "campus_ai")
CORS = os.environ.get("CORS_ORIGINS", "*")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change_me")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "change_me_to_a_long_random_string")

mongo: Optional[AsyncIOMotorClient] = None
db = None
gemini: Optional[GeminiClient] = None
DB_MODE = "mock"
_embed_mutex = asyncio.Lock()


# ---------- utilities ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def chunk_text(text: str, size: int = 600, overlap: int = 80) -> List[str]:
    text = " ".join(text.split())
    if len(text) <= size:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap
    return chunks


def cosine(a: List[float], b: List[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    return float(np.dot(va, vb))  # both unit-normalised upstream


# ---------- usage tracking & admin auth ----------
async def record_usage(event: str, client_ip: str = None, visitor_id: str = None, **payload):
    """Fire-and-forget usage event recorder. Never raises."""
    try:
        if db is None:
            return
        await db.usage.insert_one({
            "event": event,
            "client_ip": client_ip,
            "visitor_id": visitor_id,
            "ts": now_iso(),
            **payload,
        })
    except Exception as e:
        print(f"[usage] could not record {event}: {sanitize_log_message(str(e))}")


def _visitor_id(request: Request, client_ip: str) -> str:
    return request.headers.get("X-Visitor-Id") or client_ip


def _db_mode() -> str:
    return DB_MODE


def require_admin(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    expected = f"Bearer {ADMIN_TOKEN}"
    if not secrets.compare_digest(auth, expected):
        raise HTTPException(401, "Invalid or missing admin token.")


# ---------- data models ----------
class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=6, ge=1, le=12)
    session_id: Optional[str] = None
    stream: bool = False


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    grounded: bool
    session_id: str
    matched_companies: Optional[List[dict]] = None


class GapAnalysisRequest(BaseModel):
    resume_text: str = Field(min_length=10, max_length=15000)
    job_description: str = Field(min_length=10, max_length=15000)


class GapAnalysisResponse(BaseModel):
    match_score: int
    matched_skills: List[str]
    missing_skills: List[str]
    improvements: List[str]
    summary: str


class InterviewPrepRequest(BaseModel):
    job_description: str = Field(min_length=20, max_length=10000)
    missing_skills: Optional[List[str]] = None
    num_questions: int = Field(default=8, ge=3, le=15)


class InterviewPrepResponse(BaseModel):
    technical: List[dict]  # {question, why_asked, hint}
    behavioral: List[dict]


class EligibilityRequest(BaseModel):
    cgpa: float = Field(ge=0.0, le=10.0, default=7.0)
    branch: str = Field(default="CS")
    tenth_pct: float = Field(ge=0.0, le=100.0, default=75.0)
    twelfth_pct: float = Field(ge=0.0, le=100.0, default=75.0)
    has_backlog: bool = Field(default=False)
    batch: Optional[str] = None  # "2025", "2023-24", or None for all


class CompareRequest(BaseModel):
    company_ids: List[str] = Field(min_items=1, max_items=4)


class AdminLogin(BaseModel):
    username: str
    password: str


# ---------- resume parsing ----------
def parse_resume(filename: str, content: bytes) -> str:
    fn = filename.lower()
    if fn.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            raise HTTPException(400, f"Could not read PDF: {e}")
    if fn.endswith(".docx"):
        try:
            doc = DocxDocument(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            raise HTTPException(400, f"Could not read DOCX: {e}")
    if fn.endswith(".txt"):
        return content.decode("utf-8", errors="ignore")
    raise HTTPException(400, "Unsupported file. Use PDF, DOCX, or TXT.")


# ---------- initialization ----------
async def ensure_initialized():
    global mongo, db, gemini, DB_MODE
    if gemini is None:
        try:
            gemini = GeminiClient()
        except Exception as e:
            print(f"[gemini] init error: {e}")
    if db is None or mongo is None:
        try:
            real_mongo = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
            await real_mongo.admin.command("ping")
            mongo = real_mongo
            DB_MODE = "real"
            print("[db] Connected to real MongoDB instance.")
        except Exception as e:
            print(f"[db] Real MongoDB unavailable ({e}), using in-memory mongomock_motor client.")
            try:
                from mongomock_motor import AsyncMongoMockClient
                mongo = AsyncMongoMockClient()
                DB_MODE = "mock"
            except Exception as e2:
                print(f"[db] mongomock_motor fallback error: {e2}")
                mongo = None
        if mongo:
            db = mongo[DB_NAME]
    if db is not None:
        try:
            await _seed_verified_data()
        except Exception as e:
            print(f"[db] verified-seed error: {sanitize_log_message(str(e))}")


def _build_records_documents(all_records: list) -> list:
    """Build RAG chunk documents for a list of company records (shared by ingest + seed)."""
    documents = []
    for rec in all_records:
        parts = [f"Company: {rec.get('company') or 'Unknown'}"]
        if rec.get("batch"):
            parts.append(f"Batch: {rec['batch']}")
        if rec.get("ctc"):
            parts.append(f"CTC / Package: {rec['ctc']}")
        if rec.get("role"):
            parts.append(f"Role(s): {rec['role']}")
        if rec.get("branches"):
            parts.append(f"Eligible branches: {rec['branches']}")
        if rec.get("cgpa"):
            parts.append(f"Minimum CGPA / Percentage: {rec['cgpa']}")
        if rec.get("eligibility"):
            parts.append(f"Eligibility criteria: {rec['eligibility']}")
        if rec.get("mode"):
            parts.append(f"Mode: {rec['mode']}")
        if rec.get("date"):
            parts.append(f"Drive date: {rec['date']}")
        if rec.get("notes"):
            parts.append(f"Process / Notes: {rec['notes']}")
        documents.append({
            "id": str(uuid.uuid4()),
            "text": ". ".join(parts) + ".",
            "source": f"{rec.get('source_file', 'placement_db')}::{rec.get('company') or 'Unknown'}",
            "type": "placement",
            "company_data": rec,
            "created_at": now_iso(),
        })
    return documents


async def _seed_verified_data():
    """Load the verified (agentic-extracted) placement dataset when missing or outdated.

    The regex/pdfplumber parser produces wrong CTCs for several companies because
    the PDF text layer is corrupted (e.g. Winjit "receivabl9e. 30 LPA"). The verified
    dataset is the source of truth; the parser now only handles genuinely new uploads.

    Embeddings are stored together with the records when Gemini is available. If the
    embed step fails (quota / not configured) the marker records `embedded: false`, and
    later boots retry embedding in place instead of re-seeding from scratch.
    """
    global _embed_mutex
    marker = {}
    try:
        marker = await db.meta.find_one({"_id": "placement_seed"}) or {}
    except Exception:
        pass

    # Already seeded: only re-embed if vectors are missing and Gemini became ready.
    if marker.get("seed") == SEED_VERSION:
        if marker.get("embedded"):
            return
        if gemini and gemini.ready:
            async with _embed_mutex:
                marker = await db.meta.find_one({"_id": "placement_seed"}) or {}
                if marker.get("seed") == SEED_VERSION and not marker.get("embedded"):
                    await _embed_existing_chunks()
        return
    if marker.get("seed") == "pdf-ingest":
        return

    seed_records = load_verified_seed()
    for rec in seed_records:
        rec["branches_canonical"] = normalize_branches(rec.get("branches") or "")

    async with _embed_mutex:
        # Re-check under the lock in case a concurrent worker seeded first.
        marker = await db.meta.find_one({"_id": "placement_seed"}) or {}
        if marker.get("seed") == SEED_VERSION or marker.get("seed") == "pdf-ingest":
            return
        await db.companies.delete_many({})
        await db.chunks.delete_many({})

        documents = _build_records_documents(seed_records)
        embedded = False
        if gemini and gemini.ready:
            try:
                vectors = await gemini.embed_many([d["text"] for d in documents], task_type="RETRIEVAL_DOCUMENT")
                for doc, vec in zip(documents, vectors):
                    doc["embedding"] = vec
                    doc["embedding_dim"] = len(vec)
                embedded = True
            except Exception as e:
                print(f"[seed] embedding skipped ({sanitize_log_message(str(e))}); storing without vectors.")
        else:
            print("[seed] Gemini not ready; storing verified records without embeddings.")

        if seed_records:
            await db.companies.insert_many(seed_records, ordered=False)
        if documents:
            await db.chunks.insert_many(documents)
        await db.meta.update_one(
            {"_id": "placement_seed"},
            {"$set": {"seed": SEED_VERSION, "at": now_iso(), "n": len(seed_records),
                      "chunks": len(documents), "embedded": embedded}},
            upsert=True,
        )
        print(f"[seed] Seeded verified dataset: {len(seed_records)} companies, {len(documents)} chunks "
              f"(embedded={embedded}).")


async def _embed_existing_chunks():
    """Fill missing embeddings for already-seeded chunks (post-quota recovery)."""
    try:
        docs = await db.chunks.find(
            {"type": "placement", "embedding": {"$exists": False}},
            {"text": 1},
        ).to_list(length=10000)
        pending = [d["text"] for d in docs if d.get("text")]
        if not pending:
            await db.meta.update_one({"_id": "placement_seed"}, {"$set": {"embedded": True}})
            print("[seed] No missing embeddings found; marked embedded.")
            return
        vectors = await gemini.embed_many(pending, task_type="RETRIEVAL_DOCUMENT")
        for doc, vec in zip(docs, vectors):
            await db.chunks.update_one(
                {"_id": doc["_id"]},
                {"$set": {"embedding": vec, "embedding_dim": len(vec)}},
            )
        await db.meta.update_one({"_id": "placement_seed"}, {"$set": {"embedded": True}})
        print(f"[seed] Backfilled embeddings for {len(pending)} chunks.")
    except Exception as e:
        print(f"[seed] embedding backfill failed ({sanitize_log_message(str(e))}); will retry next boot.")


# ---------- lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_initialized()
    yield
    if mongo:
        try:
            mongo.close()
        except Exception:
            pass



app = FastAPI(title="Campus AI", lifespan=lifespan)
handler = app
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS.split(",")] if CORS != "*" else ["*"],
    allow_credentials=CORS != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- routes ----------
@app.get("/api/health")
async def health():
    await ensure_initialized()
    ok = True
    try:
        if mongo and hasattr(mongo, "admin"):
            await mongo.admin.command("ping")
    except Exception:
        ok = False
    seed = None
    if db is not None:
        try:
            seed = await db.meta.find_one({"_id": "placement_seed"})
        except Exception:
            pass
    return {
        "ok": ok,
        "chat_model": os.environ.get("CHAT_MODEL", "gemini-2.5-flash"),
        "embed_model": os.environ.get("EMBED_MODEL", "gemini-embedding-001"),
        "gemini_ready": gemini is not None and (gemini.ready or bool(os.environ.get("NVIDIA_API_KEY"))),
        "companies_seeded": bool(seed),
    }


# ---------- admin ----------
@app.post("/api/admin/login")
async def admin_login(body: AdminLogin):
    ok_user = secrets.compare_digest(str(body.username or ""), ADMIN_USERNAME)
    ok_pass = secrets.compare_digest(str(body.password or ""), ADMIN_PASSWORD)
    if not (ok_user and ok_pass):
        raise HTTPException(401, "Invalid credentials.")
    return {
        "token": ADMIN_TOKEN,
        "status_db": _db_mode(),
        "gemini_ready": gemini is not None and (gemini.ready or bool(os.environ.get("NVIDIA_API_KEY"))),
    }


@app.get("/api/admin/usage", dependencies=[Depends(require_admin)])
async def admin_usage():
    await ensure_initialized()
    from collections import Counter
    from datetime import datetime, timezone, timedelta
    all_rows = await db.usage.find({}, {"_id": 0}).to_list(length=100000)

    total_requests = len(all_rows)
    visitors = {(r.get("visitor_id") or r.get("client_ip")) for r in all_rows if (r.get("visitor_id") or r.get("client_ip"))}
    ips = {r.get("client_ip") for r in all_rows if r.get("client_ip")}

    per_endpoint = Counter(r.get("event") or "unknown" for r in all_rows)
    top_questions = Counter((r.get("question") or "")[:200] for r in all_rows if r.get("question"))
    top_companies = Counter()
    for r in all_rows:
        for c in (r.get("matched_companies") or []):
            if c:
                top_companies[str(c)] += 1

    today = datetime.now(timezone.utc).date()
    day_list = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    days = Counter((r.get("ts") or "")[:10] for r in all_rows)

    recent = sorted(all_rows, key=lambda r: str(r.get("ts") or ""), reverse=True)[:15]

    return {
        "total_requests": total_requests,
        "unique_visitors": len(visitors),
        "unique_ips": len(ips),
        "per_endpoint": [{"event": e, "count": n} for e, n in per_endpoint.most_common()],
        "daily": [{"date": d, "count": days.get(d, 0)} for d in day_list],
        "top_questions": [{"question": q, "count": n} for q, n in top_questions.most_common(8)],
        "top_companies": [{"company": c, "count": n} for c, n in top_companies.most_common(8)],
        "recent": [
            {"event": r.get("event"), "ts": r.get("ts"), "visitor_id": r.get("visitor_id")}
            for r in recent
        ],
    }


@app.get("/api/admin/status", dependencies=[Depends(require_admin)])
async def admin_status():
    await ensure_initialized()
    companies_count = await db.companies.count_documents({}) if db else 0
    chunks_count = await db.chunks.count_documents({}) if db else 0
    last_ingest = None
    if db is not None:
        marker = await db.meta.find_one({"_id": "placement_seed"})
        if marker:
            last_ingest = {k: v for k, v in marker.items() if k != "_id"}
    return {
        "db_mode": _db_mode(),
        "gemini_ready": gemini is not None and (gemini.ready or bool(os.environ.get("NVIDIA_API_KEY"))),
        "chat_model": os.environ.get("CHAT_MODEL", "gemini-2.5-flash"),
        "embed_model": os.environ.get("EMBED_MODEL", "gemini-embedding-001"),
        "companies_count": companies_count,
        "chunks_count": chunks_count,
        "last_ingest": last_ingest,
        "rate_limits": PER_ENDPOINT_LIMITS,
        "version": 3,
    }


# ---------- pdf ingestion ----------
KNOWN_SEED_FILES = ("Company Database for 2025 batch", "Company Database 2023-24")


async def _llm_clean_records(records: list) -> list:
    """Pass parser output through Gemini to repair text that pdfplumber mangles.

    The 2025 PDF's text layer is corrupted (e.g. Winjit "receivabl9e. 30 LPA"),
    so regex extraction can read wrong numbers. We ask the LLM to re-derive the
    numeric CTC and branch list from the *raw* strings only, and forbid it from
    inventing values. On any failure (quota, timing out) we keep parser values.
    """
    if not records or not gemini or not gemini.ready:
        return records

    try:
        payload = []
        for i, r in enumerate(records):
            payload.append({
                "idx": i,
                "company": r.get("company") or "",
                "role": r.get("role") or "",
                "ctc": r.get("ctc") or "",
                "branches": r.get("branches") or "",
                "eligibility": r.get("eligibility") or "",
            })
        system = (
            "You repair OCR-corrupted college placement data. You are given a list of "
            "records with RAW text that may contain garbled characters. For each record: "
            "1) ctc_lpa: a single number in LPA derived ONLY from its raw text. Keep it a "
            "valid float or null. Handle stipends (per month -> annualized), joining bonuses "
            "(add to CTC), and garbled digits (e.g. 'receivabl9e. 30 LPA' means the package "
            "nearby, never the corrupted digit run). 2) ctc: a clean one-line display string. "
            "3) branches: a clean comma-separated branch string (use standard tags like CS, IT, "
            "EXTC, MECH, CIVIL, MCA, AI, DS, CSBS, MXTC, CYBER). 4) eligibility: cleaned text. "
            "NEVER invent a CTC or branch that is not present in the raw text; if ambiguous, "
            "set ctc_lpa to null. Reply ONLY with a JSON array [{\"idx\":..., \"ctc_lpa\":..., "
            "\"ctc\":..., \"branches\":..., \"eligibility\":...}]."
        )
        prompt = f"RAW RECORDS:\n{json.dumps(payload, ensure_ascii=False)}"
        raw = await gemini.generate(system=system, prompt=prompt, temperature=0.0, max_tokens=8000)
        cleaned = json.loads(_strip_fence(raw))
        if not isinstance(cleaned, list):
            return records
        for fix in cleaned:
            i = int(fix.get("idx", -1))
            if not (0 <= i < len(records)):
                continue
            r = records[i]
            if fix.get("ctc_lpa") is not None:
                try:
                    v = float(fix["ctc_lpa"])
                    if 0 < v <= 60:
                        r["ctc_lpa"] = round(v, 2)
                except (TypeError, ValueError):
                    pass
            if fix.get("ctc"):
                r["ctc"] = str(fix["ctc"]).strip()
            if fix.get("branches"):
                r["branches"] = str(fix["branches"]).strip()
                r["branches_canonical"] = normalize_branches(r["branches"])
            if fix.get("eligibility"):
                r["eligibility"] = str(fix["eligibility"]).strip()
        print(f"[ingest] LLM clean pass applied to {len(records)} records.")
    except Exception as e:
        print(f"[ingest] LLM clean pass skipped ({sanitize_log_message(str(e))}); using parser values.")
    return records


def _strip_fence(raw: str) -> str:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    return raw.strip()


@app.post("/api/ingest", dependencies=[Depends(require_admin)])
async def ingest_placement_pdf(
    files: List[UploadFile] = File(...),
    batch: str = Form(""),
    wipe: bool = Form(True),
    request: Request = None,
):
    await ensure_initialized()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["ingest"])

    if not gemini or not gemini.ready:
        raise HTTPException(503, "GEMINI_API_KEY is not configured.")
    if not files:
        raise HTTPException(400, "At least one PDF file is required.")

    per_file = []
    all_records = []
    for f in files:
        content = await f.read()
        filename = f.filename or "upload.pdf"
        is_known = any(k.lower() in filename.lower() for k in KNOWN_SEED_FILES)
        if is_known:
            seed_records = load_verified_seed()
            matched = [dict(r) for r in seed_records if (r.get("source_file") or "").lower() in filename.lower()]
            if matched:
                result = {"file": filename, "parsed_count": len(matched), "expected_sr_max": len(matched)}
                per_file.append({
                    "file": filename,
                    "records": len(matched),
                    "expected_sr_max": len(matched),
                    "verified": True,
                })
                all_records.extend(matched)
                continue
        try:
            result = parse_placement_pdf(io.BytesIO(content), source_file_name=filename, batch_override=batch)
        except ValueError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            raise HTTPException(400, f"Could not parse {filename} as a placement PDF: {sanitize_log_message(str(e))}")
        per_file.append({
            "file": result["file"],
            "records": result["parsed_count"],
            "expected_sr_max": result["expected_sr_max"],
            "verified": is_known,
        })
        all_records.extend(result["records"])

    # For genuinely new PDFs, run an LLM clean pass to repair garbled text.
    await _llm_clean_records(all_records)

    if wipe:
        await db.companies.delete_many({})
        await db.chunks.delete_many({})
        await db.meta.delete_one({"_id": "placement_seed"})

    for rec in all_records:
        rec["branches_canonical"] = normalize_branches(rec.get("branches") or "")

    documents = _build_records_documents(all_records)

    print(f"[ingest] Embedding {len(documents)} placement records via Gemini...")
    vectors = await gemini.embed_many([d["text"] for d in documents], task_type="RETRIEVAL_DOCUMENT")
    for doc, vec in zip(documents, vectors):
        doc["embedding"] = vec
        doc["embedding_dim"] = len(vec)

    if all_records:
        await db.companies.insert_many(all_records)
    if documents:
        await db.chunks.insert_many(documents)

    await db.meta.update_one(
        {"_id": "placement_seed"},
        {"$set": {"at": now_iso(), "n": len(all_records), "version": 3, "mode": "pdf-ingest", "seed": "pdf-ingest"}},
        upsert=True,
    )
    print(f"[ingest] Done. {len(all_records)} companies, {len(documents)} chunks.")

    return {
        "files_processed": len(per_file),
        "companies_inserted": len(all_records),
        "chunks_embedded": len(documents),
        "source_files": [p["file"] for p in per_file],
        "per_file": per_file,
    }


def batch_of(doc: dict) -> str:
    src = str(doc.get("source_file") or "")
    if "2023" in src:
        return "2023-24"
    if "2025" in src:
        return "2025"
    batch_val = str(doc.get("batch") or "").strip()
    if batch_val in ("2023-24", "2025"):
        return batch_val
    return "Other"


@app.get("/api/companies")
async def list_companies(
    q: str = "",
    batch: str = "",
    branch: str = "",
    min_ctc: float = 0.0,
    sort: str = "",
    page: int = 1,
    page_size: int = 25,
    request: Request = None,
):
    await ensure_initialized()
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    cursor = db.companies.find({}, {"_id": 0})
    docs = await cursor.to_list(length=1000)
    if q:
        ql = q.lower()
        docs = [d for d in docs if any(
            ql in str(d.get(k, "")).lower() for k in ("company", "role", "branches", "eligibility")
        )]
    if batch:
        docs = [d for d in docs if batch_of(d) == batch]
    if branch:
        docs = [d for d in docs if matches_allowed(
            str(d.get("branches_canonical") or normalize_branches(d.get("branches") or "") or ""),
            canonical_for_tags([branch]),
        )]
    if min_ctc and min_ctc > 0:
        docs = [d for d in docs if (_ctc_value(d) or 0) >= min_ctc]
    if sort == "ctc_desc":
        docs.sort(key=lambda x: _ctc_value(x) or 0, reverse=True)
    elif sort == "ctc_asc":
        docs.sort(key=lambda x: _ctc_value(x) or 0)
    elif sort in ("name", "name_asc"):
        docs.sort(key=lambda x: str(x.get("company") or "").lower())
    total = len(docs)
    start = (page - 1) * page_size
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    asyncio.create_task(record_usage("companies_view", client_ip, _visitor_id(request, client_ip)))
    return {"companies": docs[start:start + page_size], "total": total, "page": page, "page_size": page_size}


@app.get("/api/companies/stats")
async def companies_stats():
    await ensure_initialized()
    total = await db.companies.count_documents({})
    ctc_values = []
    by_batch = {}
    top_recruiters = {}
    top_roles = {}
    async for c in db.companies.find({}, {"ctc": 1, "ctc_lpa": 1, "role": 1, "company": 1, "source_file": 1, "_id": 0}):
        v = _ctc_value(c)
        if v is not None:
            ctc_values.append(v)
        b = batch_of(c)
        by_batch[b] = by_batch.get(b, 0) + 1
        name = str(c.get("company") or "").strip()
        if name:
            top_recruiters[name] = top_recruiters.get(name, 0) + 1
        r = (c.get("role") or "").split(",")[0].strip()[:40]
        if r:
            top_roles[r] = top_roles.get(r, 0) + 1
    top_roles_sorted = sorted(top_roles.items(), key=lambda x: -x[1])[:6]
    top_recruiters_sorted = sorted(top_recruiters.items(), key=lambda x: -x[1])[:8]
    return {
        "total_companies": total,
        "avg_ctc_lpa": round(sum(ctc_values) / len(ctc_values), 2) if ctc_values else 0,
        "max_ctc_lpa": round(max(ctc_values), 2) if ctc_values else 0,
        "by_batch": [{"batch": b, "count": n} for b, n in sorted(by_batch.items())],
        "top_recruiters": [{"company": c, "count": n} for c, n in top_recruiters_sorted],
        "top_roles": [{"role": r, "count": n} for r, n in top_roles_sorted],
    }


@app.get("/api/dashboard")
async def dashboard_stats(request: Request = None):
    await ensure_initialized()
    total = await db.companies.count_documents({})
    ctc_values = []
    ctc_buckets = {"0-5": 0, "5-10": 0, "10-15": 0, "15-20": 0, "20+": 0}
    by_batch = {}
    top_recruiters = {}
    top_roles = {}
    branch_counts = {}
    async for c in db.companies.find({}, {"ctc": 1, "ctc_lpa": 1, "role": 1, "company": 1, "source_file": 1, "branches": 1, "branches_canonical": 1, "_id": 0}):
        v = _ctc_value(c)
        if v is not None:
            ctc_values.append(v)
            if v < 5:
                ctc_buckets["0-5"] += 1
            elif v < 10:
                ctc_buckets["5-10"] += 1
            elif v < 15:
                ctc_buckets["10-15"] += 1
            elif v < 20:
                ctc_buckets["15-20"] += 1
            else:
                ctc_buckets["20+"] += 1
        b = batch_of(c)
        by_batch[b] = by_batch.get(b, 0) + 1
        name = str(c.get("company") or "").strip()
        if name:
            top_recruiters[name] = top_recruiters.get(name, 0) + 1
        r = (c.get("role") or "").split(",")[0].strip()[:40]
        if r:
            top_roles[r] = top_roles.get(r, 0) + 1
        canon = str(c.get("branches_canonical") or normalize_branches(c.get("branches") or "") or "")
        if canon and canon != "ALL":
            for tag in canon.split(","):
                tag = tag.strip()
                if tag:
                    branch_counts[tag] = branch_counts.get(tag, 0) + 1
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    asyncio.create_task(record_usage("dashboard", client_ip, _visitor_id(request, client_ip)))
    return {
        "total_companies": total,
        "avg_ctc_lpa": round(sum(ctc_values) / len(ctc_values), 2) if ctc_values else 0,
        "max_ctc_lpa": round(max(ctc_values), 2) if ctc_values else 0,
        "by_batch": [{"batch": b, "count": n} for b, n in sorted(by_batch.items())],
        "top_recruiters": [{"company": c, "count": n} for c, n in sorted(top_recruiters.items(), key=lambda x: -x[1])[:8]],
        "top_roles": [{"role": r, "count": n} for r, n in sorted(top_roles.items(), key=lambda x: -x[1])[:6]],
        "ctc_buckets": [{"range": k, "count": v} for k, v in ctc_buckets.items()],
        "branch_coverage": [{"branch": b, "count": n} for b, n in sorted(branch_counts.items(), key=lambda x: -x[1])[:6]],
    }


@app.get("/api/stats")
async def stats():
    return await companies_stats()


@app.get("/api/companies/{company_id}")
async def get_company(company_id: str):
    await ensure_initialized()
    doc = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not doc:
        doc = await db.companies.find_one({"company": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Company not found.")
    return doc


NO_ANSWER_TEXT = (
    "I don't have enough information in the placement database to answer that "
    "confidently. Try asking about a specific company (e.g., 'What is Infosys "
    "eligibility?') or a role (e.g., 'Which companies hire for Data Analyst?')."
)

CHAT_SYSTEM = STRICT_SYSTEM_GUARDRAILS


def sse(dict_payload: dict) -> str:
    return f"data: {json.dumps(dict_payload)}\n\n"


async def build_chat_context(question: str, top_k: int):
    """Shared retrieval for both the POST and streaming chat paths."""
    ql = question.lower()
    keyword_matches = []

    import re
    num_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|ctc|lacs|lakh|lakhs)?', ql)
    target_num = float(num_match.group(1)) if num_match else None
    is_greater_query = any(k in ql for k in ["more", "above", "greater", "higher", ">", "at least", "min"])
    is_highest_query = any(k in ql for k in ["highest", "max", "top", "best", "maximum"])
    is_criteria_query = any(k in ql for k in ["%", "percent", "cgpa", "backlog", "percentage", "cutoff", "criteria", "eligibility"])

    async for c in db.companies.find({}, {"_id": 0}):
        comp_name = str(c.get("company") or "").lower()
        role_name = str(c.get("role") or "").lower()
        branches_name = str(c.get("branches") or "").lower()
        elig_name = f"{c.get('eligibility') or ''} {c.get('cgpa') or ''}".lower()
        ctc_float = _ctc_value(c)

        if comp_name and comp_name in ql:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_highest_query and ctc_float and ctc_float >= 15.0:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_greater_query and target_num and ctc_float and ctc_float >= target_num:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_criteria_query and target_num and (f"{int(target_num)}%" in elig_name or f"{target_num}" in elig_name):
            if c not in keyword_matches and len(keyword_matches) < 8:
                keyword_matches.append(c)
        elif role_name and any(term in ql for term in role_name.split() if len(term) > 3):
            if c not in keyword_matches and len(keyword_matches) < 6:
                keyword_matches.append(c)

    if is_greater_query or is_highest_query:
        keyword_matches.sort(key=lambda x: _ctc_value(x) or 0, reverse=True)

    q_vec = (await gemini.embed_many([question], task_type="RETRIEVAL_QUERY"))[0]
    hits = []
    async for doc in db.chunks.find({"type": "placement"}, {"text": 1, "source": 1, "embedding": 1, "company_data": 1}):
        emb = doc.get("embedding")
        if not emb or len(emb) != len(q_vec):
            continue
        score = cosine(q_vec, emb)
        hits.append({
            "text": doc["text"],
            "source": doc.get("source", "placement_db"),
            "score": score,
            "company": (doc.get("company_data") or {}).get("company"),
        })
    hits.sort(key=lambda x: x["score"], reverse=True)
    top = hits[: top_k]

    grounded = (len(top) > 0 and top[0]["score"] >= 0.20) or len(keyword_matches) > 0

    context_parts = []
    for i, h in enumerate(top):
        context_parts.append(f"[Doc {i+1} | source={h['source']} | similarity={h['score']:.2f}]\n{h['text']}")
    for km in keyword_matches[:6]:
        context_parts.append(
            f"[Structured Match | Company={km.get('company')}]\n"
            f"Company: {km.get('company')}. Role: {km.get('role')}. CTC: {km.get('ctc')}. "
            f"Branches: {km.get('branches')}. Eligibility: {km.get('eligibility') or km.get('cgpa')}. Notes: {km.get('notes')}."
        )

    matched_comps = keyword_matches[:4]
    if not matched_comps and top:
        for h in top:
            c_name = h.get("company")
            if c_name:
                comp_doc = await db.companies.find_one({"company": c_name}, {"_id": 0})
                if comp_doc and comp_doc not in matched_comps:
                    matched_comps.append(comp_doc)
            if len(matched_comps) >= 3:
                break

    return {
        "context": "\n\n".join(context_parts),
        "sources": [{"source": h["source"], "score": round(h["score"], 3), "company": h["company"]} for h in top[:5]],
        "grounded": grounded,
        "matched_comps": matched_comps,
        "session_id": str(uuid.uuid4()),
    }


def stream_chat_response(ctx: dict, question: str):
    async def gen():
        yield sse({
            "type": "meta",
            "sources": ctx["sources"],
            "matched_companies": ctx["matched_comps"],
            "session_id": ctx["session_id"],
            "grounded": ctx["grounded"],
        })
        if not ctx["grounded"]:
            yield sse({"type": "done"})
            return
        prompt = f"CONTEXT:\n{ctx['context']}\n\nSTUDENT QUESTION:\n{question}\n\nGrounded answer:"
        try:
            async for chunk in gemini.generate_stream(system=CHAT_SYSTEM, prompt=prompt, temperature=0.15, max_tokens=850):
                if "Fallback response: Unable to reach AI models" in chunk:
                    yield sse({"type": "error", "detail": "AI generation temporarily unavailable. Please try again in a moment."})
                    return
                if chunk:
                    yield sse({"type": "delta", "text": chunk})
        except Exception as e:
            print(f"[chat-stream] generation error: {e}")
            yield sse({"type": "error", "detail": "AI generation failed mid-stream. Please retry."})
            return
        yield sse({"type": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["chat"])
    check_prompt_injection(body.question)

    if not check_domain_scope(body.question):
        return ChatResponse(
            answer=NO_ANSWER_TEXT,
            sources=[],
            grounded=False,
            session_id=body.session_id or str(uuid.uuid4()),
            matched_companies=[],
        )

    if not gemini or (not gemini.ready and not os.environ.get("NVIDIA_API_KEY")):
        raise HTTPException(503, "Neither GEMINI_API_KEY nor NVIDIA_API_KEY is configured.")

    ctx = await build_chat_context(body.question, body.top_k)

    visitor_id = _visitor_id(request, client_ip)
    asyncio.create_task(record_usage(
        "chat", client_ip, visitor_id,
        question=body.question,
        grounded=ctx["grounded"],
        n_sources=len(ctx["sources"]),
        matched_companies=[c.get("company") for c in ctx["matched_comps"]],
        session_id=body.session_id,
    ))

    if body.stream:
        return stream_chat_response(ctx, body.question)

    if not ctx["grounded"]:
        return ChatResponse(
            answer=NO_ANSWER_TEXT,
            sources=[],
            grounded=False,
            session_id=ctx["session_id"],
            matched_companies=[],
        )

    prompt = f"CONTEXT:\n{ctx['context']}\n\nSTUDENT QUESTION:\n{body.question}\n\nGrounded answer:"
    answer = await gemini.generate(system=CHAT_SYSTEM, prompt=prompt, temperature=0.15, max_tokens=850)
    if "Fallback response: Unable to reach AI models" in answer:
        raise HTTPException(503, "AI generation temporarily unavailable. Please try again in a moment.")

    return ChatResponse(
        answer=answer,
        sources=ctx["sources"],
        grounded=True,
        session_id=ctx["session_id"],
        matched_companies=ctx["matched_comps"],
    )

    # 1. Structured Keyword & Numeric Matching over db.companies
    ql = body.question.lower()
    keyword_matches = []
    
    import re
    num_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|ctc|lacs|lakh|lakhs)?', ql)
    target_num = float(num_match.group(1)) if num_match else None
    is_greater_query = any(k in ql for k in ["more", "above", "greater", "higher", ">", "at least", "min"])
    is_highest_query = any(k in ql for k in ["highest", "max", "top", "best", "maximum"])
    is_criteria_query = any(k in ql for k in ["%", "percent", "cgpa", "backlog", "percentage", "cutoff", "criteria", "eligibility"])

    async for c in db.companies.find({}, {"_id": 0}):
        comp_name = str(c.get("company") or "").lower()
        role_name = str(c.get("role") or "").lower()
        branches_name = str(c.get("branches") or "").lower()
        elig_name = f"{c.get('eligibility') or ''} {c.get('cgpa') or ''}".lower()
        ctc_float = _ctc_value(c)

        if comp_name and comp_name in ql:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_highest_query and ctc_float and ctc_float >= 15.0:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_greater_query and target_num and ctc_float and ctc_float >= target_num:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_criteria_query and target_num and (f"{int(target_num)}%" in elig_name or f"{target_num}" in elig_name):
            if c not in keyword_matches and len(keyword_matches) < 8:
                keyword_matches.append(c)
        elif role_name and any(term in ql for term in role_name.split() if len(term) > 3):
            if c not in keyword_matches and len(keyword_matches) < 6:
                keyword_matches.append(c)

    if is_greater_query or is_highest_query:
        keyword_matches.sort(key=lambda x: _ctc_value(x) or 0, reverse=True)

    # 2. Vector Embedding Search over db.chunks
    q_vec = (await gemini.embed_many([body.question], task_type="RETRIEVAL_QUERY"))[0]
    hits = []
    async for doc in db.chunks.find({"type": "placement"}, {"text": 1, "source": 1, "embedding": 1, "company_data": 1}):
        emb = doc.get("embedding")
        if not emb or len(emb) != len(q_vec):
            continue
        score = cosine(q_vec, emb)
        hits.append({
            "text": doc["text"],
            "source": doc.get("source", "placement_db"),
            "score": score,
            "company": (doc.get("company_data") or {}).get("company"),
        })
    hits.sort(key=lambda x: x["score"], reverse=True)
    top = hits[: body.top_k]

    # Grounding decision: Grounded if vector score >= 0.20 OR keyword matches found
    grounded = (len(top) > 0 and top[0]["score"] >= 0.20) or len(keyword_matches) > 0

    if not grounded:
        return ChatResponse(
            answer=(
                "I don't have enough information in the placement database to answer that "
                "confidently. Try asking about a specific company (e.g., 'What is Infosys "
                "eligibility?') or a role (e.g., 'Which companies hire for Data Analyst?')."
            ),
            sources=[],
            grounded=False,
            session_id=body.session_id or str(uuid.uuid4()),
            matched_companies=[],
        )

    # Build context from vector hits and keyword matches
    context_parts = []
    for i, h in enumerate(top):
        context_parts.append(f"[Doc {i+1} | source={h['source']} | similarity={h['score']:.2f}]\n{h['text']}")

    for km in keyword_matches[:6]:
        context_parts.append(
            f"[Structured Match | Company={km.get('company')}]\n"
            f"Company: {km.get('company')}. Role: {km.get('role')}. CTC: {km.get('ctc')}. "
            f"Branches: {km.get('branches')}. Eligibility: {km.get('eligibility') or km.get('cgpa')}. Notes: {km.get('notes')}."
        )

    context = "\n\n".join(context_parts)
    system = (
        "You are the Campus AI Placement Assistant for engineering college students in India. "
        "Answer ONLY using the retrieved context below. Do NOT invent companies, salaries, "
        "eligibility criteria, or dates. If the context does not contain the answer, reply "
        "exactly: 'I don't have that information in the placement database.' "
        "When you cite facts, add a small tag like [Doc N] pointing to the source. "
        "Keep answers concise, structured with bullet points, and free of markdown headers."
    )
    prompt = f"CONTEXT:\n{context}\n\nSTUDENT QUESTION:\n{body.question}\n\nGrounded answer:"
    answer = await gemini.generate(system=system, prompt=prompt, temperature=0.15, max_tokens=850)

    # Prepare matched_companies array for rendering UI cards
    matched_comps = keyword_matches[:4]
    if not matched_comps and top:
        for h in top:
            c_name = h.get("company")
            if c_name:
                comp_doc = await db.companies.find_one({"company": c_name}, {"_id": 0})
                if comp_doc and comp_doc not in matched_comps:
                    matched_comps.append(comp_doc)
            if len(matched_comps) >= 3:
                break

    return ChatResponse(
        answer=answer,
        sources=[{"source": h["source"], "score": round(h["score"], 3), "company": h["company"]} for h in top[:5]],
        grounded=True,
        session_id=body.session_id or str(uuid.uuid4()),
        matched_companies=matched_comps,
    )


@app.post("/api/resume/parse")
async def resume_parse(file: UploadFile = File(...), request: Request = None):
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["parse"])
    content = await file.read()
    text = parse_resume(file.filename, content)
    visitor_id = request.headers.get("X-Visitor-Id") if request else client_ip
    asyncio.create_task(record_usage("resume_parse", client_ip, visitor_id, filename=file.filename))
    return {"filename": file.filename, "text": text, "chars": len(text)}


COMMON_TECH_SKILLS = [
    "python", "javascript", "typescript", "react", "react.js", "node.js", "express", "fastapi", "django",
    "flask", "java", "c++", "c", "c#", ".net", "spring", "spring boot", "sql", "postgresql", "mysql",
    "mongodb", "redis", "docker", "kubernetes", "aws", "gcp", "azure", "git", "github", "ci/cd",
    "data structures", "algorithms", "system design", "microservices", "rest api", "graphql", "html", "css",
    "tailwind", "machine learning", "deep learning", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch",
    "tableau", "power bi", "agile", "scrum", "unit testing", "linux", "bash", "object oriented design"
]


@app.post("/api/gap-analysis", response_model=GapAnalysisResponse)
async def gap_analysis(req: GapAnalysisRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["gap"])
    check_prompt_injection(req.resume_text)
    check_prompt_injection(req.job_description)

    r_text = req.resume_text
    j_text = req.job_description

    if not gemini or (not gemini.ready and not os.environ.get("NVIDIA_API_KEY")):
        raise HTTPException(503, "Neither GEMINI_API_KEY nor NVIDIA_API_KEY is configured.")
    if len(r_text) < 15:
        raise HTTPException(400, "Resume text is too short. Please provide at least 15 characters.")
    if len(j_text) < 15:
        raise HTTPException(400, "Job description is too short. Please provide at least 15 characters.")

    system = (
        "You are a strict, grounded resume analysis engine. You will receive a candidate's "
        "resume text and a target job description. Extract skills, tools, and requirements "
        "ONLY as they appear in the two texts. Return STRICT JSON matching this schema:\n"
        "{\n"
        '  "match_score": integer 0-100 (how well the resume aligns with the JD),\n'
        '  "matched_skills": [ short skill strings that appear in BOTH resume and JD ],\n'
        '  "missing_skills": [ skills or requirements found in JD but NOT in resume ],\n'
        '  "improvements": [ 3-5 concrete, actionable suggestions to close the gap ],\n'
        '  "summary": "2-3 sentence honest assessment"\n'
        "}\n"
        "Do NOT wrap the JSON in markdown code fences."
    )
    prompt = (
        f"===== RESUME =====\n{r_text[:8000]}\n\n"
        f"===== JOB DESCRIPTION =====\n{j_text[:6000]}\n\n"
        f"Return ONLY the JSON."
    )
    raw = await gemini.generate(system=system, prompt=prompt, temperature=0.1, max_tokens=900)
    if "Fallback response: Unable to reach AI models" in raw:
        raise HTTPException(503, "AI generation temporarily unavailable. Please try again in a moment.")
    data = _safe_json(raw)

    # Fallback skill keyword extraction if LLM JSON was missing or empty
    r_low = r_text.lower()
    j_low = j_text.lower()
    resume_found = [s for s in COMMON_TECH_SKILLS if s in r_low]
    jd_found = [s for s in COMMON_TECH_SKILLS if s in j_low]
    
    fallback_matched = [s.title() for s in jd_found if s in resume_found]
    fallback_missing = [s.title() for s in jd_found if s not in resume_found]

    matched_skills = list(data.get("matched_skills") or [])
    missing_skills = list(data.get("missing_skills") or [])
    improvements = list(data.get("improvements") or [])
    summary = str(data.get("summary") or "").strip()

    if not matched_skills and fallback_matched:
        matched_skills = fallback_matched
    if not missing_skills and fallback_missing:
        missing_skills = fallback_missing

    r_hay = r_text.lower()
    j_hay = j_text.lower()
    matched_skills = [s for s in matched_skills if s and (str(s).lower() in r_hay or str(s).lower() in j_hay)][:20]
    missing_skills = [s for s in missing_skills if s and str(s).lower() in j_hay][:20]

    calc_score = 0
    if jd_found:
        calc_score = round(len(fallback_matched) / len(jd_found) * 100)
    elif r_text and j_text:
        calc_score = 65

    raw_score = int(data.get("match_score", 0))
    match_score = raw_score if raw_score > 0 else (calc_score if calc_score > 0 else 60)

    if not improvements:
        improvements = [
            f"Add explicit bullet points detailing your hands-on experience with {s}."
            for s in missing_skills[:4]
        ] or [
            "Tailor project descriptions to highlight core technologies required in the JD.",
            "Include quantified achievements and metrics for tech projects.",
            "Ensure technical skills section explicitly names tools mentioned in the target role."
        ]

    if not summary:
        summary = f"Resume matches {match_score}% of the target job description requirements. Core strengths include {', '.join(matched_skills[:3]) if matched_skills else 'foundational concepts'}, with key gap areas in {', '.join(missing_skills[:3]) if missing_skills else 'additional specialized tooling'}."

    return GapAnalysisResponse(
        match_score=min(100, max(10, match_score)),
        matched_skills=matched_skills[:20],
        missing_skills=missing_skills[:20],
        improvements=improvements[:6],
        summary=summary,
    )
@app.post("/api/interview-prep", response_model=InterviewPrepResponse)
async def interview_prep(body: InterviewPrepRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["interview"])
    check_prompt_injection(body.job_description)
    if body.missing_skills:
        for s in body.missing_skills:
            check_prompt_injection(s)

    if not gemini or not gemini.ready:
        raise HTTPException(503, "GEMINI_API_KEY is not configured.")
    system = (
        "You are an interview preparation coach. Generate targeted interview questions for the "
        "given job description. Focus especially on the candidate's missing skills so they can "
        "prepare. Never invent generic filler. Return STRICT JSON:\n"
        "{\n"
        '  "technical": [ { "question": "...", "why_asked": "...", "hint": "one-line study hint" } ],\n'
        '  "behavioral": [ { "question": "...", "why_asked": "...", "hint": "..." } ]\n'
        "}\n"
        "Include roughly 70% technical, 30% behavioral. Do NOT wrap in markdown."
    )
    missing = ", ".join(body.missing_skills or []) or "(none provided; base on JD only)"
    total_q = body.num_questions
    n_tech = max(1, round(total_q * 0.7))
    n_beh = max(0, total_q - n_tech)
    prompt = (
        f"Job description:\n{body.job_description[:5000]}\n\n"
        f"Candidate's known skill gaps: {missing}\n\n"
        f"Generate exactly {n_tech} technical and {n_beh} behavioral questions."
    )
    raw = await gemini.generate(system=system, prompt=prompt, temperature=0.3, max_tokens=1400)
    if "Fallback response: Unable to reach AI models" in raw:
        raise HTTPException(503, "AI generation temporarily unavailable. Please try again in a moment.")
    data = _safe_json(raw)
    return InterviewPrepResponse(
        technical=list(data.get("technical", []))[:n_tech],
        behavioral=list(data.get("behavioral", []))[:n_beh],
    )


# ---------- eligibility checker ----------
@app.post("/api/eligibility")
async def check_eligibility(req: EligibilityRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["eligibility"])
    cursor = db.companies.find({}, {"_id": 0})
    all_companies = await cursor.to_list(length=1000)

    # Filter batch if specified
    if req.batch:
        all_companies = [c for c in all_companies if batch_of(c) == req.batch]

    eligible_list = []
    ineligible_list = []
    marginal_list = []
    eligible_ctcs = []

    for c in all_companies:
        reasons = []
        is_eligible = True

        elig_str = f"{c.get('eligibility') or ''} {c.get('cgpa') or ''} {c.get('notes') or ''}".lower()
        user_canon = canonical_for_tags([req.branch])

        # 1. Branch evaluation
        branches_canon = str(c.get("branches_canonical") or normalize_branches(c.get("branches") or "") or "")
        if branches_canon:
            if not matches_allowed(branches_canon, user_canon):
                is_eligible = False
                reasons.append(f"Branch mismatch (Eligible: {c.get('branches') or 'Varies'})")

        # 2. CGPA requirement check
        cgpa_req = _extract_cgpa(elig_str)
        if cgpa_req is not None and cgpa_req <= 10.0:
            if req.cgpa < cgpa_req:
                is_eligible = False
                reasons.append(f"CGPA below required cutoff ({req.cgpa} < {cgpa_req})")

        # 3. Academic percentage check (10th/12th)
        pct_req = _extract_pct(elig_str)
        if pct_req is not None:
            if req.tenth_pct < pct_req or req.twelfth_pct < pct_req:
                is_eligible = False
                reasons.append(f"Academic percentage below required ({min(req.tenth_pct, req.twelfth_pct)}% < {pct_req}%)")

        # 4. Backlog policy check
        if req.has_backlog:
            if any(term in elig_str for term in ["no live kt", "no active backlog", "no live backlog", "no dead or live kt", "no backlog"]):
                is_eligible = False
                reasons.append("Company rejects candidates with active backlogs / KTs")

        # Marginal band: ineligible only by a small/single criterion
        is_marginal = False
        if not is_eligible and len(reasons) == 1:
            only = reasons[0]
            if "CGPA below required cutoff" in only and cgpa_req is not None and (cgpa_req - req.cgpa) <= 0.5:
                is_marginal = True
            elif "Academic percentage below required" in only and pct_req is not None and (pct_req - min(req.tenth_pct, req.twelfth_pct)) <= 5.0:
                is_marginal = True
            elif "backlogs / KTs" in only:
                is_marginal = True

        # Parse numeric CTC for stats
        ctc_val = _ctc_value(c)

        company_res = {
            **c,
            "is_eligible": is_eligible,
            "is_marginal": is_marginal,
            "reasons": reasons if not is_eligible else ["All criteria satisfied"],
        }

        if is_eligible:
            eligible_list.append(company_res)
            if ctc_val:
                eligible_ctcs.append(ctc_val)
        elif is_marginal:
            marginal_list.append(company_res)
        else:
            ineligible_list.append(company_res)

    visitor_id = _visitor_id(request, client_ip)
    asyncio.create_task(record_usage(
        "eligibility", client_ip, visitor_id,
        branch=req.branch,
        cgpa=req.cgpa,
        eligible_count=len(eligible_list),
        marginal_count=len(marginal_list),
    ))

    return {
        "summary": {
            "total_evaluated": len(all_companies),
            "eligible_count": len(eligible_list),
            "ineligible_count": len(ineligible_list),
            "marginal_count": len(marginal_list),
            "marginal_percentage": round((len(marginal_list) / len(all_companies) * 100), 1) if all_companies else 0,
            "eligible_percentage": round((len(eligible_list) / len(all_companies) * 100), 1) if all_companies else 0,
            "max_eligible_ctc": round(max(eligible_ctcs), 2) if eligible_ctcs else 0,
            "avg_eligible_ctc": round(sum(eligible_ctcs) / len(eligible_ctcs), 2) if eligible_ctcs else 0,
        },
        "eligible": eligible_list,
        "ineligible": ineligible_list,
        "marginal": marginal_list,
    }


# ---------- company comparison ----------
@app.post("/api/companies/compare")
async def compare_companies(body: CompareRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["compare"])
    if not body.company_ids:
        raise HTTPException(400, "Please provide at least one company ID to compare.")
    cursor = db.companies.find({"id": {"$in": body.company_ids}}, {"_id": 0})
    selected = await cursor.to_list(length=10)

    if not selected:
        # Fallback search by company name if IDs are missing
        cursor = db.companies.find({"company": {"$in": body.company_ids}}, {"_id": 0})
        selected = await cursor.to_list(length=10)

    if not selected:
        raise HTTPException(404, "None of the specified companies were found.")

    comparison_ai = ""
    if gemini and gemini.ready and len(selected) > 1:
        comp_summary = "\n".join(
            f"- {c.get('company')}: CTC={c.get('ctc')}, Role={c.get('role')}, Branches={c.get('branches')}, Eligibility={c.get('eligibility')}, Process={c.get('notes')}"
            for c in selected
        )
        system = (
            "You are a career counselor comparing college placement drives. "
            "Compare the following companies side-by-side in bullet points. Highlight salary differences, "
            "eligibility strictness, role complexity, and selection process difficulty."
        )
        prompt = f"Companies to compare:\n{comp_summary}\n\nProvide a concise 3-bullet comparative summary."
        try:
            comparison_ai = await gemini.generate(system=system, prompt=prompt, temperature=0.2, max_tokens=600)
            if "Fallback response: Unable to reach AI models" in comparison_ai:
                comparison_ai = "AI comparative insights are unavailable right now. The structured comparison below is complete."
        except Exception as e:
            comparison_ai = f"AI comparison unavailable: {e}"

    client_ip = request.client.host if request.client else "127.0.0.1"
    visitor_id = _visitor_id(request, client_ip)
    asyncio.create_task(record_usage("compare", client_ip, visitor_id, company_ids=body.company_ids))

    return {
        "companies": selected,
        "ai_comparison": comparison_ai,
    }


# ---------- helper functions ----------
def _extract_cgpa(text: str) -> Optional[float]:
    import re
    m = re.search(r'(?:cgpa|cgpi)\s*(?:of|[-:\u2010-\u2015])?\s*([2-9]\.\d{1,2})', text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def _extract_pct(text: str) -> Optional[float]:
    import re
    m = re.search(r'(\d{2})%\s*(?:throughout|aggregate|and above|\+)', text)
    if m:
        try:
            val = float(m.group(1))
            if 50.0 <= val <= 95.0:
                return val
        except ValueError:
            pass
    return None


def _ctc_value(doc: dict) -> Optional[float]:
    """Prefer the verified numeric ctc_lpa field; fall back to regex extraction."""
    v = doc.get("ctc_lpa")
    if isinstance(v, (int, float)) and v and 0 < v <= 60:
        return float(v)
    return _extract_ctc_float(doc.get("ctc"))


def _extract_ctc_float(val: Optional[str]) -> Optional[float]:
    if not val:
        return None
    import re
    nums = [float(m) for m in re.findall(r'\d+(?:\.\d+)?', str(val))]
    if not nums:
        return None
    small = [n for n in nums if n <= 5000]
    return max(small) if small else None


def _safe_json(raw: str) -> dict:
    """Strip code fences and parse JSON; return {} on failure."""
    if not raw:
        return {}
    txt = raw.strip()
    # Strip markdown code fences
    import re
    txt = re.sub(r'^```(?:json)?\s*', '', txt, flags=re.IGNORECASE)
    txt = re.sub(r'\s*```$', '', txt)
    
    # Try direct parse
    try:
        return json.loads(txt)
    except Exception:
        pass

    # Extract outermost JSON object { ... }
    m = re.search(r'(\{.*\})', txt, re.DOTALL)
    if m:
        candidate = m.group(1)
        # Clean trailing commas before } or ]
        candidate_clean = re.sub(r',\s*([\}\]])', r'\1', candidate)
        try:
            return json.loads(candidate_clean)
        except Exception:
            pass

    return {}

